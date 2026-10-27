(function () {
    'use strict';

    if (window.card_release_format_plugin) return;
    window.card_release_format_plugin = true;

    // ---------- НАСТРОЙКИ ----------
    var DEFAULT_JACRED = 'https://crab.rip';
    var USE_LAMPA_PARSER_URL = true;

    var CACHE_KEY = 'card_release_format_cache_v3';
    var TTL = 7 * 24 * 60 * 60 * 1000;        // 7 дней — для устоявшихся релизов
    var TTL_SHORT = 6 * 60 * 60 * 1000;       // 6 часов — пустой результат или свежий релиз
    var FRESH_DAYS = 90;                      // релиз младше N дней считается «свежим»
    var MAX_PARALLEL = 2;
    var REQUEST_TIMEOUT = 15000;
    var SHOW_RESOLUTION = true;               // дописывать 1080p / 4K
    var MIN_SEEDS = 0;                        // игнорировать раздачи с меньшим числом сидов

    // Минимальный возраст релиза (в днях от премьеры) для «физических» и веб-форматов.
    // Отсекает неправильно названные раздачи вроде «REMUX» у фильма, который только вышел.
    var MIN_AGE_PHYSICAL = 30;
    var MIN_AGE_WEB = 10;

    // ---------- форматы (от худшего к лучшему) ----------
    // g — группа цвета, kind — для проверки возраста релиза
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

    // Проверяем от лучшего к худшему, чтобы «BD Remux» не распознался как «BDRip»
    var CHECK_ORDER = FORMATS.slice().sort(function (a, b) { return b.rank - a.rank; });

    function detectFormat(title) {
        title = (title || '').toLowerCase();
        for (var i = 0; i < CHECK_ORDER.length; i++) {
            if (CHECK_ORDER[i].re.test(title)) return CHECK_ORDER[i];
        }
        return null;
    }

    // ---------- нормализация названий ----------
    function norm(s) {
        s = (s || '').toString().toLowerCase()
            .replace(/ё/g, 'е')
            .replace(/&/g, ' and ')
            .replace(/[^a-z0-9а-яіїєґ]+/g, ' ')
            .replace(/^(the|a|an)\s+/, '')
            .replace(/\s+/g, ' ')
            .trim();
        return s;
    }

    // Раздача относится именно к этой карточке?
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
        if (isNaN(t)) return null;
        return (Date.now() - t) / 86400000;
    }

    // Подходит ли формат по возрасту релиза (защита от фейков/неверных тегов)
    function ageAllows(f, releaseDate) {
        if (!f.kind || !releaseDate) return true;
        var d = daysSince(releaseDate);
        if (d === null) return true;
        if (f.kind === 'physical') return d >= MIN_AGE_PHYSICAL;
        if (f.kind === 'web') return d >= MIN_AGE_WEB;
        return true;
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

    // Выбираем лучший формат только среди раздач, относящихся к этому фильму/сериалу
    function pickBest(list, ctx) {
        var best = null, bestQ = 0;
        if (!Array.isArray(list)) return null;

        list.forEach(function (item) {
            if (!item || !item.title) return;
            if (MIN_SEEDS && (parseInt(item.sid, 10) || 0) < MIN_SEEDS) return;

            // 1) название должно совпадать
            if (!sameTitle(item, ctx.names)) return;

            // 2) год должен совпадать (для фильмов строго; сезоны сериалов — по любому году)
            if (!ctx.isTv && ctx.year) {
                var ry = parseInt(item.relased, 10);
                if (ry && ry !== ctx.year) return;
                if (!ry && (item.title || '').indexOf(String(ctx.year)) === -1) return;
            }

            var f = detectFormat(item.title);
            if (!f) return;

            // 3) формат не должен быть «из будущего» относительно премьеры
            if (!ageAllows(f, ctx.releaseDate)) return;

            var q = parseInt(item.quality, 10) || 0;
            if (!best || f.rank > best.rank || (f.rank === best.rank && q > bestQ)) {
                best = f;
                bestQ = q;
            }
        });

        return best ? { f: best.id, r: resLabel(bestQ) } : null;
    }

    // ---------- стили ----------
    var css = '' +
        '.card__view{position:relative}' +
        '.card-rf{position:absolute;left:.4em;bottom:.4em;z-index:3;' +
        'padding:.15em .45em;border-radius:.3em;font-size:.95em;font-weight:700;line-height:1.3;' +
        'background:rgba(0,0,0,.78);border:2px solid;letter-spacing:.02em;pointer-events:none;white-space:nowrap}' +
        '.card-rf--cam{color:#f44336;border-color:#f44336}' +
        '.card-rf--scr{color:#ff9800;border-color:#ff9800}' +
        '.card-rf--tv{color:#29b6f6;border-color:#29b6f6}' +
        '.card-rf--web{color:#4caf50;border-color:#4caf50}' +
        '.card-rf--bd{color:#ffc107;border-color:#ffc107}' +
        '.card-rf--remux{color:#ce93d8;border-color:#ce93d8}';

    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    // ---------- кэш ----------
    var cache = {};
    try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch (e) { cache = {}; }

    function saveCache() {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (e) {}
    }

    // чистим просроченные записи при старте
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
        if (d !== null && d < FRESH_DAYS) return TTL_SHORT;
        return TTL;
    }

    // ---------- адрес JacRed ----------
    function getBase() {
        var base = DEFAULT_JACRED, key = '';
        try {
            if (USE_LAMPA_PARSER_URL && window.Lampa && Lampa.Storage) {
                var u = Lampa.Storage.get('jackett_url', '');
                if (u) base = u;
                key = Lampa.Storage.get('jackett_key', '') || '';
            }
        } catch (e) {}
        if (!/^https?:\/\//i.test(base)) base = 'http://' + base;
        return { url: base.replace(/\/+$/, ''), key: key };
    }

    // ---------- очередь запросов ----------
    var queue = [];
    var running = 0;
    var pending = {}; // ckey -> [callbacks], чтобы не дублировать одинаковые запросы

    function next() {
        while (running < MAX_PARALLEL && queue.length) {
            var job = queue.shift();
            running++;
            job(function () { running--; next(); });
        }
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
            cbs.forEach(function (fn) { fn(res); });
        }

        queue.push(function (done) {
            var b = getBase();
            var url = b.url + '/api/v1.0/torrents?search=' + encodeURIComponent(ctx.searchTitle) +
                (!ctx.isTv && ctx.year ? '&year=' + ctx.year : '') +
                (b.key ? '&apikey=' + encodeURIComponent(b.key) : '');

            fetchJson(url)
                .then(function (list) {
                    var r = pickBest(list, ctx) || { f: '', r: '' };
                    var entry = { f: r.f, r: r.r, t: Date.now() };
                    cache[ckey] = entry;
                    saveCache();
                    finish(entry);
                    done();
                })
                .catch(function () {
                    // ошибки сети в кэш не пишем
                    finish({ f: '', r: '' });
                    done();
                });
        });
        next();
    }

    // ---------- отрисовка ----------
    function formatById(id) {
        for (var i = 0; i < FORMATS.length; i++) if (FORMATS[i].id === id) return FORMATS[i];
        return null;
    }

    function processCard(el) {
        if (el.getAttribute('data-crf')) return;

        var data = el.card_data || (window.$ && $(el).data('card'));
        if (!data) return;

        var view = el.querySelector('.card__view');
        if (!view) return;

        var isTv = !!(data.first_air_date || data.name) && !data.release_date;
        var releaseDate = (data.release_date || data.first_air_date || '') + '';
        var year = parseInt(releaseDate.slice(0, 4), 10) || 0;

        var orig = data.original_title || data.original_name;
        var local = data.title || data.name;
        var searchTitle = orig || local;
        if (!searchTitle) return;

        // Не вышло — форматов быть не может
        var d = daysSince(releaseDate);
        if (d !== null && d < -1) { el.setAttribute('data-crf', '1'); return; }

        el.setAttribute('data-crf', '1');

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
            if (!f || view.querySelector('.card-rf')) return;
            var b = document.createElement('div');
            b.className = 'card-rf card-rf--' + f.g;
            b.textContent = f.label + (SHOW_RESOLUTION && res.r && f.rank >= 9 ? ' ' + res.r : '');
            view.appendChild(b);
        });
    }

    function scan(root) {
        if (!root || root.nodeType !== 1) return;
        if (root.classList.contains('card')) processCard(root);
        var cards = root.querySelectorAll ? root.querySelectorAll('.card') : [];
        for (var i = 0; i < cards.length; i++) processCard(cards[i]);
    }

    function start() {
        scan(document.body);
        new MutationObserver(function (muts) {
            muts.forEach(function (m) {
                for (var i = 0; i < m.addedNodes.length; i++) scan(m.addedNodes[i]);
            });
        }).observe(document.body, { childList: true, subtree: true });
    }

    if (window.appready) start();
    else if (window.Lampa && Lampa.Listener) {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') start();
        });
    } else {
        document.addEventListener('DOMContentLoaded', start);
    }
})();
