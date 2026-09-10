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

## Visibility Policy and Leak Checks

FANG has several visibility layers. Do not add new UI paths that read raw graph data directly for player-facing views.

Rules:

- Use the central helpers for visibility whenever a player/monitor view is rendered: `_canUserSeeNode`, `_canUserSeeLink`, `_getVisibleNodesForUser`, `_getVisibleLinksForUser`, `_getNodeQuestsForCurrentUser`, and `_getHistoryEntriesForUser`.
- `hidden` means "show the safe facade to players." `gmOnly` means "do not show this node/link at all to players or monitor."
- GM-only nodes must also remove all connected links from player/monitor rendering, hit detection, search results, history references, and contextual action paths.
- Relationship types, zones, quests, and history entries must never bypass node/link visibility.
- When adding player UI, test hidden tokens, GM-only tokens, visible quests on hidden tokens, and invisible quests on hidden tokens as separate cases.
- Prefer one shared safe accessor over repeated local checks. Repeated local checks have caused spoiler leaks before.

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

## Translations: Weblate owns eight of the ten languages

Since 06.09.2026 FANG is registered on [Foundry Hub Weblate](https://weblate.foundryvtt-hub.com).
The loop runs by itself, and the point of the setup is that **no step of it is
repeated by hand after a change**:

```
you edit lang/en.json + lang/de.json
   → push
      → webhook tells Weblate            (repo hook, push events)
         → the eight other languages show the new strings as untranslated
            → volunteers translate
               → Weblate opens a pull request
                  → Validate runs        (.github/workflows/validate.yml)
                     → auto-merge        (.github/workflows/weblate-automerge.yml)
                        → the next release ships it
```

**Write `en.json` and `de.json`. Nothing else.** The other eight are no longer
ours to fill: overwriting them throws away work someone donated, and it is the
one action that turns this from automation back into a chore.

**Never run `translate_i18n_vertex.py` with `--overwrite`.** Without that flag it
only fills keys that are missing (`pending = [... if k not in translated]`) and
leaves every existing translation alone — which is exactly what makes it
compatible with Weblate. It stays useful as the stopgap that keeps a new string
from shipping untranslated before a volunteer gets to it. With `--overwrite` it
becomes a wrecking ball.

**German and English are never auto-merged.** They are written here, so a
stranger changing them is a content decision and gets read by a person. The
auto-merge workflow excludes both files by name.

**The bot's login is a guess until the first pull request arrives.** The
condition in `weblate-automerge.yml` matches bot accounts and anything
containing "weblate". When the first one lands, check the author and tighten
the condition to the exact login.

**Both workflow files must live on `main`.** `workflow_run` only triggers for
workflows on the default branch — a copy that exists only on `beta` never fires.

## Visibility is a display filter, and that is on purpose

`_canUserSeeNode`, `_isNodeHiddenForUser`, `_canUserSeeQuest` and `_canUserSeeLink`
decide what a client *draws*. They do not decide what a client *receives*. Every
player already holds the whole dataset:

- the graph is a flag on the **FANG Graph** journal, created with
  `ownership: { default: OBSERVER }`, and `loadData` copies that flag whole
- the chronicle is a `scope: "world"` setting, which Foundry hands to every client
- a hidden contact's real name sits in `node.name`, right next to the facade in
  `node.displayName`; a `gmOnly` node is not absent, only undrawn

So `game.settings.get("fang", "history")` in a player's console prints every GM
note, and the journal flag prints every secret name. **That is accepted.** FANG is
built for private tables, where the same trust already covers not reading the GM's
notebook. A module cannot beat a player who wants to cheat - whatever the client
shows had to reach the client first - and buying a little more resistance would
cost a rewrite in which players are sent a scrubbed subset and then save against
it. The decision was taken on 07.09.2026; do not reopen it as a bug.

Two things follow for anyone working here:

- **Do not claim more than this.** A comment promising a player "must never receive"
  something is wrong, and worse than saying nothing, because the next person
  believes it.
- **The line worth defending is the accident, not the cheat.** A player who clicks
  something in Foundry's own interface and sees GM content is a real defect; a
  player who opens the console or hand-crafts a socket call is not. When in doubt,
  ask which of the two a change protects against.

Recaps are deliberately not secret. Their pages sit in the **FANG Chronik** journal
at `OBSERVER` for everyone, with `OWNER` for the author, and nothing confidential
is meant to hang off them.


## Oberfläche: die acht Regeln

Sie stehen vollständig in der [CLAUDE.md des Workspace](../../CLAUDE.md),
Abschnitt „Regelgrundsätze für die Oberfläche der Foundry-Module", und gelten
für jedes Modul: Fenster passen ins Bild · die Marke steht in einer Datei · die
Schrift liefert Foundry · kein sichtbarer Text ohne Sprachschlüssel · die
Rückmeldung steht dort, wo der Mensch hinschaut · jeder Knopf hat einen Namen ·
Unwiderrufliches fragt vorher · neue Fenster sind ApplicationV2.

Zwei Dateien werden dafür **kopiert, nicht geteilt** — wie `willkommen.js`:

| Datei | Angepasst wird |
|---|---|
| `styles/ninjo-marke.css` | nichts, sie ist überall identisch |
| `scripts/fensterpassen.js` | nur der `MODUL`-Block ganz oben |

Verbessert man eine davon, gehört sie in alle Module nachgezogen.

### Was hier gilt

**Fensterklassen:** `fang-app-window` und `fang-dialog`. Beide stehen im
`MODUL`-Block von `fensterpassen.js`; ein neues Fenster braucht eine davon,
sonst wird es nicht geklemmt.

**Das Cyberpunk-Thema bleibt unberührt.** Es setzt eigene Werte (`#ff2e88`,
`#33d9ff`, `Rajdhani`) und überschreibt die Modultokens — das ist der Zweck
eines Themas. Nur der helle Grundzustand zeigt auf `--ninjo-*`.

**Offen:** 116 verschiedene Rohfarben stehen neben 16 Tokens. Das Token-System
ist da und wird umgangen; die Farben auf die Tokens zurückzuführen ist die eine
Aufgabe hier, die kein Wochenende ist. Dazu: die Knotennamen im Graphen sind aus
zwei Metern nicht lesbar (Schriftgröße an die Fenstergröße koppeln, wie
`.shops-schau` es mit `clamp()` macht), die Legende ist dunkel auf
Pergament, und der Charaktertext im Dialog steht sechs Absätze lang kursiv.
