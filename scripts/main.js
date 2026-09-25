import { FangApplication, FANG_EXTENSION_VERSION, fangNodeImageOptions } from "./fang-app.js";
import { willkommenEinrichten, willkommenZeigen } from "./willkommen.js";
import { fensterPassenEinrichten } from "./fensterpassen.js";
import { verzeichnisKnopfEinrichten } from "./verzeichnisknopf.js";
import "./mcp-tools.js";

// Singleton instance
let fangApp = null;


function _fangOpenGraphFromJournalButtonEvent(event) {
  const button = event?.target?.closest?.(".fang-open-btn");
  if (!button) return;

  event.preventDefault();
  event.stopPropagation();

  const toggleGraph = game.modules.get("fang")?.api?.toggleGraph;
  if (typeof toggleGraph === "function") toggleGraph();
}

function _fangGetThemeVariant() {
  const selected = game.settings.get("fang", "themeVariant");
  if (selected === "cyberpunk" || selected === true) return "cyberpunk";
  return "fantasy";
}

function _fangGetRenderedFangApps() {
  const apps = new Set();
  if (fangApp?.rendered) apps.add(fangApp);
  for (const app of Object.values(ui?.windows ?? {})) {
    if (app?.rendered && app instanceof FangApplication) apps.add(app);
  }
  return Array.from(apps);
}

function _fangApplyVisualThemeToOpenApps() {
  const themeVariant = _fangGetThemeVariant();
  const enabled = themeVariant === "cyberpunk";
  document.documentElement?.classList?.toggle("fang-theme-cyberpunk", enabled);
  document.body?.classList?.toggle("fang-theme-cyberpunk", enabled);
  for (const app of _fangGetRenderedFangApps()) {
    if (typeof app._applyVisualTheme === "function") app._applyVisualTheme(themeVariant);
  }
}

Hooks.once("init", () => {
  // ---------------------------------------------------------------------------
  // The api for other modules. Built here, in init, so an add-on finds it in its
  // own init or setup. What API.md documents stays stable; a change to a documented
  // signature bumps FANG_EXTENSION_VERSION.
  // ---------------------------------------------------------------------------
  const extension = {
      version: FANG_EXTENSION_VERSION,
      FangApplication,
      _railButtons: [],
      _editGuards: [],
      _registered: new Map(),
      // Named capabilities an add-on provides. Where the core has a built-in version of
      // the same thing, the add-on's takes over as soon as it is registered.
      _features: new Set(),
      registerFeature(id) { if (id) this._features.add(String(id)); },
      hasFeature(id) { return this._features.has(String(id)); },
      getApp: () => fangApp ?? null,
      register({ id, requires = 1, setup } = {}) {
        if (!id || typeof setup !== "function") return false;
        if (requires > FANG_EXTENSION_VERSION) {
          console.warn(`FANG | Extension "${id}" needs interface version ${requires}, this FANG offers ${FANG_EXTENSION_VERSION}. Not loaded.`);
          if (game.user?.isGM) ui.notifications.warn(game.i18n.format("FANG.Messages.ExtensionTooOld", { id }));
          return false;
        }
        if (this._registered.has(id)) return true;
        try {
          setup(this);
          this._registered.set(id, { requires });
          console.log(`FANG | Extension "${id}" registered.`);
          return true;
        } catch (err) {
          console.error(`FANG | Extension "${id}" failed to set up.`, err);
          return false;
        }
      },
      _views: [],
      registerView(def) {
        if (!def?.id || def.id === "graph") return;
        this._views = this._views.filter(v => v.id !== def.id).concat([def]);
        if (fangApp?.rendered) fangApp._renderExtensionRailButtons();
      },
      registerRailButton(def) {
        if (!def?.id) return;
        this._railButtons = this._railButtons.filter(b => b.id !== def.id).concat([def]);
        if (fangApp?.rendered) fangApp._renderExtensionRailButtons();
      },
      registerEditGuard(fn) {
        if (typeof fn === "function") this._editGuards.push(fn);
      },
      _menuItems: [],
      registerMenuItem(def) {
        if (!def?.id || !def.target || typeof def.onClick !== "function") return;
        this._menuItems = this._menuItems.filter(m => !(m.id === def.id && m.target === def.target)).concat([def]);
      }
  };

  const clone = (v) => (v === undefined || v === null) ? v : foundry.utils.deepClone(v);
  const storedGraph = () => game.journal?.getName("FANG Graph")?.getFlag("fang", "graphData") ?? null;
  const ensureApp = async () => {
    if (!fangApp) fangApp = new FangApplication();
    if (fangApp._baseline === undefined) await fangApp.loadData();
    return fangApp;
  };
  const mayWrite = () => game.user.isGM || game.settings.get("fang", "allowPlayerEditing");
  /** One write through the api: load, change, save and merge, redraw an open window. */
  const write = async (change) => {
    if (!mayWrite()) throw new Error("FANG | This user may not edit the graph.");
    const app = await ensureApp();
    const result = await change(app);
    await app.saveData();
    if (app.rendered) { app.initSimulation(); app.ticked?.(); }
    return clone(result);
  };
  /** The fields of a node the api may set, checked against what exists. */
  const applyNodeFields = (app, node, data) => {
    for (const key of ["name", "role", "img", "displayName", "playerNotes", "lore"]) if (key in data) node[key] = data[key];
    if ("hidden" in data) node.hidden = !!data.hidden;
    if ("gmOnly" in data) { node.gmOnly = !!data.gmOnly; if (node.gmOnly) node.hidden = true; }
    if ("conditions" in data && Array.isArray(data.conditions)) node.conditions = [...data.conditions];
    if ("zoneId" in data) {
      if (data.zoneId && !(app.graphData.zones ?? []).some(z => z.id === data.zoneId)) throw new Error(`FANG | No place ${data.zoneId}.`);
      node.zoneId = data.zoneId || null;
    }
    if (Array.isArray(data.factionIds)) {
      const known = new Set((app.graphData.factions ?? []).map(f => f.id));
      app._setNodeFactionIds(node, data.factionIds.filter(id => known.has(id)));
    }
  };

  const api = {
    version: game.modules.get("fang").version,
    interface: FANG_EXTENSION_VERSION,
    atLeast: (version) => !foundry.utils.isNewerVersion(version, game.modules.get("fang").version),

    toggleGraph: () => {
      if (!fangApp) fangApp = new FangApplication();
      if (fangApp.rendered) fangApp.bringToFront();
      else fangApp.render({ force: true });
    },

    graph: {
      get: () => clone(fangApp?._baseline !== undefined ? fangApp._buildExportData() : storedGraph())
    },
    // Everything the interface can do with characters, connections, factions and places,
    // a macro or a tool can do here as well, under the same rights: a GM always, a player
    // when player editing is on. Writes go through the same save and merge as a click.
    nodes: {
      list: () => clone(fangApp?.graphData?.nodes ?? storedGraph()?.nodes ?? []),
      get: (id) => clone((fangApp?.graphData?.nodes ?? storedGraph()?.nodes ?? []).find(n => n.id === id) ?? null),
      /** `{ actorUuid }` adds an actor, otherwise a placeholder with `name` (type "item" for an item). */
      add: (data = {}) => write(async (app) => {
        const actor = data.actorUuid ? await fromUuid(data.actorUuid) : (data.actorId ? game.actors.get(data.actorId) : null);
        if (actor && app.graphData.nodes.some(n => n.actorId === actor.id)) return app.graphData.nodes.find(n => n.actorId === actor.id);
        const node = actor
          ? { id: actor.id, actorId: actor.id, isPlaceholder: false, placeholderType: null, img: actor.prototypeToken?.texture?.src || actor.img || null,
              name: actor.name, originalName: actor.name, playerNotes: "", showHiddenQuestsToPlayers: true, conditions: [] }
          : app._buildPlaceholderNode({ name: String(data.name || "?"), img: data.img || undefined, placeholderType: data.type === "item" ? "item" : "default" });
        applyNodeFields(app, node, data);
        app.graphData.nodes.push(node);
        return node;
      }),
      update: (id, patch = {}) => write((app) => {
        const node = app.graphData.nodes.find(n => n.id === id);
        if (!node) throw new Error(`FANG | No node ${id}.`);
        applyNodeFields(app, node, patch);
        return node;
      }),
      remove: (id) => write((app) => {
        app.graphData.nodes = app.graphData.nodes.filter(n => n.id !== id);
        app.graphData.links = app.graphData.links.filter(l => app._getLinkEndpointId(l.source) !== id && app._getLinkEndpointId(l.target) !== id);
        return true;
      })
    },
    links: {
      list: () => clone((fangApp?.graphData?.links ?? storedGraph()?.links ?? []).map(l => ({ ...l, source: l.source?.id ?? l.source, target: l.target?.id ?? l.target }))),
      add: ({ source, target, label = "", directional = false, type = null, hidden = false, gmOnly = false } = {}) => write((app) => {
        const ids = new Set(app.graphData.nodes.map(n => n.id));
        if (!ids.has(source) || !ids.has(target)) throw new Error("FANG | Both ends of a connection must be in the graph.");
        const link = { id: foundry.utils.randomID(), source, target, label: String(label), directional: !!directional, hidden: !!hidden, gmOnly: !!gmOnly };
        if (type) link.type = type;
        app.graphData.links.push(link);
        return { ...link };
      }),
      update: (id, patch = {}) => write((app) => {
        const link = app.graphData.links.find(l => l.id === id);
        if (!link) throw new Error(`FANG | No connection ${id}.`);
        for (const key of ["label", "directional", "type", "hidden", "gmOnly"]) if (key in patch) link[key] = patch[key];
        return { ...link, source: app._getLinkEndpointId(link.source), target: app._getLinkEndpointId(link.target) };
      }),
      remove: (id) => write((app) => { app.graphData.links = app.graphData.links.filter(l => l.id !== id); return true; })
    },
    factions: {
      list: () => clone((fangApp?.graphData?.factions ?? storedGraph()?.factions ?? [])),
      add: (data = {}) => write((app) => {
        const faction = app._normalizeFaction({ ...data, id: data.id || foundry.utils.randomID() });
        app.graphData.factions = [...(app.graphData.factions ?? []), faction];
        return faction;
      }),
      update: (id, patch = {}) => write((app) => {
        const index = (app.graphData.factions ?? []).findIndex(f => f.id === id);
        if (index === -1) throw new Error(`FANG | No faction ${id}.`);
        app.graphData.factions[index] = app._normalizeFaction({ ...app.graphData.factions[index], ...patch, id });
        return app.graphData.factions[index];
      }),
      remove: (id) => write((app) => {
        app.graphData.factions = (app.graphData.factions ?? []).filter(f => f.id !== id);
        for (const node of app.graphData.nodes) app._setNodeFactionIds(node, app._getNodeFactionIds(node).filter(f => f !== id));
        return true;
      })
    },
    // Places. A place has id, name, type, color, description, playerVisible, parentId (the
    // place it lies in), img, hidden and displayName (the alias players see while hidden).
    zones: {
      list: () => clone((fangApp?.graphData?.zones ?? storedGraph()?.zones ?? [])),
      get: (id) => clone((fangApp?.graphData?.zones ?? storedGraph()?.zones ?? []).find(z => z.id === id) ?? null),
      add: (data = {}) => write((app) => {
        if (data.parentId && !(app.graphData.zones ?? []).some(z => z.id === data.parentId)) throw new Error(`FANG | No place ${data.parentId}.`);
        // Like one made by hand: players learn of it by going there, unless asked otherwise.
        const zone = app._normalizeZone({ reveal: "visited", ...data, id: data.id || foundry.utils.randomID(),
          ...(game.user.isGM ? {} : { createdBy: game.user.id }) });
        app.graphData.zones = [...(app.graphData.zones ?? []), zone];
        Hooks.callAll("fang.zonesChanged", app, { zone, created: true });
        return zone;
      }),
      update: (id, patch = {}) => write((app) => {
        const zones = app.graphData.zones ?? [];
        const index = zones.findIndex(z => z.id === id);
        if (index === -1) throw new Error(`FANG | No place ${id}.`);
        // A place cannot lie in itself or in anything inside it.
        if (patch.parentId && app._zoneFamily(id).has(patch.parentId)) throw new Error("FANG | A place cannot lie inside itself.");
        zones[index] = app._normalizeZone({ ...zones[index], ...patch, id });
        Hooks.callAll("fang.zonesChanged", app, { zone: zones[index] });
        return zones[index];
      }),
      remove: (id) => write((app) => {
        const zone = (app.graphData.zones ?? []).find(z => z.id === id);
        app._deleteZone(id);
        if (zone) Hooks.callAll("fang.zonesChanged", app, { zone, deleted: true });
        return true;
      }),
      /** Put a character or item at a place; `null` takes it out of any. */
      assign: (nodeId, zoneId) => write((app) => {
        const node = app.graphData.nodes.find(n => n.id === nodeId);
        if (!node) throw new Error(`FANG | No node ${nodeId}.`);
        if (zoneId && !(app.graphData.zones ?? []).some(z => z.id === zoneId)) throw new Error(`FANG | No place ${zoneId}.`);
        node.zoneId = zoneId || null;
        return node;
      })
    },
    history: {
      list: () => {
        if (fangApp?._baseline !== undefined) return clone(fangApp._getHistoryEntriesForUser());
        const entries = game.settings.get("fang", "history")?.entries ?? [];
        return clone(game.user.isGM ? entries : entries.filter(e => e?.visibility === "players"));
      },
      /**
       * `nodeIds` attaches the entry to several characters, `gameDate` ({ label, sort, time })
       * dates it (today when left out), `payload` carries an add-on's data such as a place.
       */
      add: async ({ title, playerText = "", gmText = "", nodeId = null, nodeIds = null, visibility = "gm", kind = "event", gameDate = null, payload = null } = {}) => {
        const app = await ensureApp();
        const node = nodeId ? app.graphData?.nodes?.find(n => n.id === nodeId) ?? null : null;
        const refs = Array.isArray(nodeIds) ? nodeIds.map(id => ({ type: "node", id })) : null;
        return app._createHistoryEntry({ node, refs, title, playerText, gmText, kind, visibility, origin: "api",
          gameDate: gameDate ?? app.detectCurrentGameDate(), payload });
      },
      update: async (id, patch = {}) => {
        const app = await ensureApp();
        const allowed = {};
        for (const key of ["title", "playerText", "gmText", "kind", "visibility", "gameDate", "payload"]) if (key in patch) allowed[key] = patch[key];
        if (Array.isArray(patch.nodeIds)) allowed.refs = patch.nodeIds.map(n => ({ type: "node", id: n }));
        return app._updateHistoryEntry(id, allowed);
      },
      remove: async (id) => {
        if (!game.user.isGM) throw new Error("FANG | Only a GM removes chronicle entries.");
        const app = await ensureApp();
        return app._deleteHistoryEntry(id);
      }
    },

    registerRailButton: (def) => extension.registerRailButton(def),
    registerView: (def) => extension.registerView(def),
    registerEditGuard: (fn) => extension.registerEditGuard(fn),
    register: (def) => extension.register(def),
    registerMenuItem: (def) => extension.registerMenuItem(def),

    extension
  };
  game.modules.get("fang").api = api;
  Hooks.callAll("fangReady", api);

  console.log("FANG | Initializing Foundry Actor Nexus Graph module");
  willkommenEinrichten();

  // Register Handlebars Helpers
  Handlebars.registerHelper("eq", (a, b) => a === b);

  // Register Keybinding
  game.keybindings.register("fang", "openGraph", {
    name: "FANG.ButtonOpen",
    hint: "FANG.KeybindingHint",
    editable: [
      // Namespaced path: the bare global is deprecated since V13 and disappears in V15.
      { key: "KeyG", modifiers: [foundry.helpers.interaction.KeyboardManager.MODIFIER_KEYS.SHIFT] }
    ],
    onDown: () => {
      if (!fangApp) fangApp = new FangApplication();
      if (fangApp.rendered) {
        fangApp.bringToFront();
      } else {
        fangApp.render({ force: true });
      }
      return true;
    }
  });

  // Register Module Settings
  // Which guides this device has been through. Per device, like the welcome window: a
  // guide is about finding your way on this screen.
  game.settings.register("fang", "guidesSeen", {
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });

  game.settings.register("fang", "tokenSize", {
    name: "FANG.Settings.TokenSize.Name",
    hint: "FANG.Settings.TokenSize.Hint",
    scope: "world",
    config: true,
    type: Number,
    range: {
      min: 20,
      max: 100,
      step: 1
    },
    default: 40,
    onChange: value => {
      if (fangApp && fangApp.rendered) {
        fangApp._initD3(); // Re-initialize to update distance/collision forces
        fangApp.ticked(); // Immediate visual refresh
      }
    }
  });

  game.settings.register("fang", "enableCosmicWind", {
    name: "FANG.Settings.CosmicWind.Name",
    hint: "FANG.Settings.CosmicWind.Hint",
    scope: "world",      // Universal setting for all players 
    config: false,       // Hide from main menu, controlled via app
    type: Boolean,
    default: true,
    onChange: value => {
      // Optional: If graph is open, restart simulation lightly to apply
      if (fangApp && fangApp.rendered) {
        fangApp.simulation?.alpha(0.01).restart();
      }
    }
  });

  game.settings.register("fang", "cosmicWindStrength", {
    name: "FANG.Settings.CosmicWindStrength.Name",
    hint: "FANG.Settings.CosmicWindStrength.Hint",
    scope: "world",
    config: false,       // Hide from main menu, controlled via app
    type: Number,
    range: {
      min: 0.1,    // Minimum value so it doesn't turn off entirely, user should use the checkbox for that
      max: 10.0,   // Maximum strength pixel drift
      step: 0.1
    },
    default: 4.0
  });

  game.settings.register("fang", "centerNodeColor", {
    name: "FANG.Settings.CenterNodeColor.Name",
    hint: "FANG.Settings.CenterNodeColor.Hint",
    scope: "world",    // Universal setting for all players 
    config: true,
    type: new foundry.data.fields.ColorField({ initial: "#d4af37" }), // Native V13 Setting!
    default: "#d4af37",
    onChange: value => {
      // Force an immediate re-render if the graph is open so the GM can see the color change live
      if (fangApp && fangApp.rendered) {
        console.log("FANG | Center Node Color updated to", value);
      }
    }
  });

  // Finer rights for players, each on its own. Places and chronicle are what players touch
  // most, and a GM may want one without the other.
  game.settings.register("fang", "playerPlaces", {
    name: "FANG.Settings.PlayerPlaces.Name",
    hint: "FANG.Settings.PlayerPlaces.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });
  game.settings.register("fang", "playerChronicle", {
    name: "FANG.Settings.PlayerChronicle.Name",
    hint: "FANG.Settings.PlayerChronicle.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register("fang", "allowPlayerEditing", {
    name: "FANG.Settings.AllowPlayerEditing.Name",
    hint: "FANG.Settings.AllowPlayerEditing.Hint",
    scope: "world",
    config: true, // Now shown in the main Foundry Module Settings menu
    type: Boolean,
    default: false,
    onChange: value => {
      // Sync sidebar visibility live on all clients without closing window
      if (fangApp && fangApp.rendered && !game.user.isGM) {
        const monitorName = game.settings.get("fang", "monitorDisplayName").toLowerCase();
        const isMonitor = game.user.name.toLowerCase().includes(monitorName);
        const sidebar = fangApp.element.querySelector(".sidebar");
        if (sidebar) {
          sidebar.style.display = !isMonitor ? "flex" : "none";
          // Hide GM-only controls for players
          const gmControls = sidebar.querySelectorAll(".gm-only");
          gmControls.forEach(el => el.style.display = "none");
          // Refresh the lock UI so the edit button appears/disappears
          fangApp._updateLockUI();
          fangApp.resizeCanvas();
        }
      }
    }
  });

  // Collaborative editing. Off by default: the world keeps the familiar
  // one-editor-at-a-time behaviour until someone opts in.
  //
  // The exclusive edit lock existed because saving overwrote the whole graph — the
  // second person to save wiped out the first one's work. Now that saves are merged
  // field by field, that reason is gone and the lock can be dropped. Conflicts on the
  // very same field still resolve last-writer-wins and are reported.
  game.settings.register("fang", "collaborativeEditing", {
    name: "FANG.Settings.CollaborativeEditing.Name",
    hint: "FANG.Settings.CollaborativeEditing.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => {
      // Everyone's lock banner and sidebar state changes meaning — refresh it live.
      if (fangApp && fangApp.rendered) {
        fangApp._updateLockUI();
      }
    }
  });

  // Spotlight sound. One sting for the whole world rather than a theme per character:
  // nobody maintains 40 leitmotifs, but a single "now look here" cue carries the moment.
  // Empty = silent (default), so nothing changes for existing worlds.
  game.settings.register("fang", "spotlightSound", {
    name: "FANG.Settings.SpotlightSound.Name",
    hint: "FANG.Settings.SpotlightSound.Hint",
    scope: "world",
    config: true,
    type: String,
    default: "",
    filePicker: "audio"
  });

  game.settings.register("fang", "spotlightSoundVolume", {
    name: "FANG.Settings.SpotlightSoundVolume.Name",
    hint: "FANG.Settings.SpotlightSoundVolume.Hint",
    scope: "world",
    config: true,
    type: Number,
    range: { min: 0, max: 1, step: 0.05 },
    default: 0.6
  });

  game.settings.register("fang", "inPersonGaming", {
    name: "FANG.Settings.InPersonGaming.Name",
    hint: "FANG.Settings.InPersonGaming.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => {
      if (fangApp && fangApp.rendered) fangApp.render();
    }
  });

  game.settings.register("fang", "monitorDisplayName", {
    name: "FANG.Settings.MonitorDisplayName.Name",
    hint: "FANG.Settings.MonitorDisplayName.Hint",
    scope: "world",
    config: true,
    type: String,
    default: "Monitor",
    onChange: () => {
      if (fangApp && fangApp.rendered) fangApp.render();
    }
  });

  game.settings.register("fang", "defaultHiddenMode", {
    name: "FANG.Settings.DefaultHidden.Name",
    hint: "FANG.Settings.DefaultHidden.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  // Which picture a node shows, and whether a transparent border is cut away. Tokens made
  // for Foundry's token ring leave a wide border for the ring; drawn whole, the face is small.
  game.settings.register("fang", "nodeImageSource", {
    name: "FANG.Settings.NodeImageSource.Name",
    hint: "FANG.Settings.NodeImageSource.Hint",
    scope: "world",
    config: false,
    type: String,
    choices: {
      token: "FANG.Settings.NodeImageSource.Choices.Token",
      portrait: "FANG.Settings.NodeImageSource.Choices.Portrait"
    },
    default: "token",
    onChange: () => { if (fangApp?.rendered) fangApp._reloadAllNodeImages(); }
  });

  game.settings.register("fang", "nodeImageAutoCrop", {
    name: "FANG.Settings.NodeImageAutoCrop.Name",
    hint: "FANG.Settings.NodeImageAutoCrop.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: true,
    onChange: (value) => {
      fangNodeImageOptions.autoCrop = value !== false;
      if (fangApp?.rendered) fangApp.ticked();
    }
  });

  // FANG's own ring around each picture, like Foundry's token ring.
  const ringChanged = () => {
    fangNodeImageOptions.ring = game.settings.get("fang", "nodeRing") !== false;
    const colour = game.settings.get("fang", "nodeRingColor");
    fangNodeImageOptions.ringColor = colour?.css ?? (colour ? String(colour) : "#8a6a3a");
    fangNodeImageOptions.ringWidth = Number(game.settings.get("fang", "nodeRingWidth")) || 3;
    if (fangApp?.rendered) fangApp.ticked();
  };
  game.settings.register("fang", "nodeRing", {
    name: "FANG.Settings.NodeRing.Name",
    hint: "FANG.Settings.NodeRing.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: true,
    onChange: ringChanged
  });
  game.settings.register("fang", "nodeRingColor", {
    name: "FANG.Settings.NodeRingColor.Name",
    hint: "FANG.Settings.NodeRingColor.Hint",
    scope: "world",
    config: false,
    type: new foundry.data.fields.ColorField({ initial: "#8a6a3a" }),
    default: "#8a6a3a",
    onChange: ringChanged
  });
  game.settings.register("fang", "nodeRingWidth", {
    name: "FANG.Settings.NodeRingWidth.Name",
    hint: "FANG.Settings.NodeRingWidth.Hint",
    scope: "world",
    config: false,
    type: Number,
    range: { min: 1, max: 8, step: 1 },
    default: 3,
    onChange: ringChanged
  });

  game.settings.register("fang", "themeVariant", {
    name: "FANG.Settings.ThemeVariant.Name",
    hint: "FANG.Settings.ThemeVariant.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      fantasy: game.i18n.localize("FANG.Settings.ThemeVariant.Choices.Fantasy"),
      cyberpunk: game.i18n.localize("FANG.Settings.ThemeVariant.Choices.Cyberpunk")
    },
    default: "fantasy",
    onChange: () => {
      _fangApplyVisualThemeToOpenApps();
    }
  });

  game.settings.register("fang", "diploglassOneWaySync", {
    name: "FANG.Settings.DiploGlassOneWaySync.Name",
    hint: "FANG.Settings.DiploGlassOneWaySync.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: async (enabled) => {
      if (!enabled || !game.user.isGM) return;
      if (!game.modules.get("diploglass")?.active) return;
      if (!game.journal.getName("FANG Graph")) return;
      try {
        if (!fangApp) fangApp = new FangApplication();
        await fangApp.loadData();
        if (fangApp.rendered) {
          fangApp.initSimulation();
          fangApp._populateActors();
        }
      } catch (err) {
        console.error("FANG | DiploGlass one-way sync init failed", err);
      }
    }
  });

  game.settings.register("fang", "diploglassSyncPromptSeen", {
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.register("fang", "history", {
    scope: "world",
    config: false,
    type: Object,
    default: {
      schemaVersion: 1,
      entries: []
    },
    onChange: () => {
      // An open chronicle showed whatever was in the store when it was opened. Entries arrive
      // from elsewhere all the time -- a player submitting one, the graph recording an automatic
      // one, a second GM editing -- and none of that reached the panel until it was reopened.
      // Optional call: a client can hold a cached older fang-app.js while main.js is new.
      // A hard TypeError inside a setting hook would take the whole hook chain down with it.
      if (fangApp?.rendered) fangApp._onHistoryStoreChanged?.();
    }
  });

  game.settings.register("fang", "historyLastGameDate", {
    scope: "world",
    config: false,
    type: Object,
    default: {}
  });

  // --- BACKGROUND SETTINGS ---
  game.settings.register("fang", "canvasBackgroundMode", {
    scope: "world",
    config: false,
    type: String,
    default: "none" // "none" | "palette" | "image" | "preset"
  });

  game.settings.register("fang", "canvasBackgroundColor", {
    scope: "world",
    config: false,
    type: String,
    default: "#fdfbf7"
  });

  game.settings.register("fang", "canvasBackgroundImage", {
    scope: "world",
    config: false,
    type: String,
    default: ""
  });

  game.settings.register("fang", "canvasBackgroundBlur", {
    scope: "world",
    config: false,
    type: Number,
    default: 0
  });

  game.settings.register("fang", "canvasBackgroundOpacity", {
    scope: "world",
    config: false,
    type: Number,
    default: 1.0
  });

  game.settings.register("fang", "canvasBackgroundPreset", {
    scope: "world",
    config: false,
    type: String,
    default: "parchment"
  });
});

Hooks.once("ready", async () => {
  fangNodeImageOptions.autoCrop = game.settings.get("fang", "nodeImageAutoCrop") !== false;
  fangNodeImageOptions.ring = game.settings.get("fang", "nodeRing") !== false;
  { const colour = game.settings.get("fang", "nodeRingColor"); fangNodeImageOptions.ringColor = colour?.css ?? (colour ? String(colour) : "#8a6a3a"); }
  fangNodeImageOptions.ringWidth = Number(game.settings.get("fang", "nodeRingWidth")) || 3;
  fensterPassenEinrichten();
  // The calendar in use sets the format of game dates; entries from an earlier calendar
  // module or typed by hand are brought into it once, on the active GM's side.
  // Who the active GM is may not be known yet at "ready"; the attempt below waits for it.
  if (game.user.isGM) {
    // A calendar module may still be starting up at "ready"; wait for it for up to a minute.
    let tries = 0;
    const attempt = async () => {
      try {
        if (!game.users.activeGM && ++tries < 30) { setTimeout(attempt, 2000); return; }
        if (game.users.activeGM?.id !== game.user.id) return;
        if (!fangApp) fangApp = new FangApplication();
        const source = fangApp.detectCurrentGameDate?.()?.source;
        if ((!source || source === "manual" || source === "real") && ++tries < 30) { setTimeout(attempt, 2000); return; }
        const { converted } = await fangApp.convertGameDatesToCalendar();
        if (converted) ui.notifications.info(game.i18n.format("FANG.Messages.DatesConverted", { count: converted }));
      } catch (err) { console.error("FANG | Converting game dates failed", err); }
    };
    setTimeout(attempt, 1500);
  }
  // Mark body for role-based CSS — enables body.role-player .gm-only { display:none }
  // to hide GM-only elements globally, including dynamically added ones.
  document.body.classList.toggle("role-player", !game.user.isGM);
  document.body.classList.toggle("role-gm", game.user.isGM);

  if (!window._fangJournalOpenButtonFixInstalled) {
    document.addEventListener("click", _fangOpenGraphFromJournalButtonEvent, true);
    window._fangJournalOpenButtonFixInstalled = true;
  }

  const module = game.modules.get("fang");
  Hooks.callAll("fang.ready", module.api.extension);

  // Ninjo's In-Person Tools has a sheet view of its own with a proper doorway for other
  // modules' buttons: register once, and its bar draws the button whenever it draws
  // itself. No element to hunt for, no observer. Both calls are needed - our ready may
  // run before or after theirs, and a hook only reaches listeners that were already
  // there when it fired.
  const _fangInPersonRegister = api => api?.sheetView?.registerButton?.({
    id: "fang",
    icon: "fa-diagram-project",
    title: game.i18n.localize("FANG.ButtonOpen") || "Open FANG Graph",
    onClick: () => module.api.toggleGraph()
  });
  _fangInPersonRegister(game.modules.get("ninjos-inperson-tools")?.api);
  Hooks.on("ninjosInPersonTools.ready", _fangInPersonRegister);

  _fangApplyVisualThemeToOpenApps();

  // First-time prompt for optional DiploGlass sync.
  if (game.user.isGM && game.modules.get("diploglass")?.active) {
    const syncEnabled = game.settings.get("fang", "diploglassOneWaySync");
    const promptSeen = game.settings.get("fang", "diploglassSyncPromptSeen");

    // If sync was manually enabled earlier, suppress future prompts.
    if (syncEnabled && !promptSeen) {
      await game.settings.set("fang", "diploglassSyncPromptSeen", true);
    }

    if (!game.settings.get("fang", "diploglassSyncPromptSeen")) {
      await new Promise((resolve) => {
        new Dialog({
          title: game.i18n.localize("FANG.Dialogs.DiploGlassSyncTitle"),
          content: `<p>${game.i18n.localize("FANG.Dialogs.DiploGlassSyncContent")}</p>`,
          buttons: {
            enable: {
              icon: '<i class="fas fa-check"></i>',
              label: game.i18n.localize("FANG.Dialogs.DiploGlassSyncEnable"),
              callback: async () => {
                await game.settings.set("fang", "diploglassSyncPromptSeen", true);
                await game.settings.set("fang", "diploglassOneWaySync", true);
                resolve(true);
              }
            },
            skip: {
              icon: '<i class="fas fa-times"></i>',
              label: game.i18n.localize("FANG.Dialogs.DiploGlassSyncSkip"),
              callback: async () => {
                await game.settings.set("fang", "diploglassSyncPromptSeen", true);
                resolve(false);
              }
            }
          },
          default: "enable",
          close: () => resolve(false)
        }, {
          classes: ["dialog", "fang-dialog"],
          width: 440
        }).render(true);
      });
    }
  }

  // Startup sync for existing worlds (without forcing journal auto-creation).
  const shouldStartupSyncDiplo = game.user.isGM
    && game.settings.get("fang", "diploglassOneWaySync")
    && game.modules.get("diploglass")?.active
    && !!game.journal.getName("FANG Graph");
  if (shouldStartupSyncDiplo) {
    try {
      if (!fangApp) fangApp = new FangApplication();
      await fangApp.loadData();
      if (fangApp.rendered) {
        fangApp.initSimulation();
        fangApp._populateActors();
      }
    } catch (err) {
      console.error("FANG | DiploGlass startup sync failed", err);
    }
  }

  // Listen for GM share events natively on ready
  console.log("FANG | Registering socket listener for module.fang");
  game.socket.on("module.fang", async (data) => {
    console.debug("FANG | Socket event received:", data);

    // Initial show/close actions
    if (data.action === "showGraph") {
      if (!fangApp) fangApp = new FangApplication();
      setTimeout(async () => {
        await fangApp.loadData();
        if (fangApp.rendered) {
          fangApp.initSimulation();
          fangApp.zoomToFit(false);
        } else {
          fangApp.render({ force: true });
        }
      }, 500);
    }

    if (data.action === "refreshGraph") {
      if (fangApp && fangApp.rendered) {
        const refresh = () => setTimeout(async () => {
          // Pulls the new server state but keeps our own unsaved changes, instead of
          // dropping them the way a plain loadData() did. A follower glides to the new
          // positions instead of jumping.
          await fangApp.refreshAndGlide();
          fangApp._populateActors();
        }, 100);
        // Not while a node is on the pointer: the rebuild would take it away. The drop
        // runs whatever waited here.
        if (fangApp._isDragging) fangApp._refreshAfterDrag = refresh;
        else refresh();
      }
    }

    if (data.action === "showGraphMonitor") {
      const monitorName = game.settings.get("fang", "monitorDisplayName").toLowerCase();
      if (game.user.name.toLowerCase().includes(monitorName)) {
        if (!fangApp) fangApp = new FangApplication();
        setTimeout(async () => {
          await fangApp.loadData();
          if (fangApp.rendered) {
            fangApp.initSimulation();
            fangApp.zoomToFit(false);
          } else {
            fangApp.render({ force: true });
          }
        }, 500);
      }
    }

    if (data.action === "centerGraph") {
      if (fangApp && fangApp.rendered) {
        fangApp.zoomToFit(true);
      }
    }

    if (data.action === "closeGraph") {
      if (fangApp && fangApp.rendered) fangApp.close();
    }

    if (data.action === "closeGraphMonitor") {
      const monitorName = game.settings.get("fang", "monitorDisplayName").toLowerCase();
      if (game.user.name.toLowerCase().includes(monitorName)) {
        if (fangApp && fangApp.rendered) fangApp.close();
      }
    }

    // --- SOCKET RELAY FOR PLAYER EDITING ---
    if (data.action === "playerEditGraph" && game.user.isGM) {
      if (!fangApp) fangApp = new FangApplication();
      setTimeout(async () => {
        const payload = data.payload || {};
        // A GM who has not opened FANG in this session holds an instance that was never
        // loaded: an empty graph and no baseline. Merging the player's edit against that
        // reads every existing node as deleted on our side, deletion wins, and the save
        // that follows has no baseline to merge against, so it writes the empty result to
        // the journal. One relationship drawn by a player would take the whole graph with
        // it. So the instance loads first, and a second relay arriving mid-load waits for
        // the same load instead of starting its own.
        if (fangApp._baseline === undefined) {
          fangApp._relayLoad ??= fangApp.loadData().finally(() => { fangApp._relayLoad = null; });
          await fangApp._relayLoad;
        }
        // Places are a right of their own. Without it, whatever the player sent about places
        // is set back to what we hold, so the merge sees no change there.
        if (payload.newGraphData && !game.settings.get("fang", "playerPlaces")) {
          const ours = foundry.utils.deepClone(fangApp.graphData?.zones ?? []);
          payload.newGraphData.zones = ours;
          if (payload.baseline) payload.baseline.zones = foundry.utils.deepClone(ours);
        }
        if (payload.newGraphData) {
          // Apply the player's change on top of our own state instead of replacing it.
          // Replacing meant that anything the GM changed since the player loaded was
          // silently thrown away — including data the player never even saw.
          await fangApp.applyRemoteGraphEdit(payload);
        }
        // The save only writes positions of nodes counted as moved on purpose. The
        // player's moves are; without this the merge wrote the old positions back.
        for (const id of payload.draggedNodeIds ?? []) (fangApp._draggedNodeIds ??= new Set()).add(id);
        if (fangApp.rendered && !fangApp._isDragging) {
          fangApp.initSimulation();
          fangApp.simulation.alpha(0.05).restart();
          fangApp._populateActors();
        }
        // Broadcast the result. Without it the graph landed in the journal but nobody else
        // was told, so everyone kept the state they had until they reopened the window --
        // including the player who just made the change. refreshFromServer keeps unsaved
        // local work, so telling everyone is safe.
        await fangApp.saveData(true);
      }, 100);
    }

    // A player asked for the recap page of an entry. They cannot create documents, so we do
    // it, hand them ownership of their own recap, and tell them where it is.
    if (data.action === "playerRequestRecapPage" && game.user.isGM) {
      if (!fangApp) fangApp = new FangApplication();
      const { entryId, userId } = data.payload || {};
      const entry = fangApp._getHistoryStore().entries.find(item => item.id === entryId);
      if (!entry) return;
      const pageId = entry.recapPageId || await fangApp._createRecapPage(entry, userId);
      if (pageId) game.socket.emit("module.fang", { action: "recapPageReady", payload: { entryId, userId, pageId } });
    }

    // ...and the answer, which only the player who asked acts on.
    if (data.action === "recapPageReady") {
      const { userId, pageId } = data.payload || {};
      if (game.user.id !== userId || !pageId) return;
      if (!fangApp) fangApp = new FangApplication();
      const journal = await fangApp._getChronicleJournal();
      journal?.sheet?.render(true, { pageId });
    }

    if (data.action === "playerCreateHistoryEntry" && game.user.isGM) {
      if (!game.settings.get("fang", "playerChronicle")) return;
      if (!fangApp) fangApp = new FangApplication();
      const payload = data.payload || {};
      // An add-on may check or trim what a player sends along (a journey, say).
      if (Hooks.call("fang.playerHistoryEntry", payload, game.users.get(payload.authorUserId)) === false) return;
      const hasContent = String(payload.title || payload.playerText || "").trim();
      if (!hasContent) return;
      await fangApp._createHistoryEntry({
        node: payload.nodeId ? { id: payload.nodeId } : null,
        refs: Array.isArray(payload.refs) ? payload.refs : null,
        title: payload.title,
        playerText: payload.playerText,
        gmText: "",
        gameDate: payload.gameDate,
        knownSince: payload.knownSince || null,
        kind: payload.kind,
        visibility: "players",
        origin: payload.origin,
        type: payload.type,
        editableByPlayers: payload.editableByPlayers,
        authorUserId: payload.authorUserId,
        authorName: payload.authorName,
        // The entry's own free-form bag, e.g. an add-on's location tag.
        payload: (payload.entryPayload && typeof payload.entryPayload === "object") ? payload.entryPayload : null
      });
    }

    if (data.action === "playerUpdateHistoryEntry" && game.user.isGM) {
      if (!fangApp) fangApp = new FangApplication();
      const payload = data.payload || {};
      await fangApp._updateHistoryEntryFromPlayer(payload.entryId, {
        title: payload.title,
        playerText: payload.playerText
      });
    }

    if (data.action === "applyBackground") {
      if (fangApp && fangApp.rendered) {
        fangApp._applyBackground();
      }
    }

    // --- STORYTELLER FEATURES: SPOTLIGHT, LOCKS & CAMERA SYNC ---

    if (data.action === "lockStatusUpdate") {
      if (fangApp && fangApp.rendered) fangApp.render();
    }

    if (data.action === "requestLock" && game.user.isGM) {
      const entry = game.journal.getName("FANG Graph");
      if (entry) {
        const currentLock = entry.getFlag("fang", "editLock");
        if (!currentLock) {
          entry.setFlag("fang", "editLock", {
            userId: data.payload.userId,
            userName: data.payload.userName,
            time: Date.now()
          }).then(() => {
            game.socket.emit("module.fang", { action: "lockStatusUpdate" });
            if (fangApp && fangApp.rendered) fangApp.render();
          });
        }
      }
    }

    if (data.action === "requestReleaseLock" && game.user.isGM) {
      const entry = game.journal.getName("FANG Graph");
      if (entry) {
        const currentLock = entry.getFlag("fang", "editLock");
        if (currentLock && currentLock.userId === data.payload.userId) {
          entry.unsetFlag("fang", "editLock").then(() => {
            game.socket.emit("module.fang", { action: "lockStatusUpdate" });
            if (fangApp && fangApp.rendered) fangApp.render();
          });
        }
      }
    }

    if (data.action === "spotlightStart") {
      if (fangApp && fangApp.rendered) fangApp.startSpotlight(data.payload);
    }

    if (data.action === "spotlightStop") {
      if (fangApp && fangApp.rendered) fangApp.stopSpotlight();
    }

    if (data.action === "spotlightEdgeStart") {
      if (fangApp && fangApp.rendered) fangApp.startEdgeSpotlight(data.payload);
    }

    if (data.action === "questSpotlightStart") {
      if (fangApp && fangApp.rendered) fangApp.startQuestSpotlight(data.payload);
    }

    if (data.action === "questSpotlightStop") {
      if (fangApp && fangApp.rendered) fangApp.stopQuestSpotlight();
    }

    if (data.action === "questSpotlightScroll") {
      if (fangApp && fangApp.rendered) fangApp.syncQuestSpotlightScroll(data.payload);
    }

    if (data.action === "centerGraph") {
      if (fangApp && fangApp.rendered) fangApp.zoomToFit(true);
    }

    if (data.action === "syncCamera") {
      if (!game.user.isGM && fangApp && fangApp.rendered) {
        fangApp.remoteSyncCamera(data.payload);
      }
    }
  });

  // Helper: apply Only-Sheet-matching style to a button element
  function _applyOnlySheetStyle(btn) {
    btn.className = "button";
    btn.style.background = "";
    btn.style.border = "";
    btn.style.color = "";
    btn.style.padding = "";
    btn.style.borderRadius = "";
    btn.style.cursor = "pointer";
  }

  // Put the FANG button into Sheet Only's button bar.
  //
  // Replacing that module's actor selector with a docked directory used to live here as
  // well. It moved to Ninjo's In-Person Tools in 14.2609.1: it rearranges another module's
  // interface for the sake of playing at a table, which is that module's subject, not ours.
  // FANG keeps its own button and nothing else.
  //
  // This used to happen ONLY from inside a MutationObserver, which made it a race: Sheet Only
  // builds its bar in its own async ready hook, and if that finished before we started
  // watching, no mutation ever followed and the button simply never appeared. It also swaps
  // the whole bar for a narrow-screen variant, which drops the button again. So: one
  // idempotent function, called from everywhere the bar can plausibly have changed.
  function _fangEnsureOnlySheetButton() {
    const container = document.getElementById("so-main-buttons");
    if (!container || document.getElementById("fang-so-btn")) return !!container;
    const fangBtn = document.createElement("button");
    fangBtn.id = "fang-so-btn";
    fangBtn.title = game.i18n.localize("FANG.ButtonOpen") || "Open FANG Graph";
    _applyOnlySheetStyle(fangBtn);
    fangBtn.innerHTML = '<i class="fas fa-project-diagram"></i>';
    fangBtn.addEventListener("click", (e) => {
      e.preventDefault();
      game.modules.get("fang")?.api?.toggleGraph();
    });
    container.appendChild(fangBtn);
    // One line, once, so "the button is missing" can be answered from the log instead of
    // guessed at: either it says this, or the bar never turned up.
    console.log("FANG | Button mounted in Sheet Only's bar.");
    return true;
  }

  {
    // Deliberately not gated on the module being active: forks and renames exist, and the
    // only thing that actually matters is whether a bar with that id shows up. Everything
    // below is a cheap id lookup that does nothing when it does not.

    // 1. Right now, in case the bar is already standing.
    _fangEnsureOnlySheetButton();

    // 2. Whenever the DOM grows a bar -- including the narrow-screen swap.
    const observer = new MutationObserver(() => _fangEnsureOnlySheetButton());
    observer.observe(document.body, { childList: true, subtree: true });

    // 3. Sheet Only rebuilds around the sheet, so re-check when one renders.
    Hooks.on("renderActorSheetV2", () => _fangEnsureOnlySheetButton());
    Hooks.on("renderActorSheet", () => _fangEnsureOnlySheetButton());

    // 4. A few late attempts, for the case where its ready hook is still awaiting something
    //    and the observer has nothing to see yet. Stops as soon as the button is in place.
    let versuche = 0;
    const nachfassen = setInterval(() => {
      if (document.getElementById("fang-so-btn")) { clearInterval(nachfassen); return; }
      if (++versuche > 20) {
        clearInterval(nachfassen);
        // The observer stays on, so a bar appearing later is still served. This only says
        // that ten seconds after ready there was nothing to attach to.
        if (!document.getElementById("so-main-buttons")) {
          console.log("FANG | No Sheet Only button bar after 10s - not in that mode, or it never loaded.");
        } else {
          console.warn("FANG | Sheet Only bar is present but the button would not attach.");
        }
        return;
      }
      _fangEnsureOnlySheetButton();
    }, 500);
  }

  // Optional one-way background sync: DiploGlass factions -> FANG factions.
  Hooks.on("updateSetting", async (setting) => {
    if (setting?.key === "fang.themeVariant") {
      _fangApplyVisualThemeToOpenApps();
    }

    if (!game.user.isGM) return;
    if (!game.settings.get("fang", "diploglassOneWaySync")) return;
    if (!game.modules.get("diploglass")?.active) return;
    if (!game.journal.getName("FANG Graph")) return;
    const syncKeys = new Set([
      "diploglass.factions",
      "diploglass.playerReputations",
      "diploglass.globalReputations",
      "diploglass.usePerPlayerReputation"
    ]);
    if (!syncKeys.has(setting?.key)) return;

    try {
      if (!fangApp) fangApp = new FangApplication();
      await fangApp.loadData();
      if (fangApp.rendered) {
        fangApp.initSimulation();
        fangApp._populateActors();
      }
    } catch (err) {
      console.error("FANG | DiploGlass updateSetting sync failed", err);
    }
  });

  await willkommenZeigen();
});

// The button in the actor directory. scripts/verzeichnisknopf.js places it the same way in
// every Ninjo module: one shared row under Foundry's own buttons, Foundry's button style, a
// short label and the full name as tooltip.
verzeichnisKnopfEinrichten("fang", () => ({
  symbol: "fas fa-project-diagram",
  text: "FANG.ButtonShort",
  tipp: "FANG.ButtonOpen",
  aktion: () => {
    if (!fangApp) {
      fangApp = new FangApplication();
    }
    if (fangApp.rendered) {
      fangApp.bringToFront();
    } else {
      fangApp.render({ force: true });
    }
  }
}));


Hooks.on("renderJournalTextPageSheet", (app, html, data) => {
  // Foundry sanitizes onclick attributes for security. We attach the listener here safely.
  const $html = $(html);
  $html.find(".fang-open-btn").on("click", _fangOpenGraphFromJournalButtonEvent);
});

// An actor's picture or name changed. The graph reads the picture from the actor now, so a
// client only has to let go of its cached image; the GM additionally keeps the node's own
// copy of picture and name in step, because that copy is what a player who may not see the
// actor gets to see. Optional call: a client can hold a cached older fang-app.js.
// A GM arriving or leaving changes what a player may do in collaborative mode.
Hooks.on("userConnected", (user) => {
  if (user?.isGM && fangApp?.rendered) fangApp._updateLockUI();
});

Hooks.on("updateActor", async (actor, changes) => {
  if (fangApp) await fangApp._onActorUpdated?.(actor, changes);
});

// Auto-Release lock on Disconnect
Hooks.on("userConnected", async (user, connected) => {
  // In collaborative mode the banner lists who else is in the graph — keep it honest
  // when someone joins or leaves.
  if (fangApp?.rendered) fangApp._updateLockUI();

  if (!connected && game.user.isGM) {
    const entry = game.journal.getName("FANG Graph");
    if (!entry) return;

    const lock = entry.getFlag("fang", "editLock");
    if (lock && lock.userId === user.id) {
      console.log(`FANG | Releasing lock held by disconnecting user: ${user.name}`);
      await entry.unsetFlag("fang", "editLock");
      game.socket.emit("module.fang", { action: "lockStatusUpdate" });
    }
  }
});
