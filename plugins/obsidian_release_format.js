(function () {
  'use strict';

  // Obsidian for Lampa — исправленная версия
  // Функции: качество CrabIndex, год, номер серии, Noir-бейджи.

  if (window.__obsidian_plugin_loaded) return;
  window.__obsidian_plugin_loaded = true;

  const CONFIG = {
    crab: {
      base: 'https://crab.rip',
      qualityPath: '/api/v1.0/qualitys'
    },
    cache: {
      key: 'obsidian_quality_cache',
      size: 1000,
      ttl: 24 * 60 * 60 * 1000
    },
    queue: {
      maxParallel: 6,
      maxPending: 100,
      timeout: 8000
    },
    defaults: {
      qualityEnabled: true,
      showReleaseYear: true,
      showEpisodeNumber: true,
      noir: false,
      noirBadges: false
    }
  };

  const storage = {
    get(key, fallback) {
      try {
        const value = Lampa.Storage.get(key, fallback);
        return value === undefined || value === null ? fallback : value;
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try { Lampa.Storage.set(key, value); } catch (e) {}
    }
  };

  const Settings = {
    qualityEnabled: () => storage.get('obsidian_quality_enabled', CONFIG.defaults.qualityEnabled),
    showReleaseYear: () => storage.get('obsidian_show_release_year', CONFIG.defaults.showReleaseYear),
    showEpisodeNumber: () => storage.get('obsidian_show_episode', CONFIG.defaults.showEpisodeNumber),
    noir: () => storage.get('obsidian_noir', CONFIG.defaults.noir),
    noirBadges: () => storage.get('obsidian_noir_badges', CONFIG.defaults.noirBadges)
  };

  class Cache {
    constructor(key, maxSize, ttl) {
      this.key = key;
      this.maxSize = maxSize;
      this.ttl = ttl;
      this.data = Object.create(null);
      this.order = [];
      this.lastCleanup = 0;
    }

    init() {
      const raw = storage.get(this.key, null);
      if (raw && typeof raw === 'object') {
        this.data = raw.data && typeof raw.data === 'object'
          ? raw.data : Object.create(null);
        this.order = Array.isArray(raw.order)
          ? raw.order.filter(key => Object.prototype.hasOwnProperty.call(this.data, key))
          : Object.keys(this.data);
      }
      this.cleanup();
      return this;
    }

    expired(entry, now) {
      return !entry || typeof entry.timestamp !== 'number' ||
        now - entry.timestamp > this.ttl;
    }

    get(key) {
      const entry = this.data[key];
      if (!entry) return undefined;
      if (this.expired(entry, Date.now())) {
        this.remove(key);
        this.save();
        return undefined;
      }
      this.touch(key);
      return entry.value;
    }

    set(key, value) {
      const now = Date.now();
      if (now - this.lastCleanup > 60000) this.cleanup(now);

      this.remove(key);
      this.data[key] = { timestamp: now, value: value };
      this.order.push(key);

      while (this.order.length > this.maxSize) {
        const oldest = this.order.shift();
        delete this.data[oldest];
      }
      this.save();
    }

    remove(key) {
      delete this.data[key];
      const index = this.order.indexOf(key);
      if (index !== -1) this.order.splice(index, 1);
    }

    touch(key) {
      const index = this.order.indexOf(key);
      if (index !== -1) this.order.splice(index, 1);
      this.order.push(key);
    }

    cleanup(now) {
      now = now || Date.now();
      Object.keys(this.data).forEach(key => {
        if (this.expired(this.data[key], now)) this.remove(key);
      });
      this.lastCleanup = now;
      this.save();
    }

    save() {
      storage.set(this.key, { data: this.data, order: this.order });
    }

    clear() {
      this.data = Object.create(null);
      this.order = [];
      this.save();
    }
  }

  class Queue {
    constructor(maxParallel, maxPending) {
      this.maxParallel = maxParallel;
      this.maxPending = maxPending;
      this.running = 0;
      this.pending = [];
    }

    add(task) {
      if (this.pending.length >= this.maxPending) return false;
      this.pending.push(task);
      this.next();
      return true;
    }

    next() {
      while (this.running < this.maxParallel && this.pending.length) {
        const task = this.pending.shift();
        this.running++;
        let released = false;
        const done = () => {
          if (released) return;
          released = true;
          this.running = Math.max(0, this.running - 1);
          this.next();
        };
        try {
          task(done);
        } catch (error) {
          done();
          console.error('[Obsidian] Queue error:', error);
        }
      }
    }
  }

  const qualityCache = new Cache(
    CONFIG.cache.key,
    CONFIG.cache.size,
    CONFIG.cache.ttl
  ).init();

  const qualityQueue = new Queue(
    CONFIG.queue.maxParallel,
    CONFIG.queue.maxPending
  );

  const pendingCallbacks = Object.create(null);

  function normalizeQualityNumber(value) {
    const match = String(value).match(/\d{3,4}/);
    return match ? parseInt(match[0], 10) : NaN;
  }

  function mapQuality(values) {
    if (!Array.isArray(values) || !values.length) return null;

    const numbers = values.map(normalizeQualityNumber).filter(Number.isFinite);
    if (!numbers.length) return null;

    const max = Math.max.apply(null, numbers);
    if (max >= 2160) return '4k';
    if (max >= 720) return 'hd';
    if (max >= 480) return 'sd';
    return 'ts';
  }

  function buildCrabUrl(card) {
    const name = String(card.title || card.name || '').trim();
    const original = String(card.original_title || card.original_name || '').trim();

    if (!name && !original) return null;

    let url = CONFIG.crab.base + CONFIG.crab.qualityPath + '?take=50';
    if (name) url += '&name=' + encodeURIComponent(name);
    if (original) url += '&originalname=' + encodeURIComponent(original);
    return url;
  }

  function getCardYear(card) {
    return String(
      card.release_year ||
      card.year ||
      (card.release_date || card.first_air_date || '').toString().slice(0, 4) ||
      ''
    );
  }

  function pickBestQuality(response, card) {
    if (!response || typeof response !== 'object') return null;

    // API может вернуть данные непосредственно или внутри поля data.
    const data = response.data && typeof response.data === 'object'
      ? response.data : response;
    const year = getCardYear(card);
    let best = null;
    let bestScore = -1;

    Object.keys(data).forEach(titleKey => {
      const years = data[titleKey];
      if (!years || typeof years !== 'object' || Array.isArray(years)) return;

      Object.keys(years).forEach(yearKey => {
        const entry = years[yearKey];
        if (!entry || !Array.isArray(entry.qualitys)) return;

        const quality = mapQuality(entry.qualitys);
        if (!quality) return;

        let score = 0;
        if (year && String(yearKey) === year) score += 100;
        if (quality === '4k') score += 40;
        else if (quality === 'hd') score += 20;
        else if (quality === 'sd') score += 5;

        if (score > bestScore) {
          bestScore = score;
          best = quality;
        }
      });
    });

    return best;
  }

  function makeCacheKey(card) {
    return [
      card.kinopoisk_id || '',
      card.imdb_id || '',
      card.id || '',
      String(card.title || card.name || '').toLowerCase(),
      String(card.original_title || card.original_name || '').toLowerCase(),
      getCardYear(card)
    ].join('|');
  }

  function finishRequest(cacheKey, quality) {
    qualityCache.set(cacheKey, quality || null);
    const callbacks = pendingCallbacks[cacheKey] || [];
    delete pendingCallbacks[cacheKey];

    callbacks.forEach(callback => {
      try { callback(quality || null); } catch (e) {
        console.error('[Obsidian] Callback error:', e);
      }
    });
  }

  function getQuality(card, callback) {
    if (!card || typeof callback !== 'function') return;

    if (!Settings.qualityEnabled()) {
      callback(null);
      return;
    }

    const cacheKey = makeCacheKey(card);
    const cached = qualityCache.get(cacheKey);

    // null также является закэшированным результатом (отрицательный кэш).
    if (cached !== undefined) {
      callback(cached);
      return;
    }

    if (pendingCallbacks[cacheKey]) {
      pendingCallbacks[cacheKey].push(callback);
      return;
    }

    pendingCallbacks[cacheKey] = [callback];
    const url = buildCrabUrl(card);

    if (!url) {
      finishRequest(cacheKey, null);
      return;
    }

    const accepted = qualityQueue.add(done => {
      let finished = false;
      const finish = quality => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        finishRequest(cacheKey, quality);
        done();
      };

      const timer = setTimeout(() => finish(null), CONFIG.queue.timeout);

      try {
        Lampa.Network.silent(url, response => {
          if (!response) {
            finish(null);
            return;
          }

          // В некоторых сборках Lampa ответ уже распарсен, в других
          // обёрнут в {status: "success", data: ...}.
          if (response.status && response.status !== 'success') {
            finish(null);
            return;
          }

          finish(pickBestQuality(response, card));
        }, () => finish(null));
      } catch (error) {
        console.error('[Obsidian] CrabIndex request error:', error);
        finish(null);
      }
    });

    if (!accepted) {
      // Не оставляем ожидающие callback навсегда, если очередь переполнена.
      finishRequest(cacheKey, null);
    }
  }

  function createBadge(quality) {
    const badge = document.createElement('div');
    badge.className = 'card__quality card__quality--' + quality;
    badge.textContent = quality.toUpperCase();

    if (Settings.noirBadges()) badge.classList.add('card__quality--noir');
    return badge;
  }

  function addQualityBadge(cardElement, card) {
    if (!cardElement || !card) return;

    getQuality(card, quality => {
      if (!quality) return;

      // Не добавляем бейдж в уже удалённую карточку.
      if (typeof cardElement.isConnected === 'boolean' && !cardElement.isConnected) return;

      const view = cardElement.querySelector('.card__view') || cardElement;
      let badge = view.querySelector('.card__quality');

      if (!badge) {
        badge = createBadge(quality);
        view.appendChild(badge);
      } else {
        badge.className = 'card__quality card__quality--' + quality;
        if (Settings.noirBadges()) badge.classList.add('card__quality--noir');
        badge.textContent = quality.toUpperCase();
      }
    });
  }

  function addYear(cardElement, card) {
    if (!Settings.showReleaseYear()) return;

    const year = getCardYear(card);
    if (!year) return;

    let yearElement = cardElement.querySelector('.card__year');
    if (!yearElement) {
      yearElement = document.createElement('div');
      yearElement.className = 'card__year';

      const title = cardElement.querySelector('.card__title');
      if (title && title.parentNode) {
        title.parentNode.insertBefore(yearElement, title.nextSibling);
      } else {
        cardElement.appendChild(yearElement);
      }
    }

    yearElement.textContent = year;
  }

  function addEpisode(cardElement, card) {
    if (!Settings.showEpisodeNumber()) return;

    const season = card.season_number;
    const episode = card.episode_number;
    if (season === undefined && episode === undefined) return;

    const label = 'S' + String(season || 0).padStart(2, '0') +
      'E' + String(episode || 0).padStart(2, '0');

    let element = cardElement.querySelector('.card__episode');
    if (!element) {
      element = document.createElement('div');
      element.className = 'card__episode';
      (cardElement.querySelector('.card__view') || cardElement).appendChild(element);
    }
    element.textContent = label;
  }

  function resolveCardEvent(event) {
    const object = event && event.object;
    const isCardData = value => value && typeof value === 'object' &&
      (value.title || value.name || value.original_title || value.original_name);

    let card = object && (object.card_data || object.card);
    if (!isCardData(card) && isCardData(object)) card = object;
    if (!isCardData(card) && event) {
      card = isCardData(event.data) ? event.data :
        (isCardData(event.card) ? event.card : null);
    }

    let html = (object && (object.html || object.element || object.$html)) ||
      (event && (event.html || event.element || event.card_element));

    // В отдельных версиях e.card содержит DOM-элемент, а не данные карточки.
    if (!html && event && event.card && event.card.nodeType) html = event.card;

    // Некоторые версии Lampa передают jQuery-подобную обёртку.
    if (html && !html.nodeType && html[0] && html[0].nodeType) html = html[0];

    return {
      card: isCardData(card) ? card : null,
      element: html && html.nodeType === 1 ? html : null
    };
  }

  function onCardEvent(event) {
    if (!event || (event.type !== 'build' && event.type !== 'update')) return;

    const resolved = resolveCardEvent(event);
    if (!resolved.card || !resolved.element) return;

    addQualityBadge(resolved.element, resolved.card);
    addYear(resolved.element, resolved.card);
    addEpisode(resolved.element, resolved.card);
  }

  function injectStyles() {
    if (document.getElementById('obsidian-styles')) return;

    const style = document.createElement('style');
    style.id = 'obsidian-styles';
    style.textContent = `
      .card__view { position: relative; }

      .card__quality {
        position: absolute;
        top: 6px;
        left: 6px;
        z-index: 20;
        padding: 3px 7px;
        border-radius: 4px;
        font-size: 0.7em;
        line-height: 1.2;
        font-weight: 700;
        letter-spacing: .03em;
        color: #fff;
        background: rgba(0,0,0,.78);
        pointer-events: none;
      }
      .card__quality--4k {
        background: linear-gradient(135deg, #7b2ff7, #f107a3);
      }
      .card__quality--hd {
        background: linear-gradient(135deg, #11998e, #38ef7d);
      }
      .card__quality--sd {
        background: linear-gradient(135deg, #606c88, #3f4c6b);
      }
      .card__quality--ts {
        background: linear-gradient(135deg, #eb3349, #f45c43);
      }
      .card__quality--noir,
      body.obsidian-noir .card__quality {
        filter: grayscale(1);
        background: #292929 !important;
        color: #ddd !important;
      }
      .card__year {
        font-size: .85em;
        opacity: .72;
        margin-top: 2px;
      }
      .card__episode {
        position: absolute;
        right: 6px;
        bottom: 6px;
        z-index: 10;
        padding: 2px 6px;
        border-radius: 3px;
        color: #fff;
        background: rgba(0,0,0,.78);
        font-size: .7em;
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
  }

  function registerSettings() {
    if (!Lampa.SettingsApi || !Lampa.SettingsApi.addComponent ||
        !Lampa.SettingsApi.addParam) {
      console.warn('[Obsidian] SettingsApi is unavailable');
      return;
    }

    const component = 'obsidian';

    Lampa.SettingsApi.addComponent({
      component: component,
      name: 'Obsidian',
      icon: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2L2 7l10 5 10-5-10-5zm0 9l-10-5v10l10 5 10-5V6l-10 5z"/></svg>'
    });

    const params = [
      { name: 'quality_enabled', title: 'Показывать качество', value: CONFIG.defaults.qualityEnabled },
      { name: 'show_release_year', title: 'Год выхода', value: CONFIG.defaults.showReleaseYear },
      { name: 'show_episode', title: 'Номер серии', value: CONFIG.defaults.showEpisodeNumber },
      { name: 'noir', title: 'Noir-тема', value: CONFIG.defaults.noir },
      { name: 'noir_badges', title: 'Монохромные бейджи', value: CONFIG.defaults.noirBadges }
    ];

    params.forEach(param => {
      Lampa.SettingsApi.addParam({
        component: component,
        param: {
          name: 'obsidian_' + param.name,
          type: 'trigger',
          default: param.value
        },
        field: { name: param.title },
        onChange: () => {
          if (param.name === 'noir') {
            document.body.classList.toggle('obsidian-noir', !!Settings.noir());
          }
          if (param.name === 'quality_enabled') {
            // Изменение настройки применяется к новым/обновлённым карточкам.
            qualityCache.clear();
          }
        }
      });
    });

    Lampa.SettingsApi.addParam({
      component: component,
      param: { name: 'obsidian_clear_quality', type: 'button' },
      field: { name: 'Очистить кэш качества' },
      onChange: () => {
        qualityCache.clear();
        if (Lampa.Noty && Lampa.Noty.show) {
          Lampa.Noty.show('Кэш качества очищен');
        }
      }
    });
  }

  function init() {
    if (window.__obsidian_initialized) return;
    window.__obsidian_initialized = true;

    try {
      injectStyles();
      qualityCache.init();
      registerSettings();

      if (Lampa.Listener && Lampa.Listener.follow) {
        Lampa.Listener.follow('card', onCardEvent);
      } else {
        console.error('[Obsidian] Lampa.Listener.follow is unavailable');
      }

      document.body.classList.toggle('obsidian-noir', !!Settings.noir());
      console.log('[Obsidian] loaded');
    } catch (error) {
      window.__obsidian_initialized = false;
      console.error('[Obsidian] initialization error:', error);
    }
  }

  function start() {
    if (window.appready) {
      init();
    } else if (Lampa.Listener && Lampa.Listener.follow) {
      Lampa.Listener.follow('app', event => {
        if (event && event.type === 'ready') init();
      });
    } else {
      console.error('[Obsidian] Lampa app-ready event is unavailable');
    }
  }

  start();
})();
