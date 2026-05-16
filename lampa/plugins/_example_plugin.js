// @name        Мій плагін
// @version     1.0.0
// @author      Автор
// @description Короткий опис того, що робить плагін

(function () {
    'use strict';

    // ── Перевірка доступності Lampa API ─────────────────────────────
    if (typeof Lampa === 'undefined') {
        console.warn('[MyPlugin] Lampa API не знайдено');
        return;
    }

    // ── Локалізація (необов'язково) ──────────────────────────────────
    Lampa.Lang.add({
        my_plugin_title: {
            uk: 'Мій плагін',
            ru: 'Мой плагин',
            en: 'My Plugin'
        }
    });

    // ── Основна логіка ───────────────────────────────────────────────
    function init() {
        console.log('[MyPlugin] Завантажено!');

        // Приклад: додати пункт у налаштування
        // Lampa.SettingsApi.addComponent({
        //     component: 'my_plugin',
        //     name:      Lampa.Lang.translate('my_plugin_title'),
        //     icon:      '<svg>...</svg>'
        // });
    }

    // ── Запуск після готовності Lampa ────────────────────────────────
    if (window.Lampa && Lampa.Listener) {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') init();
        });
    } else {
        // fallback
        document.addEventListener('DOMContentLoaded', init);
    }

})();
