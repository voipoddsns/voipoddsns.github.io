// =============================================
//  minimal-modification.js
//  Минимальный модификатор Lampa
//  Очищенная версия без внешних зависимостей
// =============================================

(function () {
    'use strict';

    // ==================== Основные принудительные настройки ====================
    Lampa.Storage.set('protocol', 'http');
    localStorage.setItem('cub_domain', 'cub.rip');

    // Глобальные настройки
    window.lampa_settings = window.lampa_settings || {};
    window.lampa_settings.torrents_use = true;
    window.lampa_settings.demo = false;
    window.lampa_settings.read_only = false;

    // ==================== Полезные переводы ====================
    Lampa.Lang.add({
        torrent_parser_no_hash: {
            ru: "Не удалось получить HASH. Перезагрузите TorrServer или смените адрес!"
        }
    });

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

        // Основные удобные настройки
        Lampa.Storage.set('protocol', 'http');
        Lampa.Storage.set('start_page', 'main');
        Lampa.Storage.set('source', 'tmdb');
        Lampa.Storage.set('keyboard_type', 'integrate');
        Lampa.Storage.set('player_normalization', true);
        Lampa.Storage.set('player_timecode', 'ask');
        Lampa.Storage.set('pages_save_total', 3);

        // Отключаем лишние анимации и эффекты (ускоряет работу)
        Lampa.Storage.set('background', false);
        Lampa.Storage.set('animation', false);
        Lampa.Storage.set('mask', false);
        Lampa.Storage.set('screensaver', false);

        Lampa.Storage.set('device_name', 'Lampa');

        // Применяем настройки
        setTimeout(() => {
            location.reload();
        }, 600);
    }

    // ==================== Фикс интерфейса в закладках ====================
    Lampa.Storage.listener.follow('change', function (event) {
        if (event.name === 'activity' && Lampa.Activity && Lampa.Activity.active().component === 'bookmarks') {
            setTimeout(() => {
                Lampa.Controller.move('down');
                Lampa.Controller.move('up');
            }, 150);
        }
    });

    // ==================== Предупреждение при использовании https ====================
    if (window.location.protocol === 'https:') {
        $(document).ready(function () {
            setTimeout(() => {
                Lampa.Bell.push({
                    text: 'Рекомендуется использовать протокол http вместо https'
                });
            }, 2000);
        });
    }

    console.log('%cMinimal Modification Plugin загружен', 'color: #00ff00; font-weight: bold');
})();
