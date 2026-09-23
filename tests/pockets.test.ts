import { describe, expect, it } from 'vitest';
import { makeWorld, R, runSteps, runUntilSettled } from './helpers';

describe('Taschen', () => {
  it('alle sechs Taschen fangen eine direkt gespielte Kugel – genau ein Ereignis', () => {
    const { world } = makeWorld();
    for (const pocket of world.geometry.pockets) {
      world.clear();
      world.drainEvents();
      world.placeBall(3, 0, 0);
      const dx = pocket.x;
      const dy = pocket.y;
      const len = Math.hypot(dx, dy);
      world.setVelocity(3, (dx / len) * 2.5, (dy / len) * 2.5);
      runUntilSettled(world, 10);
      const events = world.drainEvents().filter((e) => e.type === 'pocket');
      expect(events, `Tasche ${pocket.index}`).toHaveLength(1);
      expect(events[0]).toMatchObject({ type: 'pocket', ball: 3, pocket: pocket.index });
      expect(world.balls[3].onTable).toBe(false);
      expect(world.sinking).toHaveLength(0); // Animation abgeschlossen
      // Weiteres Simulieren erzeugt keine doppelten Ereignisse
      runSteps(world, 500);
      expect(world.drainEvents().filter((e) => e.type === 'pocket')).toHaveLength(0);
    }
  });

  it('versenkte Kugel wird sofort aus der aktiven Physik entfernt', () => {
    const { world } = makeWorld();
    world.placeBall(5, 0, 0.3);
    world.setVelocity(5, 0, 2);
    let stepsUntilPocket = 0;
    while (world.balls[5].onTable && stepsUntilPocket < 2000) {
      world.step();
      stepsUntilPocket++;
    }
    expect(world.balls[5].onTable).toBe(false);
    expect(world.balls[5].vx).toBe(0);
    expect(world.sinking.map((s) => s.id)).toEqual([5]);
    // Stoß ist erst nach Abschluss der Einsinkanimation beendet
    expect(world.isSettled()).toBe(false);
    runUntilSettled(world, 5);
    expect(world.isSettled()).toBe(true);
  });

  it('entlang der Bande in die Ecktasche', () => {
    const { world } = makeWorld();
    const g = world.geometry;
    world.placeBall(2, 0.4, g.halfWidth - R - 0.0005);
    world.setVelocity(2, 2, 0);
    runUntilSettled(world, 10);
    const ev = world.drainEvents().filter((e) => e.type === 'pocket');
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ pocket: 3 });
  });

  it('parallel an der Mitteltasche vorbei fällt die Kugel nicht', () => {
    const { world } = makeWorld();
    const g = world.geometry;
    world.placeBall(4, -0.6, g.halfWidth - R - 0.0005);
    world.setVelocity(4, 0.9, 0); // Rollstrecke ≈ 1,2 m: endet vor der Ecktasche
    runUntilSettled(world, 10);
    const ev = world.drainEvents().filter((e) => e.type === 'pocket');
    expect(ev).toHaveLength(0);
    expect(world.balls[4].onTable).toBe(true);
    expect(world.balls[4].x).toBeGreaterThan(0.2);
  });

  it('Backenspitze prallt eine zu flach gespielte Kugel ab (Taschen sind nicht magnetisch)', () => {
    const { world } = makeWorld();
    const g = world.geometry;
    const side = g.pockets[4];
    // Sehr flacher Winkel auf die Mitteltasche: trifft die hintere Backe
    world.placeBall(6, -0.5, g.halfWidth - 0.1);
    const tx = side.tips[1].x + 0.01;
    const ty = g.halfWidth;
    const dx = tx - -0.5;
    const dy = ty - (g.halfWidth - 0.1);
    const len = Math.hypot(dx, dy);
    world.setVelocity(6, (dx / len) * 1.5, (dy / len) * 1.5);
    runUntilSettled(world, 10);
    const cushions = world.drainEvents().filter((e) => e.type === 'cushion');
    expect(cushions.length).toBeGreaterThan(0);
  });

  it('eine Kugel kann den Tisch nie verlassen (Sicherheitsnetz)', () => {
    const { world } = makeWorld();
    const g = world.geometry;
    for (let k = 0; k < 64; k++) {
      world.clear();
      const angle = (k / 64) * Math.PI * 2;
      world.placeBall(1, 0.1 * Math.cos(angle * 3), 0.1 * Math.sin(angle * 5));
      world.setVelocity(1, Math.cos(angle) * 6, Math.sin(angle) * 6);
      for (let i = 0; i < 3000 && (world.isMoving() || world.sinking.length > 0); i++) {
        world.step();
        const b = world.balls[1];
        if (b.onTable) {
          expect(Math.abs(b.x)).toBeLessThanOrEqual(g.halfLength + g.offTableMargin + 1e-9);
          expect(Math.abs(b.y)).toBeLessThanOrEqual(g.halfWidth + g.offTableMargin + 1e-9);
        }
      }
    }
  });
});
