/* ============================================================
 *  JacRed quality fetcher для Obsidian
 *  Замена приватного API {url, token} на публичный jac.red
 * ============================================================ */

const JACRED_PROTOCOL = "https://";
const JACRED_URL = () => Lampa.Storage.get("jac.red") || "jac.red";
const JACRED_CACHE_KEY = "obsidian_jacred_cache";
const JACRED_CACHE_TTL = 72 * 60 * 60 * 1000; // 72 часа
const JACRED_PROXY_LIST = [
  "http://api.allorigins.win/raw?url=",
  "http://cors.bwa.workers.dev/",
];
const JACRED_PROXY_TIMEOUT = 5000;

/* ---------- кэш ---------- */
function jacredCacheGet(key) {
  const cache = Lampa.Storage.get(JACRED_CACHE_KEY, {});
  const item = cache[key];
  if (item && Date.now() - item.timestamp < JACRED_CACHE_TTL) return item;
  return null;
}

function jacredCacheSet(key, data) {
  const cache = Lampa.Storage.get(JACRED_CACHE_KEY, {});
  // чистка устаревших записей
  for (const k in cache) {
    if (Date.now() - cache[k].timestamp >= JACRED_CACHE_TTL) delete cache[k];
  }
  cache[key] = { ...data, timestamp: Date.now() };
  Lampa.Storage.set(JACRED_CACHE_KEY, cache);
}

/* ---------- запрос с fallback на прокси ---------- */
function jacredFetch(url, callback) {
  let settled = false;
  let proxyIndex = 0;
  let timer = null;

  const finish = (err, text) => {
    if (settled) return;
    settled = true;
    if (timer) clearTimeout(timer);
    callback(err, text);
  };

  const tryProxy = () => {
    if (proxyIndex >= JACRED_PROXY_LIST.length) {
      finish(new Error("all proxies failed"));
      return;
    }
    const proxyUrl = JACRED_PROXY_LIST[proxyIndex++] + encodeURIComponent(url);
    timer = setTimeout(() => { if (!settled) tryProxy(); }, JACRED_PROXY_TIMEOUT);

    fetch(proxyUrl)
      .then((r) => { if (!r.ok) throw new Error("proxy " + r.status); return r.text(); })
      .then((t) => finish(null, t))
      .catch(() => { if (!settled) tryProxy(); });
  };

  // сначала прямой запрос
  timer = setTimeout(() => { if (!settled) tryProxy(); }, JACRED_PROXY_TIMEOUT);
  fetch(url)
    .then((r) => { if (!r.ok) throw new Error("direct " + r.status); return r.text(); })
    .then((t) => finish(null, t))
    .catch(() => { if (!settled) tryProxy(); });
}

/* ---------- парсинг и выбор лучшего ---------- */
function jacredPickBest(torrents) {
  if (!Array.isArray(torrents) || !torrents.length) return null;

  const CAM_RE = /\b(ts|telesync|camrip|cam|TC|звук с TS)\b/i;
  let best = null;
  let bestQ = -1;
  let camrip = null;
  let camripQ = -1;

  for (const t of torrents) {
    const title = (t.title || "").toLowerCase();
    const q = t.quality;
    if (typeof q !== "number" || q === 0) continue;

    if (CAM_RE.test(title)) {
      if (q >= 720 && q > camripQ) { camrip = t; camripQ = q; }
    } else {
      if (q > bestQ) { best = t; bestQ = q; }
    }
  }

  if (best) return { torrent: best, numeric: bestQ, isCamrip: false };
  if (camrip) return { torrent: camrip, numeric: camripQ, isCamrip: true };
  return null;
}

function jacredTranslate(numeric, isCamrip) {
  if (isCamrip) return "camrip";
  if (numeric >= 2160) return "4k";
  if (numeric >= 1080) return "hd";   // FHD = hd (как в Obsidian)
  if (numeric >= 720)  return "hd";   // HD  = hd
  if (numeric > 0)     return "sd";
  return null;
}

/* ---------- основная функция ---------- */
/**
 * fetchQualityFromJacRed(item, callback)
 * item: { id, title, original_title, name, original_name,
 *         release_date, first_air_date, media_type }
 * callback({ quality, uhd, camrip } | null)
 *
 * ВАЖНО: вызывать только для видимых карточек (onVisible),
 * иначе JacRed получит лавину запросов.
 */
function fetchQualityFromJacRed(item, callback) {
  const type = item.media_type || (item.first_air_date || item.name ? "tv" : "movie");
  const cacheKey = type + "_" + item.id;
  const cached = jacredCacheGet(cacheKey);
  if (cached) {
    callback(cached.quality ? cached : null);
    return;
  }

  const year = (item.release_date || item.first_air_date || "").slice(0, 4);
  if (!year || isNaN(year)) { callback(null); return; }

  const strategies = [];
  if (item.original_title && /[a-zа-яё0-9]/i.test(item.original_title)) {
    strategies.push({ title: item.original_title.trim(), exact: true });
  }
  if (item.title && /[a-zа-яё0-9]/i.test(item.title)) {
    strategies.push({ title: item.title.trim(), exact: true });
  }
  if (item.original_name && /[a-zа-яё0-9]/i.test(item.original_name)) {
    strategies.push({ title: item.original_name.trim(), exact: true });
  }
  if (item.name && /[a-zа-яё0-9]/i.test(item.name)) {
    strategies.push({ title: item.name.trim(), exact: true });
  }

  if (!strategies.length) { callback(null); return; }

  let idx = 0;
  const tryNext = () => {
    if (idx >= strategies.length) {
      jacredCacheSet(cacheKey, { quality: null }); // негативный кэш
      callback(null);
      return;
    }
    const s = strategies[idx++];
    let url = JACRED_PROTOCOL + JACRED_URL() + "/api/v1.0/torrents?search=" +
      encodeURIComponent(s.title) + "&year=" + year +
      (s.exact ? "&exact=true" : "");

    jacredFetch(url, (err, text) => {
      if (err || !text) { tryNext(); return; }
      let torrents;
      try { torrents = JSON.parse(text); } catch (_) { tryNext(); return; }

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
      callback(result);
    });
  };

  tryNext();
}
