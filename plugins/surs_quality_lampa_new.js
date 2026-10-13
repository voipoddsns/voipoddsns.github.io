(function () {
    'use strict';

    if (window.card_quality_plugin) return;
    window.card_quality_plugin = true;

    var API = 'https://jacred.lampach.cloud/api/v1.0/torrents';
    var CACHE_KEY = 'card_quality_cache_v1';
    var TTL = 7 * 24 * 60 * 60 * 1000; // 7 дней
    var MAX_PARALLEL = 2;

    var cache = {};
    try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch (e) { cache = {}; }

    function saveCache() {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (e) {}
    }

    // ---------- стили ----------
    var css = '' +
        '.card__view{position:relative}' +
        '.card-q{position:absolute;left:.4em;bottom:.4em;z-index:3;' +
        'padding:.15em .45em;border-radius:.3em;font-size:1em;font-weight:700;line-height:1.3;' +
        'background:rgba(0,0,0,.75);border:2px solid;letter-spacing:.02em;pointer-events:none}' +
        '.card-q--4k{color:#ffc107;border-color:#ffc107}' +
        '.card-q--fhd{color:#4caf50;border-color:#4caf50}' +
        '.card-q--hd{color:#f44336;border-color:#f44336}' +
        '.card-q--sd{color:#9e9e9e;border-color:#9e9e9e}';

    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    // ---------- определение качества ----------
    function labelFromNumber(q) {
        if (q >= 2160) return '4K';
        if (q >= 1080) return 'FHD';
        if (q >= 720) return 'HD';
        if (q > 0) return 'SD';
        return '';
    }

    function labelFromTitle(t) {
        t = (t || '').toLowerCase();
        if (/2160|4k|uhd/.test(t)) return '4K';
        if (/1080/.test(t)) return 'FHD';
        if (/720/.test(t)) return 'HD';
        if (/dvdrip|webrip|hdtv|bdrip|480|576/.test(t)) return 'SD';
        return '';
    }

    var order = { '': 0, 'SD': 1, 'HD': 2, 'FHD': 3, '4K': 4 };

    function bestQuality(list) {
        var best = '';
        (list || []).forEach(function (item) {
            var l = labelFromNumber(parseInt(item.quality, 10) || 0) || labelFromTitle(item.title);
            if (order[l] > order[best]) best = l;
        });
        return best;
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
        var key = title + '|' + year;
        var c = cache[key];
        if (c && Date.now() - c.t < TTL) return cb(c.q);

        queue.push(function (done) {
            var url = API + '?search=' + encodeURIComponent(title) + (year ? '&year=' + year : '');
            fetch(url)
                .then(function (r) { return r.json(); })
                .then(function (list) {
                    var q = bestQuality(list);
                    cache[key] = { q: q, t: Date.now() };
                    saveCache();
                    cb(q);
                    done();
                })
                .catch(function () { cb(''); done(); });
        });
        next();
    }

    // ---------- отрисовка бейджа ----------
    function badgeClass(q) {
        return { '4K': 'card-q--4k', 'FHD': 'card-q--fhd', 'HD': 'card-q--hd', 'SD': 'card-q--sd' }[q];
    }

    function processCard(el) {
        if (el.getAttribute('data-cq')) return;

        var data = el.card_data || (window.$ && $(el).data('card'));
        if (!data) return;

        var view = el.querySelector('.card__view');
        if (!view) return;

        var title = data.original_title || data.original_name || data.title || data.name;
        var date = data.release_date || data.first_air_date || '';
        var year = (date + '').slice(0, 4);
        if (!title) return;

        el.setAttribute('data-cq', '1');

        request(title, year, function (q) {
            if (!q || view.querySelector('.card-q')) return;
            var b = document.createElement('div');
            b.className = 'card-q ' + badgeClass(q);
            b.textContent = q;
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
