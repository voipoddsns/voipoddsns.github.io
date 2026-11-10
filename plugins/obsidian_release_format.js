/* Obsidian plugin for Lampa — fixed version
   (core-js polyfill bundle removed: it was auto-generated and unchanged) */
!(function () {
  "use strict";

  /* ---------- helpers ---------- */
  function n(t) {
    return t && t.length ? t[Math.floor(Math.random() * t.length)] : "";
  }

  // Cache with TTL + LRU-ish eviction, persisted in Lampa.Storage
  function o(key, maxSize, ttl) {
    var self = this,
      store = {},
      order = [],
      lastClean = 0,
      saveTimer;

    function expired(entry, now) {
      return !entry || "number" != typeof entry.timestamp || entry.timestamp <= now - ttl;
    }
    function remove(k) {
      delete store[k];
      var i = order.indexOf(k);
      i > -1 && order.splice(i, 1);
    }
    function touch(k) {
      var i = order.indexOf(k);
      i > -1 && order.splice(i, 1);
      order.push(k);
    }

    self.save = function () {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(function () {
        try {
          Lampa.Storage.set(key, { v: 2, data: store, order: order });
        } catch (e) {
          console.warn("Cache save error:", e);
        }
      }, 500);
    };

    self.init = function () {
      try {
        var raw = Lampa.Storage.get(key, {});
        if (raw && 2 === raw.v && raw.data) {
          store = raw.data || {};
          order = Array.isArray(raw.order) ? raw.order : [];
        } else {
          store = raw && "object" === typeof raw ? raw : {};
          order = [];
        }
        var seen = {},
          clean = [];
        for (var i = 0; i < order.length; i++) {
          var k = order[i];
          if (!seen[k] && store.hasOwnProperty(k)) {
            seen[k] = true;
            clean.push(k);
          }
        }
        for (var k2 in store)
          if (store.hasOwnProperty(k2) && !seen[k2]) {
            seen[k2] = true;
            clean.push(k2);
          }
        order = clean;
      } catch (e) {
        console.warn("Cache init error:", e);
        store = {};
        order = [];
      }
      self.init = function () {};
    };

    self.get = function (k) {
      var entry = store[k];
      if (!entry) return null;
      if (expired(entry, Date.now())) {
        remove(k);
        self.save();
        return null;
      }
      touch(k);
      return entry.value;
    };

    self.set = function (k, value) {
      var now = Date.now();
      if (now - lastClean >= 6e4) {
        var dead = [];
        for (var x in store) store.hasOwnProperty(x) && expired(store[x], now) && dead.push(x);
        for (var i = 0; i < dead.length; i++) remove(dead[i]);
        lastClean = now;
        dead.length > 0 && self.save();
      }
      if (order.length >= maxSize) {
        var half = Math.floor(order.length / 2),
          old = order.slice(0, half);
        for (var j = 0; j < old.length; j++) delete store[old[j]];
        order = order.slice(half);
        self.save();
      }
      store[k] = { timestamp: now, value: value };
      touch(k);
      self.save();
    };
  }

  /* ---------- config ---------- */
  var i = {
      apn: [""],
      api: [
        {
          url: "https://jac.red",
          token: "", // впишіть apikey, якщо індексатор його вимагає
        },
      ],
      qualityCache: { key: "obsidian_quality_cache", size: 1e3, time: 864e5 },
      posterCache: { key: "obsidian_poster_cache", size: 2e3, time: 6048e5 },
      queue: { maxParallel: 2, maxSize: 50 },
      ui: {
        qualityEnabled: !0,
        qualityIcon: !0,
        qualityColor: !0,
        ratingEnabled: !0,
        ratingIcon: !0,
        ratingColor: !0,
        showReleaseYear: !0,
        showEpisodeNumber: !0,
        showGenres: !0,
        replacePoster: !0,
        noir: !1,
        noirBadges: !1,
      },
    },
    s = {
      apn: i.apn,
      api: i.api,
      qualityEnabled: function () {
        return Lampa.Storage.get("obsidian_quality_enabled", i.ui.qualityEnabled);
      },
      qualityIcon: function () {
        return Lampa.Storage.get("obsidian_quality_icon", i.ui.qualityIcon);
      },
      qualityColor: function () {
        return Lampa.Storage.get("obsidian_quality_color", i.ui.qualityColor);
      },
      showRatings: function () {
        return Lampa.Storage.get("obsidian_rating_enabled", i.ui.ratingEnabled);
      },
      ratingIcon: function () {
        return Lampa.Storage.get("obsidian_rating_icon", i.ui.ratingIcon);
      },
      ratingColor: function () {
        return Lampa.Storage.get("obsidian_rating_color", i.ui.ratingColor);
      },
      showReleaseYear: function () {
        return Lampa.Storage.get("obsidian_show_release_year", i.ui.showReleaseYear);
      },
      showEpisodeNumber: function () {
        return Lampa.Storage.get("obsidian_show_episode_number", i.ui.showEpisodeNumber);
      },
      showGenres: function () {
        return Lampa.Storage.get("obsidian_show_genres", i.ui.showGenres);
      },
      replacePoster: function () {
        return Lampa.Storage.get("obsidian_replace_poster", i.ui.replacePoster);
      },
      noir: function () {
        return Lampa.Storage.get("obsidian_noir", i.ui.noir);
      },
      noirBadges: function () {
        return Lampa.Storage.get("obsidian_noir_badges", i.ui.noirBadges);
      },
      queue: { maxParallel: i.queue.maxParallel },
      qualityCache: {
        key: i.qualityCache.key,
        size: i.qualityCache.size,
        time: i.qualityCache.time,
      },
      posterCache: {
        key: i.posterCache.key,
        size: i.posterCache.size,
        time: i.posterCache.time,
      },
    },
    u = null, // poster cache
    c = {}, // poster pending callbacks
    f = "@none";

  /* ---------- request queue ---------- */
  var l = {
      queue: [],
      activeCount: 0,
      maxParallel: s.queue.maxParallel,
      maxSize: i.queue.maxSize,
      add: function (t) {
        if (this.queue.length >= this.maxSize) {
          console.warn("Request queue is full, dropping task");
          return false;
        }
        this.queue.push(t);
        this.process();
        return true;
      },
      process: function () {
        if (this.activeCount >= this.maxParallel || 0 === this.queue.length) return;
        var t = this.queue.shift();
        this.activeCount++;
        t(function () {
          l.activeCount--;
          l.process();
        });
      },
      clear: function () {
        this.queue = [];
        this.activeCount = 0;
      },
    },
    h = null, // quality cache
    p = {}; // quality pending callbacks

  /* ---------- quality lookup (FIXED) ---------- */
  function buildQualityUrl(t) {
    var api = n(s.api);
    var base = String(api.url || "").replace(/\s+/g, "").replace(/\/+$/, "");
    var url =
      base +
      "/api/v2.0/indexers/all/results/torznab/api?apikey=" +
      encodeURIComponent(api.token || "");
    if (t.imdb_id) {
      url +=
        "&t=movie&imdbid=" +
        encodeURIComponent(String(t.imdb_id).replace(/^tt/, ""));
    } else {
      var name = t.original_title || t.original_name || t.title || t.name || "";
      var year = (t.release_date || "").slice(0, 4);
      url += "&t=search&q=" + encodeURIComponent(name + (year ? " " + year : ""));
    }
    return url;
  }

  function parseQuality(xml) {
    var doc = new DOMParser().parseFromString(xml, "text/xml");
    var items = doc.getElementsByTagName("item");
    var best = null,
      bestScore = -1;
    for (var j = 0; j < items.length; j++) {
      var it = items[j];
      var titleEl = it.getElementsByTagName("title")[0];
      var title = titleEl ? titleEl.textContent || "" : "";
      var seeders = 0;
      var attrs = it.getElementsByTagName("torznab:attr");
      for (var m = 0; m < attrs.length; m++) {
        if (attrs[m].getAttribute("name") === "seeders") {
          seeders = parseInt(attrs[m].getAttribute("value") || "0", 10) || 0;
        }
      }
      var quality = null,
        rank = 0;
      if (/2160p|\b4k\b|\buhd\b/i.test(title)) {
        quality = "4k";
        rank = 3;
      } else if (/1080p|720p|\bhd\b|bluray|blu-ray|bdrip|web-?dl|web-?rip|hdtv/i.test(title)) {
        quality = "hd";
        rank = 2;
      } else if (/\bts\b|\bcam(rip)?\b|\btelesync\b|\bdvdscr\b/i.test(title)) {
        quality = "ts";
        rank = 1;
      }
      if (!quality) continue;
      var score = rank * 1e6 + seeders; // якість важливіша за сіди
      if (score > bestScore) {
        bestScore = score;
        best = quality;
      }
    }
    return best;
  }

  function d(t, r) {
    var key = t && t.id ? (t.original_name ? "tv" : "movie") + "_" + t.id : null;
    if (!key) return;

    var cached = h.get(key);
    if (cached) {
      if (cached.quality) r(cached.quality);
      return;
    }
    if (p[key]) {
      p[key].push(r);
      return;
    }
    p[key] = [r];

    var url = buildQualityUrl(t);
    var queued = l.add(function (done) {
      var finished = false,
        timer = null;

      function finish(quality, cacheEmpty) {
        if (finished) return;
        finished = true;
        if (timer) clearTimeout(timer);
        if (quality) h.set(key, { quality: quality });
        else if (cacheEmpty) h.set(key, { quality: null });
        var cbs = p[key];
        delete p[key];
        if (quality && cbs) {
          for (var c2 = 0; c2 < cbs.length; c2++) {
            try {
              cbs[c2](quality);
            } catch (e) {}
          }
        }
        done();
      }

      timer = setTimeout(function () {
        finish(null, false);
      }, 8000);

      Lampa.Network.silent(
        url,
        function (resp) {
          try {
            var raw = resp && resp.data ? resp.data : resp;
            var xml = null;
            if (typeof raw === "string") xml = raw;
            else if (raw && raw.documentElement)
              xml = new XMLSerializer().serializeToString(raw);
            else if (raw && raw.responseText) xml = raw.responseText;
            if (!xml) return finish(null, true);
            var q = parseQuality(xml);
            finish(q, !q); // порожній результат теж кешуємо
          } catch (err) {
            finish(null, false);
          }
        },
        function () {
          finish(null, false);
        },
        false,
        { dataType: "text" }, // torznab повертає XML, а не JSON
      );
    });

    if (!queued) delete p[key]; // черга повна — дозволити повторну спробу
  }

  /* ---------- genres ---------- */
  var v = {
    movie: [
      { id: 28, title: "#{filter_genre_ac}" },
      { id: 12, title: "#{filter_genre_ad}" },
      { id: 16, title: "#{filter_genre_mv}" },
      { id: 35, title: "#{filter_genre_cm}" },
      { id: 80, title: "#{filter_genre_cr}" },
      { id: 99, title: "#{filter_genre_dc}" },
      { id: 18, title: "#{filter_genre_dr}" },
      { id: 10751, title: "#{filter_genre_fm}" },
      { id: 14, title: "#{filter_genre_fe}" },
      { id: 36, title: "#{filter_genre_hi}" },
      { id: 27, title: "#{filter_genre_ho}" },
      { id: 10402, title: "#{filter_genre_mu}" },
      { id: 9648, title: "#{filter_genre_de}" },
      { id: 10749, title: "#{filter_genre_md}" },
      { id: 878, title: "#{filter_genre_fa}" },
      { id: 10770, title: "#{filter_genre_tv}" },
      { id: 53, title: "#{filter_genre_tr}" },
      { id: 10752, title: "#{filter_genre_mi}" },
      { id: 37, title: "#{filter_genre_ve}" },
    ],
    tv: [
      { id: 10759, title: "#{filter_genre_aa}" },
      { id: 16, title: "#{filter_genre_mv}" },
      { id: 35, title: "#{filter_genre_cm}" },
      { id: 80, title: "#{filter_genre_cr}" },
      { id: 99, title: "#{filter_genre_dc}" },
      { id: 18, title: "#{filter_genre_dr}" },
      { id: 10751, title: "#{filter_genre_fm}" },
      { id: 10762, title: "#{filter_genre_ch}" },
      { id: 9648, title: "#{filter_genre_de}" },
      { id: 10763, title: "#{filter_genre_nw}" },
      { id: 10764, title: "#{filter_genre_rs}" },
      { id: 10765, title: "#{filter_genre_hf}" },
      { id: 10766, title: "#{filter_genre_op}" },
      { id: 10767, title: "#{filter_genre_tc}" },
      { id: 10768, title: "#{filter_genre_mp}" },
      { id: 37, title: "#{filter_genre_ve}" },
    ],
  };

  function g(t) {
    var r = t.name || t.first_air_date ? "tv" : "movie",
      e = t.genre_ids || [],
      res = [],
      list = v[r] || [];
    e.forEach(function (id) {
      var found = list.find(function (x) {
        return x.id == id;
      });
      found &&
        res.push(Lampa.Utils.capitalizeFirstLetter(Lampa.Lang.translate(found.title)));
    });
    return res.slice(0, 2);
  }

  /* ---------- noir toggles ---------- */
  function y() {
    var t = s.noir(),
      r = t && s.noirBadges();
    m("obsidian--noir", t);
    m("obsidian--noir-badges", r);
  }
  function m(t, r) {
    document.body.classList
      ? document.body.classList.toggle(t, r)
      : r
        ? (document.body.className += " " + t)
        : (document.body.className = document.body.className.replace(
            new RegExp("\\b" + t + "\\b", "g"),
            "",
          ));
  }

  /* ---------- card metadata ---------- */
  function b(t, wide) {
    var view = t.html.querySelector(".card__view"),
      data = t.data;
    var meta = document.createElement("div");
    meta.className = "card__metadata";
    var bottom = document.createElement("div");
    bottom.className = "metadata__bottom";
    var left = document.createElement("div"),
      right = document.createElement("div");

    if (wide) {
      w(right, data);
      E(right, data);
      A(right, data);
    } else {
      // genres
      if (s.showGenres()) {
        var genres = g(data);
        if (genres.length) {
          var gEl = document.createElement("div");
          gEl.className = "metadata__genres";
          gEl.textContent = genres.join(", ");
          meta.appendChild(gEl);
        }
      }
      // title
      var title = data.title || data.name || data.original_title || data.original_name || "";
      if (title) {
        var tEl = document.createElement("div");
        tEl.className = "metadata__title";
        tEl.textContent = title;
        meta.appendChild(tEl);
      }
      w(left, data);
      E(left, data);
      A(right, data);
    }
    bottom.appendChild(left);
    bottom.appendChild(right);
    meta.appendChild(bottom);
    view.appendChild(meta);
  }

  function w(t, r) {
    if (!s.showRatings()) return;
    var e = r.imdb_rating || r.kp_rating || r.vote_average || 0;
    e = parseFloat(e || 0).toFixed(1);
    if (0 == e) return;
    var el = document.createElement("span");
    el.className = "metadata__rating";
    if (s.ratingColor()) {
      var cls = "",
        val = parseFloat(e);
      if (!isNaN(val)) {
        if (val >= 8 && val <= 10) cls = "rating-excellent";
        else if (val >= 6.5 && val < 8) cls = "rating-good";
        else if (val >= 5 && val < 6.5) cls = "rating-average";
        else if (val >= 3 && val < 5) cls = "rating-poor";
        else if (val >= 0 && val < 3) cls = "rating-terrible";
      }
      cls && el.classList.add(cls);
    } else el.classList.add("metadata__rating--no-color");
    el.textContent = "";
    s.ratingIcon() && el.appendChild(_("rating-star", "metadata__rating-icon", "0 0 24 23"));
    var valEl = document.createElement("span");
    valEl.className = "metadata__rating-value";
    valEl.textContent = e;
    el.appendChild(valEl);
    t.appendChild(el);
  }

  var x = { ts: "low", hd: "medium", "4k": "high" };

  function _(id, cls, viewBox) {
    var ns = "http://www.w3.org/2000/svg",
      svg = document.createElementNS(ns, "svg");
    svg.setAttribute("class", cls);
    svg.setAttribute("viewBox", viewBox);
    var use = document.createElementNS(ns, "use");
    use.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", "#" + id);
    use.setAttribute("href", "#" + id);
    svg.appendChild(use);
    return svg;
  }

  function S(el, iconId, label) {
    el.textContent = "";
    iconId && el.appendChild(_(iconId, "metadata__quality-icon", "0 0 24 24"));
    var span = document.createElement("span");
    span.className = "metadata__quality-label";
    span.textContent = label;
    el.appendChild(span);
  }

  function E(t, r) {
    if (!s.qualityEnabled()) return;
    var el = document.createElement("span");
    el.className = "metadata__quality";
    el.style.display = "none";
    t.appendChild(el);
    d(r, function (q) {
      if (!q) return;
      r.release_quality = q;
      var low = q.toLowerCase();
      el.className = "metadata__quality metadata__quality--" + low;
      s.qualityColor() || el.classList.add("metadata__quality--no-color");
      S(el, s.qualityIcon() ? x[low] : null, q);
      el.style.display = "";
    });
  }

  function A(t, r) {
    if (!s.showReleaseYear()) return;
    var yr = (r.release_date || r.first_air_date || "").slice(0, 4);
    if (yr && "0000" !== yr) {
      var el = document.createElement("span");
      el.className = "metadata__year";
      el.textContent = yr;
      t.appendChild(el);
    }
  }

  function O(t) {
    return "tv" === (t.media_type || (t.first_air_date ? "tv" : "movie"));
  }
  function R(t) {
    if (t._obsidianIcon) return;
    t._obsidianIcon = !0;
    t.textContent = "";
    t.appendChild(_("sprite-tv-show", "card__type-icon", "0 0 51.802 51.801"));
  }

  var I = {
      onCreate: function () {
        if (O(this.data)) {
          var t = this.html.querySelector(".card__type");
          t && R(t);
        }
      },
      onVisible: function () {
        var data = this.data;
        if (!O(data)) return;
        var el = this.html.querySelector(".card__type");
        if (!el) return;
        R(el);
        if (s.showEpisodeNumber() && !el._obsidianEpisode) {
          el._obsidianEpisode = !0;
          Lampa.Network.silent(
            Lampa.TMDB.api("tv/" + data.id + "?api_key=" + Lampa.TMDB.key()),
            function (res) {
              if (res && res.last_episode_to_air) {
                var ep = res.last_episode_to_air,
                  label = document.createElement("span");
                label.className = "card__type-label";
                label.textContent = "S" + ep.season_number + ":E" + ep.episode_number;
                el.classList.add("episode_metadata");
                el.appendChild(label);
              }
            },
          );
        }
      },
    },
    T = "card_obsidian";

  function L(t) {
    return !(!t || !t.data) && ("tmdb" == t.data.source || "cub" == t.data.source);
  }

  /* ---------- card patching ---------- */
  function C() {
    var map = Lampa.Maker.map("Card"),
      useObsidian = !1,
      origJs = Lampa.Template.js;

    Lampa.Template.js = function (name, o2) {
      return (useObsidian && "card" === name && (name = T), origJs.call(Lampa.Template, name, o2));
    };

    ["Ratting", "Release"].forEach(function (mod) {
      if (map[mod]) {
        var orig = map[mod].onCreate;
        map[mod].onCreate = function () {
          if (!L(this)) return "function" == typeof orig ? orig.apply(this, arguments) : void 0;
        };
      }
    });

    if (map.Callback) {
      var onlyFocus = map.Callback.onlyFocus;
      map.Callback.onlyFocus = function () {
        if (!s.noir()) return "function" == typeof onlyFocus ? onlyFocus.apply(this, arguments) : void 0;
      };
    }

    var origCreate = map.Card.onCreate;
    map.Card.onCreate = function () {
      var self = this,
        wide = self.params && self.params.style && "wide" == self.params.style.name,
        ok = L(self);
      this.obsidian = ok;
      this.refreshPoster = s.replacePoster() && !wide && ok && self.data.original_language;
      if (this.refreshPoster) {
        self.appliedPoster = null;
        self.posterReplaced = !1;
        self.nativeGetPosterPath = self.getPosterPath;
        self.getPosterPath = function () {
          return self.appliedPoster || "./img/img_load.svg";
        };
      }
      useObsidian = ok;
      try {
        origCreate.apply(self, arguments);
      } finally {
        useObsidian = !1;
      }

      // people cards must not be B&W
      var dd = self.data;
      if (
        dd &&
        (void 0 !== dd.gender || void 0 !== dd.known_for || void 0 !== dd.known_for_department)
      ) {
        var html = self.html;
        html &&
          (html.classList
            ? html.classList.add("obsidian--no-noir")
            : (html.className += " obsidian--no-noir"));
      }

      if (ok && (self.data.original_name || self.data.title)) {
        self.data.media_type =
          self.data.media_type || (self.data.first_air_date ? "tv" : "movie");
        b(self, wide);
        I.onCreate.call(self);
      }
    };

    var origVisible = map.Card.onVisible;
    map.Card.onVisible = function () {
      var self = this;
      if ((self.obsidian && I.onVisible.call(self), this.refreshPoster && !self.posterReplaced)) {
        var timer,
          done = !1,
          path = self.data.poster_path || self.data.backdrop_path,
          prevOnError = self.img ? self.img.onerror : null,
          clearTimers = function () {
            try {
              self.img_timer && clearTimeout(self.img_timer);
            } catch (e) {}
            try {
              self.img_timer_next && clearTimeout(self.img_timer_next);
            } catch (e) {}
          },
          toUrl = function (pth) {
            return pth
              ? /^https?:\/\//.test(pth) || 0 === pth.indexOf("//")
                ? pth
                : (0 !== pth.indexOf("/") && (pth = "/" + pth),
                  Lampa.TMDB.image("t/p/w780" + pth))
              : null;
          },
          fallback = function () {
            var img = self.img;
            if (img && img.parentNode) {
              var src = (function () {
                var res = null;
                if ("function" == typeof self.nativeGetPosterPath)
                  try {
                    res = self.nativeGetPosterPath.call(self);
                  } catch (e) {}
                return (
                  (res && "./img/img_load.svg" !== res) || (res = toUrl(path)),
                  res || "./img/img_broken.svg"
                );
              })();
              self.appliedPoster = src;
              clearTimers();
              if (prevOnError)
                try {
                  img.onerror = prevOnError;
                } catch (e) {}
              img.src = src;
            }
          },
          apply = function (url) {
            var img = self.img;
            if (img && img.parentNode) {
              self.posterReplaced = !0;
              self.appliedPoster = url;
              clearTimers();
              img.onerror = function () {
                fallback();
              };
              img.src = url;
            }
          };

        timer = setTimeout(function () {
          done || ((done = !0), fallback());
        }, 2e3);

        // fetch minimal (language-less) poster from TMDB, cached
        (function (data, cb) {
          var async = function (val, ok) {
            setTimeout(function () {
              cb(val, ok);
            }, 0);
          };
          if (!(data && data.id && data.media_type)) return async(null, !1);
          var key = data.media_type + "_" + data.id,
            cached = u.get(key);
          if (cached === f) return async(null, !1);
          if (cached) return async(cached, !0);
          if (c[key]) return void c[key].push(cb);
          c[key] = [cb];

          var url = Lampa.TMDB.api(
              data.media_type +
                "/" +
                data.id +
                "/images?include_image_language=null&api_key=" +
                Lampa.TMDB.key(),
            ),
            tm = null,
            fin = !1,
            req = new Lampa.Reguest();

          function finish(val, ok, markNone) {
            if (fin) return;
            fin = !0;
            tm && clearTimeout(tm);
            !ok && markNone && u.set(key, f);
            var cbs = c[key];
            delete c[key];
            if (cbs)
              for (var k = 0; k < cbs.length; k++)
                try {
                  cbs[k](val, ok);
                } catch (e) {}
          }

          tm = setTimeout(function () {
            finish(null, !1, !1);
          }, 2e3);
          req.native(
            url,
            function (res) {
              var fp = res && res.posters && res.posters[0] ? res.posters[0].file_path : null;
              fp ? (u.set(key, fp), finish(fp, !0)) : finish(null, !1, !0);
            },
            function () {
              finish(null, !1, !0);
            },
          );
        })(self.data, function (val, ok) {
          if (done) return;
          done = !0;
          timer && clearTimeout(timer);
          if (!ok) return fallback();
          var url = toUrl(val);
          if (!url) return fallback();
          var img = self.img;
          if (img && img.parentNode) {
            if (-1 === (img.src || "").indexOf(url)) {
              var pre = new Image();
              pre.onload = function () {
                apply(url);
              };
              pre.onerror = function () {
                fallback();
              };
              pre.src = url;
              pre.complete && pre.naturalWidth > 0 && pre.onload();
            } else apply(url);
          }
        });
      }
      origVisible.apply(self, arguments);
    };
  }

  /* ---------- localisation ---------- */
  var N = "obsidian_quality",
    j = "obsidian_quality_enabled",
    U = "obsidian_quality_icon",
    D = "obsidian_quality_color",
    F = "obsidian_ratings",
    B = "obsidian_rating_enabled",
    q = "obsidian_rating_icon",
    z = "obsidian_rating_color",
    W = "obsidian_show_release_year",
    V = "obsidian_show_episode_number",
    H = "obsidian_show_genres",
    G = "obsidian_replace_poster",
    Y = "obsidian_noir",
    $ = "obsidian_noir_enabled",
    J = "obsidian_noir_badges",
    K = "obsidian_settings_memory",
    X = "obsidian_reset_settings",
    Q = "obsidian_clear_cache",
    Z = "obsidian_settings_reset",
    tt = "obsidian_cache_cleared",
    rt = {};

  function tr(key, uk, ru, en) {
    rt[key] = { uk: uk, ru: ru, en: en };
  }
  tr(N, "Якість", "Качество", "Quality");
  tr(j, "Відображати якість", "Показывать качество", "Show quality");
  tr(U, "Іконка якості", "Иконка качества", "Quality icon");
  tr(D, "Кольорова якість", "Цветное качество", "Colored quality");
  tr(F, "Рейтинг", "Рейтинг", "Ratings");
  tr(B, "Відображати рейтинг", "Показывать рейтинг", "Show rating");
  tr(q, "Іконка рейтингу", "Иконка рейтинга", "Rating icon");
  tr(z, "Кольоровий рейтинг", "Цветной рейтинг", "Colored rating");
  tr(W, "Відображати рік випуску", "Показывать год выпуска", "Show release year");
  tr(V, "Відображати номер серії", "Показывать номер серии", "Show episode number");
  tr(H, "Відображати жанри", "Показывать жанры", "Show genres");
  tr(G, "Мінімалістичний постер", "Минималистичный постер", "Minimal poster");
  tr(Y, "Нуар", "Нуар", "Noir");
  tr($, "Чорно-білі картки", "Чёрно-белые карточки", "Black & white cards");
  tr(J, "Чорно-білі бейджі", "Чёрно-белые бейджи", "Black & white badges");
  tr(K, "Пам'ять", "Память", "Memory");
  tr(X, "Скинути налаштування", "Сбросить настройки", "Reset settings");
  tr(Q, "Очистити кеш", "Очистить кэш", "Clear cache");
  tr(Z, "Налаштування скинуто", "Настройки сброшены", "Settings reset");
  tr(tt, "Кеш очищено", "Кэш очищен", "Cache cleared");

  /* ---------- settings ---------- */
  var et = "obsidian_settings",
    nt = "obsidian_quality",
    at = "obsidian_rating",
    ot = "obsidian_noir";

  function trigger(component, name, def, label, onChange) {
    Lampa.SettingsApi.addParam({
      component: component,
      param: { name: name, type: "trigger", default: def },
      field: { name: Lampa.Lang.translate(label) },
      onChange: onChange || function () {},
    });
  }
  function submenu(label, target) {
    Lampa.SettingsApi.addParam({
      component: et,
      param: { type: "button" },
      field: { name: Lampa.Lang.translate(label) },
      onChange: function () {
        Lampa.Settings.create(target, {
          onBack: function () {
            Lampa.Settings.create(et);
          },
        });
      },
    });
  }

  function it() {
    "undefined" != typeof Lampa && Lampa.Lang && Lampa.Lang.add(rt);

    Lampa.SettingsApi.addComponent({
      component: et,
      name: "Obsidian",
      icon: '<svg fill="currentColor" width="800px" height="800px" viewBox="0 0 32 32" version="1.1" xmlns="http://www.w3.org/2000/svg"><path d="M30.531 15.47l-14.001-14c-0.136-0.136-0.323-0.22-0.53-0.22s-0.395 0.084-0.53 0.22l-14 14c-0.136 0.136-0.22 0.323-0.22 0.53s0.084 0.395 0.22 0.53l14 14.001c0.136 0.135 0.323 0.219 0.53 0.219s0.394-0.084 0.53-0.219l14.001-14.001c0.135-0.136 0.218-0.323 0.218-0.53s-0.083-0.394-0.218-0.53l0 0zM16 28.939l-12.939-12.939 12.939-12.939 12.939 12.939z"></path></svg>',
    });

    // quality submenu
    Lampa.Template && Lampa.Template.add("settings_" + nt, "<div></div>");
    trigger(nt, "obsidian_quality_enabled", i.ui.qualityEnabled, j);
    trigger(nt, "obsidian_quality_icon", i.ui.qualityIcon, U);
    trigger(nt, "obsidian_quality_color", i.ui.qualityColor, D);

    // rating submenu
    Lampa.Template && Lampa.Template.add("settings_" + at, "<div></div>");
    trigger(at, "obsidian_rating_enabled", i.ui.ratingEnabled, B);
    trigger(at, "obsidian_rating_icon", i.ui.ratingIcon, q);
    trigger(at, "obsidian_rating_color", i.ui.ratingColor, z);

    // noir submenu
    Lampa.Template && Lampa.Template.add("settings_" + ot, "<div></div>");
    trigger(ot, "obsidian_noir", i.ui.noir, $, function () {
      y();
    });
    trigger(ot, "obsidian_noir_badges", i.ui.noirBadges, J, function () {
      y();
    });

    // main menu
    submenu(N, nt);
    submenu(F, at);
    trigger(et, "obsidian_show_episode_number", i.ui.showEpisodeNumber, V);
    trigger(et, "obsidian_replace_poster", i.ui.replacePoster, G);
    trigger(et, "obsidian_show_genres", i.ui.showGenres, H);
    trigger(et, "obsidian_show_release_year", i.ui.showReleaseYear, W);
    submenu(Y, ot);

    Lampa.SettingsApi.addParam({
      component: et,
      param: { type: "title" },
      field: { name: Lampa.Lang.translate(K) },
      onChange: function () {},
    });
    Lampa.SettingsApi.addParam({
      component: et,
      param: { type: "button" },
      field: { name: Lampa.Lang.translate(X) },
      onChange: function () {
        Lampa.Storage.set("obsidian_quality_enabled", i.ui.qualityEnabled);
        Lampa.Storage.set("obsidian_quality_icon", i.ui.qualityIcon);
        Lampa.Storage.set("obsidian_quality_color", i.ui.qualityColor);
        Lampa.Storage.set("obsidian_rating_enabled", i.ui.ratingEnabled);
        Lampa.Storage.set("obsidian_rating_icon", i.ui.ratingIcon);
        Lampa.Storage.set("obsidian_rating_color", i.ui.ratingColor);
        Lampa.Storage.set("obsidian_show_release_year", i.ui.showReleaseYear);
        Lampa.Storage.set("obsidian_show_episode_number", i.ui.showEpisodeNumber);
        Lampa.Storage.set("obsidian_show_genres", i.ui.showGenres);
        Lampa.Storage.set("obsidian_replace_poster", i.ui.replacePoster);
        Lampa.Storage.set("obsidian_noir", i.ui.noir);
        Lampa.Storage.set("obsidian_noir_badges", i.ui.noirBadges);
        y();
        Lampa.Noty.show(Lampa.Lang.translate(Z));
      },
    });
    Lampa.SettingsApi.addParam({
      component: et,
      param: { type: "button" },
      field: { name: Lampa.Lang.translate(Q) },
      onChange: function () {
        Lampa.Storage.set(s.qualityCache.key, {});
        Lampa.Storage.set(s.posterCache.key, {});
        Lampa.Noty.show(Lampa.Lang.translate(tt));
      },
    });
  }

  /* ---------- rows autofill (mobile) ---------- */
  var st = ["main", "category"],
    ut =
      (window.requestAnimationFrame && window.requestAnimationFrame.bind(window)) ||
      function (cb) {
        return setTimeout(cb, 16);
      };

  function ct(t) {
    t._raf ||
      (t._raf = ut(function () {
        t._raf = 0;
        try {
          if (t.destroyed) return;
          var r = t.scroll;
          if (!r || "function" != typeof r.isFilled) return;
          if (!t.items || !t.items.length) return;
          if (r.isFilled()) return;
          if (t.next_wait) return;
          if (r.animated && r.animated()) return void ct(t);
          if (t.loaded && t.loaded.length) return void t.emit("pushLoaded");
          if ((t._fills = (t._fills || 0) + 1) > 20) return;
          t.builded_time = 0;
          t.emit("loadNext");
        } catch (e) {
          console.warn("rows-autofill", "step error:", e && e.message);
        }
      }));
  }
  function ft(t) {
    if (t && "function" == typeof t.use && "function" == typeof t.emit) {
      if (!t._autofill_hooked) {
        t._autofill_hooked = !0;
        t.use({
          onBuild: function () {
            ct(this);
          },
          onPushLoaded: function () {
            ct(this);
          },
        });
      }
      ct(t);
    }
  }
  function lt() {
    var t = Lampa.Activity.active();
    return t && -1 !== st.indexOf(t.component) ? t.activity && t.activity.component : null;
  }
  function ht(t) {
    ("create" !== t.type && "start" !== t.type) ||
      (-1 !== st.indexOf(t.component) &&
        ft(t.object && t.object.activity && t.object.activity.component));
  }
  function pt(t) {
    ("visible" !== t.type && "append" !== t.type) || ft(lt());
  }

  /* ---------- styles ---------- */
  var CSS = [
    ".card--obsidian.card--tv .card__type { left: 0; top: 0; padding: 0.6em; border-radius: 1.2em 0 0.4em 0; overflow: hidden; white-space: nowrap; color: #fff; background: rgba(0, 0, 0, 0.82); display: flex; align-items: center; justify-content: center; }",
    ".card--obsidian.card--tv .card__type-icon { display: block; flex-shrink: 0; width: 1.2em; height: 1.2em; fill: currentColor; }",
    ".card--obsidian.card--tv .card__type.episode_metadata { justify-content: flex-start; padding: 0.6em 1.2em; }",
    ".card--obsidian.card--tv .card__type.episode_metadata .card__type-label { margin-left: 0.5em; line-height: 1; }",
    ".card__metadata { position: absolute; bottom: 0; left: 0; right: 0; padding: 3.5em 0.75em 0.5em; color: #fff; display: block; border-radius: 0 0 1em 1em; background: linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.90) 25%, rgba(0,0,0,0.80) 45%, rgba(0,0,0,0.65) 65%, rgba(0,0,0,0.40) 80%, rgba(0,0,0,0) 100%); }",
    ".card--wide .card__metadata { background: none; z-index: 1; }",
    ".metadata__genres { font-size: 0.75em; opacity: 0.95; margin-bottom: 0.35em; display: flex; align-items: center; gap: 0.5em; text-shadow: 0 0.0625em 0.1875em rgba(0,0,0,0.8); }",
    ".metadata__title { font-size: 1.15em; line-height: 1.2; max-height: 3.6em; overflow: hidden; text-overflow: ellipsis; text-shadow: 0 0.0625em 0.1875em rgba(0, 0, 0, 0.9); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }",
    ".metadata__bottom { margin-top: 0.45em; min-height: 1em; display: flex; align-items: center; justify-content: space-between; }",
    ".metadata__bottom > div { display: flex; align-items: center; }",
    ".metadata__rating { font-size: 0.8em; opacity: 0.95; color: #ffd54a; margin-right: 0.5em; text-shadow: 0 0.0625em 0.1875em rgba(0,0,0,0.9); }",
    ".metadata__rating-icon { display: inline-block; vertical-align: middle; width: 1.05em; height: 1.05em; margin-right: 0.25em; fill: none; stroke: currentColor; filter: drop-shadow(0 0.0625em 0.1875em rgba(0,0,0,0.9)); }",
    ".metadata__rating-value { display: inline-block; vertical-align: middle; line-height: 1; }",
    ".metadata__rating.rating-excellent { color: #81c784; }",
    ".metadata__rating.rating-good { color: #64b5f6; }",
    ".metadata__rating.rating-average { color: #ff9800; }",
    ".metadata__rating.rating-poor { color: #ff7043; }",
    ".metadata__rating.rating-terrible { color: #e53935; }",
    ".metadata__rating--no-color { color: #ffffff !important; }",
    ".metadata__year { font-size: 0.75em; opacity: 0.9; text-shadow: 0 0.0625em 0.1875em rgba(0,0,0,0.9); }",
    ".metadata__badge { display: inline-block; padding: 0.1em 0.35em; font-size: 0.75em; font-weight: 700; letter-spacing: 0.05em; line-height: 1.3; border-radius: 0.25em; text-shadow: none; text-transform: uppercase; }",
    ".metadata__quality { display: inline-block; vertical-align: middle; margin-right: 0.5em; font-size: 0.8em; font-weight: 700; letter-spacing: 0.02em; text-transform: uppercase; opacity: 0.95; text-shadow: 0 0.0625em 0.1875em rgba(0,0,0,0.9); }",
    ".metadata__quality-icon { display: inline-block; vertical-align: middle; width: 1.15em; height: 1.15em; margin-right: 0.2em; fill: currentColor; }",
    ".metadata__quality-label { display: inline-block; vertical-align: middle; line-height: 1; }",
    ".metadata__quality--4k { color: #66bb6a; }",
    ".metadata__quality--hd { color: #42a5f5; }",
    ".metadata__quality--ts { color: #ef5350; }",
    ".metadata__quality--no-color { color: #ffffff !important; }",
    ".metadata__episode { color: #BCAAA4; border: 0.1em solid rgba(151,101,87,0.4); font-weight: 600; }",
    ".card--obsidian .card__marker { right: 0.4em; top: 0.4em; left: auto; bottom: auto; }",
    ".card--obsidian .card__icons { top: 2em; }",
    ".card--obsidian .card__quality { display: none; }",
    ".obsidian--noir .card__img { filter: grayscale(1); transition: filter 0.25s ease; }",
    ".obsidian--noir .card.focus .card__img, .obsidian--noir .card.hover .card__img { filter: grayscale(0); }",
    ".obsidian--noir .card.obsidian--no-noir .card__img { filter: none; }",
    ".obsidian--noir .full-episode__img img { filter: grayscale(1); transition: filter 0.25s ease; }",
    ".obsidian--noir .card-episode.focus .full-episode__img img, .obsidian--noir .card-episode.hover .full-episode__img img, .obsidian--noir .full-episode.focus .full-episode__img img, .obsidian--noir .full-episode.hover .full-episode__img img, .obsidian--noir .card-episode.focus .card__img, .obsidian--noir .card-episode.hover .card__img { filter: grayscale(0); }",
    ".obsidian--noir-badges .metadata__rating, .obsidian--noir-badges .metadata__quality { filter: grayscale(1); transition: filter 0.25s ease; }",
    ".obsidian--noir-badges .card.focus .metadata__rating, .obsidian--noir-badges .card.hover .metadata__rating, .obsidian--noir-badges .card.focus .metadata__quality, .obsidian--noir-badges .card.hover .metadata__quality, .obsidian--noir-badges .card-episode.focus .metadata__rating, .obsidian--noir-badges .card-episode.hover .metadata__rating, .obsidian--noir-badges .card-episode.focus .metadata__quality, .obsidian--noir-badges .card-episode.hover .metadata__quality { filter: grayscale(0); }",
    ".obsidian--noir-badges .card.obsidian--no-noir .metadata__rating, .obsidian--noir-badges .card.obsidian--no-noir .metadata__quality { filter: none; }",
    ".items-line { padding-bottom: 2em; }",
  ].join("\n");

  var SPRITES =
    '<symbol id="sprite-tv-show" viewBox="0 0 51.802 51.801" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M47.947 4.43H12.495A3.86 3.86 0 0 0 8.64 8.284v2.641h-.466a3.86 3.86 0 0 0-3.855 3.854v2.642h-.465A3.86 3.86 0 0 0 0 21.275v22.242a3.86 3.86 0 0 0 3.854 3.854h35.453a3.86 3.86 0 0 0 3.855-3.854v-2.644h.465a3.86 3.86 0 0 0 3.854-3.854v-2.641h.467a3.86 3.86 0 0 0 3.854-3.854V8.284a3.857 3.857 0 0 0-3.855-3.854m-8.75 25.987v12.99H3.963V21.385h35.234zm4.321 6.494h-.355V21.275a3.86 3.86 0 0 0-3.855-3.854H12.604v-.001H8.641v-1.266h-.357v-1.266h35.235V36.91zm4.321-6.494h-.356V14.78a3.86 3.86 0 0 0-3.854-3.854H12.604V8.394H47.84z" fill="currentColor"/>' +
    '<path d="m26.401 30.446-5.788-4.215a1.916 1.916 0 0 0-3.044 1.549v8.43a1.914 1.914 0 0 0 1.916 1.916c.398 0 .794-.125 1.128-.367l5.788-4.215a1.92 1.92 0 0 0 0-3.098" fill="currentColor"/></symbol>' +
    '<symbol id="high" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M20 14c0-4.4183-3.5817-8-8-8s-8 3.5817-8 8c0 1.2497.3493 2.4556.8955 3.5547.2458.4945.0442 1.095-.4502 1.3408s-1.095.0442-1.3408-.4502C2.453 17.1346 2 15.6239 2 14 2 8.4772 6.4772 4 12 4s10 4.4772 10 10c0 1.6239-.4531 3.1346-1.1045 4.4453-.2458.4944-.8463.696-1.3408.4502s-.696-.8463-.4502-1.3408C19.6507 16.4556 20 15.2497 20 14m-7 0c0-.5523-.4477-1-1-1s-1 .4477-1 1 .4477 1 1 1 1-.4477 1-1m2 0c0 1.6569-1.3431 3-3 3s-3-1.3431-3-3 1.3431-3 3-3c.4625 0 .8988.108 1.29.2949l1.503-1.502c.3905-.3904 1.0235-.3904 1.414 0 .3905.3906.3905 1.0236 0 1.4141l-1.5029 1.502c.1872.3915.2959.8281.2959 1.291" fill="currentColor"/></symbol>' +
    '<symbol id="medium" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M20 14c0-4.4183-3.5817-8-8-8s-8 3.5817-8 8c0 1.2497.3493 2.4556.8955 3.5547.2458.4945.0442 1.095-.4502 1.3408s-1.095.0442-1.3408-.4502C2.453 17.1346 2 15.6239 2 14 2 8.4772 6.4772 4 12 4s10 4.4772 10 10c0 1.6239-.4531 3.1346-1.1045 4.4453-.2458.4944-.8463.696-1.3408.4502s-.696-.8463-.4502-1.3408C19.6507 16.4556 20 15.2497 20 14m-7 0c0-.5523-.4477-1-1-1s-1 .4477-1 1 .4477 1 1 1 1-.4477 1-1m2 0c0 1.6569-1.3431 3-3 3s-3-1.3431-3-3c0-1.3059.8353-2.4141 2-2.8262V9c0-.5523.4477-1 1-1s1 .4477 1 1v2.1738c1.1647.4121 2 1.5203 2 2.8262" fill="currentColor"/></symbol>' +
    '<symbol id="low" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M20 14c0-4.4183-3.5817-8-8-8s-8 3.5817-8 8c0 1.2497.3493 2.4556.8955 3.5547.2458.4945.0442 1.095-.4502 1.3408s-1.095.0442-1.3408-.4502C2.453 17.1346 2 15.6239 2 14 2 8.4772 6.4772 4 12 4s10 4.4772 10 10c0 1.6239-.4531 3.1346-1.1045 4.4453-.2458.4944-.8463.696-1.3408.4502s-.696-.8463-.4502-1.3408C19.6507 16.4556 20 15.2497 20 14m-7 0c0-.5523-.4477-1-1-1s-1 .4477-1 1 .4477 1 1 1 1-.4477 1-1m2 0c0 1.6569-1.3431 3-3 3s-3-1.3431-3-3c0-.4628.1078-.8996.295-1.291l-1.502-1.502c-.3905-.3905-.3906-1.0235 0-1.414s1.0235-.3905 1.414 0l1.502 1.5019C11.1004 11.1078 11.5372 11 12 11c1.6569 0 3 1.3431 3 3" fill="currentColor"/></symbol>' +
    '<symbol id="rating-star" viewBox="0 0 24 23" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M15.6162 7.10981L15.8464 7.55198L16.3381 7.63428L22.2841 8.62965C22.8678 8.72736 23.0999 9.44167 22.6851 9.86381L18.4598 14.1641L18.1104 14.5196L18.184 15.0127L19.0748 20.9752C19.1622 21.5606 18.5546 22.002 18.025 21.738L12.6295 19.0483L12.1833 18.8259L11.7372 19.0483L6.34171 21.738C5.81206 22.002 5.20443 21.5606 5.29187 20.9752L6.18264 15.0127L6.25629 14.5196L5.9069 14.1641L1.68155 9.86381C1.26677 9.44167 1.49886 8.72736 2.08255 8.62965L8.02855 7.63428L8.52022 7.55198L8.75043 7.10981L11.5345 1.76241C11.8078 1.23748 12.5589 1.23748 12.8322 1.76241L15.6162 7.10981Z" stroke="currentColor" stroke-width="2.2"/></symbol>';

  /* ---------- bootstrap ---------- */
  function dt() {
    if (window.obsidian_plugin) return;
    window.obsidian_plugin = !0;

    // custom card template
    (function () {
      var wrap = document.createElement("div");
      wrap.innerHTML = Lampa.Template.string("card");
      var card = wrap.firstElementChild,
        el;
      if (card) {
        card.className += " card--obsidian";
        (el = card.querySelector(".card__title")) && el.parentNode.removeChild(el);
        (el = card.querySelector(".card__age")) && el.parentNode.removeChild(el);
        Lampa.Template.add(T, wrap.innerHTML);
      }
    })();

    it();

    var style = document.createElement("style");
    style.innerHTML = CSS;
    document.head.appendChild(style);

    var sprites = document.getElementById("sprites");
    if (!sprites) {
      sprites = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      sprites.setAttribute("id", "sprites");
      sprites.setAttribute("aria-hidden", "true");
      sprites.style.position = "absolute";
      sprites.style.width = "0";
      sprites.style.height = "0";
      sprites.style.overflow = "hidden";
      document.body.appendChild(sprites);
    }
    sprites.insertAdjacentHTML("beforeend", SPRITES);

    y();

    if (Lampa.Platform.screen("mobile")) {
      Lampa.Listener.follow("activity", ht);
      Lampa.Listener.follow("line", pt);
      ft(lt());
    }

    h || (h = new o(s.qualityCache.key, s.qualityCache.size, s.qualityCache.time)).init();
    u || (u = new o(s.posterCache.key, s.posterCache.size, s.posterCache.time)).init();

    C();
  }

  window.appready
    ? dt()
    : Lampa.Listener.follow("app", function (t) {
        "ready" === t.type && dt();
      });
})();
