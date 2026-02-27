# FANG Developer & Style Guide

Welcome to the **Foundry Actor Nexus Graph (FANG)** development documentation. This guide establishes the mandatory UI/UX design language, architectural conventions, and code standards for this project. 

**All contributors (including AI agents) must strictly adhere to these rules when submitting code.**

---

## 🎨 1. Design Language & UI Aesthetic

FANG strictly follows a "D&D Light Parchment / Dark Fantasy" aesthetic. We do NOT use generic dark mode or unstyled browser components.

### 1.1 CSS Variables (The FANG Palette)
All custom UI elements (Dialogs, Sidebars, Context Menus, Tooltips) MUST use these globally defined CSS variables from `fang.css`:

```css
:root {
    /* Primary Backgrounds */
    --fang-bg-color: #fdfbf7;      /* Main Application Light Parchment */
    --fang-card-bg: #ffffff;       /* Pure white for inner cards/menus */
    --fang-nav-bg: #f4f1ea;        /* Slightly darker parchment/sidebar */
    
    /* Text & Borders */
    --fang-text-color: #1a1a1a;    /* High contrast dark grey/black */
    --fang-border-color: #dcd6cc;  /* Soft grey/brown for subtle borders */
    
    /* Strict Theme Accents */
    --fang-primary-red: #8B0000;   /* Dark D&D Red (Primary Brand Color) */
    --fang-accent-gold: #D4AF37;   /* Metallic Gold (Borders, Icons, Hover states) */
    --fang-header-text: #ffffff;   /* White text exclusively used ON TOP of primary red */
    
    /* Typography */
    --fang-font-main: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}
```

### 1.2 UI Component Rules
- **Sidebars:** Sidebars must have a `var(--fang-nav-bg)` background, a `var(--fang-primary-red)` header with white text, and a bottom border of `var(--fang-accent-gold)`.
- **Buttons:** Primary interactive elements should be red (`--fang-primary-red`) with white text. Hover states should darken the red (e.g., `#600000`), never invert to light mode. Secondary cancel buttons can be light.
- **Floating Menus / Tooltips:** Must use `var(--fang-card-bg)` or `rgba(255,255,255, 0.96)`. Always include a 1px solid `var(--fang-accent-gold)` border and a soft drop shadow.
- **Spacing:** Use flexbox (`input-stack`, `form-group`) from `fang.css` for consistent padding and alignment. Checkboxes must always be aligned perfectly to the right in Dialogs.

---

## 🏗️ 2. Architectural Guidelines

### 2.1 Separation of Concerns
- **`main.js`**: Reserved exclusively for Foundry initialization hooks (`init`, `ready`), registering module Settings (`game.settings.register`), and injecting UI buttons into core Foundry elements (like the Scene Controls). Do not put application logic here.
- **`fang-app.js`**: The core Application class (`FangApplication`). Contains rendering logic, socket listeners, and the immense D3.js physics simulation.
- **`fang-app.hbs`**: The Handlebars HTML template. Keep logic out of here; use it purely for structure.
- **`lang/en.json` & `de.json`**: All user-facing text MUST go through these localization files using `game.i18n.localize()`. Hardcoding strings in JS or HTML is forbidden.

### 2.2 The Canvas & D3.js
FANG renders an HTML Sidebar next to a raw `<canvas>` tag powered by D3.js.
- **HTML Overlays:** If you add complex interactivity to tokens (like Context Menus or Tooltips), **do not draw text/rectangles onto the canvas itself.** Instead, create absolute-positioned HTML `<div>` elements floating *over* the canvas. This allows us to use CSS for rich styling, word-wrapping, and animations.
- **Coordinate Systems:** The Canvas viewport is zoomable and pannable via `event.transform`. When updating HTML overlays based on D3 Nodes, *always* translate the raw mathematical coordinates (`node.x`, `node.y`) into screen coordinates using `this.transform.applyX(node.x)`. Do not rely on raw `event.clientX` unless handling an immediate browser click off-canvas.

### 2.3 Data Storage & Socket Sync
- **The Graph Data (`this.graphData`)**: Contains `nodes` and `links`. It is permanently stored as a JSON object on a dedicated Journal Entry (`FANG Graph`).
- **GMs vs. Players:** Players modify a local copy of `graphData` and emit it via Socket to the GM. The GM validates, updates the overarching Journal Entry, and emits a command for all clients to refresh.
- **Saving:** Call `this.saveData(true)` to write to the Journal and trigger a background sync across connected clients.

---

## 📝 3. Localization
If you add a new feature, a new button, a new setting, or a new warning message:
1. Add a descriptive key to `lang/en.json` (e.g. `"FANG.Dialogs.MyNewButton": "Click Me!"`).
2. Add the exact identical structure to `lang/de.json` with the German translation.
3. Access it in JS via `game.i18n.localize("FANG.Dialogs.MyNewButton")`.
4. Access it in HBS via `{{localize "FANG.Dialogs.MyNewButton"}}`.
