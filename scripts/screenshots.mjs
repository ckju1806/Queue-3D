/**
 * Erzeugt die Screenshots für docs/spielanleitung.md (optional, nicht Teil von `npm test`).
 *
 * Voraussetzung: laufender Server (`npm run build && npm run preview`) und ein installiertes
 * Playwright (z. B. global). Das Projekt selbst hängt nicht davon ab.
 *
 * Aufruf:  node scripts/screenshots.mjs [URL] [Ausgabeordner]
 * Beispiel: node scripts/screenshots.mjs http://localhost:4173 docs/bilder
 *
 * Hinweis: Zum schnellen Vorspulen rollender Kugeln wird die Spiellogik über den
 * Debug-Zugriff (?debug) direkt aktualisiert – nur für die Bilderzeugung.
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  console.error('Playwright ist nicht installiert (optional). Beispiel: "npm i -g playwright".');
  process.exit(2);
}

const baseUrl = process.argv[2] ?? 'http://localhost:4173';
const outDir = process.argv[3] ?? 'docs/bilder';
mkdirSync(outDir, { recursive: true });

const browser = await playwright.chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(180000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const shot = async (name) => {
  await frames(3);
  await page.screenshot({ path: join(outDir, `${name}.jpg`), type: 'jpeg', quality: 86 });
  console.log(`✓ ${name}.jpg`);
};
/** Wartet eine Anzahl gerenderter Frames ab. */
const frames = (n) =>
  page.evaluate(
    (n) =>
      new Promise((res) => {
        let i = 0;
        const tick = () => (++i >= n ? res() : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      }),
    n,
  );
const state = () => page.evaluate(() => window.__poolLounge.session.state);
const toScreen = (x, y) =>
  page.evaluate(
    ([x, y]) => {
      const { renderer, session } = window.__poolLounge;
      const v = renderer.camera.position.clone().set(x, session.world.ballRadius, y).project(renderer.camera);
      const r = renderer.renderer.domElement.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    },
    [x, y],
  );
/** Spult die Spiellogik ohne Rendern vor, bis die Kugeln ruhen (nur für Screenshots). */
const fastForward = () =>
  page.evaluate(() => {
    const s = window.__poolLounge.session;
    for (let i = 0; i < 60 * 60 && ['striking', 'rolling', 'evaluating'].includes(s.state); i++) s.update(1 / 60);
    return s.state;
  });
/** Kamera sofort in die Zielposition bringen (Dämpfung abkürzen). */
const settleCamera = () =>
  page.evaluate(() => {
    const c = window.__poolLounge.renderer.cameraCtl;
    for (let i = 0; i < 60; i++) c.update(0.1);
  });

await page.goto(`${baseUrl}/?debug`, { waitUntil: 'load' });
await frames(4);
await shot('01-hauptmenue');

// Training: Ball in Hand im Anstoßraum
await page.click('[data-action="start-training"]');
await settleCamera();
let p = await toScreen(-0.72, 0.12);
await page.mouse.move(p.x, p.y, { steps: 4 });
await shot('02-ball-in-hand');
await page.mouse.click(p.x, p.y);

// Zielen auf das Dreieck
const apex = await page.evaluate(() => {
  const w = window.__poolLounge.session.world;
  const g = w.geometry;
  return w.balls
    .filter((b) => b.onTable && b.id !== 0)
    .sort((a, b) => Math.hypot(a.x - g.footSpot.x, a.y - g.footSpot.y) - Math.hypot(b.x - g.footSpot.x, b.y - g.footSpot.y))[0];
});
p = await toScreen(apex.x, apex.y);
await page.mouse.move(p.x, p.y, { steps: 6 });
await shot('03-zielen');

// Aufladen (Stärkeanzeige)
await page.mouse.down();
await page.waitForFunction(() => window.__poolLounge.session.power > 0.7, null, { polling: 100 });
await shot('04-aufladen');
await page.mouse.up();
await page.waitForFunction(() => window.__poolLounge.session.state === 'rolling', null, { polling: 100 });
console.log('Anstoß:', await fastForward());

// Trainings-Zielhilfe: auf die nächste Kugel zielen
const target = await page.evaluate(() => {
  const w = window.__poolLounge.session.world;
  const c = w.balls[0];
  return w.balls
    .filter((b) => b.onTable && b.id !== 0 && b.id !== 8)
    .sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))
    .map((b) => ({ x: b.x + 0.012, y: b.y + 0.012 }))[0];
});
if ((await state()) === 'ballInHand') {
  const q = await toScreen(-0.5, 0);
  await page.mouse.click(q.x, q.y);
}
p = await toScreen(target.x, target.y);
await page.mouse.move(p.x, p.y, { steps: 6 });
await shot('05-training-zielhilfe');

// Draufsicht
await page.keyboard.press('v');
await settleCamera();
await page.mouse.move(p.x + 1, p.y + 1);
p = await toScreen(target.x, target.y);
await page.mouse.move(p.x, p.y, { steps: 3 });
await shot('06-draufsicht');
await page.keyboard.press('v');
await settleCamera();

// Pausemenü
await page.keyboard.press('Escape');
await shot('07-pause');
await page.click('#screen-pause [data-action="to-menu"]');

// Gegen Computer: menschlicher Anstoß, dann Computerzug
await page.click('[data-action="diff-medium"]');
await page.click('[data-action="start-ai"]');
await settleCamera();
p = await toScreen(-0.72, 0);
await page.mouse.click(p.x, p.y);
p = await toScreen(apex.x, apex.y);
await page.mouse.move(p.x, p.y, { steps: 4 });
await page.mouse.down();
await page.waitForFunction(() => window.__poolLounge.session.power > 0.9, null, { polling: 100 });
await page.mouse.up();
await page.waitForFunction(() => window.__poolLounge.session.state === 'rolling', null, { polling: 100 });
await fastForward();
const aiTurn = await page.evaluate(() => window.__poolLounge.session.isAiTurn());
if (aiTurn) {
  await page.waitForFunction(() => ['aiming', 'charging'].includes(window.__poolLounge.session.state), null, { polling: 100 });
  await shot('08-gegen-computer');
} else {
  // Anstoß war erfolgreich → Mensch bleibt am Zug; HUD trotzdem festhalten
  await shot('08-gegen-computer');
}

console.log(errors.length ? `Fehler: ${errors.join(' | ')}` : 'Keine Laufzeitfehler');
await browser.close();
