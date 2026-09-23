import { describe, expect, it } from 'vitest';
import {
  createInitialRulesState,
  evaluateShot,
  isOnEight,
  legalTargets,
  type RulesState,
} from '../src/game/rules';
import { emptyShotRecord, type ShotRecord } from '../src/game/shotRecorder';

function shot(partial: Partial<ShotRecord>): ShotRecord {
  return { ...emptyShotRecord(), ...partial };
}

/** Zustand nach dem Anstoß mit offenem Tisch. */
function openTable(player: 0 | 1 = 0): RulesState {
  return { ...createInitialRulesState(player), isBreak: false };
}

/** Zustand mit zugeordneten Gruppen: Spieler 0 = Volle, Spieler 1 = Halbe. */
function assigned(player: 0 | 1 = 0, onTable?: number[]): RulesState {
  return {
    ...openTable(player),
    groups: ['solids', 'stripes'],
    onTable: onTable ?? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  };
}

describe('Anstoß', () => {
  it('versenkte Objektkugel beim Anstoß: Spieler bleibt am Zug, Tisch bleibt offen', () => {
    const r = evaluateShot(createInitialRulesState(0), shot({ firstContact: 1, pocketed: [3, 11] }));
    expect(r.outcome.fouls).toEqual([]);
    expect(r.outcome.continueTurn).toBe(true);
    expect(r.state.currentPlayer).toBe(0);
    expect(r.state.groups).toEqual([null, null]);
    expect(r.state.isBreak).toBe(false);
    expect(r.state.onTable).not.toContain(3);
    expect(r.state.onTable).not.toContain(11);
  });

  it('keine Kugel versenkt: Zugwechsel ohne Ball in Hand', () => {
    const r = evaluateShot(createInitialRulesState(0), shot({ firstContact: 1 }));
    expect(r.outcome.continueTurn).toBe(false);
    expect(r.outcome.nextPlayer).toBe(1);
    expect(r.outcome.ballInHand).toBe(false);
  });

  it('keine Mindestanzahl an Bandenkontakten beim Anstoß', () => {
    const r = evaluateShot(createInitialRulesState(0), shot({ firstContact: 1, cushionAfterContact: false }));
    expect(r.outcome.fouls).toEqual([]);
  });

  it('Weiße beim Anstoß versenkt: Foul, Gegner erhält Ball in Hand', () => {
    const r = evaluateShot(createInitialRulesState(0), shot({ firstContact: 1, pocketed: [0, 5], cueScratched: true }));
    expect(r.outcome.fouls).toContain('scratch');
    expect(r.outcome.continueTurn).toBe(false);
    expect(r.outcome.nextPlayer).toBe(1);
    expect(r.outcome.ballInHand).toBe(true);
  });

  it('keine Objektkugel getroffen beim Anstoß: Foul, Ball in Hand', () => {
    const r = evaluateShot(createInitialRulesState(0), shot({ firstContact: null }));
    expect(r.outcome.fouls).toEqual(['noContact']);
    expect(r.outcome.ballInHand).toBe(true);
    expect(r.outcome.nextPlayer).toBe(1);
  });

  it('schwarze 8 beim Anstoß: wird wieder eingesetzt, weder Sieg noch Niederlage', () => {
    const r = evaluateShot(createInitialRulesState(0), shot({ firstContact: 1, pocketed: [8] }));
    expect(r.outcome.gameOver).toBeNull();
    expect(r.outcome.respotEight).toBe(true);
    expect(r.state.onTable).toContain(8);
    expect(r.state.winner).toBeNull();
    // Annahme A3: 8 zählt als versenkte Objektkugel → Spieler bleibt am Zug
    expect(r.outcome.continueTurn).toBe(true);
  });

  it('schwarze 8 zusammen mit der Weißen beim Anstoß: kein Spielende, aber Foul', () => {
    const r = evaluateShot(createInitialRulesState(0), shot({ firstContact: 1, pocketed: [8, 0], cueScratched: true }));
    expect(r.outcome.gameOver).toBeNull();
    expect(r.outcome.respotEight).toBe(true);
    expect(r.outcome.ballInHand).toBe(true);
    expect(r.outcome.nextPlayer).toBe(1);
  });
});

describe('Gruppenzuordnung', () => {
  it('nur Volle versenkt bei offenem Tisch: Schütze erhält Volle, Gegner Halbe', () => {
    const r = evaluateShot(openTable(1), shot({ firstContact: 2, pocketed: [2], cushionAfterContact: true }));
    expect(r.outcome.assignedGroup).toBe('solids');
    expect(r.state.groups).toEqual(['stripes', 'solids']);
    expect(r.outcome.continueTurn).toBe(true);
    expect(r.state.currentPlayer).toBe(1);
  });

  it('Kugeln beider Gruppen bei offenem Tisch: bleibt offen, Spieler spielt weiter', () => {
    const r = evaluateShot(openTable(0), shot({ firstContact: 2, pocketed: [2, 12] }));
    expect(r.state.groups).toEqual([null, null]);
    expect(r.outcome.continueTurn).toBe(true);
  });

  it('keine Zuordnung nach einem Foul', () => {
    const r = evaluateShot(openTable(0), shot({ firstContact: 2, pocketed: [2, 0], cueScratched: true }));
    expect(r.state.groups).toEqual([null, null]);
    expect(r.outcome.ballInHand).toBe(true);
  });

  it('bei offenem Tisch ist jede Objektkugel außer der 8 erlaubt', () => {
    const targets = legalTargets(openTable(0));
    expect(targets).not.toContain(8);
    expect(targets).toHaveLength(14);
    const r = evaluateShot(openTable(0), shot({ firstContact: 8, cushionAfterContact: true }));
    expect(r.outcome.fouls).toContain('wrongFirstContact');
  });
});

describe('Spielerwechsel', () => {
  it('eigene Kugel versenkt: weiterspielen', () => {
    const r = evaluateShot(assigned(0), shot({ firstContact: 3, pocketed: [3] }));
    expect(r.outcome.continueTurn).toBe(true);
    expect(r.state.currentPlayer).toBe(0);
  });

  it('keine Kugel versenkt: Wechsel', () => {
    const r = evaluateShot(assigned(0), shot({ firstContact: 3, cushionAfterContact: true }));
    expect(r.outcome.fouls).toEqual([]);
    expect(r.outcome.continueTurn).toBe(false);
    expect(r.state.currentPlayer).toBe(1);
    expect(r.outcome.ballInHand).toBe(false);
  });

  it('nur gegnerische Kugel versenkt: bleibt versenkt, aber Wechsel', () => {
    const r = evaluateShot(assigned(0), shot({ firstContact: 3, pocketed: [12] }));
    expect(r.outcome.continueTurn).toBe(false);
    expect(r.state.onTable).not.toContain(12);
    expect(r.state.currentPlayer).toBe(1);
  });

  it('eigene und gegnerische Kugel versenkt: weiterspielen', () => {
    const r = evaluateShot(assigned(0), shot({ firstContact: 3, pocketed: [12, 3] }));
    expect(r.outcome.continueTurn).toBe(true);
  });

  it('Foul hat Vorrang vor dem Anspruch auf Weiterspielen', () => {
    const r = evaluateShot(assigned(0), shot({ firstContact: 3, pocketed: [3, 0], cueScratched: true }));
    expect(r.outcome.continueTurn).toBe(false);
    expect(r.outcome.nextPlayer).toBe(1);
    expect(r.outcome.ballInHand).toBe(true);
    expect(r.state.onTable).not.toContain(3);
  });
});

describe('Fouls und Ball in Hand', () => {
  it('Weiße versenkt', () => {
    const r = evaluateShot(assigned(0), shot({ firstContact: 3, cushionAfterContact: true, pocketed: [0], cueScratched: true }));
    expect(r.outcome.fouls).toEqual(['scratch']);
    expect(r.outcome.ballInHand).toBe(true);
    expect(r.outcome.nextPlayer).toBe(1);
  });

  it('Weiße trifft keine Objektkugel', () => {
    const r = evaluateShot(assigned(0), shot({ firstContact: null }));
    expect(r.outcome.fouls).toEqual(['noContact']);
    expect(r.outcome.ballInHand).toBe(true);
  });

  it('bei festgelegten Gruppen zuerst gegnerische Kugel getroffen', () => {
    const r = evaluateShot(assigned(0), shot({ firstContact: 9, cushionAfterContact: true }));
    expect(r.outcome.fouls).toEqual(['wrongFirstContact']);
    expect(r.outcome.ballInHand).toBe(true);
  });

  it('bei festgelegten Gruppen zuerst die 8 getroffen, obwohl noch eigene Kugeln liegen', () => {
    const r = evaluateShot(assigned(0), shot({ firstContact: 8, cushionAfterContact: true }));
    expect(r.outcome.fouls).toContain('wrongFirstContact');
  });

  it('nach dem Kontakt weder Kugel versenkt noch Bande berührt', () => {
    const r = evaluateShot(assigned(0), shot({ firstContact: 3, cushionAfterContact: false }));
    expect(r.outcome.fouls).toEqual(['noCushion']);
    expect(r.outcome.ballInHand).toBe(true);
  });

  it('versenkte Kugel ersetzt den Bandenkontakt', () => {
    const r = evaluateShot(assigned(0), shot({ firstContact: 3, pocketed: [5], cushionAfterContact: false }));
    expect(r.outcome.fouls).toEqual([]);
  });

  it('mehrere Fouls gleichzeitig werden alle erfasst', () => {
    const r = evaluateShot(assigned(0), shot({ firstContact: 9, pocketed: [0], cueScratched: true }));
    expect(r.outcome.fouls).toEqual(expect.arrayContaining(['scratch', 'wrongFirstContact']));
  });
});

describe('Schwarze 8', () => {
  it('zu früh versenkt (eigene Gruppe noch nicht abgeräumt): Niederlage', () => {
    const r = evaluateShot(assigned(0), shot({ firstContact: 3, pocketed: [8] }));
    expect(r.outcome.gameOver).toEqual({ winner: 1, reason: 'eightEarly' });
    expect(r.state.winner).toBe(1);
  });

  it('zu früh versenkt bei offenem Tisch: Niederlage', () => {
    const r = evaluateShot(openTable(0), shot({ firstContact: 3, pocketed: [3, 8] }));
    expect(r.outcome.gameOver?.winner).toBe(1);
  });

  it('eigene Gruppe erst in diesem Stoß abgeräumt und 8 mitversenkt: Niederlage (Gruppe muss zu Stoßbeginn leer sein)', () => {
    const state = assigned(0, [7, 8, 9, 10]);
    expect(isOnEight(state)).toBe(false);
    const r = evaluateShot(state, shot({ firstContact: 7, pocketed: [7, 8] }));
    expect(r.outcome.gameOver).toEqual({ winner: 1, reason: 'eightEarly' });
  });

  it('korrekt versenkt nach abgeräumter Gruppe: Sieg', () => {
    const state = assigned(0, [8, 9, 10]);
    expect(isOnEight(state)).toBe(true);
    expect(legalTargets(state)).toEqual([8]);
    const r = evaluateShot(state, shot({ firstContact: 8, pocketed: [8] }));
    expect(r.outcome.gameOver).toEqual({ winner: 0, reason: 'eightPocketed' });
    expect(r.state.winner).toBe(0);
  });

  it('zusammen mit einem Foul versenkt (Scratch): Niederlage', () => {
    const state = assigned(0, [8, 9, 10]);
    const r = evaluateShot(state, shot({ firstContact: 8, pocketed: [8, 0], cueScratched: true }));
    expect(r.outcome.gameOver).toEqual({ winner: 1, reason: 'eightWithFoul' });
  });

  it('zusammen mit einem Foul versenkt (falsche Kugel zuerst): Niederlage', () => {
    const state = assigned(1, [8, 9, 10, 3]);
    // Spieler 1 hat Halbe; zuerst die 3 (Volle) getroffen
    const r = evaluateShot({ ...state, onTable: [3, 8] }, shot({ firstContact: 3, pocketed: [8] }));
    expect(r.outcome.gameOver).toEqual({ winner: 0, reason: 'eightWithFoul' });
  });

  it('Spieler auf der 8 spielt legal, verfehlt: normaler Wechsel', () => {
    const state = assigned(0, [8, 9, 10]);
    const r = evaluateShot(state, shot({ firstContact: 8, cushionAfterContact: true }));
    expect(r.outcome.gameOver).toBeNull();
    expect(r.outcome.nextPlayer).toBe(1);
    expect(r.outcome.ballInHand).toBe(false);
  });
});
