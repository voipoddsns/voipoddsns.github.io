(function () {
    'use strict';

    if (window.SkipIntroPlugin) return;
    window.SkipIntroPlugin = true;

    const plugin = {
        name: 'Skip Intro',
        version: '1.0.0',
        author: 'ChatGPT',

        // Налаштування за замовчуванням
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

        // Стан плагіна
        state: {
            player: null,
            introShown: false,
            creditsShown: false,
            duration: 0,
            currentCard: null,
            skipButton: null,
            nextButton: null
        },

        // --- ІНІЦІАЛІЗАЦІЯ ---
        init() {
            console.log('[SkipIntro] Plugin loaded');
            this.loadSettings();
            this.injectStyles();
            this.registerSettings();
            this.observePlayer();
        },

        // --- РОБОТА З НАЛАШТУВАННЯМИ ТА БАЗОЮ ---
        loadSettings() {
            try {
                const saved = Lampa.Storage.get('skip_intro_settings', '{}');
                Object.assign(this.settings, JSON.parse(saved));
            } catch (e) { console.error('[SkipIntro] Settings load error', e); }
        },

        saveSettings() {
            Lampa.Storage.set('skip_intro_settings', JSON.stringify(this.settings));
        },

        getIntroDb() {
            try {
                return JSON.parse(Lampa.Storage.get('skip_intro_db', '{}'));
            } catch (e) { return {}; }
        },

        saveIntroDb(db) {
            Lampa.Storage.set('skip_intro_db', JSON.stringify(db));
        },

        // Генерація ключа для бази даних на основі ID, сезону та озвучки
        getDbKey() {
            if (!this.state.currentCard) return null;
            const c = this.state.currentCard;
            const voice = c.voice ? '_' + c.voice : '';
            return `${c.id}_s${c.season}_e${c.episode}${voice}`;
        },

        // --- РЕЄСТРАЦІЯ В МЕНЮ LAMPA ---
        registerSettings() {
            Lampa.SettingsApi.addComponent({
                component: 'skip_intro',
                name: 'Skip Intro',
                icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 4L19 12L5 20V4Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
            });

            Lampa.SettingsApi.addParam('skip_intro', {
                name: 'enabled',
                type: 'toggle',
                values: 'Увімкнути плагін',
                default: this.settings.enabled
            });

            Lampa.SettingsApi.addParam('skip_intro', {
                name: 'showIntroButton',
                type: 'toggle',
                values: 'Показувати кнопку "Пропустити"',
                default: this.settings.showIntroButton
            });

            Lampa.SettingsApi.addParam('skip_intro', {
                name: 'autoSkipIntro',
                type: 'toggle',
                values: 'Автоматично пропускати інтро',
                default: this.settings.autoSkipIntro
            });

            Lampa.SettingsApi.addParam('skip_intro', {
                name: 'rememberIntro',
                type: 'toggle',
                values: 'Запам\'ятовувати час інтро',
                default: this.settings.rememberIntro
            });

            Lampa.SettingsApi.addParam('skip_intro', {
                name: 'introSeconds',
                type: 'select',
                values: ['30', '45', '60', '90', '120'],
                default: this.settings.introSeconds.toString(),
                title: 'Час інтро за замовчуванням (сек)'
            });

            Lampa.SettingsApi.addParam('skip_intro', {
                name: 'creditsSeconds',
                type: 'select',
                values: ['15', '20', '30', '45', '60'],
                default: this.settings.creditsSeconds.toString(),
                title: 'Час появи кнопки титрів (сек до кінця)'
            });

            Lampa.SettingsApi.addParam('skip_intro', {
                name: 'autoNextEpisode',
                type: 'toggle',
                values: 'Автонаступна серія',
                default: this.settings.autoNextEpisode
            });

            Lampa.SettingsApi.addParam('skip_intro', {
                name: 'nextEpisodeDelay',
                type: 'select',
                values: ['3', '5', '10'],
                default: this.settings.nextEpisodeDelay.toString(),
                title: 'Затримка перед наступною серією (сек)'
            });
        },

        // --- СТИЛІ NETFLIX ---
        injectStyles() {
            const css = `
                .skip-intro-btn, .skip-credits-btn {
                    position: absolute;
                    bottom: 15%;
                    right: 5%;
                    background: rgba(0, 0, 0, 0.7);
                    border: 1px solid rgba(255, 255, 255, 0.5);
                    color: white;
                    padding: 10px 24px;
                    font-size: 16px;
                    font-weight: bold;
                    cursor: pointer;
                    z-index: 1000;
                    transition: all 0.2s ease;
                    opacity: 0;
                    transform: translateY(10px);
                    animation: fadeInUp 0.3s forwards;
                    border-radius: 4px;
                }
                .skip-intro-btn:hover, .skip-credits-btn:hover,
                .skip-intro-btn:focus, .skip-credits-btn:focus {
                    background: rgba(255, 255, 255, 0.9);
                    color: black;
                    outline: none;
                }
                .skip-credits-btn {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .skip-credits-countdown {
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    border: 2px solid white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 12px;
                }
                @keyframes fadeInUp {
                    to { opacity: 1; transform: translateY(0); }
                }
            `;
            const style = document.createElement('style');
            style.textContent = css;
            document.head.appendChild(style);
        },

        // --- СЛІДКУВАННЯ ЗА ПЛЕЄРОМ ---
        observePlayer() {
            const self = this;

            // Отримуємо дані про поточний фільм/серіал з Lampa
            document.addEventListener('lampa-player-play', function () {
                try {
                    const activity = Lampa.Activity.active();
                    if (activity && activity.movie) {
                        self.state.currentCard = {
                            id: activity.movie.id,
                            season: activity.movie.season ? activity.movie.season.number : 0,
                            episode: activity.movie.episode ? activity.movie.episode.number : 0,
                            voice: activity.movie.voice ? activity.movie.voice.id : ''
                        };
                    }
                } catch (e) { console.error('[SkipIntro] Activity error', e); }
            }, true);

            // Слідкуємо за створенням відео-елемента
            document.addEventListener('play', function (e) {
                self.state.player = e.target;
                self.attachPlayer(self.state.player);
            }, true);
        },

        attachPlayer(player) {
            if (!player || player.__skipIntroAttached) return;
            player.__skipIntroAttached = true;

            player.addEventListener('loadedmetadata', () => {
                this.state.duration = player.duration || 0;
                this.state.introShown = false;
                this.state.creditsShown = false;
                this.removeButtons();
            });

            player.addEventListener('timeupdate', () => {
                if (this.settings.enabled) this.onTimeUpdate(player);
            });

            player.addEventListener('ended', () => {
                this.removeButtons();
            });
        },

        // --- ЛОГІКА ЧАСУ ---
        onTimeUpdate(player) {
            const current = player.currentTime;
            const duration = player.duration || 0;
            if (!duration) return;

            const isSerial = this.state.currentCard && this.state.currentCard.season > 0;

            // --- INTRO LOGIC ---
            if (this.settings.showIntroButton && !this.state.introShown && current >= 3 && current <= 15) {
                this.state.introShown = true;
                const db = this.getIntroDb();
                const key = this.getDbKey();
                const savedIntro = key ? db[key] : null;

                if (savedIntro) {
                    // Якщо інтро збережено, пропускаємо автоматично або показуємо кнопку з точним часом
                    if (this.settings.autoSkipIntro) {
                        this.skipToIntro(player, savedIntro);
                    } else {
                        this.showIntroButton(player, savedIntro);
                    }
                } else {
                    // Якщо інтро не збережено, показуємо кнопку з часом з налаштувань
                    this.showIntroButton(player, this.settings.introSeconds);
                }
            }

            // Сховати кнопку інтро, якщо час вийшло
            if (this.state.introShown && this.state.skipButton && current > (parseInt(this.state.skipButton.dataset.time) || 90)) {
                this.state.skipButton.remove();
                this.state.skipButton = null;
            }

            // --- CREDITS LOGIC ---
            if (isSerial && !this.state.creditsShown && current >= duration - this.settings.creditsSeconds) {
                this.state.creditsShown = true;
                this.showCreditsButton(player);
            }
        },

        // --- UI КНОПКИ ---
        showIntroButton(player, seconds) {
            if (this.state.skipButton) return;
            const btn = document.createElement('button');
            btn.className = 'skip-intro-btn';
            btn.textContent = 'Пропустити інтро';
            btn.dataset.time = seconds;

            // Підтримка пульта
            btn.addEventListener('click', () => this.skipToIntro(player, seconds));
            btn.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === 'Ok') this.skipToIntro(player, seconds);
            });

            const playerWrap = player.closest('.player-video') || player.parentNode;
            if (playerWrap) {
                playerWrap.style.position = 'relative';
                playerWrap.appendChild(btn);
                btn.focus(); // Фокус для пульта
                this.state.skipButton = btn;
            }
        },

        skipToIntro(player, seconds) {
            player.currentTime = parseFloat(seconds);
            if (this.state.skipButton) {
                this.state.skipButton.remove();
                this.state.skipButton = null;
            }

            // Зберігаємо в базу, якщо ще не збережено
            if (this.settings.rememberIntro) {
                const key = this.getDbKey();
                if (key) {
                    const db = this.getIntroDb();
                    if (!db[key]) {
                        db[key] = seconds;
                        this.saveIntroDb(db);
                        Lampa.Noty.show('Час інтро запам\'ятовано');
                    }
                }
            }
        },

        showCreditsButton(player) {
            if (this.state.nextButton) return;
            const btn = document.createElement('button');
            btn.className = 'skip-credits-btn';
            btn.innerHTML = `<span class="skip-credits-countdown">${this.settings.nextEpisodeDelay}</span> Наступна серія`;

            btn.addEventListener('click', () => this.triggerNextEpisode());
            btn.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === 'Ok') this.triggerNextEpisode();
            });

            const playerWrap = player.closest('.player-video') || player.parentNode;
            if (playerWrap) {
                playerWrap.style.position = 'relative';
                playerWrap.appendChild(btn);
                btn.focus();
                this.state.nextButton = btn;

                // Зворотний відлік
                if (this.settings.autoNextEpisode) {
                    let count = this.settings.nextEpisodeDelay;
                    const interval = setInterval(() => {
                        count--;
                        const countdownEl = btn.querySelector('.skip-credits-countdown');
                        if (countdownEl) countdownEl.textContent = count;
                        
                        if (count <= 0) {
                            clearInterval(interval);
                            this.triggerNextEpisode();
                        }
                    }, 1000);
                    
                    btn.addEventListener('remove', () => clearInterval(interval));
                }
            }
        },

        triggerNextEpisode() {
            this.removeButtons();
            try {
                // Викликаємо стандартну наступну серію в Lampa
                Lampa.Player.next();
            } catch (e) {
                console.error('[SkipIntro] Next episode error', e);
                Lampa.Noty.show('Помилка переходу до наступної серії');
            }
        },

        removeButtons() {
            if (this.state.skipButton) { this.state.skipButton.remove(); this.state.skipButton = null; }
            if (this.state.nextButton) { this.state.nextButton.remove(); this.state.nextButton = null; }
        }
    };

    // Запуск
    if (window.Lampa) {
        plugin.init();
    } else {
        console.error('[SkipIntro] Lampa framework not found!');
    }

})();
