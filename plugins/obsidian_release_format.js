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
    var USE_PROXY = false;                        // прокси бьют в тот же jac.red; включай, только если прямой запрос режет CORS

    var JACRED_PROTOCOL = location.protocol === 'https:' ? 'https://' : 'http://';

    var PROXY_LIST = [
        { prefix: 'https://api.allorigins.win/raw?url=', encode: true },
        { prefix: 'https://cors.bwa.workers.dev/', encode: false }
    ];

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
        maxsm_mq_quality_tv: false,    // качество для сериалов
        maxsm_mq_quality_icon: true,   // иконка у качества
        maxsm_mq_quality_color: true   // цветное качество
    };

    function opt(name) {
        var v;
        try { v = Lampa.Storage.get(name, ''); } catch (e) { v = ''; }
        if (v === '' || v === undefined || v === null) return DEFAULTS[name];
        return v === true || v === 'true';
    }

    function isEn() {
        try { return Lampa.Storage.get('language', 'ru') === 'en'; } catch (e) { return false; }
    }

    function tr(ru, en) { return isEn() ? en : ru; }

    function getJacredUrl() {
        var url = '';
        try { url = Lampa.Storage.get('jac.red') || ''; } catch (e) {}
        url = String(url || 'jac.red').replace(/^https?:\/\//i, '').replace(/\/+$/, '');
        return url || 'jac.red';
    }

    function getJacredKey() {
        try { return Lampa.Storage.get('jacred_key') || ''; } catch (e) { return ''; }
    }

    // Классы на body управляют видимостью частей оверлея без перерисовки карточек
    function applyBodyClasses() {
        var b = document.body;
        function toggle(cls, on) {
            if (on) b.classList.add(cls); else b.classList.remove(cls);
        }
        toggle('mq-overlay-off', !opt('maxsm_mq_overlay'));
        toggle('mq-hide-genres', !opt('maxsm_mq_genres'));
        toggle('mq-hide-year', !opt('maxsm_mq_year'));
        toggle('mq-hide-rating', !opt('maxsm_mq_rating'));
        toggle('mq-hide-quality', !opt('maxsm_mq_quality'));
        toggle('mq-no-icon', !opt('maxsm_mq_quality_icon'));
        toggle('mq-no-color', !opt('maxsm_mq_quality_color'));
    }

    function addSettings() {
        if (!window.Lampa || !Lampa.SettingsApi) return;

        Lampa.SettingsApi.addComponent({
            component: 'maxsm_cards',
            name: tr('Карточки и качество', 'Cards & quality'),
            icon: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" ' +
                'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M4 15h16"/>' +
                '<path d="M8 18.5h3"/><path d="M15 18.5h1"/></svg>'
        });

        function trigger(name, ruTitle, enTitle, ruDesc, enDesc, onChange) {
            Lampa.SettingsApi.addParam({
                component: 'maxsm_cards',
                param: { name: name, type: 'trigger', 'default': DEFAULTS[name] },
                field: { name: tr(ruTitle, enTitle), description: tr(ruDesc, enDesc) },
                onChange: function () {
                    applyBodyClasses();
                    if (onChange) onChange();
                }
            });
        }

        function title(ruTitle, enTitle) {
            Lampa.SettingsApi.addParam({
                component: 'maxsm_cards',
                param: { type: 'title' },
                field: { name: tr(ruTitle, enTitle) }
            });
        }

        function refetchQuality() {
            var cards = document.querySelectorAll('.card');
            for (var i = 0; i < cards.length; i++) cards[i].removeAttribute('data-quality-added');
            updateCards(cards);
        }

        title('Оформление', 'Appearance');
        trigger('maxsm_mq_overlay', 'Оверлей на карточках', 'Card overlay',
            'Жанры, название, рейтинг и год поверх постера', 'Genres, title, rating and year over the poster');
        trigger('maxsm_mq_genres', 'Жанры', 'Genres', 'Показывать первые два жанра', 'Show the first two genres');
        trigger('maxsm_mq_year', 'Год выхода', 'Release year', '', '');
        trigger('maxsm_mq_rating', 'Рейтинг', 'Rating', 'Оценка TMDB со звездой', 'TMDB score with a star');

        title('Качество', 'Quality');
        trigger('maxsm_mq_quality', 'Показывать качество', 'Show quality', 'Ищется через JacRed', 'Looked up via JacRed', refetchQuality);
        trigger('maxsm_mq_quality_tv', 'Качество для сериалов', 'Quality for TV shows', '', '', refetchQuality);
        trigger('maxsm_mq_quality_icon', 'Иконка качества', 'Quality icon', '', '');
        trigger('maxsm_mq_quality_color', 'Цветное качество', 'Colored quality', '4K зелёный, HD синий и т.д.', '4K green, HD blue, etc.');

        title('Служебное', 'Maintenance');
        Lampa.SettingsApi.addParam({
            component: 'maxsm_cards',
            param: { name: 'maxsm_mq_clear_cache', type: 'button' },
            field: { name: tr('Очистить кеш качества', 'Clear quality cache') },
            onChange: function () {
                Lampa.Storage.set(QUALITY_CACHE, {});
                if (Lampa.Noty) Lampa.Noty.show(tr('Кеш качества очищен', 'Quality cache cleared'));
            }
        });
        Lampa.SettingsApi.addParam({
            component: 'maxsm_cards',
            param: { name: 'maxsm_mq_reset', type: 'button' },
            field: { name: tr('Сбросить настройки', 'Reset settings') },
            onChange: function () {
                for (var k in DEFAULTS) {
                    if (DEFAULTS.hasOwnProperty(k)) Lampa.Storage.set(k, DEFAULTS[k]);
                }
                applyBodyClasses();
                try { Lampa.Settings.update(); } catch (e) {}
                if (Lampa.Noty) Lampa.Noty.show(tr('Настройки сброшены', 'Settings reset'));
            }
        });
    }

    // ===================== стили =====================

    function addStyle() {
        if (document.getElementById('maxsm_ratings_quality')) return;
        var st = document.createElement('style');
        st.id = 'maxsm_ratings_quality';
        st.textContent =
            // убираем стандартные подписи на карточках с оверлеем
            'body:not(.mq-overlay-off) .card--mq .card__title,' +
            'body:not(.mq-overlay-off) .card--mq .card__age,' +
            'body:not(.mq-overlay-off) .card--mq .card__vote,' +
            'body:not(.mq-overlay-off) .card--mq .card__quality{display:none !important;}' +

            '.card--mq .card__view{position:relative;}' +
            '.mq-meta{position:absolute;left:0;right:0;bottom:0;z-index:5;pointer-events:none;' +
            'padding:3.2em 0.9em 0.8em;box-sizing:border-box;border-radius:0 0 1em 1em;' +
            'background:linear-gradient(to top,rgba(0,0,0,0.92) 0%,rgba(0,0,0,0.72) 45%,rgba(0,0,0,0) 100%);}' +
            'body.mq-overlay-off .mq-meta{display:none;}' +

            '.mq-genres{font-size:0.85em;line-height:1.2;color:rgba(255,255,255,0.92);margin-bottom:0.2em;' +
            'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
            'body.mq-hide-genres .mq-genres{display:none;}' +

            '.mq-title{font-size:1.45em;line-height:1.15;font-weight:400;color:#fff;' +
            'display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;' +
            'word-break:break-word;}' +

            '.mq-bottom{display:flex;align-items:center;justify-content:space-between;margin-top:0.55em;font-size:0.95em;}' +
            '.mq-left{display:flex;align-items:center;gap:0.9em;min-width:0;}' +
            '.mq-year{color:rgba(255,255,255,0.92);}' +
            'body.mq-hide-year .mq-year{display:none;}' +

            '.mq-rating{display:inline-flex;align-items:center;gap:0.3em;color:#4a9eed;}' +
            '.mq-rating svg{width:1.15em;height:1.15em;flex:none;}' +
            '.mq-rating.r-mid{color:#e6c24a;}' +
            '.mq-rating.r-low{color:#e0603c;}' +
            'body.mq-hide-rating .mq-rating{display:none;}' +

            '.mq-q{display:none;align-items:center;gap:0.3em;font-weight:bold;white-space:nowrap;color:#fff;}' +
            '.mq-q.mq-q-on{display:inline-flex;}' +
            '.mq-q svg{width:1.15em;height:1.15em;flex:none;}' +
            '.mq-q.q-4k{color:#5fb760;}' +
            '.mq-q.q-fhd{color:#3fb8c9;}' +
            '.mq-q.q-hd{color:#4a9eed;}' +
            '.mq-q.q-sd{color:#e6a23c;}' +
            'body.mq-no-color .mq-q{color:#fff;}' +
            'body.mq-no-icon .mq-q svg{display:none;}' +
            'body.mq-hide-quality .mq-q{display:none;}';
        document.head.appendChild(st);
    }

    // ===================== сеть (XHR вместо fetch: работает на старых webOS/Tizen) =====================

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
        for (var i = 0; USE_PROXY && i < PROXY_LIST.length; i++) {
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
        var wait = Math.max(pausedUntil - now, lastStart + REQUEST_GAP - now, 0);
        if (wait > 0) {
            pumpTimer = setTimeout(function () { pumpTimer = null; pump(); }, wait);
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
                if (failStreak >= 3) { pausedUntil = Date.now() + FAIL_PAUSE; failStreak = 0; log('too many errors, pause'); }
            } else {
                failStreak = 0;
            }
            pump();
        });
    }

    // ===================== JacRed =====================

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
            if (err || !Array.isArray(torrents)) { cb(null, true); return; }   // ошибка сети/429 — не кешируем
            if (!torrents.length) { cb(null, false); return; }                 // реально ничего нет

            var best = -1;
            for (var i = 0; i < torrents.length; i++) {
                var t = torrents[i];
                var q = t.quality;
                if (typeof q !== 'number' || q === 0) continue;
                if (/\b(ts|telesync|camrip|cam)\b/i.test(String(t.title || '')) && q < 720) continue;
                if (q > best) best = q;
            }
            cb(best > 0 ? translateQuality(best) : null, false);
        });
    }

    function getQuality(card, cardId, cb) {
        var date = card.release_date || '';
        var year = date.substring(0, 4);
        if (!year || isNaN(year)) { cb(null, false); return; }

        var titles = [];
        if (card.original_title && /[a-zа-яё0-9]/i.test(card.original_title)) titles.push(card.original_title.trim());
        if (card.title && /[a-zа-яё0-9]/i.test(card.title) && card.title !== card.original_title) titles.push(card.title.trim());

        (function next(i) {
            if (i >= titles.length) { cb(null, false); return; }
            searchJacred(titles[i], year, cardId, function (q, failed) {
                if (failed) cb(null, true);
                else if (q) cb(q, false);
                else next(i + 1);
            });
        })(0);
    }

    // ===================== кеш =====================

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

    // ===================== жанры =====================

    var GENRES_RU = {
        28: 'Боевик', 12: 'Приключения', 16: 'Мультфильм', 35: 'Комедия', 80: 'Криминал', 99: 'Документальный',
        18: 'Драма', 10751: 'Семейный', 14: 'Фэнтези', 36: 'История', 27: 'Ужасы', 10402: 'Музыка',
        9648: 'Детектив', 10749: 'Мелодрама', 878: 'Фантастика', 10770: 'Телефильм', 53: 'Триллер',
        10752: 'Военный', 37: 'Вестерн', 10759: 'Боевик и Приключения', 10762: 'Детский', 10763: 'Новости',
        10764: 'Реалити-шоу', 10765: 'Фантастика и Фэнтези', 10766: 'Мыльная опера', 10767: 'Ток-шоу',
        10768: 'Война и политика'
    };

    var GENRES_EN = {
        28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary',
        18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
        9648: 'Mystery', 10749: 'Romance', 878: 'Science Fiction', 10770: 'TV Movie', 53: 'Thriller',
        10752: 'War', 37: 'Western', 10759: 'Action & Adventure', 10762: 'Kids', 10763: 'News',
        10764: 'Reality', 10765: 'Sci-Fi & Fantasy', 10766: 'Soap', 10767: 'Talk', 10768: 'War & Politics'
    };

    function getGenres(data) {
        var names = [];
        var map = isEn() ? GENRES_EN : GENRES_RU;
        var i;
        if (data.genres && data.genres.length) {
            for (i = 0; i < data.genres.length && names.length < 2; i++) {
                if (data.genres[i] && data.genres[i].name) names.push(data.genres[i].name);
            }
        } else if (data.genre_ids && data.genre_ids.length) {
            for (i = 0; i < data.genre_ids.length && names.length < 2; i++) {
                if (map[data.genre_ids[i]]) names.push(map[data.genre_ids[i]]);
            }
        }
        return names.join(', ');
    }

    // ===================== карточки =====================

    var ICON_STAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9L3.5 9.7l5.9-.8L12 3.5z"/></svg>';

    var ICON_GAUGE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
        'stroke-linecap="round" stroke-linejoin="round"><path d="M4.6 18.5a8.5 8.5 0 1 1 14.8 0"/><path d="M12 14l3.2-4.2"/></svg>';

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

    function buildOverlay(el, data) {
        var view = el.querySelector('.card__view');
        if (!view || view.querySelector('.mq-meta')) return;

        var title = data.title || data.name || '';
        var date = data.release_date || data.first_air_date || '';
        var year = date.substring(0, 4);
        var vote = parseFloat(data.vote_average);
        var genres = getGenres(data);

        var meta = document.createElement('div');
        meta.className = 'mq-meta';

        var g = document.createElement('div');
        g.className = 'mq-genres';
        g.textContent = genres;
        if (!genres) g.style.display = 'none';
        meta.appendChild(g);

        var t = document.createElement('div');
        t.className = 'mq-title';
        t.textContent = title;
        meta.appendChild(t);

        var bottom = document.createElement('div');
        bottom.className = 'mq-bottom';

        var left = document.createElement('div');
        left.className = 'mq-left';

        if (vote > 0) {
            var r = document.createElement('span');
            r.className = 'mq-rating ' + (vote >= 6.5 ? '' : (vote >= 5 ? 'r-mid' : 'r-low'));
            r.innerHTML = ICON_STAR;
            var rt = document.createElement('span');
            rt.textContent = vote.toFixed(1);
            r.appendChild(rt);
            left.appendChild(r);
        }

        var q = document.createElement('span');
        q.className = 'mq-q';
        left.appendChild(q);

        bottom.appendChild(left);

        var y = document.createElement('span');
        y.className = 'mq-year';
        y.textContent = year;
        bottom.appendChild(y);

        meta.appendChild(bottom);
        view.appendChild(meta);
        el.classList.add('card--mq');
    }

    function setQuality(el, quality) {
        var q = el.querySelector('.mq-q');
        if (!q) return;
        if (!quality) {
            q.className = 'mq-q';
            q.innerHTML = '';
            return;
        }
        q.className = 'mq-q mq-q-on q-' + String(quality).toLowerCase();
        q.innerHTML = ICON_GAUGE;
        var txt = document.createElement('span');
        txt.textContent = quality;
        q.appendChild(txt);
    }

    function processCard(el, attempt) {
        var data = getCardData(el);
        if (!data) {
            // card_data ещё не проставлен — пробуем позже
            if ((attempt || 0) < 8) {
                setTimeout(function () { processCard(el, (attempt || 0) + 1); }, 300);
            }
            return;
        }

        // оверлей строим один раз
        if (!el.classList.contains('card--mq')) buildOverlay(el, data);

        // качество
        if (!opt('maxsm_mq_quality')) return;
        if (el.getAttribute('data-quality-added')) return;

        var type = getCardType(data);
        if (type === 'tv' && !opt('maxsm_mq_quality_tv')) return;

        el.setAttribute('data-quality-added', 'true'); // ставим сразу, чтобы не слать дубль-запросы

        var card = {
            id: data.id || '',
            title: data.title || data.name || '',
            original_title: data.original_title || data.original_name || '',
            release_date: data.release_date || data.first_air_date || ''
        };
        var cacheKey = type + '_' + card.id;

        var cached = readCache(cacheKey);
        if (cached) {
            setQuality(el, cached.quality);
            return;
        }

        enqueue(function (done) {
            getQuality(card, card.id, function (quality, failed) {
                if (failed) {
                    // сеть/429: не кешируем "пусто", даём карточке шанс повторить позже
                    el.removeAttribute('data-quality-added');
                    done(true);
                    return;
                }
                writeCache(cacheKey, quality);
                setQuality(el, quality);
                done(false);
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

        addStyle();
        try { addSettings(); } catch (e) { console.error('MAXSM-RATINGS settings error', e); }
        applyBodyClasses();

        observer.observe(document.body, { childList: true, subtree: true });
        updateCards(document.querySelectorAll('.card'));
        log('plugin started');
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
