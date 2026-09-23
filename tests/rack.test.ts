import { describe, expect, it } from 'vitest';
import { groupOf } from '../src/game/balls';
import { createRack } from '../src/game/rack';
import { createRng } from '../src/game/random';
import { makeWorld, R } from './helpers';

describe('Dreieck-Aufbau', () => {
  it('15 Kugeln, 8 in der Mitte, hintere Ecken: je eine volle und eine halbe, keine Überlappung', () => {
    const { world } = makeWorld();
    for (let seed = 1; seed <= 20; seed++) {
      const rack = createRack(world.geometry, R, createRng(seed));
      expect(rack).toHaveLength(15);
      expect(new Set(rack.map((r) => r.id)).size).toBe(15);
      const byX = [...rack].sort((a, b) => a.x - b.x);
      const apexX = byX[0].x;
      const rowStep = ((2 * R + 0.0004) * Math.sqrt(3)) / 2;
      const row = (x: number) => Math.round((x - apexX) / rowStep);
      const eight = rack.find((r) => r.id === 8)!;
      expect(row(eight.x)).toBe(2);
      expect(Math.abs(eight.y)).toBeLessThan(1e-3);
      const back = rack.filter((r) => row(r.x) === 4).sort((a, b) => a.y - b.y);
      const corners = [back[0], back[4]].map((r) => groupOf(r.id));
      expect(corners).toContain('solids');
      expect(corners).toContain('stripes');
      for (let i = 0; i < rack.length; i++) {
        for (let j = i + 1; j < rack.length; j++) {
          expect(Math.hypot(rack[i].x - rack[j].x, rack[i].y - rack[j].y)).toBeGreaterThan(2 * R);
        }
      }
    }
  });
});
