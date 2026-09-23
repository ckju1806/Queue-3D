import * as THREE from 'three';
import { createFloorTexture, createRugTexture, createWallTexture, createWoodTexture } from './proceduralTextures';
import { TABLE_DIMENSIONS } from './tableMesh';

/**
 * Ruhige, zurückhaltende Billard-Lounge: dunkler Raum, Dielenboden, Teppich,
 * Tischlampe mit drei Schirmen. Das Hauptlicht kommt von oben und wirft
 * weiche Schatten; Wandleuchten sorgen für warmes Umgebungslicht.
 */

export interface LoungeLights {
  key: THREE.DirectionalLight;
}

export function buildLounge(scene: THREE.Scene): LoungeLights {
  const floorY = TABLE_DIMENSIONS.floorY;
  const roomW = 14;
  const roomD = 11;
  const roomH = 3.6;

  // Boden
  const floorTex = createFloorTexture();
  floorTex.repeat.set(5, 5);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(roomW, roomD),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.62, metalness: 0.02 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = floorY;
  floor.receiveShadow = true;
  scene.add(floor);

  // Teppich unter dem Tisch
  const rug = new THREE.Mesh(
    new THREE.PlaneGeometry(4.8, 3.5),
    new THREE.MeshStandardMaterial({ map: createRugTexture(), roughness: 0.97 }),
  );
  rug.rotation.x = -Math.PI / 2;
  rug.position.y = floorY + 0.003;
  rug.receiveShadow = true;
  scene.add(rug);

  // Wände und Decke
  const wallTex = createWallTexture();
  wallTex.repeat.set(6, 2);
  const walls = new THREE.Mesh(
    new THREE.BoxGeometry(roomW, roomH, roomD),
    new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.92, side: THREE.BackSide }),
  );
  walls.position.y = floorY + roomH / 2;
  walls.receiveShadow = true;
  scene.add(walls);

  // Holzvertäfelung im unteren Wandbereich
  const panelTex = createWoodTexture('#2b150b', '#0e0603', 31);
  panelTex.repeat.set(4, 1);
  const panelMat = new THREE.MeshStandardMaterial({ map: panelTex, roughness: 0.55 });
  const panelH = 1.05;
  const panels: Array<[number, number, number, number]> = [
    [0, -roomD / 2 + 0.03, roomW, 0.06],
    [0, roomD / 2 - 0.03, roomW, 0.06],
    [-roomW / 2 + 0.03, 0, 0.06, roomD],
    [roomW / 2 - 0.03, 0, 0.06, roomD],
  ];
  for (const [x, z, w, d] of panels) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(w, panelH, d), panelMat);
    p.position.set(x, floorY + panelH / 2, z);
    p.receiveShadow = true;
    scene.add(p);
  }

  // Wandleuchten (warm) mit schwachem Punktlicht
  const sconceMat = new THREE.MeshStandardMaterial({ color: '#ffd9a0', emissive: '#ffb45e', emissiveIntensity: 2.2 });
  const sconcePositions: Array<[number, number]> = [
    [-3.2, -roomD / 2 + 0.08],
    [3.2, -roomD / 2 + 0.08],
    [-3.2, roomD / 2 - 0.08],
    [3.2, roomD / 2 - 0.08],
  ];
  sconcePositions.forEach(([x, z], i) => {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.34, 0.06), sconceMat);
    s.position.set(x, floorY + 1.75, z);
    scene.add(s);
    if (i < 2) {
      const pl = new THREE.PointLight('#ffb870', 4.5, 7, 2);
      pl.position.set(x, floorY + 1.7, z + 0.35);
      scene.add(pl);
    }
  });

  // Tischlampe: Träger mit drei Schirmen
  const lampY = 1.0;
  const brass = new THREE.MeshStandardMaterial({ color: '#8c6a37', roughness: 0.35, metalness: 0.85 });
  const shadeMat = new THREE.MeshStandardMaterial({ color: '#0f3b36', roughness: 0.45, metalness: 0.3, side: THREE.DoubleSide });
  const shadeInner = new THREE.MeshStandardMaterial({ color: '#fff4dc', emissive: '#ffe2a8', emissiveIntensity: 1.2, side: THREE.BackSide });
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.035, 0.08), brass);
  bar.position.set(0, lampY + 0.2, 0);
  scene.add(bar);
  for (const x of [-0.8, 0.8]) {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, roomH - lampY - 0.2 + floorY, 8), brass);
    rod.position.set(x, lampY + 0.2 + (roomH + floorY - lampY - 0.2) / 2, 0);
    scene.add(rod);
  }
  for (const x of [-0.68, 0, 0.68]) {
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.2, 0.17, 32, 1, true), shadeMat);
    shade.position.set(x, lampY + 0.085, 0);
    scene.add(shade);
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.195, 0.165, 32, 1, true), shadeInner);
    inner.position.copy(shade.position);
    scene.add(inner);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 16, 12),
      new THREE.MeshStandardMaterial({ color: '#fff7e6', emissive: '#fff1d0', emissiveIntensity: 3 }),
    );
    bulb.position.set(x, lampY + 0.06, 0);
    scene.add(bulb);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 8), brass);
    stem.position.set(x, lampY + 0.2 - 0.03, 0);
    scene.add(stem);

    const spot = new THREE.SpotLight('#ffe7c2', 9, 4, 0.95, 0.75, 2);
    spot.position.set(x, lampY + 0.05, 0);
    spot.target.position.set(x, 0, 0);
    scene.add(spot, spot.target);
  }

  // Hauptlicht mit weichen Schatten (fast senkrecht von oben)
  const key = new THREE.DirectionalLight('#fff3e0', 1.9);
  key.position.set(0.35, 4, 0.55);
  key.target.position.set(0, 0, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera;
  sc.left = -1.9;
  sc.right = 1.9;
  sc.top = 1.9;
  sc.bottom = -1.9;
  sc.near = 1;
  sc.far = 7;
  key.shadow.radius = 4;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.012;
  scene.add(key, key.target);

  // Dezentes Umgebungslicht
  const hemi = new THREE.HemisphereLight('#ffe9cc', '#1a1410', 0.35);
  scene.add(hemi);

  return { key };
}
