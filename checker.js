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

    async function checkServer(ip) {
        var url = 'http://' + ip + ':8090/settings';

        try {
            const controller = new AbortController();

            setTimeout(function () {
                controller.abort();
            }, 1000);

            const response = await fetch(url, {
                method: 'GET',
                signal: controller.signal
            });

            if (!response.ok) return false;

            const text = await response.text();

            if (
                text.indexOf('CacheSize') !== -1 ||
                text.indexOf('Torrent') !== -1
            ) {
                return true;
            }

            return false;
        }
        catch (e) {
            return false;
        }
    }

    async function scanSubnet(base) {
        notify('Сканирование: ' + base + '0/24');

        for (let i = 1; i <= 254; i++) {
            let ip = base + i;

            let found = await checkServer(ip);

            if (found) {
                return ip;
            }
        }

        return null;
    }

    async function findTorrServer() {
        notify('Поиск TorrServer...');

        const subnets = [
            '192.168.1.',
            '10.116.200.',
            '10.0.0.',
            '10.0.1.'
        ];

        for (let subnet of subnets) {
            let result = await scanSubnet(subnet);

            if (result) {
                let address = 'http://' + result + ':8090';

                try {
                    Lampa.Storage.set('torrserver_url', address);
                    Lampa.Storage.set('torrserver_use_link', true);
                }
                catch (e) {}

                notify('Найден TorrServer: ' + result);

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
                    findTorrServer();
                }
            });
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
