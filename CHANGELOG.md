# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

## [1.0.7] - 2026-02-24
### Added
- **Drag & Drop**: Drag actors from the Foundry Sidebar directly onto the canvas.

## [1.1.1] - 2025-05-15
### Added
- **Directional Links**: Support for arrows on relationship lines.
