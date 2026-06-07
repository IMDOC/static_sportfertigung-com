(function() {
  'use strict';

  const defaultConfig = {

    configFile: '/assets/footer-config.json',

    company: {
      logo: '/assets/images/logo.svg',
      name: 'Sport Fertigung',
      description: 'Custom activewear and sportswear manufacturer offering one-stop OEM/ODM production for global brands.',
      socialLinks: [
        { icon: 'linkedin', url: 'https://www.linkedin.com/company/sport-fertigung', label: 'LinkedIn' }
      ]
    },

    columns: [
      {
        title: 'Produkte',
        links: [
          { text: 'Training & Performance', url: '/produkte/training-performance' },
          { text: 'Athleisure', url: '/produkte/athleisure' }
        ]
      },
      {
        title: 'Unternehmen',
        links: [
          { text: 'Über uns', url: '/ueber-uns' },
          { text: 'Contact', url: '/kontakt' }
        ]
      }
    ],

    contact: {
      title: 'Contact',
      email: 'sales@sportfertigung.com',
      phone: '+86-138-0000-7212',
      address: 'Guangzhou, China',
      hours: 'Mo-Fr 9:00-18:00 (GMT+8)'
    },

    copyright: {
      year: new Date().getFullYear(),
      company: 'Sport Fertigung',
      text: 'Alle Rechte vorbehalten.',
      links: [
        { text: 'Datenschutzerklärung', url: '/datenschutz' },
        { text: 'AGB', url: '/datenschutz' }
      ]
    },

    backgroundColor: '#1F2937',
    textColor: '#ffffff',
    linkColor: '#D1D5DB',
    brandColor: '#DC2626',
    hoverColor: '#DC2626'
  };

  const config = Object.assign({}, defaultConfig, window.FooterConfig || {});

  let footerData = {
    company: config.company,
    columns: config.columns,
    contact: config.contact,
    copyright: config.copyright
  };

  function init() {

    if (config.configFile) {
      loadConfigFromFile();
    } else {

      createFooter();
    }
  }

  function loadConfigFromFile() {
    fetch(config.configFile)
      .then(response => {
        if (!response.ok) {
          throw new Error('Failed to load footer config');
        }
        return response.json();
      })
      .then(data => {
        footerData = {
          company: data.company || config.company,
          columns: data.columns || config.columns,
          contact: data.contact || config.contact,
          copyright: data.copyright || config.copyright
        };

        if (!footerData.copyright.year) {
          footerData.copyright.year = new Date().getFullYear();
        }
        createFooter();
      })
      .catch(error => {
        console.error('[Footer] Error loading config:', error);

        createFooter();
      });
  }

  function createFooter() {

    const existingFooter = document.getElementById('site-footer');

    if (existingFooter) {
      console.log('[Footer] Static footer detected, enhancing');

      injectStyles();
      return;
    }

    console.log('[Footer] No static footer, generating dynamically');

    const footer = document.createElement('footer');
    footer.id = 'site-footer';
    footer.className = 'ft-footer';

    footer.innerHTML = `
      <div class="ft-container">
        <div class="ft-proof" aria-label="Vue de l’usine">
          <div class="ft-proof-item">
            <span class="ft-proof-num">2017</span>
            <span class="ft-proof-label">factory floor since</span>
          </div>
          <div class="ft-proof-item">
            <span class="ft-proof-num">12</span>
            <span class="ft-proof-label">production lines</span>
          </div>
          <div class="ft-proof-item">
            <span class="ft-proof-num">QC</span>
            <span class="ft-proof-label">files shared during RFQ</span>
          </div>
        </div>
        <div class="ft-grid">
          ${generateCompanyHTML()}
          ${generateColumnsHTML()}
          ${generateContactHTML()}
        </div>
        <div class="ft-bottom">
          ${generateCopyrightHTML()}
        </div>
      </div>
    `;

    document.body.appendChild(footer);

    injectStyles();
  }

  function generateCompanyHTML() {
    const company = footerData.company;
    return `
      <div class="ft-column ft-company">
        ${company.logo ? `<img src="${company.logo}" alt="${company.name}" class="ft-logo" />` : ''}
        <p class="ft-desc">${escapeHtml(company.description)}</p>
        <div class="ft-social-icons">
          ${company.socialLinks.map(link => {
            const icon = getSocialIcon(link.icon);
            return `
              <a href="${link.url}" aria-label="${link.label}" target="_blank" rel="noopener noreferrer">
                ${icon}
              </a>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  function generateColumnsHTML() {
    return footerData.columns.map(column => `
      <div class="ft-column">
        <h4 class="ft-title">${escapeHtml(column.title)}</h4>
        <ul class="ft-links">
          ${column.links.map(link => `
            <li><a href="${link.url}">${escapeHtml(link.text)}</a></li>
          `).join('')}
        </ul>
      </div>
    `).join('');
  }

  function generateContactHTML() {
    const contact = footerData.contact;
    return `
      <div class="ft-column ft-contact">
        <h4 class="ft-title">${escapeHtml(contact.title)}</h4>
        <ul class="ft-contact-list">
          ${contact.email ? `
            <li>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
              </svg>
              <a href="mailto:${contact.email}">${escapeHtml(contact.email)}</a>
            </li>
          ` : ''}
          ${contact.whatsapp ? `
            <li>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.890-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
              </svg>
              <a href="https://wa.me/${contact.whatsapp.replace(/\s+/g, '')}" target="_blank">${escapeHtml(contact.whatsapp)}</a>
            </li>
          ` : ''}
          ${contact.phone ? `
            <li>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/>
              </svg>
              <a href="tel:${contact.phone.replace(/\s+/g, '')}">${escapeHtml(contact.phone)}</a>
            </li>
          ` : ''}
          ${contact.address ? `
            <li>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
              </svg>
              ${escapeHtml(contact.address)}
            </li>
          ` : ''}
          ${contact.hours ? `
            <li>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
              </svg>
              ${escapeHtml(contact.hours)}
            </li>
          ` : ''}
        </ul>
      </div>
    `;
  }

  function generateCopyrightHTML() {
    const cr = footerData.copyright;
    const linksHTML = cr.links && cr.links.length > 0
      ? ' | ' + cr.links.map(link => `<a href="${link.url}">${escapeHtml(link.text)}</a>`).join(' | ')
      : '';

    return `
      <p>
        © ${cr.year} ${escapeHtml(cr.company)}. ${escapeHtml(cr.text)}${linksHTML}
      </p>
    `;
  }

  function getSocialIcon(iconName) {
    const icons = {
      facebook: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>',
      twitter: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
      instagram: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>',
      linkedin: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>',
      youtube: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>',
      whatsapp: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.890-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>'
    };
    return icons[iconName] || '';
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      
      .ft-footer {
        width: 100%;
        background: radial-gradient(circle at 18% 0%, rgba(213, 31, 42, 0.18), transparent 32%), linear-gradient(135deg, ${config.backgroundColor} 0%, #101816 100%);
        color: ${config.textColor};
        padding: 56px 0 28px;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
      }

      .ft-container {
        max-width: 1280px;
        margin: 0 auto;
        padding: 0 clamp(18px, 3vw, 32px);
      }

      .ft-proof {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 0;
        margin-bottom: 34px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 14px;
        overflow: hidden;
        background: rgba(255, 255, 255, 0.055);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
      }

      .ft-proof-item {
        padding: 18px clamp(16px, 2vw, 24px);
        min-width: 0;
      }

      .ft-proof-item:not(:last-child) {
        border-right: 1px solid rgba(255, 255, 255, 0.10);
      }

      .ft-proof-num {
        display: block;
        color: #ffffff;
        font-size: clamp(1.35rem, 2vw, 1.9rem);
        font-weight: 800;
        line-height: 1;
      }

      .ft-proof-label {
        display: block;
        margin-top: 7px;
        color: rgba(255, 255, 255, 0.58);
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: 0.06em;
        line-height: 1.35;
        text-transform: uppercase;
      }

      .ft-grid {
        display: grid;
        grid-template-columns: minmax(280px, 1.4fr) repeat(3, minmax(145px, 0.72fr)) minmax(250px, 1fr);
        gap: clamp(24px, 4vw, 52px);
        margin-bottom: 34px;
        align-items: start;
      }

      .ft-column {}

      .ft-logo {
        width: 172px;
        margin-bottom: 18px;
        filter: drop-shadow(0 8px 18px rgba(0, 0, 0, 0.2));
      }

      .ft-desc {
        color: rgba(255, 255, 255, 0.68);
        font-size: 14px;
        line-height: 1.7;
        margin-bottom: 20px;
        max-width: 38ch;
      }

      .ft-social-icons {
        display: flex;
        gap: 15px;
      }

      .ft-social-icons a {
        width: 40px;
        height: 40px;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: ${config.textColor};
        transition: all 0.3s;
      }

      .ft-social-icons a:hover {
        transform: translateY(-3px);
        background: ${config.hoverColor};
      }

      .ft-title {
        font-size: 0.78rem;
        font-weight: 700;
        margin: 0 0 16px;
        color: ${config.textColor};
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .ft-links {
        list-style: none;
        padding: 0;
        margin: 0;
      }

      .ft-links li {
        margin-bottom: 10px;
      }

      .ft-links a {
        color: rgba(255, 255, 255, 0.66);
        font-size: 14px;
        text-decoration: none;
        transition: color 0.2s ease, padding-left 0.2s ease;
      }

      .ft-links a:hover {
        color: ${config.hoverColor};
        padding-left: 5px;
      }

      .ft-contact-list {
        list-style: none;
        padding: 0;
        margin: 0;
      }

      .ft-contact-list li {
        margin-bottom: 13px;
        color: rgba(255, 255, 255, 0.66);
        font-size: 14px;
        display: flex;
        align-items: flex-start;
        gap: 10px;
      }

      .ft-contact-list svg {
        flex-shrink: 0;
        color: ${config.brandColor};
        margin-top: 2px;
        opacity: 1;
      }

      .ft-contact-list a {
        color: rgba(255, 255, 255, 0.72);
        text-decoration: none;
        transition: color 0.3s;
      }

      .ft-contact-list a:hover {
        color: ${config.hoverColor};
      }

      .ft-bottom {
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        padding-top: 22px;
        text-align: left;
        color: rgba(255, 255, 255, 0.52);
        font-size: 13px;
      }

      .ft-bottom p {
        margin: 0;
      }

      .ft-bottom a {
        color: ${config.linkColor};
        text-decoration: none;
        margin: 0 10px;
        transition: color 0.3s;
      }

      .ft-bottom a:hover {
        color: ${config.hoverColor};
      }

      @media (max-width: 1180px) {
        .ft-grid {
          grid-template-columns: minmax(220px, 1.35fr) repeat(3, minmax(115px, 0.8fr)) minmax(190px, 1fr);
          gap: 22px;
        }

        .ft-contact {
          grid-column: auto;
          padding-top: 0;
          border-top: 0;
        }

        .ft-contact-list li {
          margin-bottom: 13px;
          min-width: 0;
        }

        .ft-contact-list a {
          overflow-wrap: anywhere;
        }
      }

      @media (max-width: 768px) {
        .ft-footer {
          padding: 40px 0 20px;
        }

        .ft-proof {
          grid-template-columns: 1fr;
          margin-bottom: 28px;
        }

        .ft-proof-item:not(:last-child) {
          border-right: 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.10);
        }

        .ft-grid {
          grid-template-columns: 1fr;
          gap: 30px;
        }

        .ft-company,
        .ft-contact {
          grid-column: auto;
          padding-top: 0;
          border-top: 0;
        }

        .ft-contact-list {
          display: block;
        }

        .ft-contact-list li {
          margin-bottom: 13px;
        }

        .ft-logo {
          width: 150px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  window.Footer = {

    refresh: function() {
      const footer = document.getElementById('site-footer');
      if (footer) {
        footer.remove();
      }
      init();
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
