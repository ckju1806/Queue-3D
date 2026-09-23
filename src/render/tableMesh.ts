import * as THREE from 'three';
import type { TableGeometry } from '../physics/tableGeometry';
import type { Vec2 } from '../physics/vec2';
import { createFeltTexture, createWoodTexture } from './proceduralTextures';

/**
 * 3D-Modell des Billardtisches. Alle spielrelevanten Kanten (Bandennasen,
 * Backen, Taschen) werden direkt aus der Physik-Tischgeometrie abgeleitet.
 *
 * Abbildung Tisch → Three.js: (x, y) → (x, Höhe, y). Die Tuchoberfläche liegt bei Höhe 0.
 */

export const TABLE_DIMENSIONS = {
  railWidth: 0.115,
  railTop: 0.05,
  railBottom: -0.07,
  cushionTop: 0.042,
  apronBottom: -0.25,
  floorY: -0.78,
};

export interface TableMaterials {
  felt: THREE.MeshPhysicalMaterial;
  cushion: THREE.MeshPhysicalMaterial;
  wood: THREE.MeshPhysicalMaterial;
  darkWood: THREE.MeshPhysicalMaterial;
}

/** Tischpunkt → Shape-Koordinaten (für Rotation −90° um X, damit Shape-y = −Tisch-y). */
const sv = (p: Vec2) => new THREE.Vector2(p.x, -p.y);

function arcThrough(center: Vec2, r: number, from: Vec2, to: Vec2, through: Vec2, segments = 14): Vec2[] {
  const a0 = Math.atan2(from.y - center.y, from.x - center.x);
  const a1 = Math.atan2(to.y - center.y, to.x - center.x);
  const ad = Math.atan2(through.y, through.x);
  const TAU = Math.PI * 2;
  const mod = (a: number) => ((a % TAU) + TAU) % TAU;
  const ccw = mod(a1 - a0);
  const sweep = mod(ad - a0) < ccw ? ccw : ccw - TAU;
  const pts: Vec2[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = a0 + (sweep * i) / segments;
    pts.push({ x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r });
  }
  return pts;
}

/**
 * Innenkontur des Holzrahmens (= Außenkante der Banden) mit runden
 * Aussparungen an den sechs Taschen. Liefert zusätzlich die Bögen für die Taschenkappen.
 */
export function railInnerContour(g: TableGeometry): { contour: Vec2[]; arcs: Vec2[][] } {
  const hl = g.halfLength;
  const hw = g.halfWidth;
  const cw = g.cushionWidth;
  const ex = hl + cw;
  const ey = hw + cw;
  const arcs: Vec2[][] = [];
  const contour: Vec2[] = [];

  for (const pk of g.pockets) {
    const c = { x: pk.railCut.x, y: pk.railCut.y };
    const r = pk.railCut.radius;
    let from: Vec2;
    let to: Vec2;
    if (pk.kind === 'corner') {
      const sx = Math.sign(c.x);
      const sy = Math.sign(c.y);
      const s = Math.sqrt(Math.max(0, r * r - cw * cw));
      const onLong = { x: sx * (hl - s), y: sy * ey };
      const onShort = { x: sx * ex, y: sy * (hw - s) };
      // Umlaufsinn gegen den Uhrzeiger: (−,−) und (+,+) kommen von der kurzen Bande
      const fromShort = (sx < 0 && sy < 0) || (sx > 0 && sy > 0);
      from = fromShort ? onShort : onLong;
      to = fromShort ? onLong : onShort;
    } else {
      const sy = Math.sign(c.y);
      const dy = Math.abs(sy * ey - c.y);
      const s = Math.sqrt(Math.max(0, r * r - dy * dy));
      // Untere Bande wird von links nach rechts, obere von rechts nach links durchlaufen
      from = { x: sy * s, y: sy * ey };
      to = { x: -sy * s, y: sy * ey };
    }
    const arc = arcThrough(c, r, from, to, pk.axis);
    arcs.push(arc);
    contour.push(...arc);
  }
  return { contour, arcs };
}

export function createTableMaterials(): TableMaterials {
  const feltTex = createFeltTexture();
  const felt = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#0b5754'),
    map: feltTex,
    roughness: 0.95,
    metalness: 0,
    sheen: 0.35,
    sheenColor: new THREE.Color('#2f8f86'),
    sheenRoughness: 0.8,
  });
  const cushion = felt.clone();
  cushion.color = new THREE.Color('#094a47');
  const woodTex = createWoodTexture('#5a2e17', '#1f0d05', 11);
  const wood = new THREE.MeshPhysicalMaterial({
    map: woodTex,
    color: new THREE.Color('#ffffff'),
    roughness: 0.42,
    clearcoat: 0.7,
    clearcoatRoughness: 0.22,
  });
  const darkTex = createWoodTexture('#3a1c0e', '#140703', 12);
  const darkWood = new THREE.MeshPhysicalMaterial({
    map: darkTex,
    roughness: 0.5,
    clearcoat: 0.45,
    clearcoatRoughness: 0.3,
  });
  // Holztexturen: Welt-UVs sind in Metern → Maserung passend skalieren
  woodTex.repeat.set(1.2, 4);
  darkTex.repeat.set(1.5, 3);
  return { felt, cushion, wood, darkWood };
}

export function buildTable(g: TableGeometry, materials: TableMaterials): THREE.Group {
  const D = TABLE_DIMENSIONS;
  const group = new THREE.Group();
  group.name = 'table';
  const hl = g.halfLength;
  const hw = g.halfWidth;
  const cw = g.cushionWidth;
  const { contour, arcs } = railInnerContour(g);

  // --- Tuch mit Taschenlöchern ---
  const bedShape = new THREE.Shape(contour.map(sv));
  for (const pk of g.pockets) {
    const hole = new THREE.Path();
    hole.absarc(pk.hole.x, -pk.hole.y, pk.hole.radius, 0, Math.PI * 2, true);
    bedShape.holes.push(hole);
  }
  const bed = new THREE.Mesh(new THREE.ShapeGeometry(bedShape, 24), materials.felt);
  bed.rotation.x = -Math.PI / 2;
  bed.receiveShadow = true;
  bed.name = 'felt';
  group.add(bed);

  // --- Banden (Gummi mit Tuch bezogen) ---
  const bevel = 0.004;
  for (const c of g.cushions) {
    const shape = new THREE.Shape(c.points.map(sv));
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: D.cushionTop - 2 * bevel,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: 0.003,
      bevelOffset: -0.003,
      bevelSegments: 3,
    });
    const mesh = new THREE.Mesh(geo, materials.cushion);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = bevel;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // --- Holzrahmen mit Taschenaussparungen ---
  const ox = hl + cw + D.railWidth;
  const oy = hw + cw + D.railWidth;
  const railShape = new THREE.Shape([sv({ x: -ox, y: -oy }), sv({ x: ox, y: -oy }), sv({ x: ox, y: oy }), sv({ x: -ox, y: oy })]);
  railShape.holes.push(new THREE.Path(contour.map(sv)));
  const railGeo = new THREE.ExtrudeGeometry(railShape, {
    depth: D.railTop - D.railBottom - 0.012,
    bevelEnabled: true,
    bevelThickness: 0.006,
    bevelSize: 0.006,
    bevelOffset: -0.006,
    bevelSegments: 3,
    curveSegments: 16,
  });
  const rail = new THREE.Mesh(railGeo, materials.wood);
  rail.rotation.x = -Math.PI / 2;
  rail.position.y = D.railBottom + 0.006;
  rail.castShadow = true;
  rail.receiveShadow = true;
  group.add(rail);

  // --- Taschen: Lederkappen auf dem Rahmen, Becher unter dem Loch ---
  const leather = new THREE.MeshStandardMaterial({ color: '#1d1410', roughness: 0.55, metalness: 0.1 });
  const pocketInside = new THREE.MeshStandardMaterial({ color: '#060606', roughness: 0.95, side: THREE.DoubleSide });
  for (let i = 0; i < g.pockets.length; i++) {
    const pk = g.pockets[i];
    const arc = arcs[i];
    const curve = new THREE.CatmullRomCurve3(arc.map((p) => new THREE.Vector3(p.x, D.railTop - 0.004, p.y)));
    const rim = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.011, 10, false), leather);
    rim.castShadow = true;
    group.add(rim);

    const cupDepth = 0.13;
    const cup = new THREE.Mesh(
      new THREE.CylinderGeometry(pk.hole.radius, pk.hole.radius * 0.88, cupDepth, 28, 1, true),
      pocketInside,
    );
    cup.position.set(pk.hole.x, -cupDepth / 2 - 0.001, pk.hole.y);
    group.add(cup);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(pk.hole.radius * 0.88, 28), pocketInside);
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.set(pk.hole.x, -cupDepth, pk.hole.y);
    group.add(bottom);
    const ring = new THREE.Mesh(new THREE.RingGeometry(pk.hole.radius - 0.001, pk.hole.radius + 0.006, 40), leather);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pk.hole.x, 0.0006, pk.hole.y);
    group.add(ring);
  }

  // --- Diamanten (Markierungen) ---
  const pearl = new THREE.MeshStandardMaterial({ color: '#f3ead6', roughness: 0.25, metalness: 0.2, emissive: '#3a342a' });
  const diamondGeo = new THREE.CircleGeometry(0.0085, 4);
  const addDiamond = (x: number, y: number) => {
    const m = new THREE.Mesh(diamondGeo, pearl);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, D.railTop + 0.0008, y);
    group.add(m);
  };
  const railMid = cw + D.railWidth * 0.5;
  for (let k = 1; k <= 7; k++) {
    if (k === 4) continue;
    const x = -hl + (k * 2 * hl) / 8;
    addDiamond(x, -(hw + railMid));
    addDiamond(x, hw + railMid);
  }
  for (let k = 1; k <= 3; k++) {
    const y = -hw + (k * 2 * hw) / 4;
    addDiamond(-(hl + railMid), y);
    addDiamond(hl + railMid, y);
  }

  // --- Fußpunkt-Markierung ---
  const spot = new THREE.Mesh(
    new THREE.CircleGeometry(0.005, 20),
    new THREE.MeshStandardMaterial({ color: '#d8e6e2', roughness: 0.8 }),
  );
  spot.rotation.x = -Math.PI / 2;
  spot.position.set(g.footSpot.x, 0.0004, g.footSpot.y);
  group.add(spot);

  // --- Zarge, Sockel und Beine ---
  // Zarge als Rahmen (nicht massiv), damit man durch die Taschenlöcher in die dunklen Becher sieht
  const apronH = D.railBottom - D.apronBottom;
  const board = 0.05;
  const aw = ox * 2 - 0.05;
  const ad = oy * 2 - 0.05;
  const boards: Array<[number, number, number, number]> = [
    [0, -(ad - board) / 2, aw, board],
    [0, (ad - board) / 2, aw, board],
    [-(aw - board) / 2, 0, board, ad],
    [(aw - board) / 2, 0, board, ad],
  ];
  for (const [x, z, w, d] of boards) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, apronH, d), materials.darkWood);
    m.position.set(x, D.railBottom - apronH / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  const floorPlate = new THREE.Mesh(
    new THREE.BoxGeometry(aw - 0.02, 0.02, ad - 0.02),
    new THREE.MeshStandardMaterial({ color: '#0b0706', roughness: 0.9 }),
  );
  floorPlate.position.y = D.apronBottom + 0.02;
  group.add(floorPlate);
  // Unterseite des Tuchs (Schiefer) – verhindert Durchblick von unten/seitlich
  const slate = new THREE.Mesh(new THREE.ShapeGeometry(bedShape, 24), new THREE.MeshStandardMaterial({ color: '#0b0706', roughness: 1, side: THREE.BackSide }));
  slate.rotation.x = -Math.PI / 2;
  slate.position.y = -0.03;
  group.add(slate);
  // Schattenfuge unter dem Rahmen
  const trim = new THREE.Mesh(
    new THREE.BoxGeometry(ox * 2 - 0.03, 0.02, oy * 2 - 0.03),
    new THREE.MeshStandardMaterial({ color: '#b58a4a', roughness: 0.35, metalness: 0.6 }),
  );
  trim.position.y = D.apronBottom + 0.012;
  group.add(trim);

  const legH = D.apronBottom - D.floorY;
  const legGeo = new THREE.CylinderGeometry(0.065, 0.05, legH, 24);
  const footGeo = new THREE.CylinderGeometry(0.075, 0.08, 0.05, 24);
  const legPositions: Array<[number, number]> = [
    [-ox + 0.2, -oy + 0.17],
    [ox - 0.2, -oy + 0.17],
    [-ox + 0.2, oy - 0.17],
    [ox - 0.2, oy - 0.17],
    [0, -oy + 0.17],
    [0, oy - 0.17],
  ];
  for (const [x, z] of legPositions) {
    const leg = new THREE.Mesh(legGeo, materials.darkWood);
    leg.position.set(x, D.apronBottom - legH / 2, z);
    leg.castShadow = true;
    group.add(leg);
    const foot = new THREE.Mesh(footGeo, materials.darkWood);
    foot.position.set(x, D.floorY + 0.025, z);
    foot.castShadow = true;
    group.add(foot);
  }
  return group;
}
