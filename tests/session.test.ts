import { describe, expect, it } from 'vitest';
import type { AiPlanner } from '../src/ai/types';
import { GameSession } from '../src/game/gameSession';
import { validatePlacement } from '../src/game/placement';
import type { SessionEvent, SessionState } from '../src/game/types';

const FRAME = 1 / 60;

function tick(session: GameSession, seconds: number) {
  const n = Math.round(seconds / FRAME);
  for (let i = 0; i < n; i++) session.update(FRAME);
}

function waitWhile(session: GameSession, states: SessionState[], maxSeconds = 60) {
  let t = 0;
  while (states.includes(session.state) && t < maxSeconds) {
    session.update(FRAME);
    t += FRAME;
  }
}

/** Stößt als Mensch: zielen, aufladen, loslassen. */
function humanShot(session: GameSession, dir: { x: number; y: number }, hold = 0.6) {
  expect(session.setAimDirection(dir)).toBe(true);
  expect(session.beginCharge()).toBe(true);
  tick(session, hold);
  expect(session.releaseCharge()).toBe(true);
  waitWhile(session, ['striking']);
}

function startTraining(): GameSession {
  const s = new GameSession({ seed: 42 });
  s.startGame('training');
  expect(s.state).toBe('ballInHand');
  expect(s.tryPlaceCueBall()).toBe(true);
  expect(s.state).toBe('aiming');
  return s;
}

describe('Zustandsautomat', () => {
  it('startet im Menü und wechselt über Ball in Hand zum Zielen', () => {
    const s = new GameSession({ seed: 1 });
    expect(s.state).toBe('menu');
    s.startGame('twoPlayer');
    expect(s.state).toBe('ballInHand');
    expect(s.kitchenOnly).toBe(true);
    expect(s.tryPlaceCueBall()).toBe(true);
    expect(s.state).toBe('aiming');
  });

  it('verhindert einen zweiten Stoß, solange Kugeln rollen', () => {
    const s = startTraining();
    humanShot(s, { x: 1, y: 0 });
    expect(s.state).toBe('rolling');
    const cue = s.world.balls[0];
    tick(s, 0.05);
    const vx = cue.vx;
    const vy = cue.vy;
    // Alle Stoß-Eingaben werden abgewiesen
    expect(s.beginCharge()).toBe(false);
    expect(s.releaseCharge()).toBe(false);
    expect(s.setAimDirection({ x: 0, y: 1 })).toBe(false);
    expect(s.requestCueReposition()).toBe(false);
    expect(s.state).toBe('rolling');
    expect(cue.vx).toBe(vx);
    expect(cue.vy).toBe(vy);
  });

  it('wertet jeden Stoß genau einmal aus – erst nach Stillstand und Einsinken', () => {
    const s = startTraining();
    const events: SessionEvent[] = [];
    s.on((e) => events.push(e));
    humanShot(s, { x: 1, y: 0.01 }, 1.2);
    expect(s.evaluationCount).toBe(0);
    waitWhile(s, ['rolling', 'evaluating']);
    expect(s.world.isSettled()).toBe(true);
    expect(s.world.sinking).toHaveLength(0);
    expect(s.evaluationCount).toBe(1);
    expect(events.filter((e) => e.type === 'trainingEvaluated')).toHaveLength(1);
    // Weitere Frames lösen keine erneute Auswertung aus
    tick(s, 2);
    expect(s.evaluationCount).toBe(1);
    expect(['aiming', 'ballInHand']).toContain(s.state);
  });

  it('kurzer Klick löst keinen Stoß aus, Abbruch der Aufladung funktioniert', () => {
    const s = startTraining();
    expect(s.beginCharge()).toBe(true);
    s.update(0.02);
    expect(s.releaseCharge()).toBe(false);
    expect(s.state).toBe('aiming');
    expect(s.world.isMoving()).toBe(false);

    expect(s.beginCharge()).toBe(true);
    tick(s, 0.5);
    expect(s.power).toBeGreaterThan(0.2);
    expect(s.cancelCharge()).toBe(true);
    expect(s.state).toBe('aiming');
    expect(s.power).toBe(0);
    expect(s.world.isMoving()).toBe(false);
  });

  it('Stoßstärke wächst mit der Haltedauer bis zum Maximum', () => {
    const s = startTraining();
    s.beginCharge();
    tick(s, 0.3);
    const p1 = s.power;
    tick(s, 0.3);
    expect(s.power).toBeGreaterThan(p1);
    tick(s, 3);
    expect(s.power).toBe(1);
  });

  it('Pause friert die Simulation ein und setzt sie unverändert fort', () => {
    const s = startTraining();
    humanShot(s, { x: 1, y: 0 });
    tick(s, 0.1);
    expect(s.pause()).toBe(true);
    expect(s.state).toBe('paused');
    const x = s.world.balls[0].x;
    tick(s, 1);
    expect(s.world.balls[0].x).toBe(x);
    expect(s.resume()).toBe(true);
    expect(s.state).toBe('rolling');
  });

  it('Pause während der Aufladung bricht die Aufladung sicher ab', () => {
    const s = startTraining();
    s.beginCharge();
    tick(s, 0.4);
    s.pause();
    s.resume();
    expect(s.state).toBe('aiming');
    expect(s.power).toBe(0);
  });
});

describe('Ball in Hand / Platzierung', () => {
  it('ungültige Positionen werden abgelehnt: Überlappung, außerhalb, Tasche, außerhalb Anstoßraum', () => {
    const s = new GameSession({ seed: 3 });
    s.startGame('twoPlayer');
    const g = s.geometry;
    const R = s.world.ballRadius;
    const someBall = s.world.balls[5];
    expect(validatePlacement(s.world, { x: someBall.x + R, y: someBall.y }, { kitchenOnly: false, ignoreId: 0 }).problem).toBe(
      'overlap',
    );
    expect(s.placementValidity({ x: g.halfLength + 0.1, y: 0 }).valid).toBe(false);
    expect(s.placementValidity({ x: -g.halfLength + R * 0.5, y: 0 }).problem).toBe('outside');
    expect(s.placementValidity({ x: g.pockets[0].x + 0.04, y: g.pockets[0].y + 0.04 }).valid).toBe(false);
    expect(s.placementValidity({ x: 0.2, y: 0 }).problem).toBe('kitchen');
    expect(s.placementValidity({ x: g.headStringX - 0.1, y: 0.1 }).valid).toBe(true);
    // tryPlaceCueBall klemmt auf die erlaubte Fläche und prüft Überlappungen
    expect(s.tryPlaceCueBall({ x: g.headStringX - 0.1, y: 0.1 })).toBe(true);
  });

  it('Scratch im Training führt zu freier Neuplatzierung', () => {
    const s = new GameSession({ seed: 5 });
    s.startGame('training');
    const g = s.geometry;
    // Weiße nahe der Ecktasche, direkt hinein
    s.tryPlaceCueBall({ x: -g.halfLength + 0.25, y: -g.halfWidth + 0.25 });
    humanShot(s, { x: -1, y: -1 }, 0.5);
    waitWhile(s, ['rolling', 'evaluating']);
    expect(s.state).toBe('ballInHand');
    expect(s.kitchenOnly).toBe(false);
    expect(s.world.balls[0].onTable).toBe(false);
  });

  it('Training: Weiße kann bei ruhendem Tisch jederzeit neu platziert werden', () => {
    const s = startTraining();
    humanShot(s, { x: 1, y: 0 }, 0.3);
    waitWhile(s, ['rolling', 'evaluating']);
    expect(s.state).toBe('aiming');
    expect(s.requestCueReposition()).toBe(true);
    expect(s.state).toBe('ballInHand');
  });

  it('8-Ball: ohne Ball in Hand darf die Weiße nicht versetzt werden', () => {
    const s = new GameSession({ seed: 9 });
    s.startGame('twoPlayer');
    s.tryPlaceCueBall();
    expect(s.requestCueReposition()).toBe(true); // vor dem Anstoß erlaubt
    s.tryPlaceCueBall();
    humanShot(s, { x: 1, y: 0 }, 1.0);
    waitWhile(s, ['rolling', 'evaluating']);
    if (s.state === 'aiming') {
      expect(s.requestCueReposition()).toBe(false);
    }
  });
});

describe('Computerzug', () => {
  /** Planer, der immer mittelstark nach rechts stößt (für deterministische Tests). */
  const straightPlanner: AiPlanner = (input) => ({
    placement: input.ballInHand ? { x: input.world.geometry.headStringX - 0.1, y: 0 } : null,
    direction: { x: 1, y: 0 },
    power: 0.4,
    kind: 'fallback',
    targetBall: null,
    pocket: null,
  });

  it('während des KI-Zugs sind menschliche Eingaben gesperrt', () => {
    const s = new GameSession({ seed: 11, planner: straightPlanner });
    s.startGame('vsComputer', 'easy');
    // Menschlicher Anstoß mit sehr wenig Kraft → nichts versenkt → Computer ist am Zug
    s.tryPlaceCueBall();
    humanShot(s, { x: 1, y: 0 }, 0.15);
    waitWhile(s, ['rolling', 'evaluating']);
    expect(s.currentPlayer).toBe(1);
    expect(s.isAiTurn()).toBe(true);
    const seen = new Set<SessionState>();
    for (let i = 0; i < 600 && s.state !== 'rolling'; i++) {
      seen.add(s.state);
      const aimBefore = { ...s.aimDirection };
      expect(s.beginCharge()).toBe(false);
      expect(s.releaseCharge()).toBe(false);
      expect(s.cancelCharge()).toBe(false);
      expect(s.tryPlaceCueBall({ x: -0.8, y: 0.2 })).toBe(false);
      expect(s.requestCueReposition()).toBe(false);
      if (s.state === 'aiming' || s.state === 'aiThinking') {
        expect(s.setAimDirection({ x: 0, y: 1 })).toBe(false);
        expect(s.aimDirection).toEqual(aimBefore);
      }
      s.update(FRAME);
    }
    // Der Computer durchläuft dieselben Zustände wie ein Mensch und stößt tatsächlich
    expect(seen.has('aiThinking')).toBe(true);
    expect(seen.has('aiming')).toBe(true);
    expect(seen.has('charging')).toBe(true);
    expect(seen.has('striking')).toBe(true);
    expect(s.state).toBe('rolling');
    expect(s.stats.shots[1]).toBe(1);
  });

  it('Computer spielt eine komplette Partie gegen sich selbst ohne Absturz (Planer: echte KI)', () => {
    const s = new GameSession({ seed: 21 });
    s.startGame('vsComputer', 'medium');
    // Menschlicher Spieler 0 wird für diesen Test ebenfalls vom Computer gesteuert
    s.players[0].controller = 'ai';
    // Der Anstoß wurde bereits für einen Menschen gestartet → neu starten, damit der Computer beginnt
    s.restart();
    let t = 0;
    while (s.state !== 'gameOver' && t < 900) {
      s.update(1 / 30);
      t += 1 / 30;
    }
    expect(s.stats.shots[0] + s.stats.shots[1]).toBeGreaterThan(5);
    // Konsistenz: Regelzustand und Physik stimmen überein
    for (let id = 1; id <= 15; id++) {
      expect(s.rules.onTable.includes(id)).toBe(s.world.balls[id].onTable);
    }
  }, 120000);
});
