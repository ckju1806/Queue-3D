import type { AudioEngine } from '../audio/audioEngine';
import type { GameSession } from '../game/gameSession';
import type { SceneRenderer } from '../render/sceneRenderer';
import type { GameUI } from '../ui/ui';

const FINE_STEP = (0.1 * Math.PI) / 180;
const COARSE_STEP = (1 * Math.PI) / 180;

/**
 * Maus- und Tastatureingaben mit sauberer Trennung:
 * - Nur Ereignisse direkt auf dem Canvas steuern das Spiel (UI-Elemente liegen darüber).
 * - Linke Maustaste: Aufladen/Stoß bzw. Platzieren. Rechte Maustaste: nur Kamera.
 * - Ein Stoß wird nur ausgelöst, wenn die Aufladung von genau diesem Tastendruck stammt.
 * - Fokusverlust, Tabwechsel oder verlorene Zeigererfassung brechen eine Aufladung ab.
 * Alle Spielaktionen laufen über die Session, die zusätzlich Zustand und Spieler prüft.
 */
export class InputManager {
  private chargePointerId: number | null = null;
  private cameraDrag: { pointerId: number; x: number; y: number } | null = null;
  private lastPointer: { x: number; y: number } | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly session: GameSession,
    private readonly renderer: SceneRenderer,
    private readonly ui: GameUI,
    private readonly audio: AudioEngine,
  ) {
    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    canvas.addEventListener('pointerup', (e) => this.onPointerUp(e));
    canvas.addEventListener('pointercancel', () => this.abortAll());
    canvas.addEventListener('lostpointercapture', (e) => this.onLostCapture(e));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('blur', () => this.abortAll());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.abortAll();
    });
  }

  /** Bricht Aufladung und Kameradrehung sicher ab. */
  abortAll(): void {
    if (this.chargePointerId !== null || this.session.state === 'charging') this.session.cancelCharge();
    this.chargePointerId = null;
    this.cameraDrag = null;
  }

  private onPointerDown(e: PointerEvent): void {
    this.audio.unlock();
    if (this.ui.isMenuOpen()) return;
    const s = this.session;
    if (e.button === 2) {
      // Kamera: bricht eine laufende Aufladung ab, löst nie einen Stoß aus
      if (s.state === 'charging') s.cancelCharge();
      this.chargePointerId = null;
      this.cameraDrag = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
      this.capture(e.pointerId);
      e.preventDefault();
      return;
    }
    if (e.button !== 0 || this.cameraDrag) return;

    if (s.state === 'ballInHand') {
      const p = this.renderer.pickTablePoint(e.clientX, e.clientY);
      if (p) {
        s.updateCuePreview(p);
        s.tryPlaceCueBall(p);
      }
      e.preventDefault();
      return;
    }
    if (s.state === 'aiming') {
      this.aimAt(e.clientX, e.clientY);
      if (s.beginCharge()) {
        this.chargePointerId = e.pointerId;
        this.capture(e.pointerId);
      }
      e.preventDefault();
    }
  }

  private onPointerMove(e: PointerEvent): void {
    this.lastPointer = { x: e.clientX, y: e.clientY };
    if (this.cameraDrag && e.pointerId === this.cameraDrag.pointerId) {
      const dx = e.clientX - this.cameraDrag.x;
      const dy = e.clientY - this.cameraDrag.y;
      this.cameraDrag.x = e.clientX;
      this.cameraDrag.y = e.clientY;
      this.renderer.cameraCtl.rotate(dx, dy);
      return;
    }
    if (this.ui.isMenuOpen()) return;
    const s = this.session;
    if (s.state === 'aiming') this.aimAt(e.clientX, e.clientY);
    else if (s.state === 'ballInHand') {
      const p = this.renderer.pickTablePoint(e.clientX, e.clientY);
      if (p) s.updateCuePreview(p);
    }
  }

  private onPointerUp(e: PointerEvent): void {
    if (this.cameraDrag && e.pointerId === this.cameraDrag.pointerId && e.button === 2) {
      this.cameraDrag = null;
      this.release(e.pointerId);
      return;
    }
    if (e.button === 0 && this.chargePointerId !== null && e.pointerId === this.chargePointerId) {
      this.chargePointerId = null;
      this.release(e.pointerId);
      this.session.releaseCharge();
    }
  }

  private onLostCapture(e: PointerEvent): void {
    if (this.chargePointerId !== null && e.pointerId === this.chargePointerId) {
      // Zeigererfassung verloren (z. B. Fensterwechsel) → sicher abbrechen
      this.chargePointerId = null;
      this.session.cancelCharge();
    }
    if (this.cameraDrag && e.pointerId === this.cameraDrag.pointerId) this.cameraDrag = null;
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    if (this.session.state === 'menu') return;
    const delta = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
    this.renderer.cameraCtl.zoom(delta);
  }

  private onKeyDown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
    if (e.repeat && !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    this.audio.unlock();
    const s = this.session;
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        if (s.state === 'charging' && s.isHumanTurn()) {
          this.chargePointerId = null;
          s.cancelCharge();
        } else if (this.ui.closeSubScreen()) {
          // Unterfenster geschlossen
        } else if (s.state === 'paused') {
          s.resume();
        } else if (s.canPause()) {
          s.pause();
        }
        return;
      case 'v':
      case 'V':
        if (s.state !== 'menu') this.ui.toggleView();
        return;
      case 'r':
      case 'R':
        this.renderer.cameraCtl.reset();
        return;
      case 'b':
      case 'B':
        if (!this.ui.isMenuOpen()) s.requestCueReposition();
        return;
      case 'm':
      case 'M':
        this.ui.toggleMute();
        return;
      case 'h':
      case 'H':
        this.ui.toggleHint();
        return;
      case 'ArrowLeft':
      case 'ArrowRight': {
        if (this.ui.isMenuOpen()) return;
        const step = e.shiftKey ? COARSE_STEP : FINE_STEP;
        // Pfeil rechts dreht im Bild im Uhrzeigersinn (Tisch-y zeigt zur Kamera)
        s.nudgeAim(e.key === 'ArrowLeft' ? step : -step);
        e.preventDefault();
        return;
      }
      default:
        return;
    }
  }

  private aimAt(clientX: number, clientY: number): void {
    const s = this.session;
    const cue = s.world.balls[0];
    if (!cue.onTable) return;
    const p = this.renderer.pickTablePoint(clientX, clientY);
    if (!p) return;
    const dx = p.x - cue.x;
    const dy = p.y - cue.y;
    if (Math.hypot(dx, dy) < s.world.ballRadius * 0.6) return; // Maus direkt auf der Weißen: Richtung beibehalten
    s.setAimDirection({ x: dx, y: dy });
  }

  /** Nach dem Stoß die Zielrichtung sofort wieder an die Mausposition koppeln. */
  refreshAim(): void {
    if (this.lastPointer && this.session.state === 'aiming' && !this.ui.isMenuOpen()) {
      this.aimAt(this.lastPointer.x, this.lastPointer.y);
    }
  }

  private capture(pointerId: number): void {
    try {
      this.canvas.setPointerCapture(pointerId);
    } catch {
      // Zeigererfassung nicht verfügbar – Aufladung funktioniert trotzdem
    }
  }

  private release(pointerId: number): void {
    try {
      if (this.canvas.hasPointerCapture(pointerId)) this.canvas.releasePointerCapture(pointerId);
    } catch {
      // ignorieren
    }
  }
}
