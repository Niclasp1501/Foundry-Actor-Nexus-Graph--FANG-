# Agent Notes

## Versioning

Use this module version format for stable releases:

```text
<foundry-major>.<YYMM>.<patch>
```

Rules:

- `<foundry-major>` is the primary Foundry VTT major version the release targets, for example `14`.
- `<YYMM>` is the release year and month, for example `2605` for May 2026.
- `<patch>` starts at `1` each new month and increments for every additional stable release in the same month.
- Tags must use the module version with a `v` prefix, for example `v14.2605.1`.
- Do not decrease versions. The next version after the old `14.0.21` line should use the new format, for example `14.2605.1`.

Examples:

```text
14.2605.1
14.2605.2
14.2606.1
15.2607.1
```

Beta releases should derive from the current stable base version:

```text
14.2605.2-beta.<run>
```

The persistent beta install link remains the `beta-latest` GitHub prerelease manifest.

## Player-Facing Hidden Tokens

Hidden/verdeckte tokens are not "disabled" for players. FANG is a shared player management tool, so players must still be able to interact with the safe player-facing version of a hidden contact.

Rules:

- Players may view local info, use Spotlight, and edit allowed player-facing data on hidden tokens.
- Never expose the real actor name, original name, GM role, faction identity, GM journal, GM lore, or GM-only visibility settings to non-GM users.
- Use the safe facade for players: `displayName`/alias, visible player lore page, `playerNotes`, visible conditions, and visible quests.
- Visible quests on hidden tokens are controlled by an additional GM option (`showHiddenQuestsToPlayers`). A quest must be visible to players and this option must be enabled before it appears in the hidden player-facing view.
- If a hidden token needs a portrait for a player-facing view, use the unknown/placeholder portrait instead of the real actor image.
- Player editing of hidden tokens should open a restricted editor for alias, player notes, and visible status markers. The full profile editor is GM-only.
- Context menus for players should still offer safe actions such as info, spotlight, quests that are visible to players, and restricted edit when player editing is allowed.
- When adding new features, keep "can interact with safe facade" separate from "can see GM identity." Do not use one boolean for both concepts.

## Foundry Journal Buttons and Links

When module content adds custom buttons or links inside Foundry Journal pages, do not rely on a single sheet render hook as the only way to attach behavior. Foundry v13/v14 can render Journal pages through different sheet/app paths, and saved Journal HTML can outlive the exact renderer that originally created it.

Use this pattern instead:

- Give the element a module-specific class, for example `fang-open-btn`.
- Prefer a plain `<a>` or `<button>` with your own class. Avoid depending on Foundry's `content-link` behavior unless the element is a real Foundry document link with a valid `data-uuid`.
- Install one global delegated click listener once, usually in `Hooks.once("ready")`.
- Use capture phase (`true`) when Foundry may intercept the click first.
- In the handler, find the closest matching element, call `preventDefault()` and `stopPropagation()`, then call the module API.
- Keep specific render hooks only as optional fallback or progressive enhancement.

Example:

```js
function _myModuleOpenFromJournalButton(event) {
  const button = event?.target?.closest?.(".my-module-open-btn");
  if (!button) return;

  event.preventDefault();
  event.stopPropagation();

  const openApp = game.modules.get("my-module")?.api?.openApp;
  if (typeof openApp === "function") openApp();
}

Hooks.once("ready", () => {
  if (window._myModuleJournalButtonFixInstalled) return;
  document.addEventListener("click", _myModuleOpenFromJournalButton, true);
  window._myModuleJournalButtonFixInstalled = true;
});
```

Saved Journal content can then stay simple and stable:

```html
<a class="my-module-open-btn" style="cursor:pointer">Open Module</a>
```

This approach keeps existing Journals compatible because it changes only client-side click handling, not the saved Journal content.
