(function () {
    'use strict';

    // 1. Инициализация unic_id
    let unicId = Lampa.Storage.get('lampac_unic_id', '');

    if (!unicId) {
        unicId = Lampa.Utils.uid(8).toLowerCase();
        Lampa.Storage.set('lampac_unic_id', unicId);
    }

    // 2. Основной TorrServer
    Lampa.Storage.set('torrserver_url', 'https://ts.maxvol.pro');

    // 3. Резервный TorrServer
    Lampa.Storage.set('torrserver_url_two', '192.168.1.17:8090');

    // 4. Авторизация
    Lampa.Storage.set('torrserver_auth', 'false');

    // 5. Логин
    const accountEmail = Lampa.Storage.get('account_email');
    const existingUnicId = Lampa.Storage.get('lampac_unic_id', '');

    const login = accountEmail || existingUnicId || 'ts';
    Lampa.Storage.set('torrserver_login', login);

    // 6. Пароль
    Lampa.Storage.set('torrserver_password', 'ts');

})();
