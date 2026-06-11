// Checker for TorrServer by @vlados
(function() {
    'use strict';

    if (window.checker_ts) return;
    window.checker_ts = true;

    Lampa.Lang.add({
        ts_checker: {
            ru: '🔍 Поиск локального TorrServer',
            uk: '🔍 Пошук локального TorrServer',
            en: '🔍 Search local TorrServer'
        },
        ts_checker_search: {
            ru: 'Идёт поиск TorrServer...',
            uk: 'Йде пошук TorrServer...',
            en: 'Searching for TorrServer...'
        },
        ts_checker_found: {
            ru: '✅ TorrServer найден:',
            uk: '✅ TorrServer знайдено:',
            en: '✅ TorrServer found:'
        },
        ts_checker_notfound: {
            ru: '❌ TorrServer не найден в сети',
            uk: '❌ TorrServer не знайдено в мережі',
            en: '❌ TorrServer not found'
        }
    });

    function startScan() {
        Lampa.Loading.start();
        Lampa.Noty.show(Lampa.Lang.translate('ts_checker_search'));

        var port = 8090;
        var found = false;
        var ranges = ['10.116.200.', '192.168.1.', '192.168.0.', '192.168.88.', '10.0.0.', '10.0.1.'];

        function check(ip) {
            if (found) return;
            Lampa.Network.silent('http://' + ip + ':' + port + '/echo', function(data) {
                if (data && (data.echo || data.version)) {
                    found = true;
                    var url = 'http://' + ip + ':' + port;
                    Lampa.Storage.set('torrserver_url', url);
                    Lampa.Noty.show(Lampa.Lang.translate('ts_checker_found') + ' ' + url, {timeout: 8000});
                    setTimeout(function(){ Lampa.Settings.main(); }, 1200);
                }
            }, null, false, {timeout: 600});
        }

        ranges.forEach(function(base) {
            for (var i = 1; i <= 254; i++) {
                if (found) break;
                check(base + i);
            }
        });

        setTimeout(function() {
            Lampa.Loading.stop();
            if (!found) Lampa.Noty.show(Lampa.Lang.translate('ts_checker_notfound'));
        }, 12000);
    }

    // Добавление кнопки
    Lampa.Listener.follow('settings', function(e) {
        if (e.type == 'open' && (e.name == 'server' || e.name == 'torrserver')) {
            setTimeout(function() {
                if ($('.ts-checker-btn').length) return;

                var btn = Lampa.Template.js('button', {
                    name: Lampa.Lang.translate('ts_checker'),
                    class: 'ts-checker-btn full'
                });

                btn.on('hover:enter', startScan);
                $('.settings__body').append(btn);
            }, 400);
        }
    });

    console.log('%c[Checker] TorrServer Search Plugin loaded', 'color: #00ff00');
})();
