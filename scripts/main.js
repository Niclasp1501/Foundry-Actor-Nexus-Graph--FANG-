import { FangApplication } from "./fang-app.js";

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
  console.log("FANG | Initializing Foundry Actor Nexus Graph module");

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
      if (fangApp?.rendered) fangApp._onHistoryStoreChanged();
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
  // Mark body for role-based CSS — enables body.role-player .gm-only { display:none }
  // to hide GM-only elements globally, including dynamically added ones.
  document.body.classList.toggle("role-player", !game.user.isGM);
  document.body.classList.toggle("role-gm", game.user.isGM);

  if (!window._fangJournalOpenButtonFixInstalled) {
    document.addEventListener("click", _fangOpenGraphFromJournalButtonEvent, true);
    window._fangJournalOpenButtonFixInstalled = true;
  }

  // Expose API for Macros
  const module = game.modules.get("fang");
  module.api = {
    toggleGraph: () => {
      if (!fangApp) fangApp = new FangApplication();
      if (fangApp.rendered) {
        fangApp.bringToFront();
      } else {
        fangApp.render({ force: true });
      }
    }
  };

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
    console.log("FANG | Socket event received:", data);

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
        setTimeout(async () => {
          // Pulls the new server state but keeps our own unsaved changes, instead of
          // dropping them the way a plain loadData() did.
          await fangApp.refreshFromServer();
          fangApp.initSimulation();
          fangApp._populateActors();
        }, 100);
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
        if (payload.newGraphData) {
          // Apply the player's change on top of our own state instead of replacing it.
          // Replacing meant that anything the GM changed since the player loaded was
          // silently thrown away — including data the player never even saw.
          await fangApp.applyRemoteGraphEdit(payload);
        }
        if (fangApp.rendered) {
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

    if (data.action === "playerCreateHistoryEntry" && game.user.isGM) {
      if (!fangApp) fangApp = new FangApplication();
      const payload = data.payload || {};
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
        authorName: payload.authorName
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

  // Inject the FANG button into the "only-sheet" module's button bar.
  //
  // Replacing that module's actor selector with a docked directory used to live
  // here as well. It moved to Ninjo's In-Person Tools in 14.2609.1: it rearranges
  // another module's interface for the sake of playing at a table, which is that
  // module's subject, not ours. FANG keeps its own button and nothing else.
  const observer = new MutationObserver((mutations) => {
    for (let mutation of mutations) {
      if (mutation.addedNodes.length) {
        const container = document.getElementById("so-main-buttons");
        if (container && !document.getElementById("fang-so-btn")) {
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
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

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
});

Hooks.on("renderActorDirectory", (app, html, data) => {
  const $html = $(html);
  // Check if button already exists to prevent duplicates
  if ($html.find("#fang-btn").length > 0) return;

  // Create the header button
  const buttonTitle = game.i18n.localize("FANG.ButtonOpen");
  const button = $(`
    <button id="fang-btn">
      <i class="fas fa-project-diagram"></i> ${buttonTitle}
    </button>
  `);

  button.on("click", (e) => {
    e.preventDefault();
    if (!fangApp) {
      fangApp = new FangApplication();
    }
    if (fangApp.rendered) {
      fangApp.bringToFront();
    } else {
      fangApp.render({ force: true });
    }
  });

  // Append to the directory header
  $(html).find(".directory-header .header-actions").append(button);
});


Hooks.on("renderJournalTextPageSheet", (app, html, data) => {
  // Foundry sanitizes onclick attributes for security. We attach the listener here safely.
  const $html = $(html);
  $html.find(".fang-open-btn").on("click", _fangOpenGraphFromJournalButtonEvent);
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
