/**
 * textToSign.js  v3 – Real Photo Edition
 * Displays actual ASL hand photographs for each letter.
 * Photos are loaded from the Lifeprint (ASLU) public image archive.
 *
 * Image URL pattern:
 *   https://www.lifeprint.com/asl101/fingerspelling/abc-gifs/{letter}.gif
 */

// ---- ASL Photo URL map ----
// Direct URLs (work when loaded from http server, preferred)
const ASL_PHOTO_BASE = 'https://www.lifeprint.com/asl101/fingerspelling/abc-gifs/';
// CORS proxy fallback (used for reference grid thumbnails if direct load fails)
const CORS_PROXY = 'https://corsproxy.io/?url=';
const PROXY_PHOTO_BASE = CORS_PROXY + encodeURIComponent(ASL_PHOTO_BASE);

// Build two URL maps: direct for main display, proxied for reference thumbnails
const ASL_PHOTO_MAP = {};
const ASL_THUMB_MAP = {};
'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach(l => {
    const filename = l.toLowerCase() + '.gif';
    ASL_PHOTO_MAP[l] = ASL_PHOTO_BASE + filename;           // Used in main display
    ASL_THUMB_MAP[l] = PROXY_PHOTO_BASE + filename;          // Used in reference grid
});

// Preload all images
const _imgCache = {};
function preloadASLImages() {
    Object.entries(ASL_PHOTO_MAP).forEach(([letter, url]) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = url;
        _imgCache[letter] = img;
    });
}
preloadASLImages();

class TextToSignAnimator {
    constructor() {
        this.photoEl = document.getElementById('signPhoto');
        this.wrapper = this.photoEl ? this.photoEl.closest('.sign-display-wrapper') : null;
        this.queue = [];          // letter-by-letter queue
        this.wordQueue = [];      // [{word, letters}] for word-by-word mode
        this.currentIndex = 0;
        this.currentWordIdx = 0;
        this.currentLetterIdx = 0;
        this.isPlaying = false;
        this.isPaused = false;
        this.looping = false;
        this.speed = 900;         // ms per letter
        this.wordPause = 1200;    // ms pause between words
        this.wordByWord = false;  // mode flag
        this.frameInterval = null;
        this.onLetterChange = null;
        this.onWordChange = null; // callback(word, wordIdx, totalWords)
        this.onDone = null;       // callback when full sequence finishes
    }

    // ---- Word-by-word API ----

    /** Load text in word-by-word mode. Returns word count. */
    loadWords(text) {
        this.stop();
        this.wordByWord = true;
        const rawWords = text.trim().toUpperCase().split(/\s+/).filter(Boolean);
        this.wordQueue = rawWords.map(w => ({
            word: w,
            letters: w.split('').filter(c => ASL_PHOTO_MAP[c])
        })).filter(w => w.letters.length > 0);
        this.currentWordIdx = 0;
        this.currentLetterIdx = 0;
        this.queue = [];
        if (this.wordQueue.length > 0) this._showCurrentWord();
        document.getElementById('signProgressBar').style.width = '0%';
        return this.wordQueue.length;
    }

    /** Play word-by-word sequence */
    playWords() {
        if (!this.wordQueue.length) return;
        this.isPlaying = true;
        this.isPaused = false;
        this.currentWordIdx = 0;
        this.currentLetterIdx = 0;
        this._playWordLetters();
    }

    _playWordLetters() {
        if (this.isPaused || !this.isPlaying) return;
        const wordEntry = this.wordQueue[this.currentWordIdx];
        if (!wordEntry) { this._onSequenceDone(); return; }

        const letter = wordEntry.letters[this.currentLetterIdx];
        if (!letter) {
            // Word done, pause then move to next
            this.frameInterval = setTimeout(() => {
                this.currentWordIdx++;
                this.currentLetterIdx = 0;
                if (this.currentWordIdx >= this.wordQueue.length) {
                    if (this.looping) { this.currentWordIdx = 0; }
                    else { this._onSequenceDone(); return; }
                }
                this._showCurrentWord();
                this._playWordLetters();
            }, this.wordPause);
            return;
        }

        this._displayPhoto(letter);
        this._updateWordProgress();
        if (this.onLetterChange) {
            // Give overall position context
            const totalLetters = this.wordQueue.reduce((s, w) => s + w.letters.length, 0);
            const prevLetters = this.wordQueue.slice(0, this.currentWordIdx).reduce((s, w) => s + w.letters.length, 0);
            this.onLetterChange(letter, prevLetters + this.currentLetterIdx, totalLetters);
        }

        this.currentLetterIdx++;
        this.frameInterval = setTimeout(() => this._playWordLetters(), this.speed);
    }

    _showCurrentWord() {
        const wordEntry = this.wordQueue[this.currentWordIdx];
        if (!wordEntry) return;
        // Update word label banner
        const wordBanner = document.getElementById('wordBanner');
        if (wordBanner) {
            wordBanner.textContent = wordEntry.word;
            wordBanner.style.display = 'block';
            // Re-trigger animation
            void wordBanner.offsetWidth;
            wordBanner.classList.remove('pop');
            void wordBanner.offsetWidth;
            wordBanner.classList.add('pop');
        }
        if (this.onWordChange) {
            this.onWordChange(wordEntry.word, this.currentWordIdx, this.wordQueue.length);
        }
        this._updateWordProgress();
        // Show first letter of word immediately
        if (wordEntry.letters.length > 0) this._displayPhoto(wordEntry.letters[0]);
    }

    _updateWordProgress() {
        if (!this.wordQueue.length) return;
        const pct = ((this.currentWordIdx) / this.wordQueue.length) * 100;
        const bar = document.getElementById('signProgressBar');
        if (bar) bar.style.width = Math.min(pct, 100) + '%';
    }

    _onSequenceDone() {
        this.isPlaying = false;
        if (this.onDone) this.onDone();
    }

    // ---- Public API ----

    loadText(text) {
        this.stop();
        this.queue = text.toUpperCase().split('').filter(c => ASL_PHOTO_MAP[c] || c === ' ');
        this.currentIndex = 0;
        this._buildSignIndex();

        if (this.queue.length > 0) {
            this._showLetter();
        }
        document.getElementById('signProgressBar').style.width = '0%';
        return this.queue.length;
    }

    play() {
        if (this.isPlaying && !this.isPaused) { this.currentIndex = 0; }
        if (this.isPaused) { this.isPaused = false; this._scheduleNext(); return; }
        this.isPlaying = true;
        this.isPaused = false;
        this.currentIndex = 0;
        this._showLetter();
    }

    pause() {
        if (!this.isPlaying) return;
        this.isPaused = !this.isPaused;
        if (this.isPaused) {
            clearTimeout(this.frameInterval);
        } else {
            this._scheduleNext();
        }
    }

    stop() {
        this.isPlaying = false;
        this.isPaused = false;
        clearTimeout(this.frameInterval);
        this.currentIndex = 0;
        document.getElementById('signProgressBar').style.width = '0%';
        const label = document.getElementById('currentSignLabel');
        if (label) label.style.display = 'none';
        if (this.wrapper) this.wrapper.classList.remove('active', 'loading');
    }

    next() {
        if (this.currentIndex < this.queue.length - 1) {
            this.currentIndex++;
            this._showLetter();
        }
    }

    prev() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            this._showLetter();
        }
    }

    setSpeed(ms) { this.speed = ms; }
    setLoop(v) { this.looping = v; }

    // ---- Private ----

    _showLetter() {
        if (this.currentIndex >= this.queue.length) {
            if (this.looping) { this.currentIndex = 0; }
            else { this.stop(); return; }
        }

        const ch = this.queue[this.currentIndex];
        this._displayPhoto(ch);
        this._updateProgress();
        this._updateSignIndex(this.currentIndex);
        if (this.onLetterChange) this.onLetterChange(ch, this.currentIndex, this.queue.length);

        if (this.isPlaying && !this.isPaused) this._scheduleNext();
    }

    _scheduleNext() {
        clearTimeout(this.frameInterval);
        this.frameInterval = setTimeout(() => {
            this.currentIndex++;
            this._showLetter();
        }, this.speed);
    }

    _displayPhoto(ch) {
        const photoEl = this.photoEl;
        const wrapper = this.wrapper;
        const placeholder = document.getElementById('signPlaceholder');
        const label = document.getElementById('currentSignLabel');

        if (ch === ' ') {
            // Space: blank panel
            if (photoEl) { photoEl.style.display = 'none'; }
            if (placeholder) { placeholder.style.display = 'flex'; placeholder.querySelector('p').textContent = '[ SPACE ]'; }
            if (label) { label.textContent = '␣'; label.style.display = 'flex'; }
            if (wrapper) { wrapper.classList.remove('active', 'loading'); }
            return;
        }

        const url = ASL_PHOTO_MAP[ch];
        if (!url || !photoEl) return;

        // Show shimmer while loading
        if (wrapper) { wrapper.classList.add('loading'); wrapper.classList.remove('active'); }
        if (placeholder) placeholder.style.display = 'none';

        // Trigger re-animation by cloning src change
        photoEl.style.display = 'none';
        photoEl.style.animation = 'none';

        const onLoad = () => {
            photoEl.style.display = 'block';
            // Force animation replay
            void photoEl.offsetWidth;
            photoEl.style.animation = '';
            if (wrapper) { wrapper.classList.remove('loading'); wrapper.classList.add('active'); }
        };

        if (_imgCache[ch] && _imgCache[ch].complete && _imgCache[ch].naturalWidth > 0) {
            photoEl.src = url;
            onLoad();
        } else {
            photoEl.src = url;
            photoEl.onload = onLoad;
            photoEl.onerror = () => {
                // Fallback: show letter text if image fails
                if (wrapper) wrapper.classList.remove('loading');
                photoEl.style.display = 'none';
                if (placeholder) {
                    placeholder.style.display = 'flex';
                    placeholder.querySelector('p').textContent = `No image for "${ch}"`;
                }
            };
        }

        if (label) { label.textContent = ch; label.style.display = 'flex'; }
    }

    _updateProgress() {
        const pct = this.queue.length > 1
            ? (this.currentIndex / (this.queue.length - 1)) * 100
            : 100;
        const bar = document.getElementById('signProgressBar');
        if (bar) bar.style.width = pct + '%';
    }

    _buildSignIndex() {
        const container = document.getElementById('signIndex');
        if (!container) return;
        container.innerHTML = '';
        this.queue.forEach((ch, i) => {
            const item = document.createElement('div');
            item.className = 'sign-index-item';
            item.textContent = ch === ' ' ? '␣' : ch;
            item.title = ch === ' ' ? 'Space' : `ASL letter ${ch}`;
            item.dataset.idx = i;
            item.addEventListener('click', () => {
                this.currentIndex = i;
                this._showLetter();
            });
            container.appendChild(item);
        });
    }

    _updateSignIndex(idx) {
        const container = document.getElementById('signIndex');
        if (!container) return;
        container.querySelectorAll('.sign-index-item').forEach((el, i) => {
            el.classList.toggle('active', i === idx);
        });
        const active = container.querySelector('.sign-index-item.active');
        if (active) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
}

window.TextToSignAnimator = TextToSignAnimator;
window.ASL_PHOTO_MAP = ASL_PHOTO_MAP;
window.ASL_THUMB_MAP = ASL_THUMB_MAP;
