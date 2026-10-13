(function () {
    'use strict';

    // SURS_QUALITY — отображение лучшего качества релиза в карточке фильма Lampa.
    // Совместимый стиль: ES5, без внешних библиотек кроме штатных Lampa и jQuery.
    if (window.sursQualityPlugin) return;
    window.sursQualityPlugin = true;

    var PREFIX = '[SURS_QUALITY] ';
    var CACHE_KEY = 'surs_quality_cache_v2';
    var CACHE_TTL = 72 * 60 * 60 * 1000;
    var REQUEST_TIMEOUT = 7000;
    var ENABLE_LOGGING = true;
    var activeRequests = {};

    function log(message) {
        if (ENABLE_LOGGING && window.console && console.log) console.log(PREFIX + message);
    }

    function now() {
        return (window.performance && typeof window.performance.now === 'function') ? window.performance.now() : Date.now();
    }

    function elapsed(start) {
        return Math.round((now() - start) * 100) / 100;
    }

    function getJacredHost() {
        var host = '';
        try {
            host = Lampa.Storage.get('jac.red') || 'jac.red';
        } catch (e) {
            host = 'jac.red';
        }
        host = String(host).replace(/^https?:\/\//i, '').replace(/\/+$/, '').trim();
        return host;
    }

    function getCache() {
        try {
            var cache = Lampa.Storage.get(CACHE_KEY);
            return cache && typeof cache === 'object' ? cache : {};
        } catch (e) {
            return {};
        }
    }

    function readCache(key) {
        var cache = getCache();
        var item = cache[key];
        if (!item || !item.timestamp || Date.now() - item.timestamp >= CACHE_TTL) return null;
        return item;
    }

    function writeCache(key, result) {
        var cache = getCache();
        var stamp = Date.now();
        Object.keys(cache).forEach(function (cacheKey) {
            if (!cache[cacheKey] || !cache[cacheKey].timestamp || stamp - cache[cacheKey].timestamp >= CACHE_TTL) {
                delete cache[cacheKey];
            }
        });
        cache[key] = {
            quality: result.quality || null,
            isCamrip: !!result.isCamrip,
            timestamp: stamp
        };
        try {
            Lampa.Storage.set(CACHE_KEY, cache);
        } catch (e) {
            log('Не удалось сохранить кэш: ' + e.message);
        }
    }

    function qualityLabel(value) {
        var quality = Number(value);
        if (!isFinite(quality) || quality <= 0) return null;
        if (quality >= 2160) return '4K';
        if (quality >= 1080) return 'FHD';
        if (quality >= 720) return 'HD';
        return 'SD';
    }

    function isCamripTitle(title) {
        return /(^|[^a-zа-яё0-9])(ts|telesync|camrip|cam|экранка|звук\s+с\s+ts)([^a-zа-яё0-9]|$)/i.test(String(title || ''));
    }

    function buildSearchUrl(title, year, exact) {
        var url = 'https://' + getJacredHost() + '/api/v1.0/torrents?search=' + encodeURIComponent(title) + '&year=' + encodeURIComponent(year);
        if (exact) url += '&exact=true';
        return url;
    }

    // Запрос с собственным тайм-аутом на каждый вызов; нет общего AbortController,
    // поэтому тайм-аут одного запроса не отменяет следующие попытки.
    function requestText(url, callback) {
        var completed = false;
        var timer = setTimeout(function () {
            finish(new Error('Тайм-аут запроса (' + REQUEST_TIMEOUT + ' мс)'));
        }, REQUEST_TIMEOUT);

        function finish(error, data) {
            if (completed) return;
            completed = true;
            clearTimeout(timer);
            callback(error, data);
        }

        if (typeof window.fetch !== 'function') {
            finish(new Error('В этой версии WebView отсутствует fetch'));
            return;
        }

        window.fetch(url, { method: 'GET', credentials: 'omit' })
            .then(function (response) {
                if (!response.ok) throw new Error('HTTP ' + response.status);
                return response.text();
            })
            .then(function (text) { finish(null, text); })
            .catch(function (error) { finish(error); });
    }

    function findBestTorrent(torrents) {
        if (!Array.isArray(torrents)) return null;
        var best = null;
        var bestQuality = -1;
        var bestCamrip = null;
        var bestCamripQuality = -1;

        torrents.forEach(function (torrent) {
            if (!torrent) return;
            var title = String(torrent.title || '');
            var quality = Number(torrent.quality);
            if (!isFinite(quality) || quality <= 0) return;
            var camrip = isCamripTitle(title);

            if (camrip) {
                if (quality > bestCamripQuality) {
                    bestCamripQuality = quality;
                    bestCamrip = torrent;
                }
            } else if (quality > bestQuality) {
                bestQuality = quality;
                best = torrent;
            }
        });

        // Обычный релиз всегда предпочтительнее экранки. Экранка показывается,
        // только если JacRed не вернул ни одного обычного релиза с качеством.
        if (best) return { quality: qualityLabel(best.quality), isCamrip: false, title: best.title || '' };
        if (bestCamrip) return { quality: qualityLabel(bestCamrip.quality), isCamrip: true, title: bestCamrip.title || '' };
        return null;
    }

    function searchJacred(title, year, exact, callback) {
        var url = buildSearchUrl(title, year, exact);
        var start = now();
        log('Запрос JacRed: ' + title + ' (' + year + '), exact=' + exact);
        requestText(url, function (error, body) {
            if (error) {
                log('Ошибка запроса JacRed: ' + error.message + '; проверьте адрес сервера и CORS');
                callback(null);
                return;
            }
            try {
                var data = JSON.parse(body);
                var result = findBestTorrent(data);
                log('Ответ JacRed обработан за ' + elapsed(start) + ' мс; результат: ' + (result ? result.quality : 'не найден'));
                callback(result);
            } catch (e) {
                log('Ошибка разбора ответа JacRed: ' + e.message);
                callback(null);
            }
        });
    }

    function getBestRelease(card, callback) {
        var date = String(card.release_date || card.first_air_date || '');
        var year = date.length >= 4 ? date.substring(0, 4) : '';
        if (!year || !/^\d{4}$/.test(year)) {
            callback(null);
            return;
        }

        var titles = [];
        var original = String(card.original_title || card.original_name || '').trim();
        var localized = String(card.title || card.name || '').trim();
        if (original) titles.push({ title: original, exact: true });
        if (localized && localized.toLowerCase() !== original.toLowerCase()) titles.push({ title: localized, exact: true });
        if (original) titles.push({ title: original, exact: false });
        if (localized && localized.toLowerCase() !== original.toLowerCase()) titles.push({ title: localized, exact: false });

        function next(index) {
            if (index >= titles.length) {
                callback(null);
                return;
            }
            searchJacred(titles[index].title, year, titles[index].exact, function (result) {
                if (result && result.quality) callback(result);
                else next(index + 1);
            });
        }
        next(0);
    }

    function getRender(event) {
        try {
            if (event && event.object && event.object.activity && typeof event.object.activity.render === 'function') {
                return event.object.activity.render();
            }
        } catch (e) {
            log('Не удалось получить render карточки: ' + e.message);
        }
        return null;
    }

    function clearBadge(render) {
        if (render && window.$) $('.full-start__status.surs_quality', render).remove();
    }

    function showBadge(render, quality, isCamrip) {
        if (!render || !window.$) return;
        var $render = $(render);
        var $line = $render.find('.full-start-new__rate-line').first();
        if (!$line.length) $line = $render.find('.full-start__rate-line').first();
        if (!$line.length) {
            log('Не найден контейнер рейтингов в карточке; возможно, изменена вёрстка Lampa');
            return;
        }

        var $badge = $render.find('.full-start__status.surs_quality').first();
        if (!$badge.length) {
            $badge = $('<div></div>').addClass('full-start__status surs_quality');
            $line.append($badge);
        }
        $badge.text(quality).css('opacity', '1').toggleClass('camrip', !!isCamrip);
    }

    function processCard(card, render) {
        if (!card || !render) return;
        var type = card.media_type || card.type;
        if (type === 'tv' || type === 'person') {
            clearBadge(render);
            return;
        }

        var id = card.id || card.imdb_id || card.title || card.name;
        if (!id) return;
        var key = 'movie_' + String(id);
        var cached = readCache(key);
        if (cached) {
            if (cached.quality) showBadge(render, cached.quality, cached.isCamrip);
            else clearBadge(render);
            return;
        }

        clearBadge(render);
        showBadge(render, '…', false);

        // Отмечаем поколение запроса: поздний ответ от предыдущей карточки игнорируется.
        var requestId = String(Date.now()) + '_' + Math.random().toString(36).slice(2);
        activeRequests[key] = requestId;
        getBestRelease(card, function (result) {
            if (activeRequests[key] !== requestId) return;
            delete activeRequests[key];
            if (result && result.quality) {
                writeCache(key, result);
                showBadge(render, result.quality, result.isCamrip);
                log('Карточка ' + id + ': найдено ' + result.quality + (result.isCamrip ? ' (экранка)' : ''));
            } else {
                writeCache(key, { quality: null, isCamrip: false });
                clearBadge(render);
                log('Карточка ' + id + ': качество не найдено');
            }
        });
    }


    // Главный экран и списки: бейдж качества прямо на постере.
    var gridPending = {};

    function getCardElement(component) {
        if (!component) return null;
        var element = component.html || component.card || component.render;
        if (typeof element === 'function') {
            try { element = element.call(component, true); } catch (e) { element = null; }
        }
        if (element && element.jquery) element = element[0];
        return element && element.nodeType === 1 ? element : null;
    }

    function renderGridBadge(element, quality, isCamrip) {
        if (!element || !window.$) return;
        var $card = $(element);
        var $view = $card.find('.card__view').first();
        if (!$view.length) $view = $card;
        var $badge = $view.find('.surs-quality-card').first();

        if (!quality) {
            $badge.remove();
            return;
        }

        if (!$badge.length) {
            $badge = $('<div class="surs-quality-card"></div>');
            var $icons = $view.find('.card__icons').first();
            if ($icons.length) $icons.after($badge);
            else $view.append($badge);
        }

        $badge.text(quality);
        $badge.toggleClass('camrip', !!isCamrip);
    }

    function processGridCard(component) {
        if (!component || !component.data) return;

        var card = component.data;
        var element = getCardElement(component);
        if (!element) return;

        // На главном экране показываем качество только для фильмов, не сериалов и персон.
        var type = card.media_type || card.type;
        if (type === 'tv' || type === 'person' || card.first_air_date && !card.release_date && !card.original_title) {
            renderGridBadge(element, null, false);
            return;
        }

        var id = card.id || card.imdb_id || card.title || card.name;
        if (!id) return;

        var key = 'movie_' + String(id);
        var cached = readCache(key);
        if (cached) {
            renderGridBadge(element, cached.quality, cached.isCamrip);
            return;
        }

        renderGridBadge(element, '…', false);

        // Если несколько одинаковых карточек видны одновременно, выполняем один запрос.
        if (gridPending[key]) {
            gridPending[key].push({ element: element });
            return;
        }

        gridPending[key] = [{ element: element }];

        getBestRelease(card, function (result) {
            var subscribers = gridPending[key] || [];
            delete gridPending[key];

            var cacheValue = result && result.quality
                ? result
                : { quality: null, isCamrip: false };

            writeCache(key, cacheValue);

            subscribers.forEach(function (subscriber) {
                renderGridBadge(subscriber.element, cacheValue.quality, cacheValue.isCamrip);
            });

            log('Главная карточка ' + id + ': ' + (cacheValue.quality || 'качество не найдено'));
        });
    }

    function installGridHook() {
        try {
            if (!Lampa.Maker || typeof Lampa.Maker.map !== 'function') {
                log('Lampa.Maker.map недоступен; бейджи на главном экране не подключены');
                return;
            }

            var maker = Lampa.Maker.map('Card');
            if (!maker || !maker.Card || typeof maker.Card.onVisible !== 'function') {
                log('Обработчик Card.onVisible недоступен; бейджи на главном экране не подключены');
                return;
            }

            if (maker.Card.__sursQualityHooked) return;

            var originalOnVisible = maker.Card.onVisible;
            maker.Card.onVisible = function () {
                var result = originalOnVisible.apply(this, arguments);
                try { processGridCard(this); }
                catch (e) { log('Ошибка обработки карточки главного экрана: ' + e.message); }
                return result;
            };
            maker.Card.__sursQualityHooked = true;
            log('Подключено отображение качества на карточках главного экрана');
        } catch (e) {
            log('Не удалось подключить карточки главного экрана: ' + e.message);
        }
    }

    function installStyles() {
        if (document.getElementById('surs-quality-style')) return;
        var style = document.createElement('style');
        style.id = 'surs-quality-style';
        style.textContent = [
            '.full-start__status.surs_quality.camrip{color:#ff3333!important;}',
            '.surs-quality-card{position:absolute;z-index:8;top:.45em;left:.45em;padding:.22em .45em;border-radius:.3em;background:rgba(20,150,220,.95);color:#fff;font-size:.85em;font-weight:700;line-height:1.25;box-shadow:0 1px 4px rgba(0,0,0,.45);pointer-events:none;}',
            '.surs-quality-card.camrip{background:rgba(220,35,35,.97);color:#fff;}',
            '.card__view{position:relative;}'
        ].join('\\n');
        (document.head || document.documentElement).appendChild(style);
    }

    function startPlugin() {
        if (!window.Lampa || !Lampa.Listener || typeof Lampa.Listener.follow !== 'function') {
            log('Lampa API ещё не готов; ожидаем событие app/ready');
            return false;
        }
        installStyles();
        installGridHook();
        Lampa.Listener.follow('full', function (event) {
            if (!event || event.type !== 'complite') return;
            var render = getRender(event);
            var card = event.data && (event.data.movie || event.data.card || event.data);
            if (!card) {
                log('Событие full/complite не содержит данных карточки');
                return;
            }
            processCard(card, render);
        });
        log('Плагин загружен');
        return true;
    }

    if (!startPlugin() && window.Lampa && Lampa.Listener && typeof Lampa.Listener.follow === 'function') {
        Lampa.Listener.follow('app', function (event) {
            if (event && event.type === 'ready') startPlugin();
        });
    }
})();
