import * as THREE from 'three';
import type { AimPreview } from '../aim/aimPreview';
import type { TableGeometry } from '../physics/tableGeometry';
import type { Vec2 } from '../physics/vec2';

/** Farbe der Geisterkugel je nach Treffer. */
export type GhostTone = 'legal' | 'illegal' | 'scratch' | 'neutral';

const TONES: Record<GhostTone, string> = {
  legal: '#ffffff',
  neutral: '#ffffff',
  illegal: '#ff5a4f',
  scratch: '#ffb347',
};

const Y = 0.0016; // knapp über dem Tuch

function ribbonMaterial(color: string, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
}

/** Flaches Band auf dem Tuch von a nach b (dezente Linie mit Weltbreite). */
class Ribbon {
  readonly mesh: THREE.Mesh;
  constructor(material: THREE.MeshBasicMaterial, private readonly width: number) {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.renderOrder = 5;
    this.mesh.visible = false;
  }
  set(a: Vec2, b: Vec2, y = Y): void {
    const dx = b.x - a.x;
    const dz = b.y - a.y;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    this.mesh.position.set((a.x + b.x) / 2, y, (a.y + b.y) / 2);
    this.mesh.rotation.set(0, -Math.atan2(dz, dx), 0);
    this.mesh.scale.set(len, 1, this.width);
  }
  hide(): void {
    this.mesh.visible = false;
  }
}

export class AimOverlay {
  readonly group = new THREE.Group();
  private readonly aimLine: Ribbon;
  private readonly objectLine: Ribbon;
  private readonly cueLine: Ribbon;
  private readonly ghostRing: THREE.Mesh;
  private readonly ghostBall: THREE.Mesh;
  private readonly contactDot: THREE.Mesh;
  private readonly ghostRingMat: THREE.MeshBasicMaterial;
  private readonly ghostBallMat: THREE.MeshBasicMaterial;
  private readonly placementRing: THREE.Mesh;
  private readonly placementMat: THREE.MeshBasicMaterial;
  private readonly kitchen: THREE.Mesh;
  private readonly headLine: Ribbon;

  constructor(
    private readonly geometry: TableGeometry,
    private readonly radius: number,
  ) {
    this.group.name = 'aim-overlay';
    const R = radius;
    this.aimLine = new Ribbon(ribbonMaterial('#ffffff', 0.5), 0.0035);
    this.objectLine = new Ribbon(ribbonMaterial('#a8f0cf', 0.7), 0.0035);
    this.cueLine = new Ribbon(ribbonMaterial('#a9cbff', 0.5), 0.0028);
    this.group.add(this.aimLine.mesh, this.objectLine.mesh, this.cueLine.mesh);

    this.ghostRingMat = ribbonMaterial('#ffffff', 0.75);
    this.ghostRing = new THREE.Mesh(new THREE.RingGeometry(R - 0.0028, R, 48), this.ghostRingMat);
    this.ghostRing.rotation.x = -Math.PI / 2;
    this.ghostRing.renderOrder = 6;
    this.ghostBallMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.16, depthWrite: false });
    this.ghostBall = new THREE.Mesh(new THREE.SphereGeometry(R, 24, 16), this.ghostBallMat);
    this.ghostBall.renderOrder = 6;
    this.contactDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.0035, 12, 8),
      new THREE.MeshBasicMaterial({ color: '#fff6c4', depthTest: false, transparent: true, opacity: 0.95 }),
    );
    this.contactDot.renderOrder = 7;
    this.group.add(this.ghostRing, this.ghostBall, this.contactDot);

    this.placementMat = ribbonMaterial('#58d68d', 0.85);
    this.placementRing = new THREE.Mesh(new THREE.RingGeometry(R + 0.004, R + 0.01, 48), this.placementMat);
    this.placementRing.rotation.x = -Math.PI / 2;
    this.placementRing.renderOrder = 6;
    this.group.add(this.placementRing);

    const g = geometry;
    const kw = g.headStringX + g.halfLength;
    this.kitchen = new THREE.Mesh(new THREE.PlaneGeometry(kw, g.halfWidth * 2), ribbonMaterial('#ffffff', 0.05));
    this.kitchen.rotation.x = -Math.PI / 2;
    this.kitchen.position.set(-g.halfLength + kw / 2, Y * 0.5, 0);
    this.headLine = new Ribbon(ribbonMaterial('#ffffff', 0.35), 0.003);
    this.group.add(this.kitchen, this.headLine.mesh);
    this.hideAll();
  }

  hideAll(): void {
    this.hideAim();
    this.hidePlacement();
  }

  hideAim(): void {
    this.aimLine.hide();
    this.objectLine.hide();
    this.cueLine.hide();
    this.ghostRing.visible = false;
    this.ghostBall.visible = false;
    this.contactDot.visible = false;
  }

  hidePlacement(): void {
    this.placementRing.visible = false;
    this.kitchen.visible = false;
    this.headLine.hide();
  }

  showAim(preview: AimPreview, tone: GhostTone, showFollowLines: boolean, dim: boolean): void {
    const R = this.radius;
    const opacityScale = dim ? 0.55 : 1;
    (this.aimLine.mesh.material as THREE.MeshBasicMaterial).opacity = 0.5 * opacityScale;
    this.aimLine.set(preview.origin, preview.ghost);

    const color = TONES[tone];
    this.ghostRingMat.color.set(color);
    this.ghostBallMat.color.set(color);
    this.ghostRingMat.opacity = 0.8 * opacityScale;
    this.ghostRing.visible = true;
    this.ghostRing.position.set(preview.ghost.x, Y + 0.0002, preview.ghost.y);
    this.ghostBall.visible = true;
    this.ghostBall.position.set(preview.ghost.x, R, preview.ghost.y);

    if (preview.hit.type === 'ball' && preview.objectDirection && preview.objectPosition) {
      const n = preview.objectDirection;
      this.contactDot.visible = true;
      this.contactDot.position.set(preview.ghost.x + n.x * R, R, preview.ghost.y + n.y * R);
      if (showFollowLines) {
        const len = 0.1 + 0.45 * preview.transfer;
        const o = preview.objectPosition;
        this.objectLine.set(o, { x: o.x + n.x * len, y: o.y + n.y * len });
        if (preview.cueDirection) {
          const c = preview.cueDirection;
          const g = preview.ghost;
          this.cueLine.set(g, { x: g.x + c.x * 0.22, y: g.y + c.y * 0.22 });
        } else {
          this.cueLine.hide();
        }
      } else {
        this.objectLine.hide();
        this.cueLine.hide();
      }
    } else {
      this.contactDot.visible = false;
      this.objectLine.hide();
      if (showFollowLines && preview.hit.type === 'cushion') {
        // Abprallrichtung an der Bande (nur Trainingshilfe)
        const d = preview.direction;
        const nrm = preview.hit.normal;
        const dn = d.x * nrm.x + d.y * nrm.y;
        const r = { x: d.x - 2 * dn * nrm.x, y: d.y - 2 * dn * nrm.y };
        const g = preview.ghost;
        this.cueLine.set(g, { x: g.x + r.x * 0.25, y: g.y + r.y * 0.25 });
      } else {
        this.cueLine.hide();
      }
    }
  }

  showPlacement(pos: Vec2, valid: boolean, kitchenOnly: boolean): void {
    this.placementMat.color.set(valid ? '#58d68d' : '#ff5a4f');
    this.placementRing.visible = true;
    this.placementRing.position.set(pos.x, Y + 0.0004, pos.y);
    this.kitchen.visible = kitchenOnly;
    if (kitchenOnly) {
      const g = this.geometry;
      this.headLine.set({ x: g.headStringX, y: -g.halfWidth }, { x: g.headStringX, y: g.halfWidth });
    } else {
      this.headLine.hide();
    }
  }
}
