# Ninjo's FANG (Foundry Actor Nexus Graph)

An interactive, self-arranging Actor Graph module for visualizing Character & NPC Relationships natively in Foundry VTT V13. FANG enables Game Masters and players to dynamically map out self-building relationship networks inside their game world.

*(Scroll down for German version / Scrolle weiter runter für die deutsche Version)*

---

## 🇬🇧 English

### Features
<p align="center">
  <img src="assets/fang_ui_1.png" width="32%" title="Empty Graph UI" />
  <img src="assets/fang_ui_2.png" width="32%" title="Directional and Normal Links" />
  <img src="assets/fang_ui_3.png" width="32%" title="Smart Actor Dropdowns" />
</p>

- **Self-Arranging Actor Graph:** View actors and their relationships in a dynamic system that automatically organizes itself for clarity.
- **Context-Aware Sidebar UI:** The sidebar now dynamically adapts to your selection. Clicking a node or link on the canvas reveals specific "Details" panels for editing names, directions, or roles.
- **Interactive Selection & Deselection:** 
  - **Select on Click:** Clicking any node or link on the canvas automatically selects it in the sidebar.
  - **Deselect on Canvas:** Clicking empty space on the canvas resets all selections and hides contextual editors.
- **Dedicated "Advanced Functions" Tab:** Global tools (like Faction Management and Sharing controls) have been moved to a dedicated tab for a cleaner GM workspace.
- **Player Collaborative Editing:** GMs can toggle a world setting allowing players to actively construct the graph—dropping tokens, creating links, and deleting elements safely via live socket sync.
- **Precise Coordinate Dragging:** Fully corrected coordinate tracking ensures tokens stay perfectly under your mouse during drag-and-drop, even when zoomed or panned.
- **Context Menu & Token Lore:** Right-click or long-press any token to reveal a sleek Radial Context menu! Assign roles or enter detailed multi-line notes stored directly on individual tokens.
- **Spoiler Protection:** Strict permission checking ensures non-GM players cannot see or link unrevealed secret NPCs.
- **Roles & Organizations:** Assign roles or faction affiliations to individual tokens (via UI and formatting), adding secondary layers of depth to the map.
- **Gravity Center (Boss Nodes):** Magnetically anchor important actors (e.g., villains) to the center of the graph with a customizable glowing aura.
- **Visual Grouping:** Group actors (e.g., by location) with visual bounding boxes or cluster zones.
- **Link Label Validation:** Ensures all connections have mandatory labels to prevent confusing "invisible" links.
- **JSON Export & Import (Backup):** Save your entire graph (including token positions, factions, and visual settings) to a file. Perfect for backups or sharing templates.
- **Multi-Language Support (I18n):** Automatically translates to English or German based on Foundry settings.

### Installation
1. Start Foundry VTT and navigate to the **Add-on Modules** tab.
2. Click **Install Module**.
3. Paste the following Manifest URL: `https://github.com/Niclasp1501/Foundry-Actor-Nexus-Graph--FANG-/releases/latest/download/module.json`
4. Restart Foundry and enable **Foundry Actor Nexus Graph (FANG)** in your World's module settings.

### Usage
#### For the Game Master (GM)
1. **Opening FANG:** Click the new "Ninjo's FANG" button inside the **Actors Directory** header, or press `Shift + G`.
2. **Adding Nodes:** Use the side panel to add connections. If the token doesn't exist on the board yet, it will automatically be pulled from your Actors directory.
3. **Sharing the Graph:** 
   - When you are ready, click **"Show Players"** in the Presentation tab.
   - This sends the data to the background Journal and automatically opens a read-only view on your players' screens.
4. **Closing the Graph:** Use **"Close for Players"** to instantly close the window on their screens.

#### For the Players
- **Initial Setup:** The GM must open the graph at least once to initialize the background data.
- **Viewing the Graph:** Once shared by the GM, the window will pop up automatically.
- **Manual Access:** If a player accidentally closes the window, they can re-open it via the **"FANG Graph" Journal Entry** (a link inside the journal text opens the tool) or simply by pressing `Shift + G`.

### Future Roadmap
- **Viewport Locking:** Ensure actors remain visible inside the GM's and Monitor's screens.
- **More Languages:** Community translation support (e.g. Spanish, French).

### Potential Extensions (Ideas)
- **Search & Filter:** A search bar that highlights specific actors and dims the rest.
- **Mini-Map Navigator:** A small radar map in the corner for massive networks.
- **Custom Link Styles:** Color-coded or dashed lines for different relationships (e.g., Enemies, Family, Master/Apprentice).
- **Condition Overlays:** Visual indicators for character states (e.g., "Deceased", "Cursed", "In Love") directly on the tokens.
- **GM-Secret Nodes:** The ability to hide masterminds in the graph from players until the GM chooses to reveal them.
- **Character Portraits:** Supporting visual token portraits instead of just text/circle nodes.

---

## 🇩🇪 Deutsch

### Features
<p align="center">
  <img src="assets/fang_ui_1.png" width="32%" title="Leerer Graph UI" />
  <img src="assets/fang_ui_2.png" width="32%" title="Gerichtete und normale Verbindungen" />
  <img src="assets/fang_ui_3.png" width="32%" title="Smarte Akteur Dropdowns" />
</p>

- **Selbstanordnender Akteur-Graph:** Betrachte Akteure und ihre Verbindungen in einem dynamischen System, das sich automatisch selbst aufbaut und strukturiert.
- **Kontextsensitive Sidebar:** Die Sidebar passt sich deiner Auswahl an. Ein Klick auf einen Token oder eine Linie im Graphen öffnet direkt das passende "Details"-Panel zur Bearbeitung.
- **Interaktive Auswahl & Abwahl:** 
  - **Auswahl per Klick:** Ein Klick auf ein Element im Graphen wählt es automatisch in der Sidebar aus.
  - **Abwahl per Canvas-Klick:** Ein Klick ins Leere setzt alle Auswahlen zurück und blendet die Editoren aus.
- **Eigener Reiter "Weitere Funktionen":** Globale Werkzeuge (wie die Fraktionsverwaltung oder Präsentations-Knöpfe) haben nun einen eigenen Reiter für mehr Übersichtlichkeit.
- **Präzises Drag & Drop:** Korrigierte Koordinaten-Berechnung sorgt dafür, dass Tokens beim Ziehen exakt unter der Maus bleiben, auch wenn du gezoomt oder den Ausschnitt verschoben hast.
- **Kollaborative Spieler-Bearbeitung:** GMs können Spielern erlauben, den Graphen aktiv mitzubauen – Tokens ablegen, Verbindungen ziehen und löschen.
- **Kontextmenü & Token-Lore:** Ein Rechtsklick (oder langes Drücken) öffnet ein radiales Kontextmenü! Weise Rollen zu oder speichere Notizen direkt im Token, die beim Drüberfahren als Tooltip erscheinen.
- **Spoiler-Schutz:** Verhindert, dass Spieler geheime NPCs in ihren Auswahllisten sehen können.
- **Rollen & Fraktionen:** Weise Rollen oder Fraktionen zu, um dem Netzwerk eine völlig neue Organisationstiefe zu verleihen.
- **Zentrums-Gravitation (Boss-Knoten):** Verankere wichtige Akteure magnetisch in der Mitte des Graphen, inklusive leuchtender Aura.
- **Visuelle Gruppierung:** Fassse Akteure (z.B. nach Standort) optisch in Gruppen oder Zonen zusammen.
- **Verbindungs-Validierung:** Stellt sicher, dass jede Verbindung eine Beschriftung hat, um "unsichtbare" Linien zu vermeiden.
- **JSON Export & Import (Backup):** Speichere deinen gesamten Graphen (inkl. Token-Positionen, Fraktionen und Einstellungen) in einer Datei. Ideal für Backups oder zum Teilen.
- **Mehrsprachigkeit (I18n):** Das Modul ist komplett auf Englisch und Deutsch verfügbar.

### Installation
1. Starte Foundry VTT und wechsle in den **Zusatzmodule** Reiter.
2. Klicke auf **Modul installieren**.
3. Füge die folgende Manifest URL ein: `https://github.com/Niclasp1501/Foundry-Actor-Nexus-Graph--FANG-/releases/latest/download/module.json`
4. Starte Foundry neu und aktiviere **Foundry Actor Nexus Graph (FANG)** in den Modul-Einstellungen deiner Welt.

### Anleitung
#### Für den Spielleiter (GM)
1. **FANG Öffnen:** Klicke auf den neuen Button "Ninjo's FANG" oben im **Akteurs-Verzeichnis**, oder drücke `Shift + G`.
2. **Knoten Hinzufügen:** Über die Seitenleiste kannst du Verbindungen herstellen. Fehlt ein Akteur auf dem Board, zieht sich FANG diesen direkt aus deinem Verzeichnis.
3. **Den Graphen Teilen:** 
   - Klicke im Reiter "Präsentation" auf **"Spielern zeigen"**.
   - FANG speichert die Daten in einem Hintergrund-Journal und öffnet das Graphen-Fenster synchron bei allen Spielern.
4. **Graphen Schließen:** Mit **"Bei Spielern schließen"** verschwindet das Fenster sofort von ihren Monitoren.

#### Für die Spieler
- **Einrichtung:** Der GM muss das Tool einmalig öffnen, damit das Journal im Hintergrund erstellt wird.
- **Graphen Betrachten:** Sobald der GM den Graphen teilt, öffnet sich dieser automatisch.
- **Manuell Öffnen:** Falls du das Fenster versehentlich schließt, kannst du es über das **Journal "FANG Graph"** wieder öffnen (Klick auf den Link im Text) oder einfach `Shift + G` drücken.

### Zukünftige Pläne (Roadmap)
- **Gruppierung nach Orten (Organisation):** Bestimmte Akteure (z.B. nach Standort) optisch in Gruppen zusammenfassen, um bei großen Graphen die Übersichtlichkeit zu wahren.
- **Monitor-Sichtfeld:** Sicherstellen, dass die Akteure immer im sichtbaren Bereich des Monitors/GMs bleiben.
- **Weitere Sprachen:** Bei Bedarf werden auf Wunsch gern weitere Übersetzungen integriert.

### Potenzielle Erweiterungen (Ideen)
- **Suche & Filter:** Eine Suchleiste, die bestimmte Akteure hervorhebt und den Rest des Graphen ausblendet.
- **Mini-Map / Navigator:** Eine kleine Radar-Übersicht in der Ecke für sehr große, komplexe Netzwerke.
- **Individuelle Verbindungslinien:** Farbkodierte, gestrichelte oder dicke Linien je nach Beziehungsart (Feinde, Liebespaar, Familie).
- **Zustands-Overlays:** Visuelle Merkmale für Charakter-Zustände (z.B. "Verstorben", "Verflucht", "Verliebt") direkt auf den Tokens.
- **Geheim-Knoten für GMs:** Akteure können für Spieler unsichtbar gemacht werden, bis der GM sie dramatisch enthüllt.
- **Charakter-Portraits:** Die Möglichkeit, kreisrunde Foundry-Bilder der Akteure anstelle von simplen Kreisen darzustellen.

---

## Credits & Third-Party Libraries
This module leverages the following open-source libraries:
* [D3.js](https://d3js.org/) - Licensed under the ISC License.

---

## License / Lizenz
This base module is licensed under the MIT License. 
**Note:** This license applies only to the core "Foundry Actor Nexus Graph (FANG)" module. Future add-ons, premium themes, or extended feature packs may be released under separate, proprietary licenses.

Dieses Basis-Modul steht unter der MIT-Lizenz. 
**Hinweis:** Diese Lizenz gilt nur für das Kernmodul "Foundry Actor Nexus Graph (FANG)". Zukünftige Premium-Erweiterungen, Themes oder Content-Pakete können unter separaten, proprietären Lizenzen veröffentlicht werden.
