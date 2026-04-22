# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
