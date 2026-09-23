/** Kugel-Definitionen: Nummern, Gruppen und Farben. */

export const CUE_BALL = 0;
export const EIGHT_BALL = 8;

export type BallGroup = 'solids' | 'stripes';
export type BallKind = 'cue' | 'solid' | 'stripe' | 'eight';

export const SOLIDS: readonly number[] = [1, 2, 3, 4, 5, 6, 7];
export const STRIPES: readonly number[] = [9, 10, 11, 12, 13, 14, 15];
export const OBJECT_BALLS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

export function ballKind(id: number): BallKind {
  if (id === CUE_BALL) return 'cue';
  if (id === EIGHT_BALL) return 'eight';
  return id < EIGHT_BALL ? 'solid' : 'stripe';
}

/** Gruppe einer Objektkugel; `null` für Weiße und 8. */
export function groupOf(id: number): BallGroup | null {
  if (id >= 1 && id <= 7) return 'solids';
  if (id >= 9 && id <= 15) return 'stripes';
  return null;
}

export function ballsOfGroup(group: BallGroup): readonly number[] {
  return group === 'solids' ? SOLIDS : STRIPES;
}

export function otherGroup(group: BallGroup): BallGroup {
  return group === 'solids' ? 'stripes' : 'solids';
}

/** Klassische Kugelfarben (1–7, 9–15 wiederholen die Farben). */
const BASE_COLORS: Record<number, string> = {
  1: '#f2c12e', // gelb
  2: '#1f4fb8', // blau
  3: '#d12a2a', // rot
  4: '#5b2c8f', // violett
  5: '#f07c1b', // orange
  6: '#1e7a3a', // grün
  7: '#7a2323', // weinrot
  8: '#141414', // schwarz
};

export function ballColor(id: number): string {
  if (id === CUE_BALL) return '#f6f3ea';
  if (id === EIGHT_BALL) return BASE_COLORS[8];
  return BASE_COLORS[id > 8 ? id - 8 : id];
}
