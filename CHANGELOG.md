# Changelog

All notable changes to the **Foundry Actor Nexus Graph (FANG)** module will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
