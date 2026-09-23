# Planstand – Pool Lounge 3D

> Wird fortlaufend aktualisiert. Status-Legende: ✅ erledigt · 🔄 in Arbeit · ⏳ offen

## Ziel
Ein vollständiges, lokal und offline spielbares 3D-Billardspiel (8-Ball, vereinfachtes Freizeit-Regelwerk)
mit drei Modi (Training, 2 Spieler lokal, gegen Computer Einfach/Mittel), eigener getesteter 2D-Physik,
3D-Darstellung mit Three.js, deutscher Benutzeroberfläche und prozeduralem Audio.

## Kontext
- Repository `ckju1806/Queue-3D`, Branch `claude/pool-lounge-3d-f5v6rx`.
- Ausgangslage: nur `README.md` (Inhalt „# Queue-3D“) und `LICENSE` (MIT). Kein bestehender Code.
- Zielplattform: Windows-PC, Browser, Maus + Tastatur. Kein Backend, keine API-Schlüssel, keine CDN-Abhängigkeiten.

## Annahmen (explizit)
| # | Annahme | Begründung |
|---|---------|------------|
| A1 | Das Repository ist das Projekt-Root (keine Verschachtelung unter `projects/active`). | `npm install` / `npm run dev` sollen direkt im Root laufen. |
| A2 | Tool-Konfigurationen (`package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`) liegen im Root. | Konvention von Vite/TypeScript/npm. |
| A3 | Eine beim Anstoß versenkte 8 zählt als versenkte Objektkugel (Anstoßender bleibt ohne Foul am Zug); die 8 wird wieder eingesetzt. | Angelehnt an WPA-Regel; Vorgabe lässt es offen. |
| A4 | Die 8 bei offenem Tisch zuerst zu treffen ist ein Foul („falsche Kugel zuerst“). | Vorgabe: „bei offenem Tisch jede Objektkugel außer der 8“. |
| A5 | Ball in Hand nach einem Foul gilt auf dem ganzen Tisch; der Anstoß erfolgt aus dem Anstoßraum (Kopffeld). | Vereinfachtes Freizeit-Regelwerk. |
| A6 | KI-Stufe „Mittel“ verifiziert Kandidaten per Vorausberechnung in einer Kopie derselben Physik; danach wird ein Zielfehler addiert. | Bessere Stoßauswahl ohne Sonderphysik oder Teleportation. |
| A7 | Keine Zugangsdaten nötig → keine Einträge in Passbolt / passwords.xlsx. | Kein Backend, keine Dienste. |

## Technische Entscheidungen
- Pakete exakt gepinnt (+ `package-lock.json`): `three 0.186.0`, `@types/three 0.186.0`, `vite 7.3.6`, `vitest 5.0.1`, `typescript 5.9.3`.
  - Hinweis: Ursprünglich war `vitest 4.1.11` geplant. `npm install` brach damit wegen eines npm-Arborist-Fehlers
    (`Cannot read properties of null (reading 'edgesOut')`) bei der Auflösung optionaler Peer-Dependencies ab
    (Kette `vite → @vitejs/devtools → vitest@*` → Vitest 5). Mit `vitest 5.0.1` ist der Baum konsistent und die Installation läuft fehlerfrei.
- Eigene 2D-Billardphysik (kontinuierliche Kollisionserkennung, fester Zeitschritt) statt allgemeiner 3D-Physik-Engine.
- Node.js ≥ 22.12 (LTS).

## Risiken
| Risiko | Gegenmaßnahme |
|--------|---------------|
| Headless-WebGL im Container eingeschränkt → Sichtprüfung nur teilweise möglich | Smoke-Test mit Playwright/SwiftShader; Ergebnis ehrlich berichten |
| Taschengeometrie (Fangen vs. Vorbeirollen) | Parameter zentral in `gameConfig.ts`, Tests für alle 6 Taschen |
| Numerische Instabilität (Durchtunneln, Zittern) | Ereignisgesteuerte TOI-Kollisionen, Stillstandsschwelle, Überlappungskorrektur, Tests |
| KI-Qualität | Kandidatenbewertung + Vorausberechnung (Mittel); bewusst einfach gehalten |

## Restore-Punkte
| Zeitpunkt | Restore-Punkt |
|-----------|---------------|
| Vor Beginn | Commit `16c1cdf` (Initial commit) |
| Nach jeder Etappe | Commit + Push auf `claude/pool-lounge-3d-f5v6rx` (siehe `docs/arbeitsprotokoll.md`) |

## Etappen
| # | Etappe | Status | Commit |
|---|--------|--------|--------|
| 0 | Doku-Grundgerüst, Projekt-Setup, `npm install` | ✅ | `69b6ecf` |
| 1 | Config, Tischgeometrie, Renderer, Lounge, Tisch, Kugeln, Kamera | ✅ | `8d4ef2d` |
| 2 | Physik, Taschen, Trainingsmodus + Physiktests | ✅ | `69b6ecf` |
| 3 | Eingaben, Queue, Zielhilfe, Stärkeanzeige, UI, Platzierung | ✅ | `8d4ef2d` |
| 4 | Regeln, Zweispielermodus, HUD, Ergebnis/Revanche + Regeltests | ✅ | `2eae690`, `8d4ef2d` |
| 5 | Computergegner (Einfach/Mittel) + KI-Tests | ✅ | `2eae690` |
| 6 | Audio, Einstellungen, Feinschliff, README, Abschlussprüfung | 🔄 | `395821d` ff. |

## Wesentliche Befunde und Korrekturen während der Umsetzung
| Befund | Nachweis | Korrektur |
|---|---|---|
| `npm install` bricht mit Vitest 4 ab (npm-Arborist, Peer-Deps) | Fehlerlog `edgesOut` | Vitest 5.0.1 |
| Zielvorschau der Weißen wich bei fast vollem Treffer ab | Test Zielvorschau vs. Physik | Vorschau nutzt exakt die Stoßformel der Physik |
| KI „Mittel“ zu stark (gewann fast jede Partie in 7–13 Stößen) | KI-Selbstspiel | Zielfehler 0,35° → 0,6° |
| Anstoß brach das Dreieck kaum auf (6–7 von 15 Kugeln bewegt) | Messung + Screenshot | Wellenfront-Auflösung für Kugelgruppen |
| Erste Gruppenauflösung (Poisson) erzeugte Energie (+40 %) und Rückprall bei Kombinationen | Neue Tests | Restitution je Kontakt einmal + Energieschranke |
| Draufsicht durch Lampe verdeckt, Tuch zu hell | Browser-Screenshots | Lampenkörper ausblenden, Tuch/Licht angepasst |
| Menüs erschienen erst im nächsten Frame | Smoke-Test (Pause) | UI reagiert sofort auf Zustandswechsel |

## Validierungsschritte
1. `npm run typecheck` – keine TypeScript-Fehler.
2. `npm test` – alle Tests grün.
3. `npm run build` – Produktionsbuild erfolgreich.
4. `npm run preview` + Browser-Smoke-Test (Seite lädt, keine Konsolenfehler, Training startbar, Stoß ausführbar).
