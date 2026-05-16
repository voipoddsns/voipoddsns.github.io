(function () {
    'use strict';


    if (typeof fetch === 'undefined') {
        window.fetch = function (url) {
            return new Promise(function (resolve, reject) {
                var xhr = new XMLHttpRequest();
                xhr.open('GET', url, true);
                xhr.onreadystatechange = function () {
                    if (xhr.readyState === 4) {
                        if (xhr.status >= 200 && xhr.status < 300) {
                            var response = {
                                ok: true,
                                status: xhr.status,
                                statusText: xhr.statusText,
                                text: function () {
                                    return Promise.resolve(xhr.responseText);
                                },
                                json: function () {
                                    try {
                                        return Promise.resolve(JSON.parse(xhr.responseText));
                                    } catch (e) {
                                        return Promise.reject(e);
                                    }
                                }
                            };
                            resolve(response);
                        } else {
                            reject(new Error('HTTP error ' + xhr.status));
                        }
                    }
                };
                xhr.onerror = function () {
                    reject(new Error('Network error'));
                };
                xhr.send();
            });
        };
    }


    Lampa.Lang.add({
        mp_title: { ru: 'Мультиплагин', uk: 'Мультиплагін', en: 'Multiplugin' },
        mp_category_plugins: { ru: 'Категории плагинов', uk: 'Категорії плагінів', en: 'Plugin Categories' },
        mp_updated: { ru: 'Обновлено: ', uk: 'Оновлено: ', en: 'Updated: ' },
        mp_sync_plugins: { ru: 'Синхронизировать плагины', uk: 'Синхронізувати плагіни', en: 'Sync Plugins' },
        mp_load_online_only: { ru: 'Загрузить только онлайн', uk: 'Завантажити тільки онлайн', en: 'Load Online Only' },
        mp_management: { ru: 'Управление', uk: 'Керування', en: 'Management' },
        mp_current_plugins: { ru: 'Включённые плагины', uk: 'Увімкнені плагіни', en: 'Enabled Plugins' },
        mp_export_to_lampa: { ru: 'Экспорт включённых', uk: 'Експорт увімкнених', en: 'Export Enabled' },
        mp_export_select: { ru: 'Установка плагинов', uk: 'Встановлення плагінів', en: 'Install Plugins' },
        mp_installed_plugins: { ru: 'Установленные плагины', uk: 'Встановлені плагіни', en: 'Installed Plugins' },
        mp_no_installed_plugins: { ru: 'Нет установленных плагинов', uk: 'Немає встановлених плагінів', en: 'No installed plugins' },
        mp_plugin_removed: { ru: 'Плагин удалён', uk: 'Плагін видалено', en: 'Plugin removed' },
        mp_disable_all: { ru: 'Выключить все плагины', uk: 'Вимкнути всі плагіни', en: 'Disable All Plugins' },
        mp_reload_lampa: { ru: 'Перезагрузить Lampa', uk: 'Перезавантажити Lampa', en: 'Reload Lampa' },
        mp_update_info: { ru: 'Информация об обновлении', uk: 'Інформація про оновлення', en: 'Update Information' },
        mp_last_update: { ru: 'Последнее обновление: ', uk: 'Останнє оновлення: ', en: 'Last Update: ' },
        mp_added: { ru: 'Добавлено:', uk: 'Додано:', en: 'Added:' },
        mp_removed: { ru: 'Удалено:', uk: 'Видалено:', en: 'Removed:' },
        mp_no_changes: { ru: 'Новых изменений нет', uk: 'Нових змін немає', en: 'No new changes' },
        mp_no_plugins: { ru: 'Включённых плагинов нет', uk: 'Увімкнених плагінів немає', en: 'No enabled plugins' },
        mp_no_plugins_category: { ru: 'В категории "%s" нет плагинов', uk: 'У категорії "%s" немає плагінів', en: 'No plugins in category "%s"' },
        mp_plugin_enabled: { ru: '%s включён', uk: '%s увімкнено', en: '%s enabled' },
        mp_plugin_disabled: { ru: '%s отключён', uk: '%s вимкнено', en: '%s disabled' },
        mp_all_disabled: { ru: 'Все плагины отключены', uk: 'Всі плагіни вимкнено', en: 'All plugins disabled' },
        mp_sync_complete: { ru: 'Синхронизация завершена', uk: 'Синхронізація завершена', en: 'Sync completed' },
        mp_online_enabled: { ru: 'Онлайн-плагины включены', uk: 'Онлайн-плагіни увімкнено', en: 'Online plugins enabled' },
        mp_export_complete: { ru: 'Экспорт завершён', uk: 'Експорт завершено', en: 'Export completed' },
        mp_confirm_sync: { ru: 'Синхронизировать актуальные плагины с облака?', uk: 'Синхронізувати актуальні плагіни з хмари?', en: 'Sync latest plugins from cloud?' },
        mp_confirm_online: { ru: 'Загрузить и включить только плагины категории "Онлайн"?', uk: 'Завантажити та увімкнути тільки плагіни категорії "Онлайн"?', en: 'Load and enable only "Online" category plugins?' },
        mp_confirm_disable_all: { ru: 'Вы уверены? Все плагины будут отключены', uk: 'Ви впевнені? Усі плагіни будуть вимкнено', en: 'Are you sure? All plugins will be disabled' },
        mp_export_message: {
            ru: 'Включённые плагины будут добавлены в Lampa как обычные расширения.<br><br>После этого они:<br>• не будут зависеть от мультиплагина<br>• останутся даже после его удаления<br>• удаляются только вручную<br><br>После экспорта Lampa автоматически перезагрузится.',
            uk: 'Увімкнені плагіни будуть додані в Lampa як звичайні розширення.<br><br>Після цього вони:<br>• не залежатимуть від мультиплагіна<br>• залишаться навіть після його видалення<br>• видаляються тільки вручну<br><br>Після експорту Lampa автоматично перезавантажиться.',
            en: 'Enabled plugins will be added to Lampa as regular extensions.<br><br>After that they:<br>• will not depend on multiplugin<br>• will remain even after its removal<br>• can only be removed manually<br><br>Lampa will reload automatically after export.'
        },
        mp_reload_message: { ru: 'Перезапустить приложение?', uk: 'Перезавантажити додаток?', en: 'Restart application?' },
        mp_ok: { ru: 'OK', uk: 'OK', en: 'OK' },
        mp_cancel: { ru: 'Отмена', uk: 'Скасувати', en: 'Cancel' },
        mp_no_updates_found: { ru: 'Обновлений не найдено', uk: 'Оновлень не знайдено', en: 'No updates found' },
        mp_no_new_plugins: { ru: 'Новых плагинов не добавлено', uk: 'Нових плагінів не додано', en: 'No new plugins added' },
        mp_plugins_not_selected: { ru: 'Плагины не выбраны', uk: 'Плагіни не вибрано', en: 'No plugins selected' },
        pi_install: { ru: 'Установить', uk: 'Встановити', en: 'Install' },
        pi_remove: { ru: 'Удалить', uk: 'Видалити', en: 'Remove' },
        pi_cancel: { ru: 'Отмена', uk: 'Скасувати', en: 'Cancel' },
        pi_plugin_installed: { ru: 'Плагин установлен', uk: 'Плагін встановлено', en: 'Plugin installed' },
        pi_plugin_removed: { ru: 'Плагин удалён', uk: 'Плагін видалено', en: 'Plugin removed' }
    });


    var syncUrl = 'https://voipoddsns.github.io/sources/plugins_mp.json';
    var STORAGE_KEY = 'multi_plugins_list';
    var ENABLED_KEY = 'multi_enabled_plugins';
    var INFO_KEY = 'multi_last_update';
    var EXPORT_KEY = 'multi_export_selection';
    var INSTALLED_KEY = 'multi_installed_plugins';
    var SOURCE_KEY = 'multiplugin';
    var INSTALLED_COLOR = '#8bc34a';


    var pluginList = [];
    var loadedPlugins = [];
    var menuBuilt = false;


    function translateObj(obj) {
        if (!obj) return '';
        if (typeof obj === 'string') return obj;
        var lang = Lampa.Storage.get('language', 'ru');
        return obj[lang] || obj.ru || obj.en || '';
    }


    function lazyLoadPlugin(url) {
        var i;
        for (i = 0; i < loadedPlugins.length; i++) {
            if (loadedPlugins[i] === url) return;
        }
        Lampa.Utils.putScriptAsync([url], function () {
            loadedPlugins.push(url);
        });
    }


    function loadEnabledPluginsLazy() {
        var enabled = Lampa.Storage.get(ENABLED_KEY, []);
        var lazy = [];
        var i;


        for (i = 0; i < pluginList.length; i++) {
            var url = pluginList[i].url;


            if (
                enabled.indexOf(url) !== -1 &&
                loadedPlugins.indexOf(url) === -1 &&
                lazy.indexOf(url) === -1
            ) {
                lazy.push(url);
            }
        }


        if (!lazy.length) return;


        Lampa.Utils.putScriptAsync(lazy, function () {
            for (var j = 0; j < lazy.length; j++) {
                loadedPlugins.push(lazy[j]);
            }
        });
    }


    function exportPlugins(urls) {
        if (!urls || urls.length === 0) {
            Lampa.Noty.show(Lampa.Lang.translate('mp_plugins_not_selected'));
            return;
        }


        var installed = Lampa.Plugins.get() || [];
        var added = 0;
        var i;


        for (i = 0; i < urls.length; i++) {
            var url = urls[i];
            var plugin = null;
            var j;
            for (j = 0; j < pluginList.length; j++) {
                if (pluginList[j].url === url) {
                    plugin = pluginList[j];
                    break;
                }
            }
            if (!plugin) continue;
            var exists = false;
            for (j = 0; j < installed.length; j++) {
                if (installed[j].url === plugin.url) {
                    exists = true;
                    break;
                }
            }
            if (exists) continue;
            Lampa.Plugins.add({
                url: plugin.url,
                name: translateObj(plugin.name) || plugin.url.split('/').pop(),
                status: 1,
                source: SOURCE_KEY
            });


            addInstalledFromMulti(plugin.url);


            added++;
        }


        if (added > 0) {
            Lampa.Plugins.save();


            // снять галочки с экспортированных плагинов
            var enabled = Lampa.Storage.get(ENABLED_KEY, []);
            var newEnabled = [];
            var i;
            for (i = 0; i < enabled.length; i++) {
                if (urls.indexOf(enabled[i]) === -1) {
                    newEnabled.push(enabled[i]);
                }
            }
            Lampa.Storage.set(ENABLED_KEY, newEnabled);


            Lampa.Noty.show('Экспортировано: ' + added);
        } else {
            Lampa.Noty.show(Lampa.Lang.translate('mp_no_new_plugins'));
        }
    }


    function getCategories(list) {
        var cats = [];
        var i;
        for (i = 0; i < list.length; i++) {
            var cat = translateObj(list[i].category) || 'Разное';
            var found = false;
            var j;
            for (j = 0; j < cats.length; j++) {
                if (cats[j] === cat) {
                    found = true;
                    break;
                }
            }
            if (!found) cats.push(cat);
        }
        return cats;
    }


    function showExportCategories() {
        var categories = getCategories(pluginList);
        var items = [];
        var i;
        for (i = 0; i < categories.length; i++) {
            items.push({ title: categories[i], category: categories[i] });
        }
        Lampa.Select.show({
            title: 'Выбор категории для экспорта',
            items: items,
            onSelect: function (item) { showExportCategoryPlugins(item.category); },
            onBack: function () {
                var selected = Lampa.Storage.get(EXPORT_KEY, []);
                if (selected.length) exportPlugins(selected);
                Lampa.Storage.set(EXPORT_KEY, []);
                Lampa.Controller.toggle('settings_component');
            }
        });
    }


    function showExportCategoryPlugins(category) {
        var selected = Lampa.Storage.get(EXPORT_KEY, []);
        var plugins = [];
        var i;
        for (i = 0; i < pluginList.length; i++) {
            if (translateObj(pluginList[i].category) === category) {
                plugins.push(pluginList[i]);
            }
        }
        var items = [];
        for (i = 0; i < plugins.length; i++) {
            var p = plugins[i];
            var checked = false;
            var j;
            for (j = 0; j < selected.length; j++) {
                if (selected[j] === p.url) {
                    checked = true;
                    break;
                }
            }
            items.push({
                title: translateObj(p.name) || p.url.split('/').pop(),
                subtitle: translateObj(p.description) || '',
                checkbox: true,
                checked: checked,
                url: p.url
            });
        }
        Lampa.Select.show({
            title: category,
            items: items,
            onCheck: function (item) {
                var sel = Lampa.Storage.get(EXPORT_KEY, []);
                if (item.checked) {
                    var found = false;
                    var j;
                    for (j = 0; j < sel.length; j++) {
                        if (sel[j] === item.url) {
                            found = true;
                            break;
                        }
                    }
                    if (!found) sel.push(item.url);
                } else {
                    var newSel = [];
                    var j;
                    for (j = 0; j < sel.length; j++) {
                        if (sel[j] !== item.url) newSel.push(sel[j]);
                    }
                    sel = newSel;
                }
                Lampa.Storage.set(EXPORT_KEY, sel);
            },
            onBack: showExportCategories
        });
    }


    function exportSinglePlugin(url) {
        Lampa.Modal.open({
            title: 'Экспорт плагина',
            align: 'center',
            html: $('<div class="about">Экспортировать этот плагин в расширения Lampa?</div>'),
            buttons: [
                { name: 'Отмена', onSelect: function () { Lampa.Modal.close(); } },
                { name: 'Экспорт', onSelect: function () { exportPlugins([url]); Lampa.Modal.close(); } }
            ]
        });
    }


    function exportToLampa() {
        var enabledUrls = Lampa.Storage.get(ENABLED_KEY, []);
        exportPlugins(enabledUrls);
    }


    function confirmExportEnabled() {
        var prev = Lampa.Controller.enabled().name;
        Lampa.Modal.open({
            title: Lampa.Lang.translate('mp_export_to_lampa'),
            align: 'center',
            html: $('<div class="about">' + Lampa.Lang.translate('mp_export_message') + '</div>'),
            buttons: [
                { name: Lampa.Lang.translate('mp_cancel'), onSelect: function () { Lampa.Modal.close(); Lampa.Controller.toggle(prev); } },
                { name: 'Экспорт', onSelect: function () { Lampa.Modal.close(); exportToLampa(); Lampa.Controller.toggle(prev); } }
            ]
        });
    }


    function savePluginList(list) {
        Lampa.Storage.set(STORAGE_KEY, list);
        pluginList = list;
    }


    function getPluginList() {
        return Lampa.Storage.get(STORAGE_KEY, []);
    }


    function saveUpdateInfo(date, added, removed) {
        var info = { date: date || '—', added: added || [], removed: removed || [] };
        Lampa.Storage.set(INFO_KEY, info, true);
    }


    function getUpdateInfo() {
        return Lampa.Storage.get(INFO_KEY, { date: '—', added: [], removed: [] });
    }


    function showInfo() {
        var info = getUpdateInfo();
        if (info.added.length === 0 && info.removed.length === 0) {
            Lampa.Noty.show(Lampa.Lang.translate('mp_no_updates_found'));
            return;
        }
        var html = '<div class="about" style="text-align:left">';
        html += '<div><b>' + Lampa.Lang.translate('mp_last_update') + '</b> ' + info.date + '</div><br>';
        if (info.added.length) {
            html += '<b>' + Lampa.Lang.translate('mp_added') + '</b><br>';
            var i;
            for (i = 0; i < info.added.length; i++) {
                var p = info.added[i];
                var name = translateObj(p.name) || p.url.split('/').pop();
                html += '• <b>' + name + '</b><br>';
                if (p.description) html += '<div style="color:#bfbfbf; font-size:0.9em; margin-left:18px;">' + translateObj(p.description) + '</div>';
                html += '<br>';
            }
            html += '<br>';
        }
        if (info.removed.length) {
            html += '<b>' + Lampa.Lang.translate('mp_removed') + '</b><br>';
            var i;
            for (i = 0; i < info.removed.length; i++) {
                var p = info.removed[i];
                var name = translateObj(p.name) || p.url.split('/').pop();
                html += '• <b>' + name + '</b><br>';
                if (p.description) html += '<div style="color:#bfbfbf; font-size:0.9em; margin-left:18px;">' + translateObj(p.description) + '</div>';
                html += '<br>';
            }
            html += '<br>';
        }
        html += '</div>';
        var prev = Lampa.Controller.enabled().name;
        Lampa.Modal.open({
            title: Lampa.Lang.translate('mp_update_info'),
            align: 'center',
            html: $(html),
            buttons: [{ name: Lampa.Lang.translate('mp_ok'), onSelect: function () { Lampa.Modal.close(); Lampa.Controller.toggle(prev); } }]
        });
    }


    function showCategory(category) {
        var plugins = [];
        var i;
        for (i = 0; i < pluginList.length; i++) {
            if (translateObj(pluginList[i].category) === category) {
                plugins.push(pluginList[i]);
            }
        }
        if (plugins.length === 0) {
            Lampa.Noty.show(Lampa.Lang.translate('mp_no_plugins_category').replace('%s', category));
            return;
        }
        var enabled = Lampa.Storage.get(ENABLED_KEY, []);
        var items = [];
        for (i = 0; i < plugins.length; i++) {
            var p = plugins[i];
            var checked = false;
            var j;
            for (j = 0; j < enabled.length; j++) {
                if (enabled[j] === p.url) {
                    checked = true;
                    break;
                }
            }
            items.push({
                title: translateObj(p.name) || p.url.split('/').pop(),
                subtitle: translateObj(p.description) || '',
                checkbox: true,
                checked: checked,
                url: p.url,
                onContext: function () { exportSinglePlugin(p.url); }
            });
        }
        Lampa.Select.show({
            title: category,
            items: items,
            onCheck: function (item) {
                var enabledSet = Lampa.Storage.get(ENABLED_KEY, []);
                if (item.checked) {
                    var found = false;
                    var j;
                    for (j = 0; j < enabledSet.length; j++) {
                        if (enabledSet[j] === item.url) {
                            found = true;
                            break;
                        }
                    }
                    if (!found) enabledSet.push(item.url);
                    lazyLoadPlugin(item.url);
                    Lampa.Noty.show(Lampa.Lang.translate('mp_plugin_enabled').replace('%s', item.title));
                } else {
                    var newSet = [];
                    var j;
                    for (j = 0; j < enabledSet.length; j++) {
                        if (enabledSet[j] !== item.url) newSet.push(enabledSet[j]);
                    }
                    enabledSet = newSet;
                    Lampa.Noty.show(Lampa.Lang.translate('mp_plugin_disabled').replace('%s', item.title));
                }
                Lampa.Storage.set(ENABLED_KEY, enabledSet);
            },
            onBack: function () { Lampa.Controller.toggle('settings_component'); }
        });
    }


    function showEnabledPlugins() {
        var enabled = Lampa.Storage.get(ENABLED_KEY, []);
        var active = [];
        var seen = {};
        var i;


        for (i = 0; i < pluginList.length; i++) {
            var p = pluginList[i];


            if (seen[p.url]) continue;


            var found = false;
            var j;
            for (j = 0; j < enabled.length; j++) {
                if (enabled[j] === p.url) {
                    found = true;
                    break;
                }
            }


            if (found) {
                active.push(p);
                seen[p.url] = true;
            }
        }


        if (active.length === 0) {
            Lampa.Noty.show(Lampa.Lang.translate('mp_no_plugins'));
            return;
        }


        var items = [];
        for (i = 0; i < active.length; i++) {
            var p = active[i];
            items.push({
                title: translateObj(p.name) || p.url.split('/').pop(),
                subtitle: translateObj(p.description) || '',
                checkbox: true,
                checked: true,
                url: p.url
            });
        }


        Lampa.Select.show({
            title: Lampa.Lang.translate('mp_current_plugins'),
            items: items,
            onCheck: function (item) {
                if (!item.checked) {
                    var enabledSet = Lampa.Storage.get(ENABLED_KEY, []);
                    var newSet = [];
                    var j;
                    for (j = 0; j < enabledSet.length; j++) {
                        if (enabledSet[j] !== item.url) newSet.push(enabledSet[j]);
                    }
                    Lampa.Storage.set(ENABLED_KEY, newSet);
                    Lampa.Noty.show(Lampa.Lang.translate('mp_plugin_disabled').replace('%s', item.title));
                }
            },
            onBack: function () { Lampa.Controller.toggle('settings_component'); }
        });
    }


    function disableAllPlugins() {
        var prev = Lampa.Controller.enabled().name;
        Lampa.Modal.open({
            title: Lampa.Lang.translate('mp_disable_all'),
            align: 'center',
            html: $('<div class="about">' + Lampa.Lang.translate('mp_confirm_disable_all') + '</div>'),
            buttons: [
                { name: Lampa.Lang.translate('mp_cancel'), onSelect: function () { Lampa.Modal.close(); Lampa.Controller.toggle(prev); } },
                { name: Lampa.Lang.translate('mp_ok'), onSelect: function () { Lampa.Storage.set(ENABLED_KEY, []); Lampa.Noty.show(Lampa.Lang.translate('mp_all_disabled')); Lampa.Modal.close(); Lampa.Controller.toggle(prev); } }
            ]
        });
    }


    function confirmAndSync() {
        var prev = Lampa.Controller.enabled().name;
        Lampa.Modal.open({
            title: Lampa.Lang.translate('mp_sync_plugins'),
            align: 'center',
            html: $('<div class="about">' + Lampa.Lang.translate('mp_confirm_sync') + '</div>'),
            buttons: [
                { name: Lampa.Lang.translate('mp_cancel'), onSelect: function () { Lampa.Modal.close(); Lampa.Controller.toggle(prev); } },
                { name: Lampa.Lang.translate('mp_ok'), onSelect: function () { Lampa.Modal.close(); synchronize(function () { Lampa.Controller.toggle(prev); }); } }
            ]
        });
    }


    function confirmAndLoadOnline() {
        var prev = Lampa.Controller.enabled().name;
        Lampa.Modal.open({
            title: Lampa.Lang.translate('mp_load_online_only'),
            align: 'center',
            html: $('<div class="about">' + Lampa.Lang.translate('mp_confirm_online') + '</div>'),
            buttons: [
                { name: Lampa.Lang.translate('mp_cancel'), onSelect: function () { Lampa.Modal.close(); Lampa.Controller.toggle(prev); } },
                { name: Lampa.Lang.translate('mp_ok'), onSelect: function () { Lampa.Modal.close(); loadOnlyOnline(function () { Lampa.Controller.toggle(prev); }); } }
            ]
        });
    }


    function loadOnlyOnline(callback) {
        Lampa.Loading.start();
        fetch(syncUrl, { cache: 'no-cache' })
            .then(function (response) { return response.json(); })
            .then(function (data) {
                try {
                    if (!Array.isArray(data.plugins)) throw new Error('Invalid data');
                    var newList = [];
                    var i;
                    for (i = 0; i < data.plugins.length; i++) {
                        var item = data.plugins[i];
                        newList.push({
                            url: item.url,
                            name: item.name,
                            description: item.description,
                            category: item.category
                        });
                    }
                    savePluginList(newList);
                    var enabledSet = Lampa.Storage.get(ENABLED_KEY, []);
                    var j;
                    for (i = 0; i < newList.length; i++) {
                        var p = newList[i];
                        if (translateObj(p.category) === 'Онлайн' || translateObj(p.category) === 'Online') {
                            var found = false;
                            for (j = 0; j < enabledSet.length; j++) {
                                if (enabledSet[j] === p.url) {
                                    found = true;
                                    break;
                                }
                            }
                            if (!found) enabledSet.push(p.url);
                            lazyLoadPlugin(p.url);
                        }
                    }
                    Lampa.Storage.set(ENABLED_KEY, enabledSet);
                    Lampa.Noty.show(Lampa.Lang.translate('mp_online_enabled'));
                } catch (e) {
                    console.error('Load online error:', e);
                }
            })
            .catch(function () { Lampa.Noty.show('Ошибка загрузки'); })
            .finally(function () { Lampa.Loading.stop(); if (callback) callback(); });
    }


    function synchronize(callback) {
        Lampa.Loading.start();
        fetch(syncUrl, { cache: 'no-cache' })
            .then(function (response) { return response.json(); })
            .then(function (data) {
                try {
                    if (!Array.isArray(data.plugins)) throw new Error('Invalid data');
                    var remoteDate = data.updateDate || '—';
                    var newList = [];
                    var i;
                    for (i = 0; i < data.plugins.length; i++) {
                        var item = data.plugins[i];
                        newList.push({
                            url: item.url,
                            name: item.name,
                            description: item.description,
                            category: item.category
                        });
                    }
                    var prevList = getPluginList();
                    var prevUrls = [];
                    for (i = 0; i < prevList.length; i++) {
                        prevUrls.push(prevList[i].url);
                    }
                    var newUrls = [];
                    for (i = 0; i < newList.length; i++) {
                        newUrls.push(newList[i].url);
                    }
                    var added = [];
                    for (i = 0; i < newList.length; i++) {
                        var found = false;
                        var j;
                        for (j = 0; j < prevUrls.length; j++) {
                            if (prevUrls[j] === newList[i].url) {
                                found = true;
                                break;
                            }
                        }
                        if (!found) added.push(newList[i]);
                    }
                    var removed = [];
                    for (i = 0; i < prevList.length; i++) {
                        var found = false;
                        var j;
                        for (j = 0; j < newUrls.length; j++) {
                            if (newUrls[j] === prevList[i].url) {
                                found = true;
                                break;
                            }
                        }
                        if (!found) removed.push(prevList[i]);
                    }
                    savePluginList(newList);
                    var oldEnabled = Lampa.Storage.get(ENABLED_KEY, []);
                    var validEnabled = [];
                    for (i = 0; i < oldEnabled.length; i++) {
                        var found = false;
                        var j;
                        for (j = 0; j < newUrls.length; j++) {
                            if (newUrls[j] === oldEnabled[i]) {
                                found = true;
                                break;
                            }
                        }
                        if (found) validEnabled.push(oldEnabled[i]);
                    }
                    Lampa.Storage.set(ENABLED_KEY, validEnabled);
                    Lampa.Noty.show(Lampa.Lang.translate('mp_sync_complete'));
                    saveUpdateInfo(remoteDate, added, removed);
                } catch (e) {
                    console.error('Sync error:', e);
                }
            })
            .catch(function () { Lampa.Noty.show('Ошибка синхронизации'); })
            .finally(function () { Lampa.Loading.stop(); if (callback) callback(); });
    }


    function checkUpdatesOnStart() {
        fetch(syncUrl, { cache: 'no-cache' })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                try {
                    if (!Array.isArray(data.plugins)) return;
                    var remoteDate = data.updateDate || '—';
                    var remotePlugins = data.plugins;
                    var remoteList = [];
                    var i;
                    for (i = 0; i < remotePlugins.length; i++) {
                        remoteList.push({ url: remotePlugins[i].url, name: remotePlugins[i].name, description: remotePlugins[i].description });
                    }
                    var localList = getPluginList();
                    var localUrls = [];
                    for (i = 0; i < localList.length; i++) {
                        localUrls.push(localList[i].url);
                    }
                    var remoteUrls = [];
                    for (i = 0; i < remoteList.length; i++) {
                        remoteUrls.push(remoteList[i].url);
                    }
                    var added = [];
                    for (i = 0; i < remoteList.length; i++) {
                        var found = false;
                        var j;
                        for (j = 0; j < localUrls.length; j++) {
                            if (localUrls[j] === remoteList[i].url) {
                                found = true;
                                break;
                            }
                        }
                        if (!found) added.push(remoteList[i]);
                    }
                    var removed = [];
                    for (i = 0; i < localList.length; i++) {
                        var found = false;
                        var j;
                        for (j = 0; j < remoteUrls.length; j++) {
                            if (remoteUrls[j] === localList[i].url) {
                                found = true;
                                break;
                            }
                        }
                        if (!found) removed.push(localList[i]);
                    }
                    if (added.length > 0 || removed.length > 0) saveUpdateInfo(remoteDate, added, removed);
                } catch (e) {
                    console.error('Check on start error:', e);
                }
            })
            .catch(function () {});
    }


    function addCategoryButtons() {
        if (pluginList.length === 0) return;
        var categories = getCategories(pluginList);
        var i;
        for (i = 0; i < categories.length; i++) {
            (function(cat) {
                Lampa.SettingsApi.addParam({
                    component: 'multi_plugin',
                    param: { type: 'button' },
                    field: { name: cat },
                    onChange: function () {
                        showCategory(cat);
                    }
                });
            })(categories[i]);
        }
    }


    function registerSettings() {
        Lampa.SettingsApi.addComponent({
            component: 'multi_plugin',
            icon: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="16" height="16" rx="2" stroke="#fff" stroke-width="2"/><rect x="8" y="8" width="8" height="8" rx="1" stroke="#fff" stroke-width="2"/></svg>',
            name: Lampa.Lang.translate('mp_title')
        });


        Lampa.SettingsApi.addParam({
            component: 'multi_plugin',
            param: { type: 'button' },
            field: { name: Lampa.Lang.translate('mp_updated') + getUpdateInfo().date },
            onChange: showInfo
        });


        Lampa.SettingsApi.addParam({
            component: 'multi_plugin',
            param: { type: 'button' },
            field: { name: Lampa.Lang.translate('mp_sync_plugins') },
            onChange: confirmAndSync
        });


        Lampa.SettingsApi.addParam({
            component: 'multi_plugin',
            param: { type: 'button' },
            field: { name: Lampa.Lang.translate('mp_load_online_only') },
            onChange: confirmAndLoadOnline
        });


        Lampa.SettingsApi.addParam({
            component: 'multi_plugin',
            param: { type: 'button' },
            field: { name: Lampa.Lang.translate('mp_export_select') },
            onChange: showInstallPlugins
        });


        Lampa.SettingsApi.addParam({
            component: 'multi_plugin',
            param: { type: 'button' },
            field: { name: Lampa.Lang.translate('mp_installed_plugins') },
            onChange: showInstalledPlugins
        });


        Lampa.SettingsApi.addParam({
            component: 'multi_plugin',
            param: { type: 'title' },
            field: { name: Lampa.Lang.translate('mp_management') }
        });


        Lampa.SettingsApi.addParam({
            component: 'multi_plugin',
            param: { type: 'button' },
            field: { name: Lampa.Lang.translate('mp_current_plugins') },
            onChange: showEnabledPlugins
        });


        Lampa.SettingsApi.addParam({
            component: 'multi_plugin',
            param: { type: 'button' },
            field: { name: Lampa.Lang.translate('mp_export_to_lampa') },
            onChange: confirmExportEnabled
        });


        Lampa.SettingsApi.addParam({
            component: 'multi_plugin',
            param: { type: 'button' },
            field: { name: Lampa.Lang.translate('mp_disable_all') },
            onChange: disableAllPlugins
        });


        Lampa.SettingsApi.addParam({
            component: 'multi_plugin',
            param: { type: 'button' },
            field: { name: Lampa.Lang.translate('mp_reload_lampa') },
            onChange: function () {
                var prev = Lampa.Controller.enabled().name;
                Lampa.Modal.open({
                    title: Lampa.Lang.translate('mp_reload_lampa'),
                    align: 'center',
                    html: $('<div class="about">' + Lampa.Lang.translate('mp_reload_message') + '</div>'),
                    buttons: [
                        { name: Lampa.Lang.translate('mp_cancel'), onSelect: function () { Lampa.Modal.close(); Lampa.Controller.toggle(prev); } },
                        { name: Lampa.Lang.translate('mp_ok'), onSelect: function () { Lampa.Modal.close(); window.location.reload(); } }
                    ]
                });
            }
        });


        Lampa.SettingsApi.addParam({
            component: 'multi_plugin',
            param: { type: 'title' },
            field: { name: Lampa.Lang.translate('mp_category_plugins') }
        });
    }


    function showInstallPlugins() {
        var categories = getCategories(pluginList);


        var items = [];
        var i;
        for (i = 0; i < categories.length; i++) {
            items.push({
                title: categories[i],
                category: categories[i]
            });
        }


        Lampa.Select.show({
            title: Lampa.Lang.translate('mp_export_select'),
            items: items,
            onSelect: function(item){
                showInstallCategory(item.category);
            },
            onBack: function(){
                Lampa.Controller.toggle('settings_component');
            }
        });
    }


    function showInstallCategory(category) {
        var plugins = [];
        var i;
        for (i = 0; i < pluginList.length; i++) {
            if (translateObj(pluginList[i].category) === category) {
                plugins.push(pluginList[i]);
            }
        }


        var items = [];
        for (i = 0; i < plugins.length; i++) {
            var p = plugins[i];
            var installed = isInstalled(p.url);
            var title = installed
                ? '<span style="color:' + INSTALLED_COLOR + '">' + (translateObj(p.name) || p.url.split('/').pop()) + '</span>'
                : translateObj(p.name) || p.url.split('/').pop();


            items.push({
                title: title,
                subtitle: translateObj(p.description) || '',
                url: p.url,
                plugin: p,
                installed: installed
            });
        }


        Lampa.Select.show({
            title: category,
            items: items,
            onSelect: function(item){
                showPluginActions(item.plugin, item.installed, category);
            },
            onBack: function(){
                showInstallPlugins();
            }
        });
    }


    function showPluginActions(plugin, isInstalled, category) {
        var actions = [];


        if (isInstalled) {
            actions.push({
                title: Lampa.Lang.translate('pi_remove'),
                onSelect: function () {
                    removePlugin(plugin.url);
                    showInstallCategory(category);
                }
            });
        } else {
            actions.push({
                title: Lampa.Lang.translate('pi_install'),
                onSelect: function () {
                    installPlugin(plugin);
                    showInstallCategory(category);
                }
            });
        }


        actions.push({
            title: Lampa.Lang.translate('pi_cancel'),
            onSelect: function () {
                showInstallCategory(category);
            }
        });


        Lampa.Select.show({
            title: translateObj(plugin.name) || plugin.url.split('/').pop(),
            items: actions,
            onBack: function () {
                showInstallCategory(category);
            }
        });
    }


    function installPlugin(p) {
        var url = p.url;
        if (isInstalled(url)) return;


        Lampa.Plugins.add({
            url: url,
            name: translateObj(p.name) || url.split('/').pop(),
            status: 1,
            source: SOURCE_KEY
        });


        Lampa.Plugins.save();


        addInstalledFromMulti(url);


        Lampa.Noty.show(Lampa.Lang.translate('pi_plugin_installed'));
    }


    function removePlugin(url) {
        var installed = getInstalled();
        var plugin = null;
        var i;
        for (i = 0; i < installed.length; i++) {
            if (installed[i].url === url) {
                plugin = installed[i];
                break;
            }
        }
        if (plugin) {
            Lampa.Plugins.remove(plugin);
            Lampa.Plugins.save();


            removeInstalledFromMulti(url);


            Lampa.Noty.show(Lampa.Lang.translate('pi_plugin_removed'));
        }
    }


    function getInstalled() {
        return Lampa.Plugins.get() || [];
    }


    function isInstalled(url) {
        var installed = getInstalled();
        var i;
        for (i = 0; i < installed.length; i++) {
            if (installed[i].url === url) return true;
        }
        return false;
    }


    function getInstalledFromMulti() {
        return Lampa.Storage.get(INSTALLED_KEY, []);
    }


    function addInstalledFromMulti(url) {
        var list = Lampa.Storage.get(INSTALLED_KEY, []);
        var i;


        for (i = 0; i < list.length; i++) {
            if (list[i] === url) return;
        }


        list.push(url);
        Lampa.Storage.set(INSTALLED_KEY, list);
    }


    function removeInstalledFromMulti(url) {
        var list = Lampa.Storage.get(INSTALLED_KEY, []);
        var newList = [];
        var i;


        for (i = 0; i < list.length; i++) {
            if (list[i] !== url) newList.push(list[i]);
        }


        Lampa.Storage.set(INSTALLED_KEY, newList);
    }


    function showInstalledPlugins() {
        var urls = getInstalledFromMulti();


        if (!urls || urls.length === 0) {
            Lampa.Noty.show(Lampa.Lang.translate('mp_no_installed_plugins'));


            Lampa.Controller.toggle('settings_component');


            return;
        }


        var items = [];
        var i;


        for (i = 0; i < urls.length; i++) {
            var url = urls[i];
            var name = url.split('/').pop().replace('.js','');


            var j;
            for (j = 0; j < pluginList.length; j++) {
                if (pluginList[j].url === url) {
                    name = translateObj(pluginList[j].name) || name;
                    break;
                }
            }


            items.push({
                title: '<span style="color:' + INSTALLED_COLOR + '">' + name + '</span>',
                subtitle: url,
                url: url,
                name: name
            });
        }


        Lampa.Select.show({
            title: Lampa.Lang.translate('mp_installed_plugins'),
            items: items,
            onSelect: function(item){
                showInstalledActions(item);
            },
            onBack: function(){
                Lampa.Controller.toggle('settings_component');
            }
        });
    }


    function showInstalledActions(item) {
        Lampa.Select.show({
            title: item.name,
            items: [
                {
                    title: Lampa.Lang.translate('pi_remove'),
                    onSelect: function () {
                        var list = getInstalled();
                        var i;
                        for (i = 0; i < list.length; i++) {
                            if (list[i].url === item.url) {
                                Lampa.Plugins.remove(list[i]);
                                Lampa.Plugins.save();
                                break;
                            }
                        }
                        removeInstalledFromMulti(item.url);
                        Lampa.Noty.show(Lampa.Lang.translate('mp_plugin_removed'));
                        showInstalledPlugins();
                    }
                },
                {
                    title: Lampa.Lang.translate('pi_cancel'),
                    onSelect: function () {
                        showInstalledPlugins();
                    }
                }
            ],
            onBack: function () {
                showInstalledPlugins();
            }
        });
    }


    pluginList = getPluginList();
    checkUpdatesOnStart();


    registerSettings();
    addCategoryButtons();


    Lampa.Listener.follow('app', function (e) {
        if (e.type === 'ready') {
            loadEnabledPluginsLazy();
        }
    });


    console.log('Мультиплагин v5');
})();
