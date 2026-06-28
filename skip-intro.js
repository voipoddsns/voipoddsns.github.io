!function () {
  "use strict";

  /* ================================================================
   *  0. SELF-UPDATE PLUGIN METADATA
   * ================================================================ */
  if (window.__skipIntroLoaded) return;
  window.__skipIntroLoaded = true;

  try {
    var raw = Lampa.Storage.get("plugins", "[]");
    var list = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (Array.isArray(list)) {
      var dirty = false;
      list.forEach(function (p) {
        if (p.url && p.url.indexOf("lampa-auto-skip") !== -1) {
          if (p.name !== "Skip Intro/Outro") { p.name = "Skip Intro/Outro"; dirty = true; }
          if (p.author !== "@vahagn")       { p.author = "@vahagn";       dirty = true; }
          if (p.version !== "3.0.0")        { p.version = "3.0.0";        dirty = true; } // ✦ FIX: track version
        }
      });
      if (dirty) Lampa.Storage.set("plugins", JSON.stringify(list));
    }
  } catch (_) {}

  /* ================================================================
   *  1. CONSTANTS
   * ================================================================ */
  var API_TIMEOUT   = 5000;
  var MAX_INTRO_END = 360;          // seconds — don't look for intro past 6 min
  var AUDIO_SAMPLE_MS = 200;        // ✦ FIX: was 500ms → 200ms for better resolution
  var AUDIO_WINDOW  = 5;            // sliding window size for smoothing
  var DETECT_TTL    = 30 * 86400e3; // 30 days
  var CACHE_TTL     = 7  * 86400e3; // 7 days
  var SMART_MAX     = 300;          // ✦ FIX: LRU cap for smart memory
  var COUNTDOWN_MS  = 4000;
  var RETRY_BASE    = 500;
  var RETRY_MAX     = 20;

  var LABELS = {
    intro:   "Пропустить заставку",
    recap:   "Пропустити рекап",
    credits: "Пропустити титри",
    preview: "Пропустити превью"
  };

  var SEGMENT_TYPES = ["intro", "recap", "credits", "preview"];

  var KEY_NAMES = {
    back: "Назад", red: "Красная", green: "Зелёная",
    yellow: "Жёлтая", blue: "Синяя"
  };

  var KEY_MAP = {
    enter:  [13, 29443, 65385],
    space:  [32],
    back:   [8, 27, 10009, 461, 4],
    red:    [403],
    green:  [404],
    yellow: [405],
    blue:   [406]
  };

  /* ================================================================
   *  2. LRU CACHE  ✦ FIX: bounded size, prevents memory leak
   * ================================================================ */
  function LRUCache(maxSize, ttl) {
    this._map     = new Map();
    this._maxSize = maxSize || 200;
    this._ttl     = ttl || 0;
  }
  LRUCache.prototype.get = function (key) {
    if (!this._map.has(key)) return null;
    var entry = this._map.get(key);
    if (this._ttl && Date.now() - entry.ts > this._ttl) {
      this._map.delete(key);
      return null;
    }
    // move to end (most-recent)
    this._map.delete(key);
    this._map.set(key, entry);
    return entry.val;
  };
  LRUCache.prototype.set = function (key, val) {
    if (this._map.has(key)) this._map.delete(key);
    else if (this._map.size >= this._maxSize) {
      // evict oldest
      var oldest = this._map.keys().next().value;
      this._map.delete(oldest);
    }
    this._map.set(key, { val: val, ts: Date.now() });
  };
  LRUCache.prototype.remove = function (key) {
    this._map.delete(key);
  };

  /* ================================================================
   *  3. STORAGE ADAPTERS
   * ================================================================ */

  // 3a. Persistent LRU (syncs to Lampa.Storage)
  function PersistentLRU(storageKey, maxSize, ttl) {
    this._key  = storageKey;
    this._lru  = new LRUCache(maxSize, ttl);
    this._load();
  }
  PersistentLRU.prototype._load = function () {
    try {
      var raw = Lampa.Storage.get(this._key, "{}");
      var obj = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (obj && typeof obj === "object") {
        var keys = Object.keys(obj);
        for (var i = 0; i < keys.length; i++) {
          this._lru.set(keys[i], obj[keys[i]]);
        }
      }
    } catch (_) {}
  };
  PersistentLRU.prototype._flush = function () {
    try {
      var obj = {};
      this._lru._map.forEach(function (entry, key) {
        obj[key] = entry.val;
      });
      Lampa.Storage.set(this._key, JSON.stringify(obj));
    } catch (_) {}
  };
  PersistentLRU.prototype.get = function (key) {
    return this._lru.get(key);
  };
  PersistentLRU.prototype.set = function (key, val) {
    this._lru.set(key, val);
    this._flush();
  };
  PersistentLRU.prototype.remove = function (key) {
    this._lru.remove(key);
    this._flush();
  };

  // 3b. LocalStorage cache with TTL (for API results)
  var ApiCache = {
    _key: function (tmdb, s, e) { return "skip_api_" + tmdb + "_s" + s + "_e" + e; },
    get: function (tmdb, s, e) {
      try {
        var raw = localStorage.getItem(this._key(tmdb, s, e));
        if (!raw) return null;
        var data = JSON.parse(raw);
        if (Date.now() - data._ts > CACHE_TTL) {
          localStorage.removeItem(this._key(tmdb, s, e));
          return null;
        }
        return data.segments || [];
      } catch (_) { return null; }
    },
    set: function (tmdb, s, e, segments) {
      try {
        localStorage.setItem(this._key(tmdb, s, e), JSON.stringify({
          segments: segments, _ts: Date.now()
        }));
      } catch (_) {}
    }
  };

  // 3c. Detection cache (persistent LRU, 30 day TTL)
  var DetectCache = new PersistentLRU("skip_intro_detected", 500, DETECT_TTL);

  // 3d. Smart memory (persistent LRU, no TTL, capped at 300)  ✦ FIX
  var SmartMemory = new PersistentLRU("skip_intro_smart", SMART_MAX, 0);

  /* ================================================================
   *  4. SETTINGS / CONFIG
   * ================================================================ */
  var Config = {
    init: function () {
      Lampa.SettingsApi.addComponent({
        component: "skip_intro",
        name: "Пропуск заставок",
        icon: '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>'
      });

      var params = [
        { name: "skip_intro_enabled",     type: "trigger", def: true,  label: "Включить плагин",            desc: "Показывать кнопку пропуска заставок и титров" },
        { name: "skip_intro_auto",        type: "trigger", def: false, label: "Всегда автопропуск",          desc: "Всегда перематывать без кнопки (для всех сериалов)" },
        { name: "skip_intro_detect",      type: "trigger", def: true,  label: "Умное обнаружение",           desc: "Определять заставку по субтитрам и звуку, если нет данных в базе" },
        { name: "skip_intro_type_intro",  type: "trigger", def: true,  label: "Пропускать заставку (intro)" },
        { name: "skip_intro_type_recap",  type: "trigger", def: true,  label: "Пропускать рекап (recap)" },
        { name: "skip_intro_type_credits",type: "trigger", def: true,  label: "Пропускать титры (credits)" },
        { name: "skip_intro_type_preview",type: "trigger", def: false, label: "Пропускать превью (preview)" },
        { name: "skip_intro_key_skip",    type: "select",  def: "enter", label: "Кнопка «Пропустить»",
          values: { enter:"Enter / OK", space:"Пробел", red:"Красная (403)", green:"Зелёная (404)", yellow:"Жёлтая (405)", blue:"Синяя (406)" },
          desc: "Какая кнопка на пульте пропускает сегмент" },
        { name: "skip_intro_key_cancel",  type: "select",  def: "back", label: "Кнопка «Отменить»",
          values: { back:"Назад (Back)", red:"Красная (403)", green:"Зелёная (404)", yellow:"Жёлтая (405)", blue:"Синяя (406)" },
          desc: "Какая кнопка на пульте отменяет автопропуск" }
      ];

      params.forEach(function (p) {
        var field = { name: p.label };
        if (p.desc) field.description = p.desc;
        if (p.values) field.values = p.values;
        Lampa.SettingsApi.addParam({
          component: "skip_intro",
          param: { name: p.name, type: p.type, default: p.def },
          field: field
        });
      });
    },

    isEnabled:     function () { return Lampa.Storage.field("skip_intro_enabled")  !== false; },
    isAutoSkip:    function () { return Lampa.Storage.field("skip_intro_auto")     === true; },
    isDetectOn:    function () { return Lampa.Storage.field("skip_intro_detect")   !== false; },
    isTypeEnabled: function (t) { return Lampa.Storage.field("skip_intro_type_" + t) !== false; },

    getSkipKeys:   function () { return KEY_MAP[Lampa.Storage.field("skip_intro_key_skip")   || "enter"] || KEY_MAP.enter; },
    getCancelKeys: function () { return KEY_MAP[Lampa.Storage.field("skip_intro_key_cancel") || "back"]  || KEY_MAP.back; }
  };

  /* ================================================================
   *  5. SUBTITLE DETECTOR  ✦ FIX: density analysis + gap analysis
   * ================================================================ */
  var SubtitleDetector = {
    detect: function (videoEl) {
      return new Promise(function (resolve) {
        try {
          // Try custom subs first
          var customSubs = videoEl.customSubs;
          if (customSubs && customSubs.length) {
            var sub = null;
            for (var i = 0; i < customSubs.length; i++) {
              if (customSubs[i].url) { sub = customSubs[i]; break; }
            }
            if (sub && sub.url) {
              var xhr = new XMLHttpRequest();
              xhr.open("GET", sub.url, true);
              xhr.responseType = "text";
              xhr.timeout = 8000;
              xhr.onload = function () {
                if (xhr.status >= 200 && xhr.status < 300 && xhr.responseText) {
                  resolve(SubtitleDetector._analyzeSrt(xhr.responseText, videoEl.duration || 0));
                } else resolve([]);
              };
              xhr.onerror = xhr.ontimeout = function () { resolve([]); };
              xhr.send();
              return;
            }
          }

          // Fallback to textTracks
          var tracks = videoEl.textTracks;
          if (tracks && tracks.length) {
            for (var j = 0; j < tracks.length; j++) {
              if (tracks[j].cues && tracks[j].cues.length > 5) {
                resolve(SubtitleDetector._analyzeTrack(tracks[j], videoEl.duration || 0));
                return;
              }
            }
          }
          resolve([]);
        } catch (_) { resolve([]); }
      });
    },

    _analyzeTrack: function (track, duration) {
      var cues = [];
      for (var i = 0; i < track.cues.length; i++) {
        cues.push({ start: track.cues[i].startTime, end: track.cues[i].endTime });
      }
      return this._findSegments(cues, duration);
    },

    _parseTime: function (s) {
      var m = s.match(/(\d+):(\d{2}):(\d{2})[.,](\d{3})/);
      return m ? +m[1]*3600 + +m[2]*60 + +m[3] + +m[4]/1000 : 0;
    },

    _analyzeSrt: function (text, duration) {
      text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      var cues = [], re = /(\d{1,2}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[.,]\d{3})/g, m;
      while ((m = re.exec(text))) {
        var s = this._parseTime(m[1]), e = this._parseTime(m[2]);
        if (e > s) cues.push({ start: s, end: e });
      }
      return cues.length < 5 ? [] : this._findSegments(cues, duration);
    },

    _findSegments: function (cues, duration) {
      cues.sort(function (a, b) { return a.start - b.start; });
      var segments = [];

      // ✦ FIX: density-based intro detection
      // Split first 6 minutes into 10s windows, find the longest
      // consecutive run of empty/low-density windows
      var windowSize = 10;
      var searchEnd  = Math.min(duration || 9999, MAX_INTRO_END);
      var windows    = [];

      for (var w = 0; w < searchEnd; w += windowSize) {
        var count = 0;
        for (var c = 0; c < cues.length; c++) {
          if (cues[c].start >= w && cues[c].start < w + windowSize) count++;
          if (cues[c].start >= w + windowSize) break;
        }
        windows.push({ start: w, density: count });
      }

      // Find longest low-density run at the beginning (intro)
      var introStart = -1, introEnd = -1, runLen = 0, bestRun = 0, bestStart = 0;
      for (var i = 0; i < windows.length; i++) {
        if (windows[i].density <= 1) { // ✦ FIX: allow ≤1 cue per 10s (not just 0)
          if (runLen === 0) bestStart = windows[i].start;
          runLen += windowSize;
        } else {
          if (runLen > bestRun && bestStart < 30) { // must start near beginning
            bestRun = runLen;
            introStart = bestStart;
            introEnd = windows[i - 1].start + windowSize;
          }
          runLen = 0;
        }
      }
      if (runLen > bestRun && bestStart < 30) {
        bestRun = runLen;
        introStart = bestStart;
        introEnd = windows[windows.length - 1].start + windowSize;
      }

      if (bestRun >= 20 && bestRun <= 150 && introStart < 15) {
        // Refine: snap to actual gap boundaries
        var refined = this._refineByGap(cues, introStart, introEnd);
        if (refined) {
          segments.push({ type: "intro", start: refined.start, end: refined.end });
          console.log("[SkipIntro] Subtitle density intro:", refined.start, "→", refined.end);
        }
      }

      // ✦ FIX: gap-based fallback for intro (original logic, kept as fallback)
      if (segments.length === 0 || segments[0].type !== "intro") {
        var bestGap = null, bestGapLen = 0;
        if (cues.length > 0 && cues[0].start >= 15 && cues[0].start <= 150) {
          bestGap = { start: 0, end: Math.round(cues[0].start) };
          bestGapLen = bestGap.end;
        }
        for (var g = 0; g < cues.length - 1; g++) {
          var gapStart = cues[g].end, gapEnd = cues[g + 1].start;
          var gapLen = gapEnd - gapStart;
          if (gapLen >= 15 && gapLen <= 150 && gapStart < MAX_INTRO_END && gapLen > bestGapLen) {
            bestGapLen = gapLen;
            bestGap = { start: Math.round(gapStart), end: Math.round(gapEnd) };
          }
        }
        if (bestGap) {
          segments.push({ type: "intro", start: bestGap.start, end: bestGap.end });
          console.log("[SkipIntro] Subtitle gap intro:", bestGap.start, "→", bestGap.end);
        }
      }

      // Credits detection: gap after last subtitle
      if (duration > 600 && cues.length > 0) {
        var last = cues[cues.length - 1];
        var tailGap = duration - last.end;

        // Also check for mid-tail gaps (sometimes credits start before final scene)
        var bestCreditGap = null, bestCreditLen = 0;
        var searchFrom = Math.max(0, duration - 600);
        for (var k = 0; k < cues.length - 1; k++) {
          if (cues[k].end < searchFrom) continue;
          var cGap = cues[k + 1].start - cues[k].end;
          if (cGap >= 30 && cGap > bestCreditLen) {
            bestCreditLen = cGap;
            bestCreditGap = { start: Math.round(cues[k].end), end: Math.round(cues[k + 1].start) };
          }
        }

        if (bestCreditGap && bestCreditLen > tailGap) {
          segments.push({ type: "credits", start: bestCreditGap.start, end: bestCreditGap.end });
          console.log("[SkipIntro] Subtitle credits gap:", bestCreditGap.start, "→", bestCreditGap.end);
        } else if (tailGap >= 30) {
          segments.push({ type: "credits", start: Math.round(last.end), end: Math.round(duration) });
          console.log("[SkipIntro] Subtitle credits tail:", Math.round(last.end), "→", Math.round(duration));
        }
      }

      return segments;
    },

    // ✦ FIX: refine intro boundaries by finding exact gap edges
    _refineByGap: function (cues, approxStart, approxEnd) {
      var bestGap = null, bestLen = 0;
      for (var i = 0; i < cues.length - 1; i++) {
        if (cues[i].end < approxStart - 5) continue;
        if (cues[i].start > approxEnd + 5) break;
        var gap = cues[i + 1].start - cues[i].end;
        if (gap >= 15 && gap > bestLen) {
          bestLen = gap;
          bestGap = { start: Math.round(cues[i].end), end: Math.round(cues[i + 1].start) };
        }
      }
      // Also check gap before first cue
      if (cues.length > 0 && cues[0].start >= 15 && cues[0].start > bestLen) {
        bestGap = { start: 0, end: Math.round(cues[0].start) };
      }
      return bestGap;
    }
  };

  /* ================================================================
   *  6. AUDIO DETECTOR  ✦ FIX: WeakMap, 200ms sampling, better analysis
   * ================================================================ */
  var _sourceMap = new WeakMap(); // ✦ FIX: prevents NotAllowedError on re-attach

  var AudioDetector = {
    _ctx: null,
    _analyser: null,
    _rafId: null,
    _abortFlag: false,

    detect: function (videoEl) {
      var self = this;
      self.abort();

      return new Promise(function (resolve) {
        var resolved = false;
        function done(val) { if (!resolved) { resolved = true; resolve(val); } }

        try {
          var Ctx = window.AudioContext || window.webkitAudioContext;
          if (!Ctx) { console.log("[SkipIntro] No Web Audio API"); return done(null); }

          if (!self._ctx || self._ctx.state === "closed") {
            self._ctx = new Ctx();
          }
          if (self._ctx.state === "suspended") self._ctx.resume();

          // ✦ FIX: WeakMap prevents double-connect error
          var source;
          if (_sourceMap.has(videoEl)) {
            source = _sourceMap.get(videoEl);
          } else {
            source = self._ctx.createMediaElementSource(videoEl);
            _sourceMap.set(videoEl, source);
          }

          if (!self._analyser) {
            self._analyser = self._ctx.createAnalyser();
            self._analyser.fftSize = 2048;
            self._analyser.smoothingTimeConstant = 0.3; // ✦ FIX: lower smoothing for sharper edges
            source.connect(self._analyser);
            self._analyser.connect(self._ctx.destination);
          }

          var samples = [];
          var buf = new Uint8Array(self._analyser.frequencyBinCount);
          var startTime = videoEl.currentTime;
          self._abortFlag = false;

          function sample() {
            if (self._abortFlag) return done(samples.length > 20 ? self._analyze(samples) : null);

            var now = videoEl.currentTime;
            if (now - startTime > MAX_INTRO_END || now > 420) {
              return done(samples.length > 20 ? self._analyze(samples) : null);
            }

            self._analyser.getByteFrequencyData(buf);
            var sum = 0;
            for (var i = 0; i < buf.length; i++) sum += buf[i];
            samples.push({ time: now, energy: sum / buf.length });

            self._rafId = setTimeout(sample, AUDIO_SAMPLE_MS); // ✦ FIX: 200ms
          }

          // Hard timeout
          setTimeout(function () {
            done(samples.length > 20 ? self._analyze(samples) : null);
          }, 370000);

          sample();
        } catch (err) {
          console.log("[SkipIntro] AudioDetector error:", err.message);
          done(null);
        }
      });
    },

    _analyze: function (samples) {
      if (samples.length < 30) return null;

      // ✦ FIX: sliding window smoothing
      var smoothed = [];
      var half = Math.floor(AUDIO_WINDOW / 2);
      for (var i = half; i < samples.length - half; i++) {
        var sum = 0;
        for (var j = -half; j <= half; j++) sum += samples[i + j].energy;
        smoothed.push({ time: samples[i].time, energy: sum / AUDIO_WINDOW });
      }
      if (smoothed.length < 15) return null;

      // ✦ FIX: adaptive threshold using percentile, not just median
      var energies = smoothed.map(function (s) { return s.energy; }).sort(function (a, b) { return a - b; });
      var p25 = energies[Math.floor(energies.length * 0.25)];
      var p75 = energies[Math.floor(energies.length * 0.75)];
      var iqr = p75 - p25;
      var highThresh = p75 + 0.5 * iqr; // ✦ FIX: IQR-based, more robust
      var lowThresh  = p25 - 0.3 * iqr;

      var introStart = null, introEnd = null, highCount = 0, inHigh = false;

      for (var k = 0; k < smoothed.length; k++) {
        var s = smoothed[k];
        if (s.time > MAX_INTRO_END) break;

        if (s.energy > highThresh) {
          if (!inHigh) { inHigh = true; introStart = s.time; highCount = 0; }
          highCount++;
        } else if (inHigh && s.energy < lowThresh) {
          var dur = s.time - introStart;
          if (dur >= 15 && dur <= 150 && highCount >= 15) { // ✦ FIX: min 15 high samples (~3s at 200ms)
            introEnd = s.time;
            break;
          }
          inHigh = false;
          introStart = null;
          highCount = 0;
        }
      }

      if (introStart != null && introEnd != null) {
        console.log("[SkipIntro] Audio intro detected:", Math.round(introStart), "→", Math.round(introEnd));
        return { type: "intro", start: Math.round(introStart), end: Math.round(introEnd) };
      }
      return null;
    },

    abort: function () {
      this._abortFlag = true;
      if (this._rafId) { clearTimeout(this._rafId); this._rafId = null; }
    },

    destroy: function () {
      this.abort();
      try {
        if (this._analyser) { this._analyser.disconnect(); this._analyser = null; }
        if (this._ctx && this._ctx.state !== "closed") { this._ctx.close(); this._ctx = null; }
      } catch (_) {}
    }
  };

  /* ================================================================
   *  7. API LOADER  ✦ FIX: AbortController-like cancellation
   * ================================================================ */
  var ApiLoader = {
    _pending: [],

    _fetch: function (url, timeout) {
      var self = this;
      return new Promise(function (resolve, reject) {
        var aborted = false;
        var xhr = new XMLHttpRequest();
        var timer = setTimeout(function () { aborted = true; xhr.abort(); reject(new Error("timeout")); }, timeout || API_TIMEOUT);

        var handle = { abort: function () { aborted = true; xhr.abort(); clearTimeout(timer); } };
        self._pending.push(handle);

        xhr.open("GET", url, true);
        xhr.setRequestHeader("Accept", "application/json");
        xhr.onreadystatechange = function () {
          if (xhr.readyState !== 4) return;
          clearTimeout(timer);
          var idx = self._pending.indexOf(handle);
          if (idx !== -1) self._pending.splice(idx, 1);
          if (aborted) return;
          if (xhr.status >= 200 && xhr.status < 300) {
            try { resolve(JSON.parse(xhr.responseText)); } catch (e) { reject(e); }
          } else if (xhr.status === 204 || xhr.status === 404) {
            resolve(null);
          } else {
            reject(new Error("HTTP " + xhr.status));
          }
        };
        xhr.onerror = function () {
          clearTimeout(timer);
          var idx = self._pending.indexOf(handle);
          if (idx !== -1) self._pending.splice(idx, 1);
          if (!aborted) reject(new Error("network"));
        };
        xhr.send();
      });
    },

    abortAll: function () {
      this._pending.forEach(function (h) { h.abort(); });
      this._pending = [];
    },

    _normTheIntroDB: function (data) {
      var out = [];
      if (!data) return out;
      SEGMENT_TYPES.forEach(function (type) {
        var arr = data[type];
        if (Array.isArray(arr)) arr.forEach(function (s) {
          var start = s.start_ms != null ? s.start_ms / 1000 : (s.start || 0);
          var end   = s.end_ms   != null ? s.end_ms   / 1000 : (s.end   || 0);
          if (end > start) out.push({ type: type, start: start, end: end });
        });
      });
      return out;
    },

    _normIntroDB: function (intro, credits) {
      var out = [];
      if (intro   && intro.end   > intro.start)   out.push({ type: "intro",   start: intro.start,   end: intro.end });
      if (credits && credits.end > credits.start)  out.push({ type: "credits", start: credits.start, end: credits.end });
      return out;
    },

    _normIntroHater: function (data) {
      if (!Array.isArray(data)) return [];
      return data.filter(function (s) { return s.end > s.start; }).map(function (s) {
        var label = (s.label || "").toLowerCase();
        var type = "intro";
        if (label.indexOf("credit") !== -1 || label === "ed") type = "credits";
        else if (label.indexOf("recap") !== -1) type = "recap";
        else if (label.indexOf("preview") !== -1) type = "preview";
        return { type: type, start: Math.round(s.start), end: Math.round(s.end) };
      });
    },

    load: function (tmdbId, imdbId, season, episode) {
      // Check cache first
      var cached = ApiCache.get(tmdbId, season, episode);
      if (cached !== null) return Promise.resolve(cached);

      var self = this;
      var save = function (segs) { ApiCache.set(tmdbId, season, episode, segs || []); return segs || []; };

      // ✦ FIX: sequential fallback chain with proper error isolation
      return self._fetch("https://api.theintrodb.org/v2/media?tmdb_id=" + tmdbId + "&season=" + season + "&episode=" + episode)
        .then(function (data) {
          var segs = self._normTheIntroDB(data);
          return segs.length > 0 ? save(segs) : Promise.reject("empty");
        })
        .catch(function () {
          var imdbQ = imdbId ? "imdb=" + imdbId : "tmdb=" + tmdbId;
          var base  = "https://api.introdb.app";
          return Promise.all([
            self._fetch(base + "/get_intros?"   + imdbQ + "&season=" + season + "&episode=" + episode).catch(function () { return null; }),
            self._fetch(base + "/get_credits?"  + imdbQ + "&season=" + season + "&episode=" + episode).catch(function () { return null; })
          ]).then(function (res) {
            var segs = self._normIntroDB(res[0], res[1]);
            return segs.length > 0 ? save(segs) : Promise.reject("empty");
          });
        })
        .catch(function () {
          if (!imdbId) return save([]);
          return self._fetch("https://introhater.com/api/segments/" + imdbId + ":" + season + ":" + episode)
            .then(function (data) { return save(self._normIntroHater(data)); })
            .catch(function () { return save([]); });
        });
    }
  };

  /* ================================================================
   *  8. BUTTON UI  ✦ FIX: rAF progress, single key handler, CSS vars
   * ================================================================ */
  var ButtonUI = {
    _el: null,
    _visible: false,
    _mode: null,
    _rafId: null,
    _fadeTimer: null,

    _injectCSS: function () {
      if (document.getElementById("skip-intro-css")) return;
      var style = document.createElement("style");
      style.id = "skip-intro-css";
      style.textContent = [
        ":root{--skip-bg:rgba(0,0,0,.65);--skip-border:rgba(255,255,255,.2);--skip-focus:rgba(255,255,255,.6);--skip-radius:12px}",
        ".skip-intro-btn{position:absolute;right:40px;bottom:180px;padding:0;background:var(--skip-bg);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1.5px solid var(--skip-border);border-radius:var(--skip-radius);color:#fff;font-size:1em;cursor:pointer;z-index:9999;transition:opacity .35s cubic-bezier(.4,0,.2,1),transform .35s cubic-bezier(.4,0,.2,1),border-color .25s;opacity:0;pointer-events:none;transform:translateX(24px) scale(.96);outline:none;font-family:inherit;line-height:1.4;white-space:nowrap;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 4px 24px rgba(0,0,0,.4)}",
        ".skip-intro-btn.visible{opacity:1;pointer-events:auto;transform:translateX(0) scale(1)}",
        ".skip-intro-btn:focus-visible,.skip-intro-btn:hover{border-color:var(--skip-focus);background:rgba(0,0,0,.82)}",
        ".skip-intro-inner{display:flex;align-items:center;padding:14px 28px;gap:10px;position:relative;z-index:2}",
        ".skip-intro-icon{width:20px;height:20px;flex-shrink:0;opacity:.9}",
        ".skip-intro-progress{position:absolute;bottom:0;left:0;height:3px;background:linear-gradient(90deg,rgba(255,255,255,.9),rgba(180,200,255,.7));border-radius:0 0 10px 10px;z-index:3;will-change:width}",
        ".skip-intro-badge{font-size:.7em;opacity:.45;margin-left:6px;font-weight:300}",
        ".skip-intro-hint{font-size:.7em;opacity:.4;margin-left:8px;font-weight:300;border:1px solid rgba(255,255,255,.25);border-radius:4px;padding:1px 6px;letter-spacing:.5px}"
      ].join("\n");
      document.head.appendChild(style);
    },

    show: function (label, onSkip, onCancel, badge, isCountdown) {
      this._injectCSS();
      this._stopProgress();

      if (this._el) {
        this._update(label, badge, isCountdown);
        this._el._onSkip = onSkip;
        this._el._onCancel = onCancel;
        this._el._hasCancel = !!onCancel;
        if (isCountdown) this._startProgress(onSkip);
        if (!this._visible) this._setVisible(true);
        return;
      }

      this._create(label, onSkip, onCancel, badge, isCountdown);
      if (isCountdown) this._startProgress(onSkip);
    },

    _create: function (label, onSkip, onCancel, badge, isCountdown) {
      var self = this;
      var el = document.createElement("div");
      el.className = "skip-intro-btn" + (isCountdown ? " countdown" : "");
      el.setAttribute("tabindex", "1");

      var inner = document.createElement("div");
      inner.className = "skip-intro-inner";

      var lbl = document.createElement("span");
      lbl.className = "skip-intro-label";
      lbl.textContent = label;
      inner.appendChild(lbl);

      if (badge) {
        var bdg = document.createElement("span");
        bdg.className = "skip-intro-badge";
        bdg.textContent = badge;
        inner.appendChild(bdg);
      }

      // Icon
      var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "skip-intro-icon");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("fill", "currentColor");
      var p1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p1.setAttribute("d", "M5.5 18.5V5.5L14 12L5.5 18.5Z");
      var p2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p2.setAttribute("d", "M14 18.5V5.5L22.5 12L14 18.5Z");
      svg.appendChild(p1); svg.appendChild(p2);
      inner.appendChild(svg);

      // Hint
      var hint = document.createElement("span");
      hint.className = "skip-intro-hint";
      inner.appendChild(hint);
      el._hintEl = hint;

      el.appendChild(inner);

      // Progress bar
      var bar = document.createElement("div");
      bar.className = "skip-intro-progress";
      bar.style.width = "0%";
      el.appendChild(bar);
      el._bar = bar;

      el._onSkip = onSkip;
      el._onCancel = onCancel;
      el._hasCancel = !!onCancel;

      // Click
      inner.addEventListener("click", function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        if (el._onSkip) el._onSkip();
      });

      // ✦ FIX: single delegated key handler
      el._keyHandler = function (ev) {
        if (!el.classList.contains("visible")) return;
        var code = ev.keyCode || ev.which;
        var skipKeys = Config.getSkipKeys();
        var cancelKeys = Config.getCancelKeys();

        if (skipKeys.indexOf(code) !== -1) {
          ev.preventDefault(); ev.stopPropagation();
          if (el._onSkip) el._onSkip();
        } else if (el._hasCancel && cancelKeys.indexOf(code) !== -1) {
          ev.preventDefault(); ev.stopPropagation();
          if (el._onCancel) el._onCancel();
        }
      };
      document.addEventListener("keydown", el._keyHandler, true);

      self._el = el;
      self._updateHint(isCountdown);

      var container = document.querySelector(".player") || document.body;
      container.appendChild(el);

      setTimeout(function () { self._setVisible(true); }, 30);
    },

    _update: function (label, badge, isCountdown) {
      if (!this._el) return;
      var lbl = this._el.querySelector(".skip-intro-label");
      if (lbl) lbl.textContent = label;
      var bdg = this._el.querySelector(".skip-intro-badge");
      if (bdg) bdg.textContent = badge || "";
      this._el._hasCancel = !!this._el._onCancel;
      this._updateHint(isCountdown);
      if (this._el._bar) this._el._bar.style.width = "0%";
    },

    _updateHint: function (isCountdown) {
      if (!this._el || !this._el._hintEl) return;
      if (isCountdown) {
        var ck = Lampa.Storage.field("skip_intro_key_cancel") || "back";
        this._el._hintEl.textContent = "нажмите " + (KEY_NAMES[ck] || "Назад") + " для отмены";
      } else {
        var sk = Config.getSkipKeys();
        var name = "OK";
        for (var i = 0; i < sk.length; i++) {
          if (sk[i] === 13 || sk[i] === 29443 || sk[i] === 65385) { name = "OK"; break; }
        }
        this._el._hintEl.textContent = "нажмите " + name;
      }
    },

    // ✦ FIX: requestAnimationFrame instead of setInterval
    _startProgress: function (onDone) {
      var self = this;
      var start = performance.now();
      function frame(now) {
        var p = Math.min(1, (now - start) / COUNTDOWN_MS);
        if (self._el && self._el._bar) {
          self._el._bar.style.width = (p * 100) + "%";
        }
        if (p >= 1) {
          self._rafId = null;
          if (onDone) onDone();
        } else {
          self._rafId = requestAnimationFrame(frame);
        }
      }
      self._rafId = requestAnimationFrame(frame);
    },

    _stopProgress: function () {
      if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    },

    _setVisible: function (v) {
      this._visible = v;
      if (this._el) {
        if (v) this._el.classList.add("visible");
        else   this._el.classList.remove("visible");
      }
    },

    hide: function () {
      this._stopProgress();
      this._setVisible(false);
      var el = this._el;
      var self = this;
      clearTimeout(this._fadeTimer);
      this._fadeTimer = setTimeout(function () {
        if (el) {
          if (el._keyHandler) document.removeEventListener("keydown", el._keyHandler, true);
          if (el.parentNode) el.parentNode.removeChild(el);
        }
        if (self._el === el) self._el = null;
      }, 400);
    },

    destroy: function () {
      this._stopProgress();
      clearTimeout(this._fadeTimer);
      if (this._el) {
        if (this._el._keyHandler) document.removeEventListener("keydown", this._el._keyHandler, true);
        if (this._el.parentNode) this._el.parentNode.removeChild(this._el);
        this._el = null;
      }
      this._visible = false;
      this._mode = null;
    },

    isVisible: function () { return this._visible; }
  };

  /* ================================================================
   *  9. SKIP ENGINE (main orchestrator)
   * ================================================================ */
  function findActiveSegment(segments, time) {
    for (var i = 0; i < segments.length; i++) {
      if (time >= segments[i].start && time < segments[i].end) return segments[i];
    }
    return null;
  }

  var Engine = {
    _segments: [],
    _active: null,
    _lastSkipped: null,
    _currentData: null,
    _tmdbId: null,
    _inited: false,

    init: function () {
      if (this._inited) return;
      this._inited = true;
      Config.init();

      var self = this;

      Lampa.Player.listener.follow("start", function (data) { self._onStart(data); });
      Lampa.Player.listener.follow("destroy", function ()     { self._onDestroy(); });

      if (Lampa.PlayerVideo && Lampa.PlayerVideo.listener) {
        Lampa.PlayerVideo.listener.follow("timeupdate", function (data) { self._onTime(data); });
      }

      console.log("[SkipIntro] v3.0 initialized | LRU cache, rAF progress, IQR audio, density subs");
    },

    _extractMeta: function (data) {
      var meta = { tmdb_id: null, imdb_id: null, season: null, episode: null, is_series: false };
      var card = data.card || null;

      if (!card) {
        try {
          var act = Lampa.Activity.active();
          card = (act && act.card) || (act && act.movie) || null;
        } catch (_) {}
      }

      if (card) {
        meta.tmdb_id = card.id || null;
        meta.imdb_id = card.imdb_id || null;
        if (card.name && !card.title) meta.is_series = true;
        if (card.number_of_seasons || card.first_air_date) meta.is_series = true;
      }

      if (data.season  != null) meta.season  = parseInt(data.season);
      if (data.episode != null) meta.episode = parseInt(data.episode);

      // Parse from title
      if ((meta.season == null || meta.episode == null) && data.title) {
        var m = data.title.match(/[Ss](\d+)[Ee](\d+)/);
        if (m) {
          if (meta.season  == null) meta.season  = parseInt(m[1]);
          if (meta.episode == null) meta.episode = parseInt(m[2]);
        }
      }

      // Parse from playlist
      if (data.playlist && Array.isArray(data.playlist)) {
        for (var i = 0; i < data.playlist.length; i++) {
          var item = data.playlist[i];
          var url = typeof item.url === "string" ? item.url : "";
          if (url === data.url || i === 0) {
            if (item.season  != null && meta.season  == null) meta.season  = parseInt(item.season);
            if (item.episode != null && meta.episode == null) meta.episode = parseInt(item.episode);
            if (item.s       != null && meta.season  == null) meta.season  = parseInt(item.s);
            if (item.e       != null && meta.episode == null) meta.episode = parseInt(item.e);
            if (url === data.url) break;
          }
        }
      }

      if (meta.season != null && meta.episode != null) meta.is_series = true;
      return meta;
    },

    _onStart: function (data) {
      // ✦ FIX: cancel pending requests from previous video
      ApiLoader.abortAll();
      AudioDetector.abort();

      this._segments    = [];
      this._active      = null;
      this._lastSkipped = null;
      this._currentData = data;
      this._tmdbId      = null;

      if (!Config.isEnabled()) return;

      var meta = this._extractMeta(data);
      if (!meta.tmdb_id || !meta.is_series || meta.season == null || meta.episode == null) {
        console.log("[SkipIntro] Not a series or missing metadata:", meta);
        return;
      }

      this._tmdbId = meta.tmdb_id;
      console.log("[SkipIntro] Loading S" + meta.season + "E" + meta.episode + " (TMDB:" + meta.tmdb_id + ")");

      var self = this;
      var apiDone = false, detectDone = false;
      var apiSegs = [], detectSegs = [];

      function merge() {
        if (!apiDone || !detectDone || self._currentData !== data) return;

        var merged = apiSegs.slice();
        detectSegs.forEach(function (ds) {
          var replaced = false;
          for (var i = 0; i < merged.length; i++) {
            if (merged[i].type === ds.type) {
              // ✦ FIX: prefer detection if it finds an earlier start
              if (ds.start < merged[i].start) {
                console.log("[SkipIntro] Detection overrides API for", ds.type, ds.start, "→", ds.end);
                merged[i] = ds;
              }
              replaced = true;
              break;
            }
          }
          if (!replaced) merged.push(ds);
        });

        self._segments = merged;
        console.log("[SkipIntro] Final segments:", merged.length, merged);
      }

      // API load
      ApiLoader.load(meta.tmdb_id, meta.imdb_id, meta.season, meta.episode)
        .then(function (segs) {
          if (self._currentData !== data) return;
          apiSegs = segs || [];
          apiDone = true;
          if (apiSegs.length > 0) self._segments = apiSegs; // show immediately
          merge();
        })
        .catch(function () { apiDone = true; merge(); });

      // Detection
      if (Config.isDetectOn()) {
        self._runDetection(data, meta, function (segs) {
          if (self._currentData !== data) return;
          detectSegs = segs || [];
          detectDone = true;
          merge();
        });
      } else {
        detectDone = true;
      }
    },

    _runDetection: function (data, meta, cb) {
      // Check detection cache
      var cacheKey = meta.tmdb_id + "_s" + meta.season + "_e" + meta.episode;
      var cached = DetectCache.get(cacheKey);
      if (cached && cached.length > 0) {
        console.log("[SkipIntro] Cached detection:", cached.length, "segments");
        return cb(cached);
      }

      var self = this, attempts = 0;

      function waitVideo() {
        var video;
        try { video = Lampa.PlayerVideo.video(); } catch (_) {}
        if (!video || !video.duration) {
          if (++attempts < 30 && self._currentData === data) return setTimeout(waitVideo, 500);
          return cb([]);
        }

        SubtitleDetector.detect(video).then(function (subs) {
          if (self._currentData !== data) return cb([]);
          if (subs && subs.length > 0) {
            subs.forEach(function (s) { s._source = "subs"; });
            DetectCache.set(cacheKey, subs);
            return cb(subs);
          }
          console.log("[SkipIntro] No subtitle segments, trying audio...");
          AudioDetector.detect(video).then(function (audio) {
            if (self._currentData !== data) return cb([]);
            if (audio) {
              audio._source = "audio";
              var arr = [audio];
              DetectCache.set(cacheKey, arr);
              cb(arr);
            } else cb([]);
          }).catch(function () { cb([]); });
        }).catch(function () { cb([]); });
      }

      waitVideo();
    },

    _onTime: function (data) {
      if (!Config.isEnabled() || !this._segments.length) return;
      var time = data.current;
      if (time == null || isNaN(time)) return;

      var seg = findActiveSegment(this._segments, time);

      if (!seg) {
        if (this._active) { this._active = null; ButtonUI.hide(); }
        return;
      }

      if (!Config.isTypeEnabled(seg.type)) {
        if (this._active) { this._active = null; ButtonUI.hide(); }
        return;
      }

      if (this._lastSkipped === seg) return;

      if (Config.isAutoSkip()) return this._skip(seg, true);

      if (this._active !== seg) {
        this._active = seg;
        var badge = seg._source === "subs" ? "(по субтитрам)" : seg._source === "audio" ? "(по звуку)" : null;
        var label = LABELS[seg.type] || "Пропустить";
        var self = this;

        if (this._tmdbId && SmartMemory.get(this._tmdbId + "_" + seg.type)) {
          // User previously skipped this type → countdown mode
          ButtonUI.show(label, function () { self._skip(seg, true); }, function () {
            console.log("[SkipIntro] Auto-skip cancelled");
            SmartMemory.remove(self._tmdbId + "_" + seg.type);
            self._lastSkipped = seg;
            ButtonUI.destroy();
            self._active = null;
          }, badge, true);
        } else {
          // Normal mode
          ButtonUI.show(label, function () {
            if (self._tmdbId) SmartMemory.set(self._tmdbId + "_" + seg.type, true);
            self._skip(seg, false);
          }, null, badge, false);
        }
      }
    },

    _skip: function (seg, isAuto) {
      this._lastSkipped = seg;
      this._active = null;
      ButtonUI.destroy();

      try {
        var video = Lampa.PlayerVideo.video();
        if (video) {
          var target = Math.min(seg.end, video.duration || seg.end);
          video.currentTime = target;
          console.log("[SkipIntro] Skipped", seg.type, "→", target, isAuto ? "(auto)" : "(manual)");

          // ✦ FIX: ensure playback resumes after seek
          setTimeout(function () {
            try { if (video.paused) video.play(); } catch (_) {}
          }, 150);
        }
      } catch (err) {
        console.log("[SkipIntro] Seek error:", err);
      }
    },

    _onDestroy: function () {
      ApiLoader.abortAll();
      AudioDetector.abort();
      this._segments    = [];
      this._active      = null;
      this._lastSkipped = null;
      this._currentData = null;
      this._tmdbId      = null;
      ButtonUI.destroy();
    }
  };

  /* ================================================================
   *  10. BOOTSTRAP  ✦ FIX: single exponential-backoff retry
   * ================================================================ */
  function bootstrap(attempt) {
    attempt = attempt || 0;
    if (window.Lampa && Lampa.SettingsApi && Lampa.Player && Lampa.Storage) {
      if (Lampa.Listener) {
        Lampa.Listener.follow("app", function (ev) {
          if (ev.type === "ready") Engine.init();
        });
      }
      // Also try immediately in case app is already ready
      setTimeout(function () { Engine.init(); }, 500);
      return;
    }
    if (attempt >= RETRY_MAX) {
      console.warn("[SkipIntro] Lampa not found after", RETRY_MAX, "attempts");
      return;
    }
    // ✦ FIX: exponential backoff with cap
    var delay = Math.min(RETRY_BASE * Math.pow(1.5, attempt), 5000);
    setTimeout(function () { bootstrap(attempt + 1); }, delay);
  }

  bootstrap();

}();
