(function () {
    'use strict';

    if (window.SkipIntroPlugin) return;
    window.SkipIntroPlugin = true;

    const STORAGE_KEY = 'skip_intro_db';
    const SETTINGS_KEY = 'skip_intro_settings';

    const plugin = {
        name: 'Skip Intro',
        version: '1.1.0-Fix', // Оновлена версія
        author: 'ChatGPT',

        settings: {
            enabled: true,
            autoSkipIntro: false,
            showIntroButton: true,
            rememberIntro: true,
            introSeconds: 90,
            creditsSeconds: 30,
            autoNextEpisode: true,
            nextEpisodeDelay: 5,
            debug: false // Увімкніть true для відлагодження помилок у консолі
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
            countdownTimer: null,
            episodeLoaded: false
        },

        // ---------- ІНІЦІАЛІЗАЦІЯ ----------
        init() {
            console.log('[SkipIntro] Plugin v' + this.version + ' loaded');
            this.debug('Initializing...');

            this.loadSettings();
            this.injectStyles();

            if (window.Lampa) {
                this.addSettingsMenu();
            }

            if (window.Lampa && Lampa.Noty) {
                Lampa.Noty.show('Skip Intro готово');
            }

            this.observePlayer();
            this.state.episodeLoaded = true;
        },

        debug(msg) {
            if (this.settings.debug || navigator.userAgent.indexOf('Chrome') > -1) {
                console.log('[SkipIntro]', msg);
            }
        },

        // ---------- НАЛАШТУВАННЯ (LocalStorage) ----------
        loadSettings() {
            try {
                const raw = localStorage.getItem(SETTINGS_KEY);
                if (raw) Object.assign(this.settings, JSON.parse(raw));
            } catch (e) {
                this.debug('settings load error', e);
            }
        },

        saveSettings() {
            try {
                localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
                this.debug('Settings saved');
            } catch (e) {
                this.debug('settings save error', e);
            }
        },

        // ---------- БАЗА ЗАПАМ'ЯТОВУВАННЯ ----------
        loadDB() {
            try {
                return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            } catch (e) { return {}; }
        },

        saveDB(db) {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
                this.debug('DB saved');
            } catch (e) { this.debug('db save error', e); }
        },

        getDBKey() {
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
            this.debug('Saved intro time:', seconds, 'for', this.getDBKey());
        },

        getRememberedIntro() {
            if (!this.settings.rememberIntro) return null;
            const db = this.loadDB();
            const rec = db[this.getDBKey()];
            return rec ? rec.intro : null;
        },

        // ---------- ВИЗНАЧЕННЯ СЕРІАЛУ ----------
        detectCard() {
            const self = this;
            try {
                // 1. Перевірка даних про відтворення (найнадійніший спосіб)
                if (window.Lampa && Lampa.Player && Lampa.Player.context) {
                    // Отримуємо дані поточної картки контексту
                    const ctxData = Lampa.Player.context ? Lampa.Player.context() : {};
                    if (ctxData.card) {
                        this.state.cardId = ctxData.card.id || ctxData.card.imdb_id || ctxData.card.original_title || Date.now().toString();
                        this.state.season = ctxData.season != null ? ctxData.season : null;
                        this.state.episode = ctxData.episode != null ? ctxData.episode : null;
                    }
                }
                
                // 2. Запасний варіант: глобальна подія (якщо використовується Lampa Core)
                if (!this.state.cardId && window.Lampa && Lampa.Activity) {
                    const act = Lampa.Activity.active();
                    if (act && act.card) {
                         this.state.cardId = act.card.id || act.card.imdb_id || act.card.original_title;
                    }
                }
            } catch (e) {
                this.debug('detectCard error', e);
            }
            
            if (this.state.debug) {
                this.debug('Context:', this.state.cardId, 'S:' + this.state.season, 'E:' + this.state.episode);
            }
        },

        // ---------- ОБРОБКА ЧАСУ ПЛЕЄРА ----------
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
            
            // Очищення попередніх слухачів (щоб не було дублів)
            player.removeEventListener('loadedmetadata', self.onMetadataHandler);
            player.removeEventListener('timeupdate', self.onTimeHandler);
            player.removeEventListener('ended', self.onEndedHandler);

            player.addEventListener('loadedmetadata', () => {
                this.state.duration = player.duration || 0;
                this.resetState();
                this.detectCard();
                if (this.settings.debug) this.debug('Metadata loaded:', this.state.duration);
            });

            player.addEventListener('timeupdate', () => {
                this.onTimeUpdate(player);
            });

            player.addEventListener('ended', () => {
                this.debug('Video Ended Event Triggered');
                setTimeout(() => {
                    if (this.settings.autoNextEpisode) this.nextEpisode();
                }, 1000); // Затримка для стабільності
            });
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

        onTimeUpdate(player) {
            if (!this.settings.enabled) return;

            const current = player.currentTime;
            const duration = player.duration || 0;

            // --- ЛОГІКА ІНТРО ---
            const remembered = this.getRememberedIntro();

            if (this.settings.autoSkipIntro && remembered && !this.state.introShown && current >= 1 && current < remembered) {
                this.state.introShown = true;
                player.currentTime = remembered;
                this.debug('Auto skipped intro by timer');
                if (window.Lampa && Lampa.Noty) Lampa.Noty.show('Інтро пропущено');
                return;
            }

            if (this.settings.showIntroButton && !this.state.introShown && current >= 3 && current <= 25) {
                this.state.introShown = true;
                this.showIntroButton(player);
            }

            // --- ЛОГІКА ТИТРІВ ---
            if (!this.state.creditsShown && duration > 0 && current >= duration - this.settings.creditsSeconds) {
                this.state.creditsShown = true;
                this.showCreditsButton(player);
            }
        },

        // ---------- КНОПКИ UI ----------
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
                self.rememberIntroTime(skipTo);
                self.removeIntroButton();
                if (window.Lampa && Lampa.Noty) Lampa.Noty.show('Інтро пропущено');
            };

            btn.onclick = doSkip;
            btn.onkeydown = function (e) { if (e.key === 'Enter') doSkip(); };
            btn.onmouseover = function () { btn.classList.add('focus'); };
            btn.onmouseleave = function () { btn.classList.remove('focus'); };

            document.body.appendChild(btn);
            this.state.introBtn = btn;
            setTimeout(() => self.removeIntroButton(), 15000);
        },

        removeIntroButton() {
            if (this.state.introBtn) {
                this.state.introBtn.remove();
                this.state.introBtn = null;
            }
        },

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

            btn.onclick = goNext;
            btn.onkeydown = function (e) { if (e.key === 'Enter') goNext(); };
            btn.onmouseover = function () { btn.classList.add('focus'); };
            btn.onmouseleave = function () { btn.classList.remove('focus'); };

            this.enableRemote(btn);

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
                label.textContent = '[Клікніть, щоб перейти до наступної]';
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

        // ---------- ГОЛОВНЕ: ПЕРЕХІД ДО НАСТУПНОЇ СЕРІЇ ----------
        nextEpisode() {
            this.debug('Attempting Next Episode...');
            
            // Шлях 1: Прямий виклик API плеєра (затримка для надійності)
            setTimeout(() => {
                if (!window.Lampa) return this.debug('Lampa object missing');

                // Спроба 1: Стандартний метод next()
                if (typeof Lampa.Player?.next === 'function') {
                    try {
                        this.debug('Calling Lampa.Player.next()');
                        Lampa.Player.next();
                        if (window.Lampa && Lampa.Noty) Lampa.Noty.hideAll();
                        return;
                    } catch (err) {
                        this.debug('Method next() failed:', err);
                    }
                }

                // Спроба 2: Контролер Lampa (команди пульта)
                if (typeof Lampa.Controller?.execute === 'function') {
                    try {
                        this.debug('Using Lampa.Controller.execute("next")');
                        Lampa.Controller.execute('next');
                        if (window.Lampa && Lampa.Noty) Lampa.Noty.hideAll();
                        return;
                    } catch (err) {
                        this.debug('Controller execute failed:', err);
                    }
                }

                // Спроба 3: Перезавантаження контексту (резервний варіант)
                if (typeof Lampa.Activity?.reload === 'function') {
                     try {
                         this.debug('Reloading Activity context');
                         Lampa.Activity.reload();
                         if (window.Lampa && Lampa.Noty) Lampa.Noty.hideAll();
                         return;
                     } catch (err) {
                         this.debug('Activity reload failed:', err);
                     }
                }

                // Фінал: Якщо нічого не спрацювало - лог
                this.debug('WARNING: Auto next episode failed. Please check your console.');
                if (window.Lampa && Lampa.Noty) {
                   // Lampa.Noty.show('Автонумерування не спрацювало'); 
                }

            }, 500);
        },

        // ---------- ДОДАТКОВИЙ ФУНКЦІОНАЛ ----------
        injectStyles() {
            if (document.getElementById('skip-intro-styles')) return;
            const css = `
                .skip-intro-btn {
                    position: fixed; right: 4em; bottom: 6em; z-index: 9999;
                    padding: 0.8em 1.5em; background: rgba(0,0,0,0.75); color: #fff;
                    font-size: 1.2em; border: 1px solid #fff; border-radius: 4px;
                    opacity: 0; transform: translateY(20px); animation: fadeIn 0.4s forwards;
                }
                .skip-intro-btn:hover, .skip-intro-btn:focus { background: #fff; color: #000; }
                .skip-credits-wrap { position: fixed; right: 4em; bottom: 6em; z-index: 9999; text-align: right; animation: fadeIn 0.4s forwards; }
                .skip-credits-label { color: #fff; font-size: 1em; margin-bottom: 0.5em; }
                @keyframes fadeIn { to { opacity: 1; transform: translateY(0); } }
            `;
            const style = document.createElement('style');
            style.id = 'skip-intro-styles';
            style.textContent = css;
            document.head.appendChild(style);
        },

        addSettingsMenu() {
            const self = this;
            try {
                if (!Lampa.SettingsApi) return;
                // ... Код меню залишено без змін, але додамо Debug параметр ...
                
                Lampa.SettingsApi.addComponent({ component: 'skip_intro', name: 'Skip Intro' });
                
                // Параметр Debug (для тестування)
                Lampa.SettingsApi.addParam({
                    component: 'skip_intro',
                    param: { name: 'si_debug', type: 'trigger', default: this.settings.debug },
                    field: { name: 'Режим налагодження (Console)' },
                    onChange: (v) => { self.settings.debug = !!v; self.saveSettings(); }
                });

                Lampa.SettingsApi.addParam({
                    component: 'skip_intro',
                    param: { name: 'si_enabled', type: 'trigger', default: this.settings.enabled },
                    field: { name: 'Увімкнути плагін' },
                    onChange: (v) => { self.settings.enabled = !!v; self.saveSettings(); }
                });

                Lampa.SettingsApi.addParam({
                    component: 'skip_intro',
                    param: { name: 'si_auto', type: 'trigger', default: this.settings.autoSkipIntro },
                    field: { name: 'Автоматично пропускати інтро' },
                    onChange: (v) => { self.settings.autoSkipIntro = !!v; self.saveSettings(); }
                });

                // Налаштування тривалості тощо...
                Lampa.SettingsApi.addParam({
                    component: 'skip_intro',
                    param: { name: 'si_skip_next', type: 'select', values: { 'Вимкнено': -1, '3 сек': 3, '5 сек': 5, '10 сек': 10 }, default: String(self.settings.autoNextEpisode ? self.settings.nextEpisodeDelay : -1) },
                    field: { name: 'Автостарт наступної серії' },
                    onChange: (v) => {
                        const n = parseInt(v);
                        if (n === -1) { self.settings.autoNextEpisode = false; self.settings.nextEpisodeDelay = 0; }
                        else { self.settings.autoNextEpisode = true; self.settings.nextEpisodeDelay = n; }
                        self.saveSettings();
                    }
                });
            } catch (e) { console.error(e); }
        }
    };

    if (window.Lampa && Lampa.Listener) {
        Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') plugin.init(); });
        setTimeout(() => { if (!window.__skipInited) { window.__skipInited = true; plugin.init(); } }, 1000);
    } else {
        plugin.init();
    }
})();
