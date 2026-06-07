/*!
 * form-widget.js — reusable inquiry-form section.
 *
 * Usage (per page):
 *   <div id="inquiry-form-container" data-theme="dark"></div>
 *   <script src="/assets/form-widget.js" defer></script>
 *
 * Container attributes (all optional):
 *   data-theme="dark|light"   force colour scheme (default: auto-detect ancestor bg, fallback light)
 *   data-lang="en|es|..."     force language (default: <html lang> -> 'en')
 *   data-heading="..."        override the heading copy (page-level tweak, no component edit)
 *   data-sub="..."            override the intro line
 *   data-page="..."           override the auto-derived page slug (rarely needed)
 *
 * Source params are injected automatically — never hardcode them per page:
 *   domain   = location.hostname
 *   page     = last path segment minus .html (root -> "index"); or data-page override
 *   page_url = location.href
 * Plus anti-spam: honeypot input name="website" + submission_time on submit.
 *
 * Global override (optional): window.FormWidgetConfig = { action, brandColor, brandColorDark, ... }
 */
(function () {
  'use strict';

  var defaultConfig = {
    action: 'https://form.lianf.com/',
    brandColor: '#DC2626',
    brandColorDark: '#991B1B',
    accentColor: '#FFD166',
    containerSelector: '#inquiry-form-container'
  };

  var config = Object.assign({}, defaultConfig, window.FormWidgetConfig || {});

  /* ----------------------------------------------------------------------
   * i18n — every visible string lives here. en is complete; other locales
   * are stubbed (empty -> falls back to en per-key). Translate later by
   * filling the keys only; no component logic changes needed.
   * -------------------------------------------------------------------- */
  var I18N = {
    en: {
      heading: 'Start your project with a real factory',
      sub: "Send your tech-pack and we'll come back within two business days with a per-size MOQ split, sampling timeline, and an FOB quote.",
      nameLabel: 'Full Name',
      namePlaceholder: 'Your full name',
      emailLabel: 'Email',
      emailPlaceholder: 'you@company.com',
      phoneLabel: 'Phone / WhatsApp',
      phonePlaceholder: '+1 555 000 0000',
      msgLabel: 'Message',
      msgPlaceholder: 'Describe your project — product, quantities, timeline, tech-pack status.',
      button: 'Send Your Inquiry',
      sideKicker: 'RFQ handoff',
      sideHeading: 'What our team checks before replying',
      sideText: 'The first reply should help you decide whether this factory is worth a deeper sourcing call.',
      checks: [
        'Product type, size curve, and realistic MOQ split',
        'Fabric direction, sample route, and pattern status',
        'Lead-time window, FOB assumptions, and QC records available'
      ],
      miniNum1: '2 days', miniLbl1: 'first reply',
      miniNum2: 'NDA', miniLbl2: 'on request',
      trust: 'Replies within 2 business days · NDA on request · Sample fee waived after first PO'
    },
    es: {}, fr: {
      heading: 'Lancez votre projet avec une vraie usine',
      sub: 'Envoyez votre fiche technique et nous revenons sous deux jours ouvrés avec un découpage du MOQ par taille, un calendrier d\'échantillonnage et un devis FOB.',
      nameLabel: 'Nom complet', namePlaceholder: 'Votre nom complet',
      emailLabel: 'E-mail', emailPlaceholder: 'vous@entreprise.com',
      phoneLabel: 'Téléphone / WhatsApp', phonePlaceholder: '+33 6 00 00 00 00',
      msgLabel: 'Message', msgPlaceholder: 'Décrivez votre projet — produit, quantités, délais, statut de la fiche technique.',
      button: 'Envoyer ma demande',
      sideKicker: 'Transmission du RFQ', sideHeading: 'Ce que notre équipe vérifie avant de répondre',
      sideText: 'La première réponse doit vous aider à décider si cette usine mérite un appel d\'approvisionnement plus approfondi.',
      checks: [
        'Type de produit, courbe de tailles et découpage MOQ réaliste',
        'Orientation tissu, voie d\'échantillonnage et statut du patron',
        'Fenêtre de délai, hypothèses FOB et registres QC disponibles'
      ],
      miniNum1: '2 jours', miniLbl1: 'première réponse',
      miniNum2: 'NDA', miniLbl2: 'sur demande',
      trust: 'Réponse sous 2 jours ouvrés · NDA sur demande · Frais d\'échantillon offerts après la première commande'
    }, de: {}, pt: {}, it: {}, ja: {}, ar: {}
  };

  var RTL_LANGS = { ar: 1, he: 1, fa: 1, ur: 1 };

  /* ---------------------------------------------------------------------- */

  function escapeHtml(text) {
    var d = document.createElement('div');
    d.textContent = text == null ? '' : String(text);
    return d.innerHTML;
  }

  function escapeAttr(text) {
    return escapeHtml(text).replace(/"/g, '&quot;');
  }

  function normalizeLang(raw) {
    if (!raw) return 'en';
    return String(raw).trim().toLowerCase().split('-')[0] || 'en';
  }

  function getStrings(lang) {
    var base = I18N.en;
    var loc = I18N[lang] || {};
    var out = {};
    var k;
    for (k in base) { if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = base[k]; }
    for (k in loc) { if (Object.prototype.hasOwnProperty.call(loc, k) && loc[k] != null && loc[k] !== '') out[k] = loc[k]; }
    return out;
  }

  // page slug: last path segment, .html stripped, root -> "index"
  function derivePage() {
    var path = location.pathname.replace(/\/+$/, '');
    var seg = path.split('/').pop() || 'index';
    seg = seg.replace(/\.html?$/i, '');
    return seg || 'index';
  }

  // Parse "rgb(a)" -> perceived luminance 0..255; null if not parseable
  function bgLuminance(colorStr) {
    if (!colorStr) return null;
    var m = colorStr.match(/rgba?\(([^)]+)\)/i);
    if (!m) return null;
    var parts = m[1].split(',').map(function (x) { return parseFloat(x); });
    if (parts.length < 3) return null;
    var a = parts.length >= 4 ? parts[3] : 1;
    if (a === 0) return null; // fully transparent — keep walking up
    return 0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2];
  }

  // Auto-detect theme by walking ancestors for the first opaque bg
  function detectTheme(el) {
    var node = el;
    while (node && node !== document.documentElement) {
      var bg = window.getComputedStyle(node).backgroundColor;
      var lum = bgLuminance(bg);
      if (lum != null) return lum < 128 ? 'dark' : 'light';
      node = node.parentElement;
    }
    return 'light';
  }

  function injectStyles() {
    if (document.getElementById('fw-styles')) return;
    var s = document.createElement('style');
    s.id = 'fw-styles';
    s.textContent = [
      /* layout (theme-agnostic) */
      '.fw-section{padding:clamp(72px,9vh,112px) 0;text-align:center}',
      '.fw-ctr{max-width:1320px;margin-inline:auto;padding-left:clamp(16px,3vw,32px);padding-right:clamp(16px,3vw,32px)}',
      '.fw-h{font-size:clamp(1.75rem,3vw,2.75rem);font-weight:800;margin:0 0 14px;line-height:1.15}',
      '.fw-s{font-size:clamp(.9375rem,1.2vw,1.125rem);line-height:1.55;max-width:62ch;margin:0 auto 28px}',
      '.fw-tr{font-size:.8125rem;letter-spacing:.02em;margin:4px 0 0}',
      '.fw-card{max-width:1080px;margin:28px auto 24px;border-radius:14px;padding:clamp(20px,3vw,32px);display:grid;grid-template-columns:minmax(0,1.18fr) minmax(300px,.82fr);gap:clamp(20px,3vw,34px);align-items:stretch;text-align:left}',
      '.fw-card form{min-width:0}',
      '.fw-fields{display:grid;grid-template-columns:1fr 1fr;gap:14px}',
      '.fw-field{display:flex;flex-direction:column;text-align:left}',
      '.fw-field--full{grid-column:1/-1}',
      '.fw-label{font-size:.8125rem;font-weight:600;margin-bottom:4px}',
      '.fw-input{border-radius:8px;padding:10px 14px;font-family:inherit;font-size:.9375rem;transition:border-color .2s ease,background-color .2s ease,box-shadow .2s ease}',
      '.fw-input:focus{outline:none}',
      '.fw-card textarea.fw-input{resize:vertical;min-height:72px}',
      '.fw-req{color:' + config.brandColor + '}',
      '.fw-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;width:100%;margin-top:16px;padding:13px 22px;border:0;border-radius:8px;background:' + config.brandColor + ';color:#fff;font-family:inherit;font-size:.95rem;font-weight:700;cursor:pointer;transition:background-color .2s ease,transform .2s ease}',
      '.fw-btn:hover{background:' + config.brandColorDark + ';transform:translateY(-1px)}',
      '.fw-hp{display:none !important}',
      '.fw-side{position:relative;overflow:hidden;border-radius:12px;padding:clamp(20px,2.4vw,28px);display:flex;flex-direction:column;gap:18px}',
      '.fw-side::after{content:"";position:absolute;right:-80px;top:-80px;width:180px;height:180px;border-radius:50%;pointer-events:none}',
      '.fw-side-k{font-size:.72rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:' + config.brandColor + '}',
      '.fw-side-h{font-size:clamp(1.15rem,1.5vw,1.45rem);line-height:1.22;margin:0}',
      '.fw-side-p{font-size:.92rem;line-height:1.65;margin:0}',
      '.fw-checks{list-style:none;padding:0;margin:2px 0 0;display:grid;gap:12px}',
      '.fw-checks li{display:flex;gap:10px;align-items:flex-start;font-size:.9rem;line-height:1.45}',
      '.fw-checks i{flex:0 0 auto;margin-top:2px}',
      '.fw-mini{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:auto}',
      '.fw-mini-item{border-radius:10px;padding:12px}',
      '.fw-mini-num{display:block;font-size:1.25rem;font-weight:800;line-height:1}',
      '.fw-mini-lbl{display:block;margin-top:6px;font-size:.7rem;line-height:1.3;text-transform:uppercase;letter-spacing:.04em}',
      '@media(max-width:767px){.fw-card{grid-template-columns:1fr}.fw-side{order:-1}.fw-fields{grid-template-columns:1fr}}',

      /* ---- DARK theme (white-on-glass) ---- */
      '.fw-section--dark{background:linear-gradient(135deg,#111D1B 0%,#26332F 100%)}',
      '.fw-section--dark .fw-h{color:#fff}',
      '.fw-section--dark .fw-s{color:rgba(250,247,242,.82)}',
      '.fw-section--dark .fw-tr{color:rgba(250,247,242,.55)}',
      '.fw-section--dark .fw-card{background:rgba(255,255,255,.075);border:1px solid rgba(255,255,255,.16);box-shadow:0 24px 60px rgba(0,0,0,.22),inset 0 1px 0 rgba(255,255,255,.08)}',
      '.fw-section--dark .fw-label{color:rgba(255,255,255,.8)}',
      '.fw-section--dark .fw-input{background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.18);color:#fff}',
      '.fw-section--dark .fw-input::placeholder{color:rgba(255,255,255,.35)}',
      '.fw-section--dark .fw-input:focus{border-color:' + config.accentColor + ';background:rgba(255,255,255,.12);box-shadow:0 0 0 3px rgba(255,209,102,.14)}',
      '.fw-section--dark .fw-side{border:1px solid rgba(255,255,255,.14);background:linear-gradient(180deg,rgba(255,255,255,.11),rgba(255,255,255,.055))}',
      '.fw-section--dark .fw-side::after{background:radial-gradient(circle,rgba(255,209,102,.18),transparent 68%)}',
      '.fw-section--dark .fw-side-k{color:' + config.accentColor + '}',
      '.fw-section--dark .fw-side-h{color:#fff}',
      '.fw-section--dark .fw-side-p{color:rgba(250,247,242,.72)}',
      '.fw-section--dark .fw-checks li{color:rgba(250,247,242,.84)}',
      '.fw-section--dark .fw-checks i{color:' + config.accentColor + '}',
      '.fw-section--dark .fw-mini-item{border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.12)}',
      '.fw-section--dark .fw-mini-num{color:#fff}',
      '.fw-section--dark .fw-mini-lbl{color:rgba(250,247,242,.58)}',

      /* ---- LIGHT theme (dark-on-white) ---- */
      '.fw-section--light{background:#FAF7F2}',
      '.fw-section--light .fw-h{color:#1F2937}',
      '.fw-section--light .fw-s{color:#5b6473}',
      '.fw-section--light .fw-tr{color:#5b6473}',
      '.fw-section--light .fw-card{background:#fff;border:1px solid rgba(15,31,30,.08);box-shadow:0 14px 32px rgba(15,31,30,.10)}',
      '.fw-section--light .fw-label{color:#1F2937}',
      '.fw-section--light .fw-input{background:#fff;border:1px solid rgba(15,31,30,.18);color:#1A1A1A}',
      '.fw-section--light .fw-input::placeholder{color:#9aa1ab}',
      '.fw-section--light .fw-input:focus{border-color:' + config.brandColor + ';box-shadow:0 0 0 3px rgba(220,38,38,.12)}',
      '.fw-section--light .fw-side{border:1px solid rgba(15,31,30,.08);background:#FAF7F2}',
      '.fw-section--light .fw-side::after{background:radial-gradient(circle,rgba(220,38,38,.10),transparent 68%)}',
      '.fw-section--light .fw-side-h{color:#1F2937}',
      '.fw-section--light .fw-side-p{color:#5b6473}',
      '.fw-section--light .fw-checks li{color:#1A1A1A}',
      '.fw-section--light .fw-checks i{color:' + config.brandColor + '}',
      '.fw-section--light .fw-mini-item{border:1px solid rgba(15,31,30,.08);background:#fff}',
      '.fw-section--light .fw-mini-num{color:#1F2937}',
      '.fw-section--light .fw-mini-lbl{color:#5b6473}'
    ].join('');
    document.head.appendChild(s);
  }

  function buildSection(container, idx) {
    var theme = (container.getAttribute('data-theme') || '').toLowerCase();
    if (theme !== 'dark' && theme !== 'light') theme = detectTheme(container);

    var lang = normalizeLang(container.getAttribute('data-lang') || document.documentElement.lang);
    var t = getStrings(lang);

    var heading = container.getAttribute('data-heading') || t.heading;
    var sub = container.getAttribute('data-sub') || t.sub;
    var page = container.getAttribute('data-page') || derivePage();

    // unique ids if multiple forms on one page
    var uid = 'fw' + (idx || 0);
    var formId = idx ? 'inquiry-form-' + idx : 'inquiry-form';

    var section = document.createElement('section');
    section.className = 'fw-section fw-section--' + theme;
    section.setAttribute('aria-labelledby', uid + '-h');
    if (RTL_LANGS[lang]) section.setAttribute('dir', 'rtl');

    var checksHtml = (t.checks || []).map(function (c) {
      return '<li><i class="bi bi-check2-circle"></i><span>' + escapeHtml(c) + '</span></li>';
    }).join('');

    section.innerHTML =
      '<div class="fw-ctr">' +
        '<h2 class="fw-h" id="' + uid + '-h">' + escapeHtml(heading) + '</h2>' +
        '<p class="fw-s">' + escapeHtml(sub) + '</p>' +
        '<div class="fw-card">' +
          '<form id="' + formId + '" action="' + escapeAttr(config.action) + '" method="POST" enctype="multipart/form-data" novalidate>' +
            '<input type="hidden" name="domain" value="' + escapeAttr(location.hostname) + '">' +
            '<input type="hidden" name="page" value="' + escapeAttr(page) + '">' +
            '<input type="hidden" name="page_url" value="' + escapeAttr(location.href) + '">' +
            '<input class="fw-hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">' +
            '<div class="fw-fields">' +
              '<div class="fw-field">' +
                '<label class="fw-label" for="' + uid + '-name">' + escapeHtml(t.nameLabel) + ' <span class="fw-req">*</span></label>' +
                '<input class="fw-input" type="text" id="' + uid + '-name" name="name" required placeholder="' + escapeAttr(t.namePlaceholder) + '">' +
              '</div>' +
              '<div class="fw-field">' +
                '<label class="fw-label" for="' + uid + '-email">' + escapeHtml(t.emailLabel) + ' <span class="fw-req">*</span></label>' +
                '<input class="fw-input" type="email" id="' + uid + '-email" name="email" required placeholder="' + escapeAttr(t.emailPlaceholder) + '">' +
              '</div>' +
              '<div class="fw-field">' +
                '<label class="fw-label" for="' + uid + '-phone">' + escapeHtml(t.phoneLabel) + '</label>' +
                '<input class="fw-input" type="tel" id="' + uid + '-phone" name="phone" placeholder="' + escapeAttr(t.phonePlaceholder) + '">' +
              '</div>' +
              '<div class="fw-field fw-field--full">' +
                '<label class="fw-label" for="' + uid + '-msg">' + escapeHtml(t.msgLabel) + ' <span class="fw-req">*</span></label>' +
                '<textarea class="fw-input" id="' + uid + '-msg" name="message" rows="3" required placeholder="' + escapeAttr(t.msgPlaceholder) + '"></textarea>' +
              '</div>' +
            '</div>' +
            '<button type="submit" class="fw-btn">' + escapeHtml(t.button) + '</button>' +
          '</form>' +
          '<aside class="fw-side" aria-label="' + escapeAttr(t.sideHeading) + '">' +
            '<div>' +
              '<div class="fw-side-k">' + escapeHtml(t.sideKicker) + '</div>' +
              '<h3 class="fw-side-h">' + escapeHtml(t.sideHeading) + '</h3>' +
              '<p class="fw-side-p">' + escapeHtml(t.sideText) + '</p>' +
            '</div>' +
            '<ul class="fw-checks">' + checksHtml + '</ul>' +
            '<div class="fw-mini">' +
              '<div class="fw-mini-item"><span class="fw-mini-num">' + escapeHtml(t.miniNum1) + '</span><span class="fw-mini-lbl">' + escapeHtml(t.miniLbl1) + '</span></div>' +
              '<div class="fw-mini-item"><span class="fw-mini-num">' + escapeHtml(t.miniNum2) + '</span><span class="fw-mini-lbl">' + escapeHtml(t.miniLbl2) + '</span></div>' +
            '</div>' +
          '</aside>' +
        '</div>' +
        '<p class="fw-tr">' + escapeHtml(t.trust) + '</p>' +
      '</div>';

    container.innerHTML = '';
    container.appendChild(section);
    bindForm(section.querySelector('form'));
  }

  // anti-spam: timestamp the load, stamp seconds-on-page at submit
  function bindForm(form) {
    if (!form) return;
    var loadedAt = Date.now();
    form.addEventListener('submit', function () {
      var existing = form.querySelector('input[name="submission_time"]');
      if (!existing) {
        var s = document.createElement('input');
        s.type = 'hidden';
        s.name = 'submission_time';
        s.value = String(Math.floor((Date.now() - loadedAt) / 1000));
        form.appendChild(s);
      }
      // refresh page_url in case of in-page history changes
      var pu = form.querySelector('input[name="page_url"]');
      if (pu) pu.value = location.href;
    });
  }

  // smooth-scroll any in-page links pointing at the form
  function bindAnchors() {
    document.querySelectorAll('a[href="#inquiry-form"]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        var form = document.getElementById('inquiry-form');
        if (!form) return;
        e.preventDefault();
        form.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(function () {
          var f = form.querySelector('input:not([type="hidden"]):not(.fw-hp),textarea');
          if (f) f.focus({ preventScroll: true });
        }, 600);
      });
    });
  }

  function init() {
    var containers = document.querySelectorAll(config.containerSelector);
    if (!containers.length) return;
    injectStyles();
    containers.forEach(function (c, i) { buildSection(c, i); });
    bindAnchors();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
