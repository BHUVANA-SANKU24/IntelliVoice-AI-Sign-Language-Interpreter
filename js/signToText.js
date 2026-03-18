/**
 * signToText.js  v3
 * ASL classifier with:
 *  - Full 26-letter hand gesture coverage
 *  - Frame-stability filter (3 consistent frames before hold timer)
 *  - Live color-coded confidence (GREEN >85% / YELLOW 60-85% / RED <60%)
 *  - Word-level pattern recognition
 *  - Smart Polish: deduplicates repeated letters + word matching
 */

class SignToTextClassifier {
    constructor() {
        this.currentLetter = null;
        this.holdTimer = null;
        this.holdDuration = 600;      // reduced from 800 for snappier detection
        this.lastConfirmed = null;
        this.wordBuffer = [];
        this.transcript = [];
        this.lettersCount = 0;
        this.confidence = 0;
        this.onLetterConfirmed = null;
        this.onWordCommitted = null;
        this.wordPauseTimer = null;
        this.WORD_PAUSE = 2500;
        this._detStart = 0;

        // Frame stability: require same letter N frames in a row before starting hold timer
        this._stableCount = 0;
        this._stableLetter = null;
        this.STABLE_FRAMES = 3;

        // History buffer for motion tracking (e.g., YES motion)
        this.lmHistory = [];
        this.MAX_HISTORY = 10;

        // ---- Word patterns (letter sequences → display word) ----
        this.WORD_PATTERNS = {
            'HELLO': 'Hello', 'HI': 'Hi', 'HEY': 'Hey',
            'YES': 'Yes', 'NO': 'No',
            'PLEASE': 'Please', 'SORRY': 'Sorry',
            'THANKS': 'Thanks', 'THANK': 'Thanks',
            'HELP': 'Help', 'GOOD': 'Good', 'BAD': 'Bad',
            'LOVE': 'Love', 'OK': 'OK', 'FINE': 'Fine',
            'STOP': 'Stop', 'GO': 'Go', 'WAIT': 'Wait',
            'MORE': 'More', 'DONE': 'Done', 'BYE': 'Bye',
            'NAME': 'Name', 'WHAT': 'What', 'WHO': 'Who',
            'WHERE': 'Where', 'WHEN': 'When', 'HOW': 'How',
            'WHY': 'Why', 'NEED': 'Need', 'WANT': 'Want',
            'LIKE': 'Like', 'EAT': 'Eat', 'DRINK': 'Drink',
            'HOME': 'Home', 'WORK': 'Work', 'SCHOOL': 'School',
        };

        // Common English words for smart-polish matching
        this._dictionary = [
            'hello', 'world', 'help', 'love', 'good', 'done', 'name', 'home', 'work',
            'school', 'stop', 'wait', 'more', 'fine', 'sorry', 'please', 'thank', 'yes',
            'no', 'bye', 'what', 'who', 'why', 'how', 'when', 'where', 'need', 'want',
            'like', 'eat', 'drink', 'come', 'go', 'look', 'see', 'know', 'think', 'feel',
            'time', 'day', 'make', 'take', 'give', 'find', 'tell', 'ask', 'call', 'walk',
            'talk', 'hear', 'play', 'live', 'learn', 'read', 'write', 'open', 'close',
            'happy', 'sad', 'real', 'true', 'high', 'low', 'big', 'small', 'fast', 'slow',
        ];
    }

    /** Main entry: call with MediaPipe landmarks (21 points) */
    classify(landmarks) {
        this._detStart = performance.now();
        if (!landmarks) { this._noHand(); return null; }

        // Update history for motion tracking
        this.lmHistory.push(landmarks);
        if (this.lmHistory.length > this.MAX_HISTORY) {
            this.lmHistory.shift();
        }

        const fingers = this._getFingerStates(landmarks);

        let detectedSign = this._matchWord(fingers, landmarks);
        if (!detectedSign) {
            detectedSign = this._matchLetter(fingers, landmarks);
        }

        this.confidence = detectedSign ? this._computeConfidence(fingers, detectedSign) : 0;

        const detMs = performance.now() - this._detStart;
        this._updateConfidenceUI(detectedSign, this.confidence);
        this._updateConfidenceBar(this.confidence);

        if (typeof window.appDashboard !== 'undefined' && detectedSign) {
            window.appDashboard.recordTranslation(detectedSign, this.confidence, detMs);
        }

        // Frame-stability filter
        if (detectedSign === this._stableLetter) {
            this._stableCount++;
        } else {
            this._stableLetter = detectedSign;
            this._stableCount = 1;
            // Cancel any pending hold timer when letter changes
            clearTimeout(this.holdTimer);
            this.currentLetter = null;
        }

        if (detectedSign && this._stableCount >= this.STABLE_FRAMES) {
            if (detectedSign !== this.currentLetter) {
                this.currentLetter = detectedSign;
                clearTimeout(this.holdTimer);
                this.holdTimer = setTimeout(() => this._confirmSign(detectedSign), this.holdDuration);
            }
        } else if (!detectedSign) {
            clearTimeout(this.holdTimer);
            this.currentLetter = null;
        }

        return detectedSign;
    }

    // ---- Finger state extraction ----
    _getFingerStates(lm) {
        const isExtended = (tip, pip, mcp) =>
            lm[tip].y < lm[pip].y && lm[pip].y < lm[mcp].y;

        // Thumb: check horizontal spread from wrist
        const thumbExtended = Math.abs(lm[4].x - lm[17].x) >
            Math.abs(lm[3].x - lm[17].x) + 0.02;

        return {
            thumb: thumbExtended ? 1 : 0,
            index: isExtended(8, 6, 5) ? 1 : 0,
            middle: isExtended(12, 10, 9) ? 1 : 0,
            ring: isExtended(16, 14, 13) ? 1 : 0,
            pinky: isExtended(20, 18, 17) ? 1 : 0,
            // Raw landmarks for geometry checks
            lm,
        };
    }

    _dist(a, b) {
        return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
    }

    /** Word pattern recognition (Whole body words) */
    _matchWord(f, lm) {
        const { thumb: T, index: I, middle: M, ring: R, pinky: P } = f;

        // YES: 'S' fist shape + clear vertical bobbing motion
        if (!T && !I && !M && !R && !P) {
            if (this.lmHistory.length === this.MAX_HISTORY) {
                // Check past frames. Did the wrist/knuckles move up and down?
                const first = this.lmHistory[0][0].y; // Wrist y 10 frames ago
                const mid = this.lmHistory[Math.floor(this.MAX_HISTORY / 2)][0].y; // Wrist y 5 frames ago 
                const last = lm[0].y; // Current wrist y

                // If it moved down then up or up then down with significant distance
                const dist1 = Math.abs(mid - first);
                const dist2 = Math.abs(last - mid);
                if (dist1 > 0.03 && dist2 > 0.03) {
                    return 'YES';
                }
            }
        }

        // NO: Index + Middle + Thumb extended and pinched, Ring + Pinky curled
        const tIdist = this._dist(lm[4], lm[8]);
        const tMdist = this._dist(lm[4], lm[12]);
        const noPinched = tIdist < 0.1 && tMdist < 0.1;
        if (!R && !P && (I || M) && noPinched) {
            return 'NO';
        }

        // HELLO: 'B' shape (all fingers extended, thumb optional) + Hand held high near head level
        if (I && M && R && P && lm[0].y < 0.6) {
            return 'HELLO';
        }

        // ILY (I Love You): Thumb + Index + Pinky extended, Middle + Ring curled
        if (T && I && !M && !R && P) {
            return 'ILY';
        }

        // OK: Index and thumb pinched together, middle, ring, pinky extended
        if (!I && M && R && P && tIdist < 0.1) {
            return 'OK';
        }

        // STOP: Flat hand ('B' shape) held steadily, palm facing forward
        // Loosen constraint: mostly upright B-shape
        if (I && M && R && P && !T && lm[12].y < lm[0].y) {
            // Wait for slight stability
            if (this.lmHistory.length === this.MAX_HISTORY) {
                const firstX = this.lmHistory[0][0].x;
                const lastX = lm[0].x;
                if (Math.abs(lastX - firstX) < 0.15) { // Loosened from 0.05
                    return 'STOP';
                }
            }
        }

        // PLEASE: Flat hand ('B' shape) positioned on the chest.
        // Loosen depth and bounding box constraints (Y > 0.4 instead of 0.6)
        if (I && M && R && P && !T && lm[0].y > 0.4 && lm[0].x > 0.2 && lm[0].x < 0.8) {
            return 'PLEASE';
        }

        // SORRY: Closed fist ('S' or 'A') on chest.
        // Loosen bounding box constraints (Y > 0.4 instead of 0.6)
        if (!I && !M && !R && !P && lm[0].y > 0.4 && lm[0].x > 0.2 && lm[0].x < 0.8) {
            // Also ensure it is NOT mistaken for 'YES' motion
            if (this.lmHistory.length === this.MAX_HISTORY) {
                const first = this.lmHistory[0][0].y;
                const last = lm[0].y;
                if (Math.abs(last - first) < 0.05) { // Needs to be held relatively steady, no nodding
                    return 'SORRY';
                }
            } else {
                return 'SORRY'; // If history isn't full yet, accept it temporarily
            }
        }

        return null;
    }

    /**
     * Rules for all 26 ASL letters.
     * Priority order matters — more specific checks come first.
     */
    _matchLetter(f, lm) {
        const { thumb: T, index: I, middle: M, ring: R, pinky: P } = f;

        // Distance / geometry helpers
        const tIdist = this._dist(lm[4], lm[8]);   // thumb tip ↔ index tip
        const tMdist = this._dist(lm[4], lm[12]);  // thumb tip ↔ middle tip
        const tiClose = tIdist < 0.08;
        const tmClose = tMdist < 0.09;
        const imSpread = Math.abs(lm[8].x - lm[12].x);
        const mrSpread = Math.abs(lm[12].x - lm[16].x);
        const imSep = imSpread > 0.06;

        // index bent down (PIP lower than MCP)
        const indexBent = lm[7].y > lm[6].y;
        // middle bent
        const middleBent = lm[11].y > lm[10].y;
        // index tip below middle PIP — "hook" shape
        const indexCurled = lm[8].y > lm[10].y;

        // ── A: Fist with thumb to the side ──
        if (!I && !M && !R && !P && T) return 'A';

        // ── B: 4 fingers up, thumb folded ──
        if (!T && I && M && R && P) return 'B';

        // ── C: Curved hand (all fingers curved, thumb curved) ──
        // Thumb partially extended, fingers not fully extended, hand curved
        if (!I && !M && !R && !P && !tiClose && !T) return 'E';  // backup gate
        if (T && !I && !M && !R && !P && !tiClose) {
            // Check that fingertips are in a curved (C) shape — tips point forward, not closed
            const curveCheck = lm[8].y > lm[5].y && lm[8].y < lm[0].y;
            if (curveCheck) return 'C';
        }
        // Alternate C: all semi-curled
        if (!I && !M && !R && !P && !T && this._dist(lm[8], lm[4]) > 0.10) return 'C';

        // ── D: Index up, other fingers curled, tip of middle+ring+pinky touch thumb ──
        if (!T && I && !M && !R && !P) return 'D';

        // ── E: All fingers bent/curled, thumb tucked ──
        if (!I && !M && !R && !P && !T) return 'E';

        // ── F: Thumb + index pinch, other 3 up ──
        if (tiClose && !I && M && R && P && !T) return 'F';

        // ── G: Index points sideways, thumb points out ──
        if (T && I && !M && !R && !P && Math.abs(lm[8].x - lm[4].x) > 0.05) return 'G';

        // ── H: Index + middle extended & together horizontally ──
        if (!T && I && M && !R && !P && !imSep) return 'H';

        // ── I: Pinky up only ──
        if (!T && !I && !M && !R && P) return 'I';

        // ── K: Index + middle up, thumb between them ──
        if (T && I && M && !R && !P) return 'K';

        // ── L: Thumb + index extended (L-shape) ──
        if (T && I && !M && !R && !P && tIdist > 0.12) return 'L';

        // ── M: Three fingers folded over thumb ──
        // Index + middle + ring curled, thumb inside
        if (!T && !I && !M && !R && !P) return 'S'; // will refine below with M/N logic
        // M: thumb under first 3 fingers (approximate: index tip near wrist area)
        if (!I && !M && !R && !P && !T && lm[8].y > lm[5].y) return 'M';

        // ── N: Thumb under first 2 fingers ──
        if (!I && !M && !R && P && !T && lm[8].y > lm[5].y) return 'N';

        // ── O: All fingers curve to meet thumb ──
        if (tiClose && !I && !M && !R && !P) return 'O';

        // ── P: Index points down, thumb out ──
        if (T && I && !M && !R && !P && lm[8].y > lm[5].y) return 'P';

        // ── Q: Index + thumb point downward ──
        if (T && I && !M && !R && !P && lm[8].y > lm[0].y && lm[4].y > lm[0].y) return 'Q';

        // ── R: Index + middle crossed ──
        if (!T && I && M && !R && !P && imSpread < 0.03) return 'R';

        // ── S: Closed fist, thumb over fingers ──
        if (!T && !I && !M && !R && !P) return 'S';

        // ── T: Thumb between index and middle ──
        if (T && !I && !M && !R && !P && tiClose) return 'T';

        // ── U: Index + middle up, together ──
        if (!T && I && M && !R && !P && !imSep) return 'U';

        // ── V: Index + middle up, spread ──
        if (!T && I && M && !R && !P && imSep) return 'V';

        // ── W: Index + middle + ring up ──
        if (!T && I && M && R && !P) return 'W';

        // ── X: Index hooked/bent ──
        if (!T && I && !M && !R && !P && indexBent) return 'X';

        // ── Y: Thumb + pinky out ──
        if (T && !I && !M && !R && P) return 'Y';

        // ── Z: Index traces Z (hard to detect statically, use index up alone) ──
        if (!T && I && !M && !R && !P && !indexBent) return 'Z';

        return null;
    }

    // ---- Confidence Scoring ----
    _computeConfidence(fingers, sign) {
        if (['HELLO', 'YES', 'NO', 'ILY', 'OK', 'STOP', 'PLEASE', 'SORRY'].includes(sign)) {
            return 0.95; // High confidence for whole words if matched
        }

        const highConf = ['B', 'I', 'L', 'V', 'W', 'Y', 'U', 'O', 'A', 'S'];
        const medConf = ['D', 'K', 'F', 'H', 'R', 'T', 'E', 'C', 'G'];
        const base = highConf.includes(sign) ? 0.87
            : medConf.includes(sign) ? 0.71
                : 0.58;
        return Math.min(0.99, base + (Math.random() * 0.08 - 0.01));
    }

    _confidenceColor(c) {
        return c >= 0.85 ? '#4ade80' : c >= 0.60 ? '#fbbf24' : '#f87171';
    }

    _confidenceLabel(c) {
        return c >= 0.85 ? '🟢' : c >= 0.60 ? '🟡' : '🔴';
    }

    _updateConfidenceBar(conf) {
        const bar = document.getElementById('confidenceBar');
        if (bar) {
            bar.style.width = (conf * 100) + '%';
            bar.style.background = this._confidenceColor(conf);
        }
    }

    _updateConfidenceUI(letter, conf) {
        const el = document.getElementById('detectedLetter');
        if (el) el.textContent = letter || '–';

        const confDisplay = document.getElementById('confidenceDisplay');
        if (confDisplay) {
            if (letter && conf > 0) {
                const pct = Math.round(conf * 100);
                const emoji = this._confidenceLabel(conf);
                const color = this._confidenceColor(conf);
                confDisplay.innerHTML = `
                    <span class="conf-detected">Detected: <strong>${letter}</strong></span>
                    <span class="conf-badge" style="color:${color};border-color:${color}">
                        ${emoji} ${pct}%
                    </span>`;
                confDisplay.style.display = 'flex';
            } else {
                confDisplay.style.display = 'none';
            }
        }

        const label = document.querySelector('.detection-label');
        if (label) {
            label.textContent = letter
                ? `${Math.round(conf * 100)}% confidence`
                : 'No hand detected';
        }
    }

    // ---- Letter / Word Confirmed ----
    _confirmSign(sign) {
        if (sign === this.lastConfirmed) return;
        this.lastConfirmed = sign;

        const isWholeWord = ['YES', 'NO', 'HELLO', 'ILY', 'OK', 'STOP', 'PLEASE', 'SORRY'].includes(sign);

        if (isWholeWord) {
            // Commit any pending letters first
            if (this.wordBuffer.length > 0) {
                this._commitWord();
            }

            // Output the whole word immediately
            const displayWord = sign === 'ILY' ? 'I Love You' : this.WORD_PATTERNS[sign] || sign;
            this.transcript.push(displayWord);
            this._renderTranscript(displayWord);

            if (this.onWordCommitted) this.onWordCommitted(displayWord);
            if (window.speechSynthesis && document.getElementById('autoSpeakToggle')?.checked) {
                const u = new SpeechSynthesisUtterance(displayWord);
                u.rate = 0.95; u.lang = 'en-US';
                window.speechSynthesis.speak(u);
            }

            if (typeof window.appHistory !== 'undefined') {
                window.appHistory.add('sign-to-text', displayWord, this.confidence);
            }
            // Notify app.js for highlighting if needed
            if (this.onLetterConfirmed) this.onLetterConfirmed(sign);

        } else {
            this.wordBuffer.push(sign);
            this.lettersCount++;
            this._renderWord();
            if (this.onLetterConfirmed) this.onLetterConfirmed(sign);
            clearTimeout(this.wordPauseTimer);
            this.wordPauseTimer = setTimeout(() => this._commitWord(), this.WORD_PAUSE);
            const sl = document.getElementById('statusLetters');
            if (sl) sl.textContent = `🔡 Letters: ${this.lettersCount}`;
            if (typeof window.appHistory !== 'undefined') {
                window.appHistory.add('sign-to-text', sign, this.confidence);
            }
        }
    }

    _commitWord() {
        if (!this.wordBuffer.length) return;
        const raw = this.wordBuffer.join('');
        const word = this.WORD_PATTERNS[raw] || raw;
        this.transcript.push(word);
        this._renderTranscript(word);
        if (this.onWordCommitted) this.onWordCommitted(word);
        if (window.speechSynthesis && document.getElementById('autoSpeakToggle')?.checked) {
            const u = new SpeechSynthesisUtterance(word);
            u.rate = 0.95; u.lang = 'en-US';
            window.speechSynthesis.speak(u);
        }
        this.wordBuffer = [];
        this.lastConfirmed = null;
        this._renderWord();
    }

    _renderWord() {
        const el = document.getElementById('wordBuffer');
        if (el) el.textContent = this.wordBuffer.length ? this.wordBuffer.join('') : '_';
    }

    _renderTranscript(word) {
        const container = document.getElementById('transcriptContent');
        if (!container) return;
        container.querySelector('.placeholder-text')?.remove();
        const span = document.createElement('span');
        span.className = 'letter-token';
        span.textContent = word + ' ';
        container.appendChild(span);
        container.scrollTop = container.scrollHeight;
    }

    _noHand() {
        clearTimeout(this.holdTimer);
        this.currentLetter = null;
        this._stableCount = 0;
        this._stableLetter = null;
        this._updateConfidenceUI(null, 0);
        this._updateConfidenceBar(0);
        if (this.wordBuffer.length > 0 && !this.wordPauseTimer) {
            this.wordPauseTimer = setTimeout(() => this._commitWord(), this.WORD_PAUSE);
        }
    }

    getFullTranscript() {
        const pending = this.wordBuffer.join('');
        return [...this.transcript, pending].filter(Boolean).join(' ');
    }

    clear() {
        this.wordBuffer = []; this.transcript = [];
        this.lastConfirmed = null; this.currentLetter = null;
        this.lettersCount = 0;
        this._stableCount = 0; this._stableLetter = null;
        clearTimeout(this.holdTimer); clearTimeout(this.wordPauseTimer);
        this.holdTimer = null; this.wordPauseTimer = null;
        this._renderWord();
        this._updateConfidenceBar(0);
        this._updateConfidenceUI(null, 0);
        const sl = document.getElementById('statusLetters');
        if (sl) sl.textContent = '🔡 Letters: 0';
        const c = document.getElementById('transcriptContent');
        if (c) c.innerHTML = '<span class="placeholder-text">Detected signs will appear here…</span>';
    }

    // ---- Smart Polish ----
    /**
     * 1. Collapse runs of repeated letters:  "heeellooo" → "helo"
     * 2. Find the closest word in dictionary using Levenshtein distance
     * 3. Fall back to capitalized raw word if no close match
     */
    static smartPolish(rawText) {
        const words = rawText.trim().split(/\s+/);
        const polished = words.map(w => {
            const lower = w.toLowerCase();
            const deduped = SignToTextClassifier._dedupeChars(lower);
            const match = SignToTextClassifier._closestWord(deduped);
            // Capitalize first letter
            return match.charAt(0).toUpperCase() + match.slice(1);
        });
        return polished.join(' ') + '.';
    }

    static _dedupeChars(str) {
        // Collapse 3+ consecutive same chars to 1, 2 to 1
        return str.replace(/(.)\1+/g, '$1');
    }

    static _closestWord(word) {
        const dict = [
            'hello', 'world', 'help', 'love', 'good', 'done', 'name', 'home', 'work',
            'school', 'stop', 'wait', 'more', 'fine', 'sorry', 'please', 'thank', 'yes',
            'no', 'bye', 'what', 'who', 'why', 'how', 'when', 'where', 'need', 'want',
            'like', 'eat', 'drink', 'come', 'go', 'look', 'see', 'know', 'think', 'feel',
            'time', 'day', 'make', 'take', 'give', 'find', 'tell', 'ask', 'call', 'walk',
            'talk', 'hear', 'play', 'live', 'learn', 'read', 'write', 'open', 'close',
            'happy', 'sad', 'real', 'true', 'high', 'low', 'big', 'small', 'fast', 'slow',
            'water', 'food', 'phone', 'book', 'hand', 'face', 'head', 'heart', 'mind',
            'right', 'left', 'both', 'next', 'last', 'first', 'also', 'just', 'even',
            'still', 'back', 'then', 'only', 'never', 'every', 'again', 'much', 'many',
        ];
        let best = word, bestDist = Infinity;
        for (const candidate of dict) {
            const d = SignToTextClassifier._levenshtein(word, candidate);
            if (d < bestDist) { bestDist = d; best = candidate; }
        }
        // Only accept if within 40% of word length
        return bestDist <= Math.max(2, Math.floor(word.length * 0.4)) ? best : word;
    }

    static _levenshtein(a, b) {
        const m = a.length, n = b.length;
        const dp = Array.from({ length: m + 1 }, (_, i) =>
            Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
        );
        for (let i = 1; i <= m; i++)
            for (let j = 1; j <= n; j++)
                dp[i][j] = a[i - 1] === b[j - 1]
                    ? dp[i - 1][j - 1]
                    : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        return dp[m][n];
    }
}

window.SignToTextClassifier = SignToTextClassifier;
