import * as THREE from 'three';

/**
 * Queue als Drehkörper (Lathe) aus mehreren Materialsegmenten.
 * Lokale +y-Achse zeigt von der Spitze (y = 0) zum Griff.
 */
export const CUE_LENGTH = 1.47;

interface Segment {
  from: number;
  to: number;
  r0: number;
  r1: number;
  material: THREE.Material;
}

export function buildCue(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'cue';
  const maple = new THREE.MeshPhysicalMaterial({ color: '#dcbf8f', roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2 });
  const ferrule = new THREE.MeshStandardMaterial({ color: '#f4f0e6', roughness: 0.3 });
  const tip = new THREE.MeshStandardMaterial({ color: '#3d6fa8', roughness: 0.85 });
  const joint = new THREE.MeshStandardMaterial({ color: '#c8a45c', roughness: 0.25, metalness: 0.9 });
  const forearm = new THREE.MeshPhysicalMaterial({ color: '#3b1a0c', roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15 });
  const wrap = new THREE.MeshStandardMaterial({ color: '#1b1b1d', roughness: 0.9 });
  const butt = new THREE.MeshPhysicalMaterial({ color: '#27110a', roughness: 0.3, clearcoat: 0.8 });
  const bumper = new THREE.MeshStandardMaterial({ color: '#0c0c0c', roughness: 0.7 });

  const segments: Segment[] = [
    { from: 0, to: 0.011, r0: 0.0061, r1: 0.0064, material: tip },
    { from: 0.011, to: 0.034, r0: 0.0064, r1: 0.0066, material: ferrule },
    { from: 0.034, to: 0.72, r0: 0.0066, r1: 0.0098, material: maple },
    { from: 0.72, to: 0.738, r0: 0.0106, r1: 0.0106, material: joint },
    { from: 0.738, to: 1.04, r0: 0.0106, r1: 0.0124, material: forearm },
    { from: 1.04, to: 1.3, r0: 0.0127, r1: 0.0133, material: wrap },
    { from: 1.3, to: 1.452, r0: 0.0134, r1: 0.0145, material: butt },
    { from: 1.452, to: CUE_LENGTH, r0: 0.0145, r1: 0.0128, material: bumper },
  ];

  for (const s of segments) {
    const pts = [
      new THREE.Vector2(0, s.from),
      new THREE.Vector2(s.r0, s.from),
      new THREE.Vector2(s.r1, s.to),
      new THREE.Vector2(0, s.to),
    ];
    const mesh = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), s.material);
    mesh.castShadow = true;
    group.add(mesh);
  }
  // Dezente Intarsien am Vorderschaft
  const inlayMat = new THREE.MeshStandardMaterial({ color: '#e9dcc0', roughness: 0.4 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const inlay = new THREE.Mesh(new THREE.BoxGeometry(0.0015, 0.12, 0.004), inlayMat);
    inlay.position.set(Math.cos(a) * 0.0114, 0.93, Math.sin(a) * 0.0114);
    inlay.rotation.y = -a;
    group.add(inlay);
  }
  group.visible = false;
  return group;
}
