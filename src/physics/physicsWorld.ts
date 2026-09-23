import type { GameConfig } from '../config/gameConfig';
import { toiApproach, toiBallBall, toiBallPoint, toiBallSegment } from './collision';
import type { TableGeometry } from './tableGeometry';

/**
 * 2D-Billardphysik mit festem Zeitschritt und ereignisgesteuerter,
 * kontinuierlicher Kollisionserkennung.
 *
 * Innerhalb eines Zeitschritts wird wiederholt das früheste Ereignis
 * (Kugel–Kugel, Kugel–Bande, Kugel–Backenspitze, Taschenfang) gesucht,
 * alle Kugeln bis dorthin bewegt und das Ereignis aufgelöst. Dadurch kann
 * keine Kugel durch eine andere Kugel oder eine geschlossene Bande tunneln –
 * unabhängig von der Stoßstärke.
 */

export const BALL_COUNT = 16;

/** Kugeln mit höchstens diesem Spalt gelten beim Stoß als gleichzeitig in Kontakt. */
const CLUSTER_TOLERANCE = 0.001;

export interface BallState {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Aktiv auf dem Tisch und Teil der Physik. */
  onTable: boolean;
}

export interface SinkingBall {
  id: number;
  pocket: number;
  elapsed: number;
  startX: number;
  startY: number;
  vx: number;
  vy: number;
}

export type PhysicsEvent =
  | { type: 'ballBall'; a: number; b: number; speed: number }
  | { type: 'cushion'; ball: number; speed: number }
  | { type: 'pocket'; ball: number; pocket: number };

type PendingEvent =
  | { kind: 'ball'; t: number; i: number; j: number }
  | { kind: 'segment'; t: number; i: number; index: number }
  | { kind: 'vertex'; t: number; i: number; index: number }
  | { kind: 'pocket'; t: number; i: number; index: number };

export class PhysicsWorld {
  readonly balls: BallState[] = [];
  sinking: SinkingBall[] = [];
  /** Seit dem letzten Abholen aufgetretene Ereignisse. */
  events: PhysicsEvent[] = [];
  /** Wie lange alle Kugeln bereits ruhen. */
  restTimer: number;
  /** Simulierte Gesamtzeit. */
  time = 0;
  private accumulator = 0;
  private readonly radius: number;

  constructor(
    readonly geometry: TableGeometry,
    readonly config: GameConfig,
  ) {
    this.radius = config.ball.radius;
    this.restTimer = config.physics.restTime;
    for (let id = 0; id < BALL_COUNT; id++) {
      this.balls.push({ id, x: 0, y: 0, vx: 0, vy: 0, onTable: false });
    }
  }

  get ballRadius(): number {
    return this.radius;
  }

  /** Setzt eine Kugel ruhend auf den Tisch. */
  placeBall(id: number, x: number, y: number): void {
    const b = this.balls[id];
    b.x = x;
    b.y = y;
    b.vx = 0;
    b.vy = 0;
    b.onTable = true;
    this.sinking = this.sinking.filter((s) => s.id !== id);
  }

  /** Nimmt eine Kugel ohne Ereignis vom Tisch (z. B. beim Neuaufbau). */
  removeBall(id: number): void {
    const b = this.balls[id];
    b.onTable = false;
    b.vx = 0;
    b.vy = 0;
    this.sinking = this.sinking.filter((s) => s.id !== id);
  }

  /** Entfernt alle Kugeln und Ereignisse. */
  clear(): void {
    for (const b of this.balls) {
      b.onTable = false;
      b.vx = 0;
      b.vy = 0;
    }
    this.sinking = [];
    this.events = [];
    this.accumulator = 0;
    this.restTimer = this.config.physics.restTime;
  }

  setVelocity(id: number, vx: number, vy: number): void {
    const b = this.balls[id];
    if (!b.onTable) return;
    b.vx = vx;
    b.vy = vy;
    this.restTimer = 0;
  }

  isMoving(): boolean {
    for (const b of this.balls) {
      if (b.onTable && (b.vx !== 0 || b.vy !== 0)) return true;
    }
    return false;
  }

  /** Alle Kugeln ruhen ausreichend lange und alle Versenkvorgänge sind abgeschlossen. */
  isSettled(): boolean {
    return !this.isMoving() && this.sinking.length === 0 && this.restTimer >= this.config.physics.restTime;
  }

  /** Holt die gesammelten Ereignisse ab und leert die Liste. */
  drainEvents(): PhysicsEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  /**
   * Schreitet um eine Frame-Zeit voran (fester Zeitschritt mit Akkumulator).
   * Aufgestaute Zeit wird begrenzt. Liefert die Anzahl der ausgeführten Schritte.
   */
  advance(frameDelta: number): number {
    const p = this.config.physics;
    const dt = Math.min(Math.max(frameDelta, 0), p.maxFrameDelta);
    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator + 1e-9 >= p.timeStep && steps < p.maxStepsPerFrame) {
      this.step();
      this.accumulator -= p.timeStep;
      steps++;
    }
    if (steps >= p.maxStepsPerFrame) this.accumulator = 0;
    if (this.accumulator < 0) this.accumulator = 0;
    return steps;
  }

  /** Ein fester Physikschritt. */
  step(): void {
    const p = this.config.physics;
    const dt = p.timeStep;
    let remaining = dt;
    let guard = 0;

    while (remaining > 1e-12) {
      const ev = this.findEarliestEvent(remaining);
      if (!ev) {
        this.move(remaining);
        break;
      }
      this.move(ev.t);
      remaining -= ev.t;
      this.resolve(ev);
      if (++guard >= p.maxEventsPerStep) {
        this.move(remaining);
        break;
      }
    }

    this.resolveOverlaps();
    this.applyFriction(dt);
    this.checkOffTable();
    this.updateSinking(dt);

    if (this.isMoving()) this.restTimer = 0;
    else this.restTimer += dt;
    this.time += dt;
  }

  /** Tiefe Kopie (für KI-Vorausberechnungen mit identischer Physik). */
  clone(): PhysicsWorld {
    const w = new PhysicsWorld(this.geometry, this.config);
    for (let i = 0; i < BALL_COUNT; i++) Object.assign(w.balls[i], this.balls[i]);
    w.sinking = this.sinking.map((s) => ({ ...s }));
    w.restTimer = this.restTimer;
    w.time = this.time;
    return w;
  }

  // ---------------------------------------------------------------------------

  private move(t: number): void {
    if (t <= 0) return;
    for (const b of this.balls) {
      if (!b.onTable) continue;
      b.x += b.vx * t;
      b.y += b.vy * t;
    }
  }

  private findEarliestEvent(maxT: number): PendingEvent | null {
    const R = this.radius;
    const D = 2 * R;
    const g = this.geometry;
    let best: PendingEvent | null = null;
    let bestT = maxT;

    const balls = this.balls;
    for (let i = 0; i < BALL_COUNT; i++) {
      const a = balls[i];
      if (!a.onTable) continue;
      const aMoving = a.vx !== 0 || a.vy !== 0;
      const aSpeed = aMoving ? Math.hypot(a.vx, a.vy) : 0;

      // Kugel–Kugel (jedes Paar einmal)
      for (let j = i + 1; j < BALL_COUNT; j++) {
        const b = balls[j];
        if (!b.onTable) continue;
        const bMoving = b.vx !== 0 || b.vy !== 0;
        if (!aMoving && !bMoving) continue;
        const reach = (aSpeed + (bMoving ? Math.hypot(b.vx, b.vy) : 0)) * bestT;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const lim = D + reach;
        if (dx * dx + dy * dy > lim * lim) continue;
        const t = toiBallBall(a.x, a.y, a.vx, a.vy, b.x, b.y, b.vx, b.vy, D);
        if (t <= bestT) {
          bestT = t;
          best = { kind: 'ball', t, i, j };
        }
      }

      if (!aMoving) continue;

      // Taschenfang
      for (let k = 0; k < g.pockets.length; k++) {
        const pk = g.pockets[k];
        const t = toiApproach(a.x - pk.x, a.y - pk.y, a.vx, a.vy, pk.captureRadius);
        if (t <= bestT) {
          bestT = t;
          best = { kind: 'pocket', t, i, index: k };
        }
      }

      // Banden und Backen
      for (let k = 0; k < g.segments.length; k++) {
        const t = toiBallSegment(a.x, a.y, a.vx, a.vy, g.segments[k], R);
        if (t < bestT) {
          bestT = t;
          best = { kind: 'segment', t, i, index: k };
        }
      }

      // Runde Backenspitzen
      for (let k = 0; k < g.vertices.length; k++) {
        const q = g.vertices[k];
        const t = toiBallPoint(a.x, a.y, a.vx, a.vy, q.x, q.y, R);
        if (t < bestT) {
          bestT = t;
          best = { kind: 'vertex', t, i, index: k };
        }
      }
    }
    return best;
  }

  private resolve(ev: PendingEvent): void {
    const p = this.config.physics;
    const a = this.balls[ev.i];
    switch (ev.kind) {
      case 'ball': {
        const cluster = this.collectCluster(ev.i, ev.j);
        if (cluster.length > 2) {
          this.resolveCluster(ev.i, ev.j, cluster);
          return;
        }
        const b = this.balls[ev.j];
        let nx = b.x - a.x;
        let ny = b.y - a.y;
        const len = Math.hypot(nx, ny) || 1;
        nx /= len;
        ny /= len;
        const vrel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (vrel <= 0) return;
        // Gleiche Massen: Impulsübertragung entlang der Stoßnormalen
        const jn = ((1 + p.ballRestitution) / 2) * vrel;
        a.vx -= jn * nx;
        a.vy -= jn * ny;
        b.vx += jn * nx;
        b.vy += jn * ny;
        this.events.push({ type: 'ballBall', a: a.id, b: b.id, speed: vrel });
        return;
      }
      case 'segment': {
        const seg = this.geometry.segments[ev.index];
        this.bounce(a, seg.nx, seg.ny);
        return;
      }
      case 'vertex': {
        const q = this.geometry.vertices[ev.index];
        let nx = a.x - q.x;
        let ny = a.y - q.y;
        const len = Math.hypot(nx, ny) || 1;
        nx /= len;
        ny /= len;
        this.bounce(a, nx, ny);
        return;
      }
      case 'pocket':
        this.pocketBall(a, ev.index);
        return;
    }
  }

  /** Alle Kugeln, die über (Beinahe-)Kontakte mit dem stoßenden Paar verbunden sind. */
  private collectCluster(i: number, j: number): number[] {
    const lim = 2 * this.radius + CLUSTER_TOLERANCE;
    const limSq = lim * lim;
    const cluster = [i, j];
    const inCluster = new Set(cluster);
    for (let k = 0; k < cluster.length; k++) {
      const a = this.balls[cluster[k]];
      for (const b of this.balls) {
        if (!b.onTable || inCluster.has(b.id)) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        if (dx * dx + dy * dy <= limSq) {
          inCluster.add(b.id);
          cluster.push(b.id);
        }
      }
    }
    return cluster;
  }

  /**
   * Stoß mehrerer sich (fast) berührender Kugeln (z. B. Anstoß ins Dreieck, eingefrorene Kombinationen).
   *
   * Wellenfront-Modell: In jeder Runde werden alle Kontakte, die sich GERADE annähern,
   * gleichzeitig nach der Poisson-Hypothese aufgelöst (Kompression per Sequential Impulses,
   * danach Restitution e · Kompressionsimpuls). Dadurch läuft der Impuls wie eine Welle
   * durch die Gruppe: Gerade Ketten verhalten sich wie ein Kugelpendel, im Dreieck teilt
   * sich der Impuls symmetrisch auf. Für zwei Kugeln identisch zur Einzelformel.
   */
  private resolveCluster(i: number, j: number, cluster: number[]): void {
    const e = this.config.physics.ballRestitution;
    const lim = 2 * this.radius + CLUSTER_TOLERANCE;
    type Contact = { a: BallState; b: BallState; nx: number; ny: number; acc: number; total: number; restituted: boolean };
    const contacts: Contact[] = [];
    for (let x = 0; x < cluster.length; x++) {
      for (let y = x + 1; y < cluster.length; y++) {
        const a = this.balls[cluster[x]];
        const b = this.balls[cluster[y]];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d > lim || d < 1e-12) continue;
        contacts.push({ a, b, nx: dx / d, ny: dy / d, acc: 0, total: 0, restituted: false });
      }
    }
    const members = cluster.map((id) => this.balls[id]);
    const kinetic = () => members.reduce((sum, m) => sum + m.vx * m.vx + m.vy * m.vy, 0);
    const energyBefore = kinetic();
    const approach = (c: Contact) => (c.a.vx - c.b.vx) * c.nx + (c.a.vy - c.b.vy) * c.ny;
    const apply = (c: Contact, dj: number) => {
      c.total += dj;
      c.a.vx -= dj * c.nx;
      c.a.vy -= dj * c.ny;
      c.b.vx += dj * c.nx;
      c.b.vy += dj * c.ny;
    };
    const compress = (set: Contact[]) => {
      for (let it = 0; it < 200; it++) {
        let maxDj = 0;
        for (const c of set) {
          const vrel = approach(c);
          if (vrel <= 0) continue;
          const dj = vrel / 2;
          c.acc += dj;
          apply(c, dj);
          if (dj > maxDj) maxDj = dj;
        }
        if (maxDj < 1e-10) break;
      }
    };

    for (let round = 0; round < 80; round++) {
      const active = contacts.filter((c) => approach(c) > 1e-9);
      if (active.length === 0) break;
      for (const c of active) c.acc = 0;
      compress(active);
      // Restitution nur beim ersten Zusammenstoß eines Kontakts; erneute Annäherung wird plastisch aufgelöst
      for (const c of active) {
        if (!c.restituted) {
          apply(c, e * c.acc);
          c.restituted = true;
        }
      }
      compress(active);
    }

    // Energieschranke: Gruppen-Energie darf nicht zunehmen (impulserhaltende Skalierung um den Schwerpunkt)
    const energyAfter = kinetic();
    if (energyAfter > energyBefore && energyAfter > 1e-12) {
      let cx = 0;
      let cy = 0;
      for (const m of members) {
        cx += m.vx / members.length;
        cy += m.vy / members.length;
      }
      const cmEnergy = members.length * (cx * cx + cy * cy);
      const rel = energyAfter - cmEnergy;
      const allowed = Math.max(0, energyBefore - cmEnergy);
      const k = rel > 1e-12 ? Math.sqrt(allowed / rel) : 1;
      for (const m of members) {
        m.vx = cx + (m.vx - cx) * k;
        m.vy = cy + (m.vy - cy) * k;
      }
    }

    // Ereignisse: auslösendes Paar zuerst (wichtig für "erster Kontakt"), dann alle übrigen
    const first = contacts.find((c) => (c.a.id === i && c.b.id === j) || (c.a.id === j && c.b.id === i));
    if (first) this.events.push({ type: 'ballBall', a: first.a.id, b: first.b.id, speed: (2 * first.total) / (1 + e) });
    for (const c of contacts) {
      if (c === first || c.total < 1e-6) continue;
      this.events.push({ type: 'ballBall', a: c.a.id, b: c.b.id, speed: (2 * c.total) / (1 + e) });
    }
  }

  private bounce(b: BallState, nx: number, ny: number): void {
    const p = this.config.physics;
    const vn = b.vx * nx + b.vy * ny;
    if (vn >= 0) return;
    const tx = b.vx - vn * nx;
    const ty = b.vy - vn * ny;
    b.vx = tx * p.cushionTangentialFactor - p.cushionRestitution * vn * nx;
    b.vy = ty * p.cushionTangentialFactor - p.cushionRestitution * vn * ny;
    this.events.push({ type: 'cushion', ball: b.id, speed: -vn });
  }

  private pocketBall(b: BallState, pocket: number): void {
    if (!b.onTable) return;
    b.onTable = false;
    this.sinking.push({ id: b.id, pocket, elapsed: 0, startX: b.x, startY: b.y, vx: b.vx, vy: b.vy });
    b.vx = 0;
    b.vy = 0;
    this.events.push({ type: 'pocket', ball: b.id, pocket });
  }

  /** Numerische Absicherung: trennt überlappende Kugeln und drückt Kugeln aus Banden. */
  private resolveOverlaps(): void {
    const R = this.radius;
    const D = 2 * R;
    const balls = this.balls;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < BALL_COUNT; i++) {
        const a = balls[i];
        if (!a.onTable) continue;
        for (let j = i + 1; j < BALL_COUNT; j++) {
          const b = balls[j];
          if (!b.onTable) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d2 = dx * dx + dy * dy;
          if (d2 >= (D - 1e-9) * (D - 1e-9)) continue;
          const d = Math.sqrt(d2);
          const nx = d > 1e-12 ? dx / d : 1;
          const ny = d > 1e-12 ? dy / d : 0;
          const push = (D - d) / 2 + 1e-9;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
        }
        this.pushOutOfCushions(a);
      }
    }
  }

  private pushOutOfCushions(b: BallState): void {
    const R = this.radius;
    for (const seg of this.geometry.segments) {
      const d0 = (b.x - seg.ax) * seg.nx + (b.y - seg.ay) * seg.ny;
      if (d0 >= R || d0 <= -R) continue;
      const ex = seg.bx - seg.ax;
      const ey = seg.by - seg.ay;
      const s = ((b.x - seg.ax) * ex + (b.y - seg.ay) * ey) / (ex * ex + ey * ey);
      if (s < 0 || s > 1) continue;
      const push = R - d0 + 1e-9;
      b.x += seg.nx * push;
      b.y += seg.ny * push;
      const vn = b.vx * seg.nx + b.vy * seg.ny;
      if (vn < 0) {
        b.vx -= vn * seg.nx;
        b.vy -= vn * seg.ny;
      }
    }
    for (const q of this.geometry.vertices) {
      const dx = b.x - q.x;
      const dy = b.y - q.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= R * R || d2 < 1e-18) continue;
      const d = Math.sqrt(d2);
      const push = R - d + 1e-9;
      b.x += (dx / d) * push;
      b.y += (dy / d) * push;
    }
  }

  private applyFriction(dt: number): void {
    const p = this.config.physics;
    for (const b of this.balls) {
      if (!b.onTable || (b.vx === 0 && b.vy === 0)) continue;
      const speed = Math.hypot(b.vx, b.vy);
      const next = speed - (p.rollingDeceleration + p.linearDamping * speed) * dt;
      if (next <= p.stopSpeed) {
        b.vx = 0;
        b.vy = 0;
      } else {
        const f = next / speed;
        b.vx *= f;
        b.vy *= f;
      }
    }
  }

  /** Sicherheitsnetz: Kugeln im Fangbereich oder jenseits der Bandenlinie fallen in die (nächste) Tasche. */
  private checkOffTable(): void {
    const g = this.geometry;
    const limX = g.halfLength + g.offTableMargin;
    const limY = g.halfWidth + g.offTableMargin;
    for (const b of this.balls) {
      if (!b.onTable) continue;
      // Liegt die Kugel (z. B. nach numerischer Korrektur) bereits in einem Fangbereich?
      const inside = g.pockets.find((pk) => Math.hypot(b.x - pk.x, b.y - pk.y) < pk.captureRadius);
      if (inside) {
        this.pocketBall(b, inside.index);
        continue;
      }
      if (Math.abs(b.x) <= limX && Math.abs(b.y) <= limY) continue;
      let bestIndex = 0;
      let bestD = Infinity;
      for (const pk of g.pockets) {
        const d = Math.hypot(b.x - pk.x, b.y - pk.y);
        if (d < bestD) {
          bestD = d;
          bestIndex = pk.index;
        }
      }
      this.pocketBall(b, bestIndex);
    }
  }

  private updateSinking(dt: number): void {
    if (this.sinking.length === 0) return;
    const duration = this.config.physics.sinkDuration;
    for (const s of this.sinking) s.elapsed += dt;
    this.sinking = this.sinking.filter((s) => s.elapsed < duration);
  }
}
