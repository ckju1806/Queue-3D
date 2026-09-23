/**
 * Browser-Smoke-Test für Pool Lounge 3D (optional, nicht Teil von `npm test`).
 *
 * Voraussetzung: laufender Server (`npm run preview` → http://localhost:4173) und
 * ein installiertes Playwright (z. B. global). Das Projekt selbst hängt nicht davon ab.
 *
 * Aufruf:  node scripts/smoke-test.mjs [URL] [Ausgabeordner]
 * Beispiel: node scripts/smoke-test.mjs http://localhost:4173 tmp/smoke
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  console.error('Playwright ist nicht installiert. Bitte z. B. "npm i -g playwright" ausführen (optional).');
  process.exit(2);
}

const baseUrl = process.argv[2] ?? 'http://localhost:4173';
const outDir = process.argv[3] ?? 'tmp/smoke';
mkdirSync(outDir, { recursive: true });

const browser = await playwright.chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(120000);
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ' – ' + detail : ''}`);
};
const shot = (name) => page.screenshot({ path: join(outDir, `${name}.png`) });
const state = () => page.evaluate(() => window.__poolLounge.session.state);
/** Tischpunkt → Bildschirmkoordinate. */
const toScreen = (x, y) =>
  page.evaluate(
    ([x, y]) => {
      const { renderer, session } = window.__poolLounge;
      const cam = renderer.camera;
      const v = cam.position.clone();
      v.set(x, session.world.ballRadius, y).project(cam);
      const rect = renderer.renderer.domElement.getBoundingClientRect();
      return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
    },
    [x, y],
  );
const waitFor = async (fn, timeout = 60000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await fn()) return true;
    await page.waitForTimeout(100);
  }
  return false;
};

const quality = process.env.SMOKE_QUALITY ?? 'high';
await page.goto(`${baseUrl}/?debug&quality=${quality}`, { waitUntil: 'load' });
await page.waitForTimeout(1500);
const webgl = await page.evaluate(() => !!window.__poolLounge?.renderer?.renderer?.getContext());
check('Seite lädt, WebGL-Kontext vorhanden', webgl);
check('Hauptmenü sichtbar', await page.isVisible('#screen-main.visible'));
await shot('01-hauptmenue');

// Training starten
await page.click('[data-action="start-training"]');
await page.waitForTimeout(1200);
check('Training: Ball in Hand', (await state()) === 'ballInHand');
await shot('02-training-ball-in-hand');

// Weiße platzieren (Klick auf den Tisch im Anstoßraum)
const place = await toScreen(-0.75, 0.05);
await page.mouse.move(place.x, place.y);
await page.mouse.click(place.x, place.y);
await page.waitForTimeout(300);
check('Weiße platziert → Zielen', (await state()) === 'aiming');

// Auf die Spitze des Dreiecks zielen und stoßen
const apex = await page.evaluate(() => {
  const w = window.__poolLounge.session.world;
  const g = w.geometry;
  let best = null;
  for (const b of w.balls) {
    if (!b.onTable || b.id === 0) continue;
    const d = Math.hypot(b.x - g.footSpot.x, b.y - g.footSpot.y);
    if (!best || d < best.d) best = { d, x: b.x, y: b.y };
  }
  return best;
});
const target = await toScreen(apex.x, apex.y);
await page.mouse.move(target.x, target.y, { steps: 8 });
await page.waitForTimeout(300);
await shot('03-zielen');
await page.mouse.down();
await waitFor(async () => (await page.evaluate(() => window.__poolLounge.session.power)) > 0.6, 60000);
check('Aufladen läuft', (await state()) === 'charging');
await shot('04-aufladen');
await page.mouse.up();
await page.waitForTimeout(250);
const afterShot = await state();
check('Stoß ausgeführt', afterShot === 'rolling' || afterShot === 'striking', afterShot);
await page.waitForTimeout(350);
await shot('05-kugeln-rollen');
// Zweiter Stoß während der Bewegung darf nicht möglich sein
await page.mouse.down();
await page.waitForTimeout(200);
check('Kein zweiter Stoß während Bewegung', (await state()) !== 'charging');
await page.mouse.up();
const settled = await waitFor(async () => ['aiming', 'ballInHand'].includes(await state()), 600000);
check('Stoß beendet und ausgewertet', settled, await state());
const evals = await page.evaluate(() => window.__poolLounge.session.evaluationCount);
check('Genau eine Auswertung', evals === 1, String(evals));
await shot('06-nach-dem-anstoss');

// Draufsicht
await page.keyboard.press('v');
await page.waitForTimeout(6000);
await shot('07-draufsicht');
await page.keyboard.press('v');
await page.waitForTimeout(4000);

// Rechte Maustaste: Kamera drehen, kein Stoß
const s0 = await state();
await page.mouse.move(800, 450);
await page.mouse.down({ button: 'right' });
await page.mouse.move(950, 400, { steps: 10 });
await page.mouse.up({ button: 'right' });
await page.waitForTimeout(500);
check('Kameradrehung löst keinen Stoß aus', (await state()) === s0 && !(await page.evaluate(() => window.__poolLounge.session.world.isMoving())));
await shot('08-kamera-gedreht');
await page.keyboard.press('r');

// Pause
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
check('Pausemenü per Esc', (await state()) === 'paused' && (await page.isVisible('#screen-pause.visible')));
await shot('09-pause');
// Klick auf "Fortsetzen" darf keinen Stoß auslösen
await page.click('[data-action="resume"]');
await page.waitForTimeout(300);
check('Fortsetzen ohne Stoß', !(await page.evaluate(() => window.__poolLounge.session.world.isMoving())));

// Gegen Computer
await page.keyboard.press('Escape');
await page.click('[data-action="to-menu"]');
await page.waitForTimeout(500);
await page.click('[data-action="diff-medium"]');
await page.click('[data-action="start-ai"]');
await page.waitForTimeout(800);
const p2 = await toScreen(-0.75, 0);
await page.mouse.click(p2.x, p2.y);
await page.waitForTimeout(200);
const apex2 = await page.evaluate(() => {
  const w = window.__poolLounge.session.world;
  return { x: w.geometry.footSpot.x, y: 0 };
});
const t2 = await toScreen(apex2.x, apex2.y);
await page.mouse.move(t2.x, t2.y, { steps: 5 });
await page.mouse.down();
await waitFor(async () => (await page.evaluate(() => window.__poolLounge.session.power)) > 0.15, 60000);
await page.mouse.up();
await waitFor(async () => (await state()) === 'rolling', 60000);
await waitFor(async () => !['rolling', 'striking', 'evaluating'].includes(await state()), 600000);
await page.waitForTimeout(300);
const aiInfo = await page.evaluate(() => {
  const s = window.__poolLounge.session;
  return { state: s.state, player: s.currentPlayer, ai: s.isAiTurn() };
});
check('Nach dem Anstoß: nächster Zustand erreicht', true, JSON.stringify(aiInfo));
if (aiInfo.ai) {
  await waitFor(async () => ['aiming', 'charging'].includes(await state()), 120000);
  await shot('10-computer-zielt');
  const aiShot = await waitFor(async () => (await state()) === 'rolling', 240000);
  check('Computer stößt selbstständig', aiShot);
  await page.waitForTimeout(400);
  await shot('11-computer-stoss');
}
await waitFor(async () => !['rolling', 'striking', 'evaluating', 'aiThinking', 'charging'].includes(await state()), 600000);
await shot('12-hud');

check('Keine Konsolen- oder Laufzeitfehler', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} Prüfungen erfolgreich`);
process.exit(failed > 0 ? 1 : 0);
