(function () {
    'use strict';

    if (window.card_release_format_plugin) return;
    window.card_release_format_plugin = true;

    // ---------- НАСТРОЙКИ ----------
    // Адрес JacRed по умолчанию. Если в настройках парсера Lampa указан свой адрес
    // (Настройки -> Парсер), плагин возьмёт его оттуда.
    var DEFAULT_JACRED = 'https://jacred.su';
    var USE_LAMPA_PARSER_URL = true;

    var CACHE_KEY = 'card_release_format_cache_v2';
    var TTL = 7 * 24 * 60 * 60 * 1000; // 7 дней
    var MAX_PARALLEL = 2;

    // ---------- форматы (от худшего к лучшему) ----------
    // rank — для выбора лучшего среди найденных раздач
    var FORMATS = [
        { id: 'cam',   label: 'CAMRip', rank: 1,  re: /camrip|cam-?rip|hdcam|\bcam\b|камрип|экранка/i },
        { id: 'ts',    label: 'TS',     rank: 2,  re: /telesync|hdts|\bts\b|\bpdvd\b|телесинк/i },
        { id: 'tc',    label: 'TC',     rank: 3,  re: /telecine|\bhdtc\b|\btc\b|телесин/i },
        { id: 'scr',   label: 'SCR',    rank: 4,  re: /dvd-?scr|screener|\bscr\b|скринер/i },
        { id: 'wp',    label: 'WP',     rank: 5,  re: /workprint|\bwp\b/i },
        { id: 'vhs',   label: 'VHSRip', rank: 6,  re: /vhs-?rip|\bvhs\b/i },
        { id: 'tv',    label: 'TVRip',  rank: 7,  re: /tvrip|satrip|dvbrip|dtsv|\btv\b|iptv-?rip/i },
        { id: 'hdtv',  label: 'HDTV',   rank: 8,  re: /hdtv|hdtvrip/i },
        { id: 'dvd',   label: 'DVDRip', rank: 9,  re: /dvd-?rip|dvd-?9|dvd-?5|dvdscrrip/i },
        { id: 'hdup',  label: 'HD-Upscale', rank: 10, re: /upscale|апскейл/i },
        { id: 'web',   label: 'WEB-DL', rank: 11, re: /web-?dl|web-?rip|webdlrip|\bweb\b|amzn-?web|nf-?web|dsny-?web|apple-?tv/i },
        { id: 'hdrip', label: 'HDRip',  rank: 12, re: /hd-?rip/i },
        { id: 'bdrip', label: 'BDRip',  rank: 13, re: /bdrip|brrip|bd-?rip/i },
        { id: 'bluray',label: 'Blu-Ray',rank: 14, re: /blu-?ray|bluray|bdmv|\bbd\b/i },
        { id: 'remux', label: 'REMUX',  rank: 15, re: /remux/i }
    ];

    // Проверяем от лучшего к худшему, чтобы "BD Remux" не распознался как "BDRip"
    var CHECK_ORDER = FORMATS.slice().sort(function (a, b) { return b.rank - a.rank; });

    function detectFormat(title) {
        title = (title || '').toLowerCase();
        for (var i = 0; i < CHECK_ORDER.length; i++) {
            if (CHECK_ORDER[i].re.test(title)) return CHECK_ORDER[i];
        }
        return null;
    }

    function bestFormat(list) {
        var best = null;
        (list || []).forEach(function (item) {
            var f = detectFormat(item.title);
            if (f && (!best || f.rank > best.rank)) best = f;
        });
        return best;
    }

    // ---------- стили ----------
    var css = '' +
        '.card__view{position:relative}' +
        '.card-rf{position:absolute;left:.4em;bottom:.4em;z-index:3;' +
        'padding:.15em .45em;border-radius:.3em;font-size:.95em;font-weight:700;line-height:1.3;' +
        'background:rgba(0,0,0,.78);border:2px solid;letter-spacing:.02em;pointer-events:none}' +
        '.card-rf--cam,.card-rf--ts,.card-rf--tc{color:#f44336;border-color:#f44336}' +
        '.card-rf--scr{color:#ff9800;border-color:#ff9800}' +
        '.card-rf--hdtv{color:#29b6f6;border-color:#29b6f6}' +
        '.card-rf--web{color:#4caf50;border-color:#4caf50}' +
        '.card-rf--bdrip{color:#ffc107;border-color:#ffc107}' +
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

    function next() {
        while (running < MAX_PARALLEL && queue.length) {
            var job = queue.shift();
            running++;
            job(function () { running--; next(); });
        }
    }

    function request(title, year, cb) {
        var ckey = title + '|' + year;
        var c = cache[ckey];
        if (c && Date.now() - c.t < TTL) return cb(c.f);

        queue.push(function (done) {
            var b = getBase();
            var url = b.url + '/api/v1.0/torrents?search=' + encodeURIComponent(title) +
                (year ? '&year=' + year : '') +
                (b.key ? '&apikey=' + encodeURIComponent(b.key) : '');

            fetch(url)
                .then(function (r) { return r.json(); })
                .then(function (list) {
                    var f = bestFormat(list);
                    var id = f ? f.id : '';
                    cache[ckey] = { f: id, t: Date.now() };
                    saveCache();
                    cb(id);
                    done();
                })
                .catch(function () { cb(''); done(); });
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

        var title = data.original_title || data.original_name || data.title || data.name;
        var year = ((data.release_date || data.first_air_date || '') + '').slice(0, 4);
        if (!title) return;

        el.setAttribute('data-crf', '1');

        request(title, year, function (id) {
            var f = formatById(id);
            if (!f || view.querySelector('.card-rf')) return;
            var b = document.createElement('div');
            b.className = 'card-rf card-rf--' + f.id;
            b.textContent = f.label;
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
