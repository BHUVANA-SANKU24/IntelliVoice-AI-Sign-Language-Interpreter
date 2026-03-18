/**
 * history.js
 * Conversation History – stores timestamped sign detections and translations.
 * Supports sidebar display and .txt export.
 */

class ConversationHistory {
    constructor() {
        this.entries = [];  // { time, direction, text, confidence }
    }

    add(direction, text, confidence) {
        if (!text || !text.trim()) return;
        const entry = {
            id: Date.now(),
            time: new Date(),
            direction,  // 'sign-to-text' | 'text-to-sign'
            text: text.trim(),
            confidence: confidence || null,
        };
        this.entries.push(entry);
        this._renderEntry(entry);
        return entry;
    }

    clear() {
        this.entries = [];
        const list = document.getElementById('historyList');
        if (list) list.innerHTML = '<p class="history-empty">No history yet. Start signing or typing!</p>';
    }

    exportTxt() {
        if (!this.entries.length) { showToast('No history to export', 'warn'); return; }
        const lines = [
            'SignBridge – Conversation History',
            `Exported: ${new Date().toLocaleString()}`,
            '─'.repeat(40),
            '',
            ...this.entries.map(e => {
                const icon = e.direction === 'sign-to-text' ? '🤟 SIGN→TEXT' : '💬 TEXT→SIGN';
                const conf = e.confidence ? ` (${Math.round(e.confidence * 100)}%)` : '';
                return `[${this._fmt(e.time)}] ${icon}${conf}: ${e.text}`;
            }),
            '',
            `Total entries: ${this.entries.length}`,
        ];
        const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `signbridge-history-${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('📥 History exported!', 'success');
    }

    _fmt(date) {
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    _renderEntry(entry) {
        const list = document.getElementById('historyList');
        if (!list) return;
        // Remove empty placeholder
        const empty = list.querySelector('.history-empty');
        if (empty) empty.remove();

        const el = document.createElement('div');
        el.className = `history-entry ${entry.direction}`;
        el.dataset.id = entry.id;

        const icon = entry.direction === 'sign-to-text' ? '🤟' : '💬';
        const conf = entry.confidence ? `<span class="h-conf">${Math.round(entry.confidence * 100)}%</span>` : '';
        el.innerHTML = `
            <div class="h-meta">
                <span class="h-icon">${icon}</span>
                <span class="h-time">${this._fmt(entry.time)}</span>
                ${conf}
            </div>
            <div class="h-text">${this._escHtml(entry.text)}</div>
        `;
        list.insertBefore(el, list.firstChild); // newest first
    }

    _escHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
}

window.ConversationHistory = ConversationHistory;
