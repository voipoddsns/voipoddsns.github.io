(function () {
    'use strict';

    if (window.maxsmRatingsQualityPlugin) return;
    window.maxsmRatingsQualityPlugin = true;

    // ===================== настройки запросов =====================

    var Q_LOGGING = false;
    var Q_CACHE_TIME = 24 * 60 * 60 * 1000;
    var Q_CACHE_TIME_EMPTY = 60 * 60 * 1000;
    var QUALITY_CACHE = 'maxsm_ratings_quality_cache';
    var REQUEST_TIMEOUT = 6000;
    var MAX_PARALLEL = 1;
    var REQUEST_GAP = 800;
    var FAIL_PAUSE = 60 * 1000;
    var QUALITY_RETRY_DELAY = 60 * 1000;
    var QUALITY_RETRY_LIMIT = 2;
    var MAX_QUALITY_CACHE = 500;
    var USE_PROXY = false;

    var JACRED_PROTOCOL = window.location && window.location.protocol === 'https:'
        ? 'https://'
        : 'http://';

    var PROXY_LIST = [
        { prefix: 'https://api.allorigins.win/raw?url=', encode: true },
        { prefix: 'https://cors.bwa.workers.dev/', encode: false }
    ];

    var EP_CACHE = 'maxsm_ratings_episode_cache';
    var EP_TTL = 6 * 60 * 60 * 1000;
    var EP_GAP = 250;
    var EP_MAX_PARALLEL = 2;
    var EP_RETRY_DELAY = 30 * 1000;
    var EP_RETRY_LIMIT = 1;
    var MAX_EPISODE_CACHE = 500;

    var DEFAULTS = {
        maxsm_mq_overlay: true,
        maxsm_mq_genres: true,
        maxsm_mq_year: true,
        maxsm_mq_rating: true,
        maxsm_mq_quality: true,
        maxsm_mq_quality_tv: true,
        maxsm_mq_episode: true,
        maxsm_mq_quality_icon: true,
        maxsm_mq_quality_color: true
    };

    var started = false;
    var readyListenerAdded = false;
    var observer = null;

    function log() {
        if (!Q_LOGGING || !window.console || !console.log) return;
        var args = ['MAXSM-RATINGS'].concat([].slice.call(arguments));
        console.log.apply(console, args);
    }

    function logError(message, error) {
        if (!window.console || !console.error) return;
        console.error('MAXSM-RATINGS ' + message, error || '');
    }

    function storageGet(name, fallback) {
        try {
            var app = window.Lampa;
            if (!app || !app.Storage || !app.Storage.get) return fallback;

            var value = app.Storage.get(name, fallback);
            return value === undefined || value === null ? fallback : value;
        } catch (e) {
            return fallback;
        }
    }

    function storageSet(name, value) {
        try {
            var app = window.Lampa;
            if (app && app.Storage && app.Storage.set) {
                app.Storage.set(name, value);
            }
        } catch (e) {
            log('storage error:', name, e.message);
        }
    }

    function opt(name) {
        var value = storageGet(name, '');

        if (value === '' || value === undefined || value === null) {
            return DEFAULTS[name];
        }

        return value === true || value === 'true' || value === 1 || value === '1';
    }

    function isEn() {
        var language = String(storageGet('language', 'ru')).toLowerCase();
        return language.indexOf('en') === 0;
    }

    function tr(ru, en) {
        return isEn() ? en : ru;
    }

    function getJacredBase() {
        var raw = String(storageGet('jac.red', '') || 'jac.red').trim();
        var hasProtocol = /^https?:\/\//i.test(raw);
        var protocol = hasProtocol
            ? (raw.toLowerCase().indexOf('https://') === 0 ? 'https://' : 'http://')
            : JACRED_PROTOCOL;

        raw = raw.replace(/^https?:\/\//i, '').replace(/\/+$/, '');

        return protocol + (raw || 'jac.red');
    }

    function getJacredKey() {
        return String(storageGet('jacred_key', '') || '').trim();
    }

    function toggleBodyClass(name, enabled) {
        if (!document.body) return;

        if (enabled) {
            document.body.classList.add(name);
        } else {
            document.body.classList.remove(name);
        }
    }

    function applyBodyClasses() {
        toggleBodyClass('mq-overlay-off', !opt('maxsm_mq_overlay'));
        toggleBodyClass('mq-hide-genres', !opt('maxsm_mq_genres'));
        toggleBodyClass('mq-hide-year', !opt('maxsm_mq_year'));
        toggleBodyClass('mq-hide-rating', !opt('maxsm_mq_rating'));
        toggleBodyClass('mq-hide-episode', !opt('maxsm_mq_episode'));
        toggleBodyClass('mq-hide-quality', !opt('maxsm_mq_quality'));
        toggleBodyClass('mq-hide-quality-tv', !opt('maxsm_mq_quality_tv'));
        toggleBodyClass('mq-no-icon', !opt('maxsm_mq_quality_icon'));
        toggleBodyClass('mq-no-color', !opt('maxsm_mq_quality_color'));
    }

    // ===================== настройки Lampa =====================

    function refreshQualityCards() {
        var cards = document.querySelectorAll('.card');

        for (var i = 0; i < cards.length; i++) {
            cards[i].removeAttribute('data-quality-added');
            clearQualityRetry(cards[i]);
            setQuality(cards[i], null);
        }

        updateCards(cards);
    }

    function refreshEpisodeCards() {
        var cards = document.querySelectorAll('.card');

        for (var i = 0; i < cards.length; i++) {
            cards[i].removeAttribute('data-mq-ep');
            cards[i].removeAttribute('data-mq-ep-key');
            clearEpisodeRetry(cards[i]);
            setEpisode(cards[i], null);
        }

        updateCards(cards);
    }

    function addSettings() {
        var app = window.Lampa;
        if (!app || !app.SettingsApi) return;

        app.SettingsApi.addComponent({
            component: 'maxsm_cards',
            name: tr('Карточки и качество', 'Cards & quality'),
            icon: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" ' +
                'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M4 15h16"/>' +
                '<path d="M8 18.5h3"/><path d="M15 18.5h1"/></svg>'
        });

        function addToggle(name, ruTitle, enTitle, ruDesc, enDesc, onChange) {
            app.SettingsApi.addParam({
                component: 'maxsm_cards',
                param: {
                    name: name,
                    type: 'trigger',
                    'default': DEFAULTS[name]
                },
                field: {
                    name: tr(ruTitle, enTitle),
                    description: tr(ruDesc, enDesc)
                },
                onChange: function () {
                    applyBodyClasses();
                    if (onChange) onChange();
                }
            });
        }

        function addTitle(ruTitle, enTitle) {
            app.SettingsApi.addParam({
                component: 'maxsm_cards',
                param: { type: 'title' },
                field: { name: tr(ruTitle, enTitle) }
            });
        }

        addTitle('Оформление', 'Appearance');
        addToggle(
            'maxsm_mq_overlay',
            'Оверлей на карточках',
            'Card overlay',
            'Жанры, название, рейтинг и год поверх постера',
            'Genres, title, rating and year over the poster'
        );
        addToggle(
            'maxsm_mq_genres',
            'Жанры',
            'Genres',
            'Показывать первые два жанра',
            'Show the first two genres'
        );
        addToggle(
            'maxsm_mq_year',
            'Год выхода',
            'Release year',
            '',
            ''
        );
        addToggle(
            'maxsm_mq_rating',
            'Рейтинг',
            'Rating',
            'Оценка TMDB со звездой',
            'TMDB score with a star'
        );
        addToggle(
            'maxsm_mq_episode',
            'Сезон и серия',
            'Season and episode',
            'Бейдж S1:E8 у сериалов',
            'S1:E8 badge on TV shows',
            refreshEpisodeCards
        );

        addTitle('Качество', 'Quality');
        addToggle(
            'maxsm_mq_quality',
            'Показывать качество',
            'Show quality',
            'Ищется через JacRed',
            'Looked up via JacRed',
            refreshQualityCards
        );
        addToggle(
            'maxsm_mq_quality_tv',
            'Качество для сериалов',
            'Quality for TV shows',
            '',
            '',
            refreshQualityCards
        );
        addToggle(
            'maxsm_mq_quality_icon',
            'Иконка качества',
            'Quality icon',
            '',
            ''
        );
        addToggle(
            'maxsm_mq_quality_color',
            'Цветное качество',
            'Colored quality',
            '4K зелёный, HD синий и т.д.',
            '4K green, HD blue, etc.'
        );

        addTitle('Служебное', 'Maintenance');

        app.SettingsApi.addParam({
            component: 'maxsm_cards',
            param: { name: 'maxsm_mq_clear_cache', type: 'button' },
            field: { name: tr('Очистить кеш', 'Clear cache') },
            onChange: function () {
                storageSet(QUALITY_CACHE, {});
                storageSet(EP_CACHE, {});
                refreshQualityCards();
                refreshEpisodeCards();

                if (app.Noty) {
                    app.Noty.show(tr('Кеш очищен', 'Cache cleared'));
                }
            }
        });

        app.SettingsApi.addParam({
            component: 'maxsm_cards',
            param: { name: 'maxsm_mq_reset', type: 'button' },
            field: { name: tr('Сбросить настройки', 'Reset settings') },
            onChange: function () {
                for (var key in DEFAULTS) {
                    if (Object.prototype.hasOwnProperty.call(DEFAULTS, key)) {
                        storageSet(key, DEFAULTS[key]);
                    }
                }

                applyBodyClasses();
                refreshQualityCards();
                refreshEpisodeCards();

                try {
                    if (app.Settings && app.Settings.update) app.Settings.update();
                } catch (e) {}

                if (app.Noty) {
                    app.Noty.show(tr('Настройки сброшены', 'Settings reset'));
                }
            }
        });
    }

    // ===================== стили =====================

    function addStyle() {
        if (document.getElementById('maxsm_ratings_quality')) return;

        var style = document.createElement('style');
        style.id = 'maxsm_ratings_quality';
        style.textContent =
            'body:not(.mq-overlay-off) .card--mq .card__title,' +
            'body:not(.mq-overlay-off) .card--mq .card__age,' +
            'body:not(.mq-overlay-off) .card--mq .card__vote,' +
            'body:not(.mq-overlay-off) .card--mq .card__type,' +
            'body:not(.mq-overlay-off) .card--mq .card__quality{' +
                'display:none!important;' +
            '}' +

            '.card--mq .card__view{' +
                'position:relative;' +
                'overflow:hidden;' +
            '}' +

            '.mq-meta{' +
                'position:absolute;' +
                'left:0;' +
                'right:0;' +
                'bottom:0;' +
                'z-index:5;' +
                'box-sizing:border-box;' +
                'padding:3.5em .85em .8em;' +
                'border-radius:0 0 1em 1em;' +
                'pointer-events:none;' +
                'background:linear-gradient(to top,' +
                    'rgba(0,0,0,.94) 0%,' +
                    'rgba(0,0,0,.72) 48%,' +
                    'rgba(0,0,0,0) 100%);' +
            '}' +
            'body.mq-overlay-off .mq-meta{display:none;}' +

            '.mq-genres{' +
                'margin-bottom:.28em;' +
                'overflow:hidden;' +
                'color:rgba(255,255,255,.82);' +
                'font-size:.78em;' +
                'line-height:1.2;' +
                'letter-spacing:.04em;' +
                'text-transform:uppercase;' +
                'white-space:nowrap;' +
                'text-overflow:ellipsis;' +
            '}' +
            'body.mq-hide-genres .mq-genres{display:none;}' +

            '.mq-title{' +
                'display:-webkit-box;' +
                'overflow:hidden;' +
                'color:#fff;' +
                'font-size:1.35em;' +
                'font-weight:500;' +
                'line-height:1.14;' +
                '-webkit-line-clamp:3;' +
                '-webkit-box-orient:vertical;' +
                'word-break:break-word;' +
                'text-shadow:0 1px 3px rgba(0,0,0,.55);' +
            '}' +

            '.mq-bottom{' +
                'display:flex;' +
                'align-items:center;' +
                'justify-content:space-between;' +
                'min-height:1.3em;' +
                'margin-top:.58em;' +
                'font-size:.94em;' +
            '}' +
            '.mq-left{' +
                'display:flex;' +
                'align-items:center;' +
                'min-width:0;' +
            '}' +
            '.mq-left>*+*{margin-left:.85em;}' +

            '.mq-year{' +
                'color:rgba(255,255,255,.9);' +
                'white-space:nowrap;' +
                'text-shadow:0 1px 3px rgba(0,0,0,.5);' +
            '}' +
            'body.mq-hide-year .mq-year{display:none;}' +

            '.mq-rating{' +
                'display:inline-flex;' +
                'align-items:center;' +
                'color:#62aef3;' +
                'font-weight:600;' +
                'white-space:nowrap;' +
            '}' +
            '.mq-rating>*+*{margin-left:.28em;}' +
            '.mq-rating svg{' +
                'width:1.12em;' +
                'height:1.12em;' +
                'flex:none;' +
            '}' +
            '.mq-rating.r-mid{color:#e6c24a;}' +
            '.mq-rating.r-low{color:#e97959;}' +
            'body.mq-hide-rating .mq-rating{display:none;}' +

            '.mq-q{' +
                'display:none;' +
                'align-items:center;' +
                'color:#fff;' +
                'font-weight:700;' +
                'letter-spacing:.02em;' +
                'white-space:nowrap;' +
            '}' +
            '.mq-q.mq-q-on{display:inline-flex;}' +
            '.mq-q>*+*{margin-left:.3em;}' +
            '.mq-q svg{' +
                'width:1.12em;' +
                'height:1.12em;' +
                'flex:none;' +
            '}' +
            '.mq-q.q-4k{color:#65c878;}' +
            '.mq-q.q-fhd{color:#49c1cf;}' +
            '.mq-q.q-hd{color:#62aef3;}' +
            '.mq-q.q-sd{color:#e8ad55;}' +
            'body.mq-no-color .mq-q{color:#fff;}' +
            'body.mq-no-icon .mq-q svg{display:none;}' +
            'body.mq-hide-quality .mq-q{display:none;}' +
            'body.mq-hide-quality-tv .card--mq.mq-tv .mq-q{display:none!important;}' +

            '.mq-ep{' +
                'display:none;' +
                'position:absolute;' +
                'top:0;' +
                'left:0;' +
                'z-index:6;' +
                'align-items:center;' +
                'padding:.55em .85em .55em .75em;' +
                'border-radius:1em 0 1em 0;' +
                'background:rgba(0,0,0,.84);' +
                'box-shadow:0 2px 8px rgba(0,0,0,.25);' +
                'color:#fff;' +
                'font-size:1.02em;' +
                'line-height:1;' +
                'white-space:nowrap;' +
                'pointer-events:none;' +
            '}' +
            '.mq-ep.mq-ep-on{display:inline-flex;}' +
            '.mq-ep>*+*{margin-left:.45em;}' +
            '.mq-ep svg{' +
                'width:1.3em;' +
                'height:1.3em;' +
                'flex:none;' +
            '}' +
            'body.mq-overlay-off .mq-ep,' +
            'body.mq-hide-episode .mq-ep{display:none;}';

        (document.head || document.documentElement).appendChild(style);
    }

    // ===================== сеть =====================

    function httpGetJson(url, callback) {
        var xhr;

        try {
            xhr = new XMLHttpRequest();
        } catch (e) {
            try {
                callback(e);
            } catch (callbackError) {}
            return;
        }

        var done = false;
        var timer = setTimeout(function () {
            finish(new Error('timeout'));
        }, REQUEST_TIMEOUT);

        function finish(error, data) {
            if (done) return;
            done = true;
            clearTimeout(timer);

            try {
                if (xhr.readyState !== 4) xhr.abort();
            } catch (e) {}

            try {
                callback(error, data);
            } catch (callbackError) {
                logError('callback error', callbackError);
            }
        }

        try {
            xhr.open('GET', url, true);

            xhr.onreadystatechange = function () {
                if (xhr.readyState !== 4) return;

                if ((xhr.status >= 200 && xhr.status < 300) || xhr.status === 1223) {
                    try {
                        finish(null, JSON.parse(xhr.responseText));
                    } catch (e) {
                        finish(new Error('bad json'));
                    }
                } else {
                    finish(new Error('HTTP ' + xhr.status));
                }
            };

            xhr.onerror = function () {
                finish(new Error('network error'));
            };

            xhr.send();
        } catch (e) {
            finish(e);
        }
    }

    function fetchJsonWithFallback(url, cardId, callback) {
        var sources = [url];

        for (var i = 0; USE_PROXY && i < PROXY_LIST.length; i++) {
            sources.push(
                PROXY_LIST[i].prefix +
                (PROXY_LIST[i].encode ? encodeURIComponent(url) : url)
            );
        }

        var index = 0;

        function next() {
            if (index >= sources.length) {
                callback(new Error('all sources failed'));
                return;
            }

            var source = sources[index++];
            log('card:', cardId, 'GET', source);

            httpGetJson(source, function (error, data) {
                if (error) {
                    log('card:', cardId, 'failed:', source, error.message);
                    next();
                } else {
                    callback(null, data);
                }
            });
        }

        next();
    }

    // ===================== очередь JacRed =====================

    var qualityQueue = [];
    var qualityRunning = 0;
    var qualityLastStart = 0;
    var qualityPausedUntil = 0;
    var qualityFailStreak = 0;
    var qualityPumpTimer = null;

    function enqueueQualityTask(task) {
        qualityQueue.push(task);
        pumpQualityQueue();
    }

    function pumpQualityQueue() {
        if (qualityRunning >= MAX_PARALLEL || !qualityQueue.length || qualityPumpTimer) {
            return;
        }

        var now = Date.now();
        var wait = Math.max(
            qualityPausedUntil - now,
            qualityLastStart + REQUEST_GAP - now,
            0
        );

        if (wait > 0) {
            qualityPumpTimer = setTimeout(function () {
                qualityPumpTimer = null;
                pumpQualityQueue();
            }, wait);
            return;
        }

        var task = qualityQueue.shift();
        qualityRunning++;
        qualityLastStart = Date.now();

        var finished = false;

        function complete(failed) {
            if (finished) return;
            finished = true;

            qualityRunning--;

            if (failed) {
                qualityFailStreak++;

                if (qualityFailStreak >= 3) {
                    qualityPausedUntil = Date.now() + FAIL_PAUSE;
                    qualityFailStreak = 0;
                    log('too many errors, pause');
                }
            } else {
                qualityFailStreak = 0;
            }

            pumpQualityQueue();
        }

        try {
            task(complete);
        } catch (e) {
            logError('queue task error', e);
            complete(true);
        }
    }

    // ===================== JacRed =====================

    function translateQuality(value) {
        var quality = Number(value);

        if (!isFinite(quality) || quality <= 0) return null;
        if (quality >= 2160) return '4K';
        if (quality >= 1080) return 'FHD';
        if (quality >= 720) return 'HD';

        return 'SD';
    }

    function normalizeQuality(value) {
        var quality = String(value || '').toUpperCase();

        if (quality === '4K' || quality === 'FHD' || quality === 'HD' || quality === 'SD') {
            return quality;
        }

        return null;
    }

    function searchJacred(title, year, cardId, callback) {
        var userId = String(storageGet('lampac_unic_id', '') || '');
        var key = getJacredKey();

        var url = getJacredBase() + '/api/v1.0/torrents?search=' +
            encodeURIComponent(title) +
            '&year=' + encodeURIComponent(year) +
            '&exact=true' +
            (userId ? '&uid=' + encodeURIComponent(userId) : '') +
            (key ? '&apikey=' + encodeURIComponent(key) : '');

        fetchJsonWithFallback(url, cardId, function (error, torrents) {
            if (error || !Array.isArray(torrents)) {
                callback(null, true);
                return;
            }

            if (!torrents.length) {
                callback(null, false);
                return;
            }

            var best = -1;

            for (var i = 0; i < torrents.length; i++) {
                var torrent = torrents[i];
                if (!torrent) continue;

                var quality = Number(torrent.quality);
                if (!isFinite(quality) || quality <= 0) continue;

                var titleText = String(torrent.title || '');
                if (/\b(ts|telesync|camrip|cam)\b/i.test(titleText) && quality < 720) {
                    continue;
                }

                if (quality > best) best = quality;
            }

            callback(best > 0 ? translateQuality(best) : null, false);
        });
    }

    function getQuality(card, cardId, callback) {
        var date = String(card.release_date || '');
        var year = date.substring(0, 4);

        if (!/^\d{4}$/.test(year)) {
            callback(null, false);
            return;
        }

        var titles = [];
        var seen = {};

        function addTitle(value) {
            if (!value) return;

            value = String(value).trim();
            if (!value || !/[a-zа-яё0-9]/i.test(value)) return;

            var normalized = value.toLowerCase();
            if (seen[normalized]) return;

            seen[normalized] = true;
            titles.push(value);
        }

        addTitle(card.original_title);
        addTitle(card.title);

        function searchNext(index) {
            if (index >= titles.length) {
                callback(null, false);
                return;
            }

            searchJacred(titles[index], year, cardId, function (quality, failed) {
                if (failed) {
                    callback(null, true);
                } else if (quality) {
                    callback(quality, false);
                } else {
                    searchNext(index + 1);
                }
            });
        }

        searchNext(0);
    }

    // ===================== кеш =====================

    function hasOwn(object, key) {
        return Object.prototype.hasOwnProperty.call(object, key);
    }

    function readStorageObject(key) {
        var value = storageGet(key, {});

        if (typeof value === 'string') {
            try {
                value = JSON.parse(value);
            } catch (e) {
                value = {};
            }
        }

        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return {};
        }

        return value;
    }

    function trimQualityCache(cache, now) {
        var entries = [];

        for (var key in cache) {
            if (!hasOwn(cache, key)) continue;

            var item = cache[key];
            var timestamp = item && Number(item.timestamp);
            var ttl = normalizeQuality(item && item.quality)
                ? Q_CACHE_TIME
                : Q_CACHE_TIME_EMPTY;
            var age = now - timestamp;

            if (!timestamp || age < 0 || age >= ttl) {
                delete cache[key];
                continue;
            }

            entries.push({ key: key, timestamp: timestamp });
        }

        if (entries.length <= MAX_QUALITY_CACHE) return;

        entries.sort(function (a, b) {
            return a.timestamp - b.timestamp;
        });

        for (var i = 0; i < entries.length - MAX_QUALITY_CACHE; i++) {
            delete cache[entries[i].key];
        }
    }

    function readCache(key) {
        var cache = readStorageObject(QUALITY_CACHE);
        var item = cache[key];

        if (!item || typeof item !== 'object') return null;

        var timestamp = Number(item.timestamp);
        var age = Date.now() - timestamp;
        var quality = normalizeQuality(item.quality);
        var ttl = quality ? Q_CACHE_TIME : Q_CACHE_TIME_EMPTY;

        if (!timestamp || age < 0 || age >= ttl) return null;

        return {
            quality: quality,
            timestamp: timestamp
        };
    }

    function writeCache(key, quality) {
        var cache = readStorageObject(QUALITY_CACHE);
        var now = Date.now();

        cache[key] = {
            quality: normalizeQuality(quality),
            timestamp: now
        };

        trimQualityCache(cache, now);
        storageSet(QUALITY_CACHE, cache);
    }

    function trimEpisodeCache(cache, now) {
        var entries = [];

        for (var key in cache) {
            if (!hasOwn(cache, key)) continue;

            var item = cache[key];
            var timestamp = item && Number(item.t);
            var age = now - timestamp;

            if (!timestamp || age < 0 || age >= EP_TTL) {
                delete cache[key];
                continue;
            }

            entries.push({ key: key, timestamp: timestamp });
        }

        if (entries.length <= MAX_EPISODE_CACHE) return;

        entries.sort(function (a, b) {
            return a.timestamp - b.timestamp;
        });

        for (var i = 0; i < entries.length - MAX_EPISODE_CACHE; i++) {
            delete cache[entries[i].key];
        }
    }

    function readEpisodeCache(id) {
        var cache = readStorageObject(EP_CACHE);
        var item = cache[String(id)];

        if (!item || typeof item !== 'object') return null;

        var timestamp = Number(item.t);
        var age = Date.now() - timestamp;

        if (!timestamp || age < 0 || age >= EP_TTL) return null;

        return {
            episode: normalizeEpisode({
                season_number: item.s,
                episode_number: item.e
            })
        };
    }

    function writeEpisodeCache(id, episode) {
        var cache = readStorageObject(EP_CACHE);
        var now = Date.now();

        cache[String(id)] = {
            s: episode ? episode.s : 0,
            e: episode ? episode.e : 0,
            t: now
        };

        trimEpisodeCache(cache, now);
        storageSet(EP_CACHE, cache);
    }

    // ===================== жанры =====================

    var GENRES_RU = {
        28: 'Боевик', 12: 'Приключения', 16: 'Мультфильм', 35: 'Комедия',
        80: 'Криминал', 99: 'Документальный', 18: 'Драма', 10751: 'Семейный',
        14: 'Фэнтези', 36: 'История', 27: 'Ужасы', 10402: 'Музыка',
        9648: 'Детектив', 10749: 'Мелодрама', 878: 'Фантастика',
        10770: 'Телефильм', 53: 'Триллер', 10752: 'Военный', 37: 'Вестерн',
        10759: 'Боевик и Приключения', 10762: 'Детский', 10763: 'Новости',
        10764: 'Реалити-шоу', 10765: 'Фантастика и Фэнтези',
        10766: 'Мыльная опера', 10767: 'Ток-шоу', 10768: 'Война и политика'
    };

    var GENRES_EN = {
        28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy',
        80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family',
        14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
        9648: 'Mystery', 10749: 'Romance', 878: 'Science Fiction',
        10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
        10759: 'Action & Adventure', 10762: 'Kids', 10763: 'News',
        10764: 'Reality', 10765: 'Sci-Fi & Fantasy', 10766: 'Soap',
        10767: 'Talk', 10768: 'War & Politics'
    };

    function getGenres(data) {
        var names = [];
        var map = isEn() ? GENRES_EN : GENRES_RU;
        var i;

        if (Array.isArray(data.genres)) {
            for (i = 0; i < data.genres.length && names.length < 2; i++) {
                if (data.genres[i] && data.genres[i].name) {
                    names.push(String(data.genres[i].name));
                }
            }
        }

        if (names.length < 2 && Array.isArray(data.genre_ids)) {
            for (i = 0; i < data.genre_ids.length && names.length < 2; i++) {
                if (map[data.genre_ids[i]]) {
                    names.push(map[data.genre_ids[i]]);
                }
            }
        }

        return names.join(', ');
    }

    // ===================== карточки =====================

    var ICON_STAR =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9L3.5 9.7l5.9-.8L12 3.5z"/>' +
        '</svg>';

    var ICON_GAUGE =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
        'stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M4.6 18.5a8.5 8.5 0 1 1 14.8 0"/>' +
        '<path d="M12 14l3.2-4.2"/>' +
        '</svg>';

    var ICON_EP =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M7 4h12"/><path d="M5 7.5h14"/>' +
        '<rect x="3.5" y="11" width="17" height="9.5" rx="2"/>' +
        '<path d="M10.5 13.8v4l3.3-2z"/>' +
        '</svg>';

    function getCardType(card) {
        var type = card.media_type || card.type;

        if (type === 'movie' || type === 'tv') return type;
        return (card.name || card.original_name) ? 'tv' : 'movie';
    }

    function getCardData(element) {
        if (element.card_data && typeof element.card_data === 'object') {
            return element.card_data;
        }

        try {
            if (window.$) return window.$(element).data('card_data') || null;
        } catch (e) {}

        return null;
    }

    function buildOverlay(element, data) {
        var view = element.querySelector('.card__view');
        if (!view) return;

        var meta = view.querySelector('.mq-meta');

        if (!meta) {
            var title = data.title || data.name ||
                data.original_title || data.original_name || '';
            var date = String(data.release_date || data.first_air_date || '');
            var year = date.substring(0, 4);
            var vote = parseFloat(data.vote_average);
            var genres = getGenres(data);

            meta = document.createElement('div');
            meta.className = 'mq-meta';

            var genreNode = document.createElement('div');
            genreNode.className = 'mq-genres';
            genreNode.textContent = genres;
            if (!genres) genreNode.style.display = 'none';
            meta.appendChild(genreNode);

            var titleNode = document.createElement('div');
            titleNode.className = 'mq-title';
            titleNode.textContent = title;
            meta.appendChild(titleNode);

            var bottom = document.createElement('div');
            bottom.className = 'mq-bottom';

            var left = document.createElement('div');
            left.className = 'mq-left';

            if (isFinite(vote) && vote > 0) {
                var rating = document.createElement('span');
                rating.className = 'mq-rating ' +
                    (vote >= 6.5 ? '' : (vote >= 5 ? 'r-mid' : 'r-low'));
                rating.innerHTML = ICON_STAR;

                var ratingText = document.createElement('span');
                ratingText.textContent = vote.toFixed(1);
                rating.appendChild(ratingText);
                left.appendChild(rating);
            }

            var quality = document.createElement('span');
            quality.className = 'mq-q';
            left.appendChild(quality);

            bottom.appendChild(left);

            var yearNode = document.createElement('span');
            yearNode.className = 'mq-year';
            yearNode.textContent = year;
            bottom.appendChild(yearNode);

            meta.appendChild(bottom);
            view.appendChild(meta);
        }

        if (!view.querySelector('.mq-ep')) {
            var episode = document.createElement('div');
            episode.className = 'mq-ep';
            view.appendChild(episode);
        }

        element.classList.add('card--mq');
    }

    // ===================== сезон и серия =====================

    var episodeQueue = [];
    var episodePending = {};
    var episodeRunning = 0;
    var episodeLastStart = 0;
    var episodePumpTimer = null;

    function normalizeEpisode(episode) {
        if (!episode) return null;

        var season = parseInt(episode.season_number, 10);
        var number = parseInt(episode.episode_number, 10);

        if (isNaN(season) || season < 0 || isNaN(number) || number <= 0) {
            return null;
        }

        return { s: season, e: number };
    }

    function getEpisodeFromData(data) {
        if (!data) return null;

        return normalizeEpisode(data.last_episode_to_air) ||
            normalizeEpisode(data.next_episode_to_air);
    }

    function setEpisode(element, episode) {
        var node = element.querySelector('.mq-ep');
        if (!node) return;

        if (!episode || !episode.e) {
            node.className = 'mq-ep';
            node.innerHTML = '';
            return;
        }

        node.className = 'mq-ep mq-ep-on';
        node.innerHTML = ICON_EP;

        var text = document.createElement('span');
        text.textContent = 'S' + episode.s + ':E' + episode.e;
        node.appendChild(text);
    }

    function clearEpisodeRetry(element) {
        element.removeAttribute('data-mq-ep-retry');
        element.removeAttribute('data-mq-ep-retry-token');
    }

    function isElementAttached(element) {
        var root = document.body || document.documentElement;
        return !!(root && root.contains && root.contains(element));
    }

    function scheduleEpisodeRetry(element, id) {
        var retries = parseInt(element.getAttribute('data-mq-ep-retry') || '0', 10);
        if (isNaN(retries)) retries = 0;
        if (retries >= EP_RETRY_LIMIT) return;

        retries++;

        var token = String(Date.now()) + '-' + String(Math.random());
        element.setAttribute('data-mq-ep-retry', String(retries));
        element.setAttribute('data-mq-ep-retry-token', token);

        setTimeout(function () {
            if (element.getAttribute('data-mq-ep-retry-token') !== token) return;
            if (!isElementAttached(element)) return;
            if (element.getAttribute('data-mq-ep-key') !== id) return;

            element.removeAttribute('data-mq-ep');
            processCard(element, 0);
        }, EP_RETRY_DELAY);
    }

    function pumpEpisodeQueue() {
        if (
            episodeRunning >= EP_MAX_PARALLEL ||
            !episodeQueue.length ||
            episodePumpTimer
        ) {
            return;
        }

        var wait = Math.max(episodeLastStart + EP_GAP - Date.now(), 0);

        if (wait > 0) {
            episodePumpTimer = setTimeout(function () {
                episodePumpTimer = null;
                pumpEpisodeQueue();
            }, wait);
            return;
        }

        var job = episodeQueue.shift();
        episodeRunning++;
        episodeLastStart = Date.now();

        var finished = false;

        function complete() {
            if (finished) return;
            finished = true;
            episodeRunning--;
            pumpEpisodeQueue();
        }

        try {
            job(complete);
        } catch (e) {
            logError('episode queue error', e);
            complete();
        }

        pumpEpisodeQueue();
    }

    function ensureEpisode(element, data) {
        if (!opt('maxsm_mq_episode')) return;
        if (getCardType(data) !== 'tv') return;

        var id = data.id;
        var idKey = id === undefined || id === null ? '' : String(id);
        var previousKey = element.getAttribute('data-mq-ep-key');

        if (previousKey !== idKey) {
            element.removeAttribute('data-mq-ep');
            clearEpisodeRetry(element);
            setEpisode(element, null);
        }

        if (element.getAttribute('data-mq-ep') && previousKey === idKey) {
            return;
        }

        element.setAttribute('data-mq-ep-key', idKey);
        element.setAttribute('data-mq-ep', '1');

        var fromCard = getEpisodeFromData(data);
        if (fromCard) {
            clearEpisodeRetry(element);
            setEpisode(element, fromCard);
            return;
        }

        if (!idKey) {
            setEpisode(element, null);
            return;
        }

        var cached = readEpisodeCache(idKey);
        if (cached) {
            clearEpisodeRetry(element);
            setEpisode(element, cached.episode);
            return;
        }

        if (hasOwn(episodePending, idKey)) {
            addUniqueElement(episodePending[idKey], element);
            return;
        }

        var url;

        try {
            var tmdb = window.Lampa && window.Lampa.TMDB;
            if (!tmdb || !tmdb.api || !tmdb.key) {
                element.removeAttribute('data-mq-ep');
                return;
            }

            var language = storageGet('tmdb_lang', '') ||
                storageGet('language', 'ru') ||
                'ru';

            url = tmdb.api(
                'tv/' + encodeURIComponent(idKey) +
                '?api_key=' + encodeURIComponent(tmdb.key()) +
                '&language=' + encodeURIComponent(language)
            );
        } catch (e) {
            element.removeAttribute('data-mq-ep');
            return;
        }

        if (!url) {
            element.removeAttribute('data-mq-ep');
            return;
        }

        episodePending[idKey] = [element];

        episodeQueue.push(function (done) {
            httpGetJson(url, function (error, response) {
                var targets = episodePending[idKey] || [];
                delete episodePending[idKey];

                try {
                    if (error || !response) {
                        for (var i = 0; i < targets.length; i++) {
                            var failedElement = targets[i];

                            if (failedElement.getAttribute('data-mq-ep-key') === idKey) {
                                failedElement.removeAttribute('data-mq-ep');
                                scheduleEpisodeRetry(failedElement, idKey);
                            }
                        }

                        return;
                    }

                    var result = getEpisodeFromData(response);
                    writeEpisodeCache(idKey, result);

                    for (var j = 0; j < targets.length; j++) {
                        var target = targets[j];

                        if (target.getAttribute('data-mq-ep-key') !== idKey) continue;

                        clearEpisodeRetry(target);
                        setEpisode(target, result);
                    }
                } catch (e) {
                    logError('episode response error', e);
                } finally {
                    done();
                }
            });
        });

        pumpEpisodeQueue();
    }

    // ===================== качество на карточке =====================

    var qualityPending = {};

    function addUniqueElement(list, element) {
        for (var i = 0; i < list.length; i++) {
            if (list[i] === element) return;
        }

        list.push(element);
    }

    function setQuality(element, quality) {
        var node = element.querySelector('.mq-q');
        if (!node) return;

        quality = normalizeQuality(quality);

        if (!quality) {
            node.className = 'mq-q';
            node.innerHTML = '';
            return;
        }

        node.className = 'mq-q mq-q-on q-' + quality.toLowerCase();
        node.innerHTML = ICON_GAUGE;

        var text = document.createElement('span');
        text.textContent = quality;
        node.appendChild(text);
    }

    function clearQualityRetry(element) {
        element.removeAttribute('data-quality-retry');
        element.removeAttribute('data-quality-retry-token');
    }

    function isQualityEnabled(type) {
        return opt('maxsm_mq_quality') &&
            (type !== 'tv' || opt('maxsm_mq_quality_tv'));
    }

    function buildQualityCacheKey(type, card) {
        if (
            card.id !== undefined &&
            card.id !== null &&
            String(card.id) !== ''
        ) {
            return type + '_' + String(card.id);
        }

        var fallback = [
            card.original_title || '',
            card.title || '',
            card.release_date || ''
        ].join('|').toLowerCase();

        return type + '_title_' + encodeURIComponent(fallback);
    }

    function scheduleQualityRetry(element, cacheKey) {
        var retries = parseInt(element.getAttribute('data-quality-retry') || '0', 10);
        if (isNaN(retries)) retries = 0;
        if (retries >= QUALITY_RETRY_LIMIT) return;

        retries++;

        var token = String(Date.now()) + '-' + String(Math.random());
        element.setAttribute('data-quality-retry', String(retries));
        element.setAttribute('data-quality-retry-token', token);

        setTimeout(function () {
            if (element.getAttribute('data-quality-retry-token') !== token) return;
            if (!isElementAttached(element)) return;
            if (element.getAttribute('data-quality-key') !== cacheKey) return;

            element.removeAttribute('data-quality-added');
            processCard(element, 0);
        }, QUALITY_RETRY_DELAY);
    }

    function failQualityElement(element, cacheKey) {
        if (element.getAttribute('data-quality-key') !== cacheKey) return;

        element.removeAttribute('data-quality-added');
        scheduleQualityRetry(element, cacheKey);
    }

    function completeQualityLookup(cacheKey, type, quality, failed, done) {
        var targets = qualityPending[cacheKey] || [];
        delete qualityPending[cacheKey];

        try {
            if (failed) {
                for (var i = 0; i < targets.length; i++) {
                    failQualityElement(targets[i], cacheKey);
                }

                return;
            }

            writeCache(cacheKey, quality);

            for (var j = 0; j < targets.length; j++) {
                var element = targets[j];

                if (element.getAttribute('data-quality-key') !== cacheKey) continue;

                clearQualityRetry(element);

                if (isQualityEnabled(type)) {
                    setQuality(element, quality);
                } else {
                    setQuality(element, null);
                }
            }
        } catch (e) {
            logError('quality response error', e);

            for (var k = 0; k < targets.length; k++) {
                failQualityElement(targets[k], cacheKey);
            }

            failed = true;
        } finally {
            done(!!failed);
        }
    }

    function requestQuality(element, type, card, cacheKey) {
        if (hasOwn(qualityPending, cacheKey)) {
            addUniqueElement(qualityPending[cacheKey], element);
            return;
        }

        qualityPending[cacheKey] = [element];

        enqueueQualityTask(function (done) {
            try {
                getQuality(card, card.id, function (quality, failed) {
                    completeQualityLookup(cacheKey, type, quality, failed, done);
                });
            } catch (e) {
                logError('quality lookup error', e);
                completeQualityLookup(cacheKey, type, null, true, done);
            }
        });
    }

    function processCard(element, attempt) {
        if (!element || !element.querySelector) return;

        var data = getCardData(element);

        if (!data) {
            if ((attempt || 0) < 8) {
                setTimeout(function () {
                    processCard(element, (attempt || 0) + 1);
                }, 300);
            }

            return;
        }

        var type = getCardType(data);

        buildOverlay(element, data);

        if (type === 'tv') {
            element.classList.add('mq-tv');
            ensureEpisode(element, data);
        } else {
            element.classList.remove('mq-tv');
            element.removeAttribute('data-mq-ep');
            element.removeAttribute('data-mq-ep-key');
            clearEpisodeRetry(element);
            setEpisode(element, null);
        }

        var card = {
            id: data.id === undefined || data.id === null ? '' : String(data.id),
            title: data.title || data.name || '',
            original_title: data.original_title || data.original_name || '',
            release_date: data.release_date || data.first_air_date || ''
        };

        var cacheKey = buildQualityCacheKey(type, card);
        var previousKey = element.getAttribute('data-quality-key');

        if (previousKey !== cacheKey) {
            element.removeAttribute('data-quality-added');
            clearQualityRetry(element);
            setQuality(element, null);
        }

        element.setAttribute('data-quality-key', cacheKey);

        if (!isQualityEnabled(type)) {
            element.removeAttribute('data-quality-added');
            clearQualityRetry(element);
            setQuality(element, null);
            return;
        }

        if (element.getAttribute('data-quality-added')) return;

        element.setAttribute('data-quality-added', 'true');

        var cached = readCache(cacheKey);

        if (cached) {
            clearQualityRetry(element);
            setQuality(element, cached.quality);
            return;
        }

        requestQuality(element, type, card, cacheKey);
    }

    function updateCards(list) {
        for (var i = 0; i < list.length; i++) {
            try {
                processCard(list[i], 0);
            } catch (e) {
                logError('card processing error', e);
            }
        }
    }

    function collectAddedCards(mutations) {
        var found = [];

        for (var i = 0; i < mutations.length; i++) {
            var added = mutations[i].addedNodes;
            if (!added) continue;

            for (var j = 0; j < added.length; j++) {
                var node = added[j];
                if (!node) continue;

                if (
                    node.nodeType === 1 &&
                    node.classList &&
                    node.classList.contains('card')
                ) {
                    found.push(node);
                }

                if (node.querySelectorAll) {
                    var nested = node.querySelectorAll('.card');

                    for (var k = 0; k < nested.length; k++) {
                        found.push(nested[k]);
                    }
                }
            }
        }

        if (found.length) updateCards(found);
    }

    // ===================== запуск =====================

    function startPlugin() {
        if (started) return;
        started = true;

        try {
            addStyle();
        } catch (e) {
            logError('style error', e);
        }

        try {
            addSettings();
        } catch (e) {
            logError('settings error', e);
        }

        applyBodyClasses();

        try {
            if (window.MutationObserver && document.body) {
                observer = new window.MutationObserver(collectAddedCards);
                observer.observe(document.body, {
                    childList: true,
                    subtree: true
                });
            }
        } catch (e) {
            logError('observer error', e);
        }

        updateCards(document.querySelectorAll('.card'));
        log('plugin started');
    }

    function waitForReady() {
        if (started) return;

        if (window.appready) {
            startPlugin();
            return;
        }

        var app = window.Lampa;

        if (
            !readyListenerAdded &&
            app &&
            app.Listener &&
            app.Listener.follow
        ) {
            try {
                readyListenerAdded = true;

                app.Listener.follow('app', function (event) {
                    if (event && event.type === 'ready') {
                        startPlugin();
                    }
                });
            } catch (e) {
                readyListenerAdded = false;
            }
        }

        setTimeout(waitForReady, 500);
    }

    waitForReady();
})();
