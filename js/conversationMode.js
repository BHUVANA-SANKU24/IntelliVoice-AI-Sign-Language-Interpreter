/**
 * conversationMode.js
 * Manages the Conversation Mode toggle.
 * When ON: Sign → Text words auto-feed into the Text → Sign panel and animate.
 * Creates a true two-way interpreter loop.
 */

class ConversationMode {
    constructor(classifier, animator) {
        this.classifier = classifier;
        this.animator = animator;
        this.active = false;
        this.debounceTimer = null;
        this.DEBOUNCE_MS = 1800; // wait 1.8s after last letter before animating
        this.lastAnimated = '';
    }

    enable() {
        this.active = true;
        // Hook into classifier word commits
        this._origOnLetterConfirmed = this.classifier.onLetterConfirmed;
        this.classifier.onLetterConfirmed = (letter) => {
            if (this._origOnLetterConfirmed) this._origOnLetterConfirmed(letter);
            this._scheduleAnimation();
        };
        document.getElementById('convModeBtn')?.classList.add('active');
        document.getElementById('conversationBanner')?.classList.add('show');
        this._applyLayout(true);
        showToast('🔄 Conversation Mode ON');
    }

    disable() {
        this.active = false;
        clearTimeout(this.debounceTimer);
        if (this._origOnLetterConfirmed !== undefined) {
            this.classifier.onLetterConfirmed = this._origOnLetterConfirmed;
        }
        document.getElementById('convModeBtn')?.classList.remove('active');
        document.getElementById('conversationBanner')?.classList.remove('show');
        this._applyLayout(false);
        showToast('🔄 Conversation Mode OFF');
    }

    toggle() {
        this.active ? this.disable() : this.enable();
    }

    _scheduleAnimation() {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => this._doAnimate(), this.DEBOUNCE_MS);
    }

    _doAnimate() {
        const text = this.classifier.getFullTranscript();
        if (!text || text === this.lastAnimated) return;
        this.lastAnimated = text;
        // Push transcript into text input
        const textarea = document.getElementById('textInput');
        if (textarea) {
            textarea.value = text;
            document.getElementById('charCount').textContent = text.length;
        }
        // Animate
        const count = this.animator.loadText(text);
        if (count > 0) {
            this.animator.play();
            document.getElementById('signPlaceholder').style.display = 'none';
            showToast(`🔄 Auto-animating: "${text.substring(0, 20)}${text.length > 20 ? '…' : ''}"`);
        }
    }

    _applyLayout(conversationOn) {
        const main = document.querySelector('.main');
        if (main) main.classList.toggle('conversation-mode', conversationOn);
    }
}

window.ConversationMode = ConversationMode;
