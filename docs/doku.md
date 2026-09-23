# Projektdokumentation – Pool Lounge 3D

## Kurzbeschreibung
Lokal im Browser laufendes 3D-8-Ball-Spiel (TypeScript, Three.js, Vite). Keine Serverkomponente, keine Datenbank,
keine externen Dienste, keine Laufzeit-Downloads.

## Betrieb

| Aufgabe | Befehl / Ort |
|---|---|
| Installation | `npm install` (einmalig, benötigt Internet für npm-Registry) |
| Entwicklung | `npm run dev` → http://localhost:5173 |
| Produktionsbuild | `npm run build` → `dist/` |
| Build ansehen | `npm run preview` → http://localhost:4173 |
| Prüfungen | `npm run typecheck`, `npm test` |
| Schwache Hardware | URL-Parameter `?quality=low` |
| Online-Version | <https://ckju1806.github.io/Queue-3D/> (automatisch aus `main`) |

## Veröffentlichung (GitHub Pages)
- Workflow: `.github/workflows/pages.yml` – Trigger: Push auf `main` und manuell (*Actions → GitHub Pages → Run workflow*).
- Ablauf: `npm ci` → `npm test` → `npm run build` → Upload von `dist/` → Deployment in die Umgebung `github-pages`.
- Einmalige Einstellung (nur im GitHub-Webinterface möglich): **Settings → Pages → Build and deployment → Source: „GitHub Actions“**.
- Rücknahme: fehlerhaften Commit auf `main` per `git revert` zurücknehmen; der Workflow veröffentlicht danach automatisch den vorherigen Stand.

## Konfiguration
- Spielparameter: `src/config/gameConfig.ts` (Tischmaße, Kugelradius, Taschen, Reibung, Stoßzahlen, Stoßkraft, Zeitschritt).
- KI-Schwierigkeit: `DIFFICULTY_PROFILES` in `src/ai/aiPlayer.ts`.
- Benutzereinstellungen: werden im Browser unter dem Schlüssel `poolLounge3d.settings.v1` (localStorage) gespeichert.

## Zugangsdaten
**Keine.** Das Projekt verwendet keine Konten, Passwörter, Tokens oder API-Schlüssel.
Daher sind keine Einträge in Passbolt oder `passwords.xlsx` erforderlich.

## Backups / Restore-Punkte
Versionsverwaltung über Git (Branch `claude/pool-lounge-3d-f5v6rx`). Jede Etappe ist ein eigener Commit:

| Commit | Inhalt |
|---|---|
| `16c1cdf` | Ausgangszustand (Initial commit) |
| `69b6ecf` | Projekt-Setup und Physikkern |
| `2eae690` | Regeln, Zustandsautomat, Zielvorschau, KI |
| `8d4ef2d` | 3D-Darstellung, UI, Eingaben, Audio |
| `395821d` | Realistischer Anstoß, sofortige Menüanzeige, Doku |
| `c2f1b16` | Darstellungskorrekturen, Planstand |
| `4bfe8d0` | Randfall-Test, README |
| (Abschluss) | Grammatik der Meldungen, Doku-Abschluss – siehe `docs/arbeitsprotokoll.md` |

Wiederherstellung eines Standes: `git checkout <commit>` bzw. `git revert <commit>`.

## Abhängigkeiten (exakt gepinnt)
`three 0.186.0` · `@types/three 0.186.0` · `vite 7.3.6` · `vitest 5.0.1` · `typescript 5.9.3` · Node.js ≥ 22.12.

## Infrastruktur
Keine Server, VMs oder Container erforderlich. Termix/Grafana: nicht betroffen.
