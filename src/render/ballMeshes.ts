import * as THREE from 'three';
import { CUE_BALL } from '../game/balls';
import { createRng } from '../game/random';
import { BALL_COUNT, type PhysicsWorld } from '../physics/physicsWorld';
import type { Vec2 } from '../physics/vec2';
import { getBallTexture } from './ballTextures';

/**
 * Darstellung der 16 Kugeln. Die Rotation wird aus der tatsächlichen
 * Verschiebung integriert (Rollen ohne Gleiten: Achse = oben × Weg,
 * Winkel = Weg / Radius) und passt damit exakt zur Bewegung.
 */
export class BallViews {
  readonly group = new THREE.Group();
  private readonly meshes: THREE.Mesh[] = [];
  private readonly last: Array<Vec2 | null> = [];
  private readonly radius: number;
  private readonly rng = createRng(2024);
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpAxis = new THREE.Vector3();

  constructor(radius: number) {
    this.radius = radius;
    this.group.name = 'balls';
    const geo = new THREE.SphereGeometry(radius, 48, 32);
    for (let id = 0; id < BALL_COUNT; id++) {
      const mat = new THREE.MeshPhysicalMaterial({
        map: getBallTexture(id),
        roughness: 0.16,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.05,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.visible = false;
      mesh.name = `ball-${id}`;
      this.group.add(mesh);
      this.meshes.push(mesh);
      this.last.push(null);
      this.resetOrientation(id);
    }
  }

  /** Nummer zeigt nach oben, zufällige Drehung um die Hochachse. */
  private resetOrientation(id: number): void {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.rng() * Math.PI * 2);
    const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (this.rng() - 0.5) * 0.5);
    this.meshes[id].quaternion.copy(yaw.multiply(tilt).multiply(q));
  }

  /**
   * @param cueOverride Position der Weißen während Ball in Hand (Vorschau), sonst null
   */
  update(world: PhysicsWorld, cueOverride: Vec2 | null): void {
    const R = this.radius;
    const sinkDuration = world.config.physics.sinkDuration;
    const sinking = new Map(world.sinking.map((s) => [s.id, s]));

    for (let id = 0; id < BALL_COUNT; id++) {
      const mesh = this.meshes[id];
      const b = world.balls[id];
      let pos: Vec2 | null = null;
      let height = R;

      if (b.onTable) {
        pos = { x: b.x, y: b.y };
      } else if (id === CUE_BALL && cueOverride) {
        pos = cueOverride;
      } else {
        const s = sinking.get(id);
        if (s) {
          const t = Math.min(1, s.elapsed / sinkDuration);
          const hole = world.geometry.pockets[s.pocket].hole;
          const ease = 1 - (1 - t) * (1 - t);
          pos = { x: s.startX + (hole.x - s.startX) * ease, y: s.startY + (hole.y - s.startY) * ease };
          height = R - Math.pow(t, 1.5) * 0.15;
        }
      }

      if (!pos) {
        mesh.visible = false;
        this.last[id] = null;
        continue;
      }

      const prev = this.last[id];
      if (prev) {
        const dx = pos.x - prev.x;
        const dz = pos.y - prev.y;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.25) {
          // Sprung (Neuaufbau/Platzierung): keine Rotation, neu ausrichten
          this.resetOrientation(id);
        } else if (dist > 1e-7) {
          this.tmpAxis.set(dz / dist, 0, -dx / dist);
          this.tmpQ.setFromAxisAngle(this.tmpAxis, dist / R);
          mesh.quaternion.premultiply(this.tmpQ);
        }
      } else if (!mesh.visible) {
        this.resetOrientation(id);
      }
      this.last[id] = { x: pos.x, y: pos.y };
      mesh.position.set(pos.x, height, pos.y);
      mesh.visible = height > -0.12;
    }
  }
}
