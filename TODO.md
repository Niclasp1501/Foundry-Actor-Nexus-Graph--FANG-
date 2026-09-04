# FANG (Foundry Actor Nexus Graph) - TODO / Feature Requests

Status synced to `v14.2605.3` / Stand synchronisiert auf `v14.2605.3`.

## 1. Features and Improvements / Features und Verbesserungen

### 1.1 Factions and Affiliations / Fraktionen und Zugehoerigkeiten
- [x] **1.1.1 Factions implemented / Fraktionen implementiert:** Base system including management is available / Grundsystem inkl. Verwaltung ist vorhanden.
- [x] **1.1.2 Affiliation zones / Zugehoerigkeitsfelder:** Visual zones (e.g. city/region/organization) to group characters / Visuelle Bereiche (z. B. Stadt/Region/Organisation), in denen Charaktere zugeordnet werden koennen.
- [x] **1.1.3 Relationship types / Beziehungstypen:** Connections can use curated type presets with theme-aware colors and line styles / Verbindungen koennen kuratierte Typen mit theme-faehigen Farben und Linienstilen nutzen.

### 1.2 Visuals and UI / Visuelles und UI
- [x] **1.2.1 Background customization / Hintergrundbild:** Configurable background exists (color/image/preset) / Konfigurierbarer Hintergrund ist vorhanden (Farbe/Bild/Preset).
- [x] **1.2.2 Connection labels / Verbindungs-Texte:** Labeled connections are available / Beschriftete Verbindungen sind vorhanden.
- [x] **1.2.3 Hover focus highlighting / Hover-Fokus:** Hover dims unrelated nodes/links / Hover dimmt irrelevante Nodes/Links.
- [ ] **1.2.4 Expand conditions / Zustaende erweitern:** On hold for now / Vorerst pausiert (keine weiteren Zustaende geplant).

### 1.3 Usability and Settings / Usability und Einstellungen
- [x] **1.3.1 Stop simulation wobble more clearly / Simulation "Wabbeln" offensichtlicher anhalten:** Done / Erledigt.
- [x] **1.3.2 "Show Monitor" button / "Zeigen Monitor"-Button:** Tooltip/options revised / Tooltip/Optionen ueberarbeitet.
- [x] **1.3.3 Search and filter / Suche und Filter:** Search overlay with highlight/isolate for larger graphs / Such-Overlay mit Highlight/Isolate fuer grosse Graphen ist vorhanden.
- [x] **1.3.4 Actor Directory popout compatibility / Actor Directory Popout-Kompatibilitaet:** Popout integration stabilized / Integration fuer Popout-Fenster stabilisiert.
- [x] **1.3.5 Placeholder NPC workflow / Platzhalter-NPCs:** Placeholders can be created and later replaced by real actors via drag and drop or context menu / Platzhalter koennen direkt angelegt und spaeter per Drag & Drop oder Kontextmenue durch echte Akteure ersetzt werden.

## 2. Visibility and Focus Management / Sichtbarkeit und Fokus-Management

- [x] **2.1 Fully hide tokens for players/monitor / Token komplett ausblenden (Spieler/Monitor):** Hide token including incoming/outgoing links for player/monitor views / Vollstaendig unsichtbar inkl. eingehender/ausgehender Verbindungen (nur fuer Spieler/Monitor).
- [x] **2.2 GM secret nodes / GM-Secret-Nodes:** Hidden story nodes with later GM reveal / Versteckte Story-Knoten mit spaeterem Reveal durch den GM.
- [x] **2.3 Player edit leak audit / Spieler-Bearbeitung gegen Spoiler pruefen:** Player-facing edit dialogs must never expose hidden-node GM fields, true names, aliases, player-view settings, journals, quests, factions, or conditions that would reveal secrets / Spieler-Dialoge duerfen bei verdeckten Knoten keine GM-Felder, echten Namen, Alias-/Spieleransicht-Einstellungen, Journale, Auftraege, Fraktionen oder Zustaende verraten.

## 3. Timeline and Player Knowledge / Chronik und Spielerwissen

- [x] **3.1 Player Story Timeline / Spieler-Chronik:** Curated, GM-controlled timeline of story events linked to nodes, factions, quests, and sessions / Kuratierte, vom GM gesteuerte Chronik mit Ereignissen, die mit Knoten, Fraktionen, Auftraegen und Sitzungen verknuepft sind.
- [x] **3.2 Timeline visibility rules / Chronik-Sichtbarkeit:** Timeline entries must use the same central visibility policy as nodes, links, quests, and factions / Chronik-Eintraege muessen dieselbe zentrale Sichtbarkeitslogik wie Knoten, Verbindungen, Auftraege und Fraktionen nutzen.
- [x] **3.3 Timeline first beta scope / Chronik erster Beta-Umfang:** In-canvas chronicle with manual events, player-safe visibility, token-level views, and editable player-facing text / In-Canvas-Chronik mit manuellen Ereignissen, spielersicherer Sichtbarkeit, Token-Ansichten und bearbeitbarem Spielertext.
- [x] **3.4 Chronicle automation / Chronik-Automatik:** Graph actions create narrative default entries for appearing tokens, revealed identities, and new relationships while preserving hidden-token facades / Graph-Aktionen erzeugen erzaehlerische Standardeintraege fuer auftauchende Tokens, enthuellte Identitaeten und neue Beziehungen, ohne verdeckte Token aufzudecken.
- [ ] **3.5 Proper editor for flashbacks / Richtiger Editor fuer Rueckblicke:** Session recaps are written by the table itself and run to real prose, but the form offers a bare textarea. Look at Foundry's rich text editor instead, so a recap can carry formatting, links, and @UUID references to actors, scenes, and journals / Sitzungsrueckblicke schreibt der Tisch selbst und sie werden echter Fliesstext, das Formular bietet aber nur ein einfaches Textfeld. Foundrys Rich-Text-Editor anschauen, damit ein Rueckblick Formatierung, Links und @UUID-Verweise auf Akteure, Szenen und Journale tragen kann.

## 4. Internationalization and Misc / Internationalisierung und Sonstiges

- [x] **4.1 Additional languages / Weitere Sprachen:** Added French, Spanish, Portuguese (Brazil), Italian, Polish, Russian, Czech, and Dutch / Hinzugefuegt: Franzoesisch, Spanisch, Portugiesisch (Brasilien), Italienisch, Polnisch, Russisch, Tschechisch und Niederlaendisch.
- [x] **4.2 Localization cleanup / Lokalisierungen bereinigt:** Missing keys and broken mojibake/question-mark strings were repaired from the English source where needed / Fehlende Keys und kaputte Mojibake-/Fragezeichen-Strings wurden bei Bedarf aus der englischen Quelle repariert.
- [x] **4.3 FANG direct server deploy script / FANG Server-Direktdeploy-Script:** Added a guarded PowerShell deploy helper for direct server testing before beta/stable releases / Abgesichertes PowerShell-Deploy-Hilfsscript fuer direkte Server-Tests vor Beta-/Stable-Releases hinzugefuegt.

## 5. Next Quality Pass / Naechster Qualitaetspass

- [ ] **5.1 Full in-Foundry player leak audit / Vollstaendiger In-Foundry-Spieler-Leak-Audit:** Run through every player and GM menu in v13/v14 with hidden, GM-only, quest, faction, zone, and history data / Jeden Spieler- und GM-Pfad in v13/v14 mit verdeckten, GM-only-, Quest-, Fraktions-, Zonen- und Chronikdaten testen.
- [ ] **5.2 Zone manager polish / Zonenmanager-Feinschliff:** Improve visual design once the first beta feedback confirms the model / Design verbessern, sobald erstes Beta-Feedback das Modell bestaetigt.

## Removed from Roadmap / Aus der Planung entfernt

- **Mini-map navigator / Mini-Map-Navigator:** Not currently planned / Wird aktuell nicht weiter verfolgt.
