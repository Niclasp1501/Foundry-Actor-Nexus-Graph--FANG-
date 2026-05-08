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
