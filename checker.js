(function () {
    'use strict';

    var PLUGIN_NAME = 'TorrServer Auto Discovery';

    console.log('=== TORRSERVER DISCOVERY LOADED ===');

    function log() {
        console.log.apply(
            console,
            ['[' + PLUGIN_NAME + ']'].concat([].slice.call(arguments))
        );
    }

    function notify(text) {
        try {
            if (window.Lampa && Lampa.Noty) {
                Lampa.Noty.show(text);
            }
        } catch (e) {}

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

            const found = await checkUrl(url);

            if (found) {
                log('FOUND:', ip);
                return true;
            }
        }

        return false;
    }

    async function scanSubnet(base) {

        notify('Сканирование: ' + base + '0/24');

        const batchSize = 20;

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
            '10.116.200.',
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

                    log('Saved:', address);

                    console.log(
                        'torrserver_url =',
                        Lampa.Storage.get('torrserver_url')
                    );
                }
                catch (e) {
                    console.error(e);
                }

                notify('Найден TorrServer: ' + address);

                return;
            }
        }

        notify('TorrServer не найден');
    }

    function addSettingsButton() {

        if (!window.Lampa || !Lampa.SettingsApi) {
            return;
        }

        try {

            Lampa.SettingsApi.addParam({
                component: 'more',
                param: {
                    name: 'torrserver_auto_find',
                    type: 'button'
                },
                field: {
                    name: 'Найти TorrServer',
                    description: 'Автоматический поиск TorrServer в сети'
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

        console.log('=== START PLUGIN ===');

        notify('TorrServer Discovery загружен');

        addSettingsButton();

        setTimeout(function () {

            notify('Автозапуск поиска TorrServer');

            findTorrServer();

        }, 5000);
    }

    setTimeout(function () {

        if (window.Lampa) {
            startPlugin();
        }
        else {
            console.error('Lampa not found');
        }

    }, 3000);

})();
