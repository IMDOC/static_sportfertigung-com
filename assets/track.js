/*
 * 站点统计埋点（阮总 2026-10-15）：零依赖、单文件，所有 B2B 静态站共用。
 *
 * 引用方式（刷站脚本 inject_tracking.py 自动插到每个页面 </body> 前）：
 *   <script defer src="/assets/track.js" data-website-id="<umami 站点 id>"></script>
 *
 * 做三件事：
 *   1. 页面浏览上报到 Umami（stats.kkbaba.com），访客 id 存 localStorage，当 Umami 的 distinct id
 *   2. 转化动作自动识别，不靠别的插件配合：WhatsApp / 邮箱 / 电话 链接点击、PDF 下载、任何表单提交
 *   3. 表单提交时塞三个隐藏字段（kk_vid / kk_landing / kk_referrer），跟着表单进 ERP，线索能对回访客路径
 *
 * ⛔ 任何异常都吞掉，统计挂了页面照常；本地预览 / 爬虫不上报。
 */
(function () {
  try {
    var s = document.currentScript;
    if (!s) return;
    var W = s.getAttribute('data-website-id');
    var H = (s.getAttribute('data-host') || 'https://stats.kkbaba.com').replace(/\/$/, '');
    if (!W) return;
    var host = location.hostname;
    if (!host || host === 'localhost' || /^(127\.|192\.168\.|10\.)/.test(host) || /\.pages\.dev$/.test(host)) return;
    if (/bot|crawl|spider|slurp|headless|lighthouse|pingdom|gtmetrix/i.test(navigator.userAgent)) return;

    var ls = null;
    try { ls = window.localStorage; } catch (e) {}
    function get(k) { try { return ls ? ls.getItem(k) : null; } catch (e) { return null; } }
    function set(k, v) { try { if (ls) ls.setItem(k, v); } catch (e) {} }

    // 访客 id：第一次来生成，之后一直复用（同一浏览器）
    var VID = get('_kk_vid');
    if (!VID) {
      VID = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      set('_kk_vid', VID);
    }
    // 首次触达：落地页 / 来源 / UTM，只记第一次
    var first = null;
    try { first = JSON.parse(get('_kk_first') || 'null'); } catch (e) {}
    if (!first) {
      first = { lp: location.pathname, ref: document.referrer || '', q: location.search || '', t: Date.now() };
      set('_kk_first', JSON.stringify(first));
    }

    var cache = null;
    function send(name, data) {
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
    function conv(name, extra) {
      var d = { vid: VID, page: location.pathname, landing: first.lp, referrer: first.ref, query: first.q };
      for (var k in extra) d[k] = extra[k];
      send(name, d);
    }

    send(); // 页面浏览

    // 转化：事件委托抓整个页面的点击，插件后加载 / 动态生成的按钮也能抓到
    document.addEventListener('click', function (e) {
      try {
        var a = e.target && e.target.closest ? e.target.closest('a,button') : null;
        if (!a) return;
        var href = (a.getAttribute('href') || '').trim();
        var cls = (a.className || '') + ' ' + (a.id || '');
        var name = null;
        if (/wa\.me|api\.whatsapp\.com|whatsapp:\/\//i.test(href) || /whatsapp|wa-contact/i.test(cls)) name = 'whatsapp_click';
        else if (/^mailto:/i.test(href)) name = 'email_click';
        else if (/^tel:/i.test(href)) name = 'phone_click';
        else if (/\.pdf(\?|#|$)/i.test(href)) name = 'catalog_download';
        if (name) conv(name, { href: href.slice(0, 200), text: (a.textContent || '').trim().slice(0, 80) });
      } catch (err) {}
    }, true);

    // 转化：任何表单提交。捕获阶段先塞隐藏字段，表单插件再收集字段时就带上了
    document.addEventListener('submit', function (e) {
      try {
        var f = e.target;
        if (!f || f.tagName !== 'FORM') return;
        var hidden = { kk_vid: VID, kk_landing: first.lp, kk_referrer: first.ref, kk_query: first.q, kk_page: location.pathname };
        for (var k in hidden) {
          if (!f.querySelector('input[name="' + k + '"]')) {
            var i = document.createElement('input');
            i.type = 'hidden'; i.name = k; i.value = hidden[k];
            f.appendChild(i);
          }
        }
        conv('form_submit', { form: f.id || f.getAttribute('name') || f.getAttribute('action') || '' });
      } catch (err) {}
    }, true);
  } catch (e) {}
})();
