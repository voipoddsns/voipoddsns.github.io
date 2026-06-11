(function () {
    'use strict';

    Lampa.Lang.add({
        local_ts_search: { ru: '🔍 Поиск локального TorrServer', en: 'Search local TorrServer' },
        local_ts_searching: { ru: 'Ищем TorrServer в сети...', en: 'Searching for TorrServer...' },
        local_ts_found: { ru: '✅ Найден TorrServer:', en: '✅ TorrServer found:' },
        local_ts_not_found: { ru: '❌ TorrServer не найден', en: '❌ TorrServer not found' },
        local_ts_start: { ru: 'Начать поиск', en: 'Start search' }
    });

    function scanNetwork() {
        Lampa.Loading.start();
        Lampa.Noty.show(Lampa.Lang.translate('local_ts_searching'));

        const port = 8090;
        let found = false;
        const base = getBaseIP();

        const checkIP = (ip) => {
            return new Promise(resolve => {
                Lampa.Network.silent(`http://${ip}:${port}/echo`, 
                    (response) => {
                        if (response && (response.echo || response.version || typeof response === 'string')) {
                            found = true;
                            const url = `http://${ip}:${port}`;
                            Lampa.Storage.set('torrserver_url', url);
                            Lampa.Noty.show(Lampa.Lang.translate('local_ts_found') + ' ' + url, { timeout: 6000 });
                            resolve(true);
                        } else {
                            resolve(false);
                        }
                    },
                    () => resolve(false),
                    false, { timeout: 600 }
                );
            });
        };

        // Проверяем самые частые подсети
        const ranges = [
            base,
            '10.116.200.',
            '192.168.1.',
            '192.168.0.',
            '192.168.88.',
            '10.0.0.',
            '10.0.1.'
        ];

        let promises = [];
        ranges.forEach(prefix => {
            for (let i = 1; i <= 254; i++) {
                if (found) break;
                promises.push(checkIP(prefix + i));
            }
        });

        Promise.all(promises.slice(0, 400)).then(() => {  // лимит чтобы не висело вечно
            Lampa.Loading.stop();
            if (!found) {
                Lampa.Noty.show(Lampa.Lang.translate('local_ts_not_found'));
            } else {
                // Переоткрываем настройки TorrServer
                setTimeout(() => Lampa.Settings.main(), 800);
            }
        });
    }

    function getBaseIP() {
        try {
            const host = window.location.hostname;
            if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
                return host.replace(/\.\d+$/, '.') ;
            }
        } catch(e) {}
        return '192.168.1.';
    }

    // Добавляем кнопку в главное меню настроек
    function addButton() {
        if (document.querySelector('.local-ts-btn')) return;

        const btn = Lampa.Template.js('button', {
            name: Lampa.Lang.translate('local_ts_search'),
            class: 'local-ts-btn'
        });

        btn.on('hover:enter', scanNetwork);

        // Вставляем в раздел "TorrServer" или в основные настройки
        Lampa.Listener.follow('settings', function(e) {
            if (e.type === 'open' && e.name === 'server') {
                setTimeout(() => {
                    const tab = document.querySelector('.settings__body');
                    if (tab) tab.append(btn);
                }, 300);
            }
        });
    }

    // Запуск
    if (window.appready) {
        addButton();
    } else {
        Lampa.Listener.follow('app', (e) => {
            if (e.type === 'ready') addButton();
        });
    }

    console.log('✅ Плагин "Поиск локального TorrServer" загружен');
})();
