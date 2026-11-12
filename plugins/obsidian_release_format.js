(function () {
    'use strict';

    if (window.maxsmRatingsQualityPlugin) return;

    // ===================== конфигурация =====================

    var DEBUG = false;

    var QUALITY_CACHE_KEY = 'maxsm_ratings_quality_cache';
    var EPISODE_CACHE_KEY = 'maxsm_ratings_episode_cache';

    var QUALITY_TTL = 24 * 60 * 60 * 1000;
    var EMPTY_QUALITY_TTL = 60 * 60 * 1000;
    var EPISODE_TTL = 6 * 60 * 60 * 1000;

    var REQUEST_TIMEOUT = 6000;
    var JACRED_GAP = 900;
    var TMDB_GAP = 350;
    var FAIL_PAUSE = 60 * 1000;

    // Включай только если прямой запрос к JacRed блокируется CORS.
    var USE_PROXY = false;

    var PROXY_LIST = [
        { prefix: 'https://api.allorigins.win/raw?url=', encode: true },
        { prefix: 'https://cors.bwa.workers.dev/', encode: false }
    ];

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

    function log() {
        if (!DEBUG || !window.console) return;
        var args = ['MAXSM-RATINGS'].concat([].slice.call(arguments));
        console.log.apply(console, args);
    }

    function storageGet(key, fallback) {
        try {
            var value = Lampa.Storage.get(key, fallback);
            return value === undefined || value === null ? fallback : value;
        } catch (e) {
            return fallback;
        }
    }

    function storageSet(key, value) {
        try { Lampa.Storage.set(key, value); } catch (e) { log('storage error', e); }
    }

    function opt(name) {
        var value = storageGet(name, '');
        if (value === '') return DEFAULTS[name];
        return value === true || value === 'true' || value === 1;
    }

    function isEn() {
        return storageGet('language', 'ru') === 'en';
    }

    function tr(ru, en) {
        return isEn() ? en : ru;
    }

    function getJacredHost() {
        var host = String(storageGet('jac.red', 'jac.red') || 'jac.red');

        host = host
            .replace(/^https?:\/\//i, '')
            .replace(/\/.*$/, '')
            .trim();

        return host || 'jac.red';
    }

    function getJacredUrl() {
        var protocol = location.protocol === 'https:' ? 'https://' : 'http://';
        return protocol + getJacredHost();
    }

    // ===================== настройки =====================

    function applyBodyClasses() {
        if (!document.body) return;

        var classes = {
            'mq-overlay-off': !opt('maxsm_mq_overlay'),
            'mq-hide-genres': !opt('maxsm_mq_genres'),
            'mq-hide-year': !opt('maxsm_mq_year'),
            'mq-hide-rating': !opt('maxsm_mq_rating'),
            'mq-hide-episode': !opt('maxsm_mq_episode'),
            'mq-hide-quality': !opt('maxsm_mq_quality'),
            'mq-no-icon': !opt('maxsm_mq_quality_icon'),
            'mq-no-color': !opt('maxsm_mq_quality_color')
        };

        for (var name in classes) {
            if (!classes.hasOwnProperty(name)) continue;

            if (classes[name]) document.body.classList.add(name);
            else document.body.classList.remove(name);
        }
    }

    function refreshCards(attribute) {
        var cards = document.querySelectorAll('.card');

        for (var i = 0; i < cards.length; i++) {
            if (attribute) cards[i].removeAttribute(attribute);
        }

        updateCards(cards);
    }

    function addSettings() {
        if (!Lampa.SettingsApi) return;

        Lampa.SettingsApi.addComponent({
            component: 'maxsm_cards',
            name: tr('Карточки и качество', 'Cards & quality'),
            icon: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" ' +
                'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
                'stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="3"/>' +
                '<path d="M4 15h16M8 18.5h3M15 18.5h1"/></svg>'
        });

        function title(ru, en) {
            Lampa.SettingsApi.addParam({
                component: 'maxsm_cards',
                param: { type: 'title' },
                field: { name: tr(ru, en) }
            });
        }

        function trigger(name, ru, en, ruDesc, enDesc, onChange) {
            Lampa.SettingsApi.addParam({
                component: 'maxsm_cards',
                param: {
                    name: name,
                    type: 'trigger',
                    'default': DEFAULTS[name]
                },
                field: {
                    name: tr(ru, en),
                    description: tr(ruDesc || '', enDesc || '')
                },
                onChange: function () {
                    applyBodyClasses();
                    if (onChange) onChange();
                }
            });
        }

        title('Оформление', 'Appearance');

        trigger(
            'maxsm_mq_overlay',
            'Красивый оверлей',
            'Poster overlay',
            'Информация поверх постера',
            'Information over the poster'
        );
        trigger(
            'maxsm_mq_genres',
            'Жанры',
            'Genres',
            'Первые два жанра',
            'First two genres'
        );
        trigger('maxsm_mq_year', 'Год выхода', 'Release year');
        trigger(
            'maxsm_mq_rating',
            'Рейтинг',
            'Rating',
            'Оценка TMDB',
            'TMDB score'
        );
        trigger(
            'maxsm_mq_episode',
            'Сезон и серия',
            'Season and episode',
            'Последняя вышедшая серия сериала',
            'Latest aired episode',
            function () { refreshCards('data-mq-ep'); }
        );

        title('Качество', 'Quality');

        trigger(
            'maxsm_mq_quality',
            'Показывать качество',
            'Show quality',
            'Поиск через JacRed',
            'Look up via JacRed',
            function () { refreshCards('data-quality-added'); }
        );
        trigger(
            'maxsm_mq_quality_tv',
            'Качество сериалов',
            'TV show quality',
            '',
            '',
            function () { refreshCards('data-quality-added'); }
        );
        trigger(
            'maxsm_mq_quality_icon',
            'Иконка качества',
            'Quality icon'
        );
        trigger(
            'maxsm_mq_quality_color',
            'Цветное качество',
            'Colored quality'
        );

        title('Служебное', 'Maintenance');

        Lampa.SettingsApi.addParam({
            component: 'maxsm_cards',
            param: { name: 'maxsm_mq_clear_cache', type: 'button' },
            field: { name: tr('Очистить кеш', 'Clear cache') },
            onChange: function () {
                storageSet(QUALITY_CACHE_KEY, {});
                storageSet(EPISODE_CACHE_KEY, {});
                refreshCards('data-quality-added');
                refreshCards('data-mq-ep');

                if (Lampa.Noty) {
                    Lampa.Noty.show(tr('Кеш очищен', 'Cache cleared'));
                }
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'maxsm_cards',
            param: { name: 'maxsm_mq_reset', type: 'button' },
            field: { name: tr('Сбросить настройки', 'Reset settings') },
            onChange: function () {
                for (var key in DEFAULTS) {
                    if (DEFAULTS.hasOwnProperty(key)) {
                        storageSet(key, DEFAULTS[key]);
                    }
                }

                applyBodyClasses();
                refreshCards('data-quality-added');
                refreshCards('data-mq-ep');

                try { Lampa.Settings.update(); } catch (e) {}

                if (Lampa.Noty) {
                    Lampa.Noty.show(tr('Настройки сброшены', 'Settings reset'));
                }
            }
        });
    }

    // ===================== оформление =====================

    function addStyle() {
        if (document.getElementById('maxsm_ratings_quality')) return;

        var style = document.createElement('style');
        style.id = 'maxsm_ratings_quality';
        style.textContent = [
            'body:not(.mq-overlay-off) .card--mq .card__title,',
            'body:not(.mq-overlay-off) .card--mq .card__age,',
            'body:not(.mq-overlay-off) .card--mq .card__vote,',
            'body:not(.mq-overlay-off) .card--mq .card__type,',
            'body:not(.mq-overlay-off) .card--mq .card__quality',
            '{display:none!important}',

            '.card--mq .card__view{position:relative;overflow:hidden}',

            '.mq-meta{',
                'position:absolute;left:0;right:0;bottom:0;z-index:5;',
                'box-sizing:border-box;padding:4.8em .85em .8em;',
                'pointer-events:none;color:#fff;',
                'background:linear-gradient(to bottom,',
                    'transparent 0%,rgba(5,9,17,.28) 23%,',
                    'rgba(5,9,17,.78) 59%,rgba(5,9,17,.96) 100%);',
                'transition:padding .22s ease,background .22s ease',
            '}',

            '.card--mq.focus .mq-meta,',
            '.card--mq:hover .mq-meta,',
            '.card--mq:focus .mq-meta,',
            '.card--mq:focus-within .mq-meta',
            '{padding-bottom:1.05em}',

            '.mq-genres{',
                'margin-bottom:.4em;overflow:hidden;',
                'white-space:nowrap;text-overflow:ellipsis;',
                'font-size:.82em;line-height:1.25;',
                'font-weight:500;letter-spacing:.02em;',
                'color:rgba(224,233,247,.88)',
            '}',

            '.mq-title{',
                'display:-webkit-box;-webkit-box-orient:vertical;',
                '-webkit-line-clamp:3;overflow:hidden;',
                'font-size:1.3em;line-height:1.17;',
                'font-weight:650;letter-spacing:-.025em;',
                'color:#fff;word-break:break-word;',
                'text-shadow:0 1px 8px rgba(0,0,0,.34)',
            '}',

            '.mq-bottom{',
                'display:flex;align-items:center;',
                'justify-content:space-between;gap:.45em;',
                'margin-top:.7em;min-height:1.7em',
            '}',

            '.mq-left{',
                'display:flex;align-items:center;gap:.4em;',
                'min-width:0;flex-wrap:wrap',
            '}',

            '.mq-rating,.mq-q,.mq-year{',
                'box-sizing:border-box;align-items:center;',
                'gap:.26em;min-height:1.65em;',
                'padding:.25em .48em;border-radius:.48em;',
                'font-size:.85em;line-height:1;',
                'font-weight:700;white-space:nowrap;',
                'font-variant-numeric:tabular-nums;',
                'backdrop-filter:blur(8px);',
                '-webkit-backdrop-filter:blur(8px)',
            '}',

            '.mq-rating{',
                'display:inline-flex;color:#ffe19a;',
                'background:rgba(255,195,65,.15);',
                'border:1px solid rgba(255,218,132,.24)',
            '}',

            '.mq-rating.r-mid{',
                'color:#f5d27b;',
                'background:rgba(231,174,48,.15)',
            '}',

            '.mq-rating.r-low{',
                'color:#ff9b83;',
                'background:rgba(235,103,66,.16)',
            '}',

            '.mq-rating svg,.mq-q svg{',
                'display:block;width:1em;height:1em;flex:none',
            '}',

            '.mq-q{',
                'display:none;color:#fff;',
                'background:rgba(255,255,255,.12);',
                'border:1px solid rgba(255,255,255,.2)',
            '}',

            '.mq-q.mq-q-on{display:inline-flex}',

            '.mq-q.q-4k{',
                'color:#a6f1bc;',
                'background:rgba(47,173,100,.19);',
                'border-color:rgba(98,226,145,.3)',
            '}',

            '.mq-q.q-fhd{',
                'color:#9ae8ed;',
                'background:rgba(39,168,187,.18);',
                'border-color:rgba(104,224,231,.29)',
            '}',

            '.mq-q.q-hd{',
                'color:#a9caff;',
                'background:rgba(70,129,228,.19);',
                'border-color:rgba(126,174,255,.3)',
            '}',

            '.mq-q.q-sd{',
                'color:#ffd396;',
                'background:rgba(211,139,46,.19);',
                'border-color:rgba(241,183,96,.3)',
            '}',

            '.mq-year{',
                'display:inline-flex;flex:none;',
                'color:rgba(255,255,255,.9);',
                'background:rgba(255,255,255,.1);',
                'border:1px solid rgba(255,255,255,.13)',
            '}',

            '.mq-ep{',
                'display:none;position:absolute;',
                'top:.55em;left:.55em;z-index:6;',
                'align-items:center;gap:.4em;',
                'padding:.5em .65em;border-radius:.6em;',
                'pointer-events:none;color:#fff;',
                'font-size:.88em;font-weight:700;line-height:1;',
                'white-space:nowrap;',
                'background:rgba(9,15,27,.82);',
                'border:1px solid rgba(255,255,255,.22);',
                'box-shadow:0 3px 14px rgba(0,0,0,.2);',
                'backdrop-filter:blur(8px);',
                '-webkit-backdrop-filter:blur(8px)',
            '}',

            '.mq-ep.mq-ep-on{display:inline-flex}',
            '.mq-ep svg{width:1.15em;height:1.15em;flex:none}',

            'body.mq-overlay-off .mq-meta,',
            'body.mq-overlay-off .mq-ep,',
            'body.mq-hide-episode .mq-ep,',
            'body.mq-hide-genres .mq-genres,',
            'body.mq-hide-year .mq-year,',
            'body.mq-hide-rating .mq-rating,',
            'body.mq-hide-quality .mq-q,',
            'body.mq-no-icon .mq-q svg',
            '{display:none!important}',

            'body.mq-no-color .mq-q{',
                'color:#fff;',
                'background:rgba(255,255,255,.12);',
                'border-color:rgba(255,255,255,.2)',
            '}'
        ].join('');

        document.head.appendChild(style);
    }

    // ===================== сеть =====================

    function httpGetJson(url, callback) {
        var xhr = new XMLHttpRequest();
        var finished = false;

        var timer = setTimeout(function () {
            finish(new Error('timeout'));
        }, REQUEST_TIMEOUT);

        function finish(error, result) {
            if (finished) return;
            finished = true;

            clearTimeout(timer);
            xhr.onreadystatechange = null;
            xhr.onerror = null;

            try { xhr.abort(); } catch (e) {}

            callback(error, result);
        }

        try {
            xhr.open('GET', url, true);

            xhr.onreadystatechange = function () {
                if (xhr.readyState !== 4) return;

                if (xhr.status < 200 || xhr.status >= 300) {
                    finish(new Error('HTTP ' + xhr.status));
                    return;
                }

                try {
                    finish(null, JSON.parse(xhr.responseText));
                } catch (e) {
                    finish(new Error('invalid JSON'));
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

    function fetchJacred(url, callback) {
        var sources = [url];

        if (USE_PROXY) {
            for (var i = 0; i < PROXY_LIST.length; i++) {
                var proxy = PROXY_LIST[i];

                sources.push(
                    proxy.prefix +
                    (proxy.encode ? encodeURIComponent(url) : url)
                );
            }
        }

        var index = 0;

        function next() {
            if (index >= sources.length) {
                callback(new Error('all sources failed'));
                return;
            }

            var source = sources[index++];
            log('GET', source);

            httpGetJson(source, function (error, result) {
                if (error) {
                    log('request failed:', error.message);
                    next();
                } else {
                    callback(null, result);
                }
            });
        }

        next();
    }

    // ===================== очереди запросов =====================

    function createQueue(gap, pauseOnErrors) {
        var tasks = [];
        var busy = false;
        var timer = null;
        var lastStart = 0;
        var pausedUntil = 0;
        var failures = 0;

        function pump() {
            if (busy || timer || !tasks.length) return;

            var now = Date.now();
            var wait = Math.max(
                0,
                lastStart + gap - now,
                pausedUntil - now
            );

            if (wait > 0) {
                timer = setTimeout(function () {
                    timer = null;
                    pump();
                }, wait);

                return;
            }

            var task = tasks.shift();
            busy = true;
            lastStart = Date.now();

            var completed = false;

            try {
                task(function (failed) {
                    if (completed) return;
                    completed = true;
                    busy = false;

                    if (failed) {
                        failures++;

                        if (pauseOnErrors && failures >= 3) {
                            pausedUntil = Date.now() + FAIL_PAUSE;
                            failures = 0;
                            log('request queue paused');
                        }
                    } else {
                        failures = 0;
                    }

                    pump();
                });
            } catch (e) {
                log('queue task error', e);
                busy = false;
                failures++;
                pump();
            }
        }

        return function (task) {
            tasks.push(task);
            pump();
        };
    }

    var enqueueJacred = createQueue(JACRED_GAP, true);
    var enqueueTmdb = createQueue(TMDB_GAP, false);

    // ===================== кеш =====================

    function getCached(cacheKey, key, ttl, emptyTtl) {
        var cache = storageGet(cacheKey, {});
        var item = cache && cache[key];

        if (!item || !item.timestamp) return null;

        var lifetime = item.value ? ttl : emptyTtl;

        return Date.now() - item.timestamp < lifetime ? item : null;
    }

    function putCached(cacheKey, key, value) {
        var cache = storageGet(cacheKey, {});

        if (!cache || typeof cache !== 'object') cache = {};

        cache[key] = {
            value: value || null,
            timestamp: Date.now()
        };

        // Не даём кешу бесконечно разрастаться.
        var keys = Object.keys(cache);

        if (keys.length > 500) {
            keys.sort(function (a, b) {
                return (cache[a].timestamp || 0) -
                    (cache[b].timestamp || 0);
            });

            for (var i = 0; i < keys.length - 400; i++) {
                delete cache[keys[i]];
            }
        }

        storageSet(cacheKey, cache);
    }

    // ===================== JacRed =====================

    function translateQuality(value) {
        value = Number(value);

        if (value >= 2160) return '4K';
        if (value >= 1080) return 'FHD';
        if (value >= 720) return 'HD';
        if (value > 0) return 'SD';

        return null;
    }

    function searchJacred(title, year, callback) {
        var key = storageGet('jacred_key', '');
        var userId = storageGet('lampac_unic_id', '');

        var url = getJacredUrl() +
            '/api/v1.0/torrents?search=' +
            encodeURIComponent(title) +
            '&year=' + encodeURIComponent(year) +
            '&exact=true' +
            (userId ? '&uid=' + encodeURIComponent(userId) : '') +
            (key ? '&apikey=' + encodeURIComponent(key) : '');

        fetchJacred(url, function (error, torrents) {
            if (error || !Array.isArray(torrents)) {
                callback(null, true);
                return;
            }

            var best = 0;

            for (var i = 0; i < torrents.length; i++) {
                var torrent = torrents[i] || {};
                var quality = Number(torrent.quality);

                if (!isFinite(quality) || quality <= 0) continue;

                if (
                    quality < 720 &&
                    /\b(ts|telesync|camrip|cam)\b/i.test(
                        String(torrent.title || '')
                    )
                ) {
                    continue;
                }

                if (quality > best) best = quality;
            }

            callback(translateQuality(best), false);
        });
    }

    function findQuality(data, callback) {
        var date = data.release_date || data.first_air_date || '';
        var year = String(date).substring(0, 4);

        if (!/^\d{4}$/.test(year)) {
            callback(null, false);
            return;
        }

        var original = String(
            data.original_title || data.original_name || ''
        ).trim();

        var translated = String(
            data.title || data.name || ''
        ).trim();

        var titles = [];

        if (original) titles.push(original);
        if (translated && translated !== original) {
            titles.push(translated);
        }

        function next(index) {
            if (index >= titles.length) {
                callback(null, false);
                return;
            }

            searchJacred(titles[index], year, function (quality, failed) {
                if (failed || quality) {
                    callback(quality, failed);
                } else {
                    next(index + 1);
                }
            });
        }

        next(0);
    }

    // Одно обращение к JacRed на одинаковые карточки.
    var qualityPending = {};

    function requestQuality(cacheKey, data, callback) {
        if (qualityPending[cacheKey]) {
            qualityPending[cacheKey].push(callback);
            return;
        }

        qualityPending[cacheKey] = [callback];

        enqueueJacred(function (done) {
            findQuality(data, function (quality, failed) {
                if (!failed) {
                    putCached(
                        QUALITY_CACHE_KEY,
                        cacheKey,
                        quality
                    );
                }

                var listeners = qualityPending[cacheKey] || [];
                delete qualityPending[cacheKey];

                for (var i = 0; i < listeners.length; i++) {
                    try {
                        listeners[i](quality, failed);
                    } catch (e) {
                        log('quality callback error', e);
                    }
                }

                done(failed);
            });
        });
    }

    // ===================== жанры =====================

    var GENRES_RU = {
        28: 'Боевик',
        12: 'Приключения',
        16: 'Мультфильм',
        35: 'Комедия',
        80: 'Криминал',
        99: 'Документальный',
        18: 'Драма',
        10751: 'Семейный',
        14: 'Фэнтези',
        36: 'История',
        27: 'Ужасы',
        10402: 'Музыка',
        9648: 'Детектив',
        10749: 'Мелодрама',
        878: 'Фантастика',
        10770: 'Телефильм',
        53: 'Триллер',
        10752: 'Военный',
        37: 'Вестерн',
        10759: 'Боевик и приключения',
        10762: 'Детский',
        10763: 'Новости',
        10764: 'Реалити-шоу',
        10765: 'Фантастика и фэнтези',
        10766: 'Мыльная опера',
        10767: 'Ток-шоу',
        10768: 'Война и политика'
    };

    var GENRES_EN = {
        28: 'Action',
        12: 'Adventure',
        16: 'Animation',
        35: 'Comedy',
        80: 'Crime',
        99: 'Documentary',
        18: 'Drama',
        10751: 'Family',
        14: 'Fantasy',
        36: 'History',
        27: 'Horror',
        10402: 'Music',
        9648: 'Mystery',
        10749: 'Romance',
        878: 'Science Fiction',
        10770: 'TV Movie',
        53: 'Thriller',
        10752: 'War',
        37: 'Western',
        10759: 'Action & Adventure',
        10762: 'Kids',
        10763: 'News',
        10764: 'Reality',
        10765: 'Sci-Fi & Fantasy',
        10766: 'Soap',
        10767: 'Talk',
        10768: 'War & Politics'
    };

    function getGenres(data) {
        var names = [];
        var map = isEn() ? GENRES_EN : GENRES_RU;
        var i;

        if (data.genres && data.genres.length) {
            for (i = 0; i < data.genres.length && names.length < 2; i++) {
                if (data.genres[i] && data.genres[i].name) {
                    names.push(data.genres[i].name);
                }
            }
        } else if (data.genre_ids && data.genre_ids.length) {
            for (i = 0; i < data.genre_ids.length && names.length < 2; i++) {
                if (map[data.genre_ids[i]]) {
                    names.push(map[data.genre_ids[i]]);
                }
            }
        }

        return names.join(' · ');
    }

    // ===================== карточки =====================

    var ICON_STAR =
        '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
        '<path d="m12 2.8 2.77 5.62 6.2.9-4.49 4.37 1.06 6.18L12 16.95' +
        'l-5.54 2.92 1.06-6.18-4.49-4.37 6.2-.9L12 2.8Z"/></svg>';

    var ICON_GAUGE =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" ' +
        'aria-hidden="true"><path d="M4.6 18.5a8.5 8.5 0 1 1 14.8 0"/>' +
        '<path d="m12 14 3.2-4.2"/></svg>';

    var ICON_EP =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
        'aria-hidden="true"><rect x="3.5" y="8" width="17" height="12" rx="2"/>' +
        '<path d="M5 5h14M8 2.5h9m-6.5 9v5l4-2.5-4-2.5Z"/></svg>';

    function getCardType(data) {
        var type = data.media_type || data.type;

        if (type === 'movie' || type === 'tv') return type;

        return data.name || data.original_name ? 'tv' : 'movie';
    }

    function getCardData(element) {
        if (element.card_data) return element.card_data;

        try {
            if (window.$) {
                return window.$(element).data('card_data') || null;
            }
        } catch (e) {}

        return null;
    }

    function buildOverlay(element, data) {
        var view = element.querySelector('.card__view');

        if (!view) return false;

        if (view.querySelector('.mq-meta')) {
            element.classList.add('card--mq');
            return true;
        }

        var meta = document.createElement('div');
        meta.className = 'mq-meta';

        var genres = getGenres(data);

        if (genres) {
            var genreElement = document.createElement('div');
            genreElement.className = 'mq-genres';
            genreElement.textContent = genres;
            meta.appendChild(genreElement);
        }

        var title = document.createElement('div');
        title.className = 'mq-title';
        title.textContent = data.title || data.name || '';
        meta.appendChild(title);

        var bottom = document.createElement('div');
        bottom.className = 'mq-bottom';

        var left = document.createElement('div');
        left.className = 'mq-left';

        var vote = parseFloat(data.vote_average);

        if (isFinite(vote) && vote > 0) {
            var rating = document.createElement('span');

            rating.className = 'mq-rating' +
                (vote < 5 ? ' r-low' : vote < 6.5 ? ' r-mid' : '');

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

        var date = data.release_date || data.first_air_date || '';
        var year = String(date).substring(0, 4);

        if (/^\d{4}$/.test(year)) {
            var yearElement = document.createElement('span');
            yearElement.className = 'mq-year';
            yearElement.textContent = year;
            bottom.appendChild(yearElement);
        }

        meta.appendChild(bottom);
        view.appendChild(meta);

        var episode = document.createElement('div');
        episode.className = 'mq-ep';
        view.appendChild(episode);

        element.classList.add('card--mq');
        return true;
    }

    function setQuality(element, value) {
        var node = element.querySelector('.mq-q');

        if (!node) return;

        node.className = value
            ? 'mq-q mq-q-on q-' + String(value).toLowerCase()
            : 'mq-q';

        node.innerHTML = '';

        if (!value) return;

        node.innerHTML = ICON_GAUGE;

        var text = document.createElement('span');
        text.textContent = value;
        node.appendChild(text);
    }

    // ===================== сезон / серия =====================

    function getEpisodeFromData(data) {
        if (!data) return null;

        var episode = data.last_episode_to_air;

        // next_episode_to_air используем лишь тогда, когда дата уже наступила.
        if (
            !episode &&
            data.next_episode_to_air &&
            data.next_episode_to_air.air_date
        ) {
            var next = data.next_episode_to_air;
            var today = new Date().toISOString().substring(0, 10);

            if (next.air_date <= today) episode = next;
        }

        if (
            episode &&
            Number(episode.episode_number) > 0 &&
            Number(episode.season_number) >= 0
        ) {
            return {
                s: Number(episode.season_number),
                e: Number(episode.episode_number)
            };
        }

        return null;
    }

    function setEpisode(element, episode) {
        var node = element.querySelector('.mq-ep');

        if (!node) return;

        node.className = episode && episode.e
            ? 'mq-ep mq-ep-on'
            : 'mq-ep';

        node.innerHTML = '';

        if (!episode || !episode.e) return;

        node.innerHTML = ICON_EP;

        var text = document.createElement('span');
        text.textContent = 'S' + episode.s + ':E' + episode.e;
        node.appendChild(text);
    }

    var episodePending = {};

    function requestEpisode(id, callback) {
        if (episodePending[id]) {
            episodePending[id].push(callback);
            return;
        }

        episodePending[id] = [callback];

        enqueueTmdb(function (done) {
            var url;

            try {
                var lang = storageGet(
                    'tmdb_lang',
                    storageGet('language', 'ru')
                );

                url = Lampa.TMDB.api(
                    'tv/' + encodeURIComponent(id) +
                    '?api_key=' + encodeURIComponent(Lampa.TMDB.key()) +
                    '&language=' + encodeURIComponent(lang || 'ru')
                );
            } catch (e) {
                complete(null, true);
                return;
            }

            httpGetJson(url, function (error, result) {
                if (error || !result) {
                    complete(null, true);
                    return;
                }

                var episode = getEpisodeFromData(result);

                putCached(EPISODE_CACHE_KEY, String(id), episode);
                complete(episode, false);
            });

            function complete(episode, failed) {
                var listeners = episodePending[id] || [];
                delete episodePending[id];

                for (var i = 0; i < listeners.length; i++) {
                    try {
                        listeners[i](episode, failed);
                    } catch (e) {
                        log('episode callback error', e);
                    }
                }

                done(failed);
            }
        });
    }

    function ensureEpisode(element, data) {
        if (!opt('maxsm_mq_episode')) return;
        if (getCardType(data) !== 'tv') return;
        if (element.getAttribute('data-mq-ep')) return;

        element.setAttribute('data-mq-ep', '1');

        var episode = getEpisodeFromData(data);

        if (episode) {
            setEpisode(element, episode);
            return;
        }

        var id = data.id;
        if (!id) return;

        var cached = getCached(
            EPISODE_CACHE_KEY,
            String(id),
            EPISODE_TTL,
            EPISODE_TTL
        );

        if (cached) {
            setEpisode(element, cached.value);
            return;
        }

        requestEpisode(id, function (result, failed) {
            if (failed) {
                element.removeAttribute('data-mq-ep');
                return;
            }

            setEpisode(element, result);
        });
    }

    function ensureQuality(element, data) {
        if (!opt('maxsm_mq_quality')) return;
        if (element.getAttribute('data-quality-added')) return;

        var type = getCardType(data);

        if (type === 'tv' && !opt('maxsm_mq_quality_tv')) return;

        element.setAttribute('data-quality-added', '1');

        var title = data.original_title ||
            data.original_name ||
            data.title ||
            data.name ||
            '';

        var year = String(
            data.release_date || data.first_air_date || ''
        ).substring(0, 4);

        var cacheKey = type + '_' +
            (data.id || String(title).toLowerCase() + '_' + year);

        var cached = getCached(
            QUALITY_CACHE_KEY,
            cacheKey,
            QUALITY_TTL,
            EMPTY_QUALITY_TTL
        );

        if (cached) {
            setQuality(element, cached.value);
            return;
        }

        requestQuality(cacheKey, data, function (quality, failed) {
            if (failed) {
                // Ошибку сети не принимаем за отсутствие торрентов.
                element.removeAttribute('data-quality-added');
                return;
            }

            setQuality(element, quality);
        });
    }

    function processCard(element, attempt) {
        if (!element || !element.querySelector) return;

        var data = getCardData(element);

        if (!data) {
            if ((attempt || 0) < 8) {
                setTimeout(function () {
                    if (element.parentNode) {
                        processCard(element, (attempt || 0) + 1);
                    }
                }, 300);
            }

            return;
        }

        if (!buildOverlay(element, data)) return;

        ensureEpisode(element, data);
        ensureQuality(element, data);
    }

    function updateCards(cards) {
        for (var i = 0; i < cards.length; i++) {
            processCard(cards[i], 0);
        }
    }

    // ===================== запуск =====================

    var observer = new MutationObserver(function (mutations) {
        var found = [];

        for (var i = 0; i < mutations.length; i++) {
            var added = mutations[i].addedNodes;

            for (var j = 0; j < added.length; j++) {
                var node = added[j];

                if (node.nodeType !== 1) continue;

                if (
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
    });

    function startPlugin() {
        if (window.maxsmRatingsQualityPlugin) return;
        if (!window.Lampa || !document.body) return;

        window.maxsmRatingsQualityPlugin = true;

        addStyle();

        try {
            addSettings();
        } catch (e) {
            if (window.console) {
                console.error('MAXSM-RATINGS settings error', e);
            }
        }

        applyBodyClasses();

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        updateCards(document.querySelectorAll('.card'));
        log('plugin started');
    }

    if (window.appready) {
        startPlugin();
    } else if (window.Lampa && Lampa.Listener) {
        Lampa.Listener.follow('app', function (event) {
            if (event.type === 'ready') startPlugin();
        });
    }
})();
