// =============================================
//  minimal-modification.js
//  Минимальный модификатор + исправление названия "Плагины"
// =============================================

(function () {
    'use strict';

    // ==================== Улучшенная локализация ====================
    Lampa.Lang.add({
        // Основные ключи для пункта "Плагины"
        settings_plugins: {
            ru: "Плагины",
            uk: "Плагіни",
            en: "Plugins",
            pl: "Wtyczki",
            es: "Complementos",
            fr: "Plugins",
            de: "Plugins"
        },
        extensions: {
            ru: "Расширения",
            uk: "Розширення",
            en: "Extensions",
            pl: "Rozszerzenia"
        },
        menu_plugins: {
            ru: "Плагины",
            uk: "Плагіни",
            en: "Plugins"
        },
        plugins: {
            ru: "Плагины",
            uk: "Плагіни",
            en: "Plugins"
        },
        // Оригинальные переводы из bylampa
        extensions_worked: {
            ru: "Доступен для загрузки"
        },
        title_error: {
            ru: "Недоступен или ошибка в адресе"
        },
        torrent_parser_no_hash: {
            ru: "Не удалось получить HASH. Перезагрузите TorrServer или смените адрес!"
        }
    });

    // ==================== Основные настройки ====================
    Lampa.Storage.set('protocol', 'http');
    localStorage.setItem('cub_domain', 'cub.rip');

    window.lampa_settings = window.lampa_settings || {};
    window.lampa_settings.torrents_use = true;
    window.lampa_settings.demo = false;
    window.lampa_settings.read_only = false;

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

        setTimeout(() => location.reload(), 700);
    }

    // ==================== Фикс закладок ====================
    Lampa.Storage.listener.follow('change', function (event) {
        if (event.name === 'activity' && Lampa.Activity?.active()?.component === 'bookmarks') {
            setTimeout(() => {
                Lampa.Controller.move('down');
                Lampa.Controller.move('up');
            }, 150);
        }
    });

    console.log('%cMinimal Modification + Plugins Localization загружен', 'color: #00ff88; font-weight: bold');
})();
