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

- A node with `shape: "square"` is drawn as a rounded square instead of a circle, rings included.
- `api.graph.get()` the whole stored graph: `{ nodes, links, factions, zones, ... }`, or `null` when no graph exists yet.
- `api.nodes.list()`, `api.nodes.get(id)` characters and items.
- `api.links.list()` connections, with `source` and `target` as node ids.
- `api.factions.list()` factions.
- `api.zones.list()`, `api.zones.get(id)` places. A place has `id, name, type, color, description, playerVisible, parentId, img, hidden, displayName, reveal`; `parentId` is the place it lies in. `reveal: "visited"` (the default for new places) keeps a place from players until they know it: they created it, a character they can see belongs there, or an add-on says so through the hook `fang.zonesKnown` (`app, user, knownIds`, add ids to the set). `reveal: "open"` shows it to everyone at once.
- `api.history.list()` chronicle entries the current user may see.

## Changing the graph

Everything the interface does with characters, connections, factions and places can be done here, under the same rights: a GM always, a player only while player editing is allowed in FANG's settings (a player's change is relayed to a GM, so one has to be online). Every write loads the graph if needed, saves and merges like a change made by hand, redraws an open window and resolves with a copy of what it changed. A write that is not allowed, or names something that does not exist, rejects with an error.

- `api.nodes.add({ actorUuid } | { name, type?: "item" })` an actor, or a placeholder (an item with `type: "item"`). Also takes the fields of `update`. An actor already in the graph is returned as it is.
- `api.nodes.update(id, { name?, role?, img?, hidden?, gmOnly?, displayName?, playerNotes?, lore?, conditions?, zoneId?, factionIds? })`
- `api.nodes.remove(id)` removes the node and its connections.
- `api.links.add({ source, target, label?, directional?, type?, hidden?, gmOnly? })`, `api.links.update(id, patch)`, `api.links.remove(id)`
- `api.factions.add(faction)`, `api.factions.update(id, patch)`, `api.factions.remove(id)` (members lose the faction).
- `api.zones.add({ name, type?, parentId?, img?, description?, playerVisible?, hidden?, displayName?, color? })`, `api.zones.update(id, patch)`. A place cannot lie inside itself.
- `api.zones.remove(id)` what lay in it moves up one level; characters there move with it.
- `api.zones.assign(nodeId, zoneId | null)` puts a character or item at a place.
- `api.history.add({ title, playerText?, gmText?, nodeId?, nodeIds?, visibility?: "gm" | "players", kind?, gameDate?, payload? })` creates a chronicle entry and returns its id, or `false`. `nodeIds` attaches it to several characters, `gameDate` (`{ label, sort, time }`) dates it, today when left out, `payload` carries an add-on's data. A player's entry is relayed to a GM as with entries made in FANG itself.
- Game dates follow the calendar module in use: `label` and `sort` as it writes them (`app.detectCurrentGameDate()` gives today's). Entries from an earlier calendar module or typed by hand are converted into that format once, on the active GM's side (`app.convertGameDatesToCalendar()`); what they said before stays in `payload.gameDateBefore`. Write dates the calendar's way, never a `sort` of your own.
- `api.history.update(id, { title?, playerText?, gmText?, kind?, visibility?, gameDate?, payload?, nodeIds? })` (a player may change title and text of their own entries only), `api.history.remove(id)` (GM only).

With FANG Premium, `game.modules.get("fang-premium").api.places` adds what happens between places: `travel({ to, travellers, title?, gameDate? })` records a journey, `whereIs(nodeId)` says where the chronicle puts someone (`{ placeId, seen, home, entryId }`, `seen` meaning only sighted there), `whoIsAt(placeId)` lists who is at a place or inside it, and `followed.list()` / `followed.set(nodeId, true | false)` (GM) decide whose whereabouts are followed.

## Tools for an AI assistant

With Ninjo's Foundry MCP, FANG offers its own tools to an assistant: `fang-read` (graph, places and chronicle), `fang-place`, `fang-character`, `fang-connection`, `fang-faction` and `fang-chronicle`; FANG Premium adds `fang-travel`, `fang-whereabouts` and `fang-follow`. They use the api above, accept names as well as ids, and refuse a name that fits more than one thing. Nothing is offered until the GM adds `fang` (and `fang-premium`) under "Modules with their own tools" in the MCP module's settings; with its write switch off, only `fang-read` and `fang-whereabouts` run.


## Adding to the interface

- `api.registerView({ id, icon, label, gmOnly?, open(app, options), close(app) })` a view of its own in the canvas area. An optional `guide` (`{ icon, title, intro, points: [{ icon, title, text, gmOnly? }] }`, or a function returning that) is shown the first time someone opens the view and again from the question mark in the rail; `app.showGuide(guide, { force })` shows one from code. It gets a button on top of the rail, next to the character graph, and the rail marks the current one. Switch from code with `app.showView(id, options)`; `"graph"` is the character graph.
- Places: `app.openZoneEditor(zoneId | null, { name, parentId })` opens the one place editor and resolves with the saved place or null. `app.renderZonePicker(element, { value, noneLabel, extra, onChange })` turns an element into a place field with "New place..." and a pen; it returns `{ value }`. Hooks: `fang.zoneEditorRender` (`app, element, zone`) and `fang.zoneEditorSaving` (`app, zone, element`) for fields of your own, `fang.zonesChanged` (`app, { zone, created?, deleted? }`). A place has `id, name, type, color, description, playerVisible, parentId, img, hidden, displayName`.
- Rights: FANG's world settings `allowPlayerEditing`, `playerPlaces` (players create and edit places, on top of editing) and `playerChronicle` (players write chronicle entries). An add-on shows rights of its own in FANG's settings panel through the hook `fang.permissionsRender` (`app, element`), and may check or trim a player's chronicle entry before the GM stores it with `fang.playerHistoryEntry` (`payload, user`; return `false` to refuse; `payload.entryPayload` holds add-on data).
- `api.registerRailButton({ id, icon, label, gmOnly?, position?, onClick(app) })` a button in FANG's rail. `position: "bottom"` puts it at the foot of the rail, for something seldom needed. `label` may be a string or a function (for localisation). `icon` is a Font Awesome class such as `"fa-star"`.
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
| `fang.nodeDragStart` | `app, node` | someone starts dragging a node; return `false` to refuse the drag |
| `fang.linkChanged` | `app, link, change` | a connection was created, edited or deleted; `change = "created" \| "updated" \| "deleted"` |
| `fang.historyEntryCreated` | `app, entry` | a chronicle entry was stored |
| `fang.saved` | `app, { data }` | the graph was written |

`fang.drop` fires with `app, { data, x, y, targetNode }` when something other than an actor or a journal is dropped on the graph: `data` is Foundry's drag data, `x`/`y` the drop point in graph coordinates, `targetNode` the node it landed on or `null`.

Two pairs of hooks give an add-on a slot in FANG's own forms, and a way to collect what it put there:

- `fang.actorEditorRender` (`app, html, node`) fires when a node's editor renders; `html` is the same jQuery-wrapped element the editor's own fields use. An empty `<div id="fang-actor-location-extension">` sits in the form for exactly this.
- `fang.actorEditorSaving` (`app, node, html`) fires right before the editor's own fields are written and the graph is saved. Read the slot's fields from `html` and write the result onto `node` yourself.
- `fang.historyEntryFormRender` (`app, panel, { node, editingEntry }`) fires when the chronicle entry form renders; `panel` is a plain DOM element. `<div id="fang-history-location-extension">` sits in the form.
- `fang.historyLogRendered` (`app, panel, { node }`) fires when the chronicle log was drawn. Every entry is an `<li class="fang-history-entry" data-entry-id="...">`.
- `fang.historyEntrySaving` (`app, payload, panel, { node, editingEntry, refs }`) fires when Save is pressed, before the entry is built. Write into `payload`; it ends up as the entry's own `payload` field (merged with what a save already there holds, never replaced outright). `refs` is the list of `{ type, id }` the entry is attached to; change it in place to attach the entry to more nodes.

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
