(function() {
  'use strict';

  const defaultConfig = {

    contactsFile: 'assets/whatsapp-contacts.json',

    contacts: [
      {
        name: 'Ventes',
        title: 'Équipe Commerciale',
        phone: '8613800007212',
        avatar: '',
        message: 'Bonjour, je suis intéressé(e) par vos services OEM/ODM de vêtements de sport personnalisés.'
      }
    ],

    position: 'bottom-right',

    brandColor: '#25D366',

    buttonText: 'Discutez avec nous',

    popupTitle: 'Comment pouvons-nous vous aider ?',

    welcomeMessage: 'Choisissez un contact ci-dessous pour démarrer la conversation',

    showOnMobile: true,

    autoOpenDelay: 0,

    enableAnimation: true,

    zIndex: 9999
  };

  const config = Object.assign({}, defaultConfig, window.WhatsAppWidgetConfig || {});

  let contacts = config.contacts;
  let isPopupOpen = false;

  function init() {

    if (config.contactsFile && config.contactsFile !== defaultConfig.contactsFile) {
      loadContactsFromFile();
    } else {

      createWidget();
    }
  }

  function loadContactsFromFile() {
    fetch(config.contactsFile)
      .then(response => {
        if (!response.ok) {
          throw new Error('Failed to load contacts file');
        }
        return response.json();
      })
      .then(data => {
        if (Array.isArray(data)) {
          contacts = data;
        } else if (data.contacts && Array.isArray(data.contacts)) {
          contacts = data.contacts;
        }
        createWidget();
      })
      .catch(error => {
        console.error('[WhatsApp Widget] Error loading contacts:', error);

        contacts = config.contacts;
        createWidget();
      });
  }

  function createStyles() {
    const style = document.createElement('style');
    style.textContent = `
      
      .wa-widget {
        position: fixed;
        ${getPositionStyles()}
        z-index: ${config.zIndex};
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      }

      .wa-widget * {
        box-sizing: border-box;
      }

      .wa-widget-button {
        background: ${config.brandColor};
        color: white;
        border: none;
        border-radius: 50px;
        padding: 15px 25px;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        font-size: 16px;
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 10px;
        transition: all 0.3s ease;
        border: 2px solid transparent;
        position: relative;
        ${config.enableAnimation ? 'animation: wa-pulse 2s ease-in-out infinite;' : ''}
      }

      @keyframes wa-pulse {
        0%, 100% {
          transform: scale(1);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }
        50% {
          transform: scale(1.05);
          box-shadow: 0 6px 20px rgba(37, 211, 102, 0.4);
        }
      }

      .wa-widget-button::before {
        content: '';
        position: absolute;
        top: -5px;
        left: -5px;
        right: -5px;
        bottom: -5px;
        background: ${config.brandColor};
        border-radius: 50px;
        opacity: 0;
        z-index: -1;
        ${config.enableAnimation ? 'animation: wa-ripple 2s ease-in-out infinite;' : ''}
      }

      @keyframes wa-ripple {
        0%, 100% {
          opacity: 0;
          transform: scale(1);
        }
        50% {
          opacity: 0.3;
          transform: scale(1.1);
        }
      }

      .wa-widget-button:hover {
        animation-play-state: paused;
        transform: translateY(-3px) scale(1.05);
        box-shadow: 0 8px 25px rgba(37, 211, 102, 0.5);
      }

      .wa-widget-button:hover::before {
        animation-play-state: paused;
      }

      .wa-widget-button:active {
        transform: translateY(-1px) scale(1.02);
      }

      .wa-widget-button svg {
        width: 24px;
        height: 24px;
        flex-shrink: 0;
        ${config.enableAnimation ? 'animation: wa-icon-wiggle 3s ease-in-out infinite;' : ''}
      }

      @keyframes wa-icon-wiggle {
        0%, 100% {
          transform: rotate(0deg);
        }
        10%, 30% {
          transform: rotate(-5deg);
        }
        20%, 40% {
          transform: rotate(5deg);
        }
        50%, 90% {
          transform: rotate(0deg);
        }
      }

      .wa-widget-popup {
        position: absolute;
        ${getPopupPositionStyles()}
        width: 320px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
        overflow: hidden;
        opacity: 0;
        transform: scale(0.8);
        transform-origin: ${getTransformOrigin()};
        transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        pointer-events: none;
        max-height: 500px;
        display: flex;
        flex-direction: column;
      }

      .wa-widget-popup.open {
        opacity: 1;
        transform: scale(1);
        pointer-events: all;
      }

      .wa-popup-header {
        background: ${config.brandColor};
        color: white;
        padding: 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .wa-popup-header h3 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
      }

      .wa-popup-close {
        background: none;
        border: none;
        color: white;
        font-size: 24px;
        cursor: pointer;
        padding: 0;
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        transition: background 0.2s;
      }

      .wa-popup-close:hover {
        background: rgba(255, 255, 255, 0.2);
      }

      .wa-popup-content {
        padding: 20px;
        flex: 1;
        overflow-y: auto;
      }

      .wa-welcome-message {
        font-size: 14px;
        color: #666;
        margin-bottom: 15px;
        text-align: center;
      }

      .wa-contacts-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .wa-contact-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;
        text-decoration: none;
        color: inherit;
      }

      .wa-contact-item:hover {
        border-color: ${config.brandColor};
        background: rgba(37, 211, 102, 0.05);
        transform: translateX(3px);
      }

      .wa-contact-avatar {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: ${config.brandColor};
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 600;
        font-size: 18px;
        flex-shrink: 0;
        overflow: hidden;
      }

      .wa-contact-avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .wa-contact-info {
        flex: 1;
        min-width: 0;
      }

      .wa-contact-name {
        font-weight: 600;
        font-size: 15px;
        color: #333;
        margin-bottom: 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .wa-contact-title {
        font-size: 13px;
        color: #666;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .wa-contact-arrow {
        color: ${config.brandColor};
        font-size: 20px;
        flex-shrink: 0;
      }

      @media (max-width: 768px) {
        .wa-widget {
          ${!config.showOnMobile ? 'display: none;' : ''}
        }

        .wa-widget-popup {
          width: calc(100vw - 40px);
          max-width: 320px;
        }

        .wa-widget-button {
          padding: 12px 20px;
          font-size: 14px;
        }

        .wa-widget-button svg {
          width: 20px;
          height: 20px;
        }
      }

      .wa-popup-content::-webkit-scrollbar {
        width: 6px;
      }

      .wa-popup-content::-webkit-scrollbar-track {
        background: #f1f1f1;
        border-radius: 3px;
      }

      .wa-popup-content::-webkit-scrollbar-thumb {
        background: ${config.brandColor};
        border-radius: 3px;
      }

      .wa-popup-content::-webkit-scrollbar-thumb:hover {
        background: #20bc5a;
      }
    `;
    document.head.appendChild(style);
  }

  function getPositionStyles() {
    const positions = {
      'bottom-right': 'right: 20px; bottom: 20px;',
      'bottom-left': 'left: 20px; bottom: 20px;',
      'top-right': 'right: 20px; top: 20px;',
      'top-left': 'left: 20px; top: 20px;'
    };
    return positions[config.position] || positions['bottom-right'];
  }

  function getPopupPositionStyles() {
    const isBottom = config.position.includes('bottom');
    const isRight = config.position.includes('right');

    return `
      ${isBottom ? 'bottom: 70px;' : 'top: 70px;'}
      ${isRight ? 'right: 0;' : 'left: 0;'}
    `;
  }

  function getTransformOrigin() {
    const isBottom = config.position.includes('bottom');
    const isRight = config.position.includes('right');

    return `${isRight ? 'right' : 'left'} ${isBottom ? 'bottom' : 'top'}`;
  }

  function createWidget() {

    createStyles();

    const container = document.createElement('div');
    container.className = 'wa-widget';
    container.innerHTML = `
      <button class="wa-widget-button" id="waWidgetBtn" aria-label="Ouvrir le chat WhatsApp">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
        </svg>
        <span>${config.buttonText}</span>
      </button>

      <div class="wa-widget-popup" id="waWidgetPopup">
        <div class="wa-popup-header">
          <h3>${config.popupTitle}</h3>
          <button class="wa-popup-close" id="waPopupClose" aria-label="Fermer la fenêtre">×</button>
        </div>
        <div class="wa-popup-content">
          <div class="wa-welcome-message">${config.welcomeMessage}</div>
          <div class="wa-contacts-list" id="waContactsList">
            ${generateContactsHTML()}
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(container);

    bindEvents();

    if (config.autoOpenDelay > 0) {
      setTimeout(openPopup, config.autoOpenDelay * 1000);
    }
  }

  function generateContactsHTML() {
    if (!contacts || contacts.length === 0) {
      return '<p style="text-align: center; color: #999;">No contacts available</p>';
    }

    return contacts.map(contact => {
      const avatar = contact.avatar
        ? `<img src="${contact.avatar}" alt="${contact.name}" />`
        : getInitials(contact.name);

      const message = encodeURIComponent(contact.message || config.welcomeMessage || 'Hello');
      const whatsappUrl = `https://wa.me/${contact.phone}?text=${message}`;

      return `
        <a href="${whatsappUrl}" target="_blank" class="wa-contact-item" data-phone="${contact.phone}">
          <div class="wa-contact-avatar">${avatar}</div>
          <div class="wa-contact-info">
            <div class="wa-contact-name">${escapeHtml(contact.name)}</div>
            <div class="wa-contact-title">${escapeHtml(contact.title || '')}</div>
          </div>
          <div class="wa-contact-arrow">›</div>
        </a>
      `;
    }).join('');
  }

  function getInitials(name) {
    if (!name) return '?';
    const words = name.trim().split(' ');
    if (words.length === 1) {
      return words[0].charAt(0).toUpperCase();
    }
    return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function bindEvents() {
    const button = document.getElementById('waWidgetBtn');
    const popup = document.getElementById('waWidgetPopup');
    const closeBtn = document.getElementById('waPopupClose');

    if (button) {
      button.addEventListener('click', togglePopup);
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', closePopup);
    }

    document.addEventListener('click', function(e) {
      if (isPopupOpen && !popup.contains(e.target) && !button.contains(e.target)) {
        closePopup();
      }
    });

    const contactItems = document.querySelectorAll('.wa-contact-item');
    contactItems.forEach(item => {
      item.addEventListener('click', function() {
        const phone = this.getAttribute('data-phone');
        console.log('[WhatsApp Widget] Contact clicked:', phone);

      });
    });
  }

  function togglePopup() {
    if (isPopupOpen) {
      closePopup();
    } else {
      openPopup();
    }
  }

  function openPopup() {
    const popup = document.getElementById('waWidgetPopup');
    if (popup) {
      popup.classList.add('open');
      isPopupOpen = true;
    }
  }

  function closePopup() {
    const popup = document.getElementById('waWidgetPopup');
    if (popup) {
      popup.classList.remove('open');
      isPopupOpen = false;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
