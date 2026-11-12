(function () {
    'use strict';

    var Q_LOGGING = false;                        // логи в консоль (true для отладки)
    var Q_CACHE_TIME = 24 * 60 * 60 * 1000;       // кеш найденного качества
    var Q_CACHE_TIME_EMPTY = 60 * 60 * 1000;      // кеш "ничего не найдено"
    var QUALITY_CACHE = 'maxsm_ratings_quality_cache';
    var REQUEST_TIMEOUT = 6000;                   // таймаут одного запроса
    var MAX_PARALLEL = 3;                         // одновременных запросов (важно для слабых ТВ)

    // Протокол берём от страницы, иначе на https-Lampa запрос на http блокируется (mixed content)
    var JACRED_PROTOCOL = location.protocol === 'https:' ? 'https://' : 'http://';

    function getJacredUrl() {
        var url = '';
        try { url = Lampa.Storage.get('jac.red') || ''; } catch (e) {}
        url = String(url || 'jac.red').replace(/^https?:\/\//i, '').replace(/\/+$/, '');
        return url || 'jac.red';
    }

    function getJacredKey() {
        try { return Lampa.Storage.get('jacred_key') || ''; } catch (e) { return ''; }
    }

    // Сначала запрос напрямую, потом через прокси
    var PROXY_LIST = [
        { prefix: 'https://api.allorigins.win/raw?url=', encode: true },
        { prefix: 'https://cors.bwa.workers.dev/', encode: false }
    ];

    function log() {
        if (!Q_LOGGING) return;
        var args = ['MAXSM-RATINGS'].concat([].slice.call(arguments));
        console.log.apply(console, args);
    }

    function addStyle() {
        if (document.getElementById('maxsm_ratings_quality')) return;
        var st = document.createElement('style');
        st.id = 'maxsm_ratings_quality';
        st.textContent =
            '.card__view{position:relative !important;}' +
            '.card__quality{position:absolute !important;bottom:0.5em !important;left:-0.8em !important;' +
            'background-color:transparent !important;z-index:10;width:fit-content !important;' +
            'max-width:calc(100% - 1em) !important;}' +
            '.card__quality div{text-transform:none !important;border:1px solid #FFFFFF !important;' +
            'background-color:rgba(0,0,0,0.7) !important;color:#FFFFFF !important;font-weight:bold !important;' +
            'font-style:normal !important;font-size:1.2em !important;border-radius:3px !important;' +
            'padding:0.2em 0.4em !important;}';
        document.head.appendChild(st);
    }

    // ---------- сеть (XHR вместо fetch: работает на старых webOS/Tizen) ----------

    function httpGetJson(url, cb) {
        var done = false;
        var xhr = new XMLHttpRequest();
        var timer = setTimeout(function () { finish(new Error('timeout')); }, REQUEST_TIMEOUT);

        function finish(err, data) {
            if (done) return;
            done = true;
            clearTimeout(timer);
            try { xhr.abort(); } catch (e) {}
            cb(err, data);
        }

        try {
            xhr.open('GET', url, true);
            xhr.onreadystatechange = function () {
                if (xhr.readyState !== 4) return;
                if (xhr.status >= 200 && xhr.status < 300) {
                    try { finish(null, JSON.parse(xhr.responseText)); }
                    catch (e) { finish(new Error('bad json')); }
                } else {
                    finish(new Error('HTTP ' + xhr.status));
                }
            };
            xhr.onerror = function () { finish(new Error('network error')); };
            xhr.send();
        } catch (e) {
            finish(e);
        }
    }

    function fetchJsonWithFallback(url, cardId, cb) {
        var sources = [url];
        for (var i = 0; i < PROXY_LIST.length; i++) {
            sources.push(PROXY_LIST[i].prefix + (PROXY_LIST[i].encode ? encodeURIComponent(url) : url));
        }
        var idx = 0;
        (function next() {
            if (idx >= sources.length) { cb(new Error('all sources failed')); return; }
            var src = sources[idx++];
            log('card:', cardId, 'GET', src);
            httpGetJson(src, function (err, data) {
                if (err) { log('card:', cardId, 'failed:', src, err.message); next(); }
                else cb(null, data);
            });
        })();
    }

    // ---------- очередь запросов ----------

    var queue = [];
    var running = 0;

    function enqueue(task) {
        queue.push(task);
        pump();
    }

    function pump() {
        while (running < MAX_PARALLEL && queue.length) {
            (function (task) {
                running++;
                var finished = false;
                task(function () {
                    if (finished) return;
                    finished = true;
                    running--;
                    pump();
                });
            })(queue.shift());
        }
    }

    // ---------- JacRed ----------

    function translateQuality(q) {
        if (typeof q !== 'number') return null;
        if (q >= 2160) return '4K';
        if (q >= 1080) return 'FHD';
        if (q >= 720) return 'HD';
        if (q > 0) return 'SD';
        return null;
    }

    function searchJacred(title, year, cardId, cb) {
        var key = getJacredKey();
        var userId = '';
        try { userId = Lampa.Storage.get('lampac_unic_id', '') || ''; } catch (e) {}

        var apiUrl = JACRED_PROTOCOL + getJacredUrl() + '/api/v1.0/torrents?search=' +
            encodeURIComponent(title) + '&year=' + year + '&exact=true' +
            (userId ? '&uid=' + encodeURIComponent(userId) : '') +
            (key ? '&apikey=' + encodeURIComponent(key) : '');

        fetchJsonWithFallback(apiUrl, cardId, function (err, torrents) {
            if (err || !Array.isArray(torrents) || !torrents.length) { cb(null); return; }

            var best = -1;
            for (var i = 0; i < torrents.length; i++) {
                var t = torrents[i];
                var q = t.quality;
                if (typeof q !== 'number' || q === 0) continue;
                // отсекаем CAM/TS низкого качества
                if (/\b(ts|telesync|camrip|cam)\b/i.test(String(t.title || '')) && q < 720) continue;
                if (q > best) best = q;
            }
            cb(best > 0 ? translateQuality(best) : null);
        });
    }

    function getQuality(card, cardId, cb) {
        var date = card.release_date || '';
        var year = date.substring(0, 4);
        if (!year || isNaN(year)) { cb(null); return; }

        var titles = [];
        if (card.original_title && /[a-zа-яё0-9]/i.test(card.original_title)) titles.push(card.original_title.trim());
        if (card.title && /[a-zа-яё0-9]/i.test(card.title) && card.title !== card.original_title) titles.push(card.title.trim());

        (function next(i) {
            if (i >= titles.length) { cb(null); return; }
            searchJacred(titles[i], year, cardId, function (q) {
                if (q) cb(q); else next(i + 1);
            });
        })(0);
    }

    // ---------- кеш ----------

    function readCache(key) {
        var cache = Lampa.Storage.get(QUALITY_CACHE) || {};
        var item = cache[key];
        if (!item) return null;
        var ttl = item.quality ? Q_CACHE_TIME : Q_CACHE_TIME_EMPTY;
        return (Date.now() - item.timestamp < ttl) ? item : null;
    }

    function writeCache(key, quality) {
        var cache = Lampa.Storage.get(QUALITY_CACHE) || {};
        cache[key] = { quality: quality || null, timestamp: Date.now() };
        Lampa.Storage.set(QUALITY_CACHE, cache);
    }

    // ---------- карточки ----------

    function getCardType(card) {
        var type = card.media_type || card.type;
        if (type === 'movie' || type === 'tv') return type;
        return (card.name || card.original_name) ? 'tv' : 'movie';
    }

    function getCardData(el) {
        if (el.card_data) return el.card_data;
        try { if (window.$) return window.$(el).data('card_data') || null; } catch (e) {}
        return null;
    }

    function renderQuality(el, quality) {
        if (!document.body.contains(el)) return;
        var view = el.querySelector('.card__view');
        if (!view) return;

        var old = view.querySelectorAll('.card__quality');
        for (var i = 0; i < old.length; i++) old[i].parentNode.removeChild(old[i]);

        if (!quality) return;
        var wrap = document.createElement('div');
        wrap.className = 'card__quality';
        var inner = document.createElement('div');
        inner.textContent = quality;
        wrap.appendChild(inner);
        view.appendChild(wrap);
    }

    function processCard(el, attempt) {
        if (el.getAttribute('data-quality-added')) return;

        var data = getCardData(el);
        if (!data) {
            // card_data ещё не проставлен — пробуем позже
            if ((attempt || 0) < 8) {
                setTimeout(function () { processCard(el, (attempt || 0) + 1); }, 300);
            }
            return;
        }

        // не показываем качество для сериалов, если выключено
        if (localStorage.getItem('maxsm_ratings_quality_tv') === 'false') {
            if (el.querySelector('.card__type')) return;
        }

        el.setAttribute('data-quality-added', 'true'); // ставим сразу, чтобы не слать дубль-запросы

        var card = {
            id: data.id || '',
            title: data.title || data.name || '',
            original_title: data.original_title || data.original_name || '',
            release_date: data.release_date || data.first_air_date || ''
        };
        var cacheKey = getCardType(data) + '_' + card.id;

        var cached = readCache(cacheKey);
        if (cached) {
            renderQuality(el, cached.quality);
            return;
        }

        enqueue(function (done) {
            getQuality(card, card.id, function (quality) {
                writeCache(cacheKey, quality);
                renderQuality(el, quality);
                done();
            });
        });
    }

    function updateCards(list) {
        for (var i = 0; i < list.length; i++) processCard(list[i], 0);
    }

    var observer = new MutationObserver(function (mutations) {
        var found = [];
        for (var m = 0; m < mutations.length; m++) {
            var added = mutations[m].addedNodes;
            if (!added) continue;
            for (var j = 0; j < added.length; j++) {
                var node = added[j];
                if (node.nodeType !== 1) continue;
                if (node.classList && node.classList.contains('card')) found.push(node);
                if (node.querySelectorAll) {
                    var nested = node.querySelectorAll('.card');
                    for (var k = 0; k < nested.length; k++) found.push(nested[k]);
                }
            }
        }
        if (found.length) updateCards(found);
    });

    function startPlugin() {
        if (window.maxsmRatingsQualityPlugin) return;
        window.maxsmRatingsQualityPlugin = true;

        if (localStorage.getItem('maxsm_ratings_quality') === null) localStorage.setItem('maxsm_ratings_quality', 'true');
        if (localStorage.getItem('maxsm_ratings_quality_inlist') === null) localStorage.setItem('maxsm_ratings_quality_inlist', 'true');
        if (localStorage.getItem('maxsm_ratings_quality_tv') === null) localStorage.setItem('maxsm_ratings_quality_tv', 'false');

        if (localStorage.getItem('maxsm_ratings_quality') === 'false') return;

        addStyle();

        if (localStorage.getItem('maxsm_ratings_quality_inlist') === 'true') {
            observer.observe(document.body, { childList: true, subtree: true });
            updateCards(document.querySelectorAll('.card'));
            log('plugin started');
        }
    }

    // Ждём готовности Lampa
    if (window.appready) {
        startPlugin();
    } else if (window.Lampa && Lampa.Listener) {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') startPlugin();
        });
    }
})();
