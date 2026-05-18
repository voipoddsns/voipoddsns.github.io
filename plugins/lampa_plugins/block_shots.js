(function () {
    'use strict';

    window.plugin_shots_ready = true;

    if (window.Lampa && Lampa.Menu && Lampa.Menu.addButton) {
        const original = Lampa.Menu.addButton;
        Lampa.Menu.addButton = function (icon, title, callback) {
            if (title === 'Shots') return;
            return original.apply(this, arguments);
        };
    }

    function removeShotsButton() {
        document.querySelectorAll('.menu__item').forEach(el => {
            if (el.textContent.trim() === 'Shots') el.remove();
        });
    }

    Lampa.Listener.follow('menu', e => {
        if (e.type === 'end') removeShotsButton();
    });

    function removeShotsOnlineButton() {
        document.querySelectorAll('.full-start__button').forEach(el => {
            if (el.textContent.toLowerCase().includes('shots')) el.remove();
        });
    }

    Lampa.Listener.follow('full', e => {
        if (e.type === 'complite') setTimeout(removeShotsOnlineButton, 0);
    });
})();
