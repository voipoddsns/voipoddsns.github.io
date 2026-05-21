// =============================================
//  minimal-modification.js
//  Минимальный модификатор + локализация меню "Плагины"
// =============================================

(function () {
    'use strict';

    // ==================== Локализация меню "Плагины" ====================
    Lampa.Lang.add({
        // Основное название в боковом меню / настройках
        settings_plugins: {
            ru: "Плагины",
            uk: "Плагіни",
            en: "Plugins",
            pl: "Wtyczki",
            zh: "插件"
        },
        extensions: {
            ru: "Расширения",
            uk: "Розширення",
            en: "Extensions",
            pl: "Rozszerzenia"
        },
        // Если используется другой ключ
        menu_plugins: {
            ru: "Плагины",
            uk: "Плагіни",
            en: "Plugins"
        },
        plugin: {
            ru: "Плагин",
            uk: "Плагін",
            en: "Plugin"
        }
    });

    // ==================== Основные настройки ====================
    Lampa.Storage.set('protocol', 'http');
    localStorage.setItem('cub_domain', 'cub.rip');

    window.lampa_settings = window.lampa_settings || {};
    window.lampa_settings.torrents_use = true;
    window.lampa_settings.demo = false;

    // ==================== Применение настроек ====================
    const initTimer = setInterval(() => {
        if (typeof Lampa === 'undefined' || typeof Lampa.Storage === 'undefined') return;

        clearInterval(initTimer);

        if (Lampa.Storage.get('minimal_set') !== true) {
            applyMinimalSettings();
        }
    }, 400);

    function applyMinimalSettings() {
        Lampa.Storage.set('minimal_set', true);

        Lampa.Storage.set('protocol', 'http');
        Lampa.Storage.set('start_page', 'main');
        Lampa.Storage.set('source', 'tmdb');
        Lampa.Storage.set('keyboard_type', 'integrate');
        Lampa.Storage.set('player_normalization', true);
        Lampa.Storage.set('player_timecode', 'ask');

        Lampa.Storage.set('background', false);
        Lampa.Storage.set('animation', false);
        Lampa.Storage.set('mask', false);
        Lampa.Storage.set('screensaver', false);

        Lampa.Storage.set('device_name', 'Lampa');

        setTimeout(() => location.reload(), 600);
    }

    // Фикс закладок
    Lampa.Storage.listener.follow('change', function (event) {
        if (event.name === 'activity' && Lampa.Activity?.active()?.component === 'bookmarks') {
            setTimeout(() => {
                Lampa.Controller.move('down');
                Lampa.Controller.move('up');
            }, 150);
        }
    });

    console.log('%cMinimal Modification + Localization загружен', 'color: #00ff88; font-weight: bold');
})();
