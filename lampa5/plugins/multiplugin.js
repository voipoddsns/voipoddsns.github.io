(function () {
    'use strict';

    (function () {

      Lampa.Lang.add({
        mp_title: {
          ru: "Мультиплагин",
          uk: "Мультиплагін",
          en: "Multiplugin"
        },
        mp_updated: {
          ru: "Обновлено: ",
          uk: "Оновлено: ",
          en: "Updated: "
        },
        mp_sync_plugins: {
          ru: "Синхронизировать плагины",
          uk: "Синхронізувати плагіни",
          en: "Sync Plugins"
        },
        mp_load_online_only: {
          ru: "Установить только онлайн",
          uk: "Встановити тільки онлайн",
          en: "Install only online"
        },
        mp_management: {
          ru: "Управление",
          uk: "Керування",
          en: "Management"
        },
        mp_installed_plugins: {
          ru: "Установленные плагины",
          uk: "Встановлені плагіни",
          en: "Installed Plugins"
        },
        mp_no_installed_plugins: {
          ru: "Нет установленных плагинов",
          uk: "Немає встановлених плагінів",
          en: "No installed plugins"
        },
        mp_plugin_removed: {
          ru: "Плагин удалён",
          uk: "Плагін видалено",
          en: "Plugin removed"
        },
        mp_disable_all: {
          ru: "Удалить все плагины",
          uk: "Видалити всі плагины",
          en: "Remove All Plugins"
        },
        mp_reload_lampa: {
          ru: "Перезагрузить Lampa",
          uk: "Перезавантажити Lampa",
          en: "Reload Lampa"
        },
        mp_update_info: {
          ru: "Информация об обновлении",
          uk: "Інформація про оновлення",
          en: "Update Information"
        },
        mp_last_update: {
          ru: "Последнее обновление: ",
          uk: "Останнє оновлення: ",
          en: "Last Update: "
        },
        mp_added: {
          ru: "Добавлено:",
          uk: "Додано:",
          en: "Added:"
        },
        mp_removed: {
          ru: "Удалено:",
          uk: "Видалено:",
          en: "Removed:"
        },
        mp_no_changes: {
          ru: "Новых изменений нет",
          uk: "Нових змін немає",
          en: "No new changes"
        },
        mp_sync_complete: {
          ru: "Синхронизация завершена",
          uk: "Синхронізація завершена",
          en: "Sync completed"
        },
        mp_confirm_sync: {
          ru: "Синхронизировать плагины?",
          uk: "Синхронізувати плагіни?",
          en: "Sync plugins?"
        },
        mp_confirm_online: {
          ru: 'Установить только "Онлайн"?',
          uk: 'Встановити тільки "Онлайн"?',
          en: 'Install only "Online"?'
        },
        mp_confirm_disable_all: {
          ru: "Удалить все плагины?",
          uk: "Видалити всі плагіни?",
          en: "Remove all plugins?"
        },
        mp_reload_message: {
          ru: "Перезапустить приложение?",
          uk: "Перезапустити додаток?",
          en: "Restart app?"
        },
        mp_ok: {
          ru: "OK",
          uk: "OK",
          en: "OK"
        },
        mp_cancel: {
          ru: "Отмена",
          uk: "Скасувати",
          en: "Cancel"
        },
        mp_no_updates_found: {
          ru: "Нет обновлений",
          uk: "Немає оновлень",
          en: "No updates"
        },
        mp_install_plugins: {
          ru: "Установка плагинов",
          uk: "Встановлення плагінів",
          en: "Install Plugins"
        },
        mp_all_plugins_removed: {
          ru: "Все плагины удалены",
          uk: "Усі плагіни видалено",
          en: "All plugins removed"
        }
      });
      var STORAGE_KEY = "multi_plugins_list";
      function getPluginList() {
        return Lampa.Storage.get(STORAGE_KEY, []);
      }
      function startPlugin() {
        getPluginList();
      }
      if (window.appready) {
        startPlugin();
      } else {
        Lampa.Listener.follow("app", function (e) {
          if (e.type === "ready") startPlugin();
        });
      }
    })();

})();
