# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/). Module versions follow the Foundry-targeted `<foundry-major>.<YYMM>.<patch>` release scheme documented in `AGENTS.md`.

## [14.2609.1] - 2026-09-01

### Added
- **Kategorie „Rückblick".** Eine sechste Kategorie für Ereignisse, von denen die Gruppe erst später erfährt.

- **Datumsauswahl statt Freitextfeld.** Das Formular fragt jetzt zuerst, *wann* etwas geschehen ist: heute — mit dem aktuellen Spieltag daneben — oder an einem früheren Tag. Bei „früher" steht eine Liste der Spieltage bereit, die in der Chronik schon vorkommen, und ein daraus gewählter Tag übernimmt dessen Sortierschlüssel unverändert. Ein Tag, den es noch nicht gibt, geht weiterhin als Freitext. Vorher war jedes Datum Freitext: ein Tippfehler erzeugte eine zweite, gleich aussehende Tagesgruppe, die an ganz anderer Stelle einsortiert wurde.

- **„Davon erst heute erfahren".** Ein Schalter trennt zwei Dinge, die vorher gleich aussahen: das Nachtragen von Notizen der letzten Sitzung, die die Gruppe damals schon wusste, und eine Enthüllung über die Vergangenheit, von der sie erst jetzt erfährt. Der Eintrag bleibt in beiden Fällen beim Tag des Geschehens — die Chronik ist eine Chronologie. Im zweiten Fall steht darunter „Erfahren am …", und die Kategorie springt auf Rückblick.

- **Zeitleiste in der Chronik.** Über dem Logbuch steht jetzt eine Leiste mit einem Knopf je Spieltag samt Anzahl der Einträge. Ein Klick springt zu diesem Tag, und beim Blättern hebt sich der Tag hervor, bei dem man gerade ist. Die Leiste bleibt beim Scrollen oben stehen — bei einer Chronik über viele Sitzungen war der Weg zu einem bestimmten Tag vorher reines Scrollen.

### Fixed
- **Auf Tablets war der Speichern-Knopf nicht erreichbar.** Das FANG-Fenster öffnete fest mit 1400×950 Pixeln. Auf einem Tablet im Querformat bleibt nach der Browserleiste weniger übrig, also lag der untere Rand des Fensters unterhalb des Bildschirms — und mit ihm der Fußbereich der Bearbeitungsfenster, in dem „Speichern" sitzt. Scrollen half nicht: dieser Bereich hängt am Fenster, nicht an der Seite. Wer kein Spielleiter war, konnte damit schlicht nichts speichern. Das Fenster wird jetzt auf den sichtbaren Bereich begrenzt und beim Drehen des Geräts neu angepasst; auf kleinen Bildschirmen fallen zusätzlich die Ränder der Bearbeitungsfenster schmaler aus.

- **Spieler-Bearbeitungen gingen beim Übernehmen verloren.** Wer nicht Eigentümer des Journals ist, kann den Graphen nicht selbst schreiben — die Änderung geht per Socket an die Spielleitung, die sie anwendet und speichert. Beim Anwenden wurde jedoch auch die eigene Vergleichsgrundlage auf das Ergebnis gesetzt. Der unmittelbar folgende Speichervorgang verglich dann Grundlage, eigenen Stand und Serverstand — und da der neue Knoten in der Grundlage stand, im Serverstand aber noch nicht, las der Abgleich das als „die Gegenseite hat ihn gelöscht" und warf ihn weg. Ein Platzhalter, den jemand im Bearbeitungsmodus angelegt hat, verschwand damit spurlos: nicht gespeichert, nicht verteilt, keine Fehlermeldung. Die Grundlage bleibt jetzt beim Serverstand, wo sie hingehört. Festgehalten als Szenario 14 in `tools/fang-merge-test.mjs`.

- **Nach einer übernommenen Spieler-Bearbeitung erfuhr es niemand.** Die Spielleitung speicherte mit unterdrückter Rundmeldung, also behielten alle anderen ihren Stand, bis sie das Fenster neu öffneten — auch die Person, die die Änderung gemacht hatte. Es wird jetzt verteilt; unfertige lokale Arbeit bleibt dabei erhalten.

- **Eine offene Chronik zeigte den Stand vom Öffnen.** Der Speicher hatte keine `onChange`-Rückmeldung, also erreichte keine Änderung ein bereits offenes Fenster: weder ein Eintrag, den eine Spielerin eingereicht hat, noch ein automatischer aus einer Graphenaktion, noch die Bearbeitung durch eine zweite Spielleitung. Man musste die Chronik schließen und neu öffnen. Jetzt zeichnet sie sich selbst neu und behält die Leseposition — außer während jemand das Eingabeformular ausgefüllt hat, dessen Text sonst verlorenginge.

- **Ein aktives Kalendermodul wurde stillschweigend übergangen.** FANG fragte den Formatierer eines Moduls immer mit einem Optionsobjekt. Calendaria erwartet dort eine Formatzeichenkette und wirft bei einem Objekt `n.replace is not a function` — und weil der ganze Erkennungsversuch in einem `try` stand, verwarf diese Ausnahme den kompletten Kalender. FANG fiel auf Foundrys Kernkalender zurück und schrieb in einer Welt, in der Calendaria den **1. Hammer 1501** anzeigt, den Spieltag **„1. Hammer 0"** in die Chronik. Jetzt steht jeder Formatierungsversuch für sich: zuerst die Form ohne Argumente (die Voreinstellung des Moduls, bei Calendaria „1 Hammer, 1501"), dann die Form mit Optionsobjekt, dann `formatDateTime`. Scheitern alle, wird die Beschriftung weiterhin aus den Datumsfeldern gebaut — aber der Kalender selbst geht nicht mehr verloren. Betroffen war jede Welt mit Calendaria; Simple Calendar und Seasons & Stars verhalten sich unverändert.

- **Die Chronik war nach Tippzeitpunkt sortiert, nicht nach Spieltag.** Jeder Eintrag trägt seit jeher einen Sortierschlüssel aus dem Spieldatum — gelesen wurde er nie. Geordnet wurde nach `createdAt`, also nach dem realen Moment der Eingabe. Wer nach der Sitzung ein Ereignis vom 9. April nachtrug, fand es über dem 12. April wieder, und die Tagesüberschriften standen in der Reihenfolge, in der man getippt hatte. Sortiert wird jetzt nach Spieltag (neuester zuerst), innerhalb eines Tages weiter nach Eingabezeit; Einträge ohne Datum sammeln sich am Ende, statt nach oben zu rutschen.

- **Der Sortierschlüssel las das falsche Feld des Foundry-Kalenders.** Foundrys `TimeComponents` führt beides: `day` ist der Tag des **Jahres**, `dayOfMonth` der Tag im Monat. Gelesen wurde `day`, und die Zahl wurde auf zwei Stellen aufgefüllt — der 11. April ergab den Schlüssel `000000-03-100`, der als Zeichenkette **vor** `000000-03-99` (dem 10. April) steht. In jedem Monat, in dem der Jahrestag von zwei auf drei Stellen wächst, kippte damit die Reihenfolge. Jetzt wird `dayOfMonth` bevorzugt, sobald beide Felder da sind — Kalendermodule senden nur `day` und bleiben unberührt —, und der Tag wird dreistellig aufgefüllt.

- **Der eingebaute Kalender lieferte einen Maschinen-Zeitstempel als Tagesüberschrift.** Gesucht wurde ein Formatierer namens `date`. Den gibt es nicht: Foundry kennt nur `timestamp`, `duration` und `ago`. Also fiel die Erkennung auf `timestamp` zurück und schrieb `0000-04-11 00:00:00` über den Tag — samt Uhrzeit, denn dieser Formatierer ignoriert `includeTime`. Systeme bringen lesbare Formatierer mit; dnd5e etwa `formatMonthDayYear`. Die werden jetzt zuerst probiert (Ergebnis: „April 11., 0"), danach wird die Beschriftung aus den Komponenten samt übersetztem Monatsnamen gebaut, und erst zuletzt bleibt der Zeitstempel — dann wenigstens ohne die immer gleiche Uhrzeit.

### Removed
- **Die Ersetzung der Akteursauswahl von „Sheet Only" ist ausgezogen.** Sie ist nach *Ninjo's In-Person Tools* gewandert und steht dort unter „Akteursauswahl von Sheet Only ersetzen". FANG ist ein Werkzeug für Beziehungsgeflechte; eine Funktion, die die Oberfläche eines fremden Moduls umräumt, damit man bequemer am Tisch spielt, gehört zu den Tischwerkzeugen. Mitgegangen sind die Einstellung `replaceOnlySheetActor`, die Verwaltung des Popouts samt der Abwehr gegen Foundrys leere Fensterhüllen und die zugehörigen Regeln in der Stilvorlage — rund 330 Zeilen.

  **Was das für dich heißt:** Wer beide Module hat, findet die Funktion an ihrem neuen Ort wieder und muss sie dort einmal einschalten; sie ist standardmäßig aus. Wer nur FANG hat, verliert das angedockte Akteursverzeichnis im Sheet-Only-Modus. Der FANG-Knopf in der Leiste von Sheet Only bleibt unverändert, ebenso alles am Graphen.

## [14.2608.1] - 2026-08-29

Großes Oberflächen- und Stabilitäts-Release. Die Seitenleiste ist nach Aufgaben gegliedert, Editoren öffnen im FANG-Fenster statt in eigenen Foundry-Fenstern, Fraktionen und Orte haben eine gemeinsame Heimat — und mehrere Fehler in Datenspeicherung, Physik und Darstellung sind behoben. Enthält die gesamte Beta-Arbeit seit 14.2605.5.

### Added
- **Gemeinsames Bearbeiten (optional).** Statt der exklusiven Sperre können mehrere Personen gleichzeitig am Graphen arbeiten. Speichern führt die Änderungen feldweise zusammen (Drei-Wege-Abgleich), sodass zwei Leute an verschiedenen Dingen sich nicht mehr gegenseitig überschreiben. Physik-Drift wird dabei bewusst verworfen — nur bewusst gezogene Positionen zählen als Absicht.
- **Orte.** Charaktere können einem Ort zugeordnet werden (Region, Stadt, Viertel, Gebäude, Reich). Fraktion beantwortet „wem gehört jemand an", Ort beantwortet „wo ist jemand".
- **Gruppieren nach Fraktion oder Ort.** Eine Ansicht auf Zeit: Die Charaktere ordnen sich nach Gruppe, jede Gruppe bekommt einen beschrifteten Bereich, und die vorherige Anordnung kehrt beim Zurücksetzen zurück. Positionen sind währenddessen gesperrt, damit die temporäre Ansicht nicht zur gespeicherten wird.
- **Fraktionen sichtbar machen.** Mitgliedschaft zeigt sich als Linie zwischen den Mitgliedern und als farbiger Ring am Token. Ein Zeiger über der Legende hebt genau diese Fraktion hervor und nimmt alle anderen zurück — der Weg, eine Fraktion im Gewirr zu finden.
- **Charaktere festnageln.** Ein gezogener Charakter bleibt liegen, wo du ihn hinsetzt, statt von der Physik zurückgezogen zu werden. Eine Reißzwecke am Token zeigt das an; Rechtsklick → „Position freigeben" gibt ihn der Physik zurück.
- **Editoren öffnen im FANG-Fenster.** Fraktionen, Orte, Charakter, Beziehung, Platzhalter und Schnellverbindung erscheinen als großes Panel im Fenster statt als eigenes Foundry-Fenster. Nur Rückfragen („Wirklich löschen?") bleiben eigene Dialoge — sie müssen sich über ein offenes Panel legen können.
- **Leere Verwaltungen erklären sich.** Fraktionen und Orte öffneten auf einem leeren Kasten mit einem „Hinzufügen"-Knopf darunter. Jetzt steht dort, wofür der Bereich da ist und was als Nächstes zu tun ist.
- **Mitgliederzahl je Ort**, samt Hinweis, warum ein Ort ohne Mitglieder auf der Fläche unsichtbar bleibt.
- **Optionaler Klang beim Spotlight.**
- **Chronicle MVP Beta:** Added a versioned `fang.history` store for story events, automatic game-day prefill with manual override, a global day-grouped chronicle view, and a token-level chronicle view from the node context menu. Entries keep GM/private text separate from player-safe text so automation can build on the same model without exposing hidden-token secrets.
- **Chronicle Auto Entries:** Normal graph actions now add narrative chronicle entries when tokens appear, hidden identities are revealed, and new relationships become visible. Hidden tokens use their alias and placeholder portrait for player-facing entries.
- **Automated Quest and Faction Chronicle Entries:** Revealed player-facing Auftraege and visible faction assignments now create chronicle entries from their existing workflows instead of requiring manual category selection.
- **Player Chronicle Edits:** Players can create and update the visible title/text of player-facing chronicle entries without taking the graph edit lock; GMs can still fully edit or delete entries.

### Changed
- **Seitenleiste nach Aufgaben gegliedert.** Fraktion und Ort sind Geschwister und liegen jetzt zusammen im Bereich **Zugehörigkeit**. Vorher war das über drei Orte verstreut: Fraktionen als Dialog direkt aus der Leiste, „Orte verwalten" unter *Erweitert*, die Gruppieren-Knöpfe unter *Ansicht*. Die übrigen Bereiche: **Präsentation** (Gruppierung, Spieler/Monitor, Zentrieren, Zuschauer-Kamera) und **Einstellungen** (Berechtigungen, Physik, Hintergrund, Im-/Export). „Spieler dürfen bearbeiten" stand unter Präsentation — das ist eine Berechtigung.
- **Gruppierung ist ein Schalter statt zweier Knöpfe.** Es ist ein Modus, von dem immer genau einer gilt; zwei Knöpfe sagten weder das noch welcher gerade an war. Sie mussten zusätzlich als ihr eigener Aus-Schalter dienen und dafür ihre Beschriftung umbauen. Mit einem eigenen Segment *Normal* entfällt der Trick. Der Schalter sitzt bei den übrigen Ansichts-Einstellungen, nicht bei der Verwaltung.
- **Bearbeiten setzt die Gruppierung zurück.** Wer in den Bearbeitungsmodus geht, arbeitet immer auf dem echten Layout — die gruppierten Positionen sind gesperrt und nicht die wahren.
- **Alle Fenster auf dem aktuellen Framework** (DialogV2 statt V1).
- **Hintergrund-Stilvorlagen überarbeitet.** Wald & Dschungel, Feenwald-Nebel, Sternenmeer, Dungeon-Stein und Sternennacht haben die Tiefe bekommen, die bisher nur „Verwittertes Pergament" hatte.
- **Löschen im Charakter-Editor** sitzt jetzt unten links in der Fußzeile, abgesetzt von Speichern — nicht mehr mitten im Formular direkt über dem Knopf, den man ständig drückt.

### Fixed
- **Datenverlust beim Speichern.** Orte, Geheimnisse und Auftragsstatus wurden beim Speichern still verworfen, weil die Serialisierung eine handgepflegte Positivliste war. Jetzt wird alles gespeichert außer ausdrücklich Ausgeschlossenem.
- **FANG hätte Foundry V15 nicht überlebt.** Foundry-Namen (`KeyboardManager`, `FilePicker`) wurden global angesprochen; die fallen in V15 weg. Stand bei jedem Weltstart als Warnung in der Konsole.
- **Die alten Fenster hätten V16 nicht überlebt.** Das V1-Framework meldete bei jedem Öffnen „removed in Version 16".
- **Der Graph sprang ohne Grund.** Zwei Kräfte forderten Widersprüchliches: Die Beziehungslinie zog verbundene Charaktere auf 300px, die Kollision drückte sie auf 320px auseinander. Die Anordnung kam deshalb nie zur Ruhe, sie fror nur ein — und jedes Aufwecken entlud die Spannung. Zusätzlich verschob `forceCenter` bei jedem Bild den gesamten Graphen; ein gezogener Charakter schob dadurch alle anderen in die Gegenrichtung.
- **Speichern rollte die eigene Ansicht zurück.** Der Abgleich verwarf Physik-Drift korrekt, schrieb die verworfenen Positionen aber auch in die laufende Anzeige zurück.
- **Migrationen wurden bei jedem Speichern rückgängig gemacht**, weil der Abgleichs-Bezugspunkt nach statt vor der Migration genommen wurde.
- **Portraits sind rund.** Ringe um die Token waren Kreise, das Bild darunter aber quadratisch — die Ecken standen heraus.
- **Fraktionslinien waren unsichtbar**, wo Mitglieder ohnehin verbunden sind (der Normalfall): Die Linie lag mit 20 % Deckkraft hinter einer soliden Beziehungslinie.
- **Doppelklick zoomte den Graphen**, während er den Charakterbogen öffnete — die Zoom-Bibliothek bringt das von Haus aus mit.
- **GM-Bereiche wurden alle gleichzeitig angezeigt**, übereinandergestapelt: `.gm-only` erzwang Sichtbarkeit stärker, als der Bereich sie abschalten konnte.
- **Gruppen-Bereiche überlappten sich.** Die Anordnung berechnete, was die Physik will, ohne zu prüfen, ob es auf die Fläche passt — Ziele landeten außerhalb des sichtbaren Bereichs. Gruppen sitzen jetzt in einem Raster, der gezeichnete Bereich endet an der Zellgrenze, und die Mitglieder verteilen sich darin auf einem Gitter mit Abstand nach Namensschild-Breite statt auf einem engen Ring.
- **Stilvorlagen färbten nicht mit.** 85 Farben waren fest verdrahtet statt über die Theme-Variablen; im Cyberpunk-Thema blieben sie D&D-golden. Auch die Schalter standen auf Foundrys Orange.
- **Chronik-Einträge** zeigten dem GM nur den Spielertext.

### Removed
- **Toter Code:** eine komplette zweite Navigation (Reiterleiste, seit Langem unsichtbar, von der Symbolleiste ersetzt) samt widersprüchlichem CSS, und der abgeschaltete Editor-Bereich — dessen Formularfelder das Modul bei *jeder* Änderung weiter befüllte, inklusive eines Durchlaufs über alle Akteure der Welt für Auswahllisten, die niemand sehen konnte. 328 Zeilen.

## [14.2605.5] - 2026-05-15
### Fixed
- **Chronicle GM View:** GMs now see both the player-visible and the GM-only text of a chronicle entry instead of only the player-facing part.


## [14.2605.4] - 2026-05-15
### Merged from claude/goofy-gagarin-d190dc design-refactor branch
Selektiver Merge der parallelen Design-Refactor- und Hotfix-Arbeit auf 14.0.19-Linie. Beta-Stand bleibt für UI/Code-Struktur erhalten; nur orthogonale Bugfixes und i18n-Ergänzungen wurden übernommen.

### Added
- **9 fehlende i18n-Keys** in allen 10 Locales: `FANG.UI.Color`, `FANG.Messages.SaveSuccess`, `FANG.Messages.OtherUser`, `FANG.Messages.LockStompTitle`, `FANG.Messages.LockStompConfirm`, `FANG.UI.Background.Palette.{DeepMahogany, Forest, Ocean, Shadow}`. Die ersten sechs werden im Code referenziert aber existierten nicht; die letzten drei sind für den neuen Lock-Stomp-Dialog.

### Fixed
- **Edit-Lock-Race / GM-Stomping:** GM konnte ohne Warnung den aktiven Edit-Lock eines Spielers oder anderen GMs überschreiben. Nun wird der Flag vor `setFlag` frisch gelesen; bei Konflikt erscheint ein Bestätigungsdialog mit dem Namen des aktuellen Bearbeiters. Default-Antwort ist „Abbrechen".
- **Globale role-based CSS-Klasse:** `document.body` bekommt jetzt in `Hooks.once("ready")` die Klassen `role-player` (für Spieler) bzw. `role-gm` (für GM). Damit greifen CSS-Regeln wie `body.role-player .gm-only { display: none }` zuverlässig auch für dynamisch eingefügte Elemente.

### Not merged (intentional)
- Design-Token-System (`--fang-space-*`, `--fang-radius-*`, `--fang-text-*`) — kollidiert mit der von beta entwickelten Chronik-CSS. Kann später als eigener PR aufgesetzt werden, wenn gewünscht.
- ARIA-Tab-Pattern (Pfeiltasten-Navigation, aria-selected/-controls) — beta-HBS hat Tabs anders strukturiert. Separater A11y-Pass empfohlen.
- Edge-Pfeil-Migration auf `.hidden`-Class — beta nutzt die alte `style.display`-Mechanik und hat den Bug nicht; meine "Verbesserung" war selbst eine Regression.

### Backup
- Tag `backup/claude-refactor-2026-05-15` zeigt auf den vollen ungemergeten Stand der parallelen Linie (`14.1.3-beta.4`).

## [14.2605.3] - 2026-05-14
### Fixed
- **Quest Journal Page Links:** Quest links now support both complete Journal entries and individual Journal pages. Opening a page-linked quest now opens the parent Journal directly on the correct page, and Quest Spotlight reads the page content instead of falling back to an empty view.
- **Portuguese Brazil Localization:** Cleaned up mojibake artifacts in the new UI, faction, quick-connect, and quest-management strings.
- **Localization Validator:** Refined encoding checks so valid Portuguese characters such as `Ã` in `NÃO` are not reported as false-positive mojibake warnings.

## [14.2605.2] - 2026-05-12
### Added
- **Canvas-first Interaction Model:** Added the compact FANG rail, in-canvas edit tools, double-press panel toggles, and clearer edit-lock states for faster table use.
- **Player-Safe Hidden Contact Editing:** Hidden contacts now keep true GM information protected while players can still maintain allowed aliases, player notes, safe state markers, and optionally visible quests.
- **Quest Canvas Panel:** Reworked node quests into an in-canvas panel with clearer linked quest rows, hidden-by-default additions, visible toggles, journal opening, and spotlight actions.
- **Faction Visibility Controls:** Added faction descriptions plus GM/player visibility controls for faction visibility, legend inclusion, and faction line rendering.

### Changed
- **Modernized Sidebar and Panels:** Reduced the permanent sidebar, moved management tasks into floating panels, and aligned faction/background/admin UI with the current fantasy/cyberpunk theme system.
- **Connection Editing Flow:** Relationship editing is safer and supports changing directed links after creation, including direction flipping where appropriate.
- **README Refresh:** Updated the README screenshots and user-facing stable/beta documentation for the new UI.
- **Version Bump:** Advanced the stable module version to `14.2605.2`.

### Fixed
- **Graph Stability After Direct Connections:** Hardened quick-connect link creation so malformed edge state no longer breaks graph rendering.
- **Journal Button Robustness:** FANG journal buttons use delegated click handling so saved journal links remain compatible across Foundry v13/v14 render paths.
- **Localization Coverage:** Updated German/English strings for the redesigned UI and kept generated locale coverage in sync for all shipped languages.
- **Module Language Labels:** Corrected language display names in `module.json` so Foundry shows readable locale names.

## [14.1.3-beta.4] - 2026-05-15
### Added
- **Volle ARIA-Tab-Pattern-Unterstützung:** Tabs in der Sidebar haben jetzt `aria-controls`, `tabindex="0"`/`-1` sync zu `aria-selected`, und entsprechende Tab-Panels haben `role="tabpanel"` + `aria-labelledby`. Vollständige Keyboard-Navigation: ← → ↑ ↓ wechselt zwischen sichtbaren Tabs (überspringt versteckte GM-only Tabs für Spieler), Home/End springen an Anfang/Ende, Enter/Space aktivieren. Screenreader-konform.

### Changed
- **Quest-Picker-Items komplett in CSS:** Die JS, die `.fang-quest-pick-item` per `innerHTML` baute, hatte beim Design-Refactor wieder Inline-Styles und manuelle `mouseover`/`mouseout`-Handler für den Hover-Effekt bekommen. Jetzt eine reine CSS-Klasse `.fang-quest-pick-item` mit `:hover`-Pseudoklasse, ohne Inline-Styles und ohne dedizierte JS-Handler.
- **Visibility-Strategie vereinheitlicht:** Über 10 Stellen in `fang-app.js`, die `element.style.display = "none"/"block"/"flex"` setzten (Context-Menu-Items, Sidebar, Lock-Button), nutzen jetzt durchgängig `classList.toggle("hidden", …)`. Die `.hidden`-Klasse mit `!important` ist die alleinige Wahrheit. Das verhindert weitere Regressionen wie den Edge-Pfeil-Bug aus 14.1.0-beta.1.

## [14.1.2-beta.3] - 2026-05-15
### Fixed
- **GM-only Elemente bleiben in dynamisch eingefügten Sub-Bäumen ungeschützt:** Die CSS-Regel `body.role-player .gm-only { display:none }` existierte, aber die Klasse wurde nie gesetzt. Stattdessen versteckte eine JS-Schleife (`gmControls.forEach(el.style.display='none')`) GM-Buttons nur bei Initial-Render. Klasse wird jetzt in `Hooks.once("ready")` global gesetzt (`role-player` / `role-gm`), redundante Schleife entfernt.
- **Edit-Lock-Race / GM-Stomping:** GM konnte ohne Warnung einen aktiven Edit-Lock eines Spielers oder anderen GMs überschreiben. Nun: vor `setFlag` wird der Flag nochmals frisch gelesen, bei Konflikt erscheint ein Bestätigungsdialog mit dem Namen des aktuellen Bearbeiters. Standardantwort ist „Abbrechen".
- **Localize/Concat-Operator-Bug bei Lock-Notification:** `name + " " + localize(key) || fallback` — `||` bindet an die gesamte Konkatenation, der Fallback war unerreichbar und bei fehlendem Key wurde der Rohschlüsselname angezeigt. Lokalisierter String wird jetzt separat berechnet, dann mit Username konkateniert.
- **Quest-Picker Null-Check in falscher Reihenfolge:** `picker.querySelector(...)` lief vor `if (!picker) return`. Crash wenn das Element fehlte. Guard wurde vorgezogen.

### Added
- 3 neue i18n-Keys für Lock-Stomp-Dialog (`FANG.Messages.OtherUser`, `LockStompTitle`, `LockStompConfirm`) in allen 10 Locales.

## [14.1.1-beta.2] - 2026-05-15
### Fixed
- **Edge-Richtungs-Pfeil nicht mehr sichtbar (Regression aus 14.1.0-beta.1):** Der Inline-Style-Refactor hatte die `style="display:none"`-Schalter auf `class="hidden"` umgestellt — die JS toggelte aber weiterhin `style.display`, was wegen `!important` in `.hidden` nicht mehr griff. Pfeile gerichteter Edges werden jetzt wieder korrekt ein-/ausgeblendet via `classList.toggle("hidden", …)`.
- **Monitor-Mode UI-Leak beim Schließen:** Zwei `_onClose`-Methoden in `FangApplication` haben sich gegenseitig überschrieben. Die erste (Cleanup von `#ui-bottom`, `#hotbar`, `#players`, `body.fang-monitor`, ResizeObserver-Disconnect, Body-Style-Reset) lief nie. Nach Schließen des Monitor-Modes blieb die Foundry-UI versteckt. Beide Methoden zu einer gemerged.
- **6 fehlende i18n-Keys in `en.json`:** `FANG.Messages.SaveSuccess`, `FANG.UI.Color`, `FANG.UI.Background.Palette.{DeepMahogany, Forest, Ocean, Shadow}`. Wurden im Code referenziert (`fang-app.js:79-82`, `:1790`, `:3409`) aber existierten nicht — Foundry zeigte den Rohschlüsselnamen. Schlüssel ergänzt und in alle 9 weiteren Locales übersetzt (cs, de, es, fr, it, nl, pl, pt-BR, ru).

## [14.1.0-beta.1] - 2026-05-04
### Beta — Design System Pass
A focused design refactor; no functional/gameplay changes. Marked **beta** because the surface area touched is large.

### Added
- **Design Tokens:** New CSS custom properties for spacing (`--fang-space-1..6`), radius (`--fang-radius-sm/md/lg/pill`), text sizes (`--fang-text-xs..3xl`), shadows (`--fang-shadow-lg/xl`), motion (`--fang-anim-fast/base/slow`) and z-index layers (`--fang-z-bg/tooltip/context-menu/spectator/overlay/fullscreen`).
- **Color Tokens:** Promoted hardcoded values to variables — `--fang-primary-red-hover`, `--fang-primary-red-light`, `--fang-text-muted/soft/faint/helper/mute-warm`, `--fang-bg-alt`, `--fang-bg-banner`, `--fang-border-hover`, `--fang-danger`, `--fang-danger-bg`.
- **Utility Classes:** Added `.fang-form-row`, `.fang-form-label[--small]`, `.fang-inline-checkbox`, `.fang-help-text[--tight]`, `.fang-section-hint`, `.fang-edit-group`, `.fang-button-row-tight`, `.fang-slider[-group/-meta]`, `.fang-visually-hidden`, `.fang-quest-picker[-header/-list]`, `.btn--block`, `.btn--accent`.
- **Accessibility:** Tab navigation now uses real `<button role="tab">` elements with `aria-selected` (synced via JS) and `aria-label` for icon-only tabs. `<i>` icons carry `aria-hidden="true"`. Added `:focus-visible` outlines for tabs, buttons, inputs, selects, lock-button and context-menu items. Added `prefers-reduced-motion` media query that disables all animations/transitions for affected users.

### Changed
- **CSS deduplication:** Removed ~250 lines of duplicate definitions for `.narrative-quest-item`, `.narrative-quests-header`, `#narrative-quests-container`, `.narrative-close`, `.edge-spotlight-card`, `.spectator-active-indicator`, `.button-group-nest` and the `@keyframes fangPulseIndicator` block. Single source of truth restored.
- **Background presets:** Merged the duplicated `.preset-tile.preset-*` (config dialog) and `#fang-bg-layer.fang-bg-preset-*` (canvas layer) declarations into shared selectors. Saved 6 large `data:` SVG noise URLs from being parsed twice.
- **Cyberpunk theme:** Three separate selectors (`:root`, `body`, `.fang-app-container`) merged into a single grouped selector. Theme also now provides muted-text overrides for cyberpunk palette.
- **Tab markup:** `<a class="tab-btn">` → `<button type="button" class="tab-btn" role="tab">`. Properly keyboard-focusable; CSS resets the native button look.
- **Z-index sanity:** Replaced literal `2147483647` with the `--fang-z-fullscreen` token (`200000`).
- **`will-change` discipline:** `#fang-bg-layer` no longer permanently advertises `will-change: opacity, transform, filter`. Promotion is now opt-in via `.is-animating`.
- **Inline styles removed:** All `style="…"` attributes inside `templates/fang-app.hbs` (≈ 25 instances) replaced with utility classes — including the large quest-picker block and the edge-directional indicator. Easier to theme & override.
- **Danger button:** `.btn.danger-btn` is now a defined CSS variant (was previously inline-styled per-button).

### Fixed
- **Mixed `font-weight` on `.button-group-nest h4`:** removed conflicting `font-weight: 800` and `font-weight: 600` overrides — header now has a single, intentional weight.
- **Conflicting checkbox styles:** Inline checkbox markup had `style="width:auto; margin:0; cursor:pointer"` repeated 8× — now a single `.fang-inline-checkbox` class.

### Notes
- File size: `styles/fang.css` shrunk from **2518 → ~2500** lines while gaining new utilities (net −250 duplicate lines, +250 token/utility/a11y lines).
- No JS API changes. Foundry compatibility unchanged (V13 / V14).

## [14.0.19] - 2026-04-22
### Added
- **Expanded Localization Pack:** Added full i18n files for French (`fr`), Spanish (`es`), Portuguese Brazil (`pt-BR`), Italian (`it`), Polish (`pl`), Russian (`ru`), Czech (`cs`), and Dutch (`nl`).
- **Translation Automation Script:** Added `tools/translate_i18n_vertex.py` and `tools/vertex_endpoint_client.py` to generate/refresh locale files via the same Vertex/Gemini approach used in your translation toolkit.

### Changed
- **Module Language Metadata:** Updated `module.json` language entries so Foundry can offer all new locales in the UI.
- **Docs/Planning Sync:** Updated README and TODO to reflect multilingual availability.

## [14.0.18] - 2026-04-22
### Fixed
- **Theme On All FANG Windows:** The selected theme now applies consistently to open FANG dialogs, including **Background Settings** and **Manage Factions** windows.
- **Cyberpunk Dialog Styling:** Added dedicated cyberpunk styling for dialog inputs, buttons, faction rows, and premium/background-config elements so the windows no longer keep the old fantasy look.

### Changed
- **No Legacy Theme Flag:** Removed the hidden legacy `cyberpunkTheme` setting and kept a single direct source of truth via `themeVariant`.
- **Global Theme Variables:** Cyberpunk theme variables are now applied globally on the document root/body, ensuring all FANG windows inherit the active design instantly.

## [14.0.17] - 2026-04-22
### Added
- **Theme Variant Dropdown (Module Settings):** Replaced the single Cyberpunk toggle with a normal module-settings dropdown (`Fantasy` / `Cyberpunk`) for world-wide theme selection.

### Changed
- **Theme Live Sync Across Open Windows:** Theme changes now re-apply immediately to all currently open FANG windows on each client, including already opened player/monitor views.
- **Legacy Theme Migration:** Existing worlds that used the previous `cyberpunkTheme` boolean are automatically migrated to the new dropdown setting.
- **Versioning Scheme:** Switched the module to a pure `14.x.xx` version scheme.
- **Beta Version Format:** Beta workflow now generates versions as `14.x.xx-beta.<run_number>`.

## [2.0.16] - 2026-04-22
### Added
- **Optional Cyberpunk Theme (Settings):** Added a new world setting (`Enable Cyberpunk Theme`) in the normal Foundry module settings to switch FANG into a neon cyberpunk visual style.

### Changed
- **Live Theme Application:** The selected theme is now applied immediately to already open FANG windows without reopening the app.
- **Version Bump:** Advanced the module version to v2.0.16.

## [2.0.15] - 2026-04-22
### Changed
- **Foundry Compatibility Visibility:** Beta builds now include the Foundry compatibility range in the version string (`-beta.<run>.fvtt12-14`) to make supported generations immediately visible.
- **Release Naming:** GitHub release names now include the Foundry compatibility target (`Release vX.Y.Z (FVTT 13-14)` and `Beta latest (FVTT 12-14)`).
- **Version Bump:** Advanced the module version to v2.0.15.

## [2.0.14] - 2026-04-22
### Added
- **Beta Release Channel:** Added an automated beta release workflow (`.github/workflows/release-beta.yml`) that builds from the `beta` branch and updates a fixed prerelease tag `beta-latest`.
- **Fixed Beta Install Link:** Beta testers can install using a permanent manifest URL (`releases/download/beta-latest/module-beta.json`).

### Changed
- **Beta Manifest Generation:** Beta builds now generate `module-beta.json` at runtime with version suffix `-beta.<run_number>` and compatibility range `12` to `14`.
- **README Install Docs:** Added explicit Stable/Beta installation channels in English and German, including guidance that both channels use the same module id (`fang`).
- **Stable Workflow Hardening:** Added a guard in `release.yml` so only version tags are treated as stable releases.
- **Version Bump:** Advanced the module version to v2.0.14.

## [2.0.13] - 2026-04-22
### Added
- **Browser Smoke-Test Script:** Added `tools/fang-smoke-test.mjs` to run a fast Foundry login/module smoke test flow (ready-state, module API, FANG window open, Actor Directory button injection).

### Fixed
- **Placeholder Image 404:** Switched the default placeholder image path to the shipped SVG asset and added legacy path normalization for `placeholder-npc-default.webp` values stored in older graph data.
- **Spotlight Image Resolution:** Normalized spotlight portrait sourcing to use the same node image resolver, preventing stale legacy placeholder paths from surfacing during spotlight events.

### Changed
- **Version Bump:** Advanced the module version to v2.0.13.

## [2.0.12] - 2026-04-16
### Added
- **DiploGlass Character-to-Faction Assignment:** FANG now assigns graph nodes to imported DiploGlass factions based on per-character reputation values (highest positive value wins).

### Changed
- **DiploGlass Sync Triggers:** One-way sync now also reacts to DiploGlass reputation/mode setting changes (`playerReputations`, `globalReputations`, `usePerPlayerReputation`) in addition to faction updates.
- **README Update:** Documented the new automatic assignment behavior in the DiploGlass feature section.
- **Version Bump:** Advanced the module version to v2.0.12.

## [2.0.11] - 2026-04-15
### Added
- **DiploGlass One-Way Faction Sync (Optional):** Added a FANG-side integration that imports and syncs DiploGlass factions into FANG (name, icon, and metadata such as journal/rolltable references) without modifying DiploGlass.
- **First-Run GM Prompt:** Added a one-time prompt when DiploGlass is detected, allowing GMs to enable or skip faction sync directly at startup.
- **Sync Metadata Persistence:** Imported factions now store external source references to keep updates and removals consistent on subsequent sync runs.

### Changed
- **Version Bump:** Advanced the module version to v2.0.11 for this feature release.

### Credits
- Thanks to **GM MattCat** for bringing in the DiploGlass sync idea.

## [2.0.10] - 2026-04-03
### Changed
- **Dual-Version Compatibility Metadata**: Updated module compatibility to target Foundry VTT 13 through 14 (`minimum: 13`, `verified: 14`, `maximum: 14`) and refreshed user-facing version text.
- **Actor Directory Popout Detection**: Hardened popout detection to support both v13 (`popOut`) and v14 (`isPopout` / `popout`) code paths for Only-Sheet integration and cleanup logic.

### Fixed
- **v14 Popout Cleanup Reliability**: Added a `closeApplicationV2` fallback hook for Actor Directory popouts to improve close-state synchronization and ghost-shell cleanup under Foundry VTT 14.

## [2.0.9] - 2026-03-28
### Changed
- **Release Version Bump**: Advanced the project to v2.0.9 across module metadata, README, changelog, and task tracking files for the next patch release.
- **Repository Sync Check**: Verified that no additional feature or fix commits landed after v2.0.8 before preparing this release push.

## [2.0.8] - 2026-03-23
### Changed
- **Release Version Bump**: Advanced the project to v2.0.8 across module metadata, README, changelog, and task tracking files for the next patch release.
- **Repository Sync Check**: Verified that no additional feature or fix commits landed after v2.0.7 before preparing this release push.

## [2.0.7] - 2026-03-22
### Changed
- **Release Version Bump**: Advanced the project to v2.0.7 across module metadata, README, changelog, and task tracking files for the next patch release.
- **Repository Sync Check**: Verified that no additional feature or fix commits landed after v2.0.6 before preparing this release push.

## [2.0.6] - 2026-03-21
### Changed
- **Release Version Bump**: Advanced the project to v2.0.6 across module metadata, README, changelog, and task tracking files for the next patch release.
- **Repository Sync Check**: Verified that no additional feature or fix commits landed after v2.0.5 before preparing this release push.

## [2.0.5] - 2026-03-20
### Changed
- **Version Bump**: Advanced the project to v2.0.5 across the release metadata, README, changelog, and task tracking files for the next patch release.

## [2.0.4] - 2026-03-19
### Changed
- **Release Metadata Refresh**: Bumped the documented module version across the project files and aligned the release bookkeeping for the current repository state.

## [2.0.3] - 2026-03-17
### Fixed
- **Player Journal Action Icon**: Swapped the player-journal button to a stable Font Awesome book icon so the action renders consistently in the node details UI.

## [2.0.2] - 2026-03-15
### Added
- **Placeholder NPC Workflow**: GMs can create placeholder contacts directly in the graph, including a dedicated placeholder portrait and localized UI/actions.

### Changed
- **Canvas Actor Handling**: Graph nodes now persist actor references and portrait sources separately, improving dropdowns, export/import, and spotlight handling for non-standard nodes.

### Fixed
- **Drop-to-Replace Flow**: Dropping an actor onto a placeholder can now replace that node in place instead of forcing a second manual rebuild of the surrounding relationships.

## [2.0.1] - 2026-03-14
### Added
- **Search & Filter Overlay**: Added a local search overlay for nodes and links with exact-match highlighting and optional isolate mode for large graphs.

### Fixed
- **Actor Directory Popout Compatibility**: Fixed FANG integration for Actor Directory popout windows and followed up with a second stabilization pass for the popout flow.

## [2.0.0] - 2026-03-14
### Added
- **Background Settings (Live Sync)**: Customize the graph background via palette colors, custom images (blur/opacity), or style presets. Changes sync live to players/monitors.
- **Quest Log Upgrades**: Link one *or multiple* Quest Journals per node and open them via context menu / in-canvas picker.
- **Quest Spotlight**: New quest-focused Spotlight overlay (monitor auto-scroll + GM-driven scroll sync).
- **Only-Sheet Integration**: Optional setting to replace the Only-Sheet actor button and inject quick-access buttons for Actors and FANG.

### Changed
- **Spoiler Protection**: Non-GMs only see actors/journals they have permission to access.
- **Background Rendering**: Background now renders on a dedicated `#fang-bg-layer` behind the canvas.

### Fixed
- **Safer Deletion Flow**: Confirm dialogs for node/link deletion and more robust parsing of node/link identifiers.
- **Selection / Centering Edge Cases**: Trimmed select parsing and normalized select values to prevent wrong sidebar selections.
- **Background Image UX**: Prevents blur/zoom flashes while images load and adds live preview for blur/opacity without excessive settings writes.

## [1.2.7] - 2026-03-10
### Fixed
- **UI Refinements**: Renamed "(Legacy) Quick Notes" to "Quick Lore Note", fixed Assign Journal dialog button alignment, and added explanatory tooltips.
- **Journal Linking Dialog**: Wrapped node and link deletion in native `Dialog.confirm` dialogs, preventing accidental deletion.
- **Data Persistence**: Legacy player lore notes are now backed up in the actor's flags to prevent data loss when deleting nodes.
- **Journal Protection**: FANG Journal is automatically placed inside a localized "FANG - Do Not Delete" folder with explicit warning texts.

## [1.2.6] - 2026-03-08
### Fixed
- **CSS Namespacing**: Fixed an issue where generic CSS classes (like `.container` and `.sidebar`) in FANG caused formatting and layout bugs in the default D&D 5e Actor Sheets. All FANG UI styles are now strictly scoped to the `.fang-app-container`.

## [1.2.5] - 2026-03-07
### Added
- **In-Person Gaming Mode**: New setting to enable specialized monitor controls and display logic.
- **Configurable Monitor Name**: Users can now specify the display name for the monitor view (defaults to "Monitor"). Socket logic and display rules now use this setting (case-insensitive, includes-match).
- **Integrated Physics Controls**: Added a "Physics & Simulation" section to the View tab for GMs, allowing live control of Cosmic Wind and its strength.

### Improved
- **UI Aesthetics**: Completely redesigned the Presentation button groups with a more premium, structured layout, golden accents, and group headers.
- **Internalized Settings**: Moved physics-related settings out of the main module configuration and directly into the app's View tab for better accessibility.
- **Dynamic Visibility**: Monitor controls are now smarter, only appearing when In-Person Gaming Mode is on AND a valid monitor user is online.

## [1.2.4] - 2026-03-07
### Added
- **Connection Context Menu**: Right-click on any connection (edge) to edit its information, add detailed notes, or delete it, mirroring the node features.
- **Connection Narrative Spotlight**: Added a cinematic Spotlight specifically designed for connections, showing the source character portrait, connection details, the target character portrait, and a glowing directional arrow if applicable.

### Fixed
- **Directed Arrow Start Point**: Fixed the starting point of directed arrows so they originate from the center of the source token, matching the behavior of regular connections and preventing "snaking" around the token.
- **Link Click Detection**: Fixed clicking on individual links when multiple connections exist between two tokens. The hit-detection curve formula now matches the rendered curve, sampling increased for better accuracy.
- **Tooltip Positioning**: The hover tooltip no longer appears too far away when flipped to the left side. Now measures actual tooltip width instead of using a hardcoded estimate.

## [1.2.2] - 2026-03-06
- **Center Node Sync**: Centering/uncentering a token now syncs correctly to all players and the monitor. Positions are saved once the simulation has settled, not immediately.
- **Translation Fixes**: Added the missing localization string for closing the Monitor View.

### Improved
- **Connection Details UI**: Upgraded the edit connection dialog to match the visual style and terminology of node lore editing.
- **Link Hover Cursor**: The cursor now changes to a pointer when hovering over clickable links, indicating they are interactive.

## [1.2.1] - 2026-03-02
### Fixed
- **Monitor Fullscreen Black Bar**: Resolved the persistent ~78px gap at the bottom of the Monitor view. Applied a multi-layered fix: `_updatePosition` override, `MutationObserver` to guard against Foundry resetting styles, forced body padding/margin reset, and explicit hiding of all Foundry UI containers via JS.

## [1.2.0] - 2026-03-01
### Added
- **Exclusive Edit-Lock**: Only one user can edit the graph at a time to prevent conflicts.
- **Canvas Status Indicator**: A floating banner at the top of the canvas shows who is currently editing.
- **GM Override**: GMs can force-release locks held by players.
- **Socket Synchronization**: Real-time updates for lock status across all clients.
- **Auto-Zoom for All Users**: When the GM shares the graph, all players and monitors now automatically zoom-to-fit so all tokens are visible.
- **Center Graph Sync**: The GM's "Center Graph" button now works for all connected clients (players and monitors), not just locally.
- **Live Permission Toggle**: Toggling "Allow Player Editing" now instantly shows/hides the sidebar and edit controls for players without requiring a close/reopen.

### Fixed
- **Monitor Fullscreen Centering**: The Monitor's `zoomToFit` was blocked by the edit-lock guard. Centering is now treated as a view-only operation accessible to all users.
- **Context Menu Crash**: Fixed a `replaceChild` typo in `_showContextMenu` that could cause the right-click menu to break.
- **Player Sidebar Refresh**: When the GM toggles player editing permissions, the lock UI now updates in real-time (previously required close/reopen).
- **Label Overlap & Physics**: Reduced global repulsion force, tighter link curves, centered labels by default with collision-resolution pass.
- **Undirected Link Alignment**: Undirected links now draw center-to-center; directed links clip at token boundary for clean arrow placement.
- Improved Edit-Lock reliability for players (socket-based permission bypass).
- Fixed UI state where players could interact with sidebar before acquiring lock.

## [1.1.9] - 2026-03-01
### Added
- **Enhanced Narrative Spotlight**:
  - Cinematic sequenced activation (zoom first, then card).
  - High-resolution actor portraits used instead of tokens.
  - Subtitle displaying both Role and Faction information.
  - Centered overlay design with optimized camera centering to keep the character visible.
  - Improved aesthetics: Golden divider, red-themed title text.
  - Manual close only (auto-hide removed for better storytelling pacing).
- **Spectator Camera Sync**: Real-time GM camera broadcasting to all connected players and the monitor.
- **UI & Controls**: New "Spectator Mode" toggle in the View tab and "Spotlight" context menu action.
- **Localization**: Full German and English support for all Storyteller features.

## [1.1.8] - 2026-03-01
### Added
- **Auto-Zoom to Fit**: The graph now automatically adjusts zoom on open to ensure all tokens are visible within the canvas.
- **Monitor-Exclusive Boss Pivot**: For the dedicated Monitor account (user name containing "monitor"), the view now centers strictly on "Center" (Boss) nodes.
- **Center Graph Button**: Added a manual button in the "View" tab to re-center and fit the graph to the current view.
- **Localization**: Added EN/DE strings for the new centering features.

### Fixed
- **Persistent Auto-Zoom**: Auto-zoom now triggers reliably every time the graph is closed and re-opened.
- **Constructor Stability**: Resolved a critical race condition where D3 was accessed before loading.
- **Manual Zoom Preservation**: Changing sidebar settings no longer resets your manually adjusted zoom level to 100%.
- **V13 Application Lifecycle**: Corrected `_onClose` and `render` calls for full Foundry V13 `ApplicationV2` compatibility.
- **Zero-Padding Monitor View**: Screen centering on the monitor is now mathematically perfect by removing viewport offsets.

## [1.1.5] - 2026-02-28
### Added
- **Context-Sensitive Sidebar**: The sidebar now adapts to your selection (Node vs Link).
- **Interactive Selection**: Clicking a token or link in the graph immediately selects it in the sidebar.
- **Singleton Guard**: Prevented multiple FANG windows from opening simultaneously.

## [1.1.4] - 2026-02-27
### Added
- **Visual Grouping (Factions)**: Group characters into factions with custom icons, colors, and visual hubs.
- **Sidebar Tab Redesign**: Reorganized the sidebar into Editor, View, and Advanced tabs.

## [1.1.3] - 2026-02-26
### Added
- **Context Menu**: Right-click tokens for quick access to role, lore, and deletion.
- **Hover Lore**: Hover over tokens to see their background story in a premium tooltip.

## [1.1.2] - 2026-02-25
### Added
- **Boss Nodes (Center Gravity)**: Mark important characters as "Centers" to have them gravitate to the middle with a golden aura.
- **Cosmic Wind**: Added a subtle ambient animation to the graph nodes.

## [1.1.1] - 2025-05-15
### Added
- **Directional Links**: Support for arrows on relationship lines.

## [1.0.7] - 2026-02-24
### Added
- **Drag & Drop**: Drag actors from the Foundry Sidebar directly onto the canvas.
