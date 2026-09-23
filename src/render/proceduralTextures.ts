import * as THREE from 'three';
import { createRng } from '../game/random';

/**
 * Prozedurale Texturen (Canvas) – keine externen Bilddateien nötig.
 * Alle Texturen sind deterministisch (fester Seed), damit das Spiel bei
 * jedem Start gleich aussieht.
 */

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D wird nicht unterstützt');
  return [canvas, ctx];
}

function toTexture(canvas: HTMLCanvasElement, repeat = 1, srgb = true): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 8;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Feines Filzrauschen (Graustufen, als Farb- und Rauheitsmodulation). */
export function createFeltTexture(): THREE.CanvasTexture {
  const size = 512;
  const [canvas, ctx] = makeCanvas(size, size);
  const rng = createRng(1234);
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const n = 222 + Math.floor((rng() - 0.5) * 34);
    img.data[i * 4] = n;
    img.data[i * 4 + 1] = n;
    img.data[i * 4 + 2] = n;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // Sehr weiche, großflächige Wolken für ein lebendiges Tuch
  for (let i = 0; i < 60; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const r = 30 + rng() * 90;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.025 + rng() * 0.03;
    const light = rng() < 0.5;
    g.addColorStop(0, light ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return toTexture(canvas, 6);
}

/** Holzmaserung für Rahmen, Beine und Queue. */
export function createWoodTexture(base: string, dark: string, seed = 7, width = 1024, height = 256): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(width, height);
  const rng = createRng(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);
  // Längsmaserung
  for (let i = 0; i < 180; i++) {
    const y0 = rng() * height;
    const amp = 2 + rng() * 6;
    const freq = 0.004 + rng() * 0.01;
    const phase = rng() * Math.PI * 2;
    ctx.strokeStyle = dark;
    ctx.globalAlpha = 0.05 + rng() * 0.12;
    ctx.lineWidth = 0.6 + rng() * 2.2;
    ctx.beginPath();
    for (let x = 0; x <= width; x += 8) {
      const y = y0 + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 3.1 + phase) * amp * 0.25;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Einzelne Poren
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = dark;
  for (let i = 0; i < 1400; i++) {
    ctx.fillRect(rng() * width, rng() * height, 1 + rng() * 5, 0.8);
  }
  ctx.globalAlpha = 1;
  return toTexture(canvas, 1);
}

/** Dielenboden. */
export function createFloorTexture(): THREE.CanvasTexture {
  const w = 1024;
  const h = 1024;
  const [canvas, ctx] = makeCanvas(w, h);
  const rng = createRng(99);
  const boards = 8;
  const bh = h / boards;
  for (let b = 0; b < boards; b++) {
    let x = -rng() * 400;
    while (x < w) {
      const len = 300 + rng() * 420;
      const tone = 38 + Math.floor(rng() * 16);
      ctx.fillStyle = `rgb(${tone + 18},${tone + 8},${tone})`;
      ctx.fillRect(x, b * bh, len, bh);
      ctx.globalAlpha = 0.12;
      ctx.strokeStyle = '#140a05';
      for (let k = 0; k < 10; k++) {
        const yy = b * bh + rng() * bh;
        ctx.beginPath();
        ctx.moveTo(x, yy);
        ctx.bezierCurveTo(x + len * 0.3, yy + (rng() - 0.5) * 6, x + len * 0.6, yy + (rng() - 0.5) * 6, x + len, yy);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#120904';
      ctx.fillRect(x, b * bh, 2, bh);
      x += len;
    }
    ctx.fillStyle = '#0d0603';
    ctx.fillRect(0, b * bh, w, 2);
  }
  return toTexture(canvas, 4);
}

/** Dezenter Teppich unter dem Tisch. */
export function createRugTexture(): THREE.CanvasTexture {
  const w = 1024;
  const h = 768;
  const [canvas, ctx] = makeCanvas(w, h);
  ctx.fillStyle = '#2a1414';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#8a6a3a';
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 6;
  ctx.strokeRect(40, 40, w - 80, h - 80);
  ctx.lineWidth = 2;
  ctx.strokeRect(62, 62, w - 124, h - 124);
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = '#c69a5b';
  for (let y = 100; y < h - 100; y += 48) {
    for (let x = 100; x < w - 100; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, y - 10);
      ctx.lineTo(x + 10, y);
      ctx.lineTo(x, y + 10);
      ctx.lineTo(x - 10, y);
      ctx.closePath();
      ctx.fill();
    }
  }
  const rng = createRng(5);
  ctx.globalAlpha = 0.08;
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = rng() < 0.5 ? '#000' : '#fff';
    ctx.fillRect(rng() * w, rng() * h, 1, 1);
  }
  ctx.globalAlpha = 1;
  const tex = toTexture(canvas, 1);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** Wandbespannung mit feinen Paneelen. */
export function createWallTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 512;
  const [canvas, ctx] = makeCanvas(w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#1c2226');
  g.addColorStop(1, '#161b1e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.035)';
  ctx.lineWidth = 2;
  for (let x = 0; x < w; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  const rng = createRng(77);
  ctx.globalAlpha = 0.05;
  for (let i = 0; i < 4000; i++) {
    ctx.fillStyle = rng() < 0.5 ? '#000' : '#fff';
    ctx.fillRect(rng() * w, rng() * h, 1, 1);
  }
  ctx.globalAlpha = 1;
  return toTexture(canvas, 3);
}
