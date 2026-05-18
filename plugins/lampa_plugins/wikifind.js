(function () {
    'use strict';

    function WikiSmartPlugin() {
        var _this = this;
        var ICON_WIKI = 'https://yarikrazor-star.github.io/lmp/wiki.svg';
        var cachedResults = null;
        var isFallbackUsed = false;
        var searchPromise = null;
        var isOpened = false;

        this.init = function () {
            Lampa.Listener.follow('full', function (e) {
                if (e.type === 'complite') {
                    _this.cleanup();
                    setTimeout(function() {
                        try {
                            _this.render(e.data, e.object.activity.render());
                        } catch (err) {}
                    }, 200);
                }
            });
        };

        this.cleanup = function() {
            $('.lampa-wiki-smart-btn').remove();
            cachedResults = null;
            isFallbackUsed = false;
            searchPromise = null;
            isOpened = false;
        };

        this.render = function (data, html) {
            var _this = this;
            var container = $(html);
            if (container.find('.lampa-wiki-smart-btn').length) return;

            var button = $('<div class="full-start__button selector lampa-wiki-smart-btn">' +
                                '<img src="' + ICON_WIKI + '">' +
                                '<span>Вікі</span>' +
                            '</div>');

            var style = '<style>' +
                '.lampa-wiki-smart-btn { display: flex !important; align-items: center; justify-content: center; } ' +
                '.lampa-wiki-smart-btn img { width: 1.6em; height: 1.6em; object-fit: contain; } ' +
                '.lampa-wiki-smart-btn span { max-width: 0; opacity: 0; overflow: hidden; white-space: nowrap; transition: all 0.25s ease-in-out; margin-left: 0; }' +
                '.lampa-wiki-smart-btn:hover span, .lampa-wiki-smart-btn.focus span { max-width: 5em; opacity: 1; margin-left: 8px; }' +
                
                '@keyframes wikiAppear { 0% { opacity: 0; transform: translateY(30px); } 100% { opacity: 1; transform: translateY(0); } }' +
                
                '.wiki-smart-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.85); z-index: 100000; display: flex; align-items: center; justify-content: center; padding: 20px; box-sizing: border-box; transition: opacity 0.3s; }' +
                '.wiki-smart-modal { width: 96vw; height: 94vh; max-width: 100%; max-height: 100%; background: #1a222c; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 16px; box-shadow: 0 14px 36px rgba(0,0,0,0.8); display: flex; flex-direction: column; overflow: hidden; animation: wikiAppear 0.4s ease-out; }' +
                
                '@supports (backdrop-filter: blur(20px)) or (-webkit-backdrop-filter: blur(20px)) { ' +
                    '.wiki-smart-overlay { background: rgba(0, 0, 0, 0.4); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); } ' +
                    '.wiki-smart-modal { background: rgba(22, 30, 38, 0.55); backdrop-filter: blur(24px) saturate(145%); -webkit-backdrop-filter: blur(24px) saturate(145%); border-radius: 30px; } ' +
                '}' +
                
                '.wiki-smart-content { flex: 1; overflow-y: auto; padding: 30px 5%; color: rgba(255, 255, 255, 0.95); line-height: 1.6; font-size: 1.4em; -webkit-overflow-scrolling: touch; word-wrap: break-word; }' +
                '.wiki-smart-content::-webkit-scrollbar { width: 8px; display: block; }' +
                '.wiki-smart-content::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.05); border-radius: 10px; }' +
                '.wiki-smart-content::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.2); border-radius: 10px; }' +
                '.wiki-smart-content::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.4); }' +
                '.wiki-smart-loader { display: flex; justify-content: center; align-items: center; height: 100%; font-size: 1.3em; color: #888; }' +
                
                '.wiki-smart-content h1, .wiki-smart-content h2, .wiki-smart-content h3 { color: #fff; border-bottom: 1px solid rgba(255, 255, 255, 0.1); margin-top: 1em; padding-bottom: 0.3em; font-weight: normal; }' +
                '.wiki-smart-content p { margin-bottom: 0.8em; text-align: justify; }' +
                '.wiki-smart-content a { color: #d0d0d0; text-decoration: none; pointer-events: none; border-bottom: 1px dashed rgba(255, 255, 255, 0.3); cursor: default; }' +
                
                '.wiki-smart-extracted-table { margin: 1.2em 0; padding: 15px 20px; background: rgba(255, 255, 255, 0.05); border-left: 4px solid #fff; border-radius: 0 12px 12px 0; color: #bbb; font-size: 0.9em; line-height: 1.7; }' +
                '.wiki-smart-extracted-img { max-width: 100%; width: 350px; height: auto; display: block; margin: 20px auto; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.6); }' +
                '.wiki-smart-content .mw-empty-elt, .wiki-smart-content .hatnote, .wiki-smart-content .ambox, .wiki-smart-content .navbox, .wiki-smart-content .reflist, .wiki-smart-content .reference, .wiki-smart-content .noprint { display: none !important; }' +

                '.wiki-smart-footer { display: flex; align-items: center; justify-content: space-between; padding: 16px 24px; background: rgba(17, 23, 29, 0.98); border-top: 1px solid rgba(255, 255, 255, 0.06); flex-shrink: 0; box-sizing: border-box; }' +
                '.wiki-smart-leftside { display: flex; align-items: center; min-width: 0; flex: 1; }' +
                '.wiki-smart-rightside { display: flex; align-items: center; flex-shrink: 0; }' +
                
                '.wiki-smart-arrow { width: 50px; height: 50px; border-radius: 14px; display: flex; align-items: center; justify-content: center; background: rgba(255, 255, 255, 0.08); color: #8c8f9a; cursor: pointer; transition: all 0.25s; border: 1px solid rgba(255, 255, 255, 0.1); font-size: 1.4em; user-select: none; margin-right: 15px; }' +
                '.wiki-smart-arrow.arrow-right { margin-right: 15px; }' +
                '.wiki-smart-arrow.active { color: #fff; border-color: rgba(255, 255, 255, 0.22); background: rgba(255, 255, 255, 0.12); }' +
                '.wiki-smart-arrow.active:active { transform: scale(0.9); }' +
                
                '.wiki-smart-meta { min-width: 0; overflow: hidden; flex: 1; display: flex; flex-direction: column; justify-content: center; }' +
                '.wiki-smart-type { font-size: 0.9em; color: rgba(255, 255, 255, 0.6); text-transform: capitalize; margin-bottom: 2px; display: flex; align-items: center; }' +
                '.wiki-smart-title { font-size: 1.6em; font-weight: bold; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.1; }' +
                '.wiki-smart-warning { font-size: 0.9em; color: #ffbd2e; margin-top: 4px; display: flex; align-items: center; }' +
                '.wiki-smart-warning span { margin-right: 6px; }' +
                '.wiki-smart-counter { font-weight: bold; color: rgba(255, 255, 255, 0.75); min-width: 6ch; text-align: right; font-size: 1.3em; margin-right: 15px; }' +
                
                '.wiki-smart-close { width: 50px; height: 50px; border-radius: 14px; display: flex; align-items: center; justify-content: center; background: rgba(255, 255, 255, 0.1); color: #fff; cursor: pointer; transition: all 0.3s; border: 1px solid rgba(255, 255, 255, 0.14); font-size: 1.4em; }' +
                '.wiki-smart-close.focus, .wiki-smart-close:active, .wiki-smart-close:hover { transform: scale(0.95); background: rgba(255, 255, 255, 0.26); border-color: #fff; box-shadow: 0 0 20px rgba(255, 255, 255, 0.4); outline: none; }' +
                '</style>';

            if (!$('style#wiki-smart-style').length) $('head').append('<style id="wiki-smart-style">' + style + '</style>');

            var buttons_container = container.find('.full-start-new__buttons, .full-start__buttons');
            buttons_container.append(button);

            if (Lampa.Controller.enabled().name === 'full_start') {
                Lampa.Controller.toggle('full_start');
            }

            _this.startFullSearch(data.movie);

            button.on('hover:enter click', function(e) {
                // Блокуємо спливання подій, щоб ТВ не робив подвійного кліку
                e.preventDefault();
                e.stopPropagation();
                if (!isOpened) _this.handleButtonClick(data.movie);
            });
        };

        this.handleButtonClick = function(movie) {
            var _this = this;
            if (!movie) return;
            isOpened = true;

            if (cachedResults && cachedResults.length > 0) {
                _this.openViewer(cachedResults, isFallbackUsed);
            } else if (searchPromise) {
                Lampa.Noty.show('Пошук у Wikipedia...');
                searchPromise.done(function(results, isFallback) {
                    if (results.length) {
                        _this.openViewer(results, isFallback);
                    } else {
                        Lampa.Noty.show('Нічого не знайдено'); isOpened = false;
                    }
                }).fail(function() {
                    Lampa.Noty.show('Помилка завантаження даних'); isOpened = false;
                });
            } else {
                _this.startFullSearch(movie).done(function(results, isFallback) {
                     if (results.length) {
                         _this.openViewer(results, isFallback);
                     } else {
                         Lampa.Noty.show('Нічого не знайдено'); isOpened = false;
                     }
                }).fail(function() {
                     Lampa.Noty.show('Нічого не знайдено'); isOpened = false;
                });
            }
        };

        this.startFullSearch = function(movie) {
            var _this = this;
            var def = $.Deferred();

            this.searchWikidata(movie).done(function(results) {
                if (results && results.length > 0) {
                    cachedResults = results;
                    isFallbackUsed = false;
                    def.resolve(results, false);
                } else {
                    _this.searchTextFallback(movie).done(function(fallbackResults) {
                        cachedResults = fallbackResults;
                        isFallbackUsed = true;
                        def.resolve(fallbackResults, true);
                    }).fail(function() { def.reject(); });
                }
            }).fail(function() {
                _this.searchTextFallback(movie).done(function(fallbackResults) {
                    cachedResults = fallbackResults;
                    isFallbackUsed = true;
                    def.resolve(fallbackResults, true);
                }).fail(function() { def.reject(); });
            });

            searchPromise = def.promise();
            return searchPromise;
        };

        this.searchWikidata = function (movie) {
            var def = $.Deferred();
            if (!movie || !movie.id) return def.reject().promise();
            
            var method = (movie.original_name || movie.name) ? 'tv' : 'movie';
            var mainType = method === 'tv' ? 'Серіал' : 'Фільм';
            var tmdbKey = Lampa.TMDB.key();

            $.ajax({
                url: Lampa.TMDB.api(method + '/' + movie.id + '/external_ids?api_key=' + tmdbKey),
                dataType: 'json',
                success: function(extResp) {
                    if (!extResp || !extResp.wikidata_id) return def.reject();
                    var mainQId = extResp.wikidata_id;

                    $.ajax({
                        url: 'https://www.wikidata.org/w/api.php?action=wbgetentities&ids=' + mainQId + '&props=claims&format=json&origin=*',
                        dataType: 'json',
                        success: function(claimResp) {
                            var claims = claimResp.entities[mainQId].claims || {};
                            var targets =[];

                            var extractQIds = function(prop, typeName, limit) {
                                if (claims[prop]) {
                                    var items = claims[prop];
                                    if (limit) items = items.slice(0, limit);
                                    items.forEach(function(item) {
                                        if (item.mainsnak && item.mainsnak.datavalue && item.mainsnak.datavalue.value && item.mainsnak.datavalue.value.id) {
                                            targets.push({ qId: item.mainsnak.datavalue.value.id, type: typeName });
                                        }
                                    });
                                }
                            };

                            targets.push({ qId: mainQId, type: mainType });
                            extractQIds('P144', 'Основано на', 1);
                            extractQIds('P155', 'Передісторія', 1);
                            extractQIds('P156', 'Продовження', 1);
                            extractQIds('P57', 'Режисер', 2);
                            extractQIds('P161', 'Актор', 7);

                            var qIdList = targets.map(function(t) { return t.qId; });
                            var uniqueQIds = qIdList.filter(function(item, pos) { return qIdList.indexOf(item) == pos; });

                            $.ajax({
                                url: 'https://www.wikidata.org/w/api.php?action=wbgetentities&ids=' + uniqueQIds.join('|') + '&props=sitelinks&format=json&origin=*',
                                dataType: 'json',
                                success: function(siteResp) {
                                    var finalResults =[];
                                    var entities = siteResp.entities || {};

                                    targets.forEach(function(t) {
                                        var entity = entities[t.qId];
                                        if (entity && entity.sitelinks) {
                                            if (entity.sitelinks.ukwiki) {
                                                finalResults.push({ type: t.type, title: entity.sitelinks.ukwiki.title, lang: 'ua', langIcon: '🇺🇦' });
                                            } else if (entity.sitelinks.enwiki) {
                                                finalResults.push({ type: t.type, title: entity.sitelinks.enwiki.title, lang: 'en', langIcon: '🇺🇸' });
                                            }
                                        }
                                    });

                                    var uniqueResults =[];
                                    var seenTitles = new Set();
                                    finalResults.forEach(function(item) {
                                        if (!seenTitles.has(item.title)) {
                                            seenTitles.add(item.title);
                                            uniqueResults.push(item);
                                        }
                                    });

                                    def.resolve(uniqueResults);
                                },
                                error: function() { def.reject(); }
                            });
                        },
                        error: function() { def.reject(); }
                    });
                },
                error: function() { def.reject(); }
            });
            return def.promise();
        };

        this.searchTextFallback = function(movie) {
            var def = $.Deferred();
            var year = (movie.release_date || movie.first_air_date || '').substring(0, 4);
            var titleUA = (movie.title || movie.name || '').replace(/[^\w\sа-яієїґ]/gi, '');
            var titleEN = (movie.original_title || movie.original_name || '').replace(/[^\w\s]/gi, '');
            var isTV = !!(movie.first_air_date || movie.number_of_seasons);
            
            var p1 = $.ajax({ url: 'https://uk.wikipedia.org/w/api.php', data: { action: 'query', list: 'search', srsearch: titleUA + ' ' + year + (isTV ? ' серіал' : ' фільм'), srlimit: 3, format: 'json', origin: '*' }, dataType: 'json' });
            var p2 = $.ajax({ url: 'https://en.wikipedia.org/w/api.php', data: { action: 'query', list: 'search', srsearch: titleEN + ' ' + year + (isTV ? ' series' : ' film'), srlimit: 3, format: 'json', origin: '*' }, dataType: 'json' });

            $.when(p1, p2).done(function (r1, r2) {
                var results = [];
                if (r1[0].query && r1[0].query.search) {
                    r1[0].query.search.forEach(function(i) {
                        results.push({ type: 'Знайдено (UA)', title: i.title, lang: 'ua', langIcon: '🇺🇦' });
                    });
                }
                if (r2[0].query && r2[0].query.search) {
                    r2[0].query.search.forEach(function(i) {
                        results.push({ type: 'Знайдено (EN)', title: i.title, lang: 'en', langIcon: '🇺🇸' });
                    });
                }
                
                if (results.length > 0) def.resolve(results);
                else def.reject();
            }).fail(function() { def.reject(); });
            
            return def.promise();
        };

        this.openViewer = function(articles, isFallback) {
            var prev_controller = Lampa.Controller.enabled().name;
            var currentIndex = 0;
            var isClosing = false; // Захист від подвійного закриття

            var warningHtml = isFallback 
                ? '<div class="wiki-smart-warning"><span>⚠️</span> Альтернативні статті:</div>' 
                : '';

            var viewer = $('<div class="wiki-smart-overlay">' +
                                '<div class="wiki-smart-modal">' +
                                    '<div class="wiki-smart-content"></div>' +
                                    '<div class="wiki-smart-footer">' +
                                        '<div class="wiki-smart-leftside">' +
                                            '<div class="wiki-smart-arrow arrow-left">&#9664;</div>' +
                                            '<div class="wiki-smart-meta">' +
                                                '<div class="wiki-smart-type"></div>' +
                                                '<div class="wiki-smart-title"></div>' +
                                                warningHtml +
                                            '</div>' +
                                        '</div>' +
                                        '<div class="wiki-smart-rightside">' +
                                            '<div class="wiki-smart-counter"></div>' +
                                            '<div class="wiki-smart-arrow arrow-right">&#9654;</div>' +
                                            '<div class="wiki-smart-close selector">&#10005;</div>' +
                                        '</div>' +
                                    '</div>' +
                                '</div>' +
                            '</div>');

            $('body').append(viewer);

            var closeViewer = function() {
                if (isClosing) return; // Якщо вже закриваємо, ігноруємо інші кліки
                isClosing = true;
                
                viewer.remove();
                isOpened = false;
                Lampa.Controller.toggle(prev_controller);
            };

            viewer.find('.wiki-smart-close').on('hover:enter click', function(e) {
                // Захищаємо від помилкової маршрутизації та подвійних кліків пульта
                e.preventDefault();
                e.stopPropagation();
                closeViewer();
            });

            var goLeft = function() {
                if (currentIndex > 0) {
                    currentIndex--;
                    updateUI();
                }
            };

            var goRight = function() {
                if (currentIndex < articles.length - 1) {
                    currentIndex++;
                    updateUI();
                }
            };

            viewer.find('.arrow-left').on('click', goLeft);
            viewer.find('.arrow-right').on('click', goRight);

            var updateUI = function() {
                var item = articles[currentIndex];
                
                viewer.find('.wiki-smart-type').html(item.type + '&nbsp;&nbsp;' + item.langIcon);
                viewer.find('.wiki-smart-title').text(item.title);
                viewer.find('.wiki-smart-counter').text((currentIndex + 1) + ' / ' + articles.length);
                
                viewer.find('.arrow-left').toggleClass('active', currentIndex > 0);
                viewer.find('.arrow-right').toggleClass('active', currentIndex < articles.length - 1);

                var contentDiv = viewer.find('.wiki-smart-content');
                contentDiv.scrollTop(0);
                contentDiv.html('<div class="wiki-smart-loader">Завантаження статті...</div>');

                var apiUrl = 'https://' + (item.lang === 'ua' ? 'uk' : 'en') + '.wikipedia.org/api/rest_v1/page/html/' + encodeURIComponent(item.title);

                $.ajax({
                    url: apiUrl,
                    timeout: 10000,
                    success: function(htmlContent) {
                        htmlContent = htmlContent.replace(/<base[^>]*>/gi, '');
                        htmlContent = htmlContent.replace(/<meta[^>]*>/gi, '');
                        htmlContent = htmlContent.replace(/src="\/\//g, 'src="https://');
                        htmlContent = htmlContent.replace(/style="[^"]*"/g, ""); 
                        htmlContent = htmlContent.replace(/bgcolor="[^"]*"/g, "");
                        
                        var tempDiv = $('<div>').html(htmlContent);
                        
                        // ФІКС ПОМИЛКИ 404: Фізично видаляємо ВСІ посилання зі статті, 
                        // щоб ТБ не міг випадково на них перейти та видати 404 помилку.
                        tempDiv.find('a').removeAttr('href target');

                        tempDiv.find('script, style, link, title, base, meta, .mw-empty-elt, .hatnote, .ambox, .navbox, .reflist, .reference, .noprint, .infobox-header').remove();

                        tempDiv.find('table').each(function() {
                            var table = $(this);
                            var contentHtml = '';

                            table.find('img').each(function() {
                                var img = $(this);
                                if (img.attr('width') > 50 || img.attr('height') > 50 || !img.attr('width')) {
                                    contentHtml += '<img src="' + img.attr('src') + '" class="wiki-smart-extracted-img">';
                                }
                            });

                            var textBlocks =[];
                            table.find('tr').each(function() {
                                var rowText =[];
                                $(this).children('th, td').each(function() {
                                    var cellText = $(this).text().replace(/\s+/g, ' ').trim();
                                    if (cellText && cellText !== '-' && cellText.length > 0) {
                                        rowText.push(cellText);
                                    }
                                });
                                
                                if (rowText.length > 0) {
                                    textBlocks.push(rowText.join(' — '));
                                }
                            });

                            if (textBlocks.length > 0) {
                                contentHtml += '<div class="wiki-smart-extracted-table">' + textBlocks.join('<br>') + '</div>';
                            }

                            table.replaceWith(contentHtml);
                        });

                        tempDiv.find('p, h1, h2, h3, h4, div').each(function() {
                            if ($.trim($(this).text()) === '' && $(this).find('img').length === 0 && !$(this).hasClass('wiki-smart-extracted-table')) {
                                $(this).remove();
                            }
                        });

                        contentDiv.html(tempDiv.html());
                    },
                    error: function() {
                        contentDiv.html('<div class="wiki-smart-loader" style="color:#d9534f;">Помилка завантаження статті.</div>');
                    }
                });
            };

            Lampa.Controller.add('wiki_smart_viewer', {
                toggle: function() {
                    Lampa.Controller.collectionSet(viewer);
                    Lampa.Controller.collectionFocus(viewer.find('.wiki-smart-close')[0], viewer);
                },
                up: function() { 
                    viewer.find('.wiki-smart-content').scrollTop(viewer.find('.wiki-smart-content').scrollTop() - 300); 
                },
                down: function() { 
                    viewer.find('.wiki-smart-content').scrollTop(viewer.find('.wiki-smart-content').scrollTop() + 300); 
                },
                left: goLeft,
                right: goRight,
                back: closeViewer
            });

            Lampa.Controller.toggle('wiki_smart_viewer');
            updateUI();
        };
    }

    if (window.Lampa) new WikiSmartPlugin().init();
})();