// Улучшенный Поиск TorrServer v2
(function () {
    'use strict';

    console.log('%c🔍 Улучшенный поиск TorrServer загружен', 'color: lime; font-size: 14px');

    Lampa.Lang.add({
        ts_search: { ru: '🔍 Поиск локального TorrServer', en: '🔍 Search local TorrServer' },
        ts_searching: { ru: '🔎 Ищем TorrServer в сети...', en: '🔎 Searching...' },
        ts_found: { ru: '✅ Найден TorrServer:', en: '✅ Found:' },
        ts_notfound: { ru: '❌ TorrServer не найден', en: '❌ Not found' }
    });

    function scan() {
        Lampa.Loading.start();
        Lampa.Noty.show(Lampa.Lang.translate('ts_searching'));

        const port = 8090;
        let found = false;
        const prefixes = [
            '192.168.1.', '192.168.0.', '192.168.88.', 
            '192.168.31.', '10.0.0.', '10.0.1.', '172.16.'
        ];

        const checkIP = (ip) => {
            if (found) return;
            Lampa.Network.silent(`http://${ip}:${port}/echo`, (data) => {
                if (data && (data.echo || data.version || typeof data === 'string')) {
                    found = true;
                    const url = `http://${ip}:${port}`;
                    Lampa.Storage.set('torrserver_url', url);
                    Lampa.Noty.show(Lampa.Lang.translate('ts_found') + ' ' + url, {timeout: 8000});
                    setTimeout(() => Lampa.Settings.main(), 1000);
                }
            }, () => {}, false, {timeout: 500});
        };

        prefixes.forEach(prefix => {
            for (let i = 1; i <= 254; i++) {
                if (found) break;
                checkIP(prefix + i);
            }
        });

        setTimeout(() => {
            Lampa.Loading.stop();
            if (!found) Lampa.Noty.show(Lampa.Lang.translate('ts_notfound'));
        }, 10000);
    }

    // Жёсткая вставка кнопки
    function addBtn() {
        setTimeout(() => {
            if ($('.my-ts-search-btn').length > 0) return;

            const btn = Lampa.Template.js('button', {
                name: Lampa.Lang.translate('ts_search'),
                class: 'my-ts-search-btn full'
            });

            btn.on('hover:enter', scan);
            $('.settings__body, .layer__body').append(btn);
            console.log('Кнопка поиска добавлена');
        }, 600);
    }

    Lampa.Listener.follow('settings', (e) => {
        if (e.type === 'open' && ['server', 'torrserver', 'main'].includes(e.name)) {
            addBtn();
        }
    });

    // Дополнительный запуск
    if (window.appready) addBtn();
    else Lampa.Listener.follow('app', (e) => {
        if (e.type === 'ready') addBtn();
    });
})();
