import { FangApplication } from "./fang-app.js";

// Singleton instance
let fangApp = null;

Hooks.once("init", () => {
  console.log("FANG | Initializing Foundry Actor Nexus Graph module");

  // Register Handlebars Helpers
  Handlebars.registerHelper("eq", (a, b) => a === b);

  // Register Keybinding
  game.keybindings.register("fang", "openGraph", {
    name: "FANG.ButtonOpen",
    hint: "FANG.KeybindingHint",
    editable: [
      { key: "KeyG", modifiers: [KeyboardManager.MODIFIER_KEYS.SHIFT] }
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
          sidebar.style.display = (value && !isMonitor) ? "flex" : "none";
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

  game.settings.register("fang", "replaceOnlySheetActor", {
    name: "FANG.Settings.ReplaceOnlySheetActor.Name",
    hint: "FANG.Settings.ReplaceOnlySheetActor.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => {
      // Remove injected buttons so they get re-injected with new setting
      document.getElementById("fang-so-btn")?.remove();
      document.getElementById("fang-so-actors-btn")?.remove();
      const orig = document.getElementById("so-collapse-actor-select");
      if (orig) orig.style.display = "";
    }
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

Hooks.once("ready", () => {
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
          await fangApp.loadData();
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
        if (data.payload?.newGraphData) {
          fangApp.graphData = data.payload.newGraphData;
        }
        if (fangApp.rendered) {
          fangApp.initSimulation();
          fangApp.simulation.alpha(0.05).restart();
          fangApp._populateActors();
        }
        await fangApp.saveData(false);
      }, 100);
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

  // Inject FANG button (and optionally replace actor-opener) into "only-sheet" module
  const observer = new MutationObserver((mutations) => {
    for (let mutation of mutations) {
      if (mutation.addedNodes.length) {
        const container = document.getElementById("so-main-buttons");
        if (container && !document.getElementById("fang-so-btn")) {
          const replaceActorBtn = game.settings.get("fang", "replaceOnlySheetActor");

          // 1) Optionally replace the original actor-selector button
          if (replaceActorBtn) {
            const orig = document.getElementById("so-collapse-actor-select");
            if (orig) orig.style.display = "none";

            if (!document.getElementById("fang-so-actors-btn")) {
              const actorsBtn = document.createElement("button");
              actorsBtn.id = "fang-so-actors-btn";
              actorsBtn.title = game.i18n.localize("ACTOR.TabActor") || "Actors";
              _applyOnlySheetStyle(actorsBtn);
              actorsBtn.innerHTML = '<i class="fa-solid fa-user"></i>';
              // FIX: Robust toggle and close logic for V13 + Only-Sheet
              actorsBtn.addEventListener("click", (e) => {
                e.preventDefault();

                // If already marked as open, find the app and close it. 
                // The MutationObserver below will handle all state cleanup (!).
                if (actorsBtn.dataset.fangOpen === "1") {
                  const popout = document.querySelector(".actors-sidebar.sidebar-popout");
                  if (popout) {
                    const app = Object.values(ui.windows).find(w => w.element?.[0] === popout);
                    if (app) app.close();
                    else popout.remove();
                  }
                  return;
                }

                // Ensure the panel CSS is injected (immune to Foundry's _updatePosition)
                const STYLE_ID = "fang-actor-panel-style";
                if (!document.getElementById(STYLE_ID)) {
                  const style = document.createElement("style");
                  style.id = STYLE_ID;
                  style.textContent = `
                    .actors-sidebar.sidebar-popout {
                      position: fixed !important;
                      right: 0px !important;
                      top: 0px !important;
                      left: auto !important;
                      width: 300px !important;
                      height: 100vh !important;
                      max-height: 100vh !important;
                      margin: 0 !important;
                      border-radius: 0 !important;
                      z-index: 9999 !important;
                      background: rgba(11, 10, 19, 0.95) !important;
                      border: 1px solid rgb(48, 40, 49) !important;
                      box-shadow: -4px 0 16px rgba(0,0,0,0.6) !important;
                    }
                  `;
                  document.head.appendChild(style);
                }

                // Initial state update: mark as open and shift sheet left
                actorsBtn.dataset.fangOpen = "1";
                document.body.classList.add("fang-actor-panel-open");

                // Render as popout (lowercase 'o' for V13 compatibility)
                const dir = ui.actors;
                if (!dir) return;
                if (dir.renderPopout) dir.renderPopout();
                else dir.render(true, { popout: true });

                // SINGLE SOURCE OF TRUTH for cleanup: Watch for the panel removal from DOM.
                // This handles X-button, our button-close, and external closes correctly.
                const observer = new MutationObserver(() => {
                  if (!document.querySelector(".actors-sidebar.sidebar-popout")) {
                    document.body.classList.remove("fang-actor-panel-open");
                    actorsBtn.removeAttribute("data-fang-open");
                    observer.disconnect();
                  }
                });
                observer.observe(document.body, { childList: true, subtree: true });
              });
              // Insert at same position as the original (first child)
              container.insertBefore(actorsBtn, container.firstChild);
            }
          }

          // 2) Always inject the FANG button (matching Only-Sheet style)
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

  // If Only-Sheet is active and this is a popout, position it like the journal panel
  if (document.getElementById("so-main-buttons") && app.popOut) {
    // Small delay to let Foundry finish positioning first
    setTimeout(() => {
      const el = app.element?.[0] ?? document.querySelector(".actors-sidebar.sidebar-popout, [class*='actor'][class*='popout']");
      if (!el) return;
      Object.assign(el.style, {
        position: "fixed",
        right: "0px",
        top: "0px",
        left: "auto",
        width: "300px",
        height: "100vh",
        maxHeight: "100vh",
        margin: "0",
        borderRadius: "0",
        zIndex: "9999",
        background: "rgba(11, 10, 19, 0.95)",
        border: "1px solid rgb(48, 40, 49)",
        boxShadow: "-4px 0 16px rgba(0,0,0,0.6)"
      });
    }, 50);
  }
});


Hooks.on("renderJournalTextPageSheet", (app, html, data) => {
  // Foundry sanitizes onclick attributes for security. We attach the listener here safely.
  const $html = $(html);
  $html.find(".fang-open-btn").on("click", (e) => {
    e.preventDefault();
    if (game.modules.get("fang")?.api?.toggleGraph) {
      game.modules.get("fang").api.toggleGraph();
    }
  });
});

// Auto-Release lock on Disconnect
Hooks.on("userConnected", async (user, connected) => {
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
