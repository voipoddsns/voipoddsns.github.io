(function () {
    "use strict";

    Lampa.Lang.add({
        mp_title: { ru: "Мультиплагин", uk: "Мультиплагін", en: "Multiplugin" },
        mp_updated: { ru: "Обновлено: ", uk: "Оновлено: ", en: "Updated: " },
        mp_sync_plugins: { ru: "Синхронизировать плагины", uk: "Синхронізувати плагіни", en: "Sync Plugins" },
        mp_load_online_only: {
            ru: "Установить только онлайн",
            uk: "Встановити тільки онлайн",
            en: "Install only online",
        },
        mp_management: { ru: "Управление", uk: "Керування", en: "Management" },
        mp_installed_plugins: { ru: "Установленные плагины", uk: "Встановлені плагіни", en: "Installed Plugins" },
        mp_no_installed_plugins: {
            ru: "Нет установленных плагинов",
            uk: "Немає встановлених плагінів",
            en: "No installed plugins",
        },
        mp_plugin_removed: { ru: "Плагин удалён", uk: "Плагін видалено", en: "Plugin removed" },
        mp_disable_all: { ru: "Удалить все плагины", uk: "Видалити всі плагіни", en: "Remove All Plugins" },
        mp_reload_lampa: { ru: "Перезагрузить Lampa", uk: "Перезавантажити Lampa", en: "Reload Lampa" },
        mp_update_info: { ru: "Информация об обновлении", uk: "Інформація про оновлення", en: "Update Information" },
        mp_last_update: { ru: "Последнее обновление: ", uk: "Останнє оновлення: ", en: "Last Update: " },
        mp_added: { ru: "Добавлено:", uk: "Додано:", en: "Added:" },
        mp_removed: { ru: "Удалено:", uk: "Видалено:", en: "Removed:" },
        mp_no_changes: { ru: "Новых изменений нет", uk: "Нових змін немає", en: "No new changes" },
        mp_sync_complete: { ru: "Синхронизация завершена", uk: "Синхронізація завершена", en: "Sync completed" },
        mp_confirm_sync: {
            ru: "Синхронизировать актуальные плагины с облака?",
            uk: "Синхронізувати актуальні плагіни з хмари?",
            en: "Sync latest plugins from cloud?",
        },
        mp_confirm_online: {
            ru: 'Установить только плагины категории "Онлайн"?',
            uk: 'Встановити тільки плагіни категорії "Онлайн"?',
            en: 'Install only "Online" category plugins?',
        },
        mp_confirm_disable_all: {
            ru: "Вы уверены? Все установленные плагины будут удалены",
            uk: "Ви впевнені? Усі встановлені плагіни будуть видалені",
            en: "Are you sure? All installed plugins will be removed",
        },
        mp_reload_message: {
            ru: "Перезапустить приложение?",
            uk: "Перезавантажити додаток?",
            en: "Restart application?",
        },
        mp_ok: { ru: "OK", uk: "OK", en: "OK" },
        mp_cancel: { ru: "Отмена", uk: "Скасувати", en: "Cancel" },
        mp_no_updates_found: { ru: "Обновлений не найдено", uk: "Оновлень не знайдено", en: "No updates found" },
        mp_install_plugins: { ru: "Установка плагинов", uk: "Встановлення плагінів", en: "Install Plugins" },
        mp_all_plugins_removed: {
            ru: "Все плагины удалены. Перезагрузите Lampa",
            uk: "Усі плагіни видалено. Перезавантажте Lampa",
            en: "All plugins removed. Reload Lampa",
        },
        pi_install: { ru: "Установить", uk: "Встановити", en: "Install" },
        pi_remove: { ru: "Удалить", uk: "Видалити", en: "Remove" },
        pi_cancel: { ru: "Отмена", uk: "Скасувати", en: "Cancel" },
        pi_plugin_installed: { ru: "Плагин установлен", uk: "Плагін встановлено", en: "Plugin installed" },
        pi_plugin_removed: { ru: "Плагин удалён", uk: "Плагін видалено", en: "Plugin removed" },
        mp_captcha_warning: {
            ru: "Внимание! Массовая установка плагинов может привести к нестабильной работе приложения.<br><br>Некоторые плагины могут конфликтовать друг с другом, вызывать ошибки, зависания или поломку интерфейса.<br>Рекомендуется устанавливать только необходимые плагины и проверять их совместимость.",
            uk: "Увага! Масове встановлення плагінів може призвести до нестабільної роботи програми.<br><br>Деякі плагіни можуть конфліктувати між собою, викликати помилки, зависання або порушення роботи інтерфейсу.<br>Рекомендується встановлювати лише необхідні плагіни та перевіряти їх сумісність.",
            en: "Warning! Installing many plugins at once may cause application instability.<br><br>Some plugins may conflict with each other, causing errors, freezes, or interface breakage.<br>It is recommended to install only necessary plugins and check their compatibility.",
        },
        mp_sync_required: {
            ru: "Синхронизируйте список плагинов",
            uk: "Синхронізуйте список плагінів",
            en: "Sync the plugin list",
        },
        mp_and_more: {
            ru: "... и ещё ",
            uk: "... і ще ",
            en: "... and ",
        },
        mp_donate: {
            ru: "Поддержать разработчика",
            uk: "Підтримати розробника",
            en: "Support development",
        },
        mp_donate_text: {
            ru: "Если вам нравится Мультиплагин, вы можете поддержать разработчика. Спасибо за использование!",
            uk: "Якщо вам подобається Мультиплагін, ви можете підтримати розробника. Дякую за використання!",
            en: "If you like Multiplugin, you can support development. Thank you for using it!",
        },
    });

    var syncUrl = "https://voipoddsns.github.io/sources/plugins_mp.json";
    var STORAGE_KEY = "multi_plugins_list";
    var INFO_KEY = "multi_last_update";
    var INSTALLED_KEY = "multi_installed_plugins";
    var SOURCE_KEY = "multiplugin";
    var INSTALLED_COLOR = "#8bc34a";

    var pluginList = [];

    function translateObj(obj) {
        if (!obj) return "";
        if (typeof obj === "string") return obj;
        var lang = Lampa.Storage.get("language", "ru");
        return obj[lang] || obj.ru || obj.uk || obj.en || '';
    }

    function getCategories(list) {
        var cats = [];
        var i;
        for (i = 0; i < list.length; i++) {
            var cat = translateObj(list[i].category) || "Разное";
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

    function savePluginList(list) {
        Lampa.Storage.set(STORAGE_KEY, list);
        pluginList = list;
    }

    function getPluginList() {
        return Lampa.Storage.get(STORAGE_KEY, []);
    }

    function saveUpdateInfo(date, added, removed) {
        var info = { date: date || "—", added: added || [], removed: removed || [] };
        Lampa.Storage.set(INFO_KEY, info, true);
    }

    function getUpdateInfo() {
        return Lampa.Storage.get(INFO_KEY, { date: "—", added: [], removed: [] });
    }

    function showInfo() {
        var list = getPluginList();

        if (!list || list.length === 0) {
            Lampa.Noty.show(translateObj(Lampa.Lang.translate("mp_sync_required")));
            return;
        }

        var info = getUpdateInfo();
        if (info.added.length === 0 && info.removed.length === 0) {
            Lampa.Noty.show(Lampa.Lang.translate("mp_no_updates_found"));
            return;
        }

        var html = '<div class="about" style="text-align:left">';
        html += "<div><b>" + Lampa.Lang.translate("mp_last_update") + "</b> " + info.date + "</div><br>";

        // === Добавлено ===
        if (info.added.length) {
            html += "<b>" + Lampa.Lang.translate("mp_added") + '</b><div style="margin-bottom:6px;"></div>';
            var limit = 3;
            var count = Math.min(info.added.length, limit);
            var i;

            for (i = 0; i < count; i++) {
                var p = info.added[i];

                var name = translateObj(p.name) || p.url.split("/").pop();
                var category = translateObj(p.category);

                if (category) {
                    name += " (" + category + ")";
                }

                html += "• <b>" + name + "</b><br>";

                if (p.description) {
                    html +=
                        '<div style="color:#bfbfbf; font-size:0.9em; margin-left:18px; line-height:1.2; margin-bottom:2px;">' +
                        translateObj(p.description) +
                        "</div>";
                } else {
                    html += '<br style="margin-bottom:2px;">';
                }
            }

            if (info.added.length > limit) {
                html +=
                    '<div style="color:#999; margin-top:4px;">' +
                    Lampa.Lang.translate("mp_and_more") +
                    (info.added.length - limit) +
                    "</div>";
            }

            html += "<br>";
        }

        // === Удалено ===
        if (info.removed.length) {
            html += "<b>" + Lampa.Lang.translate("mp_removed") + '</b><div style="margin-bottom:6px;"></div>';
            var limit = 3;
            var count = Math.min(info.removed.length, limit);
            var i;

            for (i = 0; i < count; i++) {
                var p = info.removed[i];

                var name = translateObj(p.name) || p.url.split("/").pop();
                var category = translateObj(p.category);

                if (category) {
                    name += " (" + category + ")";
                }

                html += "• <b>" + name + "</b><br>";

                if (p.description) {
                    html +=
                        '<div style="color:#bfbfbf; font-size:0.9em; margin-left:18px; line-height:1.2; margin-bottom:2px;">' +
                        translateObj(p.description) +
                        "</div>";
                } else {
                    html += '<br style="margin-bottom:2px;">';
                }
            }

            if (info.removed.length > limit) {
                html +=
                    '<div style="color:#999; margin-top:4px;">' +
                    Lampa.Lang.translate("mp_and_more") +
                    (info.removed.length - limit) +
                    "</div>";
            }

            html += "<br>";
        }

        var prev = Lampa.Controller.enabled().name;
        Lampa.Modal.open({
            title: Lampa.Lang.translate("mp_update_info"),
            align: "center",
            size: "medium",
            html: $(html),
            onBack: () => {
                Lampa.Modal.close();
                if (prev) Lampa.Controller.toggle(prev);
            },
        });
    }

    function disableAllPlugins() {
        var prev = Lampa.Controller.enabled().name;

        Lampa.Modal.open({
            title: Lampa.Lang.translate("mp_disable_all"),
            align: "center",
            html: $('<div class="about">' + Lampa.Lang.translate("mp_confirm_disable_all") + "</div>"),
            buttons: [
                {
                    name: Lampa.Lang.translate("mp_cancel"),
                    onSelect: function () {
                        Lampa.Modal.close();
                        Lampa.Controller.toggle(prev);
                    },
                },
                {
                    name: Lampa.Lang.translate("pi_remove"),
                    onSelect: function () {
                        Lampa.Modal.close();

                        var urls = Lampa.Storage.get(INSTALLED_KEY, []);
                        var allPlugins = Lampa.Plugins.get() || [];

                        if (urls.length === 0) {
                            Lampa.Controller.toggle(prev);
                            return;
                        }

                        for (var i = 0; i < urls.length; i++) {
                            for (var j = 0; j < allPlugins.length; j++) {
                                if (allPlugins[j].url === urls[i]) {
                                    Lampa.Plugins.remove(allPlugins[j]);
                                    break;
                                }
                            }
                        }

                        Lampa.Plugins.save();
                        Lampa.Storage.set(INSTALLED_KEY, []);

                        Lampa.Noty.show(Lampa.Lang.translate("mp_all_plugins_removed"), INSTALLED_COLOR, 6000);

                        Lampa.Controller.toggle(prev);
                    },
                },
            ],
        });
    }

    function confirmAndSync() {
        var prev = Lampa.Controller.enabled().name;
        Lampa.Modal.open({
            title: Lampa.Lang.translate("mp_sync_plugins"),
            align: "center",
            html: $('<div class="about">' + Lampa.Lang.translate("mp_confirm_sync") + "</div>"),
            buttons: [
                {
                    name: Lampa.Lang.translate("mp_cancel"),
                    onSelect: function () {
                        Lampa.Modal.close();
                        Lampa.Controller.toggle(prev);
                    },
                },
                {
                    name: Lampa.Lang.translate("mp_ok"),
                    onSelect: function () {
                        Lampa.Modal.close();
                        synchronize(function () {
                            Lampa.Controller.toggle(prev);
                        });
                    },
                },
            ],
        });
    }

    function confirmAndLoadOnline() {
        var prev = Lampa.Controller.enabled().name;
        Lampa.Modal.open({
            title: Lampa.Lang.translate("mp_load_online_only"),
            align: "center",
            html: $('<div class="about">' + Lampa.Lang.translate("mp_confirm_online") + "</div>"),
            buttons: [
                {
                    name: Lampa.Lang.translate("mp_cancel"),
                    onSelect: function () {
                        Lampa.Modal.close();
                        Lampa.Controller.toggle(prev);
                    },
                },
                {
                    name: Lampa.Lang.translate("mp_ok"),
                    onSelect: function () {
                        Lampa.Modal.close();
                        loadOnlyOnline(function () {
                            Lampa.Controller.toggle(prev);
                        });
                    },
                },
            ],
        });
    }

    function loadOnlyOnline(callback) {
        Lampa.Loading.start();

        $.getJSON(syncUrl, function (data) {
            try {
                if (!Array.isArray(data.plugins)) throw new Error("Invalid data");
                var newList = [];
                var i;
                for (i = 0; i < data.plugins.length; i++) {
                    var item = data.plugins[i];
                    newList.push({
                        url: item.url,
                        name: item.name,
                        description: item.description,
                        category: item.category,
                    });
                }
                savePluginList(newList);

                for (i = 0; i < newList.length; i++) {
                    var p = newList[i];
                    var cat = translateObj(p.category).toLowerCase();

                    if (cat === "онлайн" || cat === "online") {
                        var existsInstalled = isInstalled(p.url);

                        if (!existsInstalled) {
                            Lampa.Plugins.add({
                                url: p.url,
                                name: translateObj(p.name) || p.url.split("/").pop(),
                                status: 1,
                                source: SOURCE_KEY,
                            });

                            addInstalledFromMulti(p.url);
                        }
                    }
                }

                Lampa.Plugins.save();

                setTimeout(function () {
                    if (callback) callback();
                    Lampa.Controller.toggle("settings_component");
                }, 100);
            } catch (e) {
                console.error("Load online error:", e);
                Lampa.Noty.show("Ошибка загрузки");
            } finally {
                Lampa.Loading.stop();
            }
        }).fail(function () {
            Lampa.Noty.show("Ошибка загрузки");
            Lampa.Loading.stop();
            if (callback) callback();
        });
    }

    function synchronize(callback) {
        Lampa.Loading.start();

        $.getJSON(syncUrl, function (data) {
            try {
                if (!Array.isArray(data.plugins)) throw new Error("Invalid data");
                var remoteDate = data.updateDate || "—";
                var newList = [];
                var i;
                for (i = 0; i < data.plugins.length; i++) {
                    var item = data.plugins[i];
                    newList.push({
                        url: item.url,
                        name: item.name,
                        description: item.description,
                        category: item.category,
                    });
                }

                var prevList = getPluginList();
                var prevUrls = prevList.map(function (p) {
                    return p.url;
                });
                var newUrls = newList.map(function (p) {
                    return p.url;
                });

                var added = newList.filter(function (p) {
                    return prevUrls.indexOf(p.url) === -1;
                });

                var removed = prevList.filter(function (p) {
                    return newUrls.indexOf(p.url) === -1;
                });

                savePluginList(newList);

                Lampa.Noty.show(Lampa.Lang.translate("mp_sync_complete"));
                saveUpdateInfo(remoteDate, added, removed);

                setTimeout(function () {
                    if (callback) callback();
                    Lampa.Controller.toggle("settings_component");
                }, 100);
            } catch (e) {
                console.error("Sync error:", e);
                Lampa.Noty.show("Ошибка синхронизации");
            } finally {
                Lampa.Loading.stop();
            }
        }).fail(function () {
            Lampa.Noty.show("Ошибка синхронизации");
            Lampa.Loading.stop();
            if (callback) callback();
        });
    }

    function checkUpdatesOnStart() {
        $.getJSON(syncUrl, function (data) {
            try {
                if (!Array.isArray(data.plugins)) return;
                var remoteDate = data.updateDate || "—";
                var remotePlugins = data.plugins;
                var remoteList = [];
                var i;
                for (i = 0; i < remotePlugins.length; i++) {
                    remoteList.push({
                        url: remotePlugins[i].url,
                        name: remotePlugins[i].name,
                        description: remotePlugins[i].description,
                        category: remotePlugins[i].category,
                    });
                }

                var localList = getPluginList();
                if (!localList || localList.length === 0) return;

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
                    if (localUrls.indexOf(remoteList[i].url) === -1) {
                        added.push(remoteList[i]);
                    }
                }

                var removed = [];
                for (i = 0; i < localList.length; i++) {
                    if (remoteUrls.indexOf(localList[i].url) === -1) {
                        removed.push(localList[i]);
                    }
                }

                if (added.length > 0 || removed.length > 0) {
                    saveUpdateInfo(remoteDate, added, removed);
                }
            } catch (e) {
                console.error("Check on start error:", e);
            }
        }).fail(function () {});
    }

    function showDonate() {
        var prev = null;

        try {
            prev = Lampa.Controller.enabled().name;
        } catch (e) {}

        var html =
            "" +
            '<div class="about" style="text-align:center;">' +
            '<img src="https://dl.dropboxusercontent.com/scl/fi/hrlz4panydhw35zn1sftr/2eaef908-65e0-498e-b93f-53fa76d2f146.png?rlkey=j4rqae8a02w97ytpuez5xxe6f&st=lp4kib72" style="width:280px; height:280px; margin:15px auto; display:block;">' +
            '<div style="margin-top:10px;">' +
            '<a href="https://addonslmp.donatik.me" target="_blank" ' +
            'style="color:#4FC3F7; font-size:1.1em; text-decoration:underline;">' +
            "https://addonslmp.donatik.me" +
            "</a>" +
            "</div>" +
            '<div style="margin-top:10px; font-size:1em; color:#ccc;">' +
            Lampa.Lang.translate("mp_donate_text") +
            "</div>" +
            "</div>";

        Lampa.Modal.open({
            title: Lampa.Lang.translate("mp_donate"),
            align: "center",
            size: "medium",
            html: $(html),
            onBack: () => {
                Lampa.Modal.close();
                if (prev) Lampa.Controller.toggle(prev);
            },
        });
    }

    function registerSettings() {
        if (Lampa.SettingsApi.getComponent('multi_plugin')) return;

        Lampa.SettingsApi.addComponent({
            component: "multi_plugin",
            icon: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="16" height="16" rx="2" stroke="#fff" stroke-width="2"/><rect x="8" y="8" width="8" height="8" rx="1" stroke="#fff" stroke-width="2"/></svg>',
            name: Lampa.Lang.translate("mp_title"),
        });

        Lampa.SettingsApi.addParam({
            component: "multi_plugin",
            param: { type: "button" },
            field: { name: Lampa.Lang.translate("mp_updated") + getUpdateInfo().date },
            onChange: showInfo,
        });

        Lampa.SettingsApi.addParam({
            component: "multi_plugin",
            param: { type: "button" },
            field: { name: Lampa.Lang.translate("mp_sync_plugins") },
            onChange: confirmAndSync,
        });

        Lampa.SettingsApi.addParam({
            component: "multi_plugin",
            param: { type: "button" },
            field: { name: Lampa.Lang.translate("mp_load_online_only") },
            onChange: confirmAndLoadOnline,
        });

        Lampa.SettingsApi.addParam({
            component: "multi_plugin",
            param: { type: "title" },
            field: { name: Lampa.Lang.translate("mp_management") },
        });

        Lampa.SettingsApi.addParam({
            component: "multi_plugin",
            param: { type: "button" },
            field: { name: Lampa.Lang.translate("mp_install_plugins") },
            onChange: openCaptchaGate,
        });

        Lampa.SettingsApi.addParam({
            component: "multi_plugin",
            param: { type: "button" },
            field: { name: Lampa.Lang.translate("mp_installed_plugins") },
            onChange: showInstalledPlugins,
        });

        Lampa.SettingsApi.addParam({
            component: "multi_plugin",
            param: { type: "button" },
            field: { name: Lampa.Lang.translate("mp_disable_all") },
            onChange: disableAllPlugins,
        });

        Lampa.SettingsApi.addParam({
            component: "multi_plugin",
            param: { type: "button" },
            field: { name: Lampa.Lang.translate("mp_reload_lampa") },
            onChange: function () {
                var prev = Lampa.Controller.enabled().name;
                Lampa.Modal.open({
                    title: Lampa.Lang.translate("mp_reload_lampa"),
                    align: "center",
                    html: $('<div class="about">' + Lampa.Lang.translate("mp_reload_message") + "</div>"),
                    buttons: [
                        {
                            name: Lampa.Lang.translate("mp_cancel"),
                            onSelect: function () {
                                Lampa.Modal.close();
                                Lampa.Controller.toggle(prev);
                            },
                        },
                        {
                            name: Lampa.Lang.translate("mp_ok"),
                            onSelect: function () {
                                Lampa.Modal.close();
                                window.location.reload();
                            },
                        },
                    ],
                });
            },
        });

        Lampa.SettingsApi.addParam({
            component: "multi_plugin",
            param: { type: "button" },
            field: { name: Lampa.Lang.translate("mp_donate") },
            onChange: showDonate,
        });
    }

    function openCaptchaGate() {
        var passed = Lampa.Storage.get("mp_install_shown", false);

        if (passed) {
            showInstallPlugins();
            return;
        }

        var prev = null;
        try {
            prev = Lampa.Controller.enabled().name;
        } catch (e) {}

        Lampa.Modal.open({
            title: Lampa.Lang.translate("mp_install_plugins"),
            align: "center",
            size: "medium",
            html: $('<div class="about">' + Lampa.Lang.translate("mp_captcha_warning") + "</div>"),
            buttons: [
                {
                    name: "OK",
                    onSelect: function () {
                        Lampa.Modal.close();

                        Lampa.Storage.set("mp_install_shown", true);

                        setTimeout(function () {
                            showInstallPlugins();
                        }, 300);
                    },
                },
            ],
        });
    }

    function showInstallPlugins() {
        if (!pluginList || pluginList.length === 0) {
            Lampa.Noty.show("Список плагинов пуст. Сначала синхронизируйте.");
            Lampa.Controller.toggle("settings_component");
            return;
        }

        var categories = getCategories(pluginList);

        var items = [];
        var i;
        for (i = 0; i < categories.length; i++) {
            items.push({
                title: categories[i],
                category: categories[i],
            });
        }

        Lampa.Select.show({
            title: Lampa.Lang.translate("mp_install_plugins"),
            items: items,
            onSelect: function (item) {
                showInstallCategory(item.category);
            },
            onBack: function () {
                Lampa.Controller.toggle("settings_component");
            },
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
                ? '<span style="color:' +
                  INSTALLED_COLOR +
                  '">' +
                  (translateObj(p.name) || p.url.split("/").pop()) +
                  "</span>"
                : translateObj(p.name) || p.url.split("/").pop();

            items.push({
                title: title,
                subtitle: translateObj(p.description) || "",
                url: p.url,
                plugin: p,
                installed: installed,
            });
        }

        Lampa.Select.show({
            title: category,
            items: items,
            onSelect: function (item) {
                showPluginActions(item.plugin, item.installed, category);
            },
            onBack: function () {
                showInstallPlugins();
            },
        });
    }

    function showPluginActions(plugin, isInstalled, category) {
        var actions = [];

        if (isInstalled) {
            actions.push({
                title: Lampa.Lang.translate("pi_remove"),
                onSelect: function () {
                    removePlugin(plugin.url);
                    showInstallCategory(category);
                },
            });
        } else {
            actions.push({
                title: Lampa.Lang.translate("pi_install"),
                onSelect: function () {
                    installPlugin(plugin);
                    showInstallCategory(category);
                },
            });
        }

        actions.push({
            title: Lampa.Lang.translate("pi_cancel"),
            onSelect: function () {
                showInstallCategory(category);
            },
        });

        Lampa.Select.show({
            title: translateObj(plugin.name) || plugin.url.split("/").pop(),
            items: actions,
            onBack: function () {
                showInstallCategory(category);
            },
        });
    }

    function installPlugin(p) {
        var url = p.url;
        if (isInstalled(url)) return;

        var prev = null;
        try {
            prev = Lampa.Controller.enabled().name;
        } catch (e) {}

        Lampa.Plugins.add({
            url: url,
            name: translateObj(p.name) || url.split("/").pop(),
            status: 1,
            source: SOURCE_KEY,
        });

        Lampa.Plugins.save();

        addInstalledFromMulti(url);

        Lampa.Noty.show(Lampa.Lang.translate("pi_plugin_installed"));

        setTimeout(function () {
            try {
                Lampa.Controller.collectionSet();
            } catch (e) {}
            try {
                if (prev) Lampa.Controller.toggle(prev);
            } catch (e) {}
        }, 800);
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

            Lampa.Noty.show(Lampa.Lang.translate("pi_plugin_removed"));
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
            Lampa.Noty.show(Lampa.Lang.translate("mp_no_installed_plugins"));
            Lampa.Controller.toggle("settings_component");
            return;
        }

        var items = [];
        var i;

        for (i = 0; i < urls.length; i++) {
            var url = urls[i];
            var name = url.split("/").pop().replace(".js", "");

            var j;
            for (j = 0; j < pluginList.length; j++) {
                if (pluginList[j].url === url) {
                    name = translateObj(pluginList[j].name) || name;
                    break;
                }
            }

            items.push({
                title: '<span style="color:' + INSTALLED_COLOR + '">' + name + "</span>",
                subtitle: url,
                url: url,
                name: name,
            });
        }

        Lampa.Select.show({
            title: Lampa.Lang.translate("mp_installed_plugins"),
            items: items,
            onSelect: function (item) {
                showInstalledActions(item);
            },
            onBack: function () {
                Lampa.Controller.toggle("settings_component");
            },
        });
    }

    function showInstalledActions(item) {
        Lampa.Select.show({
            title: item.name,
            items: [
                {
                    title: Lampa.Lang.translate("pi_remove"),
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
                        Lampa.Noty.show(Lampa.Lang.translate("mp_plugin_removed"));
                        showInstalledPlugins();
                    },
                },
                {
                    title: Lampa.Lang.translate("pi_cancel"),
                    onSelect: function () {
                        showInstalledPlugins();
                    },
                },
            ],
            onBack: function () {
                showInstalledPlugins();
            },
        });
    }

    function startPlugin() {
        if (window._multiplugin_started) return;
        window._multiplugin_started = true;

        Lampa.Storage.set("mp_install_shown", false);

        pluginList = getPluginList();
        checkUpdatesOnStart();
        registerSettings();
    }

    if (window.appready) {
        startPlugin();
    } else {
        Lampa.Listener.follow("app", function (e) {
            if (e.type === "ready") {
                startPlugin();
            }
        });
    }
})();
