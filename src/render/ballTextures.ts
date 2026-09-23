import * as THREE from 'three';
import { ballColor, ballKind, CUE_BALL } from '../game/balls';

/**
 * Kugeltexturen als Canvas (equirektangular für THREE.SphereGeometry).
 * Volle Kugeln: vollfarbig. Halbe Kugeln: weiß mit breitem Farbband.
 * Nummern stehen in weißen Kreisen auf zwei gegenüberliegenden Seiten.
 */

const W = 1024;
const H = 512;
const cache = new Map<number, THREE.CanvasTexture>();

export function getBallTexture(id: number): THREE.CanvasTexture {
  const cached = cache.get(id);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const kind = ballKind(id);
  const color = ballColor(id);
  const ivory = '#f7f3e8';

  if (kind === 'cue') {
    ctx.fillStyle = ivory;
    ctx.fillRect(0, 0, W, H);
    // Dezente Punkte machen die Rotation der Weißen sichtbar
    ctx.fillStyle = '#c0392b';
    const dots: Array<[number, number]> = [
      [0.12, 0.5],
      [0.37, 0.28],
      [0.62, 0.5],
      [0.87, 0.72],
      [0.37, 0.78],
      [0.87, 0.22],
    ];
    for (const [u, v] of dots) drawSpot(ctx, u * W, v * H, H * 0.028);
  } else if (kind === 'stripe') {
    ctx.fillStyle = ivory;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = color;
    const band = H * 0.2; // ±36° Breite um den Äquator
    ctx.fillRect(0, H / 2 - band, W, band * 2);
  } else {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, W, H);
  }

  if (id !== CUE_BALL) {
    for (const u of [0.25, 0.75]) drawNumber(ctx, u * W, H / 2, id);
  }

  // Leichte Lichtvariation für Tiefe
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(255,255,255,0.05)');
  g.addColorStop(0.5, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.06)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  cache.set(id, tex);
  return tex;
}

function drawSpot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  // Auf der Kugel kreisrund: horizontal um 1/cos(Breite) strecken
  const lat = ((0.5 - y / H) * Math.PI);
  const stretch = 1 / Math.max(0.2, Math.cos(lat));
  ctx.beginPath();
  ctx.ellipse(x, y, r * stretch, r, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawNumber(ctx: CanvasRenderingContext2D, x: number, y: number, id: number) {
  const r = H * 0.125;
  ctx.fillStyle = '#fbf8f0';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.font = `bold ${Math.round(H * (id >= 10 ? 0.15 : 0.18))}px "Segoe UI", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(id), x, y + H * 0.008);
  if (id === 6 || id === 9) {
    // Unterstrich zur Unterscheidung von 6 und 9
    ctx.fillRect(x - H * 0.04, y + H * 0.075, H * 0.08, H * 0.012);
  }
}
