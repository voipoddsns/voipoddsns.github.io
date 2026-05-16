Language [English](README.md) | [Українська](README.ua.md) | [Русский](README.ru.md)
---

# Multiplugin for Lampa

**Multiplugin** is a plugin manager for the **Lampa** application that allows you to conveniently install and manage a large number of plugins from a single interface.

The plugin acts as a **catalog and extension installer**, simplifying the search and installation of plugins.

After installation, plugins work as regular Lampa extensions and **do not depend on Multiplugin**.

---

# Installation

1.  Open **Lampa**
2.  Go to:

```
Settings → Extensions → Add plugin
```

3.  Paste the link:

```
https://addonslmp.github.io/multiplugin.js
```

4.  Confirm the installation.

After this, the **Multiplugin** section will appear in the settings.

---

# Main Features

Multiplugin provides several tools for managing plugins.

## Plugin Synchronization

The **Plugin Synchronization** button loads the current list of plugins.

During synchronization:

-   A JSON file with the plugin list is downloaded
-   Categories are created
-   Plugin information is updated

It is recommended to perform synchronization:

-   After the first installation
-   Periodically to get new plugins

---

## Installing Plugins

After synchronization, plugin categories become available.

To install a plugin:

1.  Open a category
2.  Select a plugin
3.  Confirm the installation

After installation:

-   The plugin is added to **Lampa extensions**
-   It starts working as a regular plugin

Thus, Multiplugin acts as an **installer and catalog**.

---

## Installed Plugins

The **Installed Plugins** section shows plugins that were installed via Multiplugin.

In this section, you can:

-   See the list of installed plugins
-   Check which plugins have been added
-   Quickly navigate to an installed plugin

This section provides quick access to plugins installed through Multiplugin.

---

## Install Only Online

The **Install Only Online** function automatically installs all plugins from the **Online** category.

After clicking:

-   Multiplugin retrieves the list of online plugins
-   Installs them into Lampa extensions
-   The plugins become available immediately after installation

This is convenient for users who only need online content.

---

# How Multiplugin Works

Multiplugin does not store plugins within itself.

It performs three main tasks:

1.  Loads the list of plugins
2.  Displays them to the user
3.  Installs selected plugins into the Lampa extension system

After installation, plugins work **independently of Multiplugin**.

---

# Storing the Plugin List

The list of plugins is stored in a separate JSON file.

Link:

```
https://addonslmp.github.io/sources/plugins_mp.json
```

This file contains information about all available plugins.

---

# Plugin JSON Structure

Example structure:

```json
    {
      "name": {
        "ru": "МегаПлагин",
        "uk": "МегаПлагін",
        "en": "MegaPlugin"
      },
      "url": "https://megaplugin.com/plugin.js",
      "description": {
        "ru": "Лучший плагин в мире.",
        "uk": "Найкращий плагін у світі.",
        "en": "Best plugin in the world."
      },
      "category": {
        "ru": "Разное",
        "uk": "Різне",
        "en": "Misc"
      }
    }
```

Main fields:

| Field       | Description                |
| :---------- | :------------------------- |
| name        | Plugin name                |
| url         | Link to the plugin file    |
| description | Plugin description         |
| category    | Plugin category            |

Plugin names, descriptions, and categories have translations into three languages: RU, UK, EN.

---

# Installing a Plugin

When a user installs a plugin:

1.  Multiplugin gets the **plugin URL from the JSON**
2.  Calls the Lampa API to install the extension
3.  The plugin is added to the extensions list

In fact, this does the same thing as manual installation via:

```
Lampa → Extensions → Add plugin
```

---

# Uninstalling Plugins

In Multiplugin, **you can uninstall plugins through the "Installed Plugins" section**, but only those plugins that you installed through Multiplugin itself.

Alternatively, you can uninstall using the standard Lampa method:

```
Settings → Extensions → delete plugin
```

After uninstallation:

-   The plugin disappears from the system
-   It is no longer displayed in the installed list

---

# Updating the Plugin List

The plugin list is stored separately from Multiplugin.

This allows:

-   Adding new plugins
-   Updating links
-   Fixing errors

without updating Multiplugin itself.

Therefore, it is recommended to use **Plugin Synchronization** occasionally.

---

# Multiplugin Structure

Main Multiplugin files:

```
multiplugin.js
```

The main Multiplugin file.

Responsible for:

-   Interface
-   Plugin synchronization
-   Installing extensions
-   Displaying categories

---

```
plugins_mp.json
```

File with the list of available plugins.

Contains:

-   Categories
-   Names
-   Descriptions
-   Installation links

---

# Advantages of Multiplugin

-   Fast plugin installation
-   Convenient category system
-   Install online plugins with one button
-   Easy plugin list updates
-   Minimal system load
-   Plugins work independently of Multiplugin
