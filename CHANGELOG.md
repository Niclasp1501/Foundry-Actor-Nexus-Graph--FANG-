# Changelog

All notable changes to the **Foundry Actor Nexus Graph (FANG)** module will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased / Next]
### Added
- **Adjustable Token Size & Scaling:** GMs can now configure the visual size of tokens via a new world setting.
- **Improved Default Scale:** Base token size increased to **40px** for better visibility.
- **Node Labels:** Fixed font sizes (15px/12px) restored for character names and roles for a cleaner look.
- **Dynamic Link Scaling:** Relationship labels (on the lines) now automatically rescale their font size based on the token size for perfect legibility.
- **Reactive Physics:** Collision and link distance now follow a robust progression (`tokenSize * 4 + 100`) and update immediately when settings change.

## [1.1.6] - 2026-02-28

## [1.1.5] - 2026-02-28
### Added
- **Interactive Selection Sync:** Clicking nodes or links on the canvas now automatically selects them in the sidebar and switches to the editor.
- **Canvas Deselect:** Clicking empty space on the canvas resets all selections.
- **Bilingual Tab:** Added "Advanced" / "Weitere Funktionen" tab for global management.
  - **Deselect Guard:** Added a short time-based guard to prevent accidental selection resets while finishing a drag maneuver.
- **Link Label Validation:** Added strict checking to prevent the creation or updating of links with empty labels, complete with localized warning notifications.

### Fixed
- **Token Drag "Jumping" Bug:** Fixed coordinate inversion math that caused tokens to "glitch" or jump when dragged during active zoom or pan states.
- **Window Stability & Singleton Fix:** Resolved a critical bug where re-opening the FANG window or receiving duplicate sync commands would corrupt the UI or result in an empty canvas.
- **Selection Regression:** Fixed a bug where normal clicks were occasionally blocked by the new drag-protection logic.
- **Responsive Initialization:** Moved D3 and listener setup to the main render cycle, ensuring the app remains perfectly functional even after a forced UI refresh.

## [1.1.4] - 2026-02-28
### Added
- **Visual Grouping (Factions):** Merged community Pull Request implementing full Faction management.
- **Faction Legend & Colors:** GMs can now assign colors and SVG icons to create visual rings ("bounding boxes") around grouped actors on the canvas.
- **Tooltip Polish:** Hover tooltips now feature a delayed interaction (450ms) and automatically hide when dragging tokens for a much smoother drag-and-drop experience.

## [1.1.3] - 2026-02-27
### Added
- **Radial Context Menu:** Completely overhauled token interactions. Right-clicking (or long-pressing on tablets) a token now summons a custom, theme-styled HTML floating menu directly under the cursor.
- **Node Lore Editor:** Added an "Edit Information" button to the new context menu, allowing GMs (and permitted players) to write custom multi-line text and notes stored directly on individual tokens.
- **Hover Lore Tooltips:** Hovering over a token with saved information now smoothly fades in a floating tooltip window, intelligently snapping to the sides of the node to avoid clipping screen edges.

### Changed
- **Aesthetic Overhaul:** Fully migrated the new menu systems away from standard browser dark-mode defaults to strictly enforce our D&D Light Parchment / Red / Gold UI tokenized design variables (`var(--fang-card-bg)`, etc.).

## [1.1.2] - 2026-02-27
### Added
- **Player Collaborative Editing:** Added a world-level setting (accessible via the new "Advanced Settings" dialog or native Foundry Module Settings) to allow players to construct the graph! Players can now drop tokens, create connections, and delete elements.
- **Socket Relay Security:** Player modifications are securely relayed to the active GM, automatically verified, written to the locked GM Journal, and live-synced back to all connected clients. Players are gracefully blocked and warned if no GM is currently online.
- **Spoiler Protection (Anti-Metagaming):** Re-engineered the relationship dropdown menus. Players can no longer accidentally see the names of unrevealed secret NPCs. The dropdown now exclusively lists tokens already present on the canvas, plus any actors the player inherently has at least "Observer" permission to view in Foundry.
- **Global Cosmic Wind:** Elevated the "Cosmic Wind" animations and intensity slider to a global `world` setting. Reconfigured the math so physics rendering is perfectly synchronized across all player screens based on the GM's preferred aesthetic.

### Fixed
- **UI Overflow:** Increased the initial default graph window height slightly to prevent the GM sidebar from generating a cramped vertical scrollbar.
- **Community Thanks:** A massive thank you to **@mcmuffin88** for their pull request and contribution! They single-handedly built and integrated the **Roles & Organizations** feature, allowing GMs to add organizational subtext to actor nodes via UI, Drag&Drop, and right-click contexts.

## [1.1.1] - 2026-02-27
### Added
- **Gravity Center (Boss Nodes):** GMs can now anchor important actors (e.g., a main villain) magnetically to the center of the graph via the new "Center" (Zentrieren) button. Boss nodes are highlighted with a customizable glowing aura and strongly repel standard node clustering.
- **Center Node Color:** Added a native Foundry V13 ColorPicker to the FANG module settings to customize the glowing aura of centered Boss nodes in real time.

## [1.1.0] - 2026-02-26
### Fixed
- **Label Collision Avoidance**: Completely rewrote the link label rendering math. Link labels now dynamically measure the bounding boxes of both the source and target node names, ensuring they center precisely in the "free" visual space of the line and never overlap with token text again. This applies universally to straight and curved Bezier connections.

## [1.0.9] - 2026-02-26
### Fixed
- **Link Overlap and Arrowheads**: Perfected the math ensuring directional arrowheads correctly stop at the edge of the target token's name box, and centered link labels precisely on the remaining visible line segment.

## [1.0.8] - 2026-02-26
### Added
- **Cosmic Wind Animation**: Added a subtle "breathing" and drifting animation to tokens when the graph is at rest. Includes a toggle checkbox and a strength slider in the module settings.
### Fixed
- **Canvas Scrollbar Fix**: Forced absolute positioning on the canvas to eliminate flexbox expansion feedback loops causing scrollbars.
- **Window Size**: Increased default initial window size to 1400x900 for a better out-of-the-box experience.

## [1.0.7] - 2026-02-25
### Added
- **Drag & Drop Workflow:** GMs can now seamlessly drag Actors from the sidebar directly onto the FANG canvas. Dropping an actor onto a blank space silently creates a new node automatically positioned under the cursor. Dropping an actor precisely onto an existing node opens a quick-link dialog asking for a label and direction immediately establishing the relationship.
- **Smart Sidebar Sorting:** The "Source" and "Target" dropdown menus in the UI have been vastly improved. The lists are now grouped into "Nodes on Canvas" (prioritized at the top) and "Other Actors", instantly solving scrolling fatigue in larger worlds!

## [1.0.6] - 2026-02-25
### Added
- **Legal & Dependencies Audit:** Added a `Credits & Third-Party Libraries` section to the README and appended a third-party disclaimer to the LICENSE file, ensuring full compliance for the upcoming Foundry Store release.

## [1.0.5] - 2026-02-25
### Added
- **License & Store Prep:** Added MIT License to the base repository to prepare the module for the official Foundry VTT Store.

## [1.0.4] - 2026-02-25
### Added
- **Directional Links:** GMs can now optionally mark links as directional. They are beautifully rendered with an arrowhead that terminates accurately at the edge of the connected token image. Works seamlessly for straight connections and curved Bezier-lines!

## [1.0.2] - 2026-02-25
### Added
- **Multi-Language Support (I18n):** FANG now natively translates into German or English based on your Foundry VTT settings. Included complete translations for the entire UI, popups, and Journal entries.
- **GitHub Automation:** Implemented `release.yml` GitHub action for automatically packaging `module.zip` directly on GitHub releases.
- **Enhanced Documentation:** Completely rewrote the `README.md` to be fully bilingual (ENG/GER) with detailed GM guides, Player instructions, and a Future Roadmap.

### Changed
- Refined UI wording: The main app is now named "Ninjo's FANG". Subtitle now generically describes "Character (PC/NPC) Relationships". 
- **Module ID & Metadata:** Officially authored by Ninjo in `module.json`.

## [1.0.0] - 2026-02-24
### Added
- **Self-Arranging Actor Graph:** Visual representation of Actors and their relationships in a self-building system.
- **Node Management:** Add and represent actor tokens as interactive nodes.
- **Link Creation:** Support for linking nodes together with both straight lines and visually pleasing curved Bezier connections.
- **GM Toolkit Integration:**
  - Added dedicated interface to dynamically add or remove active tokens and relationship links.
  - "Share Graph" button to synchronize and push the accurate, up-to-date network map to all connected players natively.
  - "Close for Players" functionality to let the GM dismiss the graph window simultaneously across all player screens.
- **Foundry V13 Compatibility:** Fully architected to leverage V13 structures.
- **Monk's Common Display Support:** The graph application registers cleanly over Monk's Common Display interface elements, preventing the window from becoming inaccessible or hidden behind other modules.

### Fixed
- Addressed bugs preventing players from viewing an updated version of the shared graph (empty/outdated view on refresh).
- Corrected a rendering bug where the initial link drawn between two given nodes was incorrectly rendered significantly thicker than subsequent straight or Bezier links.
- Updated subtitling logic in the graph window from a technical "Interactive Force Simulation" string to a user-friendly "Network & Relationships".
