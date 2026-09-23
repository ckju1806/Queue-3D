# Inhaltsverzeichnis – Pool Lounge 3D

Stand: 2026-09-23 · Branch `claude/pool-lounge-3d-f5v6rx`

## Wurzelverzeichnis

| Pfad | Zweck |
|---|---|
| `README.md` | Anleitung (Deutsch): Voraussetzungen, Installation, Start, Steuerung, Regelwerk, Tests, Einschränkungen |
| `INHALTSVERZEICHNIS.md` | Dieses Verzeichnis der Projektstruktur |
| `LICENSE` | MIT-Lizenz |
| `package.json` / `package-lock.json` | npm-Skripte und exakt gepinnte Abhängigkeiten |
| `tsconfig.json` | TypeScript-Konfiguration (strict) |
| `vite.config.ts` | Vite- und Vitest-Konfiguration |
| `index.html` | HTML-Einstieg (Canvas + UI-Ebene) |
| `.nvmrc` | Empfohlene Node.js-Hauptversion (22) |
| `.gitignore` | Ausgeschlossene Ordner (`node_modules/`, `dist/`, `tmp/` …) |

> Tool-Konfigurationen liegen bewusst im Wurzelverzeichnis (Konvention von npm/Vite/TypeScript) – begründete Ausnahme von der Ablageregel.

## Ordner

| Ordner | Inhalt |
|---|---|
| `src/config/` | `gameConfig.ts` – zentrale Parameter (Tisch, Kugel, Physik, Stoß) |
| `src/physics/` | Vektoren, Tischgeometrie, TOI-Kollisionsfunktionen, Physikwelt, Reibungsformeln |
| `src/game/` | Kugeldefinitionen, Dreieck, Stoßfunktion, ShotRecorder, Regeln, Training, Platzierung, Zufall, Typen, `GameSession` (Zustandsautomat) |
| `src/aim/` | Zielvorschau (Swept-Circle-Cast) |
| `src/ai/` | Computergegner (Planung, Profile, Vorausberechnung) |
| `src/render/` | Three.js-Szene: Renderer, Lounge, Tisch, Kugeln, Queue, Overlays, Kamera, prozedurale Texturen |
| `src/input/` | Maus- und Tastatureingaben |
| `src/ui/` | Oberfläche (Menüs, HUD, Meldungen), Texte, Styles |
| `src/audio/` | Prozedurale Web-Audio-Sounds |
| `src/storage/` | Lokale Einstellungen (localStorage) |
| `tests/` | Vitest-Tests (Physik, Taschen, Regeln, Session, Zielvorschau, KI, Dreieck) + Hilfsfunktionen |
| `scripts/` | `smoke-test.mjs` – optionaler Browser-Smoke-Test (Playwright, nicht Teil der Abhängigkeiten) |
| `docs/` | Projektdokumentation: Planstand, Architektur, Projektdoku, Arbeitsprotokoll |

## Dokumentation (`docs/`)

| Datei | Inhalt |
|---|---|
| `docs/plan.md` | Ziel, Kontext, Annahmen, Risiken, Restore-Punkte, Etappen, Validierung (fortlaufend) |
| `docs/architektur.md` | Architektur, Datenfluss, Zustandsautomat, Physikmodell, KI, Rendering |
| `docs/doku.md` | Projektdokumentation für den Betrieb: Start, Konfiguration, Zugangsdaten (keine), Backups |
| `docs/arbeitsprotokoll.md` | Chronologisches Protokoll mit Prüfungen und Restore-Punkten |

## Nicht versioniert (erzeugt)

| Pfad | Herkunft |
|---|---|
| `node_modules/` | `npm install` |
| `dist/` | `npm run build` |
| `tmp/` | temporäre Ausgaben (z. B. Smoke-Test-Screenshots) |
