!function() {
    "use strict";
    
    if (window.__skipIntroLoaded) return;
    window.__skipIntroLoaded = !0;
    
    // ============================================================
    // 1. НАЛАШТУВАННЯ ТА КОНСТАНТИ
    // ============================================================
    const PLUGIN = {
        VERSION: '3.0.0',
        BUILD: '2026-04-13',
        API_TIMEOUT: 5000,
        MAX_DURATION: 360,
        SEGMENT_TYPES: {
            intro: { label: 'Пропустити заставку', icon: '🎬' },
            recap: { label: 'Пропустити рекап', icon: '🔄' },
            credits: { label: 'Пропустити титри', icon: '📜' },
            preview: { label: 'Пропустити прев\'ю', icon: '👀' }
        },
        STORAGE_KEYS: {
            settings: 'skip_intro_settings',
            db: 'skip_intro_db',
            smart: 'skip_intro_smart',
            detected: 'skip_intro_detected'
        },
        DEFAULT_SETTINGS: {
            enabled: true,
            autoSkip: false,
            smartDetect: true,
            showButton: true,
            introEnabled: true,
            recapEnabled: true,
            creditsEnabled: true,
            previewEnabled: false,
            skipKey: 'enter',
            cancelKey: 'back',
            rememberSkip: true,
            nextEpisode: true,
            nextDelay: 5
        }
    };
    
    // ============================================================
    // 2. МЕНЕДЖЕР НАЛАШТУВАНЬ
    // ============================================================
    const Settings = {
        _key: PLUGIN.STORAGE_KEYS.settings,
        
        get(key) {
            try {
                const all = this._getAll();
                return key ? all[key] : all;
            } catch { return null; }
        },
        
        set(key, value) {
            try {
                const all = this._getAll();
                all[key] = value;
                localStorage.setItem(this._key, JSON.stringify(all));
            } catch (e) {
                console.error('[SkipIntro] Settings save error:', e);
            }
        },
        
        _getAll() {
            try {
                const raw = localStorage.getItem(this._key);
                if (!raw) return { ...PLUGIN.DEFAULT_SETTINGS };
                const parsed = JSON.parse(raw);
                // Заповнюємо відсутні налаштування
                for (const [key, val] of Object.entries(PLUGIN.DEFAULT_SETTINGS)) {
                    if (!(key in parsed)) parsed[key] = val;
                }
                return parsed;
            } catch {
                return { ...PLUGIN.DEFAULT_SETTINGS };
            }
        },
        
        isEnabled() { return this.get('enabled') !== false; },
        isAutoSkip() { return this.get('autoSkip') === true; },
        isSmartDetect() { return this.get('smartDetect') !== false; },
        isTypeEnabled(type) { return this.get(type + 'Enabled') !== false; },
        
        getSkipKeys() {
            const key = this.get('skipKey') || 'enter';
            return this._keyMap[key] || this._keyMap.enter;
        },
        
        getCancelKeys() {
            const key = this.get('cancelKey') || 'back';
            return this._keyMap[key] || this._keyMap.back;
        },
        
        _keyMap: {
            enter: [13, 29443, 65385],
            space: [32],
            back: [8, 27, 10009, 461, 4],
            red: [403],
            green: [404],
            yellow: [405],
            blue: [406]
        }
    };
    
    // ============================================================
    // 3. МЕНЕДЖЕР БАЗИ ДАНИХ
    // ============================================================
    const Database = {
        _key: PLUGIN.STORAGE_KEYS.db,
        _ttl: 604800000, // 7 днів
        
        get(cardId, season, episode, type) {
            try {
                const key = this._makeKey(cardId, season, episode);
                const data = this._getAll();
                const entry = data[key];
                if (!entry) return null;
                if (Date.now() - entry._ts > this._ttl) {
                    delete data[key];
                    this._saveAll(data);
                    return null;
                }
                if (type) {
                    return entry[type] || null;
                }
                return entry;
            } catch { return null; }
        },
        
        set(cardId, season, episode, data) {
            try {
                const key = this._makeKey(cardId, season, episode);
                const all = this._getAll();
                all[key] = {
                    ...data,
                    _ts: Date.now()
                };
                this._saveAll(all);
                console.log(`[SkipIntro] Saved data for ${key}`);
            } catch (e) {
                console.error('[SkipIntro] DB save error:', e);
            }
        },
        
        rememberSkip(cardId, type) {
            if (!Settings.get('rememberSkip')) return;
            const key = this._makeKey(cardId);
            const all = this._getAll();
            if (!all[key]) all[key] = {};
            if (!all[key].skipped) all[key].skipped = {};
            all[key].skipped[type] = true;
            all[key]._ts = Date.now();
            this._saveAll(all);
            console.log(`[SkipIntro] Remembered skip for ${cardId}: ${type}`);
        },
        
        forgetSkip(cardId, type) {
            const key = this._makeKey(cardId);
            const all = this._getAll();
            if (all[key]?.skipped) {
                delete all[key].skipped[type];
                this._saveAll(all);
                console.log(`[SkipIntro] Forgotten skip for ${cardId}: ${type}`);
            }
        },
        
        hasSkipped(cardId, type) {
            const key = this._makeKey(cardId);
            const all = this._getAll();
            return !!(all[key]?.skipped?.[type]);
        },
        
        _makeKey(cardId, season, episode) {
            if (season != null && episode != null) {
                return `${cardId}_s${season}_e${episode}`;
            }
            return cardId;
        },
        
        _getAll() {
            try {
                return JSON.parse(localStorage.getItem(this._key) || '{}');
            } catch { return {}; }
        },
        
        _saveAll(data) {
            try {
                localStorage.setItem(this._key, JSON.stringify(data));
            } catch (e) {
                console.error('[SkipIntro] DB save error:', e);
            }
        }
    };
    
    // ============================================================
    // 4. МЕНЕДЖЕР КЕШУ ДЕТЕКЦІЇ
    // ============================================================
    const DetectCache = {
        _key: PLUGIN.STORAGE_KEYS.detected,
        _ttl: 2592000000, // 30 днів
        
        get(cardId, season, episode) {
            try {
                const key = `${cardId}_s${season}_e${episode}`;
                const all = this._getAll();
                const entry = all[key];
                if (!entry) return null;
                if (Date.now() - entry._ts > this._ttl) {
                    delete all[key];
                    this._saveAll(all);
                    return null;
                }
                return entry.segments || null;
            } catch { return null; }
        },
        
        set(cardId, season, episode, segments) {
            try {
                const key = `${cardId}_s${season}_e${episode}`;
                const all = this._getAll();
                all[key] = { segments, _ts: Date.now() };
                this._saveAll(all);
            } catch (e) {
                console.error('[SkipIntro] Cache save error:', e);
            }
        },
        
        _getAll() {
            try {
                return JSON.parse(localStorage.getItem(this._key) || '{}');
            } catch { return {}; }
        },
        
        _saveAll(data) {
            try {
                localStorage.setItem(this._key, JSON.stringify(data));
            } catch (e) {
                console.error('[SkipIntro] Cache save error:', e);
            }
        }
    };
    
    // ============================================================
    // 5. ДЕТЕКТОР ЗА СУБТИТРАМИ
    // ============================================================
    const SubtitleDetector = {
        detect(video) {
            const duration = video.duration || 0;
            return new Promise((resolve) => {
                try {
                    // Спроба через текстові доріжки
                    const tracks = video.textTracks;
                    if (tracks && tracks.length) {
                        for (let i = 0; i < tracks.length; i++) {
                            if (tracks[i].cues && tracks[i].cues.length > 5) {
                                const segments = this._analyzeCues(tracks[i].cues, duration);
                                if (segments.length) {
                                    resolve(segments);
                                    return;
                                }
                            }
                        }
                    }
                    
                    // Спроба через вбудовані субтитри
                    if (window.Lampa?.Player?.playdata) {
                        const data = Lampa.Player.playdata();
                        if (data?.customSubs?.length) {
                            const sub = data.customSubs.find(s => s.url);
                            if (sub) {
                                this._fetchSubtitle(sub.url)
                                    .then(text => {
                                        const segments = this._analyzeSrt(text, duration);
                                        resolve(segments);
                                    })
                                    .catch(() => resolve([]));
                                return;
                            }
                        }
                    }
                    
                    resolve([]);
                } catch (e) {
                    console.log('[SkipIntro] Subtitle detection error:', e);
                    resolve([]);
                }
            });
        },
        
        _fetchSubtitle(url) {
            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('GET', url, true);
                xhr.responseType = 'text';
                xhr.timeout = 8000;
                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        resolve(xhr.responseText);
                    } else {
                        reject(new Error('HTTP ' + xhr.status));
                    }
                };
                xhr.onerror = () => reject(new Error('Network error'));
                xhr.ontimeout = () => reject(new Error('Timeout'));
                xhr.send();
            });
        },
        
        _analyzeCues(cues, duration) {
            const times = [];
            for (let i = 0; i < cues.length; i++) {
                const cue = cues[i];
                if (cue.startTime >= 0 && cue.endTime > cue.startTime) {
                    times.push({ start: cue.startTime, end: cue.endTime });
                }
            }
            return this._findSegments(times, duration);
        },
        
        _analyzeSrt(text, duration) {
            const times = [];
            const regex = /(\d{1,2}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[.,]\d{3})/g;
            let match;
            while ((match = regex.exec(text)) !== null) {
                const start = this._parseTime(match[1]);
                const end = this._parseTime(match[2]);
                if (end > start) {
                    times.push({ start, end });
                }
            }
            return times.length < 5 ? [] : this._findSegments(times, duration);
        },
        
        _parseTime(str) {
            const parts = str.match(/(\d+):(\d{2}):(\d{2})[.,](\d{3})/);
            if (!parts) return 0;
            return parseInt(parts[1]) * 3600 + 
                   parseInt(parts[2]) * 60 + 
                   parseInt(parts[3]) + 
                   parseInt(parts[4]) / 1000;
        },
        
        _findSegments(times, duration) {
            if (times.length < 5) return [];
            
            times.sort((a, b) => a.start - b.start);
            const segments = [];
            const MAX_DURATION = PLUGIN.MAX_DURATION;
            
            // Пошук інтро на початку
            if (times[0].start >= 15 && times[0].start <= 150) {
                segments.push({
                    type: 'intro',
                    start: 0,
                    end: Math.round(times[0].start),
                    _source: 'subs'
                });
            }
            
            // Пошук пауз між субтитрами
            let maxGap = 0;
            let bestGap = null;
            for (let i = 0; i < times.length - 1; i++) {
                const gap = times[i + 1].start - times[i].end;
                if (gap >= 15 && gap <= 150 && times[i].end < MAX_DURATION) {
                    if (gap > maxGap) {
                        maxGap = gap;
                        bestGap = {
                            start: Math.round(times[i].end),
                            end: Math.round(times[i + 1].start)
                        };
                    }
                }
            }
            
            if (bestGap) {
                segments.push({
                    type: 'intro',
                    ...bestGap,
                    _source: 'subs'
                });
            }
            
            // Пошук титрів в кінці
            if (duration > 600 && times.length > 0) {
                const last = times[times.length - 1];
                const gapToEnd = duration - last.end;
                if (gapToEnd >= 30) {
                    segments.push({
                        type: 'credits',
                        start: Math.round(last.end),
                        end: Math.round(duration),
                        _source: 'subs'
                    });
                }
            }
            
            return segments;
        }
    };
    
    // ============================================================
    // 6. ДЕТЕКТОР ЗА ЗВУКОМ
    // ============================================================
    const AudioDetector = {
        _context: null,
        _analyser: null,
        _source: null,
        _connected: false,
        _sampleTimer: null,
        _timeoutTimer: null,
        
        detect(video) {
            this._stopSampling();
            
            return new Promise((resolve) => {
                let resolved = false;
                const done = (result) => {
                    if (!resolved) {
                        resolved = true;
                        resolve(result);
                    }
                };
                
                try {
                    if (!window.AudioContext && !window.webkitAudioContext) {
                        return done(null);
                    }
                    
                    if (!this._context || this._context.state === 'closed') {
                        try {
                            this._context = new (window.AudioContext || window.webkitAudioContext)();
                        } catch (e) {
                            return done(null);
                        }
                    }
                    
                    if (!this._connected) {
                        try {
                            this._source = this._context.createMediaElementSource(video);
                            this._analyser = this._context.createAnalyser();
                            this._analyser.fftSize = 2048;
                            this._source.connect(this._analyser);
                            this._analyser.connect(this._context.destination);
                            this._connected = true;
                        } catch (e) {
                            return done(null);
                        }
                    }
                    
                    if (!this._analyser) return done(null);
                    
                    const samples = [];
                    const data = new Uint8Array(this._analyser.frequencyBinCount);
                    let startTime = video.currentTime;
                    
                    this._sampleTimer = setInterval(() => {
                        try {
                            const currentTime = video.currentTime;
                            if (currentTime - startTime > PLUGIN.MAX_DURATION || currentTime > 420) {
                                this._stopSampling();
                                done(this._analyzeSamples(samples));
                                return;
                            }
                            
                            this._analyser.getByteFrequencyData(data);
                            let sum = 0;
                            for (let i = 0; i < data.length; i++) {
                                sum += data[i];
                            }
                            samples.push({
                                time: currentTime,
                                energy: sum / data.length
                            });
                        } catch (e) {
                            this._stopSampling();
                            done(null);
                        }
                    }, 500);
                    
                    this._timeoutTimer = setTimeout(() => {
                        this._stopSampling();
                        done(this._analyzeSamples(samples));
                    }, 370000);
                    
                } catch (e) {
                    console.log('[SkipIntro] Audio detection error:', e);
                    done(null);
                }
            });
        },
        
        _analyzeSamples(samples) {
            if (samples.length < 20) return null;
            
            const smoothed = [];
            for (let i = 2; i < samples.length - 2; i++) {
                const avg = (samples[i-2].energy + samples[i-1].energy + samples[i].energy + samples[i+1].energy + samples[i+2].energy) / 5;
                smoothed.push({ time: samples[i].time, energy: avg });
            }
            
            if (smoothed.length < 10) return null;
            
            const energies = smoothed.map(s => s.energy).sort((a, b) => a - b);
            const median = energies[Math.floor(energies.length / 2)];
            const thresholdHigh = median * 1.3;
            const thresholdLow = median * 0.8;
            
            let inSegment = false;
            let segmentStart = null;
            let segmentCount = 0;
            
            for (let i = 0; i < smoothed.length; i++) {
                const s = smoothed[i];
                if (s.time > PLUGIN.MAX_DURATION) break;
                
                if (s.energy > thresholdHigh) {
                    if (!inSegment) {
                        inSegment = true;
                        segmentStart = s.time;
                        segmentCount = 1;
                    } else {
                        segmentCount++;
                    }
                } else if (inSegment && s.energy < thresholdLow) {
                    const duration = s.time - segmentStart;
                    if (duration >= 15 && duration <= 150 && segmentCount >= 10) {
                        const result = {
                            type: 'intro',
                            start: Math.round(segmentStart),
                            end: Math.round(s.time),
                            _source: 'audio'
                        };
                        console.log(`[SkipIntro] Audio detected intro: ${result.start}→${result.end}`);
                        return result;
                    }
                    inSegment = false;
                    segmentStart = null;
                    segmentCount = 0;
                }
            }
            
            return null;
        },
        
        _stopSampling() {
            if (this._sampleTimer) {
                clearInterval(this._sampleTimer);
                this._sampleTimer = null;
            }
            if (this._timeoutTimer) {
                clearTimeout(this._timeoutTimer);
                this._timeoutTimer = null;
            }
        },
        
        destroy() {
            this._stopSampling();
            try {
                if (this._source) {
                    this._source.disconnect();
                    this._source = null;
                }
                if (this._analyser) {
                    this._analyser.disconnect();
                    this._analyser = null;
                }
                if (this._context) {
                    this._context.close();
                    this._context = null;
                }
                this._connected = false;
            } catch (e) {}
        }
    };
    
    // ============================================================
    // 7. API КЛІЄНТ
    // ============================================================
    const ApiClient = {
        _baseUrl: 'https://api.introdb.app',
        
        fetchSegments(tmdbId, imdbId, season, episode) {
            const params = imdbId ? `imdb=${imdbId}` : `tmdb=${tmdbId}`;
            const url1 = `${this._baseUrl}/get_intros?${params}&season=${season}&episode=${episode}`;
            const url2 = `${this._baseUrl}/get_credits?${params}&season=${season}&episode=${episode}`;
            
            return Promise.all([
                this._fetch(url1).catch(() => null),
                this._fetch(url2).catch(() => null)
            ]).then(([intro, credits]) => {
                const segments = [];
                if (intro?.start != null && intro?.end != null && intro.end > intro.start) {
                    segments.push({
                        type: 'intro',
                        start: intro.start,
                        end: intro.end,
                        _source: 'api'
                    });
                }
                if (credits?.start != null && credits?.end != null && credits.end > credits.start) {
                    segments.push({
                        type: 'credits',
                        start: credits.start,
                        end: credits.end,
                        _source: 'api'
                    });
                }
                return segments;
            });
        },
        
        _fetch(url) {
            return new Promise((resolve, reject) => {
                let timeout = setTimeout(() => {
                    xhr.abort();
                    reject(new Error('Timeout'));
                }, PLUGIN.API_TIMEOUT);
                
                const xhr = new XMLHttpRequest();
                xhr.open('GET', url, true);
                xhr.setRequestHeader('Accept', 'application/json');
                
                xhr.onreadystatechange = () => {
                    if (xhr.readyState === 4) {
                        clearTimeout(timeout);
                        if (xhr.status >= 200 && xhr.status < 300) {
                            try {
                                resolve(JSON.parse(xhr.responseText));
                            } catch (e) {
                                reject(e);
                            }
                        } else if (xhr.status === 204 || xhr.status === 404) {
                            resolve(null);
                        } else {
                            reject(new Error('HTTP ' + xhr.status));
                        }
                    }
                };
                
                xhr.onerror = () => {
                    clearTimeout(timeout);
                    reject(new Error('Network error'));
                };
                
                xhr.send();
            });
        }
    };
    
    // ============================================================
    // 8. МЕНЕДЖЕР КНОПКИ
    // ============================================================
    const ButtonManager = {
        _button: null,
        _visible: false,
        _fadeTimer: null,
        _countdownTimer: null,
        _progressBar: null,
        _onSkip: null,
        _onCancel: null,
        
        show(segment, onSkip, onCancel) {
            if (!Settings.isEnabled()) return;
            if (!Settings.get('showButton')) return;
            
            this._clearTimers();
            this._injectStyles();
            
            const type = segment.type || 'intro';
            const info = PLUGIN.SEGMENT_TYPES[type] || PLUGIN.SEGMENT_TYPES.intro;
            const label = info.label;
            const icon = info.icon;
            const isAuto = Settings.isAutoSkip();
            
            if (this._button) {
                this._updateButton(label, icon, isAuto, segment);
                if (!this._visible) this._setVisible(true);
                return;
            }
            
            this._createButton(label, icon, isAuto, segment, onSkip, onCancel);
            this._setVisible(true);
        },
        
        hide() {
            this._clearTimers();
            if (this._button) {
                this._setVisible(false);
                const btn = this._button;
                this._fadeTimer = setTimeout(() => {
                    this._removeListeners(btn);
                    if (btn.parentNode) btn.parentNode.removeChild(btn);
                    if (this._button === btn) {
                        this._button = null;
                        this._progressBar = null;
                        this._onSkip = null;
                        this._onCancel = null;
                    }
                }, 350);
            }
        },
        
        destroy() {
            this._clearTimers();
            clearTimeout(this._fadeTimer);
            if (this._button) {
                this._removeListeners(this._button);
                if (this._button.parentNode) this._button.parentNode.removeChild(this._button);
                this._button = null;
                this._progressBar = null;
                this._visible = false;
                this._onSkip = null;
                this._onCancel = null;
            }
        },
        
        isVisible() { return this._visible; },
        
        _createButton(label, icon, isAuto, segment, onSkip, onCancel) {
            const btn = document.createElement('div');
            btn.className = 'skip-intro-button' + (isAuto ? ' countdown' : '');
            btn.setAttribute('tabindex', '1');
            
            // Контент
            const content = document.createElement('div');
            content.className = 'skip-intro-content';
            
            const labelEl = document.createElement('span');
            labelEl.className = 'skip-intro-label';
            labelEl.textContent = `${icon} ${label}`;
            content.appendChild(labelEl);
            
            // Бейдж з часом
            const badge = document.createElement('span');
            badge.className = 'skip-intro-badge';
            const duration = Math.round(segment.end - segment.start);
            badge.textContent = `${duration}с`;
            content.appendChild(badge);
            
            // Підказка
            const hint = document.createElement('span');
            hint.className = 'skip-intro-hint';
            hint.textContent = this._getHint(isAuto);
            content.appendChild(hint);
            
            btn.appendChild(content);
            btn._hintEl = hint;
            
            // Прогрес-бар
            const progress = document.createElement('div');
            progress.className = 'skip-intro-progress';
            progress.style.width = '0%';
            btn.appendChild(progress);
            this._progressBar = progress;
            
            // Зберігаємо дані
            btn._onSkip = onSkip;
            btn._onCancel = onCancel || null;
            btn._withCancel = isAuto;
            btn._segment = segment;
            
            // Події
            content.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (btn._onSkip) btn._onSkip();
            });
            
            // Клавіатурні події
            btn._lampaKeyHandler = (e) => {
                if (!this._visible) return;
                const code = e.code;
                if (this._isSkipKey(code)) {
                    e.event?.preventDefault?.();
                    e.event?.stopPropagation?.();
                    if (btn._onSkip) btn._onSkip();
                } else if (btn._withCancel && this._isCancelKey(code)) {
                    e.event?.preventDefault?.();
                    e.event?.stopPropagation?.();
                    if (btn._onCancel) btn._onCancel();
                }
            };
            
            btn._domKeyHandler = (e) => {
                if (!this._visible) return;
                const code = e.keyCode;
                if (this._isSkipKey(code)) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (btn._onSkip) btn._onSkip();
                } else if (btn._withCancel && this._isCancelKey(code)) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (btn._onCancel) btn._onCancel();
                }
            };
            
            if (window.Lampa?.Keypad?.listener) {
                Lampa.Keypad.listener.follow('keydown', btn._lampaKeyHandler);
            }
            document.addEventListener('keydown', btn._domKeyHandler, true);
            
            // Додаємо на сторінку
            const container = document.querySelector('.player') || document.body;
            container.appendChild(btn);
            this._button = btn;
            this._onSkip = onSkip;
            this._onCancel = onCancel;
            
            // Авто-пропуск
            if (isAuto) {
                this._startCountdown(onSkip);
            }
        },
        
        _updateButton(label, icon, isAuto, segment) {
            if (!this._button) return;
            const labelEl = this._button.querySelector('.skip-intro-label');
            if (labelEl) labelEl.textContent = `${icon} ${label}`;
            
            const badge = this._button.querySelector('.skip-intro-badge');
            if (badge) {
                const duration = Math.round(segment.end - segment.start);
                badge.textContent = `${duration}с`;
            }
            
            const hint = this._button.querySelector('.skip-intro-hint');
            if (hint) hint.textContent = this._getHint(isAuto);
            
            if (isAuto) {
                this._button.classList.add('countdown');
                this._button._withCancel = true;
                this._startCountdown(this._onSkip);
            } else {
                this._button.classList.remove('countdown');
                this._button._withCancel = false;
                this._clearTimers();
            }
        },
        
        _getHint(isAuto) {
            if (isAuto) {
                const key = Settings.get('cancelKey') || 'back';
                const names = { back: 'Назад', red: 'Червона', green: 'Зелена', yellow: 'Жовта', blue: 'Синя' };
                return `(${names[key] || 'Назад'} - відміна)`;
            } else {
                const keys = Settings.getSkipKeys();
                const names = { 13: 'OK', 29443: 'OK', 65385: 'OK' };
                let name = 'OK';
                for (const k of keys) {
                    if (names[k]) { name = names[k]; break; }
                }
                return `(${name} - пропуск)`;
            }
        },
        
        _isSkipKey(code) {
            const keys = Settings.getSkipKeys();
            return keys.some(k => k === code);
        },
        
        _isCancelKey(code) {
            const keys = Settings.getCancelKeys();
            return keys.some(k => k === code);
        },
        
        _startCountdown(callback) {
            this._clearTimers();
            const startTime = Date.now();
            const duration = 4000;
            
            this._countdownTimer = setInterval(() => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(1, elapsed / duration);
                if (this._progressBar) {
                    this._progressBar.style.width = (progress * 100) + '%';
                }
                if (elapsed >= duration) {
                    this._clearTimers();
                    if (callback) callback();
                }
            }, 50);
        },
        
        _clearTimers() {
            if (this._countdownTimer) {
                clearInterval(this._countdownTimer);
                this._countdownTimer = null;
            }
        },
        
        _removeListeners(btn) {
            if (!btn) return;
            if (window.Lampa?.Keypad?.listener) {
                if (btn._lampaKeyHandler) {
                    Lampa.Keypad.listener.remove('keydown', btn._lampaKeyHandler);
                }
            }
            if (btn._domKeyHandler) {
                document.removeEventListener('keydown', btn._domKeyHandler, true);
            }
        },
        
        _setVisible(visible) {
            this._visible = visible;
            if (this._button) {
                this._button.classList.toggle('visible', visible);
                if (visible) {
                    this._button.focus();
                }
            }
        },
        
        _injectStyles() {
            if (document.getElementById('skip-intro-styles')) return;
            
            const css = `
                .skip-intro-button {
                    position: absolute;
                    right: 40px;
                    bottom: 180px;
                    padding: 0;
                    background: rgba(0,0,0,0.75);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    border: 1.5px solid rgba(255,255,255,0.2);
                    border-radius: 12px;
                    color: #fff;
                    font-size: 1em;
                    cursor: pointer;
                    z-index: 9999;
                    transition: opacity 0.4s ease, transform 0.4s ease, border-color 0.3s ease;
                    opacity: 0;
                    pointer-events: none;
                    transform: translateX(20px);
                    outline: none;
                    font-family: inherit;
                    line-height: 1.4;
                    white-space: nowrap;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                    box-shadow: 0 4px 24px rgba(0,0,0,0.5);
                    min-width: 200px;
                }
                .skip-intro-button.visible {
                    opacity: 1;
                    pointer-events: auto;
                    transform: translateX(0);
                }
                .skip-intro-button:hover,
                .skip-intro-button:focus {
                    border-color: rgba(255,255,255,0.6);
                    background: rgba(0,0,0,0.85);
                }
                .skip-intro-content {
                    display: flex;
                    align-items: center;
                    padding: 12px 20px;
                    gap: 10px;
                    position: relative;
                    z-index: 2;
                }
                .skip-intro-content:hover {
                    background: rgba(255,255,255,0.08);
                }
                .skip-intro-label {
                    font-weight: 600;
                    font-size: 1.05em;
                }
                .skip-intro-badge {
                    font-size: 0.7em;
                    opacity: 0.6;
                    margin-left: 4px;
                    font-weight: 300;
                }
                .skip-intro-hint {
                    font-size: 0.65em;
                    opacity: 0.4;
                    margin-left: 8px;
                    font-weight: 300;
                    border: 1px solid rgba(255,255,255,0.2);
                    border-radius: 4px;
                    padding: 1px 8px;
                    letter-spacing: 0.5px;
                }
                .skip-intro-progress {
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    height: 3px;
                    background: linear-gradient(90deg, rgba(255,255,255,0.9), rgba(150,200,255,0.7));
                    border-radius: 0 0 10px 10px;
                    transition: width 0.1s linear;
                    z-index: 3;
                }
                .skip-intro-button.countdown .skip-intro-progress {
                    background: linear-gradient(90deg, #4CAF50, #8BC34A);
                }
                @media (max-width: 768px) {
                    .skip-intro-button {
                        right: 20px;
                        bottom: 120px;
                        font-size: 0.85em;
                        min-width: 160px;
                    }
                    .skip-intro-content {
                        padding: 10px 16px;
                    }
                }
            `;
            
            const style = document.createElement('style');
            style.id = 'skip-intro-styles';
            style.textContent = css;
            document.head.appendChild(style);
        }
    };
    
    // ============================================================
    // 9. ОСНОВНИЙ ПЛАГІН
    // ============================================================
    const Plugin = {
        _initialized: false,
        _segments: [],
        _activeSegment: null,
        _lastSkipped: null,
        _currentData: null,
        _currentMeta: null,
        _detecting: false,
        _detectionDone: false,
        
        init() {
            if (this._initialized) return;
            this._initialized = true;
            
            console.log(`[SkipIntro] Plugin v${PLUGIN.VERSION} initialized`);
            
            // Додаємо меню налаштувань
            this._addSettingsMenu();
            
            // Слухаємо плеєр
            if (window.Lampa?.Player?.listener) {
                Lampa.Player.listener.follow('start', (data) => {
                    this._onPlayerStart(data);
                });
                Lampa.Player.listener.follow('destroy', () => {
                    this._onDestroy();
                });
            }
            
            if (window.Lampa?.PlayerVideo?.listener) {
                Lampa.PlayerVideo.listener.follow('timeupdate', (data) => {
                    this._onTimeUpdate(data);
                });
            }
            
            // Якщо плеєр вже активний
            setTimeout(() => {
                try {
                    const data = Lampa.Player.playdata?.();
                    if (data) this._onPlayerStart(data);
                } catch (e) {}
            }, 1000);
        },
        
        _onPlayerStart(data) {
            if (!Settings.isEnabled()) return;
            
            this._segments = [];
            this._activeSegment = null;
            this._lastSkipped = null;
            this._currentData = data;
            this._currentMeta = null;
            this._detecting = false;
            this._detectionDone = false;
            
            const meta = this._extractMeta(data);
            if (!meta.tmdb_id || !meta.is_series || meta.season == null || meta.episode == null) {
                console.log('[SkipIntro] Not a series, skipping');
                return;
            }
            
            this._currentMeta = meta;
            console.log(`[SkipIntro] Loading segments for ${meta.tmdb_id} S${meta.season}E${meta.episode}`);
            
            let apiDone = false;
            let detectDone = false;
            const apiSegments = [];
            const detectSegments = [];
            
            const merge = () => {
                if (!apiDone || !detectDone) return;
                if (this._currentData !== data) return;
                
                const merged = [...apiSegments];
                for (const seg of detectSegments) {
                    const existing = merged.find(s => s.type === seg.type);
                    if (existing) {
                        if (seg.start < existing.start) {
                            console.log(`[SkipIntro] Detection found earlier ${seg.type}: ${seg.start}→${seg.end}`);
                            merged[merged.indexOf(existing)] = seg;
                        }
                    } else {
                        merged.push(seg);
                    }
                }
                
                this._segments = merged;
                this._detectionDone = true;
                console.log(`[SkipIntro] Final segments: ${merged.length}`, merged);
            };
            
            // Завантаження з API
            ApiClient.fetchSegments(meta.tmdb_id, meta.imdb_id, meta.season, meta.episode)
                .then(segments => {
                    if (this._currentData !== data) return;
                    if (segments.length) {
                        apiSegments.push(...segments);
                        this._segments = segments;
                        this._detectionDone = true;
                    }
                    apiDone = true;
                    merge();
                })
                .catch(() => { apiDone = true; merge(); });
            
            // Детекція
            if (Settings.isSmartDetect()) {
                const cached = DetectCache.get(meta.tmdb_id, meta.season, meta.episode);
                if (cached && cached.length) {
                    detectSegments.push(...cached);
                    detectDone = true;
                    merge();
                } else {
                    this._runDetection(data, meta, (segments) => {
                        if (this._currentData !== data) return;
                        if (segments && segments.length) {
                            detectSegments.push(...segments);
                            DetectCache.set(meta.tmdb_id, meta.season, meta.episode, segments);
                        }
                        detectDone = true;
                        merge();
                    });
                }
            } else {
                detectDone = true;
                merge();
            }
        },
        
        _extractMeta(data) {
            const result = {
                tmdb_id: null,
                imdb_id: null,
                season: null,
                episode: null,
                is_series: false
            };
            
            try {
                // З картки
                let card = data.card || null;
                if (!card) {
                    const act = Lampa.Activity?.active?.();
                    if (act?.card) card = act.card;
                }
                
                if (card) {
                    result.tmdb_id = card.id || null;
                    result.imdb_id = card.imdb_id || null;
                    if (card.name || card.number_of_seasons || card.first_air_date) {
                        result.is_series = true;
                    }
                }
                
                // З даних плеєра
                if (data.season != null) result.season = parseInt(data.season);
                if (data.episode != null) result.episode = parseInt(data.episode);
                
                // З плейлиста
                if (data.playlist && Array.isArray(data.playlist)) {
                    for (const item of data.playlist) {
                        if (item.season != null && result.season == null) result.season = parseInt(item.season);
                        if (item.episode != null && result.episode == null) result.episode = parseInt(item.episode);
                        if (item.s != null && result.season == null) result.season = parseInt(item.s);
                        if (item.e != null && result.episode == null) result.episode = parseInt(item.e);
                    }
                }
                
                // З назви
                if (data.title) {
                    const match = data.title.match(/[Ss](\d+)[Ee](\d+)/);
                    if (match) {
                        if (result.season == null) result.season = parseInt(match[1]);
                        if (result.episode == null) result.episode = parseInt(match[2]);
                    }
                }
                
                if (result.tmdb_id && result.season != null && result.episode != null) {
                    result.is_series = true;
                }
            } catch (e) {
                console.error('[SkipIntro] Extract meta error:', e);
            }
            
            return result;
        },
        
        _runDetection(data, meta, callback) {
            if (this._detecting) return;
            this._detecting = true;
            
            let attempts = 0;
            const maxAttempts = 20;
            
            const checkVideo = () => {
                let video = null;
                try {
                    video = Lampa.PlayerVideo?.video?.();
                } catch (e) {}
                
                if (!video || !video.duration) {
                    attempts++;
                    if (attempts < maxAttempts && this._currentData === data) {
                        setTimeout(checkVideo, 500);
                    } else {
                        this._detecting = false;
                        callback([]);
                    }
                    return;
                }
                
                // Субтитри
                SubtitleDetector.detect(video).then(subSegments => {
                    if (this._currentData !== data) { this._detecting = false; return; }
                    if (subSegments && subSegments.length) {
                        this._detecting = false;
                        callback(subSegments);
                        return;
                    }
                    
                    // Аудіо
                    AudioDetector.detect(video).then(audioSegment => {
                        this._detecting = false;
                        if (this._currentData !== data) { callback([]); return; }
                        if (audioSegment) {
                            callback([audioSegment]);
                        } else {
                            callback([]);
                        }
                    }).catch(() => {
                        this._detecting = false;
                        callback([]);
                    });
                }).catch(() => {
                    // Аудіо як запасний варіант
                    AudioDetector.detect(video).then(audioSegment => {
                        this._detecting = false;
                        if (this._currentData !== data) { callback([]); return; }
                        if (audioSegment) {
                            callback([audioSegment]);
                        } else {
                            callback([]);
                        }
                    }).catch(() => {
                        this._detecting = false;
                        callback([]);
                    });
                });
            };
            
            checkVideo();
        },
        
        _onTimeUpdate(data) {
            if (!Settings.isEnabled() || !this._segments.length) return;
            
            const current = data.current;
            if (current == null || isNaN(current)) return;
            
            // Шукаємо активний сегмент
            let active = null;
            for (const seg of this._segments) {
                if (current >= seg.start && current < seg.end) {
                    active = seg;
                    break;
                }
            }
            
            if (active) {
                // Перевіряємо чи дозволений тип
                if (!Settings.isTypeEnabled(active.type)) {
                    if (this._activeSegment) this._hideButton();
                    return;
                }
                
                // Чи вже пропущено
                if (this._lastSkipped === active) return;
                
                // Авто-пропуск
                if (Settings.isAutoSkip()) {
                    this._doSkip(active, true);
                    return;
                }
                
                // Новий сегмент
                if (this._activeSegment !== active) {
                    this._activeSegment = active;
                    
                    // Перевіряємо чи було пропущено раніше
                    const cardId = this._currentMeta?.tmdb_id;
                    if (cardId && Database.hasSkipped(cardId, active.type)) {
                        this._doSkip(active, true);
                    } else {
                        this._showButton(active);
                    }
                }
            } else {
                if (this._activeSegment) {
                    this._hideButton();
                }
            }
        },
        
        _showButton(segment) {
            const onSkip = () => {
                const cardId = this._currentMeta?.tmdb_id;
                if (cardId) Database.rememberSkip(cardId, segment.type);
                this._doSkip(segment, false);
            };
            
            const onCancel = () => {
                console.log('[SkipIntro] Skip cancelled by user');
                const cardId = this._currentMeta?.tmdb_id;
                if (cardId) Database.forgetSkip(cardId, segment.type);
                this._lastSkipped = segment;
                ButtonManager.hide();
                this._activeSegment = null;
            };
            
            ButtonManager.show(segment, onSkip, onCancel);
        },
        
        _hideButton() {
            this._activeSegment = null;
            ButtonManager.hide();
        },
        
        _doSkip(segment, auto) {
            this._lastSkipped = segment;
            this._activeSegment = null;
            ButtonManager.destroy();
            
            try {
                const video = Lampa.PlayerVideo?.video?.();
                if (video) {
                    const target = Math.min(segment.end, video.duration || segment.end);
                    video.currentTime = target;
                    console.log(`[SkipIntro] Skipped ${segment.type} to ${target} (${auto ? 'auto' : 'manual'})`);
                    
                    // Відтворюємо, якщо на паузі
                    setTimeout(() => {
                        try {
                            if (video.paused) video.play();
                        } catch (e) {}
                    }, 100);
                }
            } catch (e) {
                console.error('[SkipIntro] Skip error:', e);
            }
        },
        
        _onDestroy() {
            this._segments = [];
            this._activeSegment = null;
            this._lastSkipped = null;
            this._currentData = null;
            this._currentMeta = null;
            this._detecting = false;
            this._detectionDone = false;
            ButtonManager.destroy();
            AudioDetector.destroy();
        },
        
        // ============================================================
        // 10. МЕНЮ НАЛАШТУВАНЬ
        // ============================================================
        _addSettingsMenu() {
            try {
                if (!window.Lampa?.SettingsApi) return;
                
                Lampa.SettingsApi.addComponent({
                    component: 'skip_intro',
                    name: '🎬 Skip Intro',
                    icon: `<svg viewBox="0 0 24 24" width="24" height="24">
                        <path fill="currentColor" d="M4 5v14l8-7zM13 5v14l8-7z"/>
                    </svg>`
                });
                
                const addParam = (name, label, type = 'trigger', extra = {}) => {
                    const value = Settings.get(name);
                    Lampa.SettingsApi.addParam({
                        component: 'skip_intro',
                        param: { name, type, default: value !== null ? value : PLUGIN.DEFAULT_SETTINGS[name], ...extra },
                        field: { name: label },
                        onChange: (v) => {
                            Settings.set(name, v);
                        }
                    });
                };
                
                addParam('enabled', '✅ Включити плагін');
                addParam('autoSkip', '⚡ Автоматичний пропуск');
                addParam('smartDetect', '🧠 Розумне виявлення');
                addParam('showButton', '🔘 Показувати кнопку');
                addParam('introEnabled', '🎬 Пропуск заставки');
                addParam('recapEnabled', '🔄 Пропуск рекапу');
                addParam('creditsEnabled', '📜 Пропуск титрів');
                addParam('previewEnabled', '👀 Пропуск прев\'ю');
                addParam('rememberSkip', '💾 Запам\'ятовувати пропуски');
                
                // Клавіші
                Lampa.SettingsApi.addParam({
                    component: 'skip_intro',
                    param: {
                        name: 'skipKey',
                        type: 'select',
                        values: {
                            enter: 'Enter / OK',
                            space: 'Пробел',
                            red: 'Червона кнопка',
                            green: 'Зелена кнопка',
                            yellow: 'Жовта кнопка',
                            blue: 'Синя кнопка'
                        },
                        default: Settings.get('skipKey') || 'enter'
                    },
                    field: { name: '🎮 Кнопка "Пропустити"' },
                    onChange: (v) => Settings.set('skipKey', v)
                });
                
                Lampa.SettingsApi.addParam({
                    component: 'skip_intro',
                    param: {
                        name: 'cancelKey',
                        type: 'select',
                        values: {
                            back: 'Назад (Back)',
                            red: 'Червона кнопка',
                            green: 'Зелена кнопка',
                            yellow: 'Жовта кнопка',
                            blue: 'Синя кнопка'
                        },
                        default: Settings.get('cancelKey') || 'back'
                    },
                    field: { name: '🎮 Кнопка "Скасувати"' },
                    onChange: (v) => Settings.set('cancelKey', v)
                });
                
                // Очищення
                Lampa.SettingsApi.addParam({
                    component: 'skip_intro',
                    param: { name: 'clearAll', type: 'button' },
                    field: { name: '🗑 Очистити всі дані' },
                    onChange: () => {
                        localStorage.removeItem(PLUGIN.STORAGE_KEYS.db);
                        localStorage.removeItem(PLUGIN.STORAGE_KEYS.detected);
                        localStorage.removeItem(PLUGIN.STORAGE_KEYS.smart);
                        if (window.Lampa?.Noty) {
                            Lampa.Noty.show('✅ Всі дані очищено');
                        }
                    }
                });
                
            } catch (e) {
                console.error('[SkipIntro] Settings menu error:', e);
            }
        }
    };
    
    // ============================================================
    // 11. ЗАПУСК
    // ============================================================
    function startPlugin() {
        if (window.Lampa?.SettingsApi && window.Lampa?.Player && window.Lampa?.Storage) {
            Plugin.init();
        } else {
            setTimeout(startPlugin, 500);
        }
    }
    
    if (window.Lampa?.Listener) {
        Lampa.Listener.follow('app', (e) => {
            if (e.type === 'ready') startPlugin();
        });
        setTimeout(startPlugin, 1000);
    } else {
        startPlugin();
    }
    
    window.SkipIntro = Plugin;
    
}();
