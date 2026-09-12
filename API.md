# FANG API for add-on modules

FANG exposes one object for other modules: `game.modules.get("fang").api`. It is created in FANG's `init` hook, so an add-on can use it in its own `init`, `setup` or `ready`. The hook `fangReady` fires once the object exists.

What this file promises stays stable. Additions can come with any version; a change to a documented signature bumps `api.interface`.

## Checking compatibility

```js
const fang = game.modules.get("fang")?.api;
if (!fang) return;                          // FANG missing or too old to have an api
if (!fang.atLeast("14.2609.3")) return;     // FANG version, house scheme <foundry>.<yymm>.<n>
if (fang.interface < 1) return;             // interface version of this document
```

- `api.version` FANG's module version, as in its `module.json`.
- `api.interface` version of this interface. Currently `1`.
- `api.atLeast(version)` true when FANG is at least that version.

## Reading the graph

All readers return copies. Writing to a copy changes nothing.

- `api.graph.get()` the whole stored graph: `{ nodes, links, factions, zones, ... }`, or `null` when no graph exists yet.
- `api.factions.list()` factions.
- `api.zones.list()` zones.
- `api.history.list()` chronicle entries the current user may see.
- `api.history.add(entry)` creates a chronicle entry. `entry`: `{ title, playerText?, gmText?, nodeId?, visibility?: "gm" | "players", kind? }`. Returns the new entry's id, or `false`. A player's entry is relayed to a GM as with entries made in FANG itself.

## Adding to the interface

- `api.registerRailButton({ id, icon, label, gmOnly?, onClick(app) })` a button in FANG's rail. `label` may be a string or a function (for localisation). `icon` is a Font Awesome class such as `"fa-star"`.
- `api.registerMenuItem({ id, target: "node" | "link", icon?, label, gmOnly?, when?(target), onClick(target) })` an entry in the right-click menu of a node or a connection. `when` decides per element whether the entry shows; omit it to always show.
- `api.registerEditGuard(async (app, editing) => boolean)` runs before an editor opens; returning `false` keeps it closed. `editing` is `{ type: "node" | "link", id, name }`.
- `api.register({ id, requires, setup })` for add-ons that install deeper hooks. `requires` is the interface version needed; `setup(api)` runs once, or not at all when FANG's interface is older.

## Hooks

Named `fang.*` and called with Foundry's `Hooks.on`. The first argument is always FANG's application instance; treat it as read-only.

| Hook | Arguments | When |
|---|---|---|
| `fangReady` | `api` | the api object exists (during FANG's `init`) |
| `fang.appCreated` | `app` | FANG's window object was created |
| `fang.appRendered` | `app` | the window was drawn |
| `fang.appClosed` | `app` | the window was closed |
| `fang.editorOpened` | `app, editing` | a node or connection editor opened; `editing = { type, id, name }` |
| `fang.editorClosed` | `app, editing` | that editor closed |
| `fang.linkChanged` | `app, link, change` | a connection was created, edited or deleted; `change = "created" \| "updated" \| "deleted"` |
| `fang.historyEntryCreated` | `app, entry` | a chronicle entry was stored |
| `fang.saved` | `app, { data }` | the graph was written |

Further hooks exist for deeper integration (`fang.draw`, `fang.nodeMenu`, `fang.linkMenu`, `fang.nodeDragged`, `fang.nodeDropped`, `fang.lockUI`, `fang.backgroundConfigRender`, `fang.applyBackground`). They pass more of FANG's internals and may change between versions; use them through `api.register` and state the interface version you tested against.

## Minimal add-on

`module.json`:

```json
{
  "id": "my-fang-addon",
  "title": "My FANG add-on",
  "version": "1.0.0",
  "compatibility": { "minimum": "13", "verified": "14" },
  "relationships": { "requires": [{ "id": "fang", "type": "module" }] },
  "esmodules": ["main.js"]
}
```

`main.js`:

```js
Hooks.once("fangReady", (fang) => {
  if (!fang.atLeast("14.2609.3")) return;

  fang.registerRailButton({
    id: "hello",
    icon: "fa-hand-wave",
    label: "Say hello",
    onClick: () => ui.notifications.info(`${fang.graph.get()?.nodes.length ?? 0} nodes in the graph.`)
  });

  fang.registerMenuItem({
    id: "note",
    target: "node",
    icon: "fa-feather",
    label: "Note this in the chronicle",
    onClick: (node) => fang.history.add({ title: `Something happened to ${node.name}`, nodeId: node.id, visibility: "gm" })
  });

  Hooks.on("fang.linkChanged", (app, link, change) => console.log("connection", change, link.id));
});
```
