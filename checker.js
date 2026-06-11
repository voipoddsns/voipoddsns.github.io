(function () {
    'use strict';

    console.log('🔍 Плагин Поиск TorrServer загружен');

    Lampa.Lang.add({
        local_ts_search: { ru: '🔍 Поиск локального TorrServer', en: '🔍 Search local TorrServer' },
        local_ts_searching: { ru: 'Ищем в локальной сети...', en: 'Searching local network...' },
        local_ts_found: { ru: '✅ Найден:', en: '✅ Found:' },
        local_ts_not_found: { ru: '❌ Не найден', en: '❌ Not found' }
    });

    function scanNetwork() {
        Lampa.Loading.start();
        Lampa.Noty.show(Lampa.Lang.translate('local_ts_searching'));

        const port = 8090;
        let found = false;
        const prefixes = ['192.168.1.', '192.168.0.', '192.168.88.', '10.0.0.', '10.0.1.', '192.168.31.'];

        const check = (ip) => {
            if (found) return;
            Lampa.Network.silent(`http://${ip}:${port}/echo`, (resp) => {
                if (resp && (resp.echo || resp.version || typeof resp === "string")) {
                    found = true;
                    const url = `http://${ip}:${port}`;
                    Lampa.Storage.set('torrserver_url', url);
                    Lampa.Noty.show(Lampa.Lang.translate('local_ts_found') + url, {timeout: 7000});
                    setTimeout(() => Lampa.Settings.main(), 1000);
                }
            }, () => {}, false, {timeout: 500});
        };

        prefixes.forEach(prefix => {
            for (let i = 2; i < 255; i++) {
                if (found) break;
                check(prefix + i);
            }
        });

        setTimeout(() => {
            Lampa.Loading.stop();
            if (!found) Lampa.Noty.show(Lampa.Lang.translate('local_ts_not_found'));
        }, 8000);
    }

    // Добавляем кнопку максимально жёстко
    function injectButton() {
        setTimeout(() => {
            const torrTab = document.querySelector('.settings__body') || document.querySelector('.layer');
            if (!torrTab) return;

            if (document.querySelector('.my-ts-search-btn')) return;

            const btn = Lampa.Template.js('button', {
                name: Lampa.Lang.translate('local_ts_search'),
                class: 'my-ts-search-btn full'
            });

            btn.css({'margin-top': '1em'});
            btn.on('hover:enter', scanNetwork);

            torrTab.append(btn);
            console.log('Кнопка поиска TorrServer добавлена');
        }, 500);
    }

    Lampa.Listener.follow('settings', (e) => {
        if (e.type === 'open' && (e.name === 'server' || e.name === 'torrserver')) {
            injectButton();
        }
    });

    // На всякий случай
    if (window.appready) injectButton();
    else Lampa.Listener.follow('app', (e) => { if (e.type === 'ready') injectButton(); });
})();
