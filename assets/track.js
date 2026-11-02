/*
 * 站点统一埋点（2026-11-02 v2，标准见 docs/站点转化跟踪统一标准.md）：零依赖、单文件，所有 B2B 静态站共用同一份。
 * ⛔ 不按站改、不另存改名；站点不许再有第二个埋点脚本（gtag.js / GTM / 自写 fetch 包装）。
 *
 * 引用（ERP 推送站点前自动注入 / 更新，属性值都从 ERP 读，建站 agent 不手写）：
 *   <script defer src="/assets/track.js" data-website-id="<umami 站点 id>" data-site-key="<ERP site_key>"
 *           data-gads="AW-xxx" data-gads-labels='{"form":"AW-xxx/a","whatsapp":"AW-xxx/b",...}' data-ga4="G-xxx"></script>
 *
 * 做的事：
 *   1. 访客 id：Cookie kk_attr.visitor_id（注册域，www 和裸域共用，90 天）；Umami distinct id、表单 kk_vid、ERP 事件同一个值
 *   2. 页面浏览 → Umami（stats.kkbaba.com）
 *   3. 转化动作（WhatsApp / 邮箱 / 电话点击）→ Umami + ERP /ads/api/event/public/<site_key>/ + Google Ads / GA4
 *      WhatsApp 链接点击时在预填文本末尾加 (ref RF-xxxxxxxx)，WhatsApp agent 靠它对回这次点击
 *   4. 广告落地（URL 带 gclid / gbraid / wbraid）→ ERP ad_landing，点击 id + UTM + 落地页记进 kk_attr
 *   5. 表单：提交时塞隐藏字段（kk_* + 归因字段）；JSON 提交到 form.lianf.com 时顶层补归因字段；
 *      ERP 收到表单自动补 form 转化事件，这里只在提交成功后报 Google Ads 表单转化
 *
 * ⛔ 任何异常都吞掉，统计挂了页面照常；本地预览 / *.pages.dev / 爬虫不上报。
 */
(function () {
  try {
    var s = document.currentScript;
    if (!s) return;
    function attr(n) { return (s.getAttribute(n) || '').trim(); }
    var W = attr('data-website-id');
    var SK = attr('data-site-key');
    var H = (attr('data-host') || 'https://stats.kkbaba.com').replace(/\/$/, '');
    var EP = SK ? (attr('data-api') || 'https://tools.kikimami.com').replace(/\/$/, '') + '/ads/api/event/public/' + SK + '/' : '';
    var GADS = attr('data-gads'), GA4 = attr('data-ga4'), LABELS = {};
    try { LABELS = JSON.parse(attr('data-gads-labels') || '{}') || {}; } catch (e) {}
    if (!W && !SK) return;
    var host = location.hostname;
    if (!host || host === 'localhost' || /^(127\.|192\.168\.|10\.)/.test(host) || /\.pages\.dev$/.test(host)) return;
    if (/bot|crawl|spider|slurp|headless|lighthouse|pingdom|gtmetrix/i.test(navigator.userAgent)) return;

    var ls = null;
    try { ls = window.localStorage; } catch (e) {}
    function get(k) { try { return ls ? ls.getItem(k) : null; } catch (e) { return null; } }
    function set(k, v) { try { if (ls) ls.setItem(k, v); } catch (e) {} }
    function q(n) { try { return new URLSearchParams(location.search).get(n) || ''; } catch (e) { return ''; } }
    function rid(n) { var c = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', o = ''; for (var i = 0; i < n; i++) o += c[Math.floor(Math.random() * c.length)]; return o; }
    function now() { return new Date().toISOString(); }

    // ── kk_attr Cookie：访客 id + 归因（写在注册域上） ──
    var COOKIE = 'kk_attr', DAYS = 90;
    function getC() { try { var m = document.cookie.match(/(?:^|; )kk_attr=([^;]*)/); return m ? JSON.parse(decodeURIComponent(m[1])) : null; } catch (e) { return null; } }
    function setC(o) {
      try {
        var d = new Date(); d.setTime(d.getTime() + DAYS * 864e5);
        var dm = /^[\d.]+$/.test(host) ? '' : '.' + host.replace(/^www\./, '');
        if (dm) document.cookie = COOKIE + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/'; // 清掉 host-only 旧副本
        document.cookie = COOKIE + '=' + encodeURIComponent(JSON.stringify(o)) + ';expires=' + d.toUTCString() +
          ';path=/;SameSite=Lax' + (location.protocol === 'https:' ? ';Secure' : '') + (dm ? ';domain=' + dm : '');
      } catch (e) {}
    }
    function utmNow() { return { source: q('utm_source'), medium: q('utm_medium'), campaign: q('utm_campaign'), term: q('utm_term'), content: q('utm_content') }; }
    var A = getC() || {};
    // 老访客沿用 v1 存在 localStorage 的 id，Umami 里的访客不断档
    if (!A.visitor_id) A.visitor_id = get('_kk_vid') || ('v_' + rid(12));
    var VID = A.visitor_id;
    set('_kk_vid', VID);
    var gc = q('gclid'), gb = q('gbraid'), wb = q('wbraid');
    if (gc || gb || wb) {
      A.gclid = gc; A.gbraid = gb; A.wbraid = wb; A.landing_url = location.href; A.landed_at = now(); A.utm = utmNow();
    } else if (!A.landing_url) {
      A.landing_url = location.href; A.landed_at = now(); A.utm = utmNow();
    }
    setC(A);
    function at() {
      var c = getC() || A, u = c.utm || {};
      return { visitor_id: c.visitor_id || VID, gclid: c.gclid || '', gbraid: c.gbraid || '', wbraid: c.wbraid || '',
        utm_source: u.source || '', utm_medium: u.medium || '', utm_campaign: u.campaign || '', utm_term: u.term || '',
        utm_content: u.content || '', landing_url: c.landing_url || '', ref_code: c.last_ref || '' };
    }
    // 首次触达（v1 字段，表单 kk_landing / kk_referrer / kk_query 用）
    var first = null;
    try { first = JSON.parse(get('_kk_first') || 'null'); } catch (e) {}
    if (!first) {
      first = { lp: location.pathname, ref: document.referrer || '', q: location.search || '', t: Date.now() };
      set('_kk_first', JSON.stringify(first));
    }

    // ── Google Ads / GA4：网站配置了才加载 ──
    var gtagOn = false;
    if (GADS || GA4) {
      try {
        var g = document.createElement('script'); g.async = true;
        g.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GADS || GA4);
        document.head.appendChild(g);
        window.dataLayer = window.dataLayer || [];
        if (!window.gtag) window.gtag = function () { window.dataLayer.push(arguments); };
        window.gtag('js', new Date());
        if (GADS) window.gtag('config', GADS);
        if (GA4) window.gtag('config', GA4);
        gtagOn = true;
      } catch (e) {}
    }
    function gconv(type, extra) {
      if (!gtagOn) return;
      try {
        var l = LABELS[type] || LABELS[type.replace(/_click$/, '')];
        if (l) window.gtag('event', 'conversion', { send_to: l });
        if (GA4) { var p = { event_category: 'lead' }; if (extra && extra.ref_code) p.ref_code = extra.ref_code; window.gtag('event', type, p); }
      } catch (e) {}
    }

    // ── Umami ──
    var cache = null;
    function send(name, data) {
      if (!W) return;
      try {
        var p = {
          website: W, hostname: host, screen: screen.width + 'x' + screen.height,
          language: navigator.language, title: document.title,
          url: location.pathname + location.search, referrer: document.referrer || '', id: VID
        };
        if (name) { p.name = name; p.data = data || {}; }
        var h = { 'Content-Type': 'application/json', 'x-umami-website-id': W, 'x-umami-hostname': host };
        if (cache) h['x-umami-cache'] = cache;
        fetch(H + '/api/send', {
          method: 'POST', body: JSON.stringify({ type: 'event', payload: p }),
          headers: h, keepalive: true, credentials: 'omit'
        }).then(function (r) { return r.json(); }).then(function (j) { if (j && j.cache) cache = j.cache; }).catch(function () {});
      } catch (e) {}
    }

    // ── ERP 转化事件 ──
    function post(type, extra) {
      if (!EP) return;
      try {
        var b = at(); extra = extra || {};
        b.event_type = type; b.occurred_at = now(); b.page_url = location.href; b.referrer = document.referrer || '';
        b.utm = { source: b.utm_source, medium: b.utm_medium, campaign: b.utm_campaign, term: b.utm_term, content: b.utm_content };
        b.ref_code = extra.ref_code || '';
        b.meta = extra.meta || {};
        var body = JSON.stringify(b);
        if (navigator.sendBeacon) navigator.sendBeacon(EP, new Blob([body], { type: 'text/plain' }));
        else fetch(EP, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true, credentials: 'omit' }).catch(function () {});
      } catch (e) {}
    }
    var ERP_TYPES = { whatsapp_click: 1, email_click: 1, phone_click: 1 };
    function conv(name, extra) {
      extra = extra || {};
      var d = { vid: VID, page: location.pathname, landing: first.lp, referrer: first.ref, query: first.q };
      var m = extra.meta || {};
      for (var k in m) d[k] = m[k];
      if (extra.ref_code) d.ref = extra.ref_code;
      send(name, d);
      if (ERP_TYPES[name]) { post(name, extra); gconv(name, extra); }
    }
    window.kkAttr = at;

    send(); // 页面浏览
    if (gc || gb || wb) post('ad_landing'); // 广告落地：只做分母和归因锚点，ERP 按访客+点击 id 去重

    // ── 点击：事件委托，插件后加载 / 动态生成的按钮也能抓到 ──
    document.addEventListener('click', function (e) {
      try {
        var a = e.target && e.target.closest ? e.target.closest('a,button') : null;
        if (!a) return;
        var href = (a.getAttribute('href') || '').trim();
        var cls = (a.className && a.className.baseVal !== undefined ? a.className.baseVal : (a.className || '')) + ' ' + (a.id || '');
        var meta = { href: href.slice(0, 200), text: (a.textContent || '').trim().slice(0, 80) };
        if (/wa\.me|api\.whatsapp\.com|whatsapp:\/\//i.test(href) || /whatsapp|wa-contact/i.test(cls)) {
          var ref = '';
          if (/wa\.me|api\.whatsapp\.com|whatsapp:\/\//i.test(href)) {
            ref = 'RF-' + rid(8);
            var c = getC() || A; c.last_ref = ref; setC(c);
            try {
              var u = new URL(href, location.href);
              var t = (u.searchParams.get('text') || '').replace(/\s*\(ref RF-[A-Z0-9]+\)\s*$/, '');
              u.searchParams.set('text', (t ? t + ' ' : '') + '(ref ' + ref + ')');
              a.setAttribute('href', u.toString());
            } catch (err) {}
          }
          conv('whatsapp_click', { ref_code: ref, meta: meta });
        } else if (/^mailto:/i.test(href)) conv('email_click', { meta: meta });
        else if (/^tel:/i.test(href)) conv('phone_click', { meta: meta });
        else if (/\.pdf(\?|#|$)/i.test(href)) conv('catalog_download', { meta: meta });
      } catch (err) {}
    }, true);

    // ── 表单 ──
    var FORM_RE = /form\.lianf\.com|\/static_web\/api\/form\/submit/i;
    function formOk(email) {
      gconv('form');
      try { if (gtagOn && email) window.gtag('set', 'user_data', { email: String(email).trim().toLowerCase() }); } catch (e) {}
    }
    // 捕获阶段先塞隐藏字段，表单插件再收集字段时就带上了
    document.addEventListener('submit', function (e) {
      try {
        var f = e.target;
        if (!f || f.tagName !== 'FORM') return;
        var hidden = at();
        hidden.kk_vid = VID; hidden.kk_landing = first.lp; hidden.kk_referrer = first.ref; hidden.kk_query = first.q; hidden.kk_page = location.pathname;
        for (var k in hidden) {
          if (!hidden[k] || f.querySelector('input[name="' + k + '"]')) continue;
          var i = document.createElement('input');
          i.type = 'hidden'; i.name = k; i.value = hidden[k];
          f.appendChild(i);
        }
        send('form_submit', { vid: VID, page: location.pathname, landing: first.lp, referrer: first.ref, query: first.q,
          form: f.id || f.getAttribute('name') || f.getAttribute('action') || '' });
      } catch (err) {}
    }, true);
    // 冒泡阶段：没被脚本拦下、直接原生提交到 form.lianf.com 的表单，页面要跳走了，这里报 Google 表单转化
    document.addEventListener('submit', function (e) {
      try {
        var f = e.target;
        if (!f || f.tagName !== 'FORM' || e.defaultPrevented || !FORM_RE.test(f.getAttribute('action') || '')) return;
        var em = f.querySelector('input[type="email"],input[name="email"]');
        formOk(em && em.value);
      } catch (err) {}
    }, false);
    // JSON 提交（fetch 到 form.lianf.com）：顶层补归因字段（站点只挑几个字段拼 JSON 也带得上）；成功后报 Google 表单转化
    var _f = window.fetch;
    if (_f) {
      window.fetch = function (u, o) {
        try {
          var url = typeof u === 'string' ? u : (u && u.url) || '';
          if (FORM_RE.test(url) && o && typeof o.body === 'string') {
            var j = JSON.parse(o.body), c = at();
            for (var k in c) if (c[k] && !j[k]) j[k] = c[k];
            o = Object.assign({}, o, { body: JSON.stringify(j) });
            var em = j.email || (j.form_data && j.form_data.email);
            return _f.call(this, u, o).then(function (r) {
              try { r.clone().json().then(function (res) { if (res && res.success) formOk(em); }).catch(function () {}); } catch (err) {}
              return r;
            });
          }
        } catch (err) {}
        return _f.apply(this, arguments);
      };
    }
  } catch (e) {}
})();
