import './ui/styles.css';
import { AudioEngine } from './audio/audioEngine';
import { GameSession } from './game/gameSession';
import { InputManager } from './input/inputManager';
import { SceneRenderer } from './render/sceneRenderer';
import { loadSettings, saveSettings } from './storage/settings';
import { GameUI } from './ui/ui';

/**
 * Einstiegspunkt: verbindet Spiellogik (GameSession), Darstellung (SceneRenderer),
 * Oberfläche (GameUI), Eingaben (InputManager) und Audio (AudioEngine).
 */

function showFatal(root: HTMLElement, message: string): void {
  root.innerHTML = `<div class="fatal"><div class="panel"><h2>Pool Lounge 3D kann nicht starten</h2><p>${message}</p></div></div>`;
}

function main(): void {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  const uiRoot = document.getElementById('ui-root');
  if (!canvas || !uiRoot) return;

  const settings = loadSettings();
  const session = new GameSession();
  const audio = new AudioEngine();
  audio.setVolume(settings.volume);
  audio.setMuted(settings.muted);

  // ?quality=low: geringere Auflösung, keine Schatten (für schwache Grafikhardware)
  const params = new URLSearchParams(window.location.search);
  const quality = params.get('quality') === 'low' ? 'low' : 'high';

  let renderer: SceneRenderer;
  try {
    renderer = new SceneRenderer(canvas, session, quality);
  } catch (err) {
    console.error(err);
    showFatal(
      uiRoot,
      'WebGL ist in diesem Browser nicht verfügbar oder deaktiviert. Bitte einen aktuellen Browser (Chrome, Edge, Firefox) verwenden und die Hardwarebeschleunigung aktivieren.',
    );
    return;
  }

  const ui = new GameUI(uiRoot, session, audio, settings, {
    toggleView: () => renderer.cameraCtl.toggleView(),
    resetCamera: () => renderer.cameraCtl.reset(),
    settingsChanged: (s) => saveSettings(s),
  });
  const input = new InputManager(canvas, session, renderer, ui, audio);

  // Sounds zu Spielereignissen
  session.on((e) => {
    if (e.type === 'physics') {
      const ev = e.event;
      if (ev.type === 'ballBall') audio.playBallClick(ev.speed);
      else if (ev.type === 'cushion') audio.playCushion(ev.speed);
      else if (ev.type === 'pocket') audio.playPocket();
    } else if (e.type === 'shot') {
      audio.playCueHit(e.power);
    } else if (e.type === 'stateChanged' && e.state === 'aiming' && e.previous !== 'charging') {
      input.refreshAim();
    }
  });

  session.prepareShowcase();

  window.addEventListener('resize', () => renderer.resize());

  // Debug-Zugriff nur auf ausdrücklichen Wunsch (?debug), z. B. für automatisierte Tests
  if (params.has('debug')) {
    (window as unknown as Record<string, unknown>).__poolLounge = { session, renderer };
  }

  let last = performance.now();
  const frame = (now: number) => {
    // Zeitdelta begrenzen (Tabwechsel, Haltepunkte): Physik holt keine großen Sprünge nach
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    session.update(dt);
    renderer.render(dt, { trainingAimHelp: settings.trainingAimHelp });
    ui.update(dt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

main();
