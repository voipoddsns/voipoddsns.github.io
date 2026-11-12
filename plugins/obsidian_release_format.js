(function () {
    'use strict';

    var Q_LOGGING = false;                        // логи в консоль (true для отладки)
    var Q_CACHE_TIME = 24 * 60 * 60 * 1000;       // кеш найденного качества
    var Q_CACHE_TIME_EMPTY = 60 * 60 * 1000;      // кеш "ничего не найдено"
    var QUALITY_CACHE = 'maxsm_ratings_quality_cache';
    var REQUEST_TIMEOUT = 6000;                   // таймаут одного запроса
    var MAX_PARALLEL = 1;                         // jac.red отвечает 429 при частых запросах
    var REQUEST_GAP = 800;                        // пауза между запросами, мс
    var FAIL_PAUSE = 60 * 1000;                   // пауза после 3 ошибок подряд
    var USE_PROXY = false;                        // включать только при проблемах с CORS

    var JACRED_PROTOCOL = location.protocol === 'https:' ? 'https://' : 'http://';

    var PROXY_LIST = [
        { prefix: 'https://api.allorigins.win/raw?url=', encode: true },
        { prefix: 'https://cors.bwa.workers.dev/', encode: false }
    ];

    // ID страниц настроек. Первый сохранён прежним.
    var COMPONENT_APPEARANCE = 'maxsm_cards';
    var COMPONENT_QUALITY = 'maxsm_cards_quality';
    var COMPONENT_SERVICE = 'maxsm_cards_service';

    function log() {
        if (!Q_LOGGING) return;
        var args = ['MAXSM-RATINGS'].concat([].slice.call(arguments));
        console.log.apply(console, args);
    }

    // ===================== настройки =====================

    var DEFAULTS = {
        maxsm_mq_overlay: true,        // оверлей на карточках
        maxsm_mq_genres: true,         // жанры
        maxsm_mq_year: true,           // год
        maxsm_mq_rating: true,         // рейтинг
        maxsm_mq_quality: true,        // качество (JacRed)
        maxsm_mq_quality_tv: true,     // качество для сериалов
        maxsm_mq_episode: true,        // номер сезона/серии у сериалов
        maxsm_mq_quality_icon: true,   // иконка у качества
        maxsm_mq_quality_color: true   // цветное качество
    };

    function opt(name) {
        var value;

        try {
            value = Lampa.Storage.get(name, '');
        } catch (e) {
            value = '';
        }

        if (value === '' || value === undefined || value === null) {
            return DEFAULTS[name];
        }

        return value === true || value === 'true';
    }

    function isEn() {
        try {
            return Lampa.Storage.get('language', 'ru') === 'en';
        } catch (e) {
            return false;
        }
    }

    function tr(ru, en) {
        return isEn() ? en : ru;
    }

    function getJacredUrl() {
        var url = '';

        try {
            url = Lampa.Storage.get('jac.red') || '';
        } catch (e) {}

        url = String(url || 'jac.red')
            .replace(/^https?:\/\//i, '')
            .replace(/\/+$/, '');

        return url || 'jac.red';
    }

    function getJacredKey() {
        try {
            return Lampa.Storage.get('jacred_key') || '';
        } catch (e) {
            return '';
        }
    }

    // Классы на body управляют видимостью частей оверлея без перерисовки карточек
    function applyBodyClasses() {
        var body = document.body;

        function toggle(className, enabled) {
            if (enabled) body.classList.add(className);
            else body.classList.remove(className);
        }

        toggle('mq-overlay-off', !opt('maxsm_mq_overlay'));
        toggle('mq-hide-genres', !opt('maxsm_mq_genres'));
        toggle('mq-hide-year', !opt('maxsm_mq_year'));
        toggle('mq-hide-rating', !opt('maxsm_mq_rating'));
        toggle('mq-hide-episode', !opt('maxsm_mq_episode'));
        toggle('mq-hide-quality', !opt('maxsm_mq_quality));
        toggle('mq-hide-quality-tv', !opt('maxsm_mq_quality_tv'));
        toggle('mq-no-icon', !opt('maxsm_mq_quality_icon'));
        toggle('mq-no-color', !opt('maxsm_mq_quality_color'));
    }

    function addSettings() {
        if (!window.Lampa || !Lampa.SettingsApi) return;

        var CARD_ICON =
            '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" ' +
            'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M4 15h16"/>' +
            '<path d="M8 18.5h3"/><path d="M15 18.5h1"/></svg>';

        var QUALITY_ICON =
            '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" ' +
            'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M4.6 18.5a8.5 8.5 0 1 1 14.8 0"/>' +
            '<path d="M12 14l3.2-4.2"/></svg>';

        var SERVICE_ICON =
            '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" ' +
            'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<circle cx="12" cy="12" r="3"/>' +
            '<path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.7 2.9-.2-.1a1.7 1.7 0 0 0-1.8.2l-.2.1h-3.4l-.1-.2a1.7 1.7 0 0 0-1.6-1l-.2.1-2.9-1.7.1-.2a1.7 1.7 0 0 0-.2-1.8l-.1-.2v-3.4l.2-.1a1.7 1.7 0 0 0 1-1.6l-.1-.2 1.7-2.9.2.1a1.7 1.7 0 0 0 1.8-.2l.2-.1h3.4l.1.2a1.7 1.7 0 0 0 1.6 1l.2-.1 2.9 1.7-.1.2a1.7 1.7 0 0 0 .2 1.8l.1.2v3.4z"/></svg>';

        // Каждая группа настроек открывается на отдельной компактной странице.
        Lampa.SettingsApi.addComponent({
            component: COMPONENT_APPEARANCE,
            name: tr('Карточки и качество', 'Cards & quality'),
            icon: CARD_ICON
        });

        Lampa.SettingsApi.addComponent({
            component: COMPONENT_QUALITY,
            name: tr('Карточки: качество', 'Cards: quality'),
            icon: QUALITY_ICON
        });

        Lampa.SettingsApi.addComponent({
            component: COMPONENT_SERVICE,
            name: tr('Карточки: служебное', 'Cards: maintenance'),
            icon: SERVICE_ICON
        });

        function trigger(component, name, ruTitle, enTitle, ruDesc, enDesc, onChange) {
            Lampa.SettingsApi.addParam({
                component: component,
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

        function title(component, ruTitle, enTitle) {
            Lampa.SettingsApi.addParam({
                component: component,
                param: { type: 'title' },
                field: { name: tr(ruTitle, enTitle) }
            });
        }

        function refetchQuality() {
            var cards = document.querySelectorAll('.card');

            for (var i = 0; i < cards.length; i++) {
                cards[i].removeAttribute('data-quality-added');
            }

            updateCards(cards);
        }

        function refetchEpisodes() {
            var cards = document.querySelectorAll('.card');

            for (var i = 0; i < cards.length; i++) {
                cards[i].removeAttribute('data-mq-ep');
            }

            updateCards(cards);
        }

        // Страница 1: оформление карточек
        title(COMPONENT_APPEARANCE, 'Оформление', 'Appearance');

        trigger(
            COMPONENT_APPEARANCE,
            'maxsm_mq_overlay',
            'Оверлей на карточках',
            'Card overlay',
            'Жанры, название, рейтинг и год поверх постера',
            'Genres, title, rating and year over the poster'
        );

        trigger(
            COMPONENT_APPEARANCE,
            'maxsm_mq_genres',
            'Жанры',
            'Genres',
            'Показывать первые два жанра',
            'Show the first two genres'
        );

        trigger(
            COMPONENT_APPEARANCE,
            'maxsm_mq_year',
            'Год выхода',
            'Release year',
            '',
            ''
        );

        trigger(
            COMPONENT_APPEARANCE,
            'maxsm_mq_rating',
            'Рейтинг',
            'Rating',
            'Оценка TMDB со звездой',
            'TMDB score with a star'
        );

        trigger(
            COMPONENT_APPEARANCE,
            'maxsm_mq_episode',
            'Сезон и серия',
            'Season and episode',
            'Бейдж S1:E8 у сериалов (последняя вышедшая серия)',
            'S1:E8 badge on TV shows (latest aired episode)',
            refetchEpisodes
        );

        // Страница 2: качество
        title(COMPONENT_QUALITY, 'Качество', 'Quality');

        trigger(
            COMPONENT_QUALITY,
            'maxsm_mq_quality',
            'Показывать качество',
            'Show quality',
            'Ищется через JacRed',
            'Looked up via JacRed',
            refetchQuality
        );

        trigger(
            COMPONENT_QUALITY,
            'maxsm_mq_quality_tv',
            'Качество для сериалов',
            'Quality for TV shows',
            '',
            '',
            refetchQuality
        );

        trigger(
            COMPONENT_QUALITY,
            'maxsm_mq_quality_icon',
            'Иконка качества',
            'Quality icon',
            '',
            ''
        );

        trigger(
            COMPONENT_QUALITY,
            'maxsm_mq_quality_color',
            'Цветное качество',
            'Colored quality',
            '4K зелёный, HD синий и т.д.',
            '4K green, HD blue, etc.'
        );

        // Страница 3: служебные действия
        title(COMPONENT_SERVICE, 'Служебное', 'Maintenance');

        Lampa.SettingsApi.addParam({
            component: COMPONENT_SERVICE,
            param: {
                name: 'maxsm_mq_clear_cache',
                type: 'button'
            },
            field: {
                name: tr('Очистить кеш качества', 'Clear quality cache')
            },
            onChange: function () {
                Lampa.Storage.set(QUALITY_CACHE, {});
                Lampa.Storage.set(EP_CACHE, {});

                if (Lampa.Noty) {
                    Lampa.Noty.show(tr('Кеш качества очищен', 'Quality cache cleared'));
                }
            }
        });

        Lampa.SettingsApi.addParam({
            component: COMPONENT_SERVICE,
            param: {
                name: 'maxsm_mq_reset',
                type: 'button'
            },
            field: {
                name: tr('Сбросить настройки', 'Reset settings')
            },
            onChange: function () {
                for (var key in DEFAULTS) {
                    if (Object.prototype.hasOwnProperty.call(DEFAULTS, key)) {
                        Lampa.Storage.set(key, DEFAULTS[key]);
                    }
                }

                applyBodyClasses();

                try {
                    Lampa.Settings.update();
                } catch (e) {}

                if (Lampa.Noty) {
                    Lampa.Noty.show(tr('Настройки сброшены', 'Settings reset'));
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
            // убираем стандартные подписи на карточках с оверлеем
            'body:not(.mq-overlay-off) .card--mq .card__title,' +
            'body:not(.mq-overlay-off) .card--mq .card__age,' +
            'body:not(.mq-overlay-off) .card--mq .card__vote,' +
            'body:not(.mq-overlay-off) .card--mq .card__type,' +
            'body:not(.mq-overlay-off) .card--mq .card__quality{display:none!important;}' +

            '.card--mq .card__view{position:relative;}' +

            '.mq-meta{' +
                'position:absolute;left:0;right:0;bottom:0;z-index:5;' +
                'pointer-events:none;box-sizing:border-box;' +
                'padding:3.2em .9em .8em;border-radius:0 0 1em 1em;' +
                'background:linear-gradient(to top,' +
                    'rgba(0,0,0,.92) 0%,' +
                    'rgba(0,0,0,.72) 45%,' +
                    'rgba(0,0,0,0) 100%);' +
            '}' +

            'body.mq-overlay-off .mq-meta{display:none;}' +

            '.mq-genres{' +
                'font-size:.85em;line-height:1.2;color:rgba(255,255,255,.92);' +
                'margin-bottom:.2em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' +
            '}' +

            'body.mq-hide-genres .mq-genres{display:none;}' +

            '.mq-title{' +
                'font-size:1.45em;line-height:1.15;font-weight:400;color:#fff;' +
                'display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;' +
                'overflow:hidden;word-break:break-word;' +
            '}' +

            '.mq-bottom{' +
                'display:flex;align-items:center;justify-content:space-between;' +
                'margin-top:.55em;font-size:.95em;' +
            '}' +

            '.mq-left{' +
                'display:flex;align-items:center;gap:.9em;min-width:0;' +
            '}' +

            '.mq-year{color:rgba(255,255,255,.92);}' +
            'body.mq-hide-year .mq-year{display:none;}' +

            '.mq-rating{' +
                'display:inline-flex;align-items:center;gap:.3em;color:#4a9eed;' +
            '}' +

            '.mq-rating svg{width:1.15em;height:1.15em;flex:none;}' +
            '.mq-rating.r-mid{color:#e6c24a;}' +
            '.mq-rating.r-low{color:#e0603c;}' +
            'body.mq-hide-rating .mq-rating{display:none;}' +

            '.mq-q{' +
                'display:none;align-items:center;gap:.3em;font-weight:bold;' +
                'white-space:nowrap;color:#fff;' +
            '}' +

            '.mq-q.mq-q-on{display:inline-flex;}' +
            '.mq-q svg{width:1.15em;height:1.15em;flex:none;}' +
            '.mq-q.q-4k{color:#5fb760;}' +
            '.mq-q.q-fhd{color:#3fb8c9;}' +
            '.mq-q.q-hd{color:#4a9eed;}' +
            '.mq-q.q-sd{color:#e6a23c;}' +

            'body.mq-no-color .mq-q{color:#fff;}' +
            'body.mq-no-icon .mq-q svg{display:none;}' +
            'body.mq-hide-quality .mq-q{display:none;}' +
            'body.mq-hide-quality-tv .card--mq.mq-tv .mq-q{display:none!important;}' +

            // бейдж серии вверху слева
            '.mq-ep{' +
                'display:none;position:absolute;top:0;left:0;z-index:6;' +
                'pointer-events:none;align-items:center;gap:.5em;' +
                'padding:.55em .9em .55em .8em;color:#fff;font-size:1.05em;' +
                'line-height:1;white-space:nowrap;background:rgba(0,0,0,.85);' +
                'border-radius:1em 0 1em 0;' +
            '}' +

            '.mq-ep.mq-ep-on{display:inline-flex;}' +
            '.mq-ep svg{width:1.35em;height:1.35em;flex:none;}' +
            'body.mq-overlay-off .mq-ep,' +
            'body.mq-hide-episode .mq-ep{display:none;}';

        document.head.appendChild(style);
    }

    // ===================== сеть (XHR для старых WebOS/Tizen) =====================

    function httpGetJson(url, callback) {
        var done = false;
        var xhr = new XMLHttpRequest();
        var timer = setTimeout(function () {
            finish(new Error('timeout'));
        }, REQUEST_TIMEOUT);

        function finish(error, data) {
            if (done) return;
            done = true;
            clearTimeout(timer);

            try {
                xhr.abort();
            } catch (e) {}

            callback(error, data);
        }

        try {
            xhr.open('GET', url, true);

            xhr.onreadystatechange = function () {
                if (xhr.readyState !== 4) return;

                if (xhr.status >= 200 && xhr.status < 300) {
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

    // ===================== очередь запросов =====================

    var queue = [];
    var running = 0;
    var lastStart = 0;
    var pausedUntil = 0;
    var failStreak = 0;
    var pumpTimer = null;

    function enqueue(task) {
        queue.push(task);
        pump();
    }

    function pump() {
        if (running >= MAX_PARALLEL || !queue.length || pumpTimer) return;

        var now = Date.now();
        var wait = Math.max(
            pausedUntil - now,
            lastStart + REQUEST_GAP - now,
            0
        );

        if (wait > 0) {
            pumpTimer = setTimeout(function () {
                pumpTimer = null;
                pump();
            }, wait);
            return;
        }

        var task = queue.shift();
        running++;
        lastStart = Date.now();

        var finished = false;

        task(function (failed) {
            if (finished) return;
            finished = true;
            running--;

            if (failed) {
                failStreak++;

                if (failStreak >= 3) {
                    pausedUntil = Date.now() + FAIL_PAUSE;
                    failStreak = 0;
                    log('too many errors, pause');
                }
            } else {
                failStreak = 0;
            }

            pump();
        });
    }

    // ===================== JacRed =====================

    function translateQuality(quality) {
        if (typeof quality !== 'number') return null;
        if (quality >= 2160) return '4K';
        if (quality >= 1080) return 'FHD';
        if (quality >= 720) return 'HD';
        if (quality > 0) return 'SD';
        return null;
    }

    function searchJacred(title, year, cardId, callback) {
        var key = getJacredKey();
        var userId = '';

        try {
            userId = Lampa.Storage.get('lampac_unic_id', '') || '';
        } catch (e) {}

        var apiUrl = JACRED_PROTOCOL + getJacredUrl() +
            '/api/v1.0/torrents?search=' + encodeURIComponent(title) +
            '&year=' + year +
            '&exact=true' +
            (userId ? '&uid=' + encodeURIComponent(userId) : '') +
            (key ? '&apikey=' + encodeURIComponent(key) : '');

        fetchJsonWithFallback(apiUrl, cardId, function (error, torrents) {
            if (error || !Array.isArray(torrents)) {
                callback(null, true); // ошибка сети/429 — не кешируем
                return;
            }

            if (!torrents.length) {
                callback(null, false); // ничего не найдено
                return;
            }

            var best = -1;

            for (var i = 0; i < torrents.length; i++) {
                var torrent = torrents[i];
                if (!torrent) continue;

                var quality = torrent.quality;
                if (typeof quality !== 'number' || quality === 0) continue;

                if (/\b(ts|telesync|camrip|cam)\b/i.test(String(torrent.title || '')) &&
                    quality < 720) {
                    continue;
                }

                if (quality > best) best = quality;
            }

            callback(best > 0 ? translateQuality(best) : null, false);
        });
    }

    function getQuality(card, cardId, callback) {
        var date = card.release_date || '';
        var year = date.substring(0, 4);

        if (!year || isNaN(year)) {
            callback(null, false);
            return;
        }

        var titles = [];

        if (card.original_title && /[a-zа-яё0-9]/i.test(card.original_title)) {
            titles.push(card.original_title.trim());
        }

        if (card.title &&
            /[a-zа-яё0-9]/i.test(card.title) &&
            card.title !== card.original_title) {
            titles.push(card.title.trim());
        }

        function next(index) {
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
                    next(index + 1);
                }
            });
        }

        next(0);
    }

    // ===================== кеш качества =====================

    function readCache(key) {
        var cache = Lampa.Storage.get(QUALITY_CACHE) || {};
        var item = cache[key];

        if (!item) return null;

        var ttl = item.quality ? Q_CACHE_TIME : Q_CACHE_TIME_EMPTY;
        return Date.now() - item.timestamp < ttl ? item : null;
    }

    function writeCache(key, quality) {
        var cache = Lampa.Storage.get(QUALITY_CACHE) || {};

        cache[key] = {
            quality: quality || null,
            timestamp: Date.now()
        };

        Lampa.Storage.set(QUALITY_CACHE, cache);
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
        10759: 'Боевик и Приключения',
        10762: 'Детский',
        10763: 'Новости',
        10764: 'Реалити-шоу',
        10765: 'Фантастика и Фэнтези',
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

    function getCardType(card) {
        var type = card.media_type || card.type;

        if (type === 'movie' || type === 'tv') return type;
        return (card.name || card.original_name) ? 'tv' : 'movie';
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
        if (!view || view.querySelector('.mq-meta')) return;

        var title = data.title || data.name || '';
        var date = data.release_date || data.first_air_date || '';
        var year = date.substring(0, 4);
        var vote = parseFloat(data.vote_average);
        var genres = getGenres(data);

        var meta = document.createElement('div');
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

        if (vote > 0) {
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

        var episodeNode = document.createElement('div');
        episodeNode.className = 'mq-ep';
        view.appendChild(episodeNode);

        element.classList.add('card--mq');
    }

    // ===================== сезон / серия (сериалы) =====================

    var EP_CACHE = 'maxsm_ratings_episode_cache';
    var EP_TTL = 6 * 60 * 60 * 1000;
    var EP_GAP = 250;
    var epQueue = [];
    var epTimer = null;

    var ICON_EP =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M7 4h12"/><path d="M5 7.5h14"/>' +
        '<rect x="3.5" y="11" width="17" height="9.5" rx="2"/>' +
        '<path d="M10.5 13.8v4l3.3-2z"/>' +
        '</svg>';

    function getEpisodeFromData(data) {
        var episode = data && (data.last_episode_to_air || data.next_episode_to_air);

        if (episode && episode.episode_number > 0 && episode.season_number >= 0) {
            return {
                s: episode.season_number,
                e: episode.episode_number
            };
        }

        return null;
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

    function epPump() {
        if (epTimer || !epQueue.length) return;

        var job = epQueue.shift();
        job();

        epTimer = setTimeout(function () {
            epTimer = null;
            epPump();
        }, EP_GAP);
    }

    function ensureEpisode(element, data) {
        if (!opt('maxsm_mq_episode')) return;
        if (getCardType(data) !== 'tv') return;
        if (element.getAttribute('data-mq-ep')) return;

        element.setAttribute('data-mq-ep', '1');

        // 1) данные уже есть в карточке
        var episode = getEpisodeFromData(data);

        if (episode) {
            setEpisode(element, episode);
            return;
        }

        var id = data.id;
        if (!id) return;

        // 2) кеш
        var cache = Lampa.Storage.get(EP_CACHE) || {};
        var cached = cache[id];

        if (cached && Date.now() - cached.t < EP_TTL) {
            setEpisode(element, cached.e ? { s: cached.s, e: cached.e } : null);
            return;
        }

        // 3) запрос деталей сериала в TMDB
        var url;

        try {
            var language =
                Lampa.Storage.get('tmdb_lang') ||
                Lampa.Storage.get('language', 'ru') ||
                'ru';

            url = Lampa.TMDB.api(
                'tv/' + id +
                '?api_key=' + Lampa.TMDB.key() +
                '&language=' + language
            );
        } catch (e) {
            return;
        }

        epQueue.push(function () {
            httpGetJson(url, function (error, response) {
                if (error || !response) {
                    element.removeAttribute('data-mq-ep');
                    return;
                }

                var result = getEpisodeFromData(response);
                var episodeCache = Lampa.Storage.get(EP_CACHE) || {};

                episodeCache[id] = {
                    s: result ? result.s : 0,
                    e: result ? result.e : 0,
                    t: Date.now()
                };

                Lampa.Storage.set(EP_CACHE, episodeCache);
                setEpisode(element, result);
            });
        });

        epPump();
    }

    function setQuality(element, quality) {
        var node = element.querySelector('.mq-q');
        if (!node) return;

        if (!quality) {
            node.className = 'mq-q';
            node.innerHTML = '';
            return;
        }

        node.className = 'mq-q mq-q-on q-' + String(quality).toLowerCase();
        node.innerHTML = ICON_GAUGE;

        var text = document.createElement('span');
        text.textContent = quality;
        node.appendChild(text);
    }

    function processCard(element, attempt) {
        var data = getCardData(element);

        if (!data) {
            // card_data ещё не проставлен — пробуем позже
            if ((attempt || 0) < 8) {
                setTimeout(function () {
                    processCard(element, (attempt || 0) + 1);
                }, 300);
            }

            return;
        }

        // оверлей строим один раз
        if (!element.classList.contains('card--mq')) {
            buildOverlay(element, data);
        }

        var type = getCardType(data);

        if (type === 'tv') {
            element.classList.add('mq-tv');
        } else {
            element.classList.remove('mq-tv');
        }

        // сезон/серия для сериалов
        ensureEpisode(element, data);

        // качество
        if (!opt('maxsm_mq_quality')) return;
        if (type === 'tv' && !opt('maxsm_mq_quality_tv')) return;
        if (element.getAttribute('data-quality-added')) return;

        element.setAttribute('data-quality-added', 'true');

        var card = {
            id: data.id || '',
            title: data.title || data.name || '',
            original_title: data.original_title || data.original_name || '',
            release_date: data.release_date || data.first_air_date || ''
        };

        var cacheKey = type + '_' + card.id;
        var cached = readCache(cacheKey);

        if (cached) {
            setQuality(element, cached.quality);
            return;
        }

        enqueue(function (done) {
            getQuality(card, card.id, function (quality, failed) {
                if (failed) {
                    // Ошибка сети/429 — не кешируем «пусто», оставляем шанс на повтор.
                    element.removeAttribute('data-quality-added');
                    done(true);
                    return;
                }

                writeCache(cacheKey, quality);
                setQuality(element, quality);
                done(false);
            });
        });
    }

    function updateCards(list) {
        for (var i = 0; i < list.length; i++) {
            processCard(list[i], 0);
        }
    }

    var observer = new MutationObserver(function (mutations) {
        var found = [];

        for (var i = 0; i < mutations.length; i++) {
            var added = mutations[i].addedNodes;
            if (!added) continue;

            for (var j = 0; j < added.length; j++) {
                var node = added[j];
                if (node.nodeType !== 1) continue;

                if (node.classList && node.classList.contains('card')) {
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
        window.maxsmRatingsQualityPlugin = true;

        addStyle();

        try {
            addSettings();
        } catch (e) {
            console.error('MAXSM-RATINGS settings error', e);
        }

        applyBodyClasses();

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        updateCards(document.querySelectorAll('.card'));
        log('plugin started');
    }

    // Ждём готовности Lampa
    if (window.appready) {
        startPlugin();
    } else if (window.Lampa && Lampa.Listener) {
        Lampa.Listener.follow('app', function (event) {
            if (event.type === 'ready') {
                startPlugin();
            }
        });
    }
})();
