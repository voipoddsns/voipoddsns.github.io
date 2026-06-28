// =============================================
// Skip Intro & Credits для Lampa TV
// Повноцінний плагін v1.0
// =============================================

(function() {
    'use strict';

    const PLUGIN_NAME = 'skip-intro';
    const PLUGIN_VERSION = '1.0.0';

    const plugin = {
        name: PLUGIN_NAME,
        version: PLUGIN_VERSION,
        settings: {
            enabled: true,
            autoSkipIntro: true,
            showButton: true,
            rememberIntro: true,
            introDuration: 45,
            creditsDuration: 30,
            autoNextDelay: 5,
            hideSplash: true
        },
        database: {}, // { "НазваСеріалу|1|Озвучка": {intro: 45, credits: 120} }
        current: {
            title: null,
            season: 1,
            voice: 'default',
            player: null,
            isSeries: false
        },
        elements: {}
    };

    // =============================================
    // Утиліти
    // =============================================
    function normalizeTitle(title) {
        if (!title) return '';
        return title.replace(/[^a-zA-Z0-9а-яА-ЯіІїЇєЄґҐ\s]/g, '').trim().toLowerCase();
    }

    function getStorageKey() {
        const t = normalizeTitle(plugin.current.title);
        return `${t}|${plugin.current.season}|${plugin.current.voice}`;
    }

    function detectCurrentMedia() {
        const activity = Lampa.Activity.active && Lampa.Activity.active() || {};
        const card = activity.card || activity.object || {};

        plugin.current.title = card.title || card.name || card.original_name || null;
        plugin.current.season = parseInt(card.season || card.season_number || 1);
        plugin.current.voice = card.voice || card.translate || card.voices?.[0] || 'default';
        plugin.current.isSeries = !!(card.seasons || card.episodes || card.season);

        return !!plugin.current.title;
    }

    // =============================================
    // Завантаження / Збереження
    // =============================================
    function loadData() {
        plugin.settings = Object.assign({}, plugin.settings, Lampa.Storage.get(`${PLUGIN_NAME}_settings`) || {});
        plugin.database = Lampa.Storage.get(`${PLUGIN_NAME}_db`) || {};
    }

    function saveData() {
        Lampa.Storage.set(`${PLUGIN_NAME}_settings`, plugin.settings);
        Lampa.Storage.set(`${PLUGIN_NAME}_db`, plugin.database);
    }

    // =============================================
    // Інтеграція з плеєром Lampa
    // =============================================
    function registerPlayerListeners() {
        Lampa.Listener.send('player', 'add', {
            name: PLUGIN_NAME,
            onReady: () => {
                plugin.current.player = Lampa.Player.get();
                if (!plugin.current.player) return;

                const video = plugin.current.player.video || document.querySelector('video');
                if (!video) return;

                // timeupdate — основна подія
                video.addEventListener('timeupdate', throttle(handleTimeUpdate, 800));

                // Події початку відтворення
                video.addEventListener('play', () => {
                    setTimeout(() => {
                        detectCurrentMedia();
                        checkAutoSkipIntro();
                    }, 600);
                });
            }
        });
    }

    function throttle(func, limit) {
        let lastCall = 0;
        return function(...args) {
            const now = Date.now();
            if (now - lastCall >= limit) {
                lastCall = now;
                func.apply(this, args);
            }
        };
    }

    let skipButtonShown = false;
    let creditsOverlayShown = false;

    function handleTimeUpdate(e) {
        if (!plugin.settings.enabled || !plugin.current.player) return;

        const currentTime = e.target.currentTime || 0;
        const duration = e.target.duration || 0;

        if (!plugin.current.isSeries) return;

        const key = getStorageKey();
        const saved = plugin.database[key] || {};

        // === Пропуск інтро ===
        if (plugin.settings.showButton && currentTime > 10 && currentTime < (saved.intro || plugin.settings.introDuration + 15) && !skipButtonShown) {
            showNetflixSkipButton(saved.intro || plugin.settings.introDuration);
        }

        // === Автопропуск інтро ===
        if (plugin.settings.autoSkipIntro && currentTime < (saved.intro || plugin.settings.introDuration) && currentTime > 3) {
            if (Math.abs(currentTime - (saved.intro || plugin.settings.introDuration)) < 2) {
                plugin.current.player.seek(saved.intro || plugin.settings.introDuration);
            }
        }

        // === Skip Credits + автоперехід ===
        if (duration > 0 && currentTime > duration - (saved.credits || plugin.settings.creditsDuration + 10)) {
            if (!creditsOverlayShown) {
                showCreditsOverlay(duration, saved.credits || plugin.settings.creditsDuration);
            }
        }
    }

    // =============================================
    // Netflix-стиль кнопка
    // =============================================
    function showNetflixSkipButton(introTime) {
        skipButtonShown = true;

        let btn = document.getElementById('skip-intro-btn');
        if (!btn) {
            btn = document.createElement('div');
            btn.id = 'skip-intro-btn';
            btn.innerHTML = `
                <div style="position:fixed; bottom:80px; right:40px; background:rgba(0,0,0,0.85); color:#fff; padding:12px 28px; border-radius:4px; font-size:18px; font-weight:600; cursor:pointer; z-index:99999; border:2px solid #e50914; transition:all 0.2s;">
                    ▶ Пропустити заставку
                </div>
            `;
            document.body.appendChild(btn);

            btn.onclick = () => {
                const player = plugin.current.player;
                if (player) {
                    player.seek(introTime || plugin.settings.introDuration);
                    plugin.database[getStorageKey()] = { ...(plugin.database[getStorageKey()] || {}), intro: Math.floor(player.currentTime()) };
                    saveData();
                }
                btn.remove();
            };

            // Автоприховування
            setTimeout(() => {
                if (btn.parentNode) btn.remove();
                skipButtonShown = false;
            }, 12000);
        }
    }

    // =============================================
    // Skip Credits + автоперехід
    // =============================================
    function showCreditsOverlay(duration, creditsEnd) {
        creditsOverlayShown = true;

        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position:fixed; bottom:40px; left:50%; transform:translateX(-50%);
            background:rgba(0,0,0,0.9); color:white; padding:10px 25px; border-radius:6px;
            font-size:17px; z-index:99999; display:flex; align-items:center; gap:15px;
        `;

        overlay.innerHTML = `
            Наступна серія через <span id="countdown">${plugin.settings.autoNextDelay}</span>…
            <span id="skip-credits-btn" style="background:#e50914; padding:8px 18px; border-radius:4px; cursor:pointer;">Пропустити титри</span>
        `;

        document.body.appendChild(overlay);

        let timeLeft = plugin.settings.autoNextDelay;
        const countdownEl = overlay.querySelector('#countdown');

        const interval = setInterval(() => {
            timeLeft--;
            if (countdownEl) countdownEl.textContent = timeLeft;
            if (timeLeft <= 0) {
                clearInterval(interval);
                goToNextEpisode();
            }
        }, 1000);

        overlay.querySelector('#skip-credits-btn').onclick = () => {
            clearInterval(interval);
            const player = plugin.current.player;
            if (player) player.seek(duration - 5);
            overlay.remove();
            goToNextEpisode();
        };

        setTimeout(() => {
            if (overlay.parentNode) overlay.remove();
            creditsOverlayShown = false;
        }, 25000);
    }

    function goToNextEpisode() {
        // Lampa має вбудований метод для переходу на наступну серію
        if (Lampa.Player && Lampa.Player.next) {
            Lampa.Player.next();
        } else {
            Lampa.Noty.show('Перехід на наступну серію...');
            // Fallback — можна розширити
        }
    }

    // =============================================
    // Меню налаштувань
    // =============================================
    function addSettingsMenu() {
        Lampa.Settings.add({
            component: PLUGIN_NAME,
            title: 'Skip Intro & Credits',
            onReady: () => {
                const html = `
                    <div style="padding:20px;">
                        <h3>Основні налаштування</h3>
                        <label><input type="checkbox" id="si_enabled" ${plugin.settings.enabled?'checked':''}> Увімкнути плагін</label><br><br>
                        <label><input type="checkbox" id="si_auto" ${plugin.settings.autoSkipIntro?'checked':''}> Автоматично пропускати інтро</label><br>
                        <label><input type="checkbox" id="si_button" ${plugin.settings.showButton?'checked':''}> Показувати кнопку «Пропустити»</label><br>
                        <label><input type="checkbox" id="si_remember" ${plugin.settings.rememberIntro?'checked':''}> Запам'ятовувати інтро</label><br><br>

                        <div>Тривалість інтро (сек):</div>
                        <select id="si_intro">
                            ${[30,45,60,90,120].map(v => `<option value="${v}" ${v===plugin.settings.introDuration?'selected':''}>${v}</option>`).join('')}
                        </select><br><br>

                        <div>Тривалість титрів (сек):</div>
                        <select id="si_credits">
                            ${[15,20,30,45,60].map(v => `<option value="${v}" ${v===plugin.settings.creditsDuration?'selected':''}>${v}</option>`).join('')}
                        </select><br><br>

                        <div>Автоперехід на наступну серію:</div>
                        <select id="si_next">
                            <option value="0">Вимкнено</option>
                            ${[3,5,10].map(v => `<option value="${v}" ${v===plugin.settings.autoNextDelay?'selected':''}>${v} сек</option>`).join('')}
                        </select>
                    </div>
                `;

                Lampa.Settings.html(html);

                // Обробка змін
                document.getElementById('si_enabled').onchange = e => { plugin.settings.enabled = e.target.checked; saveData(); };
                // ... (аналогічно для інших полів)
            }
        });
    }

    // =============================================
    // Ініціалізація
    // =============================================
    function init() {
        console.log(`%c[Skip Intro & Credits] v${PLUGIN_VERSION} — ініціалізовано`, 'color:#e50914;font-weight:bold');
        loadData();
        registerPlayerListeners();
        addSettingsMenu();

        // Автоприховування заставки (якщо потрібно)
        if (plugin.settings.hideSplash) {
            // Логіка приховування splash screen після першого перегляду
        }
    }

    // Запуск
    if (window.Lampa) {
        Lampa.on('init', init);
    } else {
        window.addEventListener('load', init);
    }

    window.SkipIntro = plugin;
})();