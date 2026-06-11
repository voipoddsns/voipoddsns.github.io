(function () {
    'use strict';

    var PLUGIN_NAME = 'TorrServer Auto Discovery';

    function log() {
        console.log.apply(console, ['[' + PLUGIN_NAME + ']'].concat([].slice.call(arguments)));
    }

    function notify(text) {
        if (window.Lampa && Lampa.Noty) {
            Lampa.Noty.show(text);
        }
        log(text);
    }

    async function checkUrl(url) {
        try {
            const controller = new AbortController();

            const timer = setTimeout(function () {
                controller.abort();
            }, 1500);

            const response = await fetch(url, {
                method: 'GET',
                signal: controller.signal
            });

            clearTimeout(timer);

            if (!response.ok) return false;

            const text = await response.text();

            return (
                text.indexOf('CacheSize') !== -1 ||
                text.indexOf('Torrent') !== -1 ||
                text.indexOf('torrent') !== -1 ||
                text.indexOf('version') !== -1
            );
        }
        catch (e) {
            return false;
        }
    }

    async function checkServer(ip) {
        const urls = [
            'http://' + ip + ':8090/settings',
            'http://' + ip + ':8090/server/settings',
            'http://' + ip + ':8090/echo'
        ];

        for (const url of urls) {
            log('CHECK:', url);

            if (await checkUrl(url)) {
                log('FOUND:', ip);
                return true;
            }
        }

        return false;
    }

    async function scanSubnet(base) {
        notify('Сканирование: ' + base + '0/24');

        const batchSize = 30;

        for (let start = 1; start <= 254; start += batchSize) {

            const batch = [];

            for (
                let i = start;
                i < start + batchSize && i <= 254;
                i++
            ) {
                const ip = base + i;

                batch.push(
                    checkServer(ip).then(found => ({
                        ip: ip,
                        found: found
                    }))
                );
            }

            const results = await Promise.all(batch);

            const server = results.find(r => r.found);

            if (server) {
                return server.ip;
            }
        }

        return null;
    }

    async function findTorrServer() {
        notify('Поиск TorrServer...');

        const subnets = [
            '192.168.0.',
            '192.168.1.',
            '192.168.31.',
            '10.0.0.',
            '10.0.1.',
            '172.16.0.'
        ];

        for (const subnet of subnets) {

            const ip = await scanSubnet(subnet);

            if (ip) {

                const address = 'http://' + ip + ':8090';

                try {
                    Lampa.Storage.set('torrserver_url', address);
                    Lampa.Storage.set('torrserver_use_link', true);

                    if (Lampa.Settings && Lampa.Settings.update) {
                        Lampa.Settings.update();
                    }
                }
                catch (e) {
                    console.error(e);
                }

                notify('Найден TorrServer: ' + address);

                log('Saved address:', address);

                return;
            }
        }

        notify('TorrServer не найден');
    }

    function addSettingsButton() {
        if (!window.Lampa) return;

        try {
            Lampa.SettingsApi.addParam({
                component: 'server',
                param: {
                    name: 'torrserver_auto_find',
                    type: 'trigger'
                },
                field: {
                    name: 'Найти TorrServer в сети',
                    description: 'Автоматический поиск TorrServer'
                },
                onChange: function () {
                    notify('Запущен поиск TorrServer');
                    findTorrServer();
                }
            });

            log('Кнопка добавлена');
        }
        catch (e) {
            console.error(e);
        }
    }

    function startPlugin() {
        notify('TorrServer Discovery загружен');
        addSettingsButton();
    }

    if (window.appready) {
        startPlugin();
    }
    else {
        Lampa.Listener.follow('app', function (event) {
            if (event.type === 'ready') {
                startPlugin();
            }
        });
    }
})();
