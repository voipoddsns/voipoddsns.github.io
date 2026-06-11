// Поиск локального TorrServer — версия без Template
(function () {
    'use strict';

    console.log('%c🔍 Поиск TorrServer v3 (без Template) загружен', 'color: lime; font-weight: bold');

    Lampa.Lang.add({
        ts_search: { ru: '🔍 Поиск локального TorrServer', en: '🔍 Search local TorrServer' },
        ts_searching: { ru: '🔎 Ищем в сети...', en: '🔎 Searching...' },
        ts_found: { ru: '✅ Найден TorrServer:', en: '✅ Found:' },
        ts_notfound: { ru: '❌ TorrServer не найден', en: '❌ Not found' }
    });

    function scan() {
        Lampa.Loading.start();
        Lampa.Noty.show(Lampa.Lang.translate('ts_searching'));

        const port = 8090;
        let found = false;
        const prefixes = ['192.168.1.', '192.168.0.', '192.168.88.', '192.168.31.', '10.0.0.', '10.0.1.', '172.16.'];

        const checkIP = (ip) => {
            if (found) return;
            Lampa.Network.silent(`http://${ip}:${port}/echo`, (data) => {
                if (data && (data.echo || data.version || typeof data === 'string')) {
                    found = true;
                    const url = `http://${ip}:${port}`;
                    Lampa.Storage.set('torrserver_url', url);
                    Lampa.Noty.show(Lampa.Lang.translate('ts_found') + ' ' + url, {timeout: 8000});
                    setTimeout(() => { if (Lampa.Settings) Lampa.Settings.main(); }, 1000);
                }
            }, () => {}, false, { timeout: 600 });
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
        }, 11000);
    }

    // Создаём кнопку вручную (без Template)
    function createButton() {
        if (document.querySelector('.my-ts-search-btn')) return;

        const btn = document.createElement('div');
        btn.className = 'my-ts-search-btn button full';
        btn.style.cssText = 'margin: 15px 0; padding: 14px 20px; font-size: 16px; text-align: center;';
        btn.innerHTML = `<span>${Lampa.Lang.translate('ts_search')}</span>`;

        // Стили под Lampa
        btn.addEventListener('click', () => scan());
        btn.addEventListener('touchend', () => scan()); // для тачскринов

        // Вставляем в настройки
        const container = document.querySelector('.settings__body') || 
                         document.querySelector('.layer__body') || 
                         document.querySelector('.content');
        
        if (container) {
            container.appendChild(btn);
            console.log('✅ Кнопка успешно добавлена');
        }
    }

    // Следим за открытием настроек
    Lampa.Listener.follow('settings', (e) => {
        if (e.type === 'open' && (e.name === 'server' || e.name === 'torrserver' || e.name === 'main')) {
            setTimeout(createButton, 500);
        }
    });

    // Запуск при старте
    if (window.appready) {
        setTimeout(createButton, 1000);
    } else {
        Lampa.Listener.follow('app', (e) => {
            if (e.type === 'ready') setTimeout(createButton, 1500);
        });
    }
})();
