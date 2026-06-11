// Поиск локального TorrServer — Специально для вкладки TorrServer
(function () {
    'use strict';

    console.log('%c🔍 Поиск TorrServer v5 (для вкладки TorrServer) загружен', 'color: lime; font-size: 15px');

    Lampa.Lang.add({
        ts_search: { ru: '🔍 Поиск локального TorrServer', en: '🔍 Search local TorrServer' },
        ts_searching: { ru: '🔎 Ищем TorrServer в локальной сети...', en: '🔎 Searching local network...' },
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
            '192.168.31.', '192.168.10.', '10.0.0.', 
            '10.0.1.', '172.16.', '172.20.', '172.25.'
        ];

        const checkIP = (ip) => {
            if (found) return;
            Lampa.Network.silent(`http://${ip}:${port}/echo`, (data) => {
                if (data && (data.echo || data.version || typeof data === 'string')) {
                    found = true;
                    const url = `http://${ip}:${port}`;
                    Lampa.Storage.set('torrserver_url', url);
                    Lampa.Noty.show(Lampa.Lang.translate('ts_found') + ' ' + url, {timeout: 8000});
                    setTimeout(() => Lampa.Settings.main && Lampa.Settings.main(), 1000);
                }
            }, () => {}, false, {timeout: 650});
        };

        // Запускаем сканирование
        prefixes.forEach(prefix => {
            for (let i = 1; i <= 254; i++) {
                if (found) break;
                checkIP(prefix + i);
            }
        });

        setTimeout(() => {
            Lampa.Loading.stop();
            if (!found) {
                Lampa.Noty.show(Lampa.Lang.translate('ts_notfound'));
            }
        }, 13000);
    }

    function createButton() {
        if (document.querySelector('.ts-search-btn')) return;

        const btn = document.createElement('div');
        btn.className = 'ts-search-btn button full';
        btn.style.cssText = `
            margin: 15px 10px; 
            padding: 15px; 
            font-size: 17px; 
            text-align: center; 
            background: #0078ff; 
            color: white; 
            border-radius: 6px;
        `;
        btn.innerHTML = Lampa.Lang.translate('ts_search');

        btn.onclick = () => scan();
        btn.ontouchend = () => scan();

        // Ищем именно вкладку TorrServer
        const torrserverTab = document.querySelector('.settings__body') || 
                             document.querySelector('.layer__body');

        if (torrserverTab) {
            torrserverTab.appendChild(btn);
            console.log('✅ Кнопка добавлена во вкладку TorrServer');
        }
    }

    // Следим только за вкладкой TorrServer
    Lampa.Listener.follow('settings', (e) => {
        if (e.type === 'open' && (e.name === 'torrserver' || e.name === 'server' || e.name.includes('torr'))) {
            setTimeout(createButton, 400);
            setTimeout(createButton, 900);
        }
    });

    // Дополнительно
    if (window.appready) {
        setTimeout(createButton, 1500);
    } else {
        Lampa.Listener.follow('app', (e) => {
            if (e.type === 'ready') setTimeout(createButton, 2000);
        });
    }
})();
