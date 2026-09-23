import type { TableGeometry } from '../physics/tableGeometry';
import { EIGHT_BALL, SOLIDS, STRIPES } from './balls';
import { type Rng, shuffle } from './random';

export interface RackPosition {
  id: number;
  x: number;
  y: number;
}

/** Spalt zwischen den Kugeln im Dreieck (verhindert Anfangsüberlappungen). */
export const RACK_GAP = 0.0004;

/**
 * Baut das Dreieck für 8-Ball auf:
 * - Spitze auf dem Fußpunkt, Reihen in Richtung Fußbande,
 * - die 8 in der Mitte (3. Reihe, mittlere Kugel),
 * - in den hinteren Ecken je eine volle und eine halbe Kugel,
 * - übrige Kugeln gemischt, mit minimalem Zufallsversatz.
 */
export function createRack(geometry: TableGeometry, radius: number, rng: Rng): RackPosition[] {
  const spacing = 2 * radius + RACK_GAP;
  const rowStep = (spacing * Math.sqrt(3)) / 2;
  const slots: Array<{ row: number; col: number; x: number; y: number }> = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col <= row; col++) {
      slots.push({
        row,
        col,
        x: geometry.footSpot.x + row * rowStep,
        y: geometry.footSpot.y + (col - row / 2) * spacing,
      });
    }
  }

  const assignment = new Map<number, number>(); // slotIndex -> ballId
  const centerIndex = slots.findIndex((s) => s.row === 2 && s.col === 1);
  const cornerA = slots.findIndex((s) => s.row === 4 && s.col === 0);
  const cornerB = slots.findIndex((s) => s.row === 4 && s.col === 4);
  assignment.set(centerIndex, EIGHT_BALL);

  const solids = shuffle([...SOLIDS], rng);
  const stripes = shuffle([...STRIPES], rng);
  const cornerSolid = solids.pop()!;
  const cornerStripe = stripes.pop()!;
  if (rng() < 0.5) {
    assignment.set(cornerA, cornerSolid);
    assignment.set(cornerB, cornerStripe);
  } else {
    assignment.set(cornerA, cornerStripe);
    assignment.set(cornerB, cornerSolid);
  }

  const rest = shuffle([...solids, ...stripes], rng);
  slots.forEach((_, index) => {
    if (!assignment.has(index)) assignment.set(index, rest.pop()!);
  });

  const jitter = RACK_GAP * 0.2;
  return slots.map((slot, index) => ({
    id: assignment.get(index)!,
    x: slot.x + (rng() * 2 - 1) * jitter,
    y: slot.y + (rng() * 2 - 1) * jitter,
  }));
}

/** Standard-Startposition der Weißen im Anstoßraum. */
export function defaultCuePosition(geometry: TableGeometry) {
  return { x: geometry.headStringX - 0.06, y: 0 };
}
