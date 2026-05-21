// =============================================
//  minimal-modification.js
//  Минимальный модификатор + исправление названия "Плагины"
// =============================================
// =============================================
//  
//  Минимальный модификатор + скрипты Bylampa
// =============================================

(function () {
    'use strict';

    // ==================== Локализация ====================
    Lampa.Lang.add({
        settings_plugins: {
            ru: "Плагины",
            uk: "Плагіни",
            en: "Plugins"
        },
        extensions: {
            ru: "Расширения",
            uk: "Розширення",
            en: "Extensions"
        },
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

    // ==================== Загрузка внешних скриптов Bylampa ====================
    const scripts = [
        'https://bylampa.github.io/notice.js',
        'https://bylampa.github.io/addon.js',
        'https://bylampa.github.io/bylampa_rating.js',
        'https://bylampa.github.io/account.js'
    ];

    // Добавляем кеш-брейкер, чтобы всегда бралась свежая версия
    scripts.forEach(url => {
        Lampa.Utils.putScript(url + '?v=' + Date.now());
    });

    // ==================== Очистка дублирующегося account.js ====================
    setTimeout(() => {
        let plugins = Lampa.Storage.get('plugins') || [];
        plugins = plugins.filter(p => 
            p.url !== 'https://bylampa.github.io/account.js' && 
            p.url !== 'https://github.com/bylampa/account.js'
        );
        Lampa.Storage.set('plugins', plugins);
    }, 2000);

    // ==================== Применение базовых настроек ====================
    const initTimer = setInterval(() => {
        if (typeof Lampa === 'undefined' || typeof Lampa.Storage === 'undefined') return;

        clearInterval(initTimer);

        if (Lampa.Storage.get('mod_set') !== true) {
            applySettings();
        }
    }, 500);

    function applySettings() {
        Lampa.Storage.set('mod_set', true);

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

        setTimeout(() => location.reload(), 800);
    }

    // ==================== Фикс закладок ====================
    Lampa.Storage.listener.follow('change', function (event) {
        if (event.name === 'activity' && Lampa.Activity?.active()?.component === 'bookmarks') {
            setTimeout(() => {
                Lampa.Controller.move('down');
                Lampa.Controller.move('up');
            }, 100);
        }
    });

    // ==================== Предупреждение https ====================
    if (window.location.protocol === 'https:') {
        $(document).ready(() => {
            setTimeout(() => {
                Lampa.Bell.push({
                    text: 'Рекомендуется использовать протокол http'
                });
            }, 2500);
        });
    }

    console.log('%cModification with Bylampa scripts загружен', 'color: #00ff88; font-weight: bold');
})();
