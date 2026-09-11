# FANG (Foundry Actor Nexus Graph) - TODO / Feature Requests

Status synced to `14.2609.3` (beta, unreleased) / Stand synchronisiert auf `14.2609.3` (Beta, noch nicht ausgeliefert).
Last release on main is `v14.2609.2` / Letzte Auslieferung auf main ist `v14.2609.2`.

Open items come first, because that is what this file is for. What is already built is listed in one line each further down; the reasoning behind each feature is in `CHANGELOG.md`, the description for users in `README.md` / Offene Punkte stehen oben, dafuer ist die Datei da. Was bereits gebaut ist, steht weiter unten in je einer Zeile; die Begruendung zu jeder Funktion steht im `CHANGELOG.md`, die Beschreibung fuer Nutzer im `README.md`.

The numbers are kept as they were, so older references still lead somewhere / Die Nummern bleiben wie sie waren, damit aeltere Verweise noch irgendwo hinfuehren.


## Open / Offen

### Needs a live check before it counts as finished / Braucht eine Abnahme im laufenden Spiel

- [ ] **6.1 Walk a recap through a real session / Rueckblick einmal echt durchspielen:** The journal page behind a recap has never been exercised in a running world. Five things have to hold: the page is created when the entry is made, the button opens it, its author can edit it without holding the graph's edit lock, deleting the entry asks whether the page goes too, and a player - who is not allowed to create documents - gets a page through the GM's client. Until that is confirmed, 3.5 stays open / Die Journalseite hinter einem Rueckblick wurde nie in einer laufenden Welt benutzt. Fuenf Dinge muessen stimmen: Die Seite entsteht beim Anlegen des Eintrags, der Knopf oeffnet sie, ihr Verfasser kann sie ohne die Bearbeitungssperre des Graphen aendern, beim Loeschen des Eintrags wird nach der Seite gefragt, und ein Spieler - der keine Dokumente anlegen darf - bekommt seine Seite ueber den Client der Spielleitung. Solange das nicht bestaetigt ist, bleibt 3.5 offen.

- [ ] **3.5 Proper editor for flashbacks / Richtiger Editor fuer Rueckblicke:** Built, not yet accepted. A recap no longer carries its prose in a world setting but on a page in the journal **FANG Chronik**, opened in Foundry's own editor with formatting, images and `@UUID` references. Closes together with 6.1 / Gebaut, noch nicht abgenommen. Ein Rueckblick traegt seinen Fliesstext nicht mehr in einer Welt-Einstellung, sondern auf einer Seite im Journal **FANG Chronik**, geoeffnet in Foundrys eigenem Editor mit Formatierung, Bildern und `@UUID`-Verweisen. Schliesst zusammen mit 6.1.

### Collaborative editing, building block by building block / Gemeinsames Bearbeiten, Baustein fuer Baustein

- [ ] **6.3 Real collaborative editing / Echtes gemeinsames Bearbeiten:** Concept in `KONZEPT-GEMEINSAMES-BEARBEITEN.md` (11.09.2026). Decisions taken: soft lock per element that shows and blocks with an override; no direct writing for players (a player who could write the flag could delete the journal). All six building blocks were built on 11.09.2026 and then taken off `beta` again, because only the concept had been asked for; they live on the branch `gemeinsames-bearbeiten` (state edbe403) with 32 tests of their own and are waiting for a test at the table before anything of it returns to beta / Konzept in `KONZEPT-GEMEINSAMES-BEARBEITEN.md` (11.09.2026). Entscheidungen: weiche Sperre je Element, die anzeigt und blockiert, mit Uebersteuern; kein direktes Schreiben fuer Spieler (wer das Flag schreiben kann, kann das Journal loeschen). Alle sechs Bausteine wurden am 11.09.2026 gebaut und wieder von `beta` genommen, weil nur das Konzept bestellt war; sie liegen auf dem Zweig `gemeinsames-bearbeiten` (Stand edbe403) mit 32 eigenen Tests und warten auf einen Test am Tisch, bevor etwas davon auf beta zurueckkommt.

### Quality pass / Qualitaetspass

- [ ] **5.1 Click through every player-facing path in Foundry / Jeden Spielerpfad in Foundry durchklicken:** The code side is done (07.09.2026): every place that draws node, link, quest, faction, zone or chronicle data runs through the central policy, and the cases checked - canvas labels, the actor editor, the spotlight payload, the chronicle filter - all hold. What is left is the part no reading can replace: sitting in a v13 and a v14 world as a player and clicking everything, because a leak here comes from a path nobody thought of, not from a missing check. Out of scope by decision: anything reachable only through the console. See "Visibility is a display filter" in `AGENTS.md` / Die Codeseite ist erledigt (07.09.2026): Jede Stelle, die Knoten-, Verbindungs-, Quest-, Fraktions-, Zonen- oder Chronikdaten zeichnet, laeuft ueber die zentrale Politik, und die geprueften Faelle - Beschriftung auf dem Canvas, Akteurs-Editor, Spotlight-Payload, Chronikfilter - halten alle. Offen ist der Teil, den kein Lesen ersetzt: als Spieler in einer v13- und einer v14-Welt sitzen und alles anklicken, denn ein Leck kommt hier aus einem Pfad, an den niemand gedacht hat, nicht aus einer fehlenden Pruefung. Ausdruecklich nicht im Umfang: alles, was nur ueber die Konsole erreichbar ist. Siehe "Visibility is a display filter" in `AGENTS.md`.

- [ ] **5.3 Unused localization keys / Ungenutzte Lokalisierungs-Schluessel:** 81 of 475 keys are referenced nowhere, mostly leftovers of the removed tab bar, the old grouping buttons and the old context-menu dialogs. Two of them are not tidy-up: `Messages.HiddenEditBlocked` and `ActorEditor.HiddenPlayerEditHint` suggest a player is no longer told why a hidden actor cannot be edited. Check every key for lost behaviour before deleting, and delete in all ten locale files / 81 von 475 Schluesseln werden nirgends referenziert, groesstenteils Reste der entfernten Reiterleiste, der alten Gruppierungsknoepfe und der alten Kontextmenue-Dialoge. Zwei davon sind kein blosses Aufraeumen: `Messages.HiddenEditBlocked` und `ActorEditor.HiddenPlayerEditHint` deuten darauf hin, dass Spielern nicht mehr gesagt wird, warum ein verdeckter Akteur nicht bearbeitbar ist. Jeden Schluessel vor dem Loeschen auf verlorene Funktion pruefen, und in allen zehn Sprachdateien loeschen.

- [ ] **5.4 Calendar module coverage / Abdeckung von Kalendermodulen:** Only Calendaria, Seasons & Stars and Simple Calendar are recognised by name. Any other module falls back to Foundry's own calendar and loses the campaign epoch, so the years come out wrong rather than missing - which is worse, because nobody notices / Erkannt werden nur Calendaria, Seasons & Stars und Simple Calendar. Jedes andere Modul faellt auf Foundrys eigenen Kalender zurueck und verliert dabei die Kampagnen-Epoche; die Jahreszahlen sind dann falsch statt zu fehlen - was schlimmer ist, weil es niemandem auffaellt.

- [ ] **5.2 Zone manager polish / Zonenmanager-Feinschliff:** Waiting on beta feedback that confirms the model before the design is worked on / Wartet auf Beta-Rueckmeldungen, die das Modell bestaetigen, bevor am Design gearbeitet wird.

### On hold / Zurueckgestellt

- [ ] **1.2.4 Expand conditions / Zustaende erweitern:** No further conditions planned for now / Vorerst keine weiteren Zustaende geplant.


## Done / Erledigt

### 1. Features and Improvements / Features und Verbesserungen
- [x] **1.1.1 Factions / Fraktionen** - base system including management.
- [x] **1.1.2 Affiliation zones / Zugehoerigkeitsfelder** - visual zones for a city, region or organization.
- [x] **1.1.3 Relationship types / Beziehungstypen** - curated presets with theme-aware colors and line styles.
- [x] **1.2.1 Background customization / Hintergrundbild** - color, image or preset.
- [x] **1.2.2 Connection labels / Verbindungs-Texte**
- [x] **1.2.3 Hover focus highlighting / Hover-Fokus** - dims unrelated nodes and links.
- [x] **1.3.1 Stop the simulation wobble / Simulation "Wabbeln" anhalten**
- [x] **1.3.2 "Show Monitor" button / "Zeigen Monitor"-Knopf** - tooltip and options revised.
- [x] **1.3.3 Search and filter / Suche und Filter** - overlay with highlight and isolate for larger graphs.
- [x] **1.3.4 Actor Directory popout compatibility / Popout-Kompatibilitaet**
- [x] **1.3.5 Placeholder NPCs / Platzhalter-NPCs** - created directly, later replaced by real actors.

### 2. Visibility and Focus / Sichtbarkeit und Fokus
- [x] **2.1 Fully hide tokens / Token komplett ausblenden** - including their incoming and outgoing links.
- [x] **2.2 GM secret nodes / GM-Secret-Nodes** - hidden story nodes with a later reveal.
- [x] **2.3 Player edit leak audit / Spieler-Bearbeitung gegen Spoiler geprueft** - dialogs shown to players expose no GM fields, true names, aliases, journals, quests, factions or conditions of a hidden node. The broader sweep is 5.1.

### 3. Chronicle / Chronik
- [x] **3.1 Player story timeline / Spieler-Chronik** - GM-controlled events linked to nodes, factions, quests and sessions.
- [x] **3.2 Visibility rules / Sichtbarkeit** - entries use the same central policy as nodes, links, quests and factions.
- [x] **3.3 First beta scope / Erster Beta-Umfang** - in-canvas chronicle, manual events, token views, editable player-facing text.
- [x] **3.4 Automation / Automatik** - graph actions write narrative default entries without uncovering hidden tokens.
- [x] **3.6 Calendar support / Kalenderanbindung** - game day and time of day from a calendar module or Foundry's own calendar, with the real date as a fallback when a world has neither.
- [x] **3.7 Time axis / Zeitachse** - one tick per game day, newest to the right, dragged or wheeled instead of carrying a scrollbar.
- [x] **3.8 Chronological ordering / Chronologische Ordnung** - sorted by game day and time of day, not by the moment someone typed it.

### 6. Requests from outside / Wuensche von aussen
- [x] **6.2 Multiple factions per character / Mehrere Fraktionen je Charakter** - checkbox list, one arc per faction on the ring, member lines for every faction, a starred primary for position. Asked for in #8, confirmed by the reporter, shipped in v14.2609.2.

### 4. Internationalization and Misc / Internationalisierung und Sonstiges
- [x] **4.1 Additional languages / Weitere Sprachen** - French, Spanish, Portuguese (Brazil), Italian, Polish, Russian, Czech and Dutch. All ten are maintained in this repository; Weblate was tried from 06.09. to 11.09.2026 and removed / Alle zehn werden hier im Repository gepflegt; Weblate lief vom 06.09. bis 11.09.2026 und wurde wieder entfernt.
- [x] **4.2 Localization cleanup / Lokalisierungen bereinigt** - missing keys and broken strings repaired from the English source.
- [x] **4.3 Direct server deploy script / Server-Direktdeploy-Script** - guarded PowerShell helper for testing on the server before a beta or stable release.


## Removed from the roadmap / Aus der Planung entfernt

- **Mini-map navigator / Mini-Map-Navigator:** not planned any further / wird nicht weiter verfolgt.
