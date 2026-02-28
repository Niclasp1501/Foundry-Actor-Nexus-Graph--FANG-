import { FangApplication } from "./fang-app.js";

// Singleton instance
let fangApp = null;

Hooks.once("init", () => {
  console.log("FANG | Initializing Foundry Actor Nexus Graph module");

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
    config: true,        // Shows up in module settings menu
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
    config: true,
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
        // Fix for ApplicationV2 where `element` is the HTMLElement itself, not jQuery
        const sidebar = fangApp.element.querySelector(".sidebar");
        if (sidebar) {
          sidebar.style.display = value ? "flex" : "none";
          fangApp.resizeCanvas();
        }
      }
    }
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

    // When ordered to show the graph
    if (data.action === "showGraph") {
      if (!fangApp) fangApp = new FangApplication();
      // Wait a tiny moment to ensure the latest data is flagged on the Journal
      setTimeout(async () => {
        await fangApp.loadData();
        // If already rendered, initSimulation handles the update without destroying the window structure
        if (fangApp.rendered) {
          fangApp.initSimulation();
        } else {
          fangApp.render({ force: true });
        }
      }, 500);
    }

    // When ordered to show the graph ONLY to the monitor
    if (data.action === "showGraphMonitor") {
      if (game.user.name.toLowerCase().includes("monitor")) {
        if (!fangApp) fangApp = new FangApplication();
        // Wait a tiny moment to ensure the latest data is flagged on the Journal
        setTimeout(async () => {
          await fangApp.loadData();
          if (fangApp.rendered) {
            fangApp.initSimulation();
          } else {
            fangApp.render({ force: true });
          }
        }, 500);
      }
    }

    // When ordered to close the graph
    if (data.action === "closeGraph") {
      if (fangApp && fangApp.rendered) {
        fangApp.close();
      }
    }

    // When ordered to close the graph ONLY on the monitor
    if (data.action === "closeGraphMonitor") {
      if (game.user.name.toLowerCase().includes("monitor")) {
        if (fangApp && fangApp.rendered) {
          fangApp.close();
        }
      }
    }

    // --- SOCKET RELAY FOR PLAYER EDITING ---
    // A player without Journal write-permissions sent an edit request to the GM
    if (data.action === "playerEditGraph" && game.user.isGM) {
      console.log("FANG | Received Player Edit Graph Request. Processing as GM...");
      if (!fangApp) {
        fangApp = new FangApplication();
      }

      // Wait briefly to ensure we have the absolute latest baseline
      setTimeout(async () => {
        // Apply the player's new graph data onto our GM instance
        if (data.payload && data.payload.newGraphData) {
          fangApp.graphData = data.payload.newGraphData;
          console.log("FANG | GM locally applied player graph data.", fangApp.graphData);
        }

        // If the GM's UI is open, visually update it so the GM sees the change live
        if (fangApp.rendered) {
          fangApp.initSimulation();
          fangApp.simulation.alpha(0.05).restart(); // Small heat burst
          fangApp._populateActors(); // Refresh sidebar lists
        }

        // Save this new state into the GM's Journal
        // Important: As the GM, we have permissions to do this.
        // saveData() also automatically triggers a "showGraph" socket back to ALL players
        await fangApp.saveData(false); // pass 'false' to avoid infinite render loops if already open
      }, 100);
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
  $html.find(".fang-open-btn").on("click", (e) => {
    e.preventDefault();
    if (game.modules.get("fang")?.api?.toggleGraph) {
      game.modules.get("fang").api.toggleGraph();
    }
  });
});
