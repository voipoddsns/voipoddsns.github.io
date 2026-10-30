(function () {
    'use strict';

    // Доповнення до Obsidian: показує формат релізу (CAMRip, WEB-DL, BDRip, REMUX ...)
    // у метаданих картки поруч з рейтингом/якістю. Підключати ПІСЛЯ obsidian.js.

    if (window.obsidian_release_format) return;
    window.obsidian_release_format = true;

    // ---------- НАЛАШТУВАННЯ ЗА ЗАМОВЧУВАННЯМ ----------
    var DEFAULTS = {
        enabled: true,                 // показувати формат релізу
        replace: false,                // ховати рідну якість Obsidian (TS/HD/4K), якщо формат знайдено
        resolution: true,              // дописувати 1080p / 4K
        jacred: 'https://crab.rip'     // адреса JacRed
    };

    var CACHE_KEY = 'obsidian_release_format_cache';
    var TTL = 7 * 24 * 60 * 60 * 1000;       // 7 днів
    var TTL_SHORT = 6 * 60 * 60 * 1000;      // 6 годин: порожній результат або свіжий реліз
    var FRESH_DAYS = 90;
    var MAX_PARALLEL = 3;
    var REQUEST_TIMEOUT = 15000;
    var MIN_SEEDS = 0;

    // Мінімальний вік релізу (днів від прем'єри) для фізичних/веб-форматів.
    // Відсікає хибні теги на кшталт «REMUX» у щойно вийшовшого фільму.
    var MIN_AGE_PHYSICAL = 30;
    var MIN_AGE_WEB = 10;

    // ---------- налаштування з Lampa.Storage ----------
    function opt(name) {
        try { return Lampa.Storage.get('crf_' + name, DEFAULTS[name]); } catch (e) { return DEFAULTS[name]; }
    }

    // ---------- формати (від гіршого до кращого) ----------
    var FORMATS = [
        { id: 'cam',      label: 'CAMRip',     rank: 1,  g: 'cam',   re: /camrip|cam-?rip|hdcam|\bcam\b|камрип|экранка/i },
        { id: 'ts',       label: 'TS',         rank: 2,  g: 'cam',   re: /telesync|hdts|\bts\b|\bpdvd\b|телесинк/i },
        { id: 'tc',       label: 'TC',         rank: 3,  g: 'cam',   re: /telecine|\bhdtc\b|\btc\b|телесин/i },
        { id: 'scr',      label: 'SCR',        rank: 4,  g: 'scr',   re: /dvd-?scr|screener|\bscr\b|скринер/i },
        { id: 'wp',       label: 'WP',         rank: 5,  g: 'scr',   re: /workprint|\bwp\b/i },
        { id: 'vhs',      label: 'VHSRip',     rank: 6,  g: 'tv',    re: /vhs-?rip|\bvhs\b/i },
        { id: 'ld',       label: 'LaserDisc',  rank: 7,  g: 'tv',    re: /ldrip|\bld\b|laserdisc/i },
        { id: 'tv',       label: 'TVRip',      rank: 8,  g: 'tv',    re: /tvrip|satrip|dvbrip|dtsv|iptv-?rip/i },
        { id: 'hdtv',     label: 'HDTV',       rank: 9,  g: 'tv',    re: /hdtv|hdtvrip/i },
        { id: 'dvd',      label: 'DVDRip',     rank: 10, g: 'bd',    kind: 'physical', re: /dvd-?rip|dvd-?9|dvd-?5|dvdscrrip/i },
        { id: 'hdup',     label: 'HD-Upscale', rank: 11, g: 'tv',    re: /upscale|апскейл|ai-?upscale/i },
        { id: 'webrip',   label: 'WEB-Rip',    rank: 12, g: 'web',   kind: 'web', re: /web-?rip|webrip|\bpdtv\b/i },
        { id: 'web',      label: 'WEB-DL',     rank: 13, g: 'web',   kind: 'web', re: /web-?dl|webdl|amzn-?web|nf-?web|dsny-?web|apple-?tv\+?-?web|hmax-?web|sho-?web|itunes/i },
        { id: 'hdrip',    label: 'HDRip',      rank: 14, g: 'web',   kind: 'web', re: /hd-?rip/i },
        { id: 'brrip',    label: 'BRRip',      rank: 15, g: 'bd',    kind: 'physical', re: /brrip|bdr-?rip/i },
        { id: 'bdrip',    label: 'BDRip',      rank: 16, g: 'bd',    kind: 'physical', re: /bdrip|bd-?rip/i },
        { id: 'webdlmux', label: 'WEB-DL MUX', rank: 17, g: 'web',   kind: 'web', re: /web-?dl-?mux|web-?mux/i },
        { id: '3d',       label: '3D Blu-Ray', rank: 18, g: 'bd',    kind: 'physical', re: /(^|[^a-z0-9])3d([^a-z0-9]|$)|hsbs|half-?sbs|\bh-?ou\b|half-?ou/i },
        { id: 'bluray',   label: 'Blu-Ray',    rank: 19, g: 'bd',    kind: 'physical', re: /blu-?ray|bluray|bdmv|\bbd\b|iso-?bd/i },
        { id: 'webremux', label: 'WEB-REMUX',  rank: 20, g: 'web',   kind: 'web', re: /web-?remux|hybrid-?web/i },
        { id: 'uhdbdrip', label: 'UHD BDRip',  rank: 21, g: 'bd',    kind: 'physical', re: /uhd-?bdrip|4k-?bdrip|2160p-?bdrip/i },
        { id: 'remux',    label: 'REMUX',      rank: 22, g: 'remux', kind: 'physical', re: /remux|bd-?remux/i },
        { id: 'uhdremux', label: 'UHD REMUX',  rank: 23, g: 'remux', kind: 'physical', re: /uhd-?remux|4k-?remux|2160p-?remux/i }
    ];

    var CHECK_ORDER = FORMATS.slice().sort(function (a, b) { return b.rank - a.rank; });

    function detectFormat(title) {
        title = (title || '').toLowerCase();
        for (var i = 0; i < CHECK_ORDER.length; i++) {
            if (CHECK_ORDER[i].re.test(title)) return CHECK_ORDER[i];
        }
        return null;
    }

    function formatById(id) {
        for (var i = 0; i < FORMATS.length; i++) if (FORMATS[i].id === id) return FORMATS[i];
        return null;
    }

    // ---------- нормалізація та фільтри ----------
    function norm(s) {
        return (s || '').toString().toLowerCase()
            .replace(/ё/g, 'е')
            .replace(/&/g, ' and ')
            .replace(/[^a-z0-9а-яіїєґ]+/g, ' ')
            .replace(/^(the|a|an)\s+/, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function sameTitle(item, names) {
        var cand = [norm(item.originalname), norm(item.name)];
        for (var i = 0; i < cand.length; i++) {
            if (!cand[i]) continue;
            for (var j = 0; j < names.length; j++) {
                if (names[j] && cand[i] === names[j]) return true;
            }
        }
        return false;
    }

    function daysSince(dateStr) {
        var t = Date.parse(dateStr);
        return isNaN(t) ? null : (Date.now() - t) / 86400000;
    }

    function ageAllows(f, releaseDate) {
        if (!f.kind || !releaseDate) return true;
        var d = daysSince(releaseDate);
        if (d === null) return true;
        return d >= (f.kind === 'physical' ? MIN_AGE_PHYSICAL : MIN_AGE_WEB);
    }

    function resLabel(q) {
        q = parseInt(q, 10);
        if (!q) return '';
        if (q >= 2160) return '4K';
        if (q >= 1440) return '1440p';
        if (q >= 1080) return '1080p';
        if (q >= 720) return '720p';
        if (q >= 480) return '480p';
        return '';
    }

    function pickBest(list, ctx) {
        var best = null, bestQ = 0;
        if (!Array.isArray(list)) return null;

        list.forEach(function (item) {
            if (!item || !item.title) return;
            if (MIN_SEEDS && (parseInt(item.sid, 10) || 0) < MIN_SEEDS) return;
            if (!sameTitle(item, ctx.names)) return;

            if (!ctx.isTv && ctx.year) {
                var ry = parseInt(item.relased, 10);
                if (ry && ry !== ctx.year) return;
                if (!ry && (item.title || '').indexOf(String(ctx.year)) === -1) return;
            }

            var f = detectFormat(item.title);
            if (!f || !ageAllows(f, ctx.releaseDate)) return;

            var q = parseInt(item.quality, 10) || 0;
            if (!best || f.rank > best.rank || (f.rank === best.rank && q > bestQ)) {
                best = f;
                bestQ = q;
            }
        });

        return best ? { f: best.id, r: resLabel(bestQ) } : null;
    }

    // ---------- кеш ----------
    var cache = {};
    try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch (e) { cache = {}; }

    function saveCache() {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (e) {}
    }

    (function cleanup() {
        var now = Date.now(), changed = false;
        for (var k in cache) {
            if (!cache[k] || now - cache[k].t > TTL) { delete cache[k]; changed = true; }
        }
        if (changed) saveCache();
    })();

    function cacheTtl(entry, ctx) {
        if (!entry.f) return TTL_SHORT;
        var d = daysSince(ctx.releaseDate);
        return (d !== null && d < FRESH_DAYS) ? TTL_SHORT : TTL;
    }

    // ---------- черга запитів ----------
    var queue = [];
    var running = 0;
    var pending = {};

    function next() {
        while (running < MAX_PARALLEL && queue.length) {
            var job = queue.shift();
            running++;
            job(function () { running--; next(); });
        }
    }

    function getBase() {
        var base = (opt('jacred') || DEFAULTS.jacred) + '';
        if (!/^https?:\/\//i.test(base)) base = 'http://' + base;
        return base.replace(/\/+$/, '');
    }

    function fetchJson(url) {
        return new Promise(function (resolve, reject) {
            var timer = setTimeout(function () { reject(new Error('timeout')); }, REQUEST_TIMEOUT);
            fetch(url).then(function (r) {
                if (!r.ok) throw new Error('http ' + r.status);
                return r.json();
            }).then(function (j) { clearTimeout(timer); resolve(j); })
              .catch(function (e) { clearTimeout(timer); reject(e); });
        });
    }

    function request(ctx, cb) {
        var ckey = ctx.searchTitle + '|' + (ctx.isTv ? 'tv' : ctx.year);
        var c = cache[ckey];
        if (c && Date.now() - c.t < cacheTtl(c, ctx)) return cb(c);

        if (pending[ckey]) { pending[ckey].push(cb); return; }
        pending[ckey] = [cb];

        function finish(res) {
            var cbs = pending[ckey] || [];
            delete pending[ckey];
            cbs.forEach(function (fn) { try { fn(res); } catch (e) {} });
        }

        queue.push(function (done) {
            var url = getBase() + '/api/v1.0/torrents?search=' + encodeURIComponent(ctx.searchTitle) +
                (!ctx.isTv && ctx.year ? '&year=' + ctx.year : '');

            fetchJson(url)
                .then(function (list) {
                    var r = pickBest(list, ctx) || { f: '', r: '' };
                    var entry = { f: r.f, r: r.r, t: Date.now() };
                    cache[ckey] = entry;
                    saveCache();
                    finish(entry);
                    done();
                })
                .catch(function () { finish({ f: '', r: '' }); done(); });
        });
        next();
    }

    // ---------- відображення ----------
    function makeBadge(f, res) {
        var el = document.createElement('span');
        // Класи Obsidian: розмір, тінь і noir-режим успадковуються від його якості
        el.className = 'metadata__quality metadata__format metadata__format--' + f.g;
        var label = document.createElement('span');
        label.className = 'metadata__quality-label';
        label.textContent = f.label + (opt('resolution') && res && f.rank >= 9 ? ' ' + res : '');
        el.appendChild(label);
        return el;
    }

    function place(html, f, res) {
        if (html.querySelector('.metadata__format, .card-rf')) return;

        var bottom = html.querySelector('.card__metadata .metadata__bottom');

        if (bottom) {
            // Картка Obsidian: додаємо поруч із якістю/рейтингом
            var badge = makeBadge(f, res);
            var anchor = bottom.querySelector('.metadata__quality') || bottom.querySelector('.metadata__rating');
            if (anchor && anchor.parentNode) {
                anchor.parentNode.insertBefore(badge, anchor.nextSibling);
            } else {
                (bottom.children[0] || bottom).appendChild(badge);
            }
            html.setAttribute('data-crf-has', '1');
        } else {
            // Картка без метаданих Obsidian: простий бейдж у куті постера
            var view = html.querySelector('.card__view');
            if (!view) return;
            var el = document.createElement('div');
            el.className = 'card-rf card-rf--' + f.g;
            el.textContent = f.label + (opt('resolution') && res && f.rank >= 9 ? ' ' + res : '');
            view.appendChild(el);
        }
    }

    function processCard(html, data) {
        if (!opt('enabled')) return;
        if (!html || !data || html.getAttribute('data-crf')) return;
        if (!data.id && !data.original_title && !data.original_name) return;

        var isTv = data.media_type === 'tv' || (!data.release_date && !!(data.first_air_date || data.name));
        var releaseDate = (data.release_date || data.first_air_date || '') + '';
        var year = parseInt(releaseDate.slice(0, 4), 10) || 0;

        var orig = data.original_title || data.original_name;
        var local = data.title || data.name;
        var searchTitle = orig || local;
        if (!searchTitle) return;

        html.setAttribute('data-crf', '1');

        // Ще не вийшло — форматів бути не може
        var d = daysSince(releaseDate);
        if (d !== null && d < -1) return;

        var names = [norm(orig), norm(local)].filter(function (x, i, a) { return x && a.indexOf(x) === i; });

        var ctx = {
            searchTitle: searchTitle,
            names: names,
            year: year,
            isTv: isTv,
            releaseDate: releaseDate
        };

        request(ctx, function (res) {
            var f = formatById(res.f);
            if (f) place(html, f, res.r);
        });
    }

    // ---------- підключення до карток Obsidian ----------
    var hooked = false;

    function hookMaker() {
        try {
            var map = Lampa.Maker && Lampa.Maker.map && Lampa.Maker.map('Card');
            if (!map || !map.Card) return false;

            var prev = map.Card.onVisible;
            map.Card.onVisible = function () {
                var r = typeof prev === 'function' ? prev.apply(this, arguments) : undefined;
                try {
                    if (this.html && this.data) processCard(this.html, this.data);
                } catch (e) {}
                return r;
            };
            return true;
        } catch (e) {
            return false;
        }
    }

    // Запасний варіант: спостерігач за DOM (якщо Maker недоступний)
    function startObserver() {
        function scan(root) {
            if (!root || root.nodeType !== 1) return;
            var list = [];
            if (root.classList.contains('card')) list.push(root);
            if (root.querySelectorAll) {
                var found = root.querySelectorAll('.card');
                for (var i = 0; i < found.length; i++) list.push(found[i]);
            }
            list.forEach(function (el) {
                var data = el.card_data || (window.$ && $(el).data('card'));
                if (data) processCard(el, data);
            });
        }
        scan(document.body);
        new MutationObserver(function (muts) {
            muts.forEach(function (m) {
                for (var i = 0; i < m.addedNodes.length; i++) scan(m.addedNodes[i]);
            });
        }).observe(document.body, { childList: true, subtree: true });
    }

    // ---------- стилі ----------
    function addStyles() {
        var style = document.createElement('style');
        style.textContent = '' +
            // Кольори в палітрі Obsidian (як у його якості TS/HD/4K)
            '.metadata__format{white-space:nowrap}' +
            '.metadata__format--cam{color:#ef5350}' +
            '.metadata__format--scr{color:#ff9800}' +
            '.metadata__format--tv{color:#42a5f5}' +
            '.metadata__format--web{color:#66bb6a}' +
            '.metadata__format--bd{color:#ffc107}' +
            '.metadata__format--remux{color:#ce93d8}' +
            // Рідна якість Obsidian ховається лише за опцією і лише коли формат знайдено
            'body.crf--replace .card[data-crf-has] .metadata__quality:not(.metadata__format){display:none!important}' +
            // Запасний бейдж для карток без метаданих Obsidian
            '.card__view{position:relative}' +
            '.card-rf{position:absolute;left:.4em;bottom:.4em;z-index:3;padding:.15em .45em;border-radius:.3em;' +
            'font-size:.95em;font-weight:700;line-height:1.3;background:rgba(0,0,0,.78);border:2px solid;' +
            'letter-spacing:.02em;pointer-events:none;white-space:nowrap}' +
            '.card-rf--cam{color:#ef5350;border-color:#ef5350}' +
            '.card-rf--scr{color:#ff9800;border-color:#ff9800}' +
            '.card-rf--tv{color:#42a5f5;border-color:#42a5f5}' +
            '.card-rf--web{color:#66bb6a;border-color:#66bb6a}' +
            '.card-rf--bd{color:#ffc107;border-color:#ffc107}' +
            '.card-rf--remux{color:#ce93d8;border-color:#ce93d8}';
        document.head.appendChild(style);
    }

    function applyReplaceClass() {
        var on = !!opt('replace');
        if (document.body.classList) document.body.classList.toggle('crf--replace', on);
    }

    // ---------- налаштування ----------
    function addSettings() {
        try {
            Lampa.Lang.add({
                crf_title:      { uk: 'Формат релізу', ru: 'Формат релиза', en: 'Release format' },
                crf_enabled:    { uk: 'Показувати формат релізу', ru: 'Показывать формат релиза', en: 'Show release format' },
                crf_replace:    { uk: 'Замінити якість Obsidian', ru: 'Заменить качество Obsidian', en: 'Replace Obsidian quality' },
                crf_resolution: { uk: 'Показувати роздільність', ru: 'Показывать разрешение', en: 'Show resolution' },
                crf_jacred:     { uk: 'Адреса JacRed', ru: 'Адрес JacRed', en: 'JacRed address' },
                crf_clear:      { uk: 'Очистити кеш форматів', ru: 'Очистить кэш форматов', en: 'Clear format cache' },
                crf_cleared:    { uk: 'Кеш очищено', ru: 'Кэш очищен', en: 'Cache cleared' }
            });

            var comp = 'crf_settings';

            Lampa.SettingsApi.addComponent({
                component: comp,
                name: Lampa.Lang.translate('crf_title'),
                icon: '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm1 2v10h14V7H5zm2 2h4v2H7V9zm0 4h10v2H7v-2z"/></svg>'
            });

            Lampa.SettingsApi.addParam({
                component: comp,
                param: { name: 'crf_enabled', type: 'trigger', default: DEFAULTS.enabled },
                field: { name: Lampa.Lang.translate('crf_enabled') }
            });

            Lampa.SettingsApi.addParam({
                component: comp,
                param: { name: 'crf_replace', type: 'trigger', default: DEFAULTS.replace },
                field: { name: Lampa.Lang.translate('crf_replace') },
                onChange: applyReplaceClass
            });

            Lampa.SettingsApi.addParam({
                component: comp,
                param: { name: 'crf_resolution', type: 'trigger', default: DEFAULTS.resolution },
                field: { name: Lampa.Lang.translate('crf_resolution') }
            });

            Lampa.SettingsApi.addParam({
                component: comp,
                param: { name: 'crf_jacred', type: 'input', values: '', default: DEFAULTS.jacred },
                field: { name: Lampa.Lang.translate('crf_jacred'), description: DEFAULTS.jacred }
            });

            Lampa.SettingsApi.addParam({
                component: comp,
                param: { type: 'button' },
                field: { name: Lampa.Lang.translate('crf_clear') },
                onChange: function () {
                    cache = {};
                    try { localStorage.removeItem(CACHE_KEY); } catch (e) {}
                    Lampa.Noty.show(Lampa.Lang.translate('crf_cleared'));
                }
            });
        } catch (e) {
            console.warn('obsidian_release_format: settings error', e && e.message);
        }
    }

    // ---------- запуск ----------
    function start() {
        addStyles();
        addSettings();
        applyReplaceClass();

        hooked = hookMaker();
        if (!hooked) startObserver();
    }

    if (window.appready) start();
    else if (window.Lampa && Lampa.Listener) {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') start();
        });
    } else {
        document.addEventListener('DOMContentLoaded', function () {
            if (window.Lampa) start();
        });
    }
})();
