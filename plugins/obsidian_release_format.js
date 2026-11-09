(function () {
  'use strict';

  // ===================== CONFIG =====================
  const CONFIG = {
    crab: {
      base: 'https://crab.rip',
      qualityPath: '/api/v1.0/qualitys'
    },
    qualityCache: { key: 'obsidian_quality_cache', size: 1000, ttl: 24 * 60 * 60 * 1000 },
    posterCache:  { key: 'obsidian_poster_cache',  size: 2000, ttl: 7 * 24 * 60 * 60 * 1000 },
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

  // ===================== SETTINGS =====================
  const Settings = {
    qualityEnabled:   () => Lampa.Storage.get('obsidian_quality_enabled',   CONFIG.ui.qualityEnabled),
    qualityIcon:      () => Lampa.Storage.get('obsidian_quality_icon',      CONFIG.ui.qualityIcon),
    qualityColor:     () => Lampa.Storage.get('obsidian_quality_color',     CONFIG.ui.qualityColor),
    showRatings:      () => Lampa.Storage.get('obsidian_rating_enabled',    CONFIG.ui.ratingEnabled),
    ratingIcon:       () => Lampa.Storage.get('obsidian_rating_icon',       CONFIG.ui.ratingIcon),
    ratingColor:      () => Lampa.Storage.get('obsidian_rating_color',      CONFIG.ui.ratingColor),
    showReleaseYear:  () => Lampa.Storage.get('obsidian_show_release_year', CONFIG.ui.showReleaseYear),
    showEpisodeNumber:() => Lampa.Storage.get('obsidian_show_episode',      CONFIG.ui.showEpisodeNumber),
    showGenres:       () => Lampa.Storage.get('obsidian_show_genres',       CONFIG.ui.showGenres),
    replacePoster:    () => Lampa.Storage.get('obsidian_replace_poster',    CONFIG.ui.replacePoster),
    noir:             () => Lampa.Storage.get('obsidian_noir',              CONFIG.ui.noir),
    noirBadges:       () => Lampa.Storage.get('obsidian_noir_badges',       CONFIG.ui.noirBadges)
  };

  // ===================== CACHE =====================
  class Cache {
    constructor(key, maxSize, ttl) {
      this.key = key;
      this.maxSize = maxSize;
      this.ttl = ttl;
      this.data = {};
      this.order = [];
      this.lastCleanup = 0;
    }

    init() {
      try {
        const raw = Lampa.Storage.get(this.key, null);
        if (raw && typeof raw === 'object') {
          this.data = raw.data || {};
          this.order = raw.order || Object.keys(this.data);
        }
      } catch (e) {}
      this.cleanup();
      return this;
    }

    isExpired(entry, now = Date.now()) {
      return !entry || (now - entry.timestamp) > this.ttl;
    }

    get(key) {
      const entry = this.data[key];
      if (!entry) return null;
      if (this.isExpired(entry)) {
        this.remove(key);
        this.save();
        return null;
      }
      this.touch(key);
      return entry.value;
    }

    set(key, value) {
      const now = Date.now();
      if (now - this.lastCleanup > 60000) this.cleanup(now);

      if (this.order.length >= this.maxSize) {
        const half = Math.floor(this.order.length / 2);
        for (let i = 0; i < half; i++) {
          delete this.data[this.order[i]];
        }
        this.order = this.order.slice(half);
      }

      this.data[key] = { timestamp: now, value };
      this.touch(key);
      this.save();
    }

    remove(key) {
      delete this.data[key];
      const idx = this.order.indexOf(key);
      if (idx !== -1) this.order.splice(idx, 1);
    }

    touch(key) {
      const idx = this.order.indexOf(key);
      if (idx !== -1) this.order.splice(idx, 1);
      this.order.push(key);
    }

    cleanup(now = Date.now()) {
      const expired = [];
      for (const k in this.data) {
        if (this.isExpired(this.data[k], now)) expired.push(k);
      }
      expired.forEach(k => this.remove(k));
      this.lastCleanup = now;
      if (expired.length) this.save();
    }

    save() {
      try {
        Lampa.Storage.set(this.key, { data: this.data, order: this.order });
      } catch (e) {}
    }

    clear() {
      this.data = {};
      this.order = [];
      this.save();
    }
  }

  // ===================== QUEUE =====================
  class Queue {
    constructor(maxParallel = 12, maxSize = 100) {
      this.maxParallel = maxParallel;
      this.maxSize = maxSize;
      this.running = 0;
      this.pending = [];
    }

    add(fn) {
      if (this.pending.length >= this.maxSize) return;
      this.pending.push(fn);
      this.next();
    }

    next() {
      while (this.running < this.maxParallel && this.pending.length) {
        const fn = this.pending.shift();
        this.running++;
        try {
          fn(() => {
            this.running--;
            this.next();
          });
        } catch (e) {
          this.running--;
          this.next();
        }
      }
    }
  }

  // ===================== QUALITY (CrabIndex) =====================
  const qualityCache = new Cache(
    CONFIG.qualityCache.key,
    CONFIG.qualityCache.size,
    CONFIG.qualityCache.ttl
  ).init();

  const qualityQueue = new Queue(CONFIG.queue.maxParallel, CONFIG.queue.maxSize);
  const pendingCallbacks = {};

  function mapQuality(qualitys) {
    if (!Array.isArray(qualitys) || !qualitys.length) return null;
    const max = Math.max(...qualitys.map(Number).filter(n => !isNaN(n)));
    if (max >= 2160) return '4k';
    if (max >= 1080) return 'hd';
    if (max >= 720)  return 'hd';
    if (max >= 480)  return 'sd';
    return 'ts';
  }

  function buildCrabUrl(card) {
    const name = (card.title || card.name || '').trim();
    const original = (card.original_title || card.original_name || '').trim();
    if (!name && !original) return null;

    let url = CONFIG.crab.base + CONFIG.crab.qualityPath + '?take=50';
    if (name)     url += '&name=' + encodeURIComponent(name);
    if (original) url += '&originalname=' + encodeURIComponent(original);
    return url;
  }

  function pickBestQuality(data, card) {
    if (!data || typeof data !== 'object') return null;

    const year = String(
      card.release_year ||
      card.year ||
      (card.release_date || card.first_air_date || '').toString().slice(0, 4) ||
      ''
    );

    let best = null;
    let bestScore = -1;

    for (const key in data) {
      const years = data[key];
      if (!years || typeof years !== 'object') continue;

      for (const y in years) {
        const entry = years[y];
        if (!entry || !Array.isArray(entry.qualitys)) continue;

        const q = mapQuality(entry.qualitys);
        if (!q) continue;

        // приоритет: точное совпадение года + более высокое качество
        let score = 0;
        if (year && y === year) score += 100;
        if (q === '4k') score += 40;
        else if (q === 'hd') score += 20;
        else if (q === 'sd') score += 5;

        if (score > bestScore) {
          bestScore = score;
          best = q;
        }
      }
    }
    return best;
  }

  function getQuality(card, callback) {
    if (!Settings.qualityEnabled()) {
      callback(null);
      return;
    }

    const cacheKey = [
      card.kinopoisk_id || '',
      card.imdb_id || '',
      card.id || '',
      (card.title || card.name || '').toLowerCase(),
      (card.original_title || card.original_name || '').toLowerCase(),
      card.release_year || card.year || ''
    ].join('|');

    const cached = qualityCache.get(cacheKey);
    if (cached !== null && cached !== undefined) {
      callback(cached.quality || null);
      return;
    }

    if (pendingCallbacks[cacheKey]) {
      pendingCallbacks[cacheKey].push(callback);
      return;
    }
    pendingCallbacks[cacheKey] = [callback];

    const url = buildCrabUrl(card);
    if (!url) {
      finish(cacheKey, null);
      return;
    }

    qualityQueue.add((done) => {
      let finished = false;
      const timer = setTimeout(() => finish(cacheKey, null), 6000);

      function finish(key, quality) {
        if (finished) return;
        finished = true;
        clearTimeout(timer);

        qualityCache.set(key, { quality });
        const cbs = pendingCallbacks[key] || [];
        delete pendingCallbacks[key];
        cbs.forEach(cb => {
          try { cb(quality); } catch (e) {}
        });
        done();
      }

      Lampa.Network.silent(url, (res) => {
        if (res && res.status === 'success' && res.data) {
          const q = pickBestQuality(res.data, card);
          finish(cacheKey, q);
        } else {
          finish(cacheKey, null);
        }
      }, () => finish(cacheKey, null));
    });
  }

  // ===================== UI / METADATA =====================
  function createBadge(text, type) {
    const el = document.createElement('div');
    el.className = 'card__quality card__quality--' + (type || text);
    el.textContent = text.toUpperCase();
    if (Settings.noirBadges()) el.classList.add('card__quality--noir');
    return el;
  }

  function addMetadata(cardEl, card) {
    if (!cardEl || !card) return;

    // Quality
    if (Settings.qualityEnabled()) {
      getQuality(card, (quality) => {
        if (!quality) return;
        const view = cardEl.querySelector('.card__view') || cardEl;
        let badge = view.querySelector('.card__quality');
        if (!badge) {
          badge = createBadge(quality, quality);
          view.appendChild(badge);
        } else {
          badge.textContent = quality.toUpperCase();
          badge.className = 'card__quality card__quality--' + quality;
        }
      });
    }

    // Year
    if (Settings.showReleaseYear()) {
      const year = card.release_year || card.year ||
        (card.release_date || card.first_air_date || '').toString().slice(0, 4);
      if (year) {
        let yearEl = cardEl.querySelector('.card__year, .card__age');
        if (!yearEl) {
          yearEl = document.createElement('div');
          yearEl.className = 'card__year';
          const title = cardEl.querySelector('.card__title');
          if (title) title.parentNode.insertBefore(yearEl, title.nextSibling);
          else cardEl.appendChild(yearEl);
        }
        yearEl.textContent = year;
      }
    }

    // Episode number (for series)
    if (Settings.showEpisodeNumber() && (card.season_number || card.episode_number)) {
      const ep = 'S' + String(card.season_number || 0).padStart(2, '0') +
                 'E' + String(card.episode_number || 0).padStart(2, '0');
      let epEl = cardEl.querySelector('.card__episode');
      if (!epEl) {
        epEl = document.createElement('div');
        epEl.className = 'card__episode';
        cardEl.appendChild(epEl);
      }
      epEl.textContent = ep;
    }
  }

  // ===================== CARD HOOK =====================
  function patchCard() {
    const originalMap = Lampa.Maker.map('Card');
    let useCustom = false;

    // Override template slightly
    const originalTemplate = Lampa.Template.js;
    Lampa.Template.js = function (name, data) {
      if (useCustom && name === 'card') name = 'card_obsidian';
      return originalTemplate.call(Lampa.Template, name, data);
    };

    // Create custom card template once
    (function createTemplate() {
      const div = document.createElement('div');
      div.innerHTML = Lampa.Template.string('card');
      const card = div.firstElementChild;
      if (card) {
        card.classList.add('card--obsidian');
        // remove old age if present
        const age = card.querySelector('.card__age');
        if (age) age.parentNode.removeChild(age);
        Lampa.Template.add('card_obsidian', div.innerHTML);
      }
    })();

    // Hook after render
    Lampa.Listener.follow('card', (e) => {
      if (e.type === 'build' || e.type === 'update') {
        const card = e.object || e.data;
        const el = e.html || e.card;
        if (el && card) addMetadata(el, card);
      }
    });
  }

  // ===================== STYLES =====================
  function injectStyles() {
    if (document.getElementById('obsidian-styles')) return;
    const style = document.createElement('style');
    style.id = 'obsidian-styles';
    style.textContent = `
      .card--obsidian .card__quality {
        position: absolute;
        top: 6px;
        left: 6px;
        z-index: 5;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 0.7em;
        font-weight: 700;
        letter-spacing: 0.03em;
        background: rgba(0,0,0,0.75);
        color: #fff;
        pointer-events: none;
      }
      .card__quality--4k  { background: linear-gradient(135deg, #7b2ff7, #f107a3); }
      .card__quality--hd  { background: linear-gradient(135deg, #11998e, #38ef7d); }
      .card__quality--sd  { background: linear-gradient(135deg, #606c88, #3f4c6b); }
      .card__quality--ts  { background: linear-gradient(135deg, #eb3349, #f45c43); }

      .card__quality--noir {
        filter: grayscale(1);
        background: #222 !important;
        color: #ccc !important;
      }

      .card--obsidian .card__year {
        font-size: 0.85em;
        opacity: 0.7;
        margin-top: 2px;
      }

      .card--obsidian .card__episode {
        position: absolute;
        bottom: 6px;
        right: 6px;
        background: rgba(0,0,0,0.7);
        padding: 1px 5px;
        border-radius: 3px;
        font-size: 0.7em;
      }

      body.obsidian-noir .card__quality {
        filter: grayscale(0.9);
      }
    `;
    document.head.appendChild(style);
  }

  // ===================== SETTINGS PANEL =====================
  function registerSettings() {
    const component = 'obsidian';

    Lampa.SettingsApi.addComponent({
      component,
      name: 'Obsidian',
      icon: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2L2 7l10 5 10-5-10-5zm0 9l-10-5v10l10 5 10-5V6l-10 5z"/></svg>'
    });

    const params = [
      { name: 'quality_enabled',    title: 'Показывать качество',     type: 'trigger', default: true },
      { name: 'quality_icon',       title: 'Иконка качества',         type: 'trigger', default: true },
      { name: 'quality_color',      title: 'Цвет качества',           type: 'trigger', default: true },
      { name: 'rating_enabled',     title: 'Показывать рейтинг',      type: 'trigger', default: true },
      { name: 'show_release_year',  title: 'Год выхода',              type: 'trigger', default: true },
      { name: 'show_episode',       title: 'Номер серии',             type: 'trigger', default: true },
      { name: 'show_genres',        title: 'Жанры',                   type: 'trigger', default: true },
      { name: 'replace_poster',     title: 'Замена постеров',         type: 'trigger', default: true },
      { name: 'noir',               title: 'Noir-тема',               type: 'trigger', default: false },
      { name: 'noir_badges',        title: 'Noir-бейджи',             type: 'trigger', default: false }
    ];

    params.forEach(p => {
      Lampa.SettingsApi.addParam({
        component,
        param: {
          name: 'obsidian_' + p.name,
          type: p.type,
          default: p.default
        },
        field: {
          name: p.title
        },
        onChange: () => {
          if (p.name === 'noir') {
            document.body.classList.toggle('obsidian-noir', Settings.noir());
          }
        }
      });
    });

    // Кнопка очистки кэша качества
    Lampa.SettingsApi.addParam({
      component,
      param: { name: 'obsidian_clear_quality', type: 'button' },
      field: { name: 'Очистить кэш качества' },
      onChange: () => {
        qualityCache.clear();
        Lampa.Noty.show('Кэш качества очищен');
      }
    });
  }

  // ===================== INIT =====================
  function init() {
    injectStyles();
    registerSettings();
    qualityCache.init();
    patchCard();

    if (Settings.noir()) {
      document.body.classList.add('obsidian-noir');
    }

    console.log('[Obsidian] loaded with CrabIndex quality source');
  }

  if (window.appready) {
    init();
  } else {
    Lampa.Listener.follow('app', (e) => {
      if (e.type === 'ready') init();
    });
  }
})();
