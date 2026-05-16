(function () {
    'use strict'


    const REMOTE_URL = 'https://addonslmp.github.io/sources/plugins_example.js'


    const STORAGE_KEY = 'external_installer_plugins'
    const SOURCE_KEY = 'external_installer'
    const URL_STORAGE_KEY = 'external_installer_source_url'
    const INSTALLED_COLOR = '#02e602'


    let plugins = []
    let menuBuilt = false  // флаг — меню уже построено


    // Переводы
    Lampa.Lang.add({
        pi_title: { ru: 'Сторонние плагины', uk: 'Сторонні плагіни', en: 'Third-party Plugins' },
        pi_source_plugins: { ru: 'Ссылка на список плагинов', uk: 'Посилання на список плагінів', en: 'Plugins List URL' },
        pi_plugin_installed: { ru: 'Плагин установлен', uk: 'Плагін встановлено', en: 'Plugin Installed' },
        pi_plugin_removed: { ru: 'Плагин удалён', uk: 'Плагін видалено', en: 'Plugin Removed' },
        pi_no_plugins: { ru: 'Список плагинов пуст', uk: 'Список плагінів порожній', en: 'Plugins list is empty' },
        pi_invalid_url: { ru: 'Некорректная ссылка', uk: 'Некоректне посилання', en: 'Invalid URL' },
        pi_source_set_reload: { ru: 'Источник изменён. Перезагрузка через 3 секунды...', uk: 'Джерело змінено. Перезавантаження через 3 секунди...', en: 'Source changed. Reloading in 3 seconds...' },
        pi_categories_title: { ru: 'Категории', uk: 'Категорії', en: 'Categories' },
        pi_install: { ru: 'Установить', uk: 'Встановити', en: 'Install' },
        pi_remove: { ru: 'Удалить', uk: 'Видалити', en: 'Remove' },
        pi_cancel: { ru: 'Отмена', uk: 'Скасувати', en: 'Cancel' },
        pi_load_error: { ru: 'Ошибка загрузки списка', uk: 'Помилка завантаження списку', en: 'Failed to load plugins list' }
    });


    function getSourceUrl() {
        return Lampa.Storage.get(URL_STORAGE_KEY, REMOTE_URL)
    }


    function loadRemoteList() {
        const url = getSourceUrl()


        return fetch(url, { cache: 'no-cache' })
            .then(r => {
                if (!r.ok) throw new Error('HTTP ' + r.status)
                return r.text()
            })
            .then(text => {
                const match = text.match(/pluginsList\s*=\s*(\[[\s\S]*?\])/)
                if (!match || !match[1]) return []


                const list = eval(match[1])
                plugins = list
                Lampa.Storage.set(STORAGE_KEY, list, true)
                return list
            })
            .catch(() => {
                plugins = Lampa.Storage.get(STORAGE_KEY, [])
                return plugins
            })
    }


    function getInstalled() {
        return Lampa.Plugins.get() || []
    }


    function isInstalled(url) {
        return getInstalled().some(p => p.url === url)
    }


    function getTranslatedName(name) {
        let translated = name
        if (typeof name === 'object') {
            const lang = Lampa.Storage.get('language', 'ru')
            translated = name[lang] || name.ru || name.en || name.uk || Object.values(name)[0] || ''
        }
        return translated || 'Без названия'
    }


    function translateObj(obj) {
        if (!obj) return 'Разное'
        if (typeof obj === 'string') return obj


        const lang = Lampa.Storage.get('language', 'ru')
        return obj[lang] || obj.ru || obj.uk || obj.en || Object.values(obj)[0] || 'Разное'
    }


    function getCategoryKey(cat) {
        if (!cat) return 'Разное'
        if (typeof cat === 'string') return cat.trim()
        return (cat.ru || cat.uk || cat.en || Object.values(cat)[0] || 'Разное').trim()
    }


    function installPlugin(p) {
        const url = p.url
        if (isInstalled(url)) return


        Lampa.Plugins.add({
            url: url,
            name: getTranslatedName(p.name) || url.split('/').pop(),
            status: 1,
            source: SOURCE_KEY
        })


        Lampa.Plugins.save()
        Lampa.Noty.show(Lampa.Lang.translate('pi_plugin_installed'))
    }


    function removePlugin(url) {
        const installed = getInstalled()
        const plugin = installed.find(p => p.url === url)
        if (plugin) {
            Lampa.Plugins.remove(plugin)
            Lampa.Plugins.save()
            Lampa.Noty.show(Lampa.Lang.translate('pi_plugin_removed'))
        }
    }


    function showPluginsInCategory(categoryKey) {
        const filtered = plugins.filter(p => getCategoryKey(p.category) === categoryKey)


        if (!filtered.length) {
            Lampa.Noty.show(Lampa.Lang.translate('pi_no_plugins'))
            return
        }


        const items = filtered.map(p => {
            const installed = isInstalled(p.url)
            const title = installed 
                ? `<span style="color:${INSTALLED_COLOR}">${getTranslatedName(p.name)}</span>` 
                : getTranslatedName(p.name)


            return {
                title: title,
                subtitle: getTranslatedName(p.description) || '',
                url: p.url,
                plugin: p,
                installed: installed
            }
        })


        const sampleCat = filtered[0]?.category
        const translatedTitle = translateObj(sampleCat) || categoryKey


        Lampa.Select.show({
            title: translatedTitle,
            items: items,
            onSelect: (item) => showPluginActions(item.plugin, item.installed),
            onBack: () => Lampa.Controller.toggle('settings_component')
        })
    }


    function showPluginActions(plugin, isInstalled) {
        const actions = []


        if (isInstalled) {
            actions.push({
                title: Lampa.Lang.translate('pi_remove'),
                onSelect: () => {
                    removePlugin(plugin.url)
                    showPluginsInCategory(getCategoryKey(plugin.category))
                }
            })
        } else {
            actions.push({
                title: Lampa.Lang.translate('pi_install'),
                onSelect: () => {
                    installPlugin(plugin)
                    showPluginsInCategory(getCategoryKey(plugin.category))
                }
            })
        }


        actions.push({
            title: Lampa.Lang.translate('pi_cancel'),
            onSelect: () => showPluginsInCategory(getCategoryKey(plugin.category))
        })


        Lampa.Select.show({
            title: getTranslatedName(plugin.name),
            items: actions,
            onBack: () => showPluginsInCategory(getCategoryKey(plugin.category))
        })
    }


    function buildMenu() {
        if (menuBuilt) return


        if (!plugins.length) return


        const categoryKeyMap = new Map()
        plugins.forEach(p => {
            const catKey = getCategoryKey(p.category)
            categoryKeyMap.set(catKey, p.category)
        })


        const categories = [...categoryKeyMap.keys()]


        categories.forEach(key => {
            const originalCat = categoryKeyMap.get(key)
            const translatedCat = translateObj(originalCat) || key


            Lampa.SettingsApi.addParam({
                component: 'external_installer',
                param: { type: 'button' },
                field: { name: translatedCat },
                onChange: () => showPluginsInCategory(key)
            })
        })


        menuBuilt = true
    }


    // ────────────────────────────────────────────────
    // Инициализация
    // ────────────────────────────────────────────────
    Lampa.SettingsApi.addComponent({
        component: 'external_installer',
        icon: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="6" width="16" height="12" rx="4" stroke="#fff" stroke-width="2"/><circle cx="9.5" cy="12" r="1.4" fill="#fff"/><circle cx="14.5" cy="12" r="1.4" fill="#fff"/><path d="M8 2v4M16 2v4" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>',
        name: Lampa.Lang.translate('pi_title')
    })


    Lampa.SettingsApi.addParam({
        component: 'external_installer',
        param: { type: 'button' },
        field: { name: Lampa.Lang.translate('pi_source_plugins') },
        onChange: function () {
            const currentUrl = Lampa.Storage.get(URL_STORAGE_KEY, REMOTE_URL)


            Lampa.Input.edit({
                title: Lampa.Lang.translate('pi_source_plugins'),
                free: true,
                nosave: true,
                nomic: true,
                value: currentUrl
            }, (value) => {
                if (value && value.startsWith('http')) {
                    Lampa.Storage.set(URL_STORAGE_KEY, value)
                    menuBuilt = false
                    Lampa.Noty.show(Lampa.Lang.translate('pi_source_set_reload'))
                    setTimeout(() => window.location.reload(), 3000)
                } else {
                    Lampa.Noty.show(Lampa.Lang.translate('pi_invalid_url'))
                }
            })
        }
    })


    Lampa.SettingsApi.addParam({
        component: 'external_installer',
        param: { type: 'title' },
        field: { name: Lampa.Lang.translate('pi_categories_title') }
    })


    // Запуск ТОЛЬКО на 'ready' (убран лишний setTimeout)
    Lampa.Listener.follow('app', e => {
        if (e.type === 'ready') {
            setTimeout(() => {
                loadRemoteList().then(() => buildMenu())
            }, 3000)
        }
    })


    console.log('External Plugin Installer loaded')
})()
