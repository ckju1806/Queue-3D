import * as THREE from 'three';

/**
 * Orbit-Kamera um den Tisch mit Perspektiv- und Draufsicht.
 * - Rechte Maustaste ziehen: drehen
 * - Mausrad: Zoom
 * - V: Perspektive ↔ Draufsicht
 * - R: Standardposition
 * Bewegungen werden weich gedämpft. Die Standardentfernung wird so gewählt,
 * dass der ganze Tisch im Bild ist (abhängig vom Seitenverhältnis).
 */

export type ViewMode = 'perspective' | 'top';

interface OrbitState {
  azimuth: number;
  polar: number;
  distance: number;
}

const DEFAULT_POLAR = 0.9; // ≈ 52° von der Senkrechten → leicht erhöhte Perspektive
const TOP_POLAR = 0.0008;
const MIN_POLAR = 0.12;
const MAX_POLAR = 1.36;
const MIN_DISTANCE = 0.7;
const MAX_DISTANCE = 6;

export class CameraController {
  mode: ViewMode = 'perspective';
  /** Langsames Kreisen im Hauptmenü. */
  autoRotate = false;
  private readonly target = new THREE.Vector3(0, 0, 0);
  private current: OrbitState;
  private goal: OrbitState;
  private perspectiveGoal: OrbitState;
  private fitDistance = { perspective: 3, top: 3 };

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    /** Halbe Außenmaße des Tisches (x, z) inkl. Rahmen. */
    private readonly halfExtents: { x: number; z: number },
  ) {
    this.recomputeFit();
    this.goal = { azimuth: 0, polar: DEFAULT_POLAR, distance: this.fitDistance.perspective };
    this.current = { ...this.goal };
    this.perspectiveGoal = { ...this.goal };
    this.apply();
  }

  /** Aktueller Polarwinkel (0 = senkrecht von oben). */
  get polar(): number {
    return this.current.polar;
  }

  /** Nach Größenänderung des Fensters aufrufen. */
  onResize(): void {
    const oldPersp = this.fitDistance.perspective;
    const oldTop = this.fitDistance.top;
    this.recomputeFit();
    // Zoom relativ zur passenden Entfernung beibehalten
    if (this.mode === 'top') this.goal.distance *= this.fitDistance.top / oldTop;
    else this.goal.distance *= this.fitDistance.perspective / oldPersp;
    this.perspectiveGoal.distance *= this.fitDistance.perspective / oldPersp;
  }

  reset(): void {
    this.autoRotate = false;
    if (this.mode === 'top') {
      this.goal = { azimuth: 0, polar: TOP_POLAR, distance: this.fitDistance.top };
    } else {
      this.goal = { azimuth: 0, polar: DEFAULT_POLAR, distance: this.fitDistance.perspective };
    }
    this.perspectiveGoal = { azimuth: 0, polar: DEFAULT_POLAR, distance: this.fitDistance.perspective };
  }

  toggleView(): ViewMode {
    if (this.mode === 'perspective') {
      this.perspectiveGoal = { ...this.goal };
      this.mode = 'top';
      this.goal = { azimuth: 0, polar: TOP_POLAR, distance: this.fitDistance.top };
    } else {
      this.mode = 'perspective';
      this.goal = { ...this.perspectiveGoal };
    }
    return this.mode;
  }

  rotate(dxPixels: number, dyPixels: number): void {
    this.goal.azimuth -= dxPixels * 0.006;
    if (this.mode === 'perspective') {
      this.goal.polar = clamp(this.goal.polar - dyPixels * 0.005, MIN_POLAR, MAX_POLAR);
    }
  }

  zoom(deltaY: number): void {
    const factor = Math.exp(deltaY * 0.0012);
    this.goal.distance = clamp(this.goal.distance * factor, MIN_DISTANCE, MAX_DISTANCE);
  }

  update(dt: number): void {
    if (this.autoRotate) this.goal.azimuth += dt * 0.08;
    const k = 1 - Math.exp(-dt * 9);
    this.current.azimuth += (this.goal.azimuth - this.current.azimuth) * k;
    this.current.polar += (this.goal.polar - this.current.polar) * k;
    this.current.distance += (this.goal.distance - this.current.distance) * k;
    this.apply();
  }

  private apply(): void {
    const { azimuth, polar, distance } = this.current;
    const sp = Math.sin(polar);
    this.camera.position.set(
      this.target.x + distance * sp * Math.sin(azimuth),
      this.target.y + distance * Math.cos(polar),
      this.target.z + distance * sp * Math.cos(azimuth),
    );
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.target);
  }

  /** Bestimmt per Bisektion die Entfernung, bei der der ganze Tisch sichtbar ist. */
  private recomputeFit(): void {
    this.fitDistance.perspective = this.fitFor(DEFAULT_POLAR);
    this.fitDistance.top = this.fitFor(TOP_POLAR);
  }

  private fitFor(polar: number): number {
    const cam = this.camera.clone();
    cam.aspect = this.camera.aspect;
    cam.updateProjectionMatrix();
    const corners: THREE.Vector3[] = [];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        for (const y of [-0.05, 0.06]) corners.push(new THREE.Vector3(sx * this.halfExtents.x, y, sz * this.halfExtents.z));
      }
    }
    const margin = 0.9;
    let lo = 0.5;
    let hi = 12;
    const v = new THREE.Vector3();
    for (let i = 0; i < 30; i++) {
      const d = (lo + hi) / 2;
      const sp = Math.sin(polar);
      cam.position.set(d * sp * Math.sin(0), d * Math.cos(polar), d * sp * Math.cos(0));
      cam.up.set(0, 1, 0);
      cam.lookAt(this.target);
      cam.updateMatrixWorld(true);
      let fits = true;
      for (const c of corners) {
        v.copy(c).project(cam);
        if (Math.abs(v.x) > margin || Math.abs(v.y) > margin * 0.86 || v.z > 1) {
          fits = false;
          break;
        }
      }
      if (fits) hi = d;
      else lo = d;
    }
    return hi;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
