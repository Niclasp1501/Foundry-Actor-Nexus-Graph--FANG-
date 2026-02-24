import { FangApplication } from "./fang-app.js";

// Singleton instance
let fangApp = null;

Hooks.once("init", () => {
  console.log("FANG | Initializing Foundry Actor Nexus Graph module");

  // Register Keybinding
  game.keybindings.register("fang", "openGraph", {
    name: "Open Ninjo's FANG",
    hint: "Opens the interactive FANG Actor relationship graph.",
    editable: [
      { key: "KeyG", modifiers: [KeyboardManager.MODIFIER_KEYS.SHIFT] }
    ],
    onDown: () => {
      if (!fangApp) fangApp = new FangApplication();
      fangApp.render({ force: true });
      return true;
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
  const button = $(`
    <button id="fang-btn">
      <i class="fas fa-project-diagram"></i> Ninjo's FANG
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
