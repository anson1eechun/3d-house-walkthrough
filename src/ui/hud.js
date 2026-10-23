// In-game HUD: room name, chips, crosshair, interaction prompt, toasts, stats.

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.el = $('hud');
    this.roomName = $('room-name');
    this.roomSub = $('room-sub');
    this.chips = $('hud-chips');
    this.crosshair = $('crosshair');
    this.promptEl = $('prompt');
    this.toastEl = $('toast');
    this.statsEl = $('stats');
    this.hintEl = $('hint');
    this._room = '';
    this._promptKey = '';
    this._toastTimer = 0;
  }

  show(v) { this.el.classList.toggle('hidden', !v); }

  setRoom(name) {
    if (name === this._room) return;
    this._room = name;
    this.roomName.textContent = name;
  }

  setSub(text) { if (this.roomSub.textContent !== text) this.roomSub.textContent = text; }

  setChips(list) {
    const html = list.map(t => `<span class="chip">${t}</span>`).join('');
    if (this.chips.innerHTML !== html) this.chips.innerHTML = html;
  }

  setPrompt(item) {
    let key = '', html = '';
    if (item) {
      const p = item.prompt();
      const s = item.secondaryPrompt?.();
      if (p) {
        html = `<span class="k">F</span>${p}`;
        if (s) html += `<span class="sub">E — ${s}</span>`;
      } else if (item.busy) {
        html = `<span class="busy">…</span>`;
      }
      key = html;
    }
    if (key === this._promptKey) return;
    this._promptKey = key;
    this.promptEl.innerHTML = html;
    this.promptEl.classList.toggle('hidden', !html);
    this.crosshair.classList.toggle('focus', !!item);
  }

  toast(text, ms = 1800) {
    this.toastEl.textContent = text;
    this.toastEl.classList.remove('hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toastEl.classList.add('hidden'), ms);
  }

  fadeHint() { setTimeout(() => { this.hintEl.style.opacity = '0'; }, 9000); }

  showStats(v) { this.statsEl.classList.toggle('hidden', !v); }
  setStats(text) { this.statsEl.textContent = text; }
}
