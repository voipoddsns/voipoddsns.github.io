(function () {
    'use strict';

    if (window.SkipIntroPlugin) return;
    window.SkipIntroPlugin = true;

    const STORAGE_KEY = 'skip_intro_db';
    const SETTINGS_KEY = 'skip_intro_settings';

    const plugin = {
        name: 'Skip Intro',
        version: '1.0.0',
        author: 'ChatGPT',

        settings: {
            enabled: true,
            autoSkipIntro: false,
            showIntroButton: true,
            rememberIntro: true,
            introSeconds: 90,
            creditsSeconds: 30,
            autoNextEpisode: true,
            nextEpisodeDelay: 5
        },

        state: {
            player: null,
            introShown: false,
            creditsShown: false,
            duration: 0,
            cardId: null,
            season: null,
            episode: null,
            introBtn: null,
            creditsBtn: null,
            countdownTimer: null
        },

        // ---------- ІНІЦІАЛІЗАЦІЯ ----------
        init() {
            console.log('[SkipIntro] Plugin loaded v' + this.version);

            this.loadSettings();
            this.injectStyles();

            if (window.Lampa) {
                this.addSettingsMenu();
                this.listenLampaPlayer();
            }

            if (window.Lampa && Lampa.Noty) {
                Lampa.Noty.show('Skip Intro завантажено');
            }

            this.observePlayer();
        },

        // ---------- НАЛАШТУВАННЯ (LocalStorage) ----------
        loadSettings() {
            try {
                const raw = localStorage.getItem(SETTINGS_KEY);
                if (raw) Object.assign(this.settings, JSON.parse(raw));
            } catch (e) {
                console.error('[SkipIntro] settings load error', e);
            }
        },

        saveSettings() {
            try {
                localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
            } catch (e) {
                console.error('[SkipIntro] settings save error', e);
            }
        },

        // ---------- БАЗА ЗАПАМ'ЯТОВУВАННЯ ----------
        loadDB() {
            try {
                return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            } catch (e) {
                return {};
            }
        },

        saveDB(db) {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
            } catch (e) {
                console.error('[SkipIntro] db save error', e);
            }
        },

        getDBKey() {
            // ключ: серіал + сезон (озвучку можна додати окремо)
            const id = this.state.cardId || 'unknown';
            const season = this.state.season != null ? this.state.season : '0';
            return id + '_s' + season;
        },

        rememberIntroTime(seconds) {
            if (!this.settings.rememberIntro) return;
            const db = this.loadDB();
            db[this.getDBKey()] = {
                intro: Math.round(seconds),
                updated: Date.now()
            };
            this.saveDB(db);
            console.log('[SkipIntro] Запам\'ятовано інтро:', seconds, 'для', this.getDBKey());
        },

        getRememberedIntro() {
            if (!this.settings.rememberIntro) return null;
            const db = this.loadDB();
            const rec = db[this.getDBKey()];
            return rec ? rec.intro : null;
        },

        exportDB() {
            return JSON.stringify(this.loadDB(), null, 2);
        },

        importDB(json) {
            try {
                const data = JSON.parse(json);
                this.saveDB(data);
                if (window.Lampa && Lampa.Noty) Lampa.Noty.show('Базу імпортовано');
            } catch (e) {
                if (window.Lampa && Lampa.Noty) Lampa.Noty.show('Помилка імпорту');
            }
        },

        // ---------- ВИЗНАЧЕННЯ СЕРІАЛУ ----------
        detectCard() {
            try {
                if (window.Lampa && Lampa.Player && Lampa.Player.playdata) {
                    const data = Lampa.Player.playdata();
                    if (data) {
                        this.state.cardId = data.card ? (data.card.id || data.card.imdb_id || data.card.original_title) : null;
                        this.state.season = data.season != null ? data.season : null;
                        this.state.episode = data.episode != null ? data.episode : null;
                    }
                }
                // запасний варіант — Activity
                if (!this.state.cardId && window.Lampa && Lampa.Activity) {
                    const act = Lampa.Activity.active();
                    if (act && act.card) {
                        this.state.cardId = act.card.id || act.card.imdb_id || act.card.original_title;
                    }
                }
            } catch (e) {
                console.error('[SkipIntro] detectCard error', e);
            }
            console.log('[SkipIntro] card:', this.state.cardId, 's', this.state.season, 'e', this.state.episode);
        },

        // ---------- СЛУХАЧ ПЛЕЄРА LAMPA ----------
        listenLampaPlayer() {
            const self = this;
            try {
                if (Lampa.Player && Lampa.Player.listener) {
                    Lampa.Player.listener.follow('start', function () {
                        self.detectCard();
                        self.resetState();
                    });
                }
            } catch (e) {
                console.error('[SkipIntro] listenLampaPlayer error', e);
            }
        },

        resetState() {
            this.state.introShown = false;
            this.state.creditsShown = false;
            this.removeIntroButton();
            this.removeCreditsButton();
            if (this.state.countdownTimer) {
                clearInterval(this.state.countdownTimer);
                this.state.countdownTimer = null;
            }
        },

        // ---------- ВІДСТЕЖЕННЯ HTML5 ПЛЕЄРА ----------
        observePlayer() {
            const self = this;

            document.addEventListener('play', function (e) {
                if (e.target && e.target.tagName === 'VIDEO') {
                    self.state.player = e.target;
                    self.attachPlayer(self.state.player);
                }
            }, true);
        },

        attachPlayer(player) {
            if (!player || player.__skipIntroAttached) return;
            player.__skipIntroAttached = true;

            const self = this;

            player.addEventListener('loadedmetadata', () => {
                self.state.duration = player.duration || 0;
                self.resetState();
                self.detectCard();
            });

            player.addEventListener('timeupdate', () => {
                self.onTimeUpdate(player);
            });

            player.addEventListener('ended', () => {
                self.onEnded(player);
            });
        },

        // ---------- ОБРОБКА ЧАСУ ----------
        onTimeUpdate(player) {
            if (!this.settings.enabled) return;

            const current = player.currentTime;
            const duration = player.duration || 0;

            // --- ІНТРО ---
            const remembered = this.getRememberedIntro();

            // якщо є запам'ятований час і увімкнено авто-скіп
            if (
                this.settings.autoSkipIntro &&
                remembered &&
                !this.state.introShown &&
                current >= 1 &&
                current < remembered
            ) {
                this.state.introShown = true;
                player.currentTime = remembered;
                if (window.Lampa && Lampa.Noty) Lampa.Noty.show('Інтро пропущено');
                return;
            }

            // показ кнопки в перші секунди
            if (
                this.settings.showIntroButton &&
                !this.state.introShown &&
                current >= 3 &&
                current <= 25
            ) {
                this.state.introShown = true;
                this.showIntroButton(player);
            }

            // --- ТИТРИ ---
            if (
                !this.state.creditsShown &&
                duration > 0 &&
                current >= duration - this.settings.creditsSeconds
            ) {
                this.state.creditsShown = true;
                this.showCreditsButton(player);
            }
        },

        onEnded(player) {
            if (this.settings.autoNextEpisode) {
                this.nextEpisode();
            }
        },

        // ---------- КНОПКА «ПРОПУСТИТИ ІНТРО» ----------
        showIntroButton(player) {
            const self = this;
            this.removeIntroButton();

            const remembered = this.getRememberedIntro();
            const skipTo = remembered || (player.currentTime + this.settings.introSeconds);

            const btn = document.createElement('div');
            btn.className = 'skip-intro-btn selector';
            btn.textContent = 'Пропустити інтро';
            btn.tabIndex = 0;

            const doSkip = function () {
                const from = player.currentTime;
                player.currentTime = skipTo;
                // запам'ятовуємо момент кінця інтро
                self.rememberIntroTime(skipTo);
                self.removeIntroButton();
                if (window.Lampa && Lampa.Noty) Lampa.Noty.show('Інтро пропущено');
            };

            btn.addEventListener('click', doSkip);
            btn.addEventListener('hover:enter', doSkip);
            // підтримка пульта
            btn.addEventListener('keydown', function (e) {
                if (e.keyCode === 13) doSkip();
            });

            document.body.appendChild(btn);
            this.state.introBtn = btn;

            // фокус для пульта Lampa
            this.enableRemote(btn);

            // приховати через 12 секунд
            setTimeout(() => self.removeIntroButton(), 12000);
        },

        removeIntroButton() {
            if (this.state.introBtn) {
                this.state.introBtn.remove();
                this.state.introBtn = null;
            }
        },

        // ---------- КНОПКА «ПРОПУСТИТИ ТИТРИ / НАСТУПНА СЕРІЯ» ----------
        showCreditsButton(player) {
            const self = this;
            this.removeCreditsButton();

            const wrap = document.createElement('div');
            wrap.className = 'skip-credits-wrap';

            const label = document.createElement('div');
            label.className = 'skip-credits-label';

            const btn = document.createElement('div');
            btn.className = 'skip-intro-btn selector';
            btn.tabIndex = 0;
            btn.textContent = '▶ Наступна серія';

            wrap.appendChild(label);
            wrap.appendChild(btn);
            document.body.appendChild(wrap);
            this.state.creditsBtn = wrap;

            const goNext = function () {
                self.removeCreditsButton();
                self.nextEpisode();
            };

            btn.addEventListener('click', goNext);
            btn.addEventListener('hover:enter', goNext);
            btn.addEventListener('keydown', function (e) {
                if (e.keyCode === 13) goNext();
            });

            this.enableRemote(btn);

            // зворотний відлік
            if (this.settings.autoNextEpisode && this.settings.nextEpisodeDelay > 0) {
                let left = this.settings.nextEpisodeDelay;
                label.textContent = 'Наступна серія через ' + left + '…';

                this.state.countdownTimer = setInterval(() => {
                    left--;
                    if (left <= 0) {
                        clearInterval(self.state.countdownTimer);
                        self.state.countdownTimer = null;
                        goNext();
                    } else {
                        label.textContent = 'Наступна серія через ' + left + '…';
                    }
                }, 1000);
            } else {
                label.textContent = 'Пропустити титри';
            }
        },

        removeCreditsButton() {
            if (this.state.creditsBtn) {
                this.state.creditsBtn.remove();
                this.state.creditsBtn = null;
            }
            if (this.state.countdownTimer) {
                clearInterval(this.state.countdownTimer);
                this.state.countdownTimer = null;
            }
        },

        // ---------- ПЕРЕХІД НА НАСТУПНУ СЕРІЮ ----------
        nextEpisode() {
            console.log('[SkipIntro] Next episode');
            try {
                if (window.Lampa && Lampa.Player && typeof Lampa.Player.next === 'function') {
                    Lampa.Player.next();
                } else if (window.Lampa && Lampa.PlayerVideo && Lampa.PlayerVideo.next) {
                    Lampa.PlayerVideo.next();
                }
            } catch (e) {
                console.error('[SkipIntro] nextEpisode error', e);
            }
        },

        // ---------- ПІДТРИМКА ПУЛЬТА ----------
        enableRemote(element) {
            try {
                if (window.Lampa && Lampa.Controller) {
                    // дозволяємо фокусуватись засобами Lampa
                    element.addEventListener('hover:focus', () => {
                        element.classList.add('focus');
                    });
                    element.addEventListener('hover:blur', () => {
                        element.classList.remove('focus');
                    });
                }
            } catch (e) {}
        },

        // ---------- СТИЛІ (анімація Netflix) ----------
        injectStyles() {
            if (document.getElementById('skip-intro-styles')) return;
            const css = `
                .skip-intro-btn {
                    position: fixed;
                    right: 4em;
                    bottom: 6em;
                    z-index: 9999;
                    padding: 0.9em 1.8em;
                    background: rgba(20,20,20,0.85);
                    color: #fff;
                    font-size: 1.4em;
                    font-weight: 600;
                    border: 2px solid rgba(255,255,255,0.85);
                    border-radius: 0.4em;
                    cursor: pointer;
                    opacity: 0;
                    transform: translateY(20px);
                    animation: skipFadeIn 0.4s forwards;
                    transition: background 0.2s, transform 0.2s, border-color 0.2s;
                    backdrop-filter: blur(4px);
                }
                .skip-intro-btn.focus,
                .skip-intro-btn:hover {
                    background: #fff;
                    color: #000;
                    border-color: #fff;
                    transform: scale(1.05);
                }
                .skip-credits-wrap {
                    position: fixed;
                    right: 4em;
                    bottom: 6em;
                    z-index: 9999;
                    text-align: right;
                    animation: skipFadeIn 0.4s forwards;
                }
                .skip-credits-label {
                    color: #fff;
                    font-size: 1.1em;
                    margin-bottom: 0.6em;
                    text-shadow: 0 1px 4px rgba(0,0,0,0.8);
                }
                .skip-credits-wrap .skip-intro-btn {
                    position: static;
                    animation: none;
                    opacity: 1;
                    transform: none;
                    display: inline-block;
                }
                @keyframes skipFadeIn {
                    to { opacity: 1; transform: translateY(0); }
                }
            `;
            const style = document.createElement('style');
            style.id = 'skip-intro-styles';
            style.textContent = css;
            document.head.appendChild(style);
        },

        // ---------- МЕНЮ НАЛАШТУВАНЬ LAMPA ----------
        addSettingsMenu() {
            const self = this;
            try {
                if (!Lampa.SettingsApi) return;

                Lampa.SettingsApi.addComponent({
                    component: 'skip_intro',
                    name: 'Skip Intro',
                    icon: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M4 5v14l8-7zM13 5v14l8-7z"/></svg>'
                });

                // Увімкнути
                Lampa.SettingsApi.addParam({
                    component: 'skip_intro',
                    param: { name: 'si_enabled', type: 'trigger', default: self.settings.enabled },
                    field: { name: 'Увімкнути' },
                    onChange: (v) => { self.settings.enabled = (v === true || v === 'true'); self.saveSettings(); }
                });

                Lampa.SettingsApi.addParam({
                    component: 'skip_intro',
                    param: { name: 'si_auto', type: 'trigger', default: self.settings.autoSkipIntro },
                    field: { name: 'Автоматично пропускати інтро' },
                    onChange: (v) => { self.settings.autoSkipIntro = (v === true || v === 'true'); self.saveSettings(); }
                });

                Lampa.SettingsApi.addParam({
                    component: 'skip_intro',
                    param: { name: 'si_showbtn', type: 'trigger', default: self.settings.showIntroButton },
                    field: { name: 'Показувати кнопку' },
                    onChange: (v) => { self.settings.showIntroButton = (v === true || v === 'true'); self.saveSettings(); }
                });

                Lampa.SettingsApi.addParam({
                    component: 'skip_intro',
                    param: { name: 'si_remember', type: 'trigger', default: self.settings.rememberIntro },
                    field: { name: 'Запам\'ятовувати інтро' },
                    onChange: (v) => { self.settings.rememberIntro = (v === true || v === 'true'); self.saveSettings(); }
                });

                // Тривалість інтро
                Lampa.SettingsApi.addParam({
                    component: 'skip_intro',
                    param: {
                        name: 'si_intro_sec',
                        type: 'select',
                        values: { 30: '30', 45: '45', 60: '60', 90: '90', 120: '120' },
                        default: String(self.settings.introSeconds)
                    },
                    field: { name: 'Тривалість інтро (сек)' },
                    onChange: (v) => { self.settings.introSeconds = parseInt(v); self.saveSettings(); }
                });

                // Тривалість титрів
                Lampa.SettingsApi.addParam({
                    component: 'skip_intro',
                    param: {
                        name: 'si_credits_sec',
                        type: 'select',
                        values: { 15: '15', 20: '20', 30: '30', 45: '45', 60: '60' },
                        default: String(self.settings.creditsSeconds)
                    },
                    field: { name: 'Титри (сек до кінця)' },
                    onChange: (v) => { self.settings.creditsSeconds = parseInt(v); self.saveSettings(); }
                });

                // Автонаступна серія
                Lampa.SettingsApi.addParam({
                    component: 'skip_intro',
                    param: {
                        name: 'si_next_delay',
                        type: 'select',
                        values: { '-1': 'Вимкнено', 3: '3 сек', 5: '5 сек', 10: '10 сек' },
                        default: String(self.settings.autoNextEpisode ? self.settings.nextEpisodeDelay : -1)
                    },
                    field: { name: 'Автонаступна серія' },
                    onChange: (v) => {
                        const n = parseInt(v);
                        if (n === -1) {
                            self.settings.autoNextEpisode = false;
                        } else {
                            self.settings.autoNextEpisode = true;
                            self.settings.nextEpisodeDelay = n;
                        }
                        self.saveSettings();
                    }
                });

                // Очистити базу
                Lampa.SettingsApi.addParam({
                    component: 'skip_intro',
                    param: { name: 'si_clear', type: 'button' },
                    field: { name: 'Очистити базу інтро' },
                    onChange: () => {
                        localStorage.removeItem(STORAGE_KEY);
                        if (Lampa.Noty) Lampa.Noty.show('Базу очищено');
                    }
                });

            } catch (e) {
                console.error('[SkipIntro] addSettingsMenu error', e);
            }
        }
    };

    // запуск після готовності Lampa
    if (window.Lampa && Lampa.Listener) {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') plugin.init();
        });
        // на випадок якщо app вже ready
        setTimeout(() => { if (!window.__skipInited) { window.__skipInited = true; plugin.init(); } }, 500);
    } else {
        plugin.init();
    }

    window.SkipIntro = plugin; // для імпорту/експорту з консолі

})();
