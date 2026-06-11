// Поиск TorrServer — Максимально агрессивная версия
(function () {
    'use strict';

    console.log('%c🔍 Агрессивный поиск TorrServer v4 загружен', 'color: red; font-size: 15px');

    Lampa.Lang.add({
        ts_search: { ru: '🔍 Поиск локального TorrServer', en: '🔍 Search local TorrServer' },
        ts_searching: { ru: '🔎 Ищем TorrServer...', en: '🔎 Searching...' },
        ts_found: { ru: '✅ Найден:', en: '✅ Found:' },
        ts_notfound: { ru: '❌ Не найден', en: '❌ Not found' }
    });

    function scan() {
        Lampa.Loading.start();
        Lampa.Noty.show(Lampa.Lang.translate('ts_searching'));

        const port = 8090;
        let found = false;
        const prefixes = ['10.116.200.', '192.168.1.', '192.168.0.', '192.168.88.', '192.168.31.', '10.0.0.', '10.0.1.', '172.16.'];

        const checkIP = (ip) => {
            if (found) return;
            Lampa.Network.silent(`http://${ip}:${port}/echo`, (data) => {
                if (data && (data.echo || data.version || typeof data === 'string')) {
                    found = true;
                    const url = `http://${ip}:${port}`;
                    Lampa.Storage.set('torrserver_url', url);
                    Lampa.Noty.show(Lampa.Lang.translate('ts_found') + ' ' + url, {timeout: 8000});
                    setTimeout(() => Lampa.Settings.main && Lampa.Settings.main(), 800);
                }
            }, () => {}, false, {timeout: 700});
        };

        prefixes.forEach(p => {
            for (let i = 1; i <= 254; i++) {
                if (found) break;
                checkIP(p + i);
            }
        });

        setTimeout(() => {
            Lampa.Loading.stop();
            if (!found) Lampa.Noty.show(Lampa.Lang.translate('ts_notfound'));
        }, 12000);
    }

    function createButton() {
        if (document.querySelector('.ultra-ts-btn')) return;

        const btn = document.createElement('div');
        btn.className = 'ultra-ts-btn button full';
        btn.style.cssText = `
            margin: 20px 10px; 
            padding: 16px; 
            font-size: 17px; 
            text-align: center; 
            background: #0066ff; 
            color: white; 
            border-radius: 8px;
        `;
        btn.innerHTML = Lampa.Lang.translate('ts_search');

        btn.onclick = scan;
        btn.ontouchend = scan;

        // Пытаемся вставить во все возможные места
        const places = [
            '.settings__body',
            '.layer__body',
            '.content',
            '.settings-main',
            '.body'
        ];

        for (let selector of places) {
            const container = document.querySelector(selector);
            if (container) {
                container.appendChild(btn);
                console.log('✅ Кнопка вставлена в:', selector);
                return;
            }
        }

        // Если ничего не нашли — вставляем в body
        document.body.appendChild(btn);
        console.log('Кнопка вставлена в body');
    }

    // Очень агрессивный наблюдатель
    function startObserver() {
        createButton(); // сразу

        setInterval(() => {
            if (!document.querySelector('.ultra-ts-btn')) {
                createButton();
            }
        }, 800);

        Lampa.Listener.follow('settings', (e) => {
            if (e.type === 'open') {
                setTimeout(createButton, 300);
                setTimeout(createButton, 800);
            }
        });
    }

    if (window.appready) {
        startObserver();
    } else {
        Lampa.Listener.follow('app', (e) => {
            if (e.type === 'ready') startObserver();
        });
    }
})();
