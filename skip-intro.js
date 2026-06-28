(function () {
    'use strict';

    if (window.__lampa_auto_skip__) return;
    window.__lampa_auto_skip__ = true;

    // ===================== КОНФІГУРАЦІЯ =====================
    const DB_KEY = 'lampa_auto_skip_db';
    const CFG_KEY = 'lampa_auto_skip_cfg';
    const LOG = '[AutoSkip]';

    const defaultCfg = {
        enabled: true,
        autoSkip: false,
        showBtn: true,
        remember: true,
        introSec: 90,
        creditsSec: 30,
        autoNext: true,
        nextDelay: 5,
        tmdbKey: '',
        btnTimeout: 15
    };

    // ===================== УТИЛІТИ =====================
    const $ = (sel, ctx) => (ctx || document).querySelector(sel);
    const $$ = (sel, ctx) => [...(ctx || document).querySelectorAll(sel)];

    function loadJSON(key, fallback) {
        try { return JSON.parse(localStorage.getItem(key)) || fallback; }
        catch { return fallback; }
    }
    function saveJSON(key, data) {
        try { localStorage.setItem(key, JSON.stringify(data)); } catch {}
    }

    function notify(msg) {
        try { if (Lampa && Lampa.Noty) Lampa.Noty.show(msg); } catch {}
        console.log(LOG, msg);
    }

    // ===================== ПЛАГІН =====================
    const plugin = {
        cfg: { ...defaultCfg },
        db: {},
        video: null,
        ui: { intro: null, credits: null },
        timers: {},
        meta: { id: null, season: null, episode: null, source: null },
        flags: { introFired: false, creditsFired: false, attached: false },

        // ---------- ІНІТ ----------
        init() {
            console.log(LOG, 'v2.0 init');
            this.cfg = { ...defaultCfg, ...loadJSON(CFG_KEY, {}) };
            this.db = loadJSON(DB_KEY, {});
            this.injectCSS();

            if (typeof Lampa !== 'undefined') {
                this.hookLampa();
                this.buildSettings();
            }

            this.watchVideo();
            notify('Auto Skip завантажено');
        },

        // ---------- HOOK LAMPA ----------
        hookLampa() {
            const self = this;

            // Спосіб 1: Lampa.Listener
            try {
                if (Lampa.Listener) {
                    Lampa.Listener.follow('player', (e) => {
                        if (e.type === 'start' || e.type === 'ready') {
                            self.onPlayerStart();
                        }
                        if (e.type === 'destroy' || e.type === 'stop') {
                            self.cleanup();
                        }
                    });
                }
            } catch (e) { console.warn(LOG, 'Listener hook fail', e); }

            // Спосіб 2: Lampa.Player.listener (старі версії)
            try {
                if (Lampa.Player && Lampa.Player.listener) {
                    Lampa.Player.listener.follow('start', () => self.onPlayerStart());
                    Lampa.Player.listener.follow('destroy', () => self.cleanup());
                }
            } catch (e) {}
        },

        onPlayerStart() {
            this.detectMeta();
            this.flags.introFired = false;
            this.flags.creditsFired = false;
            this.removeUI('intro');
            this.removeUI('credits');
            this.clearTimers();

            // Авто-пропуск запам'ятованого інтро
            if (this.cfg.autoSkip && this.cfg.remember) {
                const saved = this.getSavedIntro();
                if (saved) {
                    this.scheduleAutoSkip(saved);
                }
            }
        },

        // ---------- ВИЗНАЧЕННЯ МЕТА-ДАНИХ ----------
        detectMeta() {
            this.meta = { id: null, season: null, episode: null, source: null };
            try {
                // Спосіб 1: playdata
                let data = null;
                if (Lampa.Player && typeof Lampa.Player.playdata === 'function') {
                    data = Lampa.Player.playdata();
                }
                // Спосіб 2: playlist
                if (!data && Lampa.Player && typeof Lampa.Player.playlist === 'function') {
                    const pl = Lampa.Player.playlist();
                    if (pl && pl.current) data = pl.current;
                }
                // Спосіб 3: video
                if (!data && Lampa.Player && Lampa.Player.video) {
                    data = Lampa.Player.video();
                }

                if (data) {
                    const card = data.card || data.movie || data;
                    this.meta.id = card.id || card.imdb_id || card.kinopoisk_id || card.original_title || card.name;
                    this.meta.season = data.season_number ?? data.season ?? data.s;
                    this.meta.episode = data.episode_number ?? data.episode ?? data.e;
                    this.meta.source = data.source || data.balanser || 'unknown';
                }

                // Спосіб 4: Activity (резервний)
                if (!this.meta.id && Lampa.Activity) {
                    const act = Lampa.Activity.active();
                    if (act && act.card) {
                        this.meta.id = act.card.id || act.card.imdb_id;
                    }
                }
            } catch (e) { console.warn(LOG, 'detectMeta fail', e); }

            console.log(LOG, 'meta:', this.meta);
        },

        getDBKey() {
            const id = this.meta.id || 'x';
            const s = this.meta.season ?? 0;
            const src = this.meta.source || 'any';
            return `${id}_s${s}_${src}`;
        },

        getSavedIntro() {
            if (!this.cfg.remember) return null;
            const rec = this.db[this.getDBKey()];
            return rec ? rec.intro : null;
        },

        saveIntro(sec) {
            if (!this.cfg.remember) return;
            this.db[this.getDBKey()] = {
                intro: Math.round(sec),
                ts: Date.now()
            };
            saveJSON(DB_KEY, this.db);
            notify(`Інтро запам'ятовано: ${Math.round(sec)}с`);
        },

        // ---------- ВІДЕО ----------
        watchVideo() {
            const self = this;
            document.addEventListener('play', (e) => {
                if (e.target && e.target.tagName === 'VIDEO') {
                    self.video = e.target;
                    self.attachVideo(e.target);
                }
            }, true);
        },

        attachVideo(v) {
            if (v.__as_attached) return;
            v.__as_attached = true;
            const self = this;

            v.addEventListener('loadedmetadata', () => {
                self.onPlayerStart();
            });

            v.addEventListener('timeupdate', () => {
                self.onTick(v);
            });

            v.addEventListener('ended', () => {
                self.onVideoEnd();
            });
        },

        onTick(v) {
            if (!this.cfg.enabled) return;
            const t = v.currentTime;
            const dur = v.duration || 0;
            if (!dur) return;

            // --- ІНТРО ---
            if (!this.flags.introFired && t >= 2 && t <= 30) {
                this.flags.introFired = true;
                if (this.cfg.showBtn) this.showIntroBtn(v);
            }

            // --- ТИТРИ ---
            if (!this.flags.creditsFired && dur > 60 && t >= dur - this.cfg.creditsSec) {
                this.flags.creditsFired = true;
                this.showCreditsBtn(v);
            }
        },

        onVideoEnd() {
            if (this.cfg.autoNext) {
                this.goNext();
            }
        },

        // ---------- АВТО-ПРОПУСК ----------
        scheduleAutoSkip(targetSec) {
            const self = this;
            const check = () => {
                if (!self.video) return;
                const t = self.video.currentTime;
                if (t >= 1 && t < targetSec - 1) {
                    self.video.currentTime = targetSec;
                    notify('Інтро авто-пропущено');
                }
            };
            this.timers.autoSkip = setTimeout(check, 1500);
        },

        // ---------- КНОПКА ІНТРО ----------
        showIntroBtn(v) {
            this.removeUI('intro');
            const self = this;
            const saved = this.getSavedIntro();
            const target = saved || (v.currentTime + this.cfg.introSec);

            const btn = document.createElement('div');
            btn.className = 'as-btn as-intro selector';
            btn.innerHTML = saved
                ? '⏭ Пропустити інтро <small>(запам\'ятовано)</small>'
                : '⏭ Пропустити інтро';
            btn.tabIndex = 0;

            const skip = () => {
                v.currentTime = target;
                self.saveIntro(target);
                self.removeUI('intro');
            };

            btn.onclick = skip;
            btn.addEventListener('hover:enter', skip);
            btn.onkeydown = (e) => { if (e.key === 'Enter' || e.keyCode === 13) skip(); };

            document.body.appendChild(btn);
            this.ui.intro = btn;
            this.focusBtn(btn);

            this.timers.introHide = setTimeout(
                () => self.removeUI('intro'),
                (this.cfg.btnTimeout || 15) * 1000
            );
        },

        // ---------- КНОПКА ТИТРІВ ----------
        showCreditsBtn(v) {
            this.removeUI('credits');
            const self = this;

            const wrap = document.createElement('div');
            wrap.className = 'as-credits-wrap';

            const label = document.createElement('div');
            label.className = 'as-credits-label';

            const btn = document.createElement('div');
            btn.className = 'as-btn as-next selector';
            btn.innerHTML = '▶ Наступна серія';
            btn.tabIndex = 0;

            wrap.appendChild(label);
            wrap.appendChild(btn);
            document.body.appendChild(wrap);
            this.ui.credits = wrap;
            this.focusBtn(btn);

            const go = () => {
                self.removeUI('credits');
                self.goNext();
            };

            btn.onclick = go;
            btn.addEventListener('hover:enter', go);
            btn.onkeydown = (e) => { if (e.key === 'Enter' || e.keyCode === 13) go(); };

            if (this.cfg.autoNext && this.cfg.nextDelay > 0) {
                let left = this.cfg.nextDelay;
                label.textContent = `Наступна серія через ${left}…`;
                this.timers.countdown = setInterval(() => {
                    left--;
                    if (left <= 0) {
                        clearInterval(self.timers.countdown);
                        go();
                    } else {
                        label.textContent = `Наступна серія через ${left}…`;
                    }
                }, 1000);
            } else {
                label.textContent = 'Пропустити титри';
            }
        },

        // ========== ГОЛОВНЕ: НАСТУПНА СЕРІЯ ==========
        goNext() {
            console.log(LOG, '>>> goNext() start');

            // --- 1. Lampa.Player.next() ---
            try {
                if (Lampa.Player && typeof Lampa.Player.next === 'function') {
                    console.log(LOG, 'Спосіб 1: Lampa.Player.next()');
                    Lampa.Player.next();
                    return;
                }
            } catch (e) { console.warn(LOG, 'Спосіб 1 fail', e); }

            // --- 2. Lampa.Player.playlist().next ---
            try {
                if (Lampa.Player && typeof Lampa.Player.playlist === 'function') {
                    const pl = Lampa.Player.playlist();
                    if (pl && typeof pl.next === 'function') {
                        console.log(LOG, 'Спосіб 2: playlist.next()');
                        pl.next();
                        return;
                    }
                    // Якщо playlist — масив, шукаємо наступний
                    if (Array.isArray(pl) && pl.length > 1) {
                        const cur = pl.findIndex(i => i.active || i.selected);
                        const nxt = pl[cur + 1] || pl[0];
                        if (nxt) {
                            console.log(LOG, 'Спосіб 2b: play next from array');
                            Lampa.Player.play(nxt);
                            return;
                        }
                    }
                }
            } catch (e) { console.warn(LOG, 'Спосіб 2 fail', e); }

            // --- 3. Lampa.PlayerVideo.next() ---
            try {
                if (Lampa.PlayerVideo && typeof Lampa.PlayerVideo.next === 'function') {
                    console.log(LOG, 'Спосіб 3: PlayerVideo.next()');
                    Lampa.PlayerVideo.next();
                    return;
                }
            } catch (e) { console.warn(LOG, 'Спосіб 3 fail', e); }

            // --- 4. DOM: кнопка "Наступна серія" в інтерфейсі Lampa ---
            try {
                const keywords = ['наступн', 'next', 'далі', 'далее', 'forward'];
                const candidates = $$('.player-panel .selector, .player-controls .selector, .selector');
                for (const el of candidates) {
                    const txt = (el.textContent || '').toLowerCase();
                    if (keywords.some(k => txt.includes(k)) && el.offsetParent !== null) {
                        console.log(LOG, 'Спосіб 4: DOM click →', el.textContent.trim());
                        el.click();
                        el.dispatchEvent(new Event('hover:enter', { bubbles: true }));
                        return;
                    }
                }
            } catch (e) { console.warn(LOG, 'Спосіб 4 fail', e); }

            // --- 5. Емуляція клавіші "вправо" на пульті (навігація по епізодах) ---
            try {
                if (Lampa.Controller && typeof Lampa.Controller.move === 'function') {
                    console.log(LOG, 'Спосіб 5: Controller move right');
                    Lampa.Controller.move('right');
                    setTimeout(() => {
                        const focused = $('.focus');
                        if (focused) focused.click();
                    }, 300);
                    return;
                }
            } catch (e) { console.warn(LOG, 'Спосіб 5 fail', e); }

            // --- 6. Lampa.Listener.send ---
            try {
                if (Lampa.Listener && typeof Lampa.Listener.send === 'function') {
                    console.log(LOG, 'Спосіб 6: Listener.send');
                    Lampa.Listener.send('player', { type: 'next' });
                    Lampa.Listener.send('player', { type: 'next_episode' });
                    return;
                }
            } catch (e) { console.warn(LOG, 'Спосіб 6 fail', e); }

            // --- 7. Пряме відтворення наступного епізоду ---
            try {
                this.playNextEpisode();
                return;
            } catch (e) { console.warn(LOG, 'Спосіб 7 fail', e); }

            // --- 8. Перезавантаження з наступним епізодом ---
            try {
                const url = new URL(location.href);
                const ep = parseInt(url.searchParams.get('e') || url.searchParams.get('episode') || '0');
                if (ep > 0) {
                    url.searchParams.set('e', ep + 1);
                    url.searchParams.set('episode', ep + 1);
                    console.log(LOG, 'Спосіб 8: reload', url.toString());
                    location.href = url.toString();
                    return;
                }
            } catch (e) { console.warn(LOG, 'Спосіб 8 fail', e); }

            console.error(LOG, '❌ Жоден спосіб не спрацював');
            notify('Не вдалося перейти на наступну серію');
        },

        // --- Допоміжний: відтворення наступного епізоду через play ---
        playNextEpisode() {
            console.log(LOG, 'Спосіб 7: playNextEpisode');

            let data = null;
            try {
                if (Lampa.Player && typeof Lampa.Player.playdata === 'function') {
                    data = Lampa.Player.playdata();
                }
            } catch {}

            if (!data) return;

            const card = data.card || data.movie || {};
            const curS = this.meta.season ?? data.season_number ?? 1;
            const curE = this.meta.episode ?? data.episode_number ?? 1;

            // Шукаємо в seasons
            const seasons = card.seasons || data.seasons;
            if (seasons) {
                const sData = seasons[curS] || seasons.find(s => s.season_number === curS);
                if (sData && sData.episodes) {
                    const nextEp = sData.episodes.find(e =>
                        (e.episode_number || e.episode) === curE + 1
                    );
                    if (nextEp && Lampa.Player && typeof Lampa.Player.play === 'function') {
                        const playObj = {
                            ...data,
                            episode: nextEp.episode_number || nextEp.episode,
                            episode_number: nextEp.episode_number || nextEp.episode,
                            season: curS,
                            season_number: curS
                        };
                        console.log(LOG, 'Відтворюємо епізод', curE + 1);
                        Lampa.Player.stop?.();
                        setTimeout(() => Lampa.Player.play(playObj), 200);
                        return;
                    }
                }

                // Наступний сезон
                const nextS = seasons[curS + 1] || seasons.find(s => s.season_number === curS + 1);
                if (nextS && nextS.episodes && nextS.episodes.length > 0) {
                    const firstEp = nextS.episodes[0];
                    if (Lampa.Player && typeof Lampa.Player.play === 'function') {
                        const playObj = {
                            ...data,
                            episode: firstEp.episode_number || 1,
                            season: curS + 1,
                            season_number: curS + 1
                        };
                        Lampa.Player.stop?.();
                        setTimeout(() => Lampa.Player.play(playObj), 200);
                        return;
                    }
                }
            }

            throw new Error('No next episode found');
        },

        // ---------- UI HELPERS ----------
        removeUI(type) {
            if (this.ui[type]) {
                this.ui[type].remove();
                this.ui[type] = null;
            }
            if (type === 'intro' && this.timers.introHide) {
                clearTimeout(this.timers.introHide);
            }
            if (type === 'credits' && this.timers.countdown) {
                clearInterval(this.timers.countdown);
            }
        },

        clearTimers() {
            Object.values(this.timers).forEach(t => {
                clearTimeout(t);
                clearInterval(t);
            });
            this.timers = {};
        },

        cleanup() {
            this.removeUI('intro');
            this.removeUI('credits');
            this.clearTimers();
            this.video = null;
        },

        focusBtn(btn) {
            try {
                if (Lampa && Lampa.Controller && typeof Lampa.Controller.add === 'function') {
                    Lampa.Controller.add('skip_btn', {
                        toggle: () => {},
                        up: () => {},
                        down: () => {},
                        left: () => {},
                        right: () => {},
                        enter: () => btn.click(),
                        back: () => {}
                    });
                    Lampa.Controller.toggle('skip_btn');
                }
            } catch {}
            setTimeout(() => btn.focus(), 100);
        },

        // ---------- CSS ----------
        injectCSS() {
            if ($('#as-styles')) return;
            const s = document.createElement('style');
            s.id = 'as-styles';
            s.textContent = `
                .as-btn {
                    position: fixed;
                    right: 3em;
                    bottom: 5em;
                    z-index: 99999;
                    padding: 0.7em 1.6em;
                    background: rgba(0,0,0,0.8);
                    color: #fff;
                    font-size: 1.3em;
                    font-weight: 600;
                    border: 2px solid rgba(255,255,255,0.9);
                    border-radius: 6px;
                    cursor: pointer;
                    opacity: 0;
                    transform: translateY(16px);
                    animation: asFade 0.35s ease forwards;
                    transition: all 0.2s;
                    backdrop-filter: blur(6px);
                    font-family: inherit;
                }
                .as-btn small { opacity: 0.6; font-size: 0.7em; }
                .as-btn:hover, .as-btn.focus, .as-btn:focus {
                    background: #fff;
                    color: #000;
                    transform: scale(1.06);
                }
                .as-credits-wrap {
                    position: fixed;
                    right: 3em;
                    bottom: 5em;
                    z-index: 99999;
                    text-align: right;
                    animation: asFade 0.35s ease forwards;
                }
                .as-credits-label {
                    color: #fff;
                    font-size: 1.15em;
                    margin-bottom: 0.5em;
                    text-shadow: 0 2px 8px rgba(0,0,0,0.9);
                }
                .as-credits-wrap .as-btn {
                    position: static;
                    animation: none;
                    opacity: 1;
                    transform: none;
                    display: inline-block;
                }
                @keyframes asFade {
                    to { opacity: 1; transform: translateY(0); }
                }
            `;
            document.head.appendChild(s);
        },

        // ---------- НАЛАШТУВАННЯ LAMPA ----------
        buildSettings() {
            const self = this;
            try {
                if (!Lampa.SettingsApi) return;

                Lampa.SettingsApi.addComponent({
                    component: 'auto_skip',
                    name: 'Auto Skip Intro',
                    icon: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M6 18l8.5-6L6 6v12zm2-8.14L11.03 12 8 14.14V9.86zM16 6h2v12h-2z"/></svg>'
                });

                const add = (name, param, field, onChange) => {
                    Lampa.SettingsApi.addParam({
                        component: 'auto_skip',
                        param, field,
                        onChange
                    });
                };

                add('enabled',
                    { name: 'as_en', type: 'trigger', default: self.cfg.enabled },
                    { name: 'Увімкнути' },
                    v => { self.cfg.enabled = !!v; saveJSON(CFG_KEY, self.cfg); }
                );

                add('auto',
                    { name: 'as_auto', type: 'trigger', default: self.cfg.autoSkip },
                    { name: 'Авто-пропуск інтро' },
                    v => { self.cfg.autoSkip = !!v; saveJSON(CFG_KEY, self.cfg); }
                );

                add('btn',
                    { name: 'as_btn', type: 'trigger', default: self.cfg.showBtn },
                    { name: 'Показувати кнопку' },
                    v => { self.cfg.showBtn = !!v; saveJSON(CFG_KEY, self.cfg); }
                );

                add('remember',
                    { name: 'as_remember', type: 'trigger', default: self.cfg.remember },
                    { name: 'Запам\'ятовувати інтро' },
                    v => { self.cfg.remember = !!v; saveJSON(CFG_KEY, self.cfg); }
                );

                add('intro',
                    { name: 'as_intro', type: 'select',
                      values: { 30:'30', 45:'45', 60:'60', 90:'90', 120:'120' },
                      default: String(self.cfg.introSec) },
                    { name: 'Тривалість інтро (сек)' },
                    v => { self.cfg.introSec = +v; saveJSON(CFG_KEY, self.cfg); }
                );

                add('credits',
                    { name: 'as_credits', type: 'select',
                      values: { 15:'15', 20:'20', 30:'30', 45:'45', 60:'60' },
                      default: String(self.cfg.creditsSec) },
                    { name: 'Титри (сек до кінця)' },
                    v => { self.cfg.creditsSec = +v; saveJSON(CFG_KEY, self.cfg); }
                );

                add('next',
                    { name: 'as_next', type: 'select',
                      values: { '-1':'Вимкнено', 3:'3 сек', 5:'5 сек', 10:'10 сек' },
                      default: String(self.cfg.autoNext ? self.cfg.nextDelay : -1) },
                    { name: 'Автонаступна серія' },
                    v => {
                        const n = +v;
                        self.cfg.autoNext = n > 0;
                        self.cfg.nextDelay = n > 0 ? n : 5;
                        saveJSON(CFG_KEY, self.cfg);
                    }
                );

                add('clear',
                    { name: 'as_clear', type: 'button' },
                    { name: '🗑 Очистити базу інтро' },
                    () => {
                        localStorage.removeItem(DB_KEY);
                        self.db = {};
                        notify('Базу очищено');
                    }
                );

                add('export',
                    { name: 'as_export', type: 'button' },
                    { name: '📋 Експорт бази (консоль)' },
                    () => {
                        console.log(LOG, 'EXPORT:', JSON.stringify(self.db));
                        notify('База виведена в консоль (F12)');
                    }
                );

            } catch (e) { console.warn(LOG, 'Settings fail', e); }
        }
    };

    // ===================== ЗАПУСК =====================
    function boot() {
        if (typeof Lampa !== 'undefined' && Lampa.Listener) {
            Lampa.Listener.follow('app', (e) => {
                if (e.type === 'ready') plugin.init();
            });
        }
        // Fallback
        setTimeout(() => {
            if (!plugin.video && !plugin.flags.attached) {
                plugin.init();
            }
        }, 1000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    window.AutoSkip = plugin;

})();
