/**
 * app.js  v2 – Main orchestrator with all 10 feature upgrades wired in.
 */

// ---- Global singletons accessible by other modules ----
window.appDashboard = null;
window.appHistory = null;

(function () {
    'use strict';

    let detector, classifier, animator, convMode;
    let speechRecognition = null;
    let isMicActive = false;
    let isLooping = false;
    let isSlowMo = false;
    let fontSizeLevel = 0; // 0,1,2
    const FONT_SIZES = ['', 'font-md', 'font-lg'];

    // ===== DOMContentLoaded =====
    window.addEventListener('DOMContentLoaded', async () => {
        // Init modules
        detector = new GestureDetector();
        classifier = new SignToTextClassifier();
        animator = new TextToSignAnimator();

        window.appDashboard = new Dashboard();
        window.appHistory = new ConversationHistory();

        convMode = new ConversationMode(classifier, animator);

        // Wire gesture → classifier
        detector.onLandmarks = (lm) => classifier.classify(lm);

        // Flash ref card + record history on letter confirmed
        classifier.onLetterConfirmed = (letter) => {
            highlightRefCard(letter);
        };

        // On word committed → add to history + optional grammar
        classifier.onWordCommitted = (word) => {
            window.appHistory.add('sign-to-text', word, classifier.confidence);
        };

        // Word change in animator → update button progress
        animator.onWordChange = (word, idx, total) => {
            const btn = document.getElementById('animateBtn');
            if (btn) btn.innerHTML = `<span class="btn-icon">▶</span> Word ${idx + 1}/${total}: ${word}`;
        };

        // Animation done → reset button
        animator.onDone = () => {
            const btn = document.getElementById('animateBtn');
            if (btn) btn.innerHTML = '<span class="btn-icon">▶</span> Animate';
            const p = document.getElementById('pauseSignBtn');
            if (p) p.textContent = '⏸';
        };

        // Bind all UI
        bindCameraControls();
        bindTranscriptControls();
        bindSignControls();
        bindTextInput();
        bindMicControls();
        bindSliders();
        bindHeaderControls();
        bindSidebars();
        buildReferenceGrid();

        // Init MediaPipe
        try {
            await detector.init();
            showToast('MediaPipe ready ✓', 'success');
        } catch (err) {
            console.warn('MediaPipe init:', err.message);
            showToast('MediaPipe needs internet connection', 'warn');
        }

        // TTS check
        if (!window.speechSynthesis) {
            document.getElementById('speakBtn').style.opacity = '0.4';
        }

        console.log('SignBridge v2 ready.');
    });

    // ===== Header Controls =====
    function bindHeaderControls() {
        // Dark / Light Theme
        document.getElementById('themeToggleBtn').addEventListener('click', () => {
            const html = document.documentElement;
            const isDark = html.dataset.theme === 'dark';
            html.dataset.theme = isDark ? 'light' : 'dark';
            document.getElementById('themeToggleBtn').textContent = isDark ? '🌙' : '☀️';
            showToast(isDark ? '☀️ Light mode' : '🌙 Dark mode');
        });

        // Font Size Cycle
        document.getElementById('fontSizeBtn').addEventListener('click', () => {
            document.body.classList.remove(FONT_SIZES[fontSizeLevel] || '_none');
            fontSizeLevel = (fontSizeLevel + 1) % 3;
            if (FONT_SIZES[fontSizeLevel]) document.body.classList.add(FONT_SIZES[fontSizeLevel]);
            showToast(['Normal size', 'Medium size', 'Large size'][fontSizeLevel]);
        });

        // Conversation Mode
        document.getElementById('convModeBtn').addEventListener('click', () => {
            convMode.toggle();
            document.getElementById('statusMode').textContent =
                convMode.active ? '🔄 Conversation Mode' : '⚙ Normal Mode';
        });
        document.getElementById('convBannerClose')?.addEventListener('click', () => convMode.disable());

        // Dashboard
        document.getElementById('dashboardBtn').addEventListener('click', () => {
            window.appDashboard.toggle();
            toggleSidebarOverlay(window.appDashboard.visible || appHistoryVisible());
        });
        document.getElementById('closeDashBtn').addEventListener('click', () => {
            window.appDashboard.hide();
            toggleSidebarOverlay(appHistoryVisible());
        });

        // History
        document.getElementById('historyBtn').addEventListener('click', () => {
            const panel = document.getElementById('historyPanel');
            const isOpen = panel.classList.toggle('open');
            toggleSidebarOverlay(isOpen || window.appDashboard.visible);
        });
        document.getElementById('closeHistoryBtn').addEventListener('click', () => {
            document.getElementById('historyPanel').classList.remove('open');
            toggleSidebarOverlay(window.appDashboard.visible);
        });
        document.getElementById('exportHistoryBtn').addEventListener('click', () => window.appHistory.exportTxt());
        document.getElementById('clearHistoryBtn').addEventListener('click', () => {
            window.appHistory.clear();
            showToast('History cleared');
        });

        // Sidebar overlay click = close all
        document.getElementById('sidebarOverlay').addEventListener('click', () => {
            window.appDashboard.hide();
            document.getElementById('historyPanel').classList.remove('open');
            toggleSidebarOverlay(false);
        });
    }

    function appHistoryVisible() {
        return document.getElementById('historyPanel')?.classList.contains('open');
    }

    function toggleSidebarOverlay(show) {
        document.getElementById('sidebarOverlay').classList.toggle('active', show);
    }

    function bindSidebars() {
        // nothing extra – handled in bindHeaderControls
    }

    // ===== Camera Controls =====
    function bindCameraControls() {
        document.getElementById('startCameraBtn').addEventListener('click', async () => {
            const btn = document.getElementById('startCameraBtn');
            try {
                btn.disabled = true;
                btn.innerHTML = '<span class="btn-icon">⏳</span> Starting…';
                document.getElementById('cameraSpinner').style.display = 'block';
                await detector.start();
                document.getElementById('stopCameraBtn').disabled = false;
                document.getElementById('statusCamera').textContent = '📷 Camera: Active';
                document.getElementById('statusCamera').classList.add('active');
                document.getElementById('liveIndicator').style.display = 'inline-flex';
                document.getElementById('cameraSpinner').style.display = 'none';
                showToast('Camera started – show your hand! 🤟', 'success');
            } catch (e) {
                btn.disabled = false;
                btn.innerHTML = '<span class="btn-icon">▶</span> Start Camera';
                document.getElementById('cameraSpinner').style.display = 'none';
                showToast('Camera error: ' + (e.message || 'Permission denied'), 'error');
            }
        });

        document.getElementById('stopCameraBtn').addEventListener('click', () => {
            detector.stop();
            document.getElementById('startCameraBtn').disabled = false;
            document.getElementById('startCameraBtn').innerHTML = '<span class="btn-icon">▶</span> Start Camera';
            document.getElementById('stopCameraBtn').disabled = true;
            document.getElementById('statusCamera').textContent = '📷 Camera: Off';
            document.getElementById('statusCamera').classList.remove('active');
            showToast('Camera stopped');
        });

        document.getElementById('clearTranscriptBtn').addEventListener('click', () => {
            classifier.clear();
            showToast('Transcript cleared');
        });
    }

    // ===== Transcript Controls =====
    function bindTranscriptControls() {
        document.getElementById('speakBtn').addEventListener('click', () => {
            const text = classifier.getFullTranscript();
            if (!text) { showToast('No transcript to speak', 'warn'); return; }
            speakText(text);
        });

        document.getElementById('copyBtn').addEventListener('click', () => {
            const text = classifier.getFullTranscript();
            if (!text) { showToast('Nothing to copy', 'warn'); return; }
            navigator.clipboard.writeText(text).then(() => showToast('Copied ✓', 'success'));
        });

        // Grammar Polish via Gemini (free REST API)
        document.getElementById('polishBtn').addEventListener('click', async () => {
            const text = classifier.getFullTranscript();
            if (!text) { showToast('No text to polish', 'warn'); return; }
            showToast('✨ Polishing grammar…');
            const polished = await grammarPolish(text);
            if (polished) {
                // Show polished result in a nice overlay
                showPolishResult(text, polished);
            }
        });
    }

    // ===== Grammar Polish =====
    async function grammarPolish(rawText) {
        // Use the smart polish from SignToTextClassifier (dedup + word matching)
        return SignToTextClassifier.smartPolish(rawText);
    }

    function showPolishResult(orig, polished) {
        let overlay = document.getElementById('polishOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'polishOverlay';
            overlay.className = 'polish-overlay';
            document.body.appendChild(overlay);
        }
        overlay.innerHTML = `
            <div class="polish-card">
                <h3>✨ Smart Polish</h3>
                <div class="polish-before"><strong>Original:</strong><br>${orig}</div>
                <div class="polish-arrow">↓</div>
                <div class="polish-after"><strong>Polished:</strong><br>${polished}</div>
                <div class="polish-actions">
                    <button class="btn btn-primary" id="usePolishedBtn">Use This</button>
                    <button class="btn btn-ghost" id="closePolishBtn">Close</button>
                </div>
            </div>`;
        overlay.style.display = 'flex';
        document.getElementById('closePolishBtn').onclick = () => overlay.style.display = 'none';
        document.getElementById('usePolishedBtn').onclick = () => {
            // Update the text input
            const ta = document.getElementById('textInput');
            if (ta) { ta.value = polished; document.getElementById('charCount').textContent = polished.length; }
            // Also push polished text into the sign-to-text transcript
            const container = document.getElementById('transcriptContent');
            if (container) {
                container.querySelector('.placeholder-text')?.remove();
                const span = document.createElement('span');
                span.className = 'letter-token polished';
                span.title = 'Polished';
                span.textContent = '✨ ' + polished + ' ';
                container.appendChild(span);
                container.scrollTop = container.scrollHeight;
            }
            overlay.style.display = 'none';
            showToast('✨ Polished text applied!', 'success');
        };
    }

    // ===== Sign Controls =====
    function bindSignControls() {
        document.getElementById('animateBtn').addEventListener('click', () => {
            const text = document.getElementById('textInput').value;
            if (!text.trim()) { showToast('Please enter text', 'warn'); return; }
            const count = animator.loadWords(text);
            if (!count) { showToast('No supported ASL letters found', 'warn'); return; }
            animator.playWords();
            document.getElementById('signPlaceholder').style.display = 'none';
            document.getElementById('signDisplayWrapper').classList.add('active');
            showToast(`Animating ${count} word${count !== 1 ? 's' : ''} word-by-word`);
            window.appHistory.add('text-to-sign', text, null);
        });

        document.getElementById('pauseSignBtn').addEventListener('click', () => {
            animator.pause();
            const btn = document.getElementById('pauseSignBtn');
            btn.textContent = animator.isPaused ? '▶' : '⏸';
        });

        document.getElementById('prevSignBtn').addEventListener('click', () => {
            if (animator.currentWordIdx > 0) {
                animator.currentWordIdx--;
                animator.currentLetterIdx = 0;
                animator._showCurrentWord();
            }
        });
        document.getElementById('nextSignBtn').addEventListener('click', () => {
            if (animator.currentWordIdx < animator.wordQueue.length - 1) {
                animator.currentWordIdx++;
                animator.currentLetterIdx = 0;
                animator._showCurrentWord();
            }
        });

        document.getElementById('loopSignBtn').addEventListener('click', () => {
            isLooping = !isLooping;
            animator.setLoop(isLooping);
            document.getElementById('loopSignBtn').classList.toggle('active', isLooping);
            showToast(isLooping ? 'Loop ON' : 'Loop OFF');
        });

        // Slow-mo
        document.getElementById('slowMoBtn').addEventListener('click', () => {
            isSlowMo = !isSlowMo;
            animator.setSpeed(isSlowMo ? 2500 : parseInt(document.getElementById('signSpeed').value));
            document.getElementById('slowMoBtn').classList.toggle('active', isSlowMo);
            showToast(isSlowMo ? '🐢 Slow Motion ON' : '🐢 Slow Motion OFF');
        });

        // Save to history
        document.getElementById('addHistoryBtn').addEventListener('click', () => {
            const text = document.getElementById('textInput').value.trim();
            if (!text) { showToast('Nothing to save', 'warn'); return; }
            window.appHistory.add('text-to-sign', text, null);
            showToast('💾 Saved to history', 'success');
        });
    }

    // ===== Text Input =====
    function bindTextInput() {
        const ta = document.getElementById('textInput');
        ta.addEventListener('input', () => {
            document.getElementById('charCount').textContent = ta.value.length;
        });
        ta.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                document.getElementById('animateBtn').click();
            }
        });
    }

    // ===== Microphone =====
    function bindMicControls() {
        const MicAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
        const micBtn = document.getElementById('micBtn');
        if (!MicAPI) {
            micBtn.style.opacity = '0.4';
            micBtn.title = 'Speech recognition not supported — please use Chrome or Edge';
            return;
        }

        micBtn.addEventListener('click', () => {
            if (isMicActive) { speechRecognition?.abort(); return; }

            speechRecognition = new MicAPI();
            speechRecognition.lang = 'en-US';
            speechRecognition.interimResults = false;
            speechRecognition.maxAlternatives = 1;
            speechRecognition.continuous = false;

            speechRecognition.onstart = () => {
                isMicActive = true;
                micBtn.classList.add('recording');
                document.getElementById('statusMic').textContent = '🎤 Mic: Recording';
                document.getElementById('statusMic').classList.add('active');
                showToast('🎤 Listening…');
            };

            speechRecognition.onresult = (e) => {
                const text = e.results[0][0].transcript;
                const ta = document.getElementById('textInput');
                ta.value = text;
                document.getElementById('charCount').textContent = text.length;
                setTimeout(() => document.getElementById('animateBtn').click(), 300);
            };

            speechRecognition.onerror = (e) => {
                const msgs = {
                    'not-allowed': '🎤 Mic access denied — allow microphone in browser settings',
                    'audio-capture': '🎤 No microphone found on this device',
                    'network': '🎤 Network error — check your connection',
                    'no-speech': '🎤 No speech detected — please speak clearly',
                    'aborted': null,  // user manually stopped, no toast needed
                    'service-not-allowed': '🎤 Speech service not allowed — use Chrome/Edge',
                };
                const msg = msgs[e.error];
                if (msg) showToast(msg, 'error');
                stopMic();
            };

            speechRecognition.onend = stopMic;

            try {
                speechRecognition.start();
            } catch (e) {
                showToast('🎤 Could not start microphone: ' + e.message, 'error');
                stopMic();
            }
        });

        function stopMic() {
            isMicActive = false;
            micBtn.classList.remove('recording');
            document.getElementById('statusMic').textContent = '🎤 Mic: Ready';
            document.getElementById('statusMic').classList.remove('active');
        }
    }

    // ===== Sliders =====
    function bindSliders() {
        const holdSlider = document.getElementById('holdDuration');
        holdSlider.addEventListener('input', () => {
            classifier.holdDuration = parseInt(holdSlider.value);
            document.getElementById('holdDurationVal').textContent = (holdSlider.value / 1000).toFixed(1) + 's';
        });

        const speedSlider = document.getElementById('signSpeed');
        speedSlider.addEventListener('input', () => {
            if (!isSlowMo) animator.setSpeed(parseInt(speedSlider.value));
            document.getElementById('signSpeedVal').textContent = (speedSlider.value / 1000).toFixed(1) + 's';
        });
    }

    // ===== Reference Grid =====
    function buildReferenceGrid() {
        const grid = document.getElementById('refGrid');
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach(letter => {
            const card = document.createElement('div');
            card.className = 'ref-card';
            card.id = 'ref-' + letter;
            card.title = `ASL letter ${letter}`;

            const img = document.createElement('img');
            img.className = 'ref-card-img loading';
            img.alt = `ASL ${letter}`;
            img.width = 44; img.height = 50;
            img.crossOrigin = 'anonymous';
            const url = (window.ASL_THUMB_MAP?.[letter]) || (window.ASL_PHOTO_MAP?.[letter])
                || `https://corsproxy.io/?url=${encodeURIComponent('https://www.lifeprint.com/asl101/fingerspelling/abc-gifs/' + letter.toLowerCase() + '.gif')}`;
            img.src = url;
            img.onload = () => img.classList.remove('loading');
            img.onerror = () => { img.classList.remove('loading'); img.alt = letter; };

            const lbl = document.createElement('div');
            lbl.className = 'ref-letter';
            lbl.textContent = letter;

            card.appendChild(img);
            card.appendChild(lbl);
            card.addEventListener('click', () => {
                document.getElementById('textInput').value = letter;
                document.getElementById('charCount').textContent = '1';
                const count = animator.loadText(letter);
                if (count) {
                    animator.play();
                    document.getElementById('signPlaceholder').style.display = 'none';
                    document.getElementById('signDisplayWrapper').classList.add('active');
                }
            });
            grid.appendChild(card);
        });
    }

    function highlightRefCard(letter) {
        document.querySelectorAll('.ref-card').forEach(c => c.classList.remove('highlighted'));
        const card = document.getElementById('ref-' + letter);
        if (card) {
            card.classList.add('highlighted');
            setTimeout(() => card.classList.remove('highlighted'), 1500);
        }
    }

    // ===== TTS =====
    function speakText(text) {
        if (!window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 0.9; u.pitch = 1; u.lang = 'en-US';
        window.speechSynthesis.speak(u);
        showToast('🔊 Speaking…');
    }

    // ===== Toast =====
    let toastTimeout;
    window.showToast = function (msg, type = 'info') {
        const toast = document.getElementById('toastEl');
        if (!toast) return;
        const icons = { info: 'ℹ️', success: '✅', warn: '⚠️', error: '❌' };
        toast.textContent = (icons[type] || '') + ' ' + msg;
        toast.classList.add('show');
        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => toast.classList.remove('show'), 3000);
    };

})();
