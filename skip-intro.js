// =============================================
// Skip Intro & Credits v1.0.1 — стабільна версія
// =============================================

(function() {
    'use strict';

    const PLUGIN_NAME = 'skip-intro';
    const PLUGIN_VERSION = '1.0.1';

    let plugin = {
        settings: {
            enabled: true,
            autoSkipIntro: true,
            showButton: true,
            rememberIntro: true,
            introDuration: 45,
            creditsDuration: 30,
            autoNextDelay: 5
        },
        database: {},
        current: { title: null, season: 1, voice: 'default', isSeries: false }
    };

    function safeGet(obj, path, defaultVal = null) {
        try {
            return path.split('.').reduce((o, k) => o ? o[k] : undefined, obj) ?? defaultVal;
        } catch(e) { return defaultVal; }
    }

    function normalizeTitle(title) {
        return (title || '').replace(/[^\wа-яА-ЯіІїЇєЄ\s]/g, '').trim().toLowerCase();
    }

    function getKey() {
        const t = normalizeTitle(plugin.current.title);
        return t ? `${t}|${plugin.current.season}|${plugin.current.voice}` : null;
    }

    function loadData() {
        try {
            plugin.settings = Object.assign({}, plugin.settings, Lampa.Storage.get(`${PLUGIN_NAME}_settings`) || {});
            plugin.database = Lampa.Storage.get(`${PLUGIN_NAME}_db`) || {};
        } catch(e) {}
    }

    function saveData() {
        try {
            Lampa.Storage.set(`${PLUGIN_NAME}_settings`, plugin.settings);
            Lampa.Storage.set(`${PLUGIN_NAME}_db`, plugin.database);
        } catch(e) {}
    }

    function detectMedia() {
        try {
            const activity = safeGet(Lampa, 'Activity.active', {})();
            const card = activity.card || activity.object || activity.params || {};

            plugin.current.title = card.title || card.name || card.original_name;
            plugin.current.season = parseInt(card.season || card.season_number || 1) || 1;
            plugin.current.voice = card.voice || card.translate || 'default';
            plugin.current.isSeries = !!(card.seasons || card.episodes || card.season);

            return !!plugin.current.title;
        } catch(e) {
            return false;
        }
    }

    // =============================================
    // Player integration (безпечна)
    // =============================================
    function initPlayer() {
        const checkPlayer = setInterval(() => {
            const player = safeGet(Lampa, 'Player.get')();
            const video = player ? (player.video || document.querySelector('video')) : null;

            if (video && video.addEventListener) {
                clearInterval(checkPlayer);

                video.addEventListener('timeupdate', throttle((e) => {
                    handleTimeUpdate(e, video);
                }, 1000));

                console.log(`[${PLUGIN_NAME}] Player listener attached`);
            }
        }, 800);
    }

    function throttle(fn, delay) {
        let last = 0;
        return function(...args) {
            const now = Date.now();
            if (now - last > delay) {
                last = now;
                fn(...args);
            }
        };
    }

    let skipBtn = null;
    let creditsShown = false;

    function handleTimeUpdate(e, video) {
        if (!plugin.settings.enabled || !video) return;

        const time = video.currentTime || 0;
        const dur = video.duration || 0;

        detectMedia();
        const key = getKey();
        const saved = key ? (plugin.database[key] || {}) : {};

        // Кнопка інтро
        if (plugin.settings.showButton && time > 15 && time < (saved.intro || plugin.settings.introDuration + 20) && !skipBtn) {
            showSkipButton(saved.intro || plugin.settings.introDuration);
        }

        // Автопропуск інтро
        if (plugin.settings.autoSkipIntro && time > 5 && time < (saved.intro || plugin.settings.introDuration)) {
            if (Math.abs(time - (saved.intro || plugin.settings.introDuration)) < 3) {
                video.currentTime = saved.intro || plugin.settings.introDuration;
            }
        }

        // Титри
        if (dur > 300 && time > dur - (saved.credits || plugin.settings.creditsDuration + 15) && !creditsShown) {
            showCreditsOverlay(dur);
        }
    }

    function showSkipButton(introTime) {
        if (skipBtn) return;
        skipBtn = document.createElement('div');
        skipBtn.style.cssText = `position:fixed;bottom:90px;right:50px;background:rgba(0,0,0,0.9);color:#fff;padding:14px 32px;border:2px solid #e50914;border-radius:6px;font-weight:700;cursor:pointer;z-index:999999;`;
        skipBtn.textContent = '▶ Пропустити заставку';
        document.body.appendChild(skipBtn);

        skipBtn.onclick = () => {
            const player = safeGet(Lampa, 'Player.get')();
            const video = player ? player.video : document.querySelector('video');
            if (video) {
                const newTime = Math.floor(video.currentTime);
                video.currentTime = introTime || plugin.settings.introDuration;

                const key = getKey();
                if (key) {
                    plugin.database[key] = Object.assign(plugin.database[key] || {}, {intro: newTime});
                    saveData();
                }
            }
            removeSkipButton();
        };

        setTimeout(removeSkipButton, 15000);
    }

    function removeSkipButton() {
        if (skipBtn && skipBtn.parentNode) skipBtn.parentNode.removeChild(skipBtn);
        skipBtn = null;
    }

    function showCreditsOverlay(duration) {
        creditsShown = true;
        // ... (можна додати пізніше, зараз щоб не ламало)
        console.log('[Skip Intro] Credits zone reached');
    }

    // =============================================
    // Налаштування (спрощені)
    // =============================================
    function addToSettings() {
        try {
            Lampa.Settings.add({
                component: PLUGIN_NAME,
                title: 'Skip Intro & Credits',
                onReady: function() {
                    Lampa.Settings.html(`
                        <div style="padding:15px 20px;">
                            <h2>Skip Intro & Credits</h2>
                            <p>Плагін завантажено (v${PLUGIN_VERSION})</p>
                            <p>Перезапустіть Lampa для повної ініціалізації.</p>
                        </div>
                    `);
                }
            });
        } catch(e) {}
    }

    // =============================================
    // Старт
    // =============================================
    function start() {
        console.log(`%c[Skip Intro] v${PLUGIN_VERSION} — спроба запуску`, 'color:#e50914');

        try {
            loadData();
            addToSettings();
            initPlayer();
        } catch(e) {
            console.error('[Skip Intro] Error during init:', e);
        }
    }

    // Запуск
    if (typeof Lampa !== 'undefined') {
        Lampa.on('init', start);
        setTimeout(start, 2000); // запасний варіант
    } else {
        window.addEventListener('load', start);
    }

    window.SkipIntro = plugin;
})();
