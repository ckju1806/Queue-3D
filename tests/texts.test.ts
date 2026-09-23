import { describe, expect, it } from 'vitest';
import type { ShotOutcome } from '../src/game/rules';
import { breakText, outcomeMessages, reasonText, type Who } from '../src/ui/texts';

const you: Who = { name: 'Du', you: true };
const cpu: Who = { name: 'Computer (Mittel)', you: false };

function outcome(partial: Partial<ShotOutcome>): ShotOutcome {
  return {
    wasBreak: false,
    shooter: 1,
    fouls: [],
    pocketed: [],
    continueTurn: false,
    nextPlayer: 0,
    ballInHand: false,
    respotEight: false,
    assignedGroup: null,
    gameOver: null,
    ...partial,
  };
}

describe('Meldungstexte (Deutsch)', () => {
  it('sprechen den menschlichen Spieler grammatisch korrekt mit „Du“ an', () => {
    const texts = [
      ...outcomeMessages(outcome({}), [you, cpu], false),
      ...outcomeMessages(outcome({ fouls: ['scratch'], ballInHand: true }), [you, cpu], false),
      ...outcomeMessages(outcome({ shooter: 0, continueTurn: true, nextPlayer: 0, pocketed: [3], assignedGroup: 'solids' }), [you, cpu], false),
    ].map((m) => m.text);
    expect(texts).toContain('Spielerwechsel: Du bist am Zug.');
    expect(texts).toContain('Ball in Hand für dich.');
    expect(texts).toContain('Du spielst die vollen Kugeln (1–7).');
    expect(texts).toContain('Du bleibst am Zug.');
    expect(texts.join(' ')).not.toMatch(/Du (ist|hat|bleibt|spielt)\b|für Du/);
    expect(reasonText('eightEarly', you)).toBe('Du hast die schwarze 8 zu früh versenkt.');
    expect(breakText(you)).toBe('Du hast den Anstoß.');
  });

  it('verwenden bei anderen Spielern die dritte Person', () => {
    const texts = outcomeMessages(outcome({ shooter: 0, nextPlayer: 1 }), [{ name: 'Spieler 1', you: false }, { name: 'Spieler 2', you: false }], false).map((m) => m.text);
    expect(texts).toContain('Spielerwechsel: Spieler 2 ist am Zug.');
    expect(reasonText('eightPocketed', cpu)).toBe('Computer (Mittel) hat die schwarze 8 regelgerecht versenkt.');
  });
});
