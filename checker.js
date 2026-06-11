(function () {
    'use strict';

    if (window.local_torrserver_search) return;
    window.local_torrserver_search = true;

    Lampa.Lang.add({
        local_ts_search: {
            ru: 'Поиск локального TorrServer',
            en: 'Search local TorrServer',
            uk: 'Пошук локального TorrServer'
        },
        local_ts_searching: {
            ru: 'Идёт поиск в локальной сети...',
            en: 'Searching in local network...',
            uk: 'Пошук у локальній мережі...'
        },
        local_ts_found: {
            ru: 'Найден TorrServer: ',
            en: 'TorrServer found: ',
            uk: 'Знайдено TorrServer: '
        },
        local_ts_not_found: {
            ru: 'TorrServer не найден в локальной сети',
            en: 'TorrServer not found in local network',
            uk: 'TorrServer не знайдено в локальній мережі'
        }
    });

    function scanNetwork() {
        Lampa.Loading.start();
        Lampa.Noty.show(Lampa.Lang.translate('local_ts_searching'));

        const baseIp = getLocalBaseIP();
        const promises = [];
        const port = 8090;

        // Сканируем типичный диапазон (обычно 192.168.0.x или 192.168.1.x)
        for (let i = 1; i <= 254; i++) {
            const ip = `${baseIp}${i}`;
            const url = `http://${ip}:${port}/echo`;

            promises.push(
                new Promise((resolve) => {
                    Lampa.Network.silent(url, 
                        (data) => {
                            if (data && (data.echo || data.version || typeof data === 'string')) {
                                resolve(ip);
                            } else {
                                resolve(null);
                            }
                        },
                        () => resolve(null),
                        false, { timeout: 800 }
                    );
                })
            );
        }

        Promise.all(promises).then(results => {
            Lampa.Loading.stop();
            const found = results.find(ip => ip !== null);

            if (found) {
                const fullUrl = `http://${found}:${port}`;
                Lampa.Storage.set('torrserver_url', fullUrl);
                Lampa.Noty.show(Lampa.Lang.translate('local_ts_found') + fullUrl, { timeout: 5000 });
                
                // Перезагружаем настройки TorrServer
                if (Lampa.Settings && Lampa.Settings.main) {
                    Lampa.Settings.main();
                }
            } else {
                Lampa.Noty.show(Lampa.Lang.translate('local_ts_not_found'));
            }
        });
    }

    function getLocalBaseIP() {
        // Простой способ получить базовый IP (работает в большинстве случаев)
        const current = window.location.hostname;
        if (current.match(/^\d+\.\d+\.\d+\.\d+$/)) {
            return current.replace(/\.\d+$/, '.');
        }
        return '10.116.200.'; // fallback
    }

    function addToSettings() {
        Lampa.SettingsApi.addComponent({
            component: 'local_torrserver_search',
            name: Lampa.Lang.translate('local_ts_search'),
            icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>',
            onCreate: function (tab) {
                const button = Lampa.Template.js('button', {
                    name: Lampa.Lang.translate('local_ts_search'),
                    class: 'full'
                });

                button.on('hover:enter', scanNetwork);
                tab.append(button);
            }
        });
    }

    if (window.appready) {
        addToSettings();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') addToSettings();
        });
    }
})();
