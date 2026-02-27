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
      fangApp.render({ force: true });
      return true;
    }
  });

  // Register Module Settings
  game.settings.register("fang", "enableCosmicWind", {
    name: "FANG.Settings.CosmicWind.Name",
    hint: "FANG.Settings.CosmicWind.Hint",
    scope: "client",     // User-specific preference
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
    scope: "client",
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
});

Hooks.once("ready", () => {
  // Expose API for Macros
  const module = game.modules.get("fang");
  module.api = {
    toggleGraph: () => {
      if (!fangApp) fangApp = new FangApplication();
      fangApp.render({ force: true });
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
    fangApp.render(true);
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
