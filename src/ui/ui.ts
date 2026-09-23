import type { AudioEngine } from '../audio/audioEngine';
import { ballColor, ballKind, ballsOfGroup, CUE_BALL, EIGHT_BALL } from '../game/balls';
import type { GameSession } from '../game/gameSession';
import { isOnEight, type PlayerIndex } from '../game/rules';
import type { Difficulty, GameMode } from '../game/types';
import type { ViewMode } from '../render/cameraController';
import type { Settings } from '../storage/settings';
import {
  CONTROLS,
  GROUP_LABEL,
  HINT_TEXT,
  type MessageTone,
  outcomeMessages,
  reasonText,
  RULES,
  statusText,
  trainingMessages,
} from './texts';

export interface UiCallbacks {
  toggleView(): ViewMode;
  resetCamera(): void;
  settingsChanged(settings: Settings): void;
}

type SubScreen = 'help' | 'settings' | null;

const ICONS = {
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  sound:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  muted:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9l5 6M21 9l-5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  view: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2.5"/></svg>',
  help: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5v.7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="17.2" r="1.2"/></svg>',
};

export function miniBall(id: number, extraClass = ''): string {
  const kind = ballKind(id);
  const label = id === CUE_BALL ? '' : `<i>${id}</i>`;
  return `<span class="mini-ball ${kind} ${extraClass}" style="--c:${ballColor(id)}" title="Kugel ${id}">${label}</span>`;
}

/**
 * DOM-Oberfläche: Menüs, HUD, Meldungen und Stärkeanzeige.
 * Alle Klicks landen auf eigenen Elementen über dem Canvas und lösen daher keinen Stoß aus.
 */
export class GameUI {
  private sub: SubScreen = null;
  private difficulty: Difficulty;
  private pocketedOrder: number[] = [];
  private hudSignature = '';
  private lastStatus = '';
  private readonly toasts: Array<{ el: HTMLElement; ttl: number }> = [];
  private gameOverInfo: { title: string; reason: string } | null = null;

  private readonly screens: HTMLElement;
  private readonly mainMenu: HTMLElement;
  private readonly pauseMenu: HTMLElement;
  private readonly gameOverScreen: HTMLElement;
  private readonly helpScreen: HTMLElement;
  private readonly settingsScreen: HTMLElement;
  private readonly hud: HTMLElement;
  private readonly players: HTMLElement;
  private readonly status: HTMLElement;
  private readonly tray: HTMLElement;
  private readonly toastBox: HTMLElement;
  private readonly power: HTMLElement;
  private readonly powerFill: HTMLElement;
  private readonly powerLabel: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly muteBtn: HTMLElement;
  private readonly viewBtn: HTMLElement;
  private readonly trainingBar: HTMLElement;

  constructor(
    private readonly root: HTMLElement,
    private readonly session: GameSession,
    private readonly audio: AudioEngine,
    private readonly settings: Settings,
    private readonly callbacks: UiCallbacks,
  ) {
    this.difficulty = settings.lastDifficulty;
    root.innerHTML = this.template();
    const q = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
    this.screens = q('.screens');
    this.mainMenu = q('#screen-main');
    this.pauseMenu = q('#screen-pause');
    this.gameOverScreen = q('#screen-gameover');
    this.helpScreen = q('#screen-help');
    this.settingsScreen = q('#screen-settings');
    this.hud = q('.hud');
    this.players = q('.hud-players');
    this.status = q('.hud-status');
    this.tray = q('.hud-tray');
    this.toastBox = q('.toasts');
    this.power = q('.power');
    this.powerFill = q('.power-fill');
    this.powerLabel = q('.power-label');
    this.hint = q('.controls-hint');
    this.muteBtn = q('[data-action="mute"]');
    this.viewBtn = q('[data-action="view"]');
    this.trainingBar = q('.training-bar');

    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('input', (e) => this.onInput(e));
    root.addEventListener('change', (e) => this.onInput(e));
    // Kontextmenü auch über der Oberfläche unterdrücken (rechte Maustaste = Kamera)
    root.addEventListener('contextmenu', (e) => e.preventDefault());

    session.on((e) => {
      switch (e.type) {
        case 'stateChanged':
          // Menüs sofort (nicht erst im nächsten Frame) an den neuen Zustand anpassen
          this.renderStatic();
          break;
        case 'gameStarted':
          this.pocketedOrder = [];
          this.gameOverInfo = null;
          this.clearToasts();
          if (e.mode === 'training') this.toast('Training: Weiße im Anstoßraum platzieren und losspielen.', 'info');
          else this.toast(`Anstoß: ${session.players[session.currentPlayer].name}`, 'turn');
          break;
        case 'physics':
          if (e.event.type === 'pocket' && e.event.ball !== CUE_BALL && !this.pocketedOrder.includes(e.event.ball)) {
            this.pocketedOrder.push(e.event.ball);
          }
          break;
        case 'shotEvaluated': {
          const names: [string, string] = [session.players[0].name, session.players[1].name];
          const open = session.rules.groups[0] === null;
          for (const m of outcomeMessages(e.outcome, names, open)) this.toast(m.text, m.tone);
          if (e.outcome.fouls.length > 0) this.audio.playNotice();
          break;
        }
        case 'trainingEvaluated':
          for (const m of trainingMessages(e.outcome)) this.toast(m.text, m.tone);
          break;
        case 'tableCleared':
          this.pocketedOrder = [];
          this.toast('Tisch abgeräumt! Ein neues Dreieck ist aufgebaut.', 'success');
          break;
        case 'hint':
          this.toast(HINT_TEXT[e.key], 'info');
          break;
        case 'gameOver':
          this.showGameOver(e.winner, e.outcome.shooter, e.outcome.gameOver!.reason);
          break;
        default:
          break;
      }
    });

    this.applySettingsToControls();
    this.renderStatic();
  }

  // ---------------------------------------------------------------------------

  private template(): string {
    const controls = CONTROLS.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('');
    const rules = RULES.map((r) => `<li>${r}</li>`).join('');
    return `
      <div class="hud hidden">
        <div class="hud-top">
          <div class="hud-players"></div>
          <div class="hud-status" aria-live="polite"></div>
          <div class="hud-tray"></div>
        </div>
        <div class="hud-buttons">
          <button class="icon-btn" data-action="view" title="Ansicht wechseln (V)">${ICONS.view}</button>
          <button class="icon-btn" data-action="mute" title="Ton an/aus (M)">${ICONS.sound}</button>
          <button class="icon-btn" data-action="help-toggle" title="Steuerung ein-/ausblenden (H)">${ICONS.help}</button>
          <button class="icon-btn" data-action="pause" title="Pause (Esc)">${ICONS.pause}</button>
        </div>
        <div class="training-bar hidden">
          <button class="chip" data-action="train-place">Weiße versetzen (B)</button>
          <button class="chip" data-action="train-rerack">Neu aufbauen</button>
        </div>
        <div class="power" aria-hidden="true">
          <div class="power-track"><div class="power-fill"></div></div>
          <div class="power-label">0 %</div>
        </div>
        <div class="controls-hint">
          <b>Maus</b> zielen · <b>Links halten</b> aufladen · <b>Loslassen</b> stoßen<br>
          <b>Rechts ziehen</b> Kamera · <b>Rad</b> Zoom · <b>V</b> Ansicht · <b>R</b> Kamera zurück · <b>Esc</b> Pause
        </div>
      </div>
      <div class="toasts" aria-live="polite"></div>
      <div class="screens">
        <section class="screen" id="screen-main">
          <div class="panel menu-panel">
            <h1>Pool Lounge <span>3D</span></h1>
            <p class="subtitle">8-Ball · Freizeit-Regeln · offline</p>
            <div class="menu-buttons">
              <button class="btn primary" data-action="start-training">Training<small>Freies Spielen ohne Gegner</small></button>
              <button class="btn primary" data-action="start-two">Zwei Spieler<small>Abwechselnd am selben PC</small></button>
              <div class="btn-group">
                <button class="btn primary" data-action="start-ai">Gegen Computer<small>Mensch gegen KI</small></button>
                <div class="segmented" role="radiogroup" aria-label="Schwierigkeit">
                  <button data-action="diff-easy" role="radio">Einfach</button>
                  <button data-action="diff-medium" role="radio">Mittel</button>
                </div>
              </div>
            </div>
            <div class="menu-secondary">
              <button class="btn ghost" data-action="open-help">Steuerung &amp; Regeln</button>
              <button class="btn ghost" data-action="open-settings">Einstellungen</button>
            </div>
          </div>
        </section>
        <section class="screen" id="screen-pause">
          <div class="panel menu-panel small">
            <h2>Pause</h2>
            <div class="menu-buttons">
              <button class="btn primary" data-action="resume">Fortsetzen</button>
              <button class="btn" data-action="restart">Neustart</button>
              <button class="btn" data-action="open-help">Steuerung &amp; Regeln</button>
              <button class="btn" data-action="open-settings">Einstellungen</button>
              <button class="btn ghost" data-action="to-menu">Neues Spiel (Hauptmenü)</button>
            </div>
          </div>
        </section>
        <section class="screen" id="screen-gameover">
          <div class="panel menu-panel small">
            <h2 class="go-title"></h2>
            <p class="go-reason"></p>
            <div class="go-stats"></div>
            <div class="menu-buttons">
              <button class="btn primary" data-action="rematch">Revanche</button>
              <button class="btn ghost" data-action="to-menu">Hauptmenü</button>
            </div>
          </div>
        </section>
        <section class="screen" id="screen-help">
          <div class="panel help-panel">
            <h2>Steuerung</h2>
            <table class="controls-table">${controls}</table>
            <h2>Regeln (vereinfachtes 8-Ball)</h2>
            <ul class="rules">${rules}</ul>
            <button class="btn primary" data-action="back">Zurück</button>
          </div>
        </section>
        <section class="screen" id="screen-settings">
          <div class="panel menu-panel small">
            <h2>Einstellungen</h2>
            <label class="setting">Lautstärke
              <input type="range" min="0" max="100" step="1" data-setting="volume">
              <output class="volume-out"></output>
            </label>
            <label class="setting check"><input type="checkbox" data-setting="muted"> Stummschalten</label>
            <label class="setting check"><input type="checkbox" data-setting="trainingAimHelp"> Anschlussrichtungen im Training anzeigen</label>
            <label class="setting check"><input type="checkbox" data-setting="showControlsHint"> Steuerungshinweise einblenden</label>
            <p class="note">Einstellungen werden lokal im Browser gespeichert.</p>
            <button class="btn primary" data-action="back">Zurück</button>
          </div>
        </section>
      </div>`;
  }

  private applySettingsToControls(): void {
    const s = this.settings;
    const vol = this.root.querySelector('[data-setting="volume"]') as HTMLInputElement;
    vol.value = String(Math.round(s.volume * 100));
    (this.root.querySelector('.volume-out') as HTMLElement).textContent = `${vol.value} %`;
    (this.root.querySelector('[data-setting="muted"]') as HTMLInputElement).checked = s.muted;
    (this.root.querySelector('[data-setting="trainingAimHelp"]') as HTMLInputElement).checked = s.trainingAimHelp;
    (this.root.querySelector('[data-setting="showControlsHint"]') as HTMLInputElement).checked = s.showControlsHint;
    this.muteBtn.innerHTML = s.muted ? ICONS.muted : ICONS.sound;
    this.muteBtn.classList.toggle('active', s.muted);
    this.hint.classList.toggle('hidden', !s.showControlsHint);
    for (const d of ['easy', 'medium'] as const) {
      const b = this.root.querySelector(`[data-action="diff-${d}"]`) as HTMLElement;
      b.classList.toggle('selected', this.difficulty === d);
      b.setAttribute('aria-checked', String(this.difficulty === d));
    }
  }

  private onInput(e: Event): void {
    const t = e.target as HTMLInputElement;
    const key = t.dataset.setting;
    if (!key) return;
    if (key === 'volume') {
      this.settings.volume = Number(t.value) / 100;
      this.audio.setVolume(this.settings.volume);
      (this.root.querySelector('.volume-out') as HTMLElement).textContent = `${t.value} %`;
    } else if (key === 'muted') {
      this.settings.muted = t.checked;
      this.audio.setMuted(t.checked);
    } else if (key === 'trainingAimHelp') {
      this.settings.trainingAimHelp = t.checked;
    } else if (key === 'showControlsHint') {
      this.settings.showControlsHint = t.checked;
    }
    this.applySettingsToControls();
    this.callbacks.settingsChanged(this.settings);
  }

  private onClick(e: MouseEvent): void {
    const btn = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
    if (!btn) return;
    this.audio.unlock();
    const action = btn.dataset.action;
    const s = this.session;
    switch (action) {
      case 'start-training':
        this.start('training');
        break;
      case 'start-two':
        this.start('twoPlayer');
        break;
      case 'start-ai':
        this.start('vsComputer');
        break;
      case 'diff-easy':
      case 'diff-medium':
        this.difficulty = action === 'diff-easy' ? 'easy' : 'medium';
        this.settings.lastDifficulty = this.difficulty;
        this.callbacks.settingsChanged(this.settings);
        this.applySettingsToControls();
        break;
      case 'open-help':
        this.sub = 'help';
        break;
      case 'open-settings':
        this.sub = 'settings';
        break;
      case 'back':
        this.sub = null;
        break;
      case 'resume':
        s.resume();
        break;
      case 'restart':
        this.sub = null;
        s.restart();
        this.callbacks.resetCamera();
        break;
      case 'rematch':
        s.restart({ alternateBreaker: true });
        this.callbacks.resetCamera();
        break;
      case 'to-menu':
        this.sub = null;
        s.quitToMenu();
        s.prepareShowcase();
        break;
      case 'pause':
        if (s.state === 'paused') s.resume();
        else s.pause();
        break;
      case 'mute':
        this.toggleMute();
        break;
      case 'view':
        this.toggleView();
        break;
      case 'help-toggle':
        this.toggleHint();
        break;
      case 'train-place':
        s.requestCueReposition();
        break;
      case 'train-rerack':
        if (s.mode === 'training' && s.state !== 'rolling' && s.state !== 'striking') s.restart();
        break;
    }
    // Fokus lösen, damit Leertaste/Enter keine versteckten Buttons auslösen
    (document.activeElement as HTMLElement | null)?.blur?.();
    this.renderStatic();
  }

  private start(mode: GameMode): void {
    this.sub = null;
    this.session.startGame(mode, this.difficulty);
    this.callbacks.resetCamera();
  }

  // ---------------------------------------------------------------------------
  // Öffentliche Aktionen (auch per Tastatur)

  toggleMute(): void {
    this.audio.unlock();
    this.settings.muted = !this.settings.muted;
    this.audio.setMuted(this.settings.muted);
    this.applySettingsToControls();
    this.callbacks.settingsChanged(this.settings);
    this.toast(this.settings.muted ? 'Ton aus' : 'Ton an', 'info');
  }

  toggleView(): void {
    const mode = this.callbacks.toggleView();
    this.viewBtn.classList.toggle('active', mode === 'top');
    this.toast(mode === 'top' ? 'Draufsicht' : 'Perspektivansicht', 'info');
  }

  toggleHint(): void {
    this.settings.showControlsHint = !this.settings.showControlsHint;
    this.applySettingsToControls();
    this.callbacks.settingsChanged(this.settings);
  }

  /** Schließt ein Unterfenster (Hilfe/Einstellungen). Liefert true, wenn etwas geschlossen wurde. */
  closeSubScreen(): boolean {
    if (!this.sub) return false;
    this.sub = null;
    this.renderStatic();
    return true;
  }

  /** Ist ein Menü geöffnet, das Spieleingaben blockiert? */
  isMenuOpen(): boolean {
    const st = this.session.state;
    return this.sub !== null || st === 'menu' || st === 'paused' || st === 'gameOver';
  }

  // ---------------------------------------------------------------------------
  // Darstellung

  private showGameOver(winner: PlayerIndex, shooter: PlayerIndex, reason: 'eightPocketed' | 'eightEarly' | 'eightWithFoul'): void {
    const s = this.session;
    const names = s.players;
    let title: string;
    if (s.mode === 'vsComputer') title = winner === 0 ? 'Du hast gewonnen!' : 'Der Computer gewinnt.';
    else title = `${names[winner].name} gewinnt!`;
    this.gameOverInfo = { title, reason: reasonText(reason, names[shooter].name) };
    this.audio.playGameEnd(s.mode !== 'vsComputer' || winner === 0);
    this.renderStatic();
  }

  /** Menüs/Overlays passend zum Spielzustand ein-/ausblenden. */
  private renderStatic(): void {
    const st = this.session.state;
    const show = (el: HTMLElement, on: boolean) => el.classList.toggle('visible', on);
    const base = st === 'menu' ? 'main' : st === 'paused' ? 'pause' : st === 'gameOver' ? 'gameover' : null;
    const sub = base ? this.sub : null;
    show(this.mainMenu, base === 'main' && !sub);
    show(this.pauseMenu, base === 'pause' && !sub);
    show(this.gameOverScreen, base === 'gameover' && !sub);
    show(this.helpScreen, sub === 'help');
    show(this.settingsScreen, sub === 'settings');
    this.screens.classList.toggle('active', base !== null);
    this.hud.classList.toggle('hidden', st === 'menu');
    this.trainingBar.classList.toggle('hidden', this.session.mode !== 'training' || st === 'menu');

    if (base === 'gameover' && this.gameOverInfo) {
      const s = this.session;
      (this.gameOverScreen.querySelector('.go-title') as HTMLElement).textContent = this.gameOverInfo.title;
      (this.gameOverScreen.querySelector('.go-reason') as HTMLElement).textContent = this.gameOverInfo.reason;
      (this.gameOverScreen.querySelector('.go-stats') as HTMLElement).innerHTML = `
        <table><tr><th></th><th>Stöße</th><th>Fouls</th></tr>
        ${[0, 1]
          .map((i) => `<tr><td>${s.players[i].name}</td><td>${s.stats.shots[i]}</td><td>${s.stats.fouls[i]}</td></tr>`)
          .join('')}</table>`;
    }
  }

  private toast(text: string, tone: MessageTone): void {
    const el = document.createElement('div');
    el.className = `toast ${tone}`;
    el.textContent = text;
    this.toastBox.appendChild(el);
    this.toasts.push({ el, ttl: tone === 'foul' ? 4.2 : 3.2 });
    while (this.toasts.length > 4) this.removeToast(0);
  }

  private removeToast(index: number): void {
    const [t] = this.toasts.splice(index, 1);
    t.el.remove();
  }

  private clearToasts(): void {
    while (this.toasts.length) this.removeToast(0);
  }

  /** Pro Frame: HUD, Status, Stärkeanzeige, Meldungen. */
  update(dt: number): void {
    const s = this.session;
    // Menüs an den Zustand anpassen (Zustandswechsel kommen auch aus der Logik)
    const stateKey = `${s.state}|${this.sub}`;
    if (stateKey !== this.lastStateKey) {
      this.lastStateKey = stateKey;
      this.renderStatic();
    }

    for (let i = this.toasts.length - 1; i >= 0; i--) {
      const t = this.toasts[i];
      t.ttl -= dt;
      t.el.classList.toggle('fading', t.ttl < 0.4);
      if (t.ttl <= 0) this.removeToast(i);
    }
    if (s.state === 'menu') return;

    const st = s.displayState;
    const status = statusText(s.state === 'paused' ? 'paused' : st, {
      kitchenOnly: s.kitchenOnly,
      aiTurn: s.isAiTurn(),
      canReposition: s.canRepositionCue,
      training: s.mode === 'training',
    });
    if (status !== this.lastStatus) {
      this.lastStatus = status;
      this.status.textContent = status;
    }

    const charging = st === 'charging' || st === 'striking';
    const p = st === 'striking' ? s.strikePower : s.power;
    this.power.classList.toggle('visible', charging);
    if (charging) {
      this.powerFill.style.transform = `scaleY(${p.toFixed(3)})`;
      this.powerFill.style.setProperty('--hue', String(Math.round(130 - p * 125)));
      this.powerLabel.textContent = `${Math.round(p * 100)} %`;
    }

    this.renderHud();
  }

  private lastStateKey = '';

  private renderHud(): void {
    const s = this.session;
    const onTable = s.world.balls.filter((b) => b.onTable && b.id !== CUE_BALL).map((b) => b.id);
    this.pocketedOrder = this.pocketedOrder.filter((id) => !onTable.includes(id));
    const sig = [
      s.mode,
      s.currentPlayer,
      s.rules.groups.join(','),
      onTable.join(','),
      this.pocketedOrder.join(','),
      s.displayState,
      s.canRepositionCue,
      s.training.shots,
      s.training.pocketed,
      s.training.racks,
    ].join('|');
    if (sig === this.hudSignature) return;
    this.hudSignature = sig;

    if (s.mode === 'training') {
      this.players.innerHTML = `
        <div class="player-card active training">
          <div class="pc-name">Training</div>
          <div class="pc-stats">Stöße <b>${s.training.shots}</b> · Versenkt <b>${s.training.pocketed}</b> · Dreieck <b>${s.training.racks}</b></div>
        </div>`;
    } else {
      this.players.innerHTML = [0, 1].map((i) => this.playerCard(i as PlayerIndex, onTable)).join('');
    }
    this.tray.innerHTML =
      this.pocketedOrder.length > 0
        ? `<span class="tray-label">Versenkt</span>${this.pocketedOrder.map((id) => miniBall(id)).join('')}`
        : '';
  }

  private playerCard(i: PlayerIndex, onTable: number[]): string {
    const s = this.session;
    const p = s.players[i];
    const active = s.currentPlayer === i;
    const group = s.rules.groups[i];
    let badge = '<span class="badge open">Offener Tisch</span>';
    let balls = '';
    if (group) {
      badge = `<span class="badge ${group}">${GROUP_LABEL[group]}</span>`;
      balls = ballsOfGroup(group)
        .map((id) => miniBall(id, onTable.includes(id) ? '' : 'gone'))
        .join('');
      const eightReady = isOnEight(s.rules, i);
      balls += miniBall(EIGHT_BALL, eightReady ? 'target' : 'dim');
    }
    const turnInfo = active
      ? s.canRepositionCue && s.displayState !== 'rolling'
        ? '<span class="pc-turn">Ball in Hand</span>'
        : '<span class="pc-turn">am Zug</span>'
      : '';
    return `
      <div class="player-card ${active ? 'active' : ''} ${i === 1 ? 'right' : ''}">
        <div class="pc-head"><span class="pc-name">${p.name}</span>${turnInfo}</div>
        <div class="pc-group">${badge}</div>
        <div class="pc-balls">${balls}</div>
      </div>`;
  }
}
