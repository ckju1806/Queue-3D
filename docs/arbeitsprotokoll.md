# Arbeitsprotokoll – Pool Lounge 3D

Chronologisches Protokoll der Etappen, Prüfungen und Restore-Punkte.

| Datum | Etappe | Tätigkeit | Prüfung | Restore-Punkt |
|-------|--------|-----------|---------|---------------|
| 2026-09-23 | – | Ausgangslage geprüft: nur README.md + LICENSE | `git status`, `ls` | `16c1cdf` |
| 2026-09-23 | 0 | Projekt-Setup, Pakete installiert (Vitest 4 → 5 wegen npm-Peer-Dependency-Fehler) | `npm install` ok, 0 Schwachstellen | `69b6ecf` |
| 2026-09-23 | 1–2 | Config, Tischgeometrie, CCD-Physik, Taschen, Rack, Stoßfunktion | 18 Tests grün, `tsc` ok | `69b6ecf` |
| 2026-09-23 | 4–5 | Regeln, ShotRecorder, GameSession, Platzierung, Zielvorschau, KI | 75 Tests grün, KI-Selbstspiel bis Spielende | `2eae690` |
| 2026-09-23 | 1, 3, 6 | Rendering, UI, Eingaben, Audio, Einstellungen, Einstieg | `tsc` ok, 75 Tests, `npm run build` ok | `8d4ef2d` |
| 2026-09-23 | 6 | Browser-Smoke-Test (Playwright/SwiftShader): 11/12 grün; Befunde: Menü-Verzögerung, Lampe in Draufsicht, Tuch zu hell, schwacher Anstoß | Screenshots im Scratchpad | – |
| 2026-09-23 | 6 | Wellenfront-Gruppenstöße + Energieschranke, UI-Sofortanzeige, Optik, Doku | 77 Tests grün | `395821d` |
| 2026-09-23 | 6 | Darstellungskorrekturen (Zarge, CSS, Buttons), Planstand | 77 Tests grün; frischer Klon: `npm ci`/`npm install`, Tests, Build ok | `c2f1b16` |
| 2026-09-23 | 6 | Finaler Browser-Smoke-Test auf Endstand-Build | 15/15 grün, keine Konsolenfehler | – |
| 2026-09-23 | 6 | Randfall-Test Neustart während rollender Kugeln | 78 Tests grün | `4bfe8d0` |
| 2026-09-23 | 6 | Grammatik der Du-Meldungen korrigiert + Texttests, Doku-Abschluss | 80 Tests grün, Build ok, Browser-Kurzprüfung ok | Abschluss-Commit |
| 2026-09-23 | – | Menüs passen auf Handybreite (CSS `min()`); Spiel als privates claude.ai-Artifact veröffentlicht (nur für den Besitzer sichtbar; Build mit eingebettetem CSS/JS, keine externen Ressourcen) | 80 Tests grün, Build ok, lokale Prüfung 1280/400 px ohne Fehler | `fe0021e` |
| 2026-09-23 | GitHub | Spielanleitung mit 8 Screenshots, README (Online-Link, Download), CHANGELOG, package.json-Metadaten, Pages-Workflow | 80 Tests grün, Build ok, Workflow-YAML gültig | folgt (PR nach `main`) |
