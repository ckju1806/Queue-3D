import { describe, expect, it } from 'vitest';
import { createRack, defaultCuePosition } from '../src/game/rack';
import { createRng } from '../src/game/random';
import { computeCueVelocity, powerForSpeed, shotSpeed } from '../src/game/shot';
import { stoppingDistance } from '../src/physics/friction';
import { makeWorld, R, runSteps, runUntilSettled } from './helpers';

describe('Kugel-Kugel-Kollision', () => {
  it('gerader Stoß überträgt den Impuls entlang der Stoßlinie', () => {
    const { world, config } = makeWorld({ rollingDeceleration: 0, linearDamping: 0 });
    world.placeBall(0, -0.3, 0);
    world.placeBall(1, 0, 0);
    world.setVelocity(0, 2, 0);
    runSteps(world, 120); // 0,5 s – Kontakt nach ca. 0,12 s
    const e = config.physics.ballRestitution;
    const cue = world.balls[0];
    const obj = world.balls[1];
    expect(cue.vx).toBeCloseTo(((1 - e) / 2) * 2, 6);
    expect(obj.vx).toBeCloseTo(((1 + e) / 2) * 2, 6);
    expect(cue.vy).toBeCloseTo(0, 9);
    expect(obj.vy).toBeCloseTo(0, 9);
    // Impulserhaltung (gleiche Massen)
    expect(cue.vx + obj.vx).toBeCloseTo(2, 9);
    // Energieverlust durch Stoßzahl < 1
    expect(cue.vx ** 2 + obj.vx ** 2).toBeLessThan(4);
    const events = world.drainEvents().filter((ev) => ev.type === 'ballBall');
    expect(events).toHaveLength(1);
  });

  it('schräger Stoß: Objektkugel läuft entlang der Stoßnormalen (90°-Regel)', () => {
    const { world } = makeWorld({ rollingDeceleration: 0, linearDamping: 0, ballRestitution: 1 });
    world.placeBall(0, -0.4, 0);
    world.placeBall(1, 0, R); // halbvoller Treffer
    world.setVelocity(0, 2, 0);
    runSteps(world, 120);
    const cue = world.balls[0];
    const obj = world.balls[1];
    const angle = Math.atan2(cue.vy, cue.vx) - Math.atan2(obj.vy, obj.vx);
    expect(Math.abs(Math.abs(angle) - Math.PI / 2)).toBeLessThan(1e-6);
    // Objektkugel läuft entlang Verbindungslinie der Mittelpunkte beim Kontakt: 30° nach oben
    expect(Math.atan2(obj.vy, obj.vx)).toBeCloseTo(Math.PI / 6, 6);
  });

  it('kein Durchtunneln bei maximaler Stoßstärke durch eine dünne Kugelreihe', () => {
    const { world, config } = makeWorld();
    world.placeBall(0, -0.9, 0);
    world.placeBall(1, -0.5, 0.0);
    world.setVelocity(0, config.shot.maxSpeed * 2, 0); // doppelte Maximalgeschwindigkeit
    runSteps(world, 40);
    // Die Weiße darf nicht hinter der Objektkugel landen
    expect(world.balls[0].x).toBeLessThan(world.balls[1].x);
    expect(world.drainEvents().some((e) => e.type === 'ballBall')).toBe(true);
  });
});

describe('Kugel-Banden-Kollision', () => {
  it('senkrechter Abprall kehrt die Richtung um und verliert Energie', () => {
    const { world, config } = makeWorld({ rollingDeceleration: 0, linearDamping: 0 });
    world.placeBall(0, 0.5, 0);
    world.setVelocity(0, 0, 1.5); // Richtung lange Bande bei y = +0,56
    runSteps(world, 240);
    const b = world.balls[0];
    expect(b.onTable).toBe(true);
    expect(b.vy).toBeCloseTo(-1.5 * config.physics.cushionRestitution, 6);
    expect(b.vx).toBeCloseTo(0, 9);
    expect(world.drainEvents().filter((e) => e.type === 'cushion')).toHaveLength(1);
  });

  it('schräger Abprall: Einfallswinkel ≈ Ausfallswinkel (abzüglich Dämpfung)', () => {
    const { world, config } = makeWorld({ rollingDeceleration: 0, linearDamping: 0 });
    world.placeBall(0, 0.3, 0);
    world.setVelocity(0, 1, 1);
    runSteps(world, 160); // nur der erste Bandenkontakt (lange Bande), vor der kurzen Bande
    const b = world.balls[0];
    expect(b.vy).toBeLessThan(0);
    expect(b.vx).toBeCloseTo(config.physics.cushionTangentialFactor, 6);
    expect(-b.vy).toBeCloseTo(config.physics.cushionRestitution, 6);
  });

  it('kein Durchtunneln durch eine geschlossene Bande bei extremer Geschwindigkeit', () => {
    const { world } = makeWorld();
    const g = world.geometry;
    // Senkrecht auf lange und kurze Banden, fernab der Taschenöffnungen
    const cases = [
      { x: 0.5, y: 0, vx: 0, vy: 1 },
      { x: -0.5, y: 0.1, vx: 0, vy: -1 },
      { x: 0, y: 0.25, vx: 1, vy: 0 },
      { x: 0, y: -0.2, vx: -1, vy: 0 },
    ];
    for (const speed of [8, 15, 25, 40]) {
      for (const c of cases) {
        world.clear();
        world.placeBall(0, c.x, c.y);
        world.setVelocity(0, c.vx * speed, c.vy * speed);
        let cushionHits = 0;
        for (let i = 0; i < 300; i++) {
          world.step();
          cushionHits += world.drainEvents().filter((e) => e.type === 'cushion').length;
          const b = world.balls[0];
          expect(b.onTable).toBe(true);
          expect(Math.abs(b.y)).toBeLessThanOrEqual(g.halfWidth - R + 1e-6);
          expect(Math.abs(b.x)).toBeLessThanOrEqual(g.halfLength - R + 1e-6);
        }
        expect(cushionHits).toBeGreaterThan(0);
      }
    }
  });
});

describe('Reibung und Ausrollen', () => {
  it('Kugel rollt gleichmäßig aus und kommt exakt zum Stillstand', () => {
    const { world, config } = makeWorld();
    world.placeBall(0, -0.9, 0);
    world.setVelocity(0, 1.2, 0);
    let last = 1.2;
    let steps = 0;
    while (world.isMoving() && steps < 10000) {
      world.step();
      const v = Math.hypot(world.balls[0].vx, world.balls[0].vy);
      expect(v).toBeLessThanOrEqual(last + 1e-12);
      last = v;
      steps++;
    }
    expect(world.isMoving()).toBe(false);
    expect(world.balls[0].vx).toBe(0);
    expect(world.balls[0].vy).toBe(0);
    // Rollstrecke passt zum analytischen Reibungsmodell (±3 %)
    const travelled = world.balls[0].x + 0.9;
    const expected = stoppingDistance(1.2, config.physics);
    expect(Math.abs(travelled - expected) / expected).toBeLessThan(0.03);
  });

  it('Stoß gilt erst nach Ruhezeit als beendet', () => {
    const { world, config } = makeWorld();
    world.placeBall(0, 0, 0);
    world.setVelocity(0, 0.3, 0);
    expect(world.isSettled()).toBe(false);
    while (world.isMoving()) world.step();
    expect(world.isSettled()).toBe(false); // Ruhezeit läuft noch
    runSteps(world, Math.ceil(config.physics.restTime / config.physics.timeStep) + 1);
    expect(world.isSettled()).toBe(true);
  });
});

describe('Fester Zeitschritt', () => {
  it('Ergebnis ist unabhängig von der Bildrate', () => {
    const results: string[] = [];
    for (const fps of [30, 60, 144, 240]) {
      const { world } = makeWorld();
      const rack = createRack(world.geometry, R, createRng(7));
      for (const p of rack) world.placeBall(p.id, p.x, p.y);
      const cue = defaultCuePosition(world.geometry);
      world.placeBall(0, cue.x, cue.y);
      world.setVelocity(0, 6, 0.02);
      for (let i = 0; i < fps * 20; i++) world.advance(1 / fps);
      results.push(world.balls.map((b) => `${b.onTable}:${b.x.toFixed(9)}:${b.y.toFixed(9)}`).join('|'));
    }
    expect(new Set(results).size).toBe(1);
  });

  it('begrenzt aufgestaute Simulationszeit nach einer Unterbrechung', () => {
    const { world, config } = makeWorld();
    world.placeBall(0, 0, 0);
    world.setVelocity(0, 1, 0);
    const steps = world.advance(5); // z. B. 5 s im Hintergrund-Tab
    expect(steps).toBeLessThanOrEqual(config.physics.maxStepsPerFrame);
    expect(steps * config.physics.timeStep).toBeLessThanOrEqual(config.physics.maxFrameDelta + 1e-9);
  });
});

describe('Anstoß-Stabilität', () => {
  it('nach einem harten Anstoß: keine Überlappungen, alle Kugeln im Tisch oder versenkt', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { world, config } = makeWorld();
      const rack = createRack(world.geometry, R, createRng(seed));
      for (const p of rack) world.placeBall(p.id, p.x, p.y);
      const cue = defaultCuePosition(world.geometry);
      world.placeBall(0, cue.x, cue.y + (seed - 3) * 0.004);
      const v = computeCueVelocity({ x: 1, y: 0 }, 1, config.shot);
      world.setVelocity(0, v.x, v.y);
      const t = runUntilSettled(world, 40);
      expect(t).toBeLessThan(40);
      const g = world.geometry;
      const on = world.balls.filter((b) => b.onTable);
      for (const b of on) {
        expect(Math.abs(b.x)).toBeLessThanOrEqual(g.halfLength - R + 1e-6);
        expect(Math.abs(b.y)).toBeLessThanOrEqual(g.halfWidth - R + 1e-6);
      }
      for (let i = 0; i < on.length; i++) {
        for (let j = i + 1; j < on.length; j++) {
          const d = Math.hypot(on[i].x - on[j].x, on[i].y - on[j].y);
          expect(d).toBeGreaterThanOrEqual(2 * R - 1e-6);
        }
      }
      // Der Anstoß verteilt die Kugeln tatsächlich
      const spread = Math.max(...on.map((b) => b.x)) - Math.min(...on.map((b) => b.x));
      expect(spread).toBeGreaterThan(0.5);
    }
  });
});

describe('Stoßfunktion', () => {
  it('Stärke bildet monoton auf die Anfangsgeschwindigkeit ab und ist umkehrbar', () => {
    const { config } = makeWorld();
    let last = -1;
    for (let p = 0; p <= 1.0001; p += 0.05) {
      const v = shotSpeed(p, config.shot);
      expect(v).toBeGreaterThan(last);
      expect(powerForSpeed(v, config.shot)).toBeCloseTo(Math.min(1, p), 6);
      last = v;
    }
    expect(shotSpeed(0, config.shot)).toBe(config.shot.minSpeed);
    expect(shotSpeed(1, config.shot)).toBe(config.shot.maxSpeed);
  });
});

describe('Gleichzeitige Stöße (Kugeln in Kontakt)', () => {
  const kinetic = (world: ReturnType<typeof makeWorld>['world']) =>
    world.balls.filter((b) => b.onTable).reduce((s, b) => s + 0.5 * (b.vx * b.vx + b.vy * b.vy), 0);

  it('Anstoß bricht das Dreieck realistisch auf, ohne Energie zu erzeugen', () => {
    for (const seed of [1, 2, 3]) {
      const { world, config } = makeWorld();
      const rack = createRack(world.geometry, R, createRng(seed));
      for (const p of rack) world.placeBall(p.id, p.x, p.y);
      const cue = defaultCuePosition(world.geometry);
      world.placeBall(0, cue.x, cue.y);
      const v = computeCueVelocity({ x: 1, y: 0.003 }, 1, config.shot);
      world.setVelocity(0, v.x, v.y);
      const e0 = kinetic(world);
      let maxE = e0;
      for (let i = 0; i < 120; i++) {
        world.step();
        maxE = Math.max(maxE, kinetic(world));
      }
      expect(maxE).toBeLessThanOrEqual(e0 * (1 + 1e-9));
      runUntilSettled(world, 40);
      let moved = 0;
      for (const p of rack) {
        const b = world.balls[p.id];
        if (!b.onTable || Math.hypot(b.x - p.x, b.y - p.y) > 0.1) moved++;
      }
      expect(moved).toBeGreaterThanOrEqual(10);
    }
  });

  it('Kombination über eingefrorene Kugeln: die vordere Kugel läuft weiter', () => {
    const { world } = makeWorld({ rollingDeceleration: 0, linearDamping: 0 });
    world.placeBall(0, -0.5, 0);
    world.placeBall(1, 0, 0);
    world.placeBall(2, 2 * R + 0.0002, 0); // eingefroren an Kugel 1
    world.setVelocity(0, 2, 0);
    runSteps(world, 100);
    // Impuls wird in Stoßrichtung erhalten, Energie nimmt nicht zu
    const px = world.balls[0].vx + world.balls[1].vx + world.balls[2].vx;
    expect(px).toBeCloseTo(2, 6);
    expect(kinetic(world)).toBeLessThanOrEqual(0.5 * 4 + 1e-9);
    // Die vordere Kugel bekommt den Großteil der Bewegung
    expect(world.balls[2].vx).toBeGreaterThan(1.5);
    expect(world.balls[2].vx).toBeGreaterThan(world.balls[1].vx);
    // Das auslösende Paar wird als erstes Ereignis gemeldet (erster Kontakt der Weißen)
    const first = world.drainEvents().find((ev) => ev.type === 'ballBall');
    expect(first).toMatchObject({ type: 'ballBall', a: 0, b: 1 });
  });
});
