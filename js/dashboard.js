/**
 * dashboard.js
 * Performance Dashboard – tracks real-time metrics:
 * Total translations, average confidence, avg detection time, session uptime.
 */

class Dashboard {
    constructor() {
        this.totalTranslations = 0;
        this.confidenceHistory = [];
        this.detectionTimes = [];
        this.sessionStart = Date.now();
        this.visible = false;
        this._uptimeInterval = null;
    }

    recordTranslation(letter, confidence, detectionMs) {
        this.totalTranslations++;
        if (confidence > 0) this.confidenceHistory.push(confidence);
        if (detectionMs > 0) this.detectionTimes.push(detectionMs);
        // Keep history bounded
        if (this.confidenceHistory.length > 200) this.confidenceHistory.shift();
        if (this.detectionTimes.length > 200) this.detectionTimes.shift();
        this._updateDOM();
    }

    show() {
        this.visible = true;
        const panel = document.getElementById('dashboardPanel');
        if (panel) panel.classList.add('open');
        this._updateDOM();
        this._uptimeInterval = setInterval(() => this._updateUptime(), 1000);
    }

    hide() {
        this.visible = false;
        const panel = document.getElementById('dashboardPanel');
        if (panel) panel.classList.remove('open');
        clearInterval(this._uptimeInterval);
    }

    toggle() {
        this.visible ? this.hide() : this.show();
    }

    _avg(arr) {
        if (!arr.length) return 0;
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    }

    _updateDOM() {
        if (!this.visible) return;
        const avgConf = this._avg(this.confidenceHistory);
        const avgTime = this._avg(this.detectionTimes);
        _set('dash-total', this.totalTranslations);
        _set('dash-accuracy', avgConf > 0 ? Math.round(avgConf * 100) + '%' : '–');
        _set('dash-speed', avgTime > 0 ? avgTime.toFixed(0) + ' ms' : '–');
        // Accuracy bar
        const bar = document.getElementById('dash-accuracy-bar');
        if (bar) {
            bar.style.width = Math.round(avgConf * 100) + '%';
            bar.style.background = avgConf > 0.85 ? '#4ade80'
                : avgConf > 0.60 ? '#fbbf24' : '#f87171';
        }
    }

    _updateUptime() {
        const secs = Math.floor((Date.now() - this.sessionStart) / 1000);
        const m = String(Math.floor(secs / 60)).padStart(2, '0');
        const s = String(secs % 60).padStart(2, '0');
        _set('dash-uptime', `${m}:${s}`);
    }
}

function _set(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

window.Dashboard = Dashboard;
