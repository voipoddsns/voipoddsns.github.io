/* ============================================================
 *  Obsidian Plugin — refactored + JacRed quality integration
 *  Замена приватного API {url, token} на публичный jac.red
 * ============================================================ */

(function () {
  "use strict";

  if (window.__obsidian_plugin_loaded) return;
  window.__obsidian_plugin_loaded = true;

  const isObject = (v) => typeof v === "object" && v !== null;

  function debounce(fn, wait) {
    let t;
    return function () {
      const ctx = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(ctx, args), wait);
    };
  }

  /* ============================================================
   *  LRU-ish cache with TTL
   * ============================================================ */
  function createCache(key, maxSize, ttl) {
    let data = {};
    let order = [];
    let lastSweep = 0;
    const save = debounce(() => {
      try { Lampa.Storage.set(key, { v: 2, data, order }); }
      catch (e) { console.warn("Cache save error:", e); }
    }, 500);

    const isExpired = (entry, now) =>
      !entry || typeof entry.timestamp !== "number" || entry.timestamp <= now - ttl;

    const remove = (k) => {
      delete data[k];
      const i = order.indexOf(k);
      if (i > -1) order.splice(i, 1);
    };
    const touch = (k) => {
      const i = order.indexOf(k);
      if (i > -1) order.splice(i, 1);
      order.push(k);
    };

    function trim(now) {
      const expired = [];
      for (const k in data) if (isExpired(data[k], now)) expired.push(k);
      expired.forEach(remove);
      if (order.length > maxSize) {
        const drop = order.slice(0, Math.floor(order.length / 2));
        drop.forEach((k) => delete data[k]);
        order = order.slice(drop.length);
      }
      return expired.length > 0;
    }

    return {
      init() {
        try {
          const raw = Lampa.Storage.get(key, {});
          if (raw && raw.v === 2 && raw.data) {
            data = raw.data || {};
            order = Array.isArray(raw.order) ? raw.order : [];
          } else {
            data = isObject(raw) ? raw : {};
            order = [];
          }
          const seen = {};
          const clean = [];
          for (const k of order) {
            if (!seen[k] && Object.prototype.hasOwnProperty.call(data, k)) {
              seen[k] = 1; clean.push(k);
            }
          }
          for (const k in data) {
            if (!seen[k]) { seen[k] = 1; clean.push(k); }
          }
          order = clean;
        } catch (e) {
          console.warn("Cache init error:", e);
          data = {}; order = [];
        }
      },
      get(k) {
        const entry = data[k];
        if (!entry) return null;
        if (isExpired(entry, Date.now())) { remove(k); save(); return null; }
        touch(k);
        return entry.value;
      },
      set(k, value) {
        const now = Date.now();
        if (now - lastSweep >= 60000) {
          if (trim(now)) save();
          lastSweep = now;
        }
        data[k] = { timestamp: now, value };
        touch(k);
        if (order.length > maxSize) trim(now);
        save();
      },
      clear() { data = {}; order = []; save(); },
    };
  }

  /* ============================================================
   *  Defaults & config
   * ============================================================ */
  const DEFAULTS = {
    ui: {
      qualityEnabled: true, qualityIcon: true, qualityColor: true,
      ratingEnabled: true,  ratingIcon: true,  ratingColor: true,
      showReleaseYear: true, showEpisodeNumber: true, showGenres: true,
      replacePoster: true, noir: false, noirBadges: false,
    },
    qualityCache: { key: "obsidian_jacred_cache_v2", size: 1000, time: 72 * 60 * 60 * 1000 },
    posterCache:  { key: "obsidian_poster_cache",  size: 2000, time: 604800000 },
    queue: { maxParallel: 8, maxSize: 200 },
  };

  const storageFlag = (k, d) => Lampa.Storage.get(k, d);
  const cfg = {
    qualityEnabled: () => storageFlag("obsidian_quality_enabled", DEFAULTS.ui.qualityEnabled),
    qualityIcon:    () => storageFlag("obsidian_quality_icon",    DEFAULTS.ui.qualityIcon),
    qualityColor:   () => storageFlag("obsidian_quality_color",   DEFAULTS.ui.qualityColor),
    showRatings:    () => storageFlag("obsidian_rating_enabled",  DEFAULTS.ui.ratingEnabled),
    ratingIcon:     () => storageFlag("obsidian_rating_icon",     DEFAULTS.ui.ratingIcon),
    ratingColor:    () => storageFlag("obsidian_rating_color",    DEFAULTS.ui.ratingColor),
    showReleaseYear:() => storageFlag("obsidian_show_release_year", DEFAULTS.ui.showReleaseYear),
    showEpisodeNumber:() => storageFlag("obsidian_show_episode_number", DEFAULTS.ui.showEpisodeNumber),
    showGenres:     () => storageFlag("obsidian_show_genres",     DEFAULTS.ui.showGenres),
    replacePoster:  () => storageFlag("obsidian_replace_poster",  DEFAULTS.ui.replacePoster),
    noir:           () => storageFlag("obsidian_noir",            DEFAULTS.ui.noir),
    noirBadges:     () => storageFlag("obsidian_noir_badges",     DEFAULTS.ui.noirBadges),
    qualityCache: DEFAULTS.qualityCache,
    posterCache:  DEFAULTS.posterCache,
  };

  /* ============================================================
   *  Throttled request queue (для JacRed)
   * ============================================================ */
  const requestQueue = {
    _q: [],
    active: 0,
    maxParallel: DEFAULTS.queue.maxParallel,
    maxSize: DEFAULTS.queue.maxSize,
    add(task, onDrop) {
      if (this._q.length >= this.maxSize) {
        if (typeof onDrop === "function") onDrop();
        return;
      }
      this._q.push(task);
      this._process();
    },
    _process() {
      while (this.active < this.maxParallel && this._q.length) {
        const task = this._q.shift();
        this.active++;

        let finished = false;
        const done = () => {
          if (finished) return;
          finished = true;
          this.active = Math.max(0, this.active - 1);
          this._process();
        };

        try {
          task(done);
        } catch (e) {
          console.warn("JacRed queue task error:", e);
          done();
        }
      }
    },
    clear() {
      this._q = [];
    },
  };

  /* ============================================================
   *  JacRed quality fetcher
   * ============================================================ */
  function JACRED_URL() {
    let host = String(Lampa.Storage.get("jac.red") || "jac.red").trim();
    if (!host) host = "jac.red";
    host = host.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
    return "https://" + host;
  }

  const JACRED_OLD_CACHE_KEY = "obsidian_jacred_cache";
  const JACRED_NEG_TTL = 6 * 60 * 60 * 1000;
  const JACRED_PROXY_LIST = [
    "https://api.allorigins.win/raw?url=",
    "https://cors.bwa.workers.dev/",
  ];
  const JACRED_PROXY_TIMEOUT = 5000;
  const JACRED_CAM_RE = /\b(ts|hdts|telesync|camrip|hdcam|cam|tc)\b/i;

  const qualityCache = createCache(
    cfg.qualityCache.key, cfg.qualityCache.size, cfg.qualityCache.time
  );

  function jacredCacheGet(key) {
    const v = qualityCache.get(key);
    if (!v || typeof v !== "object") return null;
    if (!v.quality && Date.now() - (v.at || 0) > JACRED_NEG_TTL) return null;
    return v;
  }

  function jacredCacheSet(key, data) {
    qualityCache.set(key, Object.assign({}, data, { at: Date.now() }));
  }

  function jacredFetch(url, callback) {
    const sources = [url].concat(
      JACRED_PROXY_LIST.map((p) => p + encodeURIComponent(url))
    );
    let settled = false;
    let started = 0;
    let failedCount = 0;
    const timers = [];

    const finish = (err, text) => {
      if (settled) return;
      settled = true;
      timers.forEach(clearTimeout);
      callback(err, text);
    };

    const startNext = () => {
      if (settled || started >= sources.length) return;
      const src = sources[started++];
      let advanced = false;

      const advance = () => {
        if (advanced) return;
        advanced = true;
        startNext();
      };

      timers.push(setTimeout(() => {
        if (settled) return;
        if (started >= sources.length) finish(new Error("timeout"));
        else advance();
      }, JACRED_PROXY_TIMEOUT));

      fetch(src)
        .then((r) => { if (!r.ok) throw new Error("http " + r.status); return r.text(); })
        .then((t) => finish(null, t))
        .catch(() => {
          failedCount++;
          if (failedCount >= sources.length) finish(new Error("all sources failed"));
          else advance();
        });
    };

    startNext();
  }

  function jacredPickBest(torrents) {
    if (!Array.isArray(torrents) || !torrents.length) return null;
    let best = null, bestQ = -1;
    let camrip = null, camripQ = -1;

    for (const t of torrents) {
      if (!t) continue;
      const title = String(t.title || "").toLowerCase();
      const q = t.quality;
      if (typeof q !== "number" || q === 0) continue;

      if (JACRED_CAM_RE.test(title)) {
        if (q >= 720 && q > camripQ) { camrip = t; camripQ = q; }
      } else {
        if (q > bestQ) { best = t; bestQ = q; }
      }
    }

    if (best)   return { torrent: best,   numeric: bestQ,   isCamrip: false };
    if (camrip) return { torrent: camrip, numeric: camripQ, isCamrip: true };
    return null;
  }

  function jacredTranslate(numeric, isCamrip) {
    if (isCamrip) return "camrip";
    if (numeric >= 2160) return "4k";
    if (numeric >= 1080) return "hd";
    if (numeric >= 720)  return "hd";
    if (numeric > 0)     return "sd";
    return null;
  }

  const jacredPending = {};

  function fetchQualityFromJacRed(item, callback) {
    const type = item.media_type || (item.first_air_date || item.name ? "tv" : "movie");
    const cacheKey = type + "_" + item.id;
    const cached = jacredCacheGet(cacheKey);
    if (cached) { callback(cached.quality ? cached : null); return; }

    const year = String(item.release_date || item.first_air_date || "").slice(0, 4);
    if (!year || isNaN(year)) { callback(null); return; }

    if (jacredPending[cacheKey]) { jacredPending[cacheKey].push(callback); return; }
    jacredPending[cacheKey] = [callback];

    const finish = (res) => {
      const list = jacredPending[cacheKey] || [];
      delete jacredPending[cacheKey];
      list.forEach((cb) => {
        try { cb(res); } catch (e) { console.warn("JacRed callback error:", e); }
      });
    };

    const strategies = [];
    const push = (v) => {
      if (!v || !/[a-zа-яёіїє0-9]/i.test(v)) return;
      v = String(v).trim();
      if (v && strategies.indexOf(v) === -1) strategies.push(v);
    };
    push(item.original_title);
    push(item.title);
    push(item.original_name);
    push(item.name);

    if (!strategies.length) { finish(null); return; }

    let idx = 0;
    let hadError = false;

    const tryNext = () => {
      if (idx >= strategies.length) {
        if (!hadError) jacredCacheSet(cacheKey, { quality: null });
        finish(null);
        return;
      }
      const title = strategies[idx++];
      const url = JACRED_URL() +
        "/api/v1.0/torrents?search=" + encodeURIComponent(title) +
        "&year=" + year + "&exact=true";

      requestQueue.add((done) => {
        jacredFetch(url, (err, text) => {
          done();
          if (err || !text) { hadError = true; tryNext(); return; }
          let torrents;
          try { torrents = JSON.parse(text); } catch (_) { hadError = true; tryNext(); return; }

          const best = jacredPickBest(torrents);
          if (!best) { tryNext(); return; }

          const quality = jacredTranslate(best.numeric, best.isCamrip);
          if (!quality) { tryNext(); return; }

          const result = {
            quality: quality,
            uhd: quality === "4k",
            camrip: best.isCamrip,
            title: best.torrent.title,
          };
          jacredCacheSet(cacheKey, result);
          finish(result);
        });
      }, () => finish(null));
    };
    tryNext();
  }

  /* ============================================================
   *  Genres
   * ============================================================ */
  const GENRES = {
    movie: [
      { id: 28, title: "#{filter_genre_ac}" }, { id: 12, title: "#{filter_genre_ad}" },
      { id: 16, title: "#{filter_genre_mv}" }, { id: 35, title: "#{filter_genre_cm}" },
      { id: 80, title: "#{filter_genre_cr}" }, { id: 99, title: "#{filter_genre_dc}" },
      { id: 18, title: "#{filter_genre_dr}" }, { id: 10751, title: "#{filter_genre_fm}" },
      { id: 14, title: "#{filter_genre_fe}" }, { id: 36, title: "#{filter_genre_hi}" },
      { id: 27, title: "#{filter_genre_ho}" }, { id: 10402, title: "#{filter_genre_mu}" },
      { id: 9648, title: "#{filter_genre_de}" }, { id: 10749, title: "#{filter_genre_md}" },
      { id: 878, title: "#{filter_genre_fa}" }, { id: 10770, title: "#{filter_genre_tv}" },
      { id: 53, title: "#{filter_genre_tr}" }, { id: 10752, title: "#{filter_genre_mi}" },
      { id: 37, title: "#{filter_genre_ve}" },
    ],
    tv: [
      { id: 10759, title: "#{filter_genre_aa}" }, { id: 16, title: "#{filter_genre_mv}" },
      { id: 35, title: "#{filter_genre_cm}" }, { id: 80, title: "#{filter_genre_cr}" },
      { id: 99, title: "#{filter_genre_dc}" }, { id: 18, title: "#{filter_genre_dr}" },
      { id: 10751, title: "#{filter_genre_fm}" }, { id: 10762, title: "#{filter_genre_ch}" },
      { id: 9648, title: "#{filter_genre_de}" }, { id: 10763, title: "#{filter_genre_nw}" },
      { id: 10764, title: "#{filter_genre_rs}" }, { id: 10765, title: "#{filter_genre_hf}" },
      { id: 10766, title: "#{filter_genre_op}" }, { id: 10767, title: "#{filter_genre_tc}" },
      { id: 10768, title: "#{filter_genre_mp}" }, { id: 37, title: "#{filter_genre_ve}" },
    ],
  };
  const genreIndex = {};
  for (const t in GENRES) {
    genreIndex[t] = GENRES[t].reduce((a, g) => (a[g.id] = g.title, a), {});
  }

  function getGenres(item) {
    const type = item.name || item.first_air_date ? "tv" : "movie";
    const ids = item.genre_ids || [];
    const idx = genreIndex[type] || {};
    const out = [];
    for (const id of ids) {
      if (idx[id]) out.push(Lampa.Utils.capitalizeFirstLetter(Lampa.Lang.translate(idx[id])));
      if (out.length >= 2) break;
    }
    return out;
  }

  function toggleBodyClass(cls, on) {
    const body = document.body;
    if (!body) return;
    body.classList.toggle(cls, !!on);
  }

  function applyNoir() {
    const noir = cfg.noir();
    toggleBodyClass("obsidian--noir", noir);
    toggleBodyClass("obsidian--noir-badges", noir && cfg.noirBadges());
  }

  function createSvg(symbolId, className, viewBox) {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", className);
    svg.setAttribute("viewBox", viewBox);
    const use = document.createElementNS(NS, "use");
    use.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", "#" + symbolId);
    use.setAttribute("href", "#" + symbolId);
    svg.appendChild(use);
    return svg;
  }

  function ratingClass(rating) {
    const n = parseFloat(rating);
    if (isNaN(n)) return "";
    if (n >= 8 && n <= 10) return "rating-excellent";
    if (n >= 6.5 && n < 8) return "rating-good";
    if (n >= 5 && n < 6.5) return "rating-average";
    if (n >= 3 && n < 5) return "rating-poor";
    if (n >= 0 && n < 3) return "rating-terrible";
    return "";
  }

  function renderRating(parent, item) {
    if (!cfg.showRatings()) return;
    const raw = item.imdb_rating || item.kp_rating || item.vote_average || 0;
    const rating = parseFloat(raw || 0).toFixed(1);
    if (parseFloat(rating) === 0) return;

    const span = document.createElement("span");
    span.className = "metadata__rating";
    if (cfg.ratingColor()) {
      const cls = ratingClass(rating);
      if (cls) span.classList.add(cls);
    } else {
      span.classList.add("metadata__rating--no-color");
    }
    if (cfg.ratingIcon()) {
      span.appendChild(createSvg("rating-star", "metadata__rating-icon", "0 0 24 23"));
    }
    const val = document.createElement("span");
    val.className = "metadata__rating-value";
    val.textContent = rating;
    span.appendChild(val);
    parent.appendChild(span);
  }

  const QUALITY_ICONS = { ts: "low", hd: "medium", "4k": "high", sd: "low", camrip: "low" };

  function renderQuality(parent, item) {
    if (!cfg.qualityEnabled()) return;
    const old = parent.querySelectorAll(".metadata__quality");
    for (let i = 0; i < old.length; i++) old[i].parentNode.removeChild(old[i]);
    const wrap = document.createElement("span");
    wrap.className = "metadata__quality";
    wrap.style.display = "none";
    parent.appendChild(wrap);

    fetchQualityFromJacRed(item, (res) => {
      if (!res || !res.quality) return;
      const q = res.quality;
      wrap.className = "metadata__quality metadata__quality--" + q;
      if (!cfg.qualityColor()) wrap.classList.add("metadata__quality--no-color");

      wrap.textContent = "";
      if (cfg.qualityIcon()) {
        const icon = QUALITY_ICONS[q];
        if (icon) wrap.appendChild(createSvg(icon, "metadata__quality-icon", "0 0 24 24"));
      }
      const label = document.createElement("span");
      label.className = "metadata__quality-label";
      label.textContent = q === "camrip" ? "CAM" : q.toUpperCase();
      wrap.appendChild(label);
      wrap.style.display = "";
    });
  }

  function renderYear(parent, item) {
    if (!cfg.showReleaseYear()) return;
    const year = String(item.release_date || item.first_air_date || "").slice(0, 4);
    if (!year || year === "0000") return;
    const span = document.createElement("span");
    span.className = "metadata__year";
    span.textContent = year;
    parent.appendChild(span);
  }

  function renderMetadata(view, item, compact) {
    if (!view) return;
    const prev = view.querySelectorAll(".card__metadata");
    for (let i = 0; i < prev.length; i++) prev[i].parentNode.removeChild(prev[i]);
    const root = document.createElement("div");
    root.className = "card__metadata";
    const bottom = document.createElement("div");
    bottom.className = "metadata__bottom";
    const left = document.createElement("div");
    const right = document.createElement("div");

    if (!compact) {
      if (cfg.showGenres()) {
        const genres = getGenres(item);
        if (genres.length) {
          const g = document.createElement("div");
          g.className = "metadata__genres";
          g.textContent = genres.join(", ");
          root.appendChild(g);
        }
      }
      const title = item.title || item.name || item.original_title || item.original_name || "";
      if (title) {
        const t = document.createElement("div");
        t.className = "metadata__title";
        t.textContent = title;
        root.appendChild(t);
      }
    }

    renderRating(left, item);
    renderYear(right, item);

    bottom.appendChild(left);
    bottom.appendChild(right);
    root.appendChild(bottom);
    view.appendChild(root);
  }

  function isTv(item) {
    return (item.media_type || (item.first_air_date ? "tv" : "movie")) === "tv";
  }

  function ensureTvIcon(el) {
    if (!el || el._obsidianIcon) return;
    el._obsidianIcon = true;
    el.textContent = "";
    el.appendChild(createSvg("sprite-tv-show", "card__type-icon", "0 0 51.802 51.801"));
  }

  const EPISODE_TTL = 6 * 60 * 60 * 1000;
  const episodeCache = {};
  const episodePending = {};

  function fetchLastEpisode(id, cb) {
    const hit = episodeCache[id];
    if (hit && Date.now() - hit.t < EPISODE_TTL) { cb(hit.ep); return; }
    if (episodePending[id]) { episodePending[id].push(cb); return; }
    episodePending[id] = [cb];

    const flush = (ep, ok) => {
      const list = episodePending[id] || [];
      delete episodePending[id];
      if (ok) episodeCache[id] = { t: Date.now(), ep };
      list.forEach((fn) => { try { fn(ok ? ep : undefined, ok); } catch (_) {} });
    };

    Lampa.Network.silent(
      Lampa.TMDB.api("tv/" + id + "?api_key=" + Lampa.TMDB.key()),
      (resp) => flush(resp && resp.last_episode_to_air ? resp.last_episode_to_air : null, true),
      () => flush(null, false)
    );
  }

  const cardHooks = {
    onCreate() {
      if (!isTv(this.data)) return;
      ensureTvIcon(this.html.querySelector(".card__type"));
    },
    onVisible() {
      const item = this.data;
      if (!isTv(item)) return;
      const el = this.html.querySelector(".card__type");
      if (!el) return;
      ensureTvIcon(el);

      if (cfg.showEpisodeNumber() && !el._obsidianEpisode) {
        el._obsidianEpisode = true;
        fetchLastEpisode(item.id, (ep, ok) => {
          if (ok === false) { el._obsidianEpisode = false; return; }
          if (!ep || el.querySelector(".card__type-label")) return;
          const label = document.createElement("span");
          label.className = "card__type-label";
          label.textContent = "S" + ep.season_number + ":E" + ep.episode_number;
          el.classList.add("episode_metadata");
          el.appendChild(label);
        });
      }
    },
  };

  /* ============================================================
   *  Poster replacement
   * ============================================================ */
  const NEGATIVE = "@none";
  const posterCache = createCache(cfg.posterCache.key, cfg.posterCache.size, cfg.posterCache.time);

  function tmdbImageUrl(path) {
    if (!path) return null;
    if (/^https?:\/\//.test(path) || path.indexOf("//") === 0) return path;
    if (path.charAt(0) !== "/") path = "/" + path;
    return Lampa.TMDB.image("t/p/w780" + path);
  }

  function fetchPoster(item, cb) {
    if (!item || !item.id || !item.media_type) return cb(null, false);
    const key = item.media_type + "_" + item.id;
    const cached = posterCache.get(key);
    if (cached === NEGATIVE) return cb(null, false);
    if (cached) return cb(cached, true);

    const url = Lampa.TMDB.api(
      item.media_type + "/" + item.id + "/images?include_image_language=null&api_key=" + Lampa.TMDB.key()
    );
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; cb(null, false); }, 2000);

    Lampa.Network.silent(
      url,
      (resp) => {
        clearTimeout(timer);
        const file = resp && resp.posters && resp.posters[0] ? resp.posters[0].file_path : null;
        posterCache.set(key, file || NEGATIVE);
        if (file) cb(file, true);
        else if (!timedOut) cb(null, false);
      },
      () => {
        clearTimeout(timer);
        if (!timedOut) cb(null, false);
      }
    );
  }

  function hookPosterReplacement(card) {
    const item = card.data;
    const original = item.poster_path || item.backdrop_path;
    const BROKEN = "./img/img_broken.svg";
    const LOADING = "./img/img_load.svg";
    const failed = {};

    card.appliedPoster = null;
    card.posterReplaced = false;
    card.nativeGetPosterPath = card.getPosterPath;
    card.getPosterPath = () => card.appliedPoster || LOADING;

    const fallback = () => {
      if (!card.img || !card.img.parentNode) return;
      if (card.appliedPoster) failed[card.appliedPoster] = true;

      const candidates = [];
      if (typeof card.nativeGetPosterPath === "function") {
        try { candidates.push(card.nativeGetPosterPath.call(card)); } catch (_) {}
      }
      candidates.push(tmdbImageUrl(original), BROKEN);

      let src = BROKEN;
      for (const c of candidates) {
        if (c && c !== LOADING && !failed[c]) { src = c; break; }
      }
      card.appliedPoster = src;
      card.img.onerror = src === BROKEN ? null : fallback;
      card.img.src = src;
    };

    const apply = (src) => {
      if (!card.img || !card.img.parentNode) return;
      card.posterReplaced = true;
      card.appliedPoster = src;
      card.img.onerror = fallback;
      card.img.src = src;
    };

    const timer = setTimeout(() => { if (!card.posterReplaced) fallback(); }, 2000);

    fetchPoster(item, (path) => {
      clearTimeout(timer);
      if (!path) { if (!card.posterReplaced) fallback(); return; }
      const url = tmdbImageUrl(path);
      if (!url) { if (!card.posterReplaced) fallback(); return; }
      if (card.img && (card.img.src || "").indexOf(url) > -1) { apply(url); return; }
      const probe = new Image();
      probe.onload = () => apply(url);
      probe.onerror = () => { if (!card.posterReplaced) fallback(); };
      probe.src = url;
    });
  }

  /* ============================================================
   *  Card patch
   * ============================================================ */
  const CARD_TEMPLATE_ID = "card_obsidian";

  function isObsidianCard(card) {
    return !!(card && card.data && (card.data.source === "tmdb" || card.data.source === "cub"));
  }

  function patchCards() {
    const maker = Lampa.Maker.map("Card");
    if (!maker || !maker.Card) {
      console.warn("Obsidian: Lampa Card maker is unavailable");
      return;
    }

    const origOnCreate = maker.Card.onCreate;
    maker.Card.onCreate = function () {
      const card = this;
      const isWide = card.params && card.params.style && card.params.style.name === "wide";
      const obsidian = isObsidianCard(card);

      card.obsidian = obsidian;
      card.refreshPoster = cfg.replacePoster() && !isWide && obsidian && card.data.original_language;

      if (typeof origOnCreate === "function") origOnCreate.apply(card, arguments);

      if (card.data && (
        card.data.gender !== undefined ||
        card.data.known_for !== undefined ||
        card.data.known_for_department !== undefined
      )) {
        card.html.classList.add("obsidian--no-noir");
      }

      if (obsidian && (card.data.original_name || card.data.title)) {
        card.data.media_type = card.data.media_type || (card.data.first_air_date ? "tv" : "movie");
        renderMetadata(card.html.querySelector(".card__view"), card.data, false);
        cardHooks.onCreate.call(card);
      }

      if (card.refreshPoster) hookPosterReplacement(card);
    };

    const origOnVisible = maker.Card.onVisible;
    maker.Card.onVisible = function () {
      const card = this;

      if (card.obsidian) {
        cardHooks.onVisible.call(card);

        if (cfg.qualityEnabled()) {
          const view = card.html.querySelector(".card__view");
          const bottom = view && view.querySelector(".metadata__bottom > div:first-child");
          if (bottom) renderQuality(bottom, card.data);
        }
      }

      let result;
      if (typeof origOnVisible === "function") {
        result = origOnVisible.apply(card, arguments);
      }
      if (card.obsidian) stripNativeQuality(card);
      return result;
    };
  }

  function stripNativeQuality(card) {
    const view = card.html && card.html.querySelector(".card__view");
    if (!view) return;
    const strip = () => {
      const list = view.querySelectorAll(".card__quality");
      for (let i = 0; i < list.length; i++) {
        if (list[i].parentNode) list[i].parentNode.removeChild(list[i]);
      }
    };
    strip();
    if (!card._qualityObserver && typeof MutationObserver === "function") {
      card._qualityObserver = new MutationObserver(strip);
      card._qualityObserver.observe(view, { childList: true, subtree: true });
    }
  }

  /* ============================================================
   *  Settings
   * ============================================================ */
  const TR = {
    obsidian_quality:              { uk: "Якість",                  ru: "Качество",              en: "Quality" },
    obsidian_quality_enabled:      { uk: "Відображати якість",      ru: "Показывать качество",   en: "Show quality" },
    obsidian_quality_icon:         { uk: "Іконка якості",           ru: "Иконка качества",       en: "Quality icon" },
    obsidian_quality_color:        { uk: "Кольорова якість",        ru: "Цветное качество",      en: "Colored quality" },
    obsidian_ratings:              { uk: "Рейтинг",                 ru: "Рейтинг",               en: "Ratings" },
    obsidian_rating_enabled:       { uk: "Відображати рейтинг",     ru: "Показывать рейтинг",    en: "Show rating" },
    obsidian_rating_icon:          { uk: "Іконка рейтингу",         ru: "Иконка рейтинга",       en: "Rating icon" },
    obsidian_rating_color:         { uk: "Кольоровий рейтинг",      ru: "Цветной рейтинг",       en: "Colored rating" },
    obsidian_show_release_year:    { uk: "Відображати рік випуску", ru: "Показывать год выпуска",en: "Show release year" },
    obsidian_show_episode_number:  { uk: "Відображати номер серії", ru: "Показывать номер серии",en: "Show episode number" },
    obsidian_show_genres:          { uk: "Відображати жанри",       ru: "Показывать жанры",      en: "Show genres" },
    obsidian_replace_poster:       { uk: "Мінімалістичний постер",  ru: "Минималистичный постер",en: "Minimal poster" },
    obsidian_noir:                 { uk: "Нуар",                    ru: "Нуар",                  en: "Noir" },
    obsidian_noir_enabled:         { uk: "Чорно-білі картки",       ru: "Чёрно-белые карточки",  en: "Black & white cards" },
    obsidian_noir_badges:          { uk: "Чорно-білі бейджі",       ru: "Чёрно-белые бейджи",    en: "Black & white badges" },
    obsidian_settings_memory:      { uk: "Пам'ять",                 ru: "Память",                en: "Memory" },
    obsidian_reset_settings:       { uk: "Скинути налаштування",    ru: "Сбросить настройки",    en: "Reset settings" },
    obsidian_clear_cache:          { uk: "Очистити кеш",            ru: "Очистить кэш",          en: "Clear cache" },
    obsidian_settings_reset:       { uk: "Налаштування скинуто",    ru: "Настройки сброшены",    en: "Settings reset" },
    obsidian_cache_cleared:        { uk: "Кеш очищено",             ru: "Кэш очищен",            en: "Cache cleared" },
  };

  const SETTINGS_COMPONENT = "obsidian_settings";
  const SETTINGS_QUALITY   = "obsidian_quality";
  const SETTINGS_RATING    = "obsidian_rating";
  const SETTINGS_NOIR      = "obsidian_noir";

  const ICON = '<svg fill="currentColor" width="800px" height="800px" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="M30.531 15.47l-14.001-14c-0.136-0.136-0.323-0.22-0.53-0.22s-0.395 0.084-0.53 0.22l-14 14c-0.136 0.136-0.22 0.323-0.22 0.53s0.084 0.395 0.22 0.53l14 14.001c0.136 0.135 0.323 0.219 0.53 0.219s0.394-0.084 0.53-0.219l14.001-14.001c0.135-0.136 0.218-0.323 0.218-0.53s-0.083-0.394-0.218-0.53l0 0zM16 28.939l-12.939-12.939 12.939-12.939 12.939 12.939z"></path></svg>';

  function addTrigger(component, param, key, def, onChange) {
    Lampa.SettingsApi.addParam({
      component,
      param: { name: param, type: "trigger", default: def },
      field: { name: Lampa.Lang.translate(key) },
      onChange: onChange || (() => {}),
    });
  }

  function setupSettings() {
    if (Lampa.Lang && Lampa.Lang.add) Lampa.Lang.add(TR);
    Lampa.SettingsApi.addComponent({ component: SETTINGS_COMPONENT, name: "Obsidian", icon: ICON });

    Lampa.Template && Lampa.Template.add("settings_" + SETTINGS_QUALITY, "<div></div>");
    addTrigger(SETTINGS_QUALITY, "obsidian_quality_enabled", "obsidian_quality_enabled", DEFAULTS.ui.qualityEnabled);
    addTrigger(SETTINGS_QUALITY, "obsidian_quality_icon",    "obsidian_quality_icon",    DEFAULTS.ui.qualityIcon);
    addTrigger(SETTINGS_QUALITY, "obsidian_quality_color",   "obsidian_quality_color",   DEFAULTS.ui.qualityColor);

    Lampa.Template && Lampa.Template.add("settings_" + SETTINGS_RATING, "<div></div>");
    addTrigger(SETTINGS_RATING, "obsidian_rating_enabled", "obsidian_rating_enabled", DEFAULTS.ui.ratingEnabled);
    addTrigger(SETTINGS_RATING, "obsidian_rating_icon",    "obsidian_rating_icon",    DEFAULTS.ui.ratingIcon);
    addTrigger(SETTINGS_RATING, "obsidian_rating_color",   "obsidian_rating_color",   DEFAULTS.ui.ratingColor);

    Lampa.Template && Lampa.Template.add("settings_" + SETTINGS_NOIR, "<div></div>");
    addTrigger(SETTINGS_NOIR, "obsidian_noir",        "obsidian_noir_enabled", DEFAULTS.ui.noir,       () => applyNoir());
    addTrigger(SETTINGS_NOIR, "obsidian_noir_badges", "obsidian_noir_badges",  DEFAULTS.ui.noirBadges, () => applyNoir());

    const goBack = (name) => ({
      component: SETTINGS_COMPONENT,
      param: { type: "button" },
      field: { name: Lampa.Lang.translate(name) },
    });

    Lampa.SettingsApi.addParam(Object.assign({}, goBack("obsidian_quality"), {
      onChange: () => Lampa.Settings.create(SETTINGS_QUALITY, { onBack: () => Lampa.Settings.create(SETTINGS_COMPONENT) }),
    }));
    Lampa.SettingsApi.addParam(Object.assign({}, goBack("obsidian_ratings"), {
      onChange: () => Lampa.Settings.create(SETTINGS_RATING, { onBack: () => Lampa.Settings.create(SETTINGS_COMPONENT) }),
    }));

    addTrigger(SETTINGS_COMPONENT, "obsidian_show_episode_number", "obsidian_show_episode_number", DEFAULTS.ui.showEpisodeNumber);
    addTrigger(SETTINGS_COMPONENT, "obsidian_replace_poster",      "obsidian_replace_poster",      DEFAULTS.ui.replacePoster);
    addTrigger(SETTINGS_COMPONENT, "obsidian_show_genres",         "obsidian_show_genres",         DEFAULTS.ui.showGenres);
    addTrigger(SETTINGS_COMPONENT, "obsidian_show_release_year",   "obsidian_show_release_year",   DEFAULTS.ui.showReleaseYear);

    Lampa.SettingsApi.addParam(Object.assign({}, goBack("obsidian_noir"), {
      onChange: () => Lampa.Settings.create(SETTINGS_NOIR, { onBack: () => Lampa.Settings.create(SETTINGS_COMPONENT) }),
    }));

    Lampa.SettingsApi.addParam({
      component: SETTINGS_COMPONENT,
      param: { type: "title" },
      field: { name: Lampa.Lang.translate("obsidian_settings_memory") },
      onChange: () => {},
    });

    Lampa.SettingsApi.addParam({
      component: SETTINGS_COMPONENT,
      param: { type: "button" },
      field: { name: Lampa.Lang.translate("obsidian_reset_settings") },
      onChange: () => {
        const map = {
          obsidian_quality_enabled: true, obsidian_quality_icon: true, obsidian_quality_color: true,
          obsidian_rating_enabled: true, obsidian_rating_icon: true, obsidian_rating_color: true,
          obsidian_show_release_year: true, obsidian_show_episode_number: true, obsidian_show_genres: true,
          obsidian_replace_poster: true, obsidian_noir: false, obsidian_noir_badges: false,
        };
        for (const k in map) Lampa.Storage.set(k, map[k]);
        applyNoir();
        Lampa.Noty.show(Lampa.Lang.translate("obsidian_settings_reset"));
      },
    });

    Lampa.SettingsApi.addParam({
      component: SETTINGS_COMPONENT,
      param: { type: "button" },
      field: { name: Lampa.Lang.translate("obsidian_clear_cache") },
      onChange: () => {
        qualityCache.clear();
        posterCache.clear();
        for (const k in episodeCache) delete episodeCache[k];
        for (const k in jacredPending) delete jacredPending[k];
        Lampa.Storage.set(JACRED_OLD_CACHE_KEY, {});
        requestQueue.clear();
        Lampa.Noty.show(Lampa.Lang.translate("obsidian_cache_cleared"));
      },
    });
  }

  function injectTemplate() {
    const wrap = document.createElement("div");
    wrap.innerHTML = Lampa.Template.string("card");
    const cardEl = wrap.firstElementChild;
    if (!cardEl) return;
    cardEl.className += " card--obsidian";
    const title = cardEl.querySelector(".card__title");
    if (title && title.parentNode) title.parentNode.removeChild(title);
    const age = cardEl.querySelector(".card__age");
    if (age && age.parentNode) age.parentNode.removeChild(age);
    Lampa.Template.add(CARD_TEMPLATE_ID, wrap.innerHTML);
  }

  function injectSprites() {
    let holder = document.getElementById("sprites");
    if (!holder) {
      holder = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      holder.setAttribute("id", "sprites");
      holder.setAttribute("aria-hidden", "true");
      holder.style.position = "absolute";
      holder.style.width = "0";
      holder.style.height = "0";
      holder.style.overflow = "hidden";
      document.body.appendChild(holder);
    }
    holder.insertAdjacentHTML("beforeend", SPRITES);
  }

  const SPRITES = [
    '<symbol id="sprite-tv-show" viewBox="0 0 51.802 51.801" fill="none" xmlns="http://www.w3.org/2000/svg">',
    '<path d="M47.947 4.43H12.495A3.86 3.86 0 0 0 8.64 8.284v2.641h-.466a3.86 3.86 0 0 0-3.855 3.854v2.642h-.465A3.86 3.86 0 0 0 0 21.275v22.242a3.86 3.86 0 0 0 3.854 3.854h35.453a3.86 3.86 0 0 0 3.855-3.854v-2.644h.465a3.86 3.86 0 0 0 3.854-3.854v-2.641h.467a3.86 3.86 0 0 0 3.854-3.854V8.284a3.857 3.857 0 0 0-3.855-3.854m-8.75 25.987v12.99H3.963V21.385h35.234zm4.321 6.494h-.355V21.275a3.86 3.86 0 0 0-3.855-3.854H12.604v-.001H8.641v-1.266h-.357v-1.266h35.235V36.91zm4.321-6.494h-.356V14.78a3.86 3.86 0 0 0-3.854-3.854H12.604V8.394H47.84z" fill="currentColor"/>',
    '<path d="m26.401 30.446-5.788-4.215a1.916 1.916 0 0 0-3.044 1.549v8.43a1.914 1.914 0 0 0 1.916 1.916c.398 0 .794-.125 1.128-.367l5.788-4.215a1.92 1.92 0 0 0 0-3.098" fill="currentColor"/>',
    '</symbol>',
    '<symbol id="high" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 14c0-4.4183-3.5817-8-8-8s-8 3.5817-8 8c0 1.2497.3493 2.4556.8955 3.5547.2458.4945.0442 1.095-.4502 1.3408s-1.095.0442-1.3408-.4502C2.453 17.1346 2 15.6239 2 14 2 8.4772 6.4772 4 12 4s10 4.4772 10 10c0 1.6239-.4531 3.1346-1.1045 4.4453-.2458.4944-.8463.696-1.3408.4502s-.696-.8463-.4502-1.3408C19.6507 16.4556 20 15.2497 20 14m-7 0c0-.5523-.4477-1-1-1s-1 .4477-1 1 .4477 1 1 1 1-.4477 1-1m2 0c0 1.6569-1.3431 3-3 3s-3-1.3431-3-3 1.3431-3 3-3c.4625 0 .8988.108 1.29.2949l1.503-1.502c.3905-.3904 1.0235-.3904 1.414 0 .3905.3906.3905 1.0236 0 1.4141l-1.5029 1.502c.1872.3915.2959.8281.2959 1.291" fill="currentColor"/></symbol>',
    '<symbol id="medium" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 14c0-4.4183-3.5817-8-8-8s-8 3.5817-8 8c0 1.2497.3493 2.4556.8955 3.5547.2458.4945.0442 1.095-.4502 1.3408s-1.095.0442-1.3408-.4502C2.453 17.1346 2 15.6239 2 14 2 8.4772 6.4772 4 12 4s10 4.4772 10 10c0 1.6239-.4531 3.1346-1.1045 4.4453-.2458.4944-.8463.696-1.3408.4502s-.696-.8463-.4502-1.3408C19.6507 16.4556 20 15.2497 20 14m-7 0c0-.5523-.4477-1-1-1s-1 .4477-1 1 .4477 1 1 1 1-.4477 1-1m2 0c0 1.6569-1.3431 3-3 3s-3-1.3431-3-3c0-1.3059.8353-2.4141 2-2.8262V9c0-.5523.4477-1 1-1s1 .4477 1 1v2.1738c1.1647.4121 2 1.5203 2 2.8262" fill="currentColor"/></symbol>',
    '<symbol id="low" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 14c0-4.4183-3.5817-8-8-8s-8 3.5817-8 8c0 1.2497.3493 2.4556.8955 3.5547.2458.4945.0442 1.095-.4502 1.3408s-1.095.0442-1.3408-.4502C2.453 17.1346 2 15.6239 2 14 2 8.4772 6.4772 4 12 4s10 4.4772 10 10c0 1.6239-.4531 3.1346-1.1045 4.4453-.2458.4944-.8463.696-1.3408.4502s-.696-.8463-.4502-1.3408C19.6507 16.4556 20 15.2497 20 14m-7 0c0-.5523-.4477-1-1-1s-1 .4477-1 1 .4477 1 1 1 1-.4477 1-1m2 0c0 1.6569-1.3431 3-3 3s-3-1.3431-3-3c0-.4628.1078-.8996.295-1.291l-1.502-1.502c-.3905-.3905-.3906-1.0235 0-1.414s1.0235-.3905 1.414 0l1.502 1.5019C11.1004 11.1078 11.5372 11 12 11c1.6569 0 3 1.3431 3 3" fill="currentColor"/></symbol>',
    '<symbol id="rating-star" viewBox="0 0 24 23" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M15.6162 7.10981L15.8464 7.55198L16.3381 7.63428L22.2841 8.62965C22.8678 8.72736 23.0999 9.44167 22.6851 9.86381L18.4598 14.1641L18.1104 14.5196L18.184 15.0127L19.0748 20.9752C19.1622 21.5606 18.5546 22.002 18.025 21.738L12.6295 19.0483L12.1833 18.8259L11.7372 19.0483L6.34171 21.738C5.81206 22.002 5.20443 21.5606 5.29187 20.9752L6.18264 15.0127L6.25629 14.5196L5.9069 14.1641L1.68155 9.86381C1.26677 9.44167 1.49886 8.72736 2.08255 8.62965L8.02855 7.63428L8.52022 7.55198L8.75043 7.10981L11.5345 1.76241C11.8078 1.23748 12.5589 1.23748 12.8322 1.76241L15.6162 7.10981Z" stroke="currentColor" stroke-width="2.2"/></symbol>'
  ].join("");

  const STYLES = `
    .card--obsidian.card--tv .card__type {
        left: 0; top: 0; padding: 0.6em; border-radius: 1.2em 0 0.4em 0;
        overflow: hidden; white-space: nowrap; color: #fff; background: rgba(0, 0, 0, 0.82);
        display: flex; align-items: center; justify-content: center;
    }
    .card--obsidian.card--tv .card__type-icon {
        display: block; flex-shrink: 0; width: 1.2em; height: 1.2em; fill: currentColor;
    }
    .card--obsidian.card--tv .card__type.episode_metadata {
        justify-content: flex-start; padding: 0.6em 1.2em;
    }
    .card--obsidian.card--tv .card__type.episode_metadata .card__type-label {
        margin-left: 0.5em; line-height: 1;
    }
    .card__metadata {
        position: absolute; bottom: 0; left: 0; right: 0;
        padding: 3.5em 0.75em 0.5em; color: #fff; display: block;
        border-radius: 0 0 1em 1em;
        background: linear-gradient(to top,
            rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.90) 25%, rgba(0,0,0,0.80) 45%,
            rgba(0,0,0,0.65) 65%, rgba(0,0,0,0.40) 80%, rgba(0,0,0,0) 100%);
    }
    .card--wide .card__metadata { background: none; z-index: 1; }
    .metadata__genres {
        font-size: 0.75em; opacity: 0.95; margin-bottom: 0.35em;
        display: flex; align-items: center; gap: 0.5em;
        text-shadow: 0 0.0625em 0.1875em rgba(0,0,0,0.8);
    }
    .metadata__title {
        font-size: 1.15em; line-height: 1.2; max-height: 3.6em; overflow: hidden;
        text-overflow: ellipsis;
        text-shadow: 0 0.0625em 0.1875em rgba(0, 0, 0, 0.9);
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
        display: inline-block; vertical-align: middle; width: 1.05em; height: 1.05em;
        margin-right: 0.25em; fill: none; stroke: currentColor;
        filter: drop-shadow(0 0.0625em 0.1875em rgba(0,0,0,0.9));
    }
    .metadata__rating-value { display: inline-block; vertical-align: middle; line-height: 1; }
    .metadata__rating.rating-excellent { color: #81c784; }
    .metadata__rating.rating-good      { color: #64b5f6; }
    .metadata__rating.rating-average   { color: #ff9800; }
    .metadata__rating.rating-poor      { color: #ff7043; }
    .metadata__rating.rating-terrible  { color: #e53935; }
    .metadata__rating--no-color        { color: #ffffff !important; }
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
        display: inline-block; vertical-align: middle; width: 1.15em; height: 1.15em;
        margin-right: 0.2em; fill: currentColor;
    }
    .metadata__quality-label { display: inline-block; vertical-align: middle; line-height: 1; }
    .metadata__quality--4k     { color: #66bb6a; }
    .metadata__quality--hd     { color: #42a5f5; }
    .metadata__quality--ts     { color: #ef5350; }
    .metadata__quality--sd     { color: #9e9e9e; }
    .metadata__quality--camrip { color: #e53935; }
    .metadata__quality--no-color { color: #ffffff !important; }
    .card--obsidian .card__marker { right: 0.4em; top: 0.4em; left: auto; bottom: auto; }
    .card--obsidian .card__icons { top: 2em; }
    .card--obsidian .card__quality { display: none !important; }
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

  let initialised = false;

  function init() {
    if (initialised) return;
    initialised = true;

    try {
      injectTemplate();
      setupSettings();

      const style = document.createElement("style");
      style.innerHTML = STYLES;
      document.head.appendChild(style);

      injectSprites();
      applyNoir();

      posterCache.init();
      qualityCache.init();
      try {
        const old = Lampa.Storage.get(JACRED_OLD_CACHE_KEY, null);
        if (old && Object.keys(old).length) Lampa.Storage.set(JACRED_OLD_CACHE_KEY, {});
      } catch (_) {}

      patchCards();
    } catch (e) {
      initialised = false;
      console.error("Obsidian initialization error:", e);
    }
  }

  if (window.appready) init();
  else Lampa.Listener.follow("app", (ev) => { if (ev.type === "ready") init(); });

})();
