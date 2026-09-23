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
