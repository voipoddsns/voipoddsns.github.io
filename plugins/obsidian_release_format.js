(function () {
  'use strict';

  // ===================== CONFIG =====================
  const CRAB = 'https://crab.rip/api/v1.0/qualitys';
  const CACHE_KEY = 'obsidian_quality_cache';
  const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h
  const CACHE_SIZE = 1000;

  // ===================== SETTINGS =====================
  const S = {
    quality: () => Lampa.Storage.get('obsidian_quality_enabled', true),
    qualityColor: () => Lampa.Storage.get('obsidian_quality_color', true),
    qualityIcon: () => Lampa.Storage.get('obsidian_quality_icon', true),
    year: () => Lampa.Storage.get('obsidian_show_release_year', true),
    genres: () => Lampa.Storage.get('obsidian_show_genres', true),
    noir: () => Lampa.Storage.get('obsidian_noir', false)
  };

  // ===================== CACHE =====================
  const cache = {
    data: {},
    order: [],
    load() {
      try {
        const raw = Lampa.Storage.get(CACHE_KEY, null);
        if (raw && raw.data) {
          this.data = raw.data;
          this.order = raw.order || Object.keys(this.data);
        }
      } catch (e) {}
    },
    save() {
      try {
        Lampa.Storage.set(CACHE_KEY, { data: this.data, order: this.order });
      } catch (e) {}
    },
    get(key) {
      const e = this.data[key];
      if (!e) return undefined;
      if (Date.now() - e.ts > CACHE_TTL) {
        delete this.data[key];
        this.order = this.order.filter(k => k !== key);
        this.save();
        return undefined;
      }
      return e.v;
    },
    set(key, val) {
      if (this.order.length >= CACHE_SIZE) {
        const drop = this.order.splice(0, Math.floor(CACHE_SIZE / 2));
        drop.forEach(k => delete this.data[k]);
      }
      this.data[key] = { ts: Date.now(), v: val };
      this.order = this.order.filter(k => k !== key);
      this.order.push(key);
      this.save();
    },
    clear() {
      this.data = {};
      this.order = [];
      this.save();
    }
  };
  cache.load();

  // ===================== QUEUE =====================
  const queue = {
    running: 0,
    max: 10,
    list: [],
    add(fn) {
      this.list.push(fn);
      this.next();
    },
    next() {
      while (this.running < this.max && this.list.length) {
        const fn = this.list.shift();
        this.running++;
        fn(() => {
          this.running--;
          this.next();
        });
      }
    }
  };

  const pending = {};

  // ===================== QUALITY =====================
  function mapQ(arr) {
    if (!arr || !arr.length) return null;
    const max = Math.max(...arr.map(Number).filter(n => !isNaN(n)));
    if (max >= 2160) return '4k';
    if (max >= 1080) return 'hd';
    if (max >= 720)  return 'hd';
    if (max >= 480)  return 'sd';
    return 'ts';
  }

  function pickBest(data, card) {
    if (!data || typeof data !== 'object') return null;
    const year = String(
      card.release_year || card.year ||
      (card.release_date || card.first_air_date || '').toString().slice(0, 4) || ''
    );
    let best = null, score = -1;
    for (const k in data) {
      const years = data[k];
      if (!years) continue;
      for (const y in years) {
        const entry = years[y];
        if (!entry || !entry.qualitys) continue;
        const q = mapQ(entry.qualitys);
        if (!q) continue;
        let s = 0;
        if (year && y === year) s += 100;
        if (q === '4k') s += 40;
        else if (q === 'hd') s += 20;
        else if (q === 'sd') s += 5;
        if (s > score) { score = s; best = q; }
      }
    }
    return best;
  }

  function cacheKey(card) {
    return [
      card.kinopoisk_id || '',
      card.imdb_id || '',
      card.id || '',
      (card.title || card.name || '').toLowerCase(),
      (card.original_title || card.original_name || '').toLowerCase(),
      (card.release_date || card.first_air_date || '').toString().slice(0, 4)
    ].join('|');
  }

  function fetchQuality(card, cb) {
    if (!S.quality()) return cb(null);

    const key = cacheKey(card);
    const cached = cache.get(key);
    if (cached !== undefined) return cb(cached);

    if (pending[key]) {
      pending[key].push(cb);
      return;
    }
    pending[key] = [cb];

    const name = (card.title || card.name || '').trim();
    const original = (card.original_title || card.original_name || '').trim();
    if (!name && !original) {
      finish(key, null);
      return;
    }

    let url = CRAB + '?take=30';
    if (name) url += '&name=' + encodeURIComponent(name);
    if (original) url += '&originalname=' + encodeURIComponent(original);

    queue.add(done => {
      let doneOnce = false;
      const timer = setTimeout(() => finish(key, null), 7000);

      function finish(k, val) {
        if (doneOnce) return;
        doneOnce = true;
        clearTimeout(timer);
        cache.set(k, val);
        const cbs = pending[k] || [];
        delete pending[k];
        cbs.forEach(fn => { try { fn(val); } catch (e) {} });
        done();
      }

      Lampa.Network.silent(url, res => {
        if (res && (res.status === 'success' || res.data) && res.data) {
          finish(key, pickBest(res.data, card));
        } else {
          finish(key, null);
        }
      }, () => finish(key, null));
    });
  }

  // ===================== DOM =====================
  function makeQualityBadge(q) {
    const span = document.createElement('span');
    span.className = 'metadata__quality metadata__quality--' + q;
    if (!S.qualityColor()) span.classList.add('metadata__quality--no-color');
    span.textContent = q.toUpperCase();
    return span;
  }

  function addMeta(html, data) {
    if (!html || !data) return;
    // только tmdb/cub источники как в оригинале
    if (data.source && data.source !== 'tmdb' && data.source !== 'cub') return;

    const view = html.querySelector('.card__view') || html;
    let meta = view.querySelector('.card__metadata');
    if (!meta) {
      meta = document.createElement('div');
      meta.className = 'card__metadata';
      view.appendChild(meta);
    }

    let bottom = meta.querySelector('.metadata__bottom');
    if (!bottom) {
      bottom = document.createElement('div');
      bottom.className = 'metadata__bottom';
      meta.appendChild(bottom);
    }

    // Quality
    if (S.quality() && !bottom.querySelector('.metadata__quality')) {
      const placeholder = document.createElement('span');
      placeholder.className = 'metadata__quality';
      placeholder.style.display = 'none';
      bottom.appendChild(placeholder);

      fetchQuality(data, q => {
        if (!q) return;
        data.release_quality = q;
        placeholder.className = 'metadata__quality metadata__quality--' + q;
        if (!S.qualityColor()) placeholder.classList.add('metadata__quality--no-color');
        placeholder.textContent = q.toUpperCase();
        placeholder.style.display = '';
      });
    }

    // Year
    if (S.year() && !bottom.querySelector('.metadata__year')) {
      const y = (data.release_date || data.first_air_date || '').toString().slice(0, 4);
      if (y && y !== '0000') {
        const el = document.createElement('span');
        el.className = 'metadata__year';
        el.textContent = y;
        bottom.appendChild(el);
      }
    }
  }

  // ===================== HOOKS (как в оригинале) =====================
  function patchCards() {
    const map = Lampa.Maker.map('Card');
    if (!map || !map.Card) return;

    const origCreate = map.Card.onCreate;
    map.Card.onCreate = function () {
      const self = this;
      if (typeof origCreate === 'function') origCreate.apply(self, arguments);

      // только карточки с нормальными данными
      if (self.data && (self.data.title || self.data.name || self.data.original_title)) {
        self.data.media_type = self.data.media_type || (self.data.first_air_date ? 'tv' : 'movie');
        try {
          addMeta(self.html, self.data);
        } catch (e) {}
      }
    };

    const origVisible = map.Card.onVisible;
    map.Card.onVisible = function () {
      const self = this;
      if (typeof origVisible === 'function') origVisible.apply(self, arguments);

      // повторно на visible, если бейджа ещё нет
      if (self.data && self.html && !self.html.querySelector('.metadata__quality[style*="display: none"]') === false) {
        // уже есть
      } else if (self.data && self.html) {
        try {
          addMeta(self.html, self.data);
        } catch (e) {}
      }
    };
  }

  // ===================== STYLES =====================
  function styles() {
    if (document.getElementById('obsidian-crab-css')) return;
    const st = document.createElement('style');
    st.id = 'obsidian-crab-css';
    st.textContent = `
      .card__metadata {
        position: absolute;
        left: 0; right: 0; bottom: 0;
        z-index: 4;
        pointer-events: none;
      }
      .metadata__bottom {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        padding: 6px;
        align-items: center;
      }
      .metadata__quality {
        font-size: 0.7em;
        font-weight: 700;
        padding: 2px 6px;
        border-radius: 3px;
        background: rgba(0,0,0,0.75);
        color: #fff;
        letter-spacing: 0.03em;
      }
      .metadata__quality--4k { background: linear-gradient(135deg,#7b2ff7,#f107a3); }
      .metadata__quality--hd { background: linear-gradient(135deg,#11998e,#38ef7d); }
      .metadata__quality--sd { background: linear-gradient(135deg,#606c88,#3f4c6b); }
      .metadata__quality--ts { background: linear-gradient(135deg,#eb3349,#f45c43); }
      .metadata__quality--no-color { background: rgba(0,0,0,0.7) !important; color: #ddd; }

      .metadata__year {
        font-size: 0.75em;
        opacity: 0.85;
        background: rgba(0,0,0,0.55);
        padding: 2px 5px;
        border-radius: 3px;
      }

      /* прячем родной бейдж качества Lampa, если есть */
      .card--obsidian .card__quality,
      .card .card__quality { display: none !important; }
    `;
    document.head.appendChild(st);
  }

  // ===================== SETTINGS =====================
  function settings() {
    const comp = 'obsidian';
    if (!Lampa.SettingsApi) return;

    try {
      Lampa.SettingsApi.addComponent({
        component: comp,
        name: 'Obsidian (Crab)',
        icon: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>'
      });
    } catch (e) {}

    const params = [
      { name: 'obsidian_quality_enabled', title: 'Показывать качество', def: true },
      { name: 'obsidian_quality_color', title: 'Цвет качества', def: true },
      { name: 'obsidian_show_release_year', title: 'Год выхода', def: true },
      { name: 'obsidian_show_genres', title: 'Жанры', def: true },
      { name: 'obsidian_noir', title: 'Noir', def: false }
    ];

    params.forEach(p => {
      try {
        Lampa.SettingsApi.addParam({
          component: comp,
          param: { name: p.name, type: 'trigger', default: p.def },
          field: { name: p.title }
        });
      } catch (e) {}
    });

    try {
      Lampa.SettingsApi.addParam({
        component: comp,
        param: { name: 'obsidian_clear_cache', type: 'button' },
        field: { name: 'Очистить кэш качества' },
        onChange: () => {
          cache.clear();
          if (Lampa.Noty) Lampa.Noty.show('Кэш качества очищен');
        }
      });
    } catch (e) {}
  }

  // ===================== INIT =====================
  function init() {
    styles();
    settings();
    patchCards();
    console.log('[Obsidian] CrabIndex quality ready');
  }

  if (window.appready) init();
  else Lampa.Listener.follow('app', e => { if (e.type === 'ready') init(); });
})();
