import { describe, expect, it } from 'vitest';
import { castBall, computeAimPreview } from '../src/aim/aimPreview';
import { makeWorld, R } from './helpers';

describe('Zielvorschau', () => {
  it('berücksichtigt den Kugelradius: Treffer, obwohl der Mittelpunktstrahl vorbeigeht', () => {
    const { world } = makeWorld();
    world.placeBall(0, -0.5, 0);
    world.placeBall(1, 0, 1.5 * R); // Mittelpunktstrahl y = 0 verfehlt die Kugel-Mitte, Kugeln berühren sich
    const p = computeAimPreview(world, { x: -0.5, y: 0 }, { x: 1, y: 0 });
    expect(p.hit.type).toBe('ball');
    if (p.hit.type !== 'ball') return;
    expect(p.hit.id).toBe(1);
    const expectedX = 0 - Math.sqrt((2 * R) ** 2 - (1.5 * R) ** 2);
    expect(p.ghost.x).toBeCloseTo(expectedX, 9);
    expect(p.ghost.y).toBeCloseTo(0, 12);
  });

  it('verfehlt eine Kugel, die weiter als 2R neben der Linie liegt', () => {
    const { world } = makeWorld();
    world.placeBall(0, -0.5, 0);
    world.placeBall(1, 0, 2.05 * R);
    const p = computeAimPreview(world, { x: -0.5, y: 0 }, { x: 1, y: 0 });
    expect(p.hit.type).not.toBe('ball');
  });

  it('Bandenkontakt liegt genau einen Kugelradius vor der Bandennase', () => {
    const { world } = makeWorld();
    world.placeBall(0, 0.3, 0);
    const hit = castBall(world, { x: 0.3, y: 0 }, { x: 0, y: 1 }, 5, [0]);
    expect(hit.type).toBe('cushion');
    expect(hit.position.y).toBeCloseTo(world.geometry.halfWidth - R, 9);
  });

  it('erkennt einen direkten Weg in die Tasche', () => {
    const { world } = makeWorld();
    const pk = world.geometry.pockets[4];
    const hit = castBall(world, { x: 0, y: 0 }, { x: pk.x, y: pk.y }, 5, []);
    expect(hit.type).toBe('pocket');
  });

  it('vorhergesagte Richtungen von Objektkugel und Weißer stimmen mit der Physik überein', () => {
    for (const lateral of [0.2, 0.5, 1.0, 1.5, -0.8]) {
      const { world } = makeWorld();
      const cue = { x: -0.6, y: -0.1 };
      const obj = { x: 0.1, y: 0.05 };
      world.placeBall(0, cue.x, cue.y);
      world.placeBall(7, obj.x, obj.y);
      const d0 = { x: obj.x - cue.x, y: obj.y - cue.y };
      const l0 = Math.hypot(d0.x, d0.y);
      const perp = { x: -d0.y / l0, y: d0.x / l0 };
      const aim = { x: obj.x + perp.x * lateral * R, y: obj.y + perp.y * lateral * R };
      const dir = { x: aim.x - cue.x, y: aim.y - cue.y };
      const preview = computeAimPreview(world, cue, dir);
      expect(preview.hit.type).toBe('ball');
      const len = Math.hypot(dir.x, dir.y);
      world.setVelocity(0, (dir.x / len) * 2, (dir.y / len) * 2);
      let firstContact: number | null = null;
      for (let i = 0; i < 600 && firstContact === null; i++) {
        world.step();
        for (const e of world.drainEvents()) {
          if (e.type === 'ballBall' && firstContact === null) firstContact = e.a === 0 ? e.b : e.a;
        }
      }
      expect(firstContact).toBe(7);
      const o = world.balls[7];
      const actual = Math.atan2(o.vy, o.vx);
      const predicted = Math.atan2(preview.objectDirection!.y, preview.objectDirection!.x);
      expect(Math.abs(actual - predicted)).toBeLessThan(0.002); // < 0,12°
      if (preview.cueDirection) {
        const c = world.balls[0];
        const cueAngle = Math.atan2(c.vy, c.vx);
        const predictedCue = Math.atan2(preview.cueDirection.y, preview.cueDirection.x);
        expect(Math.abs(cueAngle - predictedCue)).toBeLessThan(0.002);
      }
    }
  });
});
