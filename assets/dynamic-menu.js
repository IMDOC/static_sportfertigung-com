(function() {
  'use strict';

  const defaultConfig = {

    menuFile: '/assets/menu-config.json',

    logo: {
      text: 'Sport Fertigung',
      image: '/assets/images/logo.svg',
      link: '/'
    },

    menuItems: [
      { text: 'Startseite', link: '/', active: true }
    ],

    containerId: 'dynamic-menu-container',

    style: 'horizontal',

    theme: 'light',

    brandColor: '#DC2626',

    sticky: true,

    mobileBreakpoint: 768,

    showSearch: false,

    showLanguage: false,

    animation: true
  };

  const config = Object.assign({}, defaultConfig, window.DynamicMenuConfig || {});

  let menuData = {
    logo: config.logo,
    menuItems: config.menuItems
  };
  let isMobileMenuOpen = false;
  let currentPath = window.location.pathname;

  function init() {

    if (config.menuFile) {
      loadMenuFromFile();
    } else {

      createMenu();
    }
  }

  function loadMenuFromFile() {
    fetch(config.menuFile)
      .then(response => {
        if (!response.ok) {
          throw new Error('Failed to load menu file');
        }
        return response.json();
      })
      .then(data => {
        menuData = {
          logo: data.logo || config.logo,
          menuItems: data.menuItems || config.menuItems,
          ctaButton: data.ctaButton || null
        };
        createMenu();
      })
      .catch(error => {
        console.error('[Dynamic Menu] Error loading menu:', error);

        createMenu();
      });
  }

  function setCSSVariables() {

    const root = document.documentElement;
    root.style.setProperty('--dm-brand-color', config.brandColor);
    root.style.setProperty('--dm-bg-color', getBackgroundColor());
    root.style.setProperty('--dm-text-color', getTextColor());
  }

  function getBackgroundColor() {
    const themes = {
      light: '#ffffff',
      dark: '#1a1a1a',
      transparent: 'transparent'
    };
    return themes[config.theme] || themes.light;
  }

  function getTextColor() {
    const themes = {
      light: '#333333',
      dark: '#ffffff',
      transparent: '#333333'
    };
    return themes[config.theme] || themes.light;
  }

  function createMenu() {

    setCSSVariables();

    let container = document.getElementById(config.containerId);

    if (!container) {

      container = document.createElement('nav');
      container.id = config.containerId;
      document.body.insertBefore(container, document.body.firstChild);
    }

const hasStaticContent = container.querySelector('.dm-nav');

    if (hasStaticContent) {
      console.log('[Dynamic Menu] Static menu detected, enhancing');

      bindEvents();
      if (config.sticky) {
        window.addEventListener('scroll', handleScroll);
      }
      return;
    }

    console.log('[Dynamic Menu] No static menu, generating dynamically');

    const classes = ['dm-menu'];
    if (config.sticky) classes.push('sticky');
    if (config.theme) classes.push(`theme-${config.theme}`);
    if (config.animation) classes.push('animate');
    container.className = classes.join(' ');

    container.innerHTML = `
      <div class="dm-container">
        ${generateLogoHTML()}
        ${generateNavHTML()}
        ${config.showSearch ? generateSearchHTML() : ''}
        ${generateCTAButtonHTML()}
        <button class="dm-mobile-toggle" id="dmMobileToggle" aria-label="Ouvrir le menu">
          <span></span>
          <span></span>
          <span></span>
        </button>
      </div>
    `;

    bindEvents();

    if (config.sticky) {
      window.addEventListener('scroll', handleScroll);
    }
  }

  function generateLogoHTML() {
    const logo = menuData.logo;
    const showText = logo.showText !== undefined ? logo.showText : true;
    return `
      <a href="${logo.link || '/'}" class="dm-logo">
        ${logo.image ? `<img src="${logo.image}" alt="${logo.text}" />` : ''}
        ${showText ? `<span class="dm-logo-text">${logo.text}</span>` : ''}
      </a>
    `;
  }

  function generateNavHTML() {
    const items = menuData.menuItems.map(item => {
      if (item.children && item.children.length > 0) {

        return `
          <div class="dm-nav-item dm-dropdown">
            <a href="${item.link || '#'}" class="dm-nav-link dm-dropdown-toggle">
              ${item.text}
            </a>
            <div class="dm-dropdown-menu">
              ${item.children.map(child => `
                <a href="${child.link}" class="dm-dropdown-item ${isActive(child.link) ? 'active' : ''}">
                  ${child.text}
                </a>
              `).join('')}
            </div>
          </div>
        `;
      } else {

        return `
          <div class="dm-nav-item">
            <a href="${item.link}" class="dm-nav-link ${isActive(item.link) ? 'active' : ''}">
              ${item.text}
            </a>
          </div>
        `;
      }
    }).join('');

    return `<div class="dm-nav" id="dmNav">${items}</div>`;
  }

  function generateSearchHTML() {
    return `
      <div class="dm-search">
        <input type="text" class="dm-search-input" placeholder="Rechercher..." />
        <span class="dm-search-icon">🔍</span>
      </div>
    `;
  }

  function generateCTAButtonHTML() {
    if (!menuData.ctaButton) return '';

    const btn = menuData.ctaButton;
    return `
      <a href="${btn.link}" class="dm-cta-button">
        ${btn.text}
      </a>
    `;
  }

  function isActive(link) {

    const normalize = (path) => {
      path = path.replace(/\\/g, '/');
      if (path === '/') return '/';
      return path.replace(/\/$/, '');
    };

    const currentNormalized = normalize(currentPath);
    const linkNormalized = normalize(link);

    if (linkNormalized === '/' || linkNormalized === '/index.html') {
      return currentNormalized === '/' || currentNormalized === '/index.html' || currentNormalized === '';
    }

    return currentNormalized === linkNormalized || currentNormalized.startsWith(linkNormalized + '/');
  }

  function bindEvents() {

    const mobileToggle = document.getElementById('dmMobileToggle');
    const nav = document.getElementById('dmNav');

    if (mobileToggle && nav) {
      mobileToggle.addEventListener('click', function() {
        isMobileMenuOpen = !isMobileMenuOpen;
        this.classList.toggle('open');
        nav.classList.toggle('open');
      });
    }

    if (window.innerWidth <= config.mobileBreakpoint) {
      document.querySelectorAll('.dm-dropdown-toggle').forEach(toggle => {
        toggle.addEventListener('click', function(e) {
          e.preventDefault();
          const dropdown = this.closest('.dm-dropdown');
          dropdown.classList.toggle('open');
        });
      });
    }

    document.querySelectorAll('.dm-nav-link').forEach(link => {
      link.addEventListener('click', function() {
        if (window.innerWidth <= config.mobileBreakpoint && isMobileMenuOpen) {
          mobileToggle.click();
        }
      });
    });
  }

  function handleScroll() {
    const menu = document.querySelector('.dm-menu');
    if (menu) {
      if (window.scrollY > 50) {
        menu.classList.add('scrolled');
      } else {
        menu.classList.remove('scrolled');
      }
    }
  }

  window.DynamicMenu = {

    refresh: function() {
      init();
    },

    updateMenu: function(newMenuData) {
      menuData = newMenuData;
      createMenu();
    },

    setActive: function(link) {
      document.querySelectorAll('.dm-nav-link').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('href') === link) {
          item.classList.add('active');
        }
      });
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
