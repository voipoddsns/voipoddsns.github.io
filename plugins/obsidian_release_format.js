(function () {
  'use strict';

  if (window.obsidian_plugin) return;
  window.obsidian_plugin = true;

  // ======================
  // Конфиг
  // ======================
  const CONFIG = {
    apn: [''],
    api: [
      { url: 'https://api.apbugall.org', token: '8da1c9beda9545174264dc9f63a77d' },
      { url: 'https://upn.stull.xyz', token: 'd317441359e505c343c2063edc97e7' }
    ],
    qualityCache: { key: 'obsidian_quality_cache', size: 1000, time: 864e5 }, // 24ч
    posterCache:  { key: 'obsidian_poster_cache',  size: 2000, time: 6048e5 }, // 7д
    queue: { maxParallel: 12, maxSize: 100 },
    ui: {
      qualityEnabled: true,
      qualityIcon: true,
      qualityColor: true,
      ratingEnabled: true,
      ratingIcon: true,
      ratingColor: true,
      showReleaseYear: true,
      showEpisodeNumber: true,
      showGenres: true,
      replacePoster: true,
      noir: false,
      noirBadges: false
    }
  };

  // ======================
  // Утилиты
  // ======================
  function random(arr) {
    return arr && arr.length ? arr[Math.floor(Math.random() * arr.length)] : '';
  }

  function isTV(data) {
    return data.media_type === 'tv' || !!data.first_air_date || !!data.original_name;
  }

  function cardKey(data) {
    if (!data || !data.id) return null;
    return (isTV(data) ? 'tv' : 'movie') + '_' + data.id;
  }

  // ======================
  // LRU-кэш
  // ======================
  class Cache {
    constructor(key, maxSize, ttl) {
      this.key = key;
      this.maxSize = maxSize;
      this.ttl = ttl;
      this.data = {};
      this.order = [];
      this.lastCleanup = 0;
      this._saveTimer = null;
      this.init();
    }

    init() {
      try {
        const raw = Lampa.Storage.get(this.key, {});
        if (raw && raw.v === 2) {
          this.data = raw.data || {};
          this.order = Array.isArray(raw.order) ? raw.order : [];
        } else {
          this.data = typeof raw === 'object' ? raw : {};
          this.order = Object.keys(this.data);
        }
        // чистим дубликаты
        const seen = {};
        this.order = this.order.filter(k => {
          if (seen[k] || !this.data[k]) return false;
          seen[k] = true;
          return true;
        });
      } catch (e) {
        console.warn('[Obsidian] Cache init error', e);
        this.data = {};
        this.order = [];
      }
    }

    _cleanup() {
      const now = Date.now();
      if (now - this.lastCleanup < 60000) return;
      this.lastCleanup = now;

      const toDelete = [];
      for (const k in this.data) {
        if (this.data[k].timestamp <= now - this.ttl) toDelete.push(k);
      }
      toDelete.forEach(k => this._remove(k));
      if (toDelete.length) this.save();
    }

    _remove(key) {
      delete this.data[key];
      const idx = this.order.indexOf(key);
      if (idx > -1) this.order.splice(idx, 1);
    }

    _touch(key) {
      const idx = this.order.indexOf(key);
      if (idx > -1) this.order.splice(idx, 1);
      this.order.push(key);
    }

    get(key) {
      const item = this.data[key];
      if (!item) return null;
      if (item.timestamp <= Date.now() - this.ttl) {
        this._remove(key);
        this.save();
        return null;
      }
      this._touch(key);
      return item.value;
    }

    set(key, value) {
      this._cleanup();

      // LRU eviction
      if (this.order.length >= this.maxSize) {
        const half = Math.floor(this.order.length / 2);
        const toRemove = this.order.splice(0, half);
        toRemove.forEach(k => delete this.data[k]);
      }

      this.data[key] = { timestamp: Date.now(), value };
      this._touch(key);
      this.save();
    }

    save() {
      clearTimeout(this._saveTimer);
      this._saveTimer = setTimeout(() => {
        try {
          Lampa.Storage.set(this.key, {
            v: 2,
            data: this.data,
            order: this.order
          });
        } catch (e) {
          console.warn('[Obsidian] Cache save error', e);
        }
      }, 400);
    }

    clear() {
      this.data = {};
      this.order = [];
      this.save();
    }
  }

  // ======================
  // Очередь запросов
  // ======================
  const Queue = {
    list: [],
    active: 0,
    maxParallel: CONFIG.queue.maxParallel,
    maxSize: CONFIG.queue.maxSize,

    add(fn) {
      if (this.list.length >= this.maxSize) {
        console.warn('[Obsidian] Queue full, dropping task');
        return;
      }
      this.list.push(fn);
      this.process();
    },

    process() {
      if (this.active >= this.maxParallel || !this.list.length) return;
      const task = this.list.shift();
      this.active++;
      task(() => {
        this.active--;
        this.process();
      });
    },

    clear() {
      this.list = [];
      this.active = 0;
    }
  };

  // ======================
  // Кэши
  // ======================
  const qualityCache = new Cache(
    CONFIG.qualityCache.key,
    CONFIG.qualityCache.size,
    CONFIG.qualityCache.time
  );
  const posterCache = new Cache(
    CONFIG.posterCache.key,
    CONFIG.posterCache.size,
    CONFIG.posterCache.time
  );

  // ======================
  // Настройки
  // ======================
  const Settings = {
    qualityEnabled:   () => Lampa.Storage.get('obsidian_quality_enabled', CONFIG.ui.qualityEnabled),
    qualityIcon:      () => Lampa.Storage.get('obsidian_quality_icon', CONFIG.ui.qualityIcon),
    qualityColor:     () => Lampa.Storage.get('obsidian_quality_color', CONFIG.ui.qualityColor),
    ratingEnabled:    () => Lampa.Storage.get('obsidian_rating_enabled', CONFIG.ui.ratingEnabled),
    ratingIcon:       () => Lampa.Storage.get('obsidian_rating_icon', CONFIG.ui.ratingIcon),
    ratingColor:      () => Lampa.Storage.get('obsidian_rating_color', CONFIG.ui.ratingColor),
    showReleaseYear:  () => Lampa.Storage.get('obsidian_show_release_year', CONFIG.ui.showReleaseYear),
    showEpisodeNumber:() => Lampa.Storage.get('obsidian_show_episode_number', CONFIG.ui.showEpisodeNumber),
    showGenres:       () => Lampa.Storage.get('obsidian_show_genres', CONFIG.ui.showGenres),
    replacePoster:    () => Lampa.Storage.get('obsidian_replace_poster', CONFIG.ui.replacePoster),
    noir:             () => Lampa.Storage.get('obsidian_noir', CONFIG.ui.noir),
    noirBadges:       () => Lampa.Storage.get('obsidian_noir_badges', CONFIG.ui.noirBadges)
  };

  // ======================
  // Локализация
  // ======================
  const LANG = {
    obsidian_quality: { uk: 'Якість', ru: 'Качество', en: 'Quality' },
    obsidian_quality_enabled: { uk: 'Відображати якість', ru: 'Показывать качество', en: 'Show quality' },
    obsidian_quality_icon: { uk: 'Іконка якості', ru: 'Иконка качества', en: 'Quality icon' },
    obsidian_quality_color: { uk: 'Кольорова якість', ru: 'Цветное качество', en: 'Colored quality' },
    obsidian_ratings: { uk: 'Рейтинг', ru: 'Рейтинг', en: 'Ratings' },
    obsidian_rating_enabled: { uk: 'Відображати рейтинг', ru: 'Показывать рейтинг', en: 'Show rating' },
    obsidian_rating_icon: { uk: 'Іконка рейтингу', ru: 'Иконка рейтинга', en: 'Rating icon' },
    obsidian_rating_color: { uk: 'Кольоровий рейтинг', ru: 'Цветной рейтинг', en: 'Colored rating' },
    obsidian_show_release_year: { uk: 'Відображати рік випуску', ru: 'Показывать год выпуска', en: 'Show release year' },
    obsidian_show_episode_number: { uk: 'Відображати номер серії', ru: 'Показывать номер серии', en: 'Show episode number' },
    obsidian_show_genres: { uk: 'Відображати жанри', ru: 'Показывать жанры', en: 'Show genres' },
    obsidian_replace_poster: { uk: 'Мінімалістичний постер', ru: 'Минималистичный постер', en: 'Minimal poster' },
    obsidian_noir: { uk: 'Нуар', ru: 'Нуар', en: 'Noir' },
    obsidian_noir_enabled: { uk: 'Чорно-білі картки', ru: 'Чёрно-белые карточки', en: 'Black & white cards' },
    obsidian_noir_badges: { uk: 'Чорно-білі бейджі', ru: 'Чёрно-белые бейджи', en: 'Black & white badges' },
    obsidian_settings_memory: { uk: "Пам'ять", ru: 'Память', en: 'Memory' },
    obsidian_reset_settings: { uk: 'Скинути налаштування', ru: 'Сбросить настройки', en: 'Reset settings' },
    obsidian_clear_cache: { uk: 'Очистити кеш', ru: 'Очистить кэш', en: 'Clear cache' },
    obsidian_settings_reset: { uk: 'Налаштування скинуто', ru: 'Настройки сброшены', en: 'Settings reset' },
    obsidian_cache_cleared: { uk: 'Кеш очищено', ru: 'Кэш очищен', en: 'Cache cleared' }
  };

  // ======================
  // Жанры
  // ======================
  const GENRES = {
    movie: [
      { id: 28, title: '#{filter_genre_ac}' }, { id: 12, title: '#{filter_genre_ad}' },
      { id: 16, title: '#{filter_genre_mv}' }, { id: 35, title: '#{filter_genre_cm}' },
      { id: 80, title: '#{filter_genre_cr}' }, { id: 99, title: '#{filter_genre_dc}' },
      { id: 18, title: '#{filter_genre_dr}' }, { id: 10751, title: '#{filter_genre_fm}' },
      { id: 14, title: '#{filter_genre_fe}' }, { id: 36, title: '#{filter_genre_hi}' },
      { id: 27, title: '#{filter_genre_ho}' }, { id: 10402, title: '#{filter_genre_mu}' },
      { id: 9648, title: '#{filter_genre_de}' }, { id: 10749, title: '#{filter_genre_md}' },
      { id: 878, title: '#{filter_genre_fa}' }, { id: 10770, title: '#{filter_genre_tv}' },
      { id: 53, title: '#{filter_genre_tr}' }, { id: 10752, title: '#{filter_genre_mi}' },
      { id: 37, title: '#{filter_genre_ve}' }
    ],
    tv: [
      { id: 10759, title: '#{filter_genre_aa}' }, { id: 16, title: '#{filter_genre_mv}' },
      { id: 35, title: '#{filter_genre_cm}' }, { id: 80, title: '#{filter_genre_cr}' },
      { id: 99, title: '#{filter_genre_dc}' }, { id: 18, title: '#{filter_genre_dr}' },
      { id: 10751, title: '#{filter_genre_fm}' }, { id: 10762, title: '#{filter_genre_ch}' },
      { id: 9648, title: '#{filter_genre_de}' }, { id: 10763, title: '#{filter_genre_nw}' },
      { id: 10764, title: '#{filter_genre_rs}' }, { id: 10765, title: '#{filter_genre_hf}' },
      { id: 10766, title: '#{filter_genre_op}' }, { id: 10767, title: '#{filter_genre_tc}' },
      { id: 10768, title: '#{filter_genre_mp}' }, { id: 37, title: '#{filter_genre_ve}' }
    ]
  };

  function getGenres(data) {
    const type = isTV(data) ? 'tv' : 'movie';
    const list = GENRES[type] || [];
    const ids = data.genre_ids || [];
    return ids
      .map(id => {
        const g = list.find(x => x.id == id);
        return g ? Lampa.Utils.capitalizeFirstLetter(Lampa.Lang.translate(g.title)) : null;
      })
      .filter(Boolean)
      .slice(0, 2);
  }

  // ======================
  // Качество
  // ======================
  const pendingQuality = {};

  function fetchQuality(data, callback) {
    const key = cardKey(data);
    if (!key) return callback(null);

    const cached = qualityCache.get(key);
    if (cached) {
      if (cached.quality) callback(cached.quality);
      return;
    }

    if (pendingQuality[key]) {
      pendingQuality[key].push(callback);
      return;
    }
    pendingQuality[key] = [callback];

    const apn = random(CONFIG.apn).trim();
    const api = random(CONFIG.api);
    let url = (apn + api.url).replace(/\s+/g, '') + '?token=' + api.token;

    if (data.kinopoisk_id) url += '&kp=' + encodeURIComponent(data.kinopoisk_id);
    else if (data.imdb_id) url += '&imdb=' + encodeURIComponent(data.imdb_id);
    else if (data.id) url += '&tmdb=' + encodeURIComponent(data.id);

    Queue.add(done => {
      let finished = false;
      const timer = setTimeout(() => finish(null), 5000);

      function finish(quality) {
        if (finished) return;
        finished = true;
        clearTimeout(timer);

        qualityCache.set(key, { quality: quality || null });

        const cbs = pendingQuality[key] || [];
        delete pendingQuality[key];
        cbs.forEach(cb => {
          try { cb(quality); } catch (e) {}
        });
        done();
      }

      Lampa.Network.silent(url, res => {
        if (res && res.status === 'success' && res.data) {
          const q = res.data.quality;
          let quality = null;
          if (q) {
            if (res.data.uhd) quality = '4k';
            else if (/(^|,\s*)ts(\s*,|$)/i.test(q)) quality = 'ts';
            else quality = 'hd';
          }
          finish(quality);
        } else {
          finish(null);
        }
      }, () => finish(null));
    });
  }

  // ======================
  // SVG иконки
  // ======================
  function createSVG(id, className, viewBox) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', className);
    svg.setAttribute('viewBox', viewBox);
    const use = document.createElementNS(ns, 'use');
    use.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#' + id);
    use.setAttribute('href', '#' + id);
    svg.appendChild(use);
    return svg;
  }

  // ======================
  // Метаданные карточки
  // ======================
  function addMetadata(card, isWide) {
    const view = card.html.querySelector('.card__view');
    if (!view) return;

    const data = card.data;
    const meta = document.createElement('div');
    meta.className = 'card__metadata';

    const bottom = document.createElement('div');
    bottom.className = 'metadata__bottom';

    const left = document.createElement('div');
    const right = document.createElement('div');

    if (!isWide) {
      // жанры
      if (Settings.showGenres()) {
        const genres = getGenres(data);
        if (genres.length) {
          const el = document.createElement('div');
          el.className = 'metadata__genres';
          el.textContent = genres.join(', ');
          meta.appendChild(el);
        }
      }

      // название
      const title = data.title || data.name || data.original_title || data.original_name || '';
      if (title) {
        const el = document.createElement('div');
        el.className = 'metadata__title';
        el.textContent = title;
        meta.appendChild(el);
      }
    }

    // рейтинг
    if (Settings.ratingEnabled()) {
      let rating = parseFloat(data.imdb_rating || data.kp_rating || data.vote_average || 0).toFixed(1);
      if (+rating > 0) {
        const el = document.createElement('span');
        el.className = 'metadata__rating';

        if (Settings.ratingColor()) {
          const val = +rating;
          if (val >= 8) el.classList.add('rating-excellent');
          else if (val >= 6.5) el.classList.add('rating-good');
          else if (val >= 5) el.classList.add('rating-average');
          else if (val >= 3) el.classList.add('rating-poor');
          else el.classList.add('rating-terrible');
        } else {
          el.classList.add('metadata__rating--no-color');
        }

        if (Settings.ratingIcon()) {
          el.appendChild(createSVG('rating-star', 'metadata__rating-icon', '0 0 24 23'));
        }

        const valEl = document.createElement('span');
        valEl.className = 'metadata__rating-value';
        valEl.textContent = rating;
        el.appendChild(valEl);
        left.appendChild(el);
      }
    }

    // качество
    if (Settings.qualityEnabled()) {
      const el = document.createElement('span');
      el.className = 'metadata__quality';
      el.style.display = 'none';
      left.appendChild(el);

      fetchQuality(data, quality => {
        if (!quality) return;
        data.release_quality = quality;
        const q = quality.toLowerCase();
        el.className = 'metadata__quality metadata__quality--' + q;
        if (!Settings.qualityColor()) el.classList.add('metadata__quality--no-color');

        el.textContent = '';
        if (Settings.qualityIcon()) {
          const iconMap = { ts: 'low', hd: 'medium', '4k': 'high' };
          el.appendChild(createSVG(iconMap[q] || 'medium', 'metadata__quality-icon', '0 0 24 24'));
        }
        const label = document.createElement('span');
        label.className = 'metadata__quality-label';
        label.textContent = quality.toUpperCase();
        el.appendChild(label);
        el.style.display = '';
      });
    }

    // год
    if (Settings.showReleaseYear()) {
      const year = (data.release_date || data.first_air_date || '').slice(0, 4);
      if (year && year !== '0000') {
        const el = document.createElement('span');
        el.className = 'metadata__year';
        el.textContent = year;
        right.appendChild(el);
      }
    }

    bottom.appendChild(left);
    bottom.appendChild(right);
    meta.appendChild(bottom);
    view.appendChild(meta);
  }

  // ======================
  // TV-иконка + эпизод
  // ======================
  function enhanceTV(card) {
    const typeEl = card.html.querySelector('.card__type');
    if (!typeEl || typeEl._obsidianIcon) return;

    typeEl._obsidianIcon = true;
    typeEl.textContent = '';
    typeEl.appendChild(createSVG('sprite-tv-show', 'card__type-icon', '0 0 51.802 51.801'));

    if (Settings.showEpisodeNumber() && !typeEl._obsidianEpisode) {
      typeEl._obsidianEpisode = true;
      Lampa.Network.silent(
        Lampa.TMDB.api('tv/' + card.data.id + '?api_key=' + Lampa.TMDB.key()),
        res => {
          if (res && res.last_episode_to_air) {
            const ep = res.last_episode_to_air;
            const label = document.createElement('span');
            label.className = 'card__type-label';
            label.textContent = 'S' + ep.season_number + ':E' + ep.episode_number;
            typeEl.classList.add('episode_metadata');
            typeEl.appendChild(label);
          }
        }
      );
    }
  }

  // ======================
  // Замена постера
  // ======================
  const pendingPosters = {};
  const NONE = '@none';

  function getBetterPoster(data, callback) {
    if (!data || !data.id || !data.media_type) return callback(null);

    const key = data.media_type + '_' + data.id;
    const cached = posterCache.get(key);
    if (cached === NONE) return callback(null);
    if (cached) return callback(cached);

    if (pendingPosters[key]) {
      pendingPosters[key].push(callback);
      return;
    }
    pendingPosters[key] = [callback];

    const url = Lampa.TMDB.api(
      data.media_type + '/' + data.id + '/images?include_image_language=null&api_key=' + Lampa.TMDB.key()
    );

    let finished = false;
    const timer = setTimeout(() => finish(null, false), 2000);
    const req = new Lampa.Reguest();

    function finish(path, success) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);

      if (!success) posterCache.set(key, NONE);
      else if (path) posterCache.set(key, path);

      const cbs = pendingPosters[key] || [];
      delete pendingPosters[key];
      cbs.forEach(cb => {
        try { cb(path); } catch (e) {}
      });
    }

    req.native(url, res => {
      const path = res && res.posters && res.posters[0] ? res.posters[0].file_path : null;
      finish(path, !!path);
    }, () => finish(null, false));
  }

  // ======================
  // Хуки Card
  // ======================
  function patchCards() {
    const Maker = Lampa.Maker.map('Card');
    let forceObsidian = false;

    // шаблон
    const origJS = Lampa.Template.js;
    Lampa.Template.js = function (name, data) {
      if (forceObsidian && name === 'card') name = 'card_obsidian';
      return origJS.call(Lampa.Template, name, data);
    };

    // отключаем стандартный рейтинг/год
    ['Ratting', 'Release'].forEach(name => {
      if (Maker[name]) {
        const orig = Maker[name].onCreate;
        Maker[name].onCreate = function () {
          if (this.obsidian) return;
          if (typeof orig === 'function') return orig.apply(this, arguments);
        };
      }
    });

    // noir focus
    if (Maker.Callback) {
      const orig = Maker.Callback.onlyFocus;
      Maker.Callback.onlyFocus = function () {
        if (Settings.noir()) return;
        if (typeof orig === 'function') return orig.apply(this, arguments);
      };
    }

    // onCreate
    const origCreate = Maker.Card.onCreate;
    Maker.Card.onCreate = function () {
      const card = this;
      const isWide = card.params && card.params.style && card.params.style.name === 'wide';
      const isObsidian = card.data && (card.data.source === 'tmdb' || card.data.source === 'cub');

      card.obsidian = isObsidian;
      card.refreshPoster = Settings.replacePoster() && !isWide && isObsidian && card.data.original_language;

      if (card.refreshPoster) {
        card.appliedPoster = null;
        card.posterReplaced = false;
        card.nativeGetPosterPath = card.getPosterPath;
        card.getPosterPath = () => card.appliedPoster || './img/img_load.svg';
      }

      forceObsidian = isObsidian;
      try {
        origCreate.apply(card, arguments);
      } finally {
        forceObsidian = false;
      }

      // люди — без noir
      if (card.data && (card.data.gender !== undefined || card.data.known_for || card.data.known_for_department)) {
        card.html.classList.add('obsidian--no-noir');
      }

      if (isObsidian && (card.data.original_name || card.data.title)) {
        card.data.media_type = card.data.media_type || (card.data.first_air_date ? 'tv' : 'movie');
        addMetadata(card, isWide);
        if (isTV(card.data)) enhanceTV(card);
      }
    };

    // onVisible
    const origVisible = Maker.Card.onVisible;
    Maker.Card.onVisible = function () {
      const card = this;

      if (card.obsidian && isTV(card.data)) enhanceTV(card);

      if (card.refreshPoster && !card.posterReplaced) {
        let done = false;
        const fallbackPath = card.data.poster_path || card.data.backdrop_path;
        const origOnError = card.img ? card.img.onerror : null;

        const clearTimers = () => {
          try { clearTimeout(card.img_timer); } catch (e) {}
          try { clearTimeout(card.img_timer_next); } catch (e) {}
        };

        const tmdbUrl = path => {
          if (!path) return null;
          if (/^https?:\/\//.test(path) || path.indexOf('//') === 0) return path;
          if (path[0] !== '/') path = '/' + path;
          return Lampa.TMDB.image('t/p/w780' + path);
        };

        const setFallback = () => {
          const img = card.img;
          if (!img || !img.parentNode) return;
          let src = null;
          try {
            if (typeof card.nativeGetPosterPath === 'function') src = card.nativeGetPosterPath.call(card);
          } catch (e) {}
          if (!src || src === './img/img_load.svg') src = tmdbUrl(fallbackPath);
          src = src || './img/img_broken.svg';
          card.appliedPoster = src;
          clearTimers();
          if (origOnError) try { img.onerror = origOnError; } catch (e) {}
          img.src = src;
        };

        const setPoster = url => {
          const img = card.img;
          if (!img || !img.parentNode) return;
          card.posterReplaced = true;
          card.appliedPoster = url;
          clearTimers();
          img.onerror = () => setFallback();
          img.src = url;
        };

        const timeout = setTimeout(() => {
          if (!done) {
            done = true;
            setFallback();
          }
        }, 2000);

        getBetterPoster(card.data, (path, ok) => {
          if (done) return;
          done = true;
          clearTimeout(timeout);

          if (ok && path) {
            const url = tmdbUrl(path);
            if (url) {
              const img = card.img;
              if (img && img.parentNode && (img.src || '').indexOf(url) === -1) {
                const preload = new Image();
                preload.onload = () => setPoster(url);
                preload.onerror = () => setFallback();
                preload.src = url;
                if (preload.complete && preload.naturalWidth > 0) preload.onload();
              } else {
                setPoster(url);
              }
            } else setFallback();
          } else {
            setFallback();
          }
        });
      }

      origVisible.apply(card, arguments);
    };
  }

  // ======================
  // Noir
  // ======================
  function applyNoir() {
    const noir = Settings.noir();
    const badges = noir && Settings.noirBadges();
    document.body.classList.toggle('obsidian--noir', noir);
    document.body.classList.toggle('obsidian--noir-badges', badges);
  }

  // ======================
  // Настройки в меню
  // ======================
  function registerSettings() {
    Lampa.Lang.add(LANG);

    Lampa.SettingsApi.addComponent({
      component: 'obsidian_settings',
      name: 'Obsidian',
      icon: `<svg fill="currentColor" width="32" height="32" viewBox="0 0 32 32"><path d="M30.531 15.47l-14.001-14c-0.136-0.136-0.323-0.22-0.53-0.22s-0.395 0.084-0.53 0.22l-14 14c-0.136 0.136-0.22 0.323-0.22 0.53s0.084 0.395 0.22 0.53l14 14.001c0.136 0.135 0.323 0.219 0.53 0.219s0.394-0.084 0.53-0.219l14.001-14.001c0.135-0.136 0.218-0.323 0.218-0.53s-0.083-0.394-0.218-0.53zM16 28.939l-12.939-12.939 12.939-12.939 12.939 12.939z"/></svg>`
    });

    // Quality
    Lampa.Template.add('settings_obsidian_quality', '<div></div>');
    Lampa.SettingsApi.addParam({
      component: 'obsidian_quality',
      param: { name: 'obsidian_quality_enabled', type: 'trigger', default: CONFIG.ui.qualityEnabled },
      field: { name: Lampa.Lang.translate('obsidian_quality_enabled') }
    });
    Lampa.SettingsApi.addParam({
      component: 'obsidian_quality',
      param: { name: 'obsidian_quality_icon', type: 'trigger', default: CONFIG.ui.qualityIcon },
      field: { name: Lampa.Lang.translate('obsidian_quality_icon') }
    });
    Lampa.SettingsApi.addParam({
      component: 'obsidian_quality',
      param: { name: 'obsidian_quality_color', type: 'trigger', default: CONFIG.ui.qualityColor },
      field: { name: Lampa.Lang.translate('obsidian_quality_color') }
    });

    // Rating
    Lampa.Template.add('settings_obsidian_rating', '<div></div>');
    Lampa.SettingsApi.addParam({
      component: 'obsidian_rating',
      param: { name: 'obsidian_rating_enabled', type: 'trigger', default: CONFIG.ui.ratingEnabled },
      field: { name: Lampa.Lang.translate('obsidian_rating_enabled') }
    });
    Lampa.SettingsApi.addParam({
      component: 'obsidian_rating',
      param: { name: 'obsidian_rating_icon', type: 'trigger', default: CONFIG.ui.ratingIcon },
      field: { name: Lampa.Lang.translate('obsidian_rating_icon') }
    });
    Lampa.SettingsApi.addParam({
      component: 'obsidian_rating',
      param: { name: 'obsidian_rating_color', type: 'trigger', default: CONFIG.ui.ratingColor },
      field: { name: Lampa.Lang.translate('obsidian_rating_color') }
    });

    // Noir
    Lampa.Template.add('settings_obsidian_noir', '<div></div>');
    Lampa.SettingsApi.addParam({
      component: 'obsidian_noir',
      param: { name: 'obsidian_noir', type: 'trigger', default: CONFIG.ui.noir },
      field: { name: Lampa.Lang.translate('obsidian_noir_enabled') },
      onChange: applyNoir
    });
    Lampa.SettingsApi.addParam({
      component: 'obsidian_noir',
      param: { name: 'obsidian_noir_badges', type: 'trigger', default: CONFIG.ui.noirBadges },
      field: { name: Lampa.Lang.translate('obsidian_noir_badges') },
      onChange: applyNoir
    });

    // Main menu
    Lampa.SettingsApi.addParam({
      component: 'obsidian_settings',
      param: { type: 'button' },
      field: { name: Lampa.Lang.translate('obsidian_quality') },
      onChange: () => Lampa.Settings.create('obsidian_quality', {
        onBack: () => Lampa.Settings.create('obsidian_settings')
      })
    });
    Lampa.SettingsApi.addParam({
      component: 'obsidian_settings',
      param: { type: 'button' },
      field: { name: Lampa.Lang.translate('obsidian_ratings') },
      onChange: () => Lampa.Settings.create('obsidian_rating', {
        onBack: () => Lampa.Settings.create('obsidian_settings')
      })
    });
    Lampa.SettingsApi.addParam({
      component: 'obsidian_settings',
      param: { name: 'obsidian_show_episode_number', type: 'trigger', default: CONFIG.ui.showEpisodeNumber },
      field: { name: Lampa.Lang.translate('obsidian_show_episode_number') }
    });
    Lampa.SettingsApi.addParam({
      component: 'obsidian_settings',
      param: { name: 'obsidian_replace_poster', type: 'trigger', default: CONFIG.ui.replacePoster },
      field: { name: Lampa.Lang.translate('obsidian_replace_poster') }
    });
    Lampa.SettingsApi.addParam({
      component: 'obsidian_settings',
      param: { name: 'obsidian_show_genres', type: 'trigger', default: CONFIG.ui.showGenres },
      field: { name: Lampa.Lang.translate('obsidian_show_genres') }
    });
    Lampa.SettingsApi.addParam({
      component: 'obsidian_settings',
      param: { name: 'obsidian_show_release_year', type: 'trigger', default: CONFIG.ui.showReleaseYear },
      field: { name: Lampa.Lang.translate('obsidian_show_release_year') }
    });
    Lampa.SettingsApi.addParam({
      component: 'obsidian_settings',
      param: { type: 'button' },
      field: { name: Lampa.Lang.translate('obsidian_noir') },
      onChange: () => Lampa.Settings.create('obsidian_noir', {
        onBack: () => Lampa.Settings.create('obsidian_settings')
      })
    });

    // Memory
    Lampa.SettingsApi.addParam({
      component: 'obsidian_settings',
      param: { type: 'title' },
      field: { name: Lampa.Lang.translate('obsidian_settings_memory') }
    });
    Lampa.SettingsApi.addParam({
      component: 'obsidian_settings',
      param: { type: 'button' },
      field: { name: Lampa.Lang.translate('obsidian_reset_settings') },
      onChange: () => {
        Object.keys(CONFIG.ui).forEach(k => {
          Lampa.Storage.set('obsidian_' + k.replace(/([A-Z])/g, '_$1').toLowerCase(), CONFIG.ui[k]);
        });
        // точные ключи
        Lampa.Storage.set('obsidian_quality_enabled', CONFIG.ui.qualityEnabled);
        Lampa.Storage.set('obsidian_quality_icon', CONFIG.ui.qualityIcon);
        Lampa.Storage.set('obsidian_quality_color', CONFIG.ui.qualityColor);
        Lampa.Storage.set('obsidian_rating_enabled', CONFIG.ui.ratingEnabled);
        Lampa.Storage.set('obsidian_rating_icon', CONFIG.ui.ratingIcon);
        Lampa.Storage.set('obsidian_rating_color', CONFIG.ui.ratingColor);
        Lampa.Storage.set('obsidian_show_release_year', CONFIG.ui.showReleaseYear);
        Lampa.Storage.set('obsidian_show_episode_number', CONFIG.ui.showEpisodeNumber);
        Lampa.Storage.set('obsidian_show_genres', CONFIG.ui.showGenres);
        Lampa.Storage.set('obsidian_replace_poster', CONFIG.ui.replacePoster);
        Lampa.Storage.set('obsidian_noir', CONFIG.ui.noir);
        Lampa.Storage.set('obsidian_noir_badges', CONFIG.ui.noirBadges);
        applyNoir();
        Lampa.Noty.show(Lampa.Lang.translate('obsidian_settings_reset'));
      }
    });
    Lampa.SettingsApi.addParam({
      component: 'obsidian_settings',
      param: { type: 'button' },
      field: { name: Lampa.Lang.translate('obsidian_clear_cache') },
      onChange: () => {
        qualityCache.clear();
        posterCache.clear();
        Lampa.Noty.show(Lampa.Lang.translate('obsidian_cache_cleared'));
      }
    });
  }

  // ======================
  // CSS + SVG sprites
  // ======================
  function injectStyles() {
    // шаблон карточки
    const div = document.createElement('div');
    div.innerHTML = Lampa.Template.string('card');
    const card = div.firstElementChild;
    if (card) {
      card.className += ' card--obsidian';
      const title = card.querySelector('.card__title');
      if (title) title.remove();
      const age = card.querySelector('.card__age');
      if (age) age.remove();
      Lampa.Template.add('card_obsidian', div.innerHTML);
    }

    // стили
    const style = document.createElement('style');
    style.innerHTML = `
      .card--obsidian.card--tv .card__type {
        left: 0; top: 0; padding: 0.6em;
        border-radius: 1.2em 0 0.4em 0;
        overflow: hidden; white-space: nowrap;
        color: #fff; background: rgba(0,0,0,0.82);
        display: flex; align-items: center; justify-content: center;
      }
      .card--obsidian.card--tv .card__type-icon {
        display: block; flex-shrink: 0;
        width: 1.2em; height: 1.2em; fill: currentColor;
      }
      .card--obsidian.card--tv .card__type.episode_metadata {
        justify-content: flex-start; padding: 0.6em 1.2em;
      }
      .card--obsidian.card--tv .card__type.episode_metadata .card__type-label {
        margin-left: 0.5em; line-height: 1;
      }
      .card__metadata {
        position: absolute; bottom: 0; left: 0; right: 0;
        padding: 3.5em 0.75em 0.5em; color: #fff;
        border-radius: 0 0 1em 1em;
        background: linear-gradient(to top,
          rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.90) 25%,
          rgba(0,0,0,0.80) 45%, rgba(0,0,0,0.65) 65%,
          rgba(0,0,0,0.40) 80%, rgba(0,0,0,0) 100%);
      }
      .card--wide .card__metadata { background: none; z-index: 1; }
      .metadata__genres {
        font-size: 0.75em; opacity: 0.95; margin-bottom: 0.35em;
        text-shadow: 0 0.0625em 0.1875em rgba(0,0,0,0.8);
      }
      .metadata__title {
        font-size: 1.15em; line-height: 1.2; max-height: 3.6em;
        overflow: hidden; text-overflow: ellipsis;
        text-shadow: 0 0.0625em 0.1875em rgba(0,0,0,0.9);
        display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
      }
      .metadata__bottom {
        margin-top: 0.45em; min-height: 1em;
        display: flex; align-items: center; justify-content: space-between;
      }
      .metadata__bottom > div { display: flex; align-items: center; }
      .metadata__rating {
        font-size: 0.8em; opacity: 0.95; color: #ffd54a; margin-right: 0.5em;
        text-shadow: 0 0.0625em 0.1875em rgba(0,0,0,0.9);
      }
      .metadata__rating-icon {
        display: inline-block; vertical-align: middle;
        width: 1.05em; height: 1.05em; margin-right: 0.25em;
        fill: none; stroke: currentColor;
        filter: drop-shadow(0 0.0625em 0.1875em rgba(0,0,0,0.9));
      }
      .metadata__rating-value { display: inline-block; vertical-align: middle; line-height: 1; }
      .metadata__rating.rating-excellent { color: #81c784; }
      .metadata__rating.rating-good { color: #64b5f6; }
      .metadata__rating.rating-average { color: #ff9800; }
      .metadata__rating.rating-poor { color: #ff7043; }
      .metadata__rating.rating-terrible { color: #e53935; }
      .metadata__rating--no-color { color: #fff !important; }
      .metadata__year {
        font-size: 0.75em; opacity: 0.9;
        text-shadow: 0 0.0625em 0.1875em rgba(0,0,0,0.9);
      }
      .metadata__quality {
        display: inline-block; vertical-align: middle; margin-right: 0.5em;
        font-size: 0.8em; font-weight: 700; letter-spacing: 0.02em;
        text-transform: uppercase; opacity: 0.95;
        text-shadow: 0 0.0625em 0.1875em rgba(0,0,0,0.9);
      }
      .metadata__quality-icon {
        display: inline-block; vertical-align: middle;
        width: 1.15em; height: 1.15em; margin-right: 0.2em; fill: currentColor;
      }
      .metadata__quality-label { display: inline-block; vertical-align: middle; line-height: 1; }
      .metadata__quality--4k { color: #66bb6a; }
      .metadata__quality--hd { color: #42a5f5; }
      .metadata__quality--ts { color: #ef5350; }
      .metadata__quality--no-color { color: #fff !important; }
      .card--obsidian .card__marker { right: 0.4em; top: 0.4em; left: auto; bottom: auto; }
      .card--obsidian .card__icons { top: 2em; }
      .card--obsidian .card__quality { display: none; }

      /* Noir */
      .obsidian--noir .card__img {
        filter: grayscale(1); transition: filter 0.25s ease;
      }
      .obsidian--noir .card.focus .card__img,
      .obsidian--noir .card.hover .card__img { filter: grayscale(0); }
      .obsidian--noir .card.obsidian--no-noir .card__img { filter: none; }
      .obsidian--noir .full-episode__img img {
        filter: grayscale(1); transition: filter 0.25s ease;
      }
      .obsidian--noir .card-episode.focus .full-episode__img img,
      .obsidian--noir .card-episode.hover .full-episode__img img,
      .obsidian--noir .full-episode.focus .full-episode__img img,
      .obsidian--noir .full-episode.hover .full-episode__img img,
      .obsidian--noir .card-episode.focus .card__img,
      .obsidian--noir .card-episode.hover .card__img { filter: grayscale(0); }

      .obsidian--noir-badges .metadata__rating,
      .obsidian--noir-badges .metadata__quality {
        filter: grayscale(1); transition: filter 0.25s ease;
      }
      .obsidian--noir-badges .card.focus .metadata__rating,
      .obsidian--noir-badges .card.hover .metadata__rating,
      .obsidian--noir-badges .card.focus .metadata__quality,
      .obsidian--noir-badges .card.hover .metadata__quality,
      .obsidian--noir-badges .card-episode.focus .metadata__rating,
      .obsidian--noir-badges .card-episode.hover .metadata__rating,
      .obsidian--noir-badges .card-episode.focus .metadata__quality,
      .obsidian--noir-badges .card-episode.hover .metadata__quality { filter: grayscale(0); }
      .obsidian--noir-badges .card.obsidian--no-noir .metadata__rating,
      .obsidian--noir-badges .card.obsidian--no-noir .metadata__quality { filter: none; }

      .items-line { padding-bottom: 2em; }
    `;
    document.head.appendChild(style);

    // SVG sprites
    let sprites = document.getElementById('sprites');
    if (!sprites) {
      sprites = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      sprites.id = 'sprites';
      sprites.setAttribute('aria-hidden', 'true');
      sprites.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
      document.body.appendChild(sprites);
    }
    sprites.insertAdjacentHTML('beforeend', `
      <symbol id="sprite-tv-show" viewBox="0 0 51.802 51.801" fill="none">
        <path d="M47.947 4.43H12.495A3.86 3.86 0 0 0 8.64 8.284v2.641h-.466a3.86 3.86 0 0 0-3.855 3.854v2.642h-.465A3.86 3.86 0 0 0 0 21.275v22.242a3.86 3.86 0 0 0 3.854 3.854h35.453a3.86 3.86 0 0 0 3.855-3.854v-2.644h.465a3.86 3.86 0 0 0 3.854-3.854v-2.641h.467a3.86 3.86 0 0 0 3.854-3.854V8.284a3.857 3.857 0 0 0-3.855-3.854m-8.75 25.987v12.99H3.963V21.385h35.234zm4.321 6.494h-.355V21.275a3.86 3.86 0 0 0-3.855-3.854H12.604v-.001H8.641v-1.266h-.357v-1.266h35.235V36.91zm4.321-6.494h-.356V14.78a3.86 3.86 0 0 0-3.854-3.854H12.604V8.394H47.84z" fill="currentColor"/>
        <path d="m26.401 30.446-5.788-4.215a1.916 1.916 0 0 0-3.044 1.549v8.43a1.914 1.914 0 0 0 1.916 1.916c.398 0 .794-.125 1.128-.367l5.788-4.215a1.92 1.92 0 0 0 0-3.098" fill="currentColor"/>
      </symbol>
      <symbol id="high" viewBox="0 0 24 24" fill="none">
        <path d="M20 14c0-4.4183-3.5817-8-8-8s-8 3.5817-8 8c0 1.2497.3493 2.4556.8955 3.5547.2458.4945.0442 1.095-.4502 1.3408s-1.095.0442-1.3408-.4502C2.453 17.1346 2 15.6239 2 14 2 8.4772 6.4772 4 12 4s10 4.4772 10 10c0 1.6239-.4531 3.1346-1.1045 4.4453-.2458.4944-.8463.696-1.3408.4502s-.696-.8463-.4502-1.3408C19.6507 16.4556 20 15.2497 20 14m-7 0c0-.5523-.4477-1-1-1s-1 .4477-1 1 .4477 1 1 1 1-.4477 1-1m2 0c0 1.6569-1.3431 3-3 3s-3-1.3431-3-3 1.3431-3 3-3c.4625 0 .8988.108 1.29.2949l1.503-1.502c.3905-.3904 1.0235-.3904 1.414 0 .3905.3906.3905 1.0236 0 1.4141l-1.5029 1.502c.1872.3915.2959.8281.2959 1.291" fill="currentColor"/>
      </symbol>
      <symbol id="medium" viewBox="0 0 24 24" fill="none">
        <path d="M20 14c0-4.4183-3.5817-8-8-8s-8 3.5817-8 8c0 1.2497.3493 2.4556.8955 3.5547.2458.4945.0442 1.095-.4502 1.3408s-1.095.0442-1.3408-.4502C2.453 17.1346 2 15.6239 2 14 2 8.4772 6.4772 4 12 4s10 4.4772 10 10c0 1.6239-.4531 3.1346-1.1045 4.4453-.2458.4944-.8463.696-1.3408.4502s-.696-.8463-.4502-1.3408C19.6507 16.4556 20 15.2497 20 14m-7 0c0-.5523-.4477-1-1-1s-1 .4477-1 1 .4477 1 1 1 1-.4477 1-1m2 0c0 1.6569-1.3431 3-3 3s-3-1.3431-3-3c0-1.3059.8353-2.4141 2-2.8262V9c0-.5523.4477-1 1-1s1 .4477 1 1v2.1738c1.1647.4121 2 1.5203 2 2.8262" fill="currentColor"/>
      </symbol>
      <symbol id="low" viewBox="0 0 24 24" fill="none">
        <path d="M20 14c0-4.4183-3.5817-8-8-8s-8 3.5817-8 8c0 1.2497.3493 2.4556.8955 3.5547.2458.4945.0442 1.095-.4502 1.3408s-1.095.0442-1.3408-.4502C2.453 17.1346 2 15.6239 2 14 2 8.4772 6.4772 4 12 4s10 4.4772 10 10c0 1.6239-.4531 3.1346-1.1045 4.4453-.2458.4944-.8463.696-1.3408.4502s-.696-.8463-.4502-1.3408C19.6507 16.4556 20 15.2497 20 14m-7 0c0-.5523-.4477-1-1-1s-1 .4477-1 1 .4477 1 1 1 1-.4477 1-1m2 0c0 1.6569-1.3431 3-3 3s-3-1.3431-3-3c0-.4628.1078-.8996.295-1.291l-1.502-1.502c-.3905-.3905-.3906-1.0235 0-1.414s1.0235-.3905 1.414 0l1.502 1.5019C11.1004 11.1078 11.5372 11 12 11c1.6569 0 3 1.3431 3 3" fill="currentColor"/>
      </symbol>
      <symbol id="rating-star" viewBox="0 0 24 23" fill="none">
        <path d="M15.6162 7.10981L15.8464 7.55198L16.3381 7.63428L22.2841 8.62965C22.8678 8.72736 23.0999 9.44167 22.6851 9.86381L18.4598 14.1641L18.1104 14.5196L18.184 15.0127L19.0748 20.9752C19.1622 21.5606 18.5546 22.002 18.025 21.738L12.6295 19.0483L12.1833 18.8259L11.7372 19.0483L6.34171 21.738C5.81206 22.002 5.20443 21.5606 5.29187 20.9752L6.18264 15.0127L6.25629 14.5196L5.9069 14.1641L1.68155 9.86381C1.26677 9.44167 1.49886 8.72736 2.08255 8.62965L8.02855 7.63428L8.52022 7.55198L8.75043 7.10981L11.5345 1.76241C11.8078 1.23748 12.5589 1.23748 12.8322 1.76241L15.6162 7.10981Z" stroke="currentColor" stroke-width="2.2"/>
      </symbol>
    `);
  }

  // ======================
  // Автозаполнение рядов (мобилка)
  // ======================
  const AUTO_COMPONENTS = ['main', 'category'];

  function autofill(component) {
    if (!component || typeof component.use !== 'function') return;
    if (component._autofill_hooked) return;
    component._autofill_hooked = true;

    component.use({
      onBuild() { scheduleFill(this); },
      onPushLoaded() { scheduleFill(this); }
    });
    scheduleFill(component);
  }

  function scheduleFill(comp) {
    if (comp._raf) return;
    comp._raf = requestAnimationFrame(() => {
      comp._raf = 0;
      try {
        if (comp.destroyed) return;
        const scroll = comp.scroll;
        if (!scroll || typeof scroll.isFilled !== 'function') return;
        if (!comp.items || !comp.items.length) return;
        if (scroll.isFilled()) return;
        if (comp.next_wait) return;
        if (scroll.animated && scroll.animated()) {
          scheduleFill(comp);
          return;
        }
        if (comp.loaded && comp.loaded.length) {
          comp.emit('pushLoaded');
          return;
        }
        if ((comp._fills = (comp._fills || 0) + 1) > 20) return;
        comp.builded_time = 0;
        comp.emit('loadNext');
      } catch (e) {
        console.warn('[Obsidian] autofill error', e);
      }
    });
  }

  function onActivity(e) {
    if ((e.type === 'create' || e.type === 'start') && AUTO_COMPONENTS.includes(e.component)) {
      const act = e.object && e.object.activity && e.object.activity.component;
      autofill(act);
    }
  }

  function onLine(e) {
    if (e.type === 'visible' || e.type === 'append') {
      const act = Lampa.Activity.active();
      if (act && AUTO_COMPONENTS.includes(act.component)) {
        autofill(act.activity && act.activity.component);
      }
    }
  }

  // ======================
  // Старт
  // ======================
  function start() {
    injectStyles();
    registerSettings();
    applyNoir();
    patchCards();

    if (Lampa.Platform.screen('mobile')) {
      Lampa.Listener.follow('activity', onActivity);
      Lampa.Listener.follow('line', onLine);
      const act = Lampa.Activity.active();
      if (act && AUTO_COMPONENTS.includes(act.component)) {
        autofill(act.activity && act.activity.component);
      }
    }
  }

  if (window.appready) start();
  else Lampa.Listener.follow('app', e => { if (e.type === 'ready') start(); });

})();
