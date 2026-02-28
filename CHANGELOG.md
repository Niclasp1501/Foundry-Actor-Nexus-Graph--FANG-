# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.9] - 2026-03-01
### Fixed
- **Persistent Auto-Zoom**: Auto-zoom now triggers every time the graph is closed and re-opened, providing a fresh overview as expected.
- **Manual Zoom Preservation**: Changing settings in the sidebar no longer resets your manually adjusted zoom level to 100%.
- **V13 Application Lifecycle**: Corrected `_onClose` and `render` calls for full Foundry V13 `ApplicationV2` compatibility.
- **Critical Crash**: Fixed a race condition where the module tried to access D3 before it was fully loaded in the constructor.

## [1.1.8] - 2026-02-28
### Added
- **Auto-Zoom to Fit**: The graph now automatically adjusts zoom on open to ensure all tokens are visible within the canvas.
- **Center Graph Button**: Added a manual button in the "View" tab to re-center and fit the graph to the current view.
- **Localization**: Added EN/DE strings for the new centering features.

## [1.1.7] - 2026-02-27
### Changed
- **Physics Refinement**: Switched to linear scaling for link distance (`tokenSize * 4 + 100`) and collision radius (`tokenSize + 100`) to prevent overcrowding at large token sizes.
- **Label Scaling**: Reverted node labels to a fixed font size for consistent readability. Link labels now scale dynamically based on token size.
- **Reactivity**: Simulation forces now update immediately when `tokenSize` is changed in settings.
- **Bugfixes**: Fixed a `ReferenceError` that caused the canvas to be blank in certain scenarios.

## [1.1.6] - 2026-02-28
### Added
- **JSON Export & Import**: You can now back up your entire graph or move it between different Foundry worlds using JSON files.
- **Coordinate Persistence**: Token positions (x, y) and faction locations are saved and restored perfectly.

## [1.1.5] - 2026-02-28
### Added
- **Context-Sensitive Sidebar**: The sidebar now adapts to your selection (Node vs Link) to keep the interface clean.
- **Interactive Selection**: Clicking a token or link in the graph immediately selects it in the sidebar and jumps to the Editor tab.
- **Mandatory Link Labels**: Added validation to prevent the creation of invisible links.
- **Fixed Token Dragging**: Resolved coordinate glitches during token movement in scaled views.
- **Singleton Guard**: Prevented multiple FANG windows from opening simultaneously.

## [1.1.4] - 2026-02-27
### Added
- **Visual Grouping (Factions)**: Group characters into factions with custom icons, colors, and visual hubs.
- **Faction Lines**: Toggleable lines connecting members to their faction hub.
- **Sidebar Tab Redesign**: Reorganized the sidebar into Editor, View, and Advanced tabs for better usability.

## [1.1.3] - 2026-02-26
### Added
- **Context Menu**: Right-click tokens for quick access to role, lore, and deletion.
- **Hover Lore**: Hover over tokens to see their background story in a premium tooltip.

## [1.1.2] - 2026-02-25
### Added
- **Boss Nodes (Center Gravity)**: Mark important characters as "Centers" to have them naturally gravitate to the middle of the graph with a golden aura.
- **Cosmic Wind**: Added a subtle ambient animation to the graph nodes.

## [1.0.7] - 2026-02-24
### Added
- **Drag & Drop**: Drag actors from the Foundry Sidebar directly onto the canvas to add them to the graph.

## [1.0.4] - 2026-01-20
### Added
- **Directional Links**: Support for arrows on relationship lines to show the flow of character interactions.
