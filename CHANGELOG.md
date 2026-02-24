# Changelog

All notable changes to the **Foundry Actor Nexus Graph (FANG)** module will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
