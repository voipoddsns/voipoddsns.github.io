(function () {
    'use strict';

    if (window.SkipIntroPlugin) return;
    window.SkipIntroPlugin = true;

    const STORAGE_KEY = 'skip_intro_db';
    const SETTINGS_KEY = 'skip_intro_settings';

    const plugin = {
        name: 'Skip Intro',
        version: '1.2.0',
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
            countdownTimer: null,
            isInitialized: false
        },

        init() {
            if (this.state.isInitialized) return;
            console.log(`[SkipIntro] Плагін завантажено v${this.version}`);

            this.loadSettings();
            this.injectStyles();

            if (window.Lampa) {
                this.addSettingsMenu();
                this.setupLampaListeners();
            }

            this.showNotification('Skip Intro завантажено');
            this.observePlayer();
            this.state.isInitialized = true;
        },

        // ========== РОБОТА З НАЛАШТУВАННЯМИ ==========
        loadSettings() {
            try {
                const raw = localStorage.getItem(SETTINGS_KEY);
                if (raw) {
                    const saved = JSON.parse(raw);
                    Object.keys(this.settings).forEach(key => {
                        if (key in saved) this.settings[key] = saved[key];
                    });
                }
            } catch (e) {
                console.error('[SkipIntro] Помилка завантаження налаштувань:', e);
            }
        },

        saveSettings() {
            try {
                localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
            } catch (e) {
                console.error('[SkipIntro] Помилка збереження налаштувань:', e);
            }
        },

        // ========== РОБОТА З БАЗОЮ ДАНИХ ==========
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
                console.error('[SkipIntro] Помилка збереження бази:', e);
            }
        },

        getDBKey() {
            const id = this.state.cardId || 'unknown';
            const season = this.state.season != null ? this.state.season : '0';
            return `${id}_s${season}`;
        },

        rememberIntroTime(seconds) {
            if (!this.settings.rememberIntro) return;
            const db = this.loadDB();
            db[this.getDBKey()] = {
                intro: Math.round(seconds),
                updated: Date.now()
            };
            this.saveDB(db);
            console.log(`[SkipIntro] Запам'ятовано інтро: ${seconds}с для ${this.getDBKey()}`);
        },

        getRememberedIntro() {
            if (!this.settings.rememberIntro) return null;
            const db = this.loadDB();
            const rec = db[this.getDBKey()];
            return rec ? rec.intro : null;
        },

        // ========== ВИЗНАЧЕННЯ КОНТЕНТУ ==========
        detectCard() {
            try {
                // Спроба отримати дані з плеєра
                if (window.Lampa?.Player?.playdata) {
                    const data = Lampa.Player.playdata();
                    if (data) {
                        this.state.cardId = data.card?.id || data.card?.imdb_id || data.card?.original_title || null;
                        this.state.season = data.season != null ? data.season : null;
                        this.state.episode = data.episode != null ? data.episode : null;
                        return;
                    }
                }

                // Спроба отримати з Activity
                if (window.Lampa?.Activity?.active) {
                    const act = Lampa.Activity.active();
                    if (act?.card) {
                        this.state.cardId = act.card.id || act.card.imdb_id || act.card.original_title;
                        this.state.season = act.season ?? null;
                        this.state.episode = act.episode ?? null;
                    }
                }
            } catch (e) {
                console.error('[SkipIntro] Помилка визначення картки:', e);
            }
        },

        // ========== НАЛАШТУВАННЯ LAMPA ==========
        setupLampaListeners() {
            try {
                if (Lampa.Player?.listener) {
                    Lampa.Player.listener.follow('start', () => {
                        this.detectCard();
                        this.resetState();
                    });
                }
            } catch (e) {
                console.error('[SkipIntro] Помилка налаштування слухачів:', e);
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

        // ========== СПОСТЕРЕЖЕННЯ ЗА ПЛЕЄРОМ ==========
        observePlayer() {
            document.addEventListener('play', (e) => {
                if (e.target?.tagName === 'VIDEO') {
                    this.state.player = e.target;
                    this.attachPlayer(this.state.player);
                }
            }, true);
        },

        attachPlayer(player) {
            if (!player || player.__skipIntroAttached) return;
            player.__skipIntroAttached = true;

            player.addEventListener('loadedmetadata', () => {
                this.state.duration = player.duration || 0;
                this.resetState();
                this.detectCard();
            });

            player.addEventListener('timeupdate', () => {
                this.onTimeUpdate(player);
            });

            player.addEventListener('ended', () => {
                this.onEnded(player);
            });
        },

        // ========== ОБРОБКА ЧАСУ ВІДТВОРЕННЯ ==========
        onTimeUpdate(player) {
            if (!this.settings.enabled) return;

            const current = player.currentTime;
            const duration = player.duration || 0;

            // Автоматичне пропускання інтро
            if (this.settings.autoSkipIntro) {
                const remembered = this.getRememberedIntro();
                if (remembered && !this.state.introShown && current >= 1 && current < remembered) {
                    this.state.introShown = true;
                    player.currentTime = remembered;
                    this.showNotification('Інтро пропущено автоматично');
                    return;
                }
            }

            // Показ кнопки пропуску інтро
            if (this.settings.showIntroButton && !this.state.introShown && current >= 3 && current <= 25) {
                this.state.introShown = true;
                this.showIntroButton(player);
            }

            // Показ кнопки наступної серії
            if (!this.state.creditsShown && duration > 0 && current >= duration - this.settings.creditsSeconds) {
                this.state.creditsShown = true;
                this.showCreditsButton(player);
            }
        },

        onEnded(player) {
            if (this.settings.autoNextEpisode) {
                this.nextEpisode();
            }
        },

        // ========== КНОПКА ПРОПУСКУ ІНТРО ==========
        showIntroButton(player) {
            this.removeIntroButton();

            const remembered = this.getRememberedIntro();
            const skipTo = remembered || (player.currentTime + this.settings.introSeconds);

            const btn = this.createButton('Пропустити інтро', () => {
                player.currentTime = skipTo;
                this.rememberIntroTime(skipTo);
                this.removeIntroButton();
                this.showNotification('Інтро пропущено');
            });

            document.body.appendChild(btn);
            this.state.introBtn = btn;
            this.enableRemote(btn);
            
            // Автоматичне приховування через 12 секунд
            setTimeout(() => this.removeIntroButton(), 12000);
        },

        removeIntroButton() {
            if (this.state.introBtn) {
                this.state.introBtn.remove();
                this.state.introBtn = null;
            }
        },

        // ========== КНОПКА НАСТУПНОЇ СЕРІЇ ==========
        showCreditsButton(player) {
            this.removeCreditsButton();

            const wrap = document.createElement('div');
            wrap.className = 'skip-credits-wrap';

            const label = document.createElement('div');
            label.className = 'skip-credits-label';

            const btn = this.createButton('▶ Наступна серія', () => {
                this.removeCreditsButton();
                this.nextEpisode();
            });

            wrap.appendChild(label);
            wrap.appendChild(btn);
            document.body.appendChild(wrap);
            this.state.creditsBtn = wrap;
            this.enableRemote(btn);

            // Таймер зворотного відліку
            if (this.settings.autoNextEpisode && this.settings.nextEpisodeDelay > 0) {
                let left = this.settings.nextEpisodeDelay;
                label.textContent = `Наступна серія через ${left}с…`;

                this.state.countdownTimer = setInterval(() => {
                    left--;
                    if (left <= 0) {
                        clearInterval(this.state.countdownTimer);
                        this.state.countdownTimer = null;
                        this.removeCreditsButton();
                        this.nextEpisode();
                    } else {
                        label.textContent = `Наступна серія через ${left}с…`;
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

        // ========== СТВОРЕННЯ КНОПОК ==========
        createButton(text, onClick) {
            const btn = document.createElement('div');
            btn.className = 'skip-intro-btn selector';
            btn.textContent = text;
            btn.tabIndex = 0;

            btn.addEventListener('click', onClick);
            btn.addEventListener('hover:enter', onClick);
            btn.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onClick();
                }
            });

            return btn;
        },

        enableRemote(element) {
            try {
                if (window.Lampa?.Controller) {
                    element.addEventListener('hover:focus', () => element.classList.add('focus'));
                    element.addEventListener('hover:blur', () => element.classList.remove('focus'));
                }
            } catch (e) {
                // Ігноруємо помилки
            }
        },

        // ========== ПЕРЕХІД ДО НАСТУПНОЇ СЕРІЇ ==========
        nextEpisode() {
            console.log('[SkipIntro] Спроба переходу на наступну серію...');

            // Спроба 1: Lampa.Player.next()
            if (this.tryLampaNext()) return;

            // Спроба 2: Пошук кнопки в DOM
            if (this.tryDomNext()) return;

            // Спроба 3: Через Activity
            if (this.tryActivityNext()) return;

            // Спроба 4: Кастомна подія
            this.tryCustomEvent();

            console.warn('[SkipIntro] Не вдалося перейти на наступну серію');
        },

        tryLampaNext() {
            try {
                if (window.Lampa?.Player?.next) {
                    Lampa.Player.next();
                    console.log('[SkipIntro] Перехід через Lampa.Player.next()');
                    return true;
                }
            } catch (e) {
                console.error('[SkipIntro] Помилка Lampa.Player.next():', e);
            }
            return false;
        },

        tryDomNext() {
            try {
                const selectors = [
                    '.next-episode',
                    '.next-series',
                    '.next',
                    '[data-action="next"]',
                    '.episode-next',
                    '.next-episode-btn'
                ];
                
                for (const selector of selectors) {
                    const buttons = document.querySelectorAll(selector);
                    for (const btn of buttons) {
                        if (btn.style.display !== 'none' && btn.offsetParent !== null) {
                            btn.click();
                            console.log(`[SkipIntro] Натиснуто кнопку "${selector}"`);
                            return true;
                        }
                    }
                }
            } catch (e) {
                console.error('[SkipIntro] Помилка пошуку кнопки в DOM:', e);
            }
            return false;
        },

        tryActivityNext() {
            try {
                const active = Lampa?.Activity?.active();
                if (!active?.card?.seasons) return false;

                const card = active.card;
                const season = this.state.season;
                const episode = this.state.episode;

                if (season == null || episode == null) return false;
                if (!card.seasons[season]?.episodes) return false;

                const episodes = card.seasons[season].episodes;
                const currentIndex = episodes.findIndex(e => e.id === episode);
                
                if (currentIndex >= 0 && currentIndex < episodes.length - 1) {
                    const nextEpisode = episodes[currentIndex + 1];
                    if (nextEpisode) {
                        this.playEpisode(card, season, nextEpisode.id || nextEpisode.episode);
                        console.log('[SkipIntro] Перехід через Activity');
                        return true;
                    }
                }
            } catch (e) {
                console.error('[SkipIntro] Помилка Activity:', e);
            }
            return false;
        },

        tryCustomEvent() {
            try {
                const event = new CustomEvent('lampa:next');
                document.dispatchEvent(event);
                console.log('[SkipIntro] Відправлено подію lampa:next');
            } catch (e) {
                console.error('[SkipIntro] Помилка відправки події:', e);
            }
        },

        playEpisode(card, season, episode) {
            try {
                if (window.Lampa?.Player?.play) {
                    Lampa.Player.play({ card, season, episode });
                    console.log('[SkipIntro] Відтворення епізоду через Lampa.Player.play()');
                }
            } catch (e) {
                console.error('[SkipIntro] Помилка відтворення епізоду:', e);
            }
        },

        // ========== ДОПОМІЖНІ МЕТОДИ ==========
        showNotification(message) {
            try {
                if (window.Lampa?.Noty) {
                    Lampa.Noty.show(message);
                }
            } catch (e) {
                // Ігноруємо помилки
            }
        },

        // ========== СТИЛІ ==========
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
                    transition: all 0.2s ease;
                    backdrop-filter: blur(4px);
                    user-select: none;
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

        // ========== МЕНЮ НАЛАШТУВАНЬ ==========
        addSettingsMenu() {
            try {
                if (!window.Lampa?.SettingsApi) return;

                Lampa.SettingsApi.addComponent({
                    component: 'skip_intro',
                    name: 'Skip Intro',
                    icon: `<svg viewBox="0 0 24 24" width="24" height="24">
                        <path fill="currentColor" d="M4 5v14l8-7zM13 5v14l8-7z"/>
                    </svg>`
                });

                const addParam = (name, field, onChange, extra = {}) => {
                    Lampa.SettingsApi.addParam({
                        component: 'skip_intro',
                        param: { name, default: this.settings[name], ...extra },
                        field: { name: field },
                        onChange: (v) => {
                            const value = (v === true || v === 'true');
                            this.settings[name] = typeof this.settings[name] === 'boolean' ? value : v;
                            this.saveSettings();
                            if (onChange) onChange(v);
                        }
                    });
                };

                addParam('enabled', 'Увімкнути');
                addParam('autoSkipIntro', 'Автоматично пропускати інтро');
                addParam('showIntroButton', 'Показувати кнопку');
                addParam('rememberIntro', "Запам'ятовувати інтро");

                Lampa.SettingsApi.addParam({
                    component: 'skip_intro',
                    param: {
                        name: 'introSeconds',
                        type: 'select',
                        values: { 30: '30с', 45: '45с', 60: '60с', 90: '90с', 120: '120с' },
                        default: String(this.settings.introSeconds)
                    },
                    field: { name: 'Тривалість інтро' },
                    onChange: (v) => { this.settings.introSeconds = parseInt(v); this.saveSettings(); }
                });

                Lampa.SettingsApi.addParam({
                    component: 'skip_intro',
                    param: {
                        name: 'creditsSeconds',
                        type: 'select',
                        values: { 15: '15с', 20: '20с', 30: '30с', 45: '45с', 60: '60с' },
                        default: String(this.settings.creditsSeconds)
                    },
                    field: { name: 'Тривалість титрів' },
                    onChange: (v) => { this.settings.creditsSeconds = parseInt(v); this.saveSettings(); }
                });

                Lampa.SettingsApi.addParam({
                    component: 'skip_intro',
                    param: {
                        name: 'autoNext',
                        type: 'select',
                        values: { '-1': 'Вимкнено', '3': '3с', '5': '5с', '10': '10с' },
                        default: String(this.settings.autoNextEpisode ? this.settings.nextEpisodeDelay : -1)
                    },
                    field: { name: 'Автоматична наступна серія' },
                    onChange: (v) => {
                        const n = parseInt(v);
                        this.settings.autoNextEpisode = n !== -1;
                        this.settings.nextEpisodeDelay = n !== -1 ? n : 5;
                        this.saveSettings();
                    }
                });

                Lampa.SettingsApi.addParam({
                    component: 'skip_intro',
                    param: { name: 'clearDB', type: 'button' },
                    field: { name: '🗑 Очистити базу інтро' },
                    onChange: () => {
                        localStorage.removeItem(STORAGE_KEY);
                        this.showNotification('Базу інтро очищено');
                    }
                });

            } catch (e) {
                console.error('[SkipIntro] Помилка додавання меню налаштувань:', e);
            }
        }
    };

    // ========== ІНІЦІАЛІЗАЦІЯ ==========
    if (window.Lampa?.Listener) {
        Lampa.Listener.follow('app', (e) => {
            if (e.type === 'ready') plugin.init();
        });
        setTimeout(() => {
            if (!window.__skipInited) {
                window.__skipInited = true;
                plugin.init();
            }
        }, 500);
    } else {
        plugin.init();
    }

    window.SkipIntro = plugin;

})();
