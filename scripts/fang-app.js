const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const FANG_DEFAULT_PLACEHOLDER_IMG = "modules/fang/assets/placeholder-npc.svg";
const FANG_FALLBACK_PLACEHOLDER_IMG = "modules/fang/assets/placeholder-npc.svg";
const FANG_LEGACY_PLACEHOLDER_IMG_REGEX = /(?:^|\/)modules\/fang\/assets\/placeholder-npc-default\.webp(?:\?.*)?$/i;

function normalizeLegacyPlaceholderImagePath(path) {
    if (typeof path !== "string") return path;
    const trimmed = path.trim();
    if (!trimmed) return trimmed;
    return FANG_LEGACY_PLACEHOLDER_IMG_REGEX.test(trimmed) ? FANG_DEFAULT_PLACEHOLDER_IMG : trimmed;
}

/**
 * Helper class for future premium features.
 * Currently returns true for all checks, but ready for license validation.
 */
class FangLicense {
    static isPremium() {
        // Today: always true. 
        // Future: Check game.settings.get("fang", "licenseKey") via Patreon API etc.
        return true;
    }
}

/**
 * Dedicated dialog for background customization.
 */
class FangBackgroundConfig extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "fang-background-config",
        classes: ["fang-app-window", "fang-dialog", "fang-background-config"],
        position: { width: 420, height: "auto" },
        window: {
            title: "FANG.UI.Background.BackgroundConfigTitle",
            resizable: false,
            minimizable: false
        }
    };

    static PARTS = {
        main: { template: "modules/fang/templates/background-settings.hbs" }
    };

    constructor(fangApp, options = {}) {
        super(options);
        this.fangApp = fangApp;
    }

    async _prepareContext(options) {
        const opacity = game.settings.get("fang", "canvasBackgroundOpacity");
        return {
            background: {
                mode: game.settings.get("fang", "canvasBackgroundMode"),
                color: game.settings.get("fang", "canvasBackgroundColor"),
                image: game.settings.get("fang", "canvasBackgroundImage"),
                blur: game.settings.get("fang", "canvasBackgroundBlur"),
                opacity: opacity,
                opacityPercent: Math.round(opacity * 100),
                preset: game.settings.get("fang", "canvasBackgroundPreset")
            },
            colors: [
                { hex: "#fdfbf7", name: game.i18n.localize("FANG.UI.Background.Palette.Parchment") },
                { hex: "#f4ece1", name: game.i18n.localize("FANG.UI.Background.Palette.Linen") },
                { hex: "#eee1c5", name: game.i18n.localize("FANG.UI.Background.Palette.WarmParchment") },
                { hex: "#e6d5b8", name: game.i18n.localize("FANG.UI.Background.Palette.AntiquePaper") },
                { hex: "#dcd0c0", name: game.i18n.localize("FANG.UI.Background.Palette.Canvas") },
                { hex: "#c8b99a", name: game.i18n.localize("FANG.UI.Background.Palette.Sand") },
                { hex: "#b9905e", name: game.i18n.localize("FANG.UI.Background.Palette.Leather") },
                { hex: "#8b5e3c", name: game.i18n.localize("FANG.UI.Background.Palette.AutumnLeaf") },
                { hex: "#a39171", name: game.i18n.localize("FANG.UI.Background.Palette.Sage") },
                { hex: "#5d6d7e", name: game.i18n.localize("FANG.UI.Background.Palette.SteelBlue") },
                { hex: "#223a55", name: game.i18n.localize("FANG.UI.Background.Palette.Navy") },
                { hex: "#36204e", name: game.i18n.localize("FANG.UI.Background.Palette.Purple") },
                { hex: "#3f556a", name: game.i18n.localize("FANG.UI.Background.Palette.Midnight") },
                { hex: "#3b0b0b", name: game.i18n.localize("FANG.UI.Background.Palette.Red") },
                { hex: "#3a3a3f", name: game.i18n.localize("FANG.UI.Background.Palette.Grey") },
                { hex: "#26242e", name: game.i18n.localize("FANG.UI.Background.Palette.Black") },
                { hex: "#3a4b22", name: game.i18n.localize("FANG.UI.Background.Palette.Forest") },
                { hex: "#2f4a4f", name: game.i18n.localize("FANG.UI.Background.Palette.Ocean") },
                { hex: "#5a3a33", name: game.i18n.localize("FANG.UI.Background.Palette.DeepMahogany") },
                { hex: "#424660", name: game.i18n.localize("FANG.UI.Background.Palette.Shadow") }
            ]
        };
    }

    _onRender(context, options) {
        super._onRender(context, options);
        const html = this.element;
        console.log("FANG | Rendering Background Config Dialog");

        // Mode Change
        const modeSelect = html.querySelector('select[name="bgMode"]');
        if (modeSelect) {
            modeSelect.addEventListener("change", async (e) => {
                const mode = e.target.value;
                console.log("FANG | Setting Mode:", mode);
                await game.settings.set("fang", "canvasBackgroundMode", mode);
                this.render(); // Re-render this dialog
                this.fangApp._applyBackground();
                game.socket.emit("module.fang", { action: "applyBackground" });
            });
        }

        // Color Palette (Single Click)
        html.querySelectorAll(".color-patch").forEach(patch => {
            patch.addEventListener("click", async (e) => {
                const color = e.currentTarget.dataset.color;
                console.log("FANG | Setting Color:", color);
                await game.settings.set("fang", "canvasBackgroundColor", color);
                this.render();
                this.fangApp._applyBackground();
                game.socket.emit("module.fang", { action: "applyBackground" });
            });
        });

        // Image Selection (File Picker)
        const imageInput = html.querySelector('input[name="bgImage"]');
        if (imageInput) {
            imageInput.addEventListener("change", async (e) => {
                await game.settings.set("fang", "canvasBackgroundImage", e.target.value);
                this.fangApp._applyBackground();
                game.socket.emit("module.fang", { action: "applyBackground" });
            });
        }

        const pickerBtn = html.querySelector('.file-picker[data-target="bgImage"]');
        if (pickerBtn) {
            pickerBtn.addEventListener("click", (e) => {
                new FilePicker({
                    type: "image",
                    current: game.settings.get("fang", "canvasBackgroundImage"),
                    callback: async (path) => {
                        if (imageInput) imageInput.value = path;
                        await game.settings.set("fang", "canvasBackgroundImage", path);
                        this.fangApp._applyBackground();
                        game.socket.emit("module.fang", { action: "applyBackground" });
                    }
                }).render(true);
            });
        }

        // Blur Slider
        const blurInput = html.querySelector('input[name="bgBlur"]');
        if (blurInput) {
            const blurVal = html.querySelector("#bgBlurVal");
            blurInput.addEventListener("input", (e) => {
                if (blurVal) blurVal.innerText = `${e.target.value}px`;
                // Live preview without spamming world settings writes
                this.#previewImageLayer({
                    blur: parseInt(e.target.value),
                    opacity: parseFloat(html.querySelector('input[name="bgOpacity"]')?.value ?? "1"),
                    path: html.querySelector('input[name="bgImage"]')?.value ?? ""
                });
            });
            blurInput.addEventListener("change", async (e) => {
                await game.settings.set("fang", "canvasBackgroundBlur", parseInt(e.target.value));
                this.fangApp._applyBackground();
                game.socket.emit("module.fang", { action: "applyBackground" });
            });
        }

        // Opacity Slider
        const opacityInput = html.querySelector('input[name="bgOpacity"]');
        if (opacityInput) {
            const opacityVal = html.querySelector("#bgOpacityVal");
            opacityInput.addEventListener("input", (e) => {
                if (opacityVal) opacityVal.innerText = `${Math.round(e.target.value * 100)}%`;
                // Live preview without spamming world settings writes
                this.#previewImageLayer({
                    blur: parseInt(html.querySelector('input[name="bgBlur"]')?.value ?? "0"),
                    opacity: parseFloat(e.target.value),
                    path: html.querySelector('input[name="bgImage"]')?.value ?? ""
                });
            });
            opacityInput.addEventListener("change", async (e) => {
                await game.settings.set("fang", "canvasBackgroundOpacity", parseFloat(e.target.value));
                this.fangApp._applyBackground();
                game.socket.emit("module.fang", { action: "applyBackground" });
            });
        }

        // Preset Change
        const presetSelect = html.querySelector('select[name="bgPreset"]');
        if (presetSelect) {
            presetSelect.addEventListener("change", async (e) => {
                await game.settings.set("fang", "canvasBackgroundPreset", e.target.value);
                this.fangApp._applyBackground();
                game.socket.emit("module.fang", { action: "applyBackground" });
            });
        }

        // Preset Tiles (Preview Grid)
        html.querySelectorAll(".preset-tile").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                const preset = e.currentTarget?.dataset?.preset;
                if (!preset) return;
                await game.settings.set("fang", "canvasBackgroundPreset", preset);
                this.fangApp._applyBackground();
                game.socket.emit("module.fang", { action: "applyBackground" });
                this.render();
            });
        });
    }

    #previewImageLayer({ blur, opacity, path }) {
        if (!this.fangApp?.element) return;
        const mode = game.settings.get("fang", "canvasBackgroundMode");
        if (mode !== "image") return;
        const layer = this.fangApp.element.querySelector("#fang-bg-layer");
        if (!layer) return;

        layer.classList.add("no-transition");
        if (path) {
            layer.style.backgroundImage = `url("${path}")`;
            layer.style.backgroundSize = "cover";
            layer.style.backgroundPosition = "center";
            layer.style.backgroundRepeat = "no-repeat";
            layer.style.transform = "scale(1.08)";
        }
        layer.style.filter = blur > 0 ? `blur(${blur}px)` : "";
        layer.style.opacity = `${opacity}`;
        setTimeout(() => layer.classList.remove("no-transition"), 60);
    }
}

export class FangApplication extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "fang-app",
        classes: ["fang-app-window", "common-display"],
        position: {
            width: 1400,
            height: 950
        },
        window: {
            title: "Foundry Actor Nexus Graph (FANG)",
            resizable: true,
            minimizable: true,
            contentClasses: ["common-display"]
        }
    };

    static PARTS = {
        main: {
            template: "modules/fang/templates/fang-app.hbs"
        }
    };

    constructor(options) {
        super(options);
        this.graphData = { nodes: [], links: [] };
        this.simulation = null;
        this.transform = null;
        this.zoom = null;
        this._initialZoomApplied = false;
        this._isSpotlightActive = false;
        this._isSyncCameraActive = false;
        this._remoteSyncing = false; // Guard to prevent feedback loops
        this._hoveredNodeId = null;
        this._bgImageLoaded = new Map();
        this._searchQuery = "";
        this._searchIsolate = false;
        this._searchMatchedNodeIds = new Set();
        this._searchMatchedLinkIndices = new Set();
        this._searchUiVisible = false;
    }

    async _prepareContext(options) {
        const inPersonGaming = game.settings.get("fang", "inPersonGaming");
        const monitorName = game.settings.get("fang", "monitorDisplayName").toLowerCase();
        const hasMonitorPlayer = game.users.some(u => u.active && u.name.toLowerCase().includes(monitorName));

        return {
            ...await super._prepareContext(options),
            showMonitorControls: inPersonGaming && hasMonitorPlayer,
            isPremium: FangLicense.isPremium(),
            background: {
                mode: game.settings.get("fang", "canvasBackgroundMode"),
                color: game.settings.get("fang", "canvasBackgroundColor"),
                image: game.settings.get("fang", "canvasBackgroundImage"),
                blur: game.settings.get("fang", "canvasBackgroundBlur"),
                opacity: game.settings.get("fang", "canvasBackgroundOpacity"),
                preset: game.settings.get("fang", "canvasBackgroundPreset")
            }
        };
    }

    async _onFirstRender(context, options) {
        super._onFirstRender(context, options);

        // Load D3 JS from CDN if not already loaded (Only once)
        if (typeof d3 === "undefined") {
            await this.#loadD3();
        }

        // Persistent data loading (Only once)
        await this.loadData();
    }

    _onRender(context, options) {
        super._onRender(context, options);
        this._applyVisualTheme();

        const monitorName = game.settings.get("fang", "monitorDisplayName").toLowerCase();

        // 1. UI Setup (Pre-D3 Dimensions)
        // Manage Sidebar visibility and Fullscreen classes first
        if (!game.user.isGM) {
            const sidebar = this.element.querySelector(".sidebar");
            const allowPlayerEdit = game.settings.get("fang", "allowPlayerEditing");
            const isGMOnline = game.users.some(u => u.isGM && u.active);
            if (sidebar) {
                const isMonitor = game.user.name.toLowerCase().includes(monitorName);
                sidebar.style.display = (allowPlayerEdit && isGMOnline && !isMonitor) ? "flex" : "none";
                const gmControls = sidebar.querySelectorAll(".gm-only");
                gmControls.forEach(el => el.style.display = "none");
            }
            if (game.user.name.toLowerCase().includes(monitorName)) {
                this.element.classList.add("fang-fullscreen-player");
                document.body.classList.add("fang-monitor");

                // --- FIX: Hide ALL Foundry UI containers via JS (Theorie C) ---
                ["#ui-bottom", "#hotbar", "#players", "#ui-top", "#ui-left", "#ui-right", "#navigation", "#controls", "#sidebar"].forEach(sel => {
                    const el = document.querySelector(sel);
                    if (el) el.style.setProperty("display", "none", "important");
                });
                // Reset any body padding/margin that Foundry might apply
                document.body.style.setProperty("padding", "0", "important");
                document.body.style.setProperty("margin", "0", "important");
                document.body.style.setProperty("overflow", "hidden", "important");

                // --- Force fullscreen styles on the app element ---
                this._applyMonitorFullscreenStyles();

                // --- FIX: Force window-content to fill (Theorie B) ---
                const windowContent = this.element.querySelector(".window-content");
                if (windowContent) {
                    windowContent.style.setProperty("height", "100%", "important");
                    windowContent.style.setProperty("max-height", "none", "important");
                    windowContent.style.setProperty("min-height", "100%", "important");
                    windowContent.style.setProperty("padding", "0", "important");
                    windowContent.style.setProperty("margin", "0", "important");
                    windowContent.style.setProperty("overflow", "hidden", "important");
                }

                // --- FIX: MutationObserver to guard against Foundry resetting styles ---
                if (this._monitorStyleObserver) this._monitorStyleObserver.disconnect();
                this._monitorStyleObserver = new MutationObserver(() => {
                    if (game.user.name.toLowerCase().includes(monitorName)) {
                        this._applyMonitorFullscreenStyles();
                    }
                });
                this._monitorStyleObserver.observe(this.element, {
                    attributes: true,
                    attributeFilter: ["style"]
                });

                // Auto-zoom to fit after a short delay to ensure canvas resized
                setTimeout(() => this.zoomToFit(false), 200);
            } else {
                document.body.classList.remove("fang-monitor");
            }
        }

        // 2. Re-initialize D3 and Canvas context
        this._initD3();
        this._populateActors();

        // Manage ResizeObserver
        if (this._resizeObserver) this._resizeObserver.disconnect();
        const canvasContainer = this.element.querySelector(".canvas-container");
        this._resizeObserver = new ResizeObserver(() => this.resizeCanvas());
        this._resizeObserver.observe(canvasContainer);

        // 3. Re-attach Event Listeners (Universal)
        this.element.querySelector("#btnAddLink").addEventListener("click", this._onAddLink.bind(this));
        const btnAddPlaceholder = this.element.querySelector("#btnAddPlaceholder");
        if (btnAddPlaceholder) btnAddPlaceholder.addEventListener("click", this._onAddPlaceholder.bind(this));
        const btnDelete = this.element.querySelector("#btnDeleteElement");
        if (btnDelete) btnDelete.addEventListener("click", this._onDeleteElement.bind(this));
        const btnUpdateLink = this.element.querySelector("#btnUpdateLink");
        if (btnUpdateLink) btnUpdateLink.addEventListener("click", this._onUpdateLink.bind(this));
        const btnToggleCenter = this.element.querySelector("#btnToggleCenter");
        if (btnToggleCenter) btnToggleCenter.addEventListener("click", this._onToggleCenterNode.bind(this));
        const btnManageFactions = this.element.querySelector("#btnManageFactions");
        if (btnManageFactions) btnManageFactions.addEventListener("click", this._onManageFactions.bind(this));

        const btnToggleLock = this.element.querySelector("#btnToggleLock");
        if (btnToggleLock) btnToggleLock.addEventListener("click", this._onToggleEditLock.bind(this));

        const btnForceRelease = this.element.querySelector("#btnForceRelease");
        if (btnForceRelease) btnForceRelease.addEventListener("click", this._onForceReleaseLock.bind(this));

        const canvas = this.element.querySelector("#graphCanvas");
        canvas.addEventListener("click", this._onCanvasClick.bind(this));
        canvas.addEventListener("dblclick", this._onCanvasDoubleClick.bind(this));

        // 4. Update Lock UI status
        this._updateLockUI();
        canvas.addEventListener("contextmenu", this._onCanvasRightClick.bind(this));
        canvas.addEventListener("mousemove", this._handleCanvasMouseMove.bind(this));

        // Tab Navigation Logic
        const tabBtns = this.element.querySelectorAll(".tab-btn");
        const tabContents = this.element.querySelectorAll(".tab-content");
        tabBtns.forEach(btn => {
            btn.addEventListener("click", (e) => {
                const targetTab = e.currentTarget.dataset.tab;
                tabBtns.forEach(b => b.classList.remove("active"));
                tabContents.forEach(c => c.classList.remove("active"));
                e.currentTarget.classList.add("active");
                const targetContent = this.element.querySelector(`.tab-content[data-tab="${targetTab}"]`);
                if (targetContent) targetContent.classList.add("active");
            });
        });

        // Drag & Drop Listeners
        canvasContainer.addEventListener("dragover", this._onDragOver.bind(this));
        canvasContainer.addEventListener("drop", this._onDrop.bind(this));

        // Export / Import Listeners
        const btnExport = this.element.querySelector("#btnExportGraph");
        if (btnExport) btnExport.addEventListener("click", this._onExportGraph.bind(this));
        const inputImport = this.element.querySelector("#importFile");
        if (inputImport) inputImport.addEventListener("change", this._onImportGraph.bind(this));

        // Select Changes (Sync Sidebar)
        const deleteSelect = this.element.querySelector("#deleteSelect");
        if (deleteSelect) {
            deleteSelect.addEventListener("change", (e) => {
                const val = e.target.value;
                if (!val) return;
                const [type, id] = val.split("|").map(s => s.trim());
                this._syncSidebarSelection(type, id);
            });
        }

        const searchInput = this.element.querySelector("#fangSearchInput");
        const searchIsolate = this.element.querySelector("#fangSearchIsolate");
        const searchClear = this.element.querySelector("#fangSearchClear");
        const btnToggleSearchOverlay = this.element.querySelector("#btnToggleSearchOverlay");
        this._setSearchUiVisible(this._searchUiVisible);

        if (searchInput) {
            searchInput.value = this._searchQuery;
            searchInput.addEventListener("input", (e) => {
                this._searchQuery = e.target.value || "";
                this._rebuildSearchMatches();
                this.ticked();
            });
        }
        if (searchIsolate) {
            searchIsolate.checked = !!this._searchIsolate;
            searchIsolate.addEventListener("change", (e) => {
                this._searchIsolate = !!e.target.checked;
                this.ticked();
            });
        }
        if (searchClear) {
            searchClear.addEventListener("click", () => {
                this._clearSearchState();
                this._setSearchUiVisible(false);
            });
        }
        if (btnToggleSearchOverlay) {
            btnToggleSearchOverlay.addEventListener("click", () => {
                if (this._searchUiVisible) {
                    this._clearSearchState();
                    this._setSearchUiVisible(false);
                } else {
                    this._setSearchUiVisible(true, { focus: true });
                }
            });
        }

        // 4. GM-specific or Player-specific Logic
        if (game.user.isGM) {
            // GM-only Event Listeners
            const btnShare = this.element.querySelector("#btnShareGraph");
            if (btnShare) btnShare.addEventListener("click", this._onShareGraph.bind(this));

            const btnShareMonitor = this.element.querySelector("#btnShareGraphMonitor");
            if (btnShareMonitor) btnShareMonitor.addEventListener("click", this._onShareGraphMonitor.bind(this));

            const btnCloseRemote = this.element.querySelector("#btnCloseGraphRemote");
            if (btnCloseRemote) btnCloseRemote.addEventListener("click", this._onCloseGraphRemote.bind(this));

            const btnCloseMonitor = this.element.querySelector("#btnCloseGraphMonitor");
            if (btnCloseMonitor) btnCloseMonitor.addEventListener("click", this._onCloseGraphMonitor.bind(this));

            const btnCenter = this.element.querySelector("#btnCenterGraph");
            if (btnCenter) btnCenter.addEventListener("click", (e) => {
                e.preventDefault();
                this.zoomToFit(true);
                game.socket.emit("module.fang", { action: "centerGraph" });
            });

            const cbAllowPlayerEdit = this.element.querySelector("#cbAllowPlayerEdit");
            if (cbAllowPlayerEdit) {
                cbAllowPlayerEdit.checked = game.settings.get("fang", "allowPlayerEditing");
                cbAllowPlayerEdit.addEventListener("change", async (e) => {
                    await game.settings.set("fang", "allowPlayerEditing", e.target.checked);
                    ui.notifications.info(game.i18n.localize(e.target.checked ? "FANG.Messages.PlayersCanEdit" : "FANG.Messages.PlayersCannotEdit"));
                });
            }

            const cbDefaultHidden = this.element.querySelector("#cbDefaultHidden");
            if (cbDefaultHidden) {
                cbDefaultHidden.checked = game.settings.get("fang", "defaultHiddenMode");
                cbDefaultHidden.addEventListener("change", async (e) => {
                    await game.settings.set("fang", "defaultHiddenMode", e.target.checked);
                });
            }

            const cbSyncCamera = this.element.querySelector("#cbSyncCamera");
            if (cbSyncCamera) {
                cbSyncCamera.checked = this._isSyncCameraActive;
                cbSyncCamera.addEventListener("change", (e) => {
                    this._isSyncCameraActive = e.target.checked;
                    ui.notifications.info(game.i18n.localize(this._isSyncCameraActive ? "FANG.Messages.SpectatorEnabled" : "FANG.Messages.SpectatorDisabled"));
                    const indicator = this.element.querySelector("#spectator-active-indicator");
                    if (indicator) indicator.classList.toggle("active", this._isSyncCameraActive);
                });
            }

            // Physics & Simulation Controls
            const cbCosmic = this.element.querySelector("#cbEnableCosmicWind");
            const rngCosmic = this.element.querySelector("#rngCosmicWindStrength");
            const valCosmic = this.element.querySelector("#wind-strength-val");

            if (cbCosmic && rngCosmic) {
                cbCosmic.checked = game.settings.get("fang", "enableCosmicWind");
                rngCosmic.value = game.settings.get("fang", "cosmicWindStrength");
                if (valCosmic) valCosmic.innerText = rngCosmic.value;

                cbCosmic.addEventListener("change", (ev) => {
                    game.settings.set("fang", "enableCosmicWind", ev.target.checked);
                });

                rngCosmic.addEventListener("input", (ev) => {
                    const val = ev.target.value;
                    if (valCosmic) valCosmic.innerText = val;
                });

                rngCosmic.addEventListener("change", (ev) => {
                    game.settings.set("fang", "cosmicWindStrength", parseFloat(ev.target.value));
                });
            }

            // Background Configuration
            const btnOpenBgConfig = this.element.querySelector("#btnOpenBackgroundConfig");
            if (btnOpenBgConfig) {
                btnOpenBgConfig.addEventListener("click", () => {
                    new FangBackgroundConfig(this).render({ force: true });
                });
            }
        } else {
            setTimeout(() => this.resizeCanvas(), 50);
        }

        // Apply background initially for all users
        this._applyBackground();

        // Spotlight Overlay Close
        const spotlightCloses = this.element.querySelectorAll(".narrative-close");
        spotlightCloses.forEach(btn => {
            btn.addEventListener("click", () => this.stopSpotlight());
        });
    }

    _applyVisualTheme(themeVariant = null) {
        const container = this.element?.querySelector?.(".fang-app-container");
        if (!container) return;
        const selectedTheme = themeVariant ?? game.settings.get("fang", "themeVariant");
        const normalizedTheme = (selectedTheme === "cyberpunk" || selectedTheme === true) ? "cyberpunk" : "fantasy";
        container.classList.toggle("fang-theme-cyberpunk", normalizedTheme === "cyberpunk");
        container.dataset.fangTheme = normalizedTheme;
    }

    _onClose(options) {
        this._releaseMyLock();
        document.body.classList.remove("fang-monitor");
        if (this._resizeObserver) this._resizeObserver.disconnect();
        if (this._monitorStyleObserver) this._monitorStyleObserver.disconnect();

        // Restore Foundry UI containers if we hid them
        ["#ui-bottom", "#hotbar", "#players", "#ui-top", "#ui-left", "#ui-right", "#navigation", "#controls", "#sidebar"].forEach(sel => {
            const el = document.querySelector(sel);
            if (el) el.style.removeProperty("display");
        });
        document.body.style.removeProperty("padding");
        document.body.style.removeProperty("margin");
        document.body.style.removeProperty("overflow");

        super._onClose(options);
    }

    setPosition(position = {}) {
        if (game.user.name.toLowerCase().includes("monitor")) {
            // Force absolute fullscreen for Monitor to avoid Foundry UI offsets
            return this;
        }
        return super.setPosition(position);
    }

    /** Override _updatePosition to prevent Foundry from constraining window dimensions for Monitor */
    _updatePosition(position) {
        if (game.user.name.toLowerCase().includes("monitor")) {
            // Do NOT let Foundry constrain the window - we handle positioning ourselves
            return;
        }
        return super._updatePosition(position);
    }

    /** Apply fullscreen styles to the monitor element. Called from _onRender and the MutationObserver. */
    _applyMonitorFullscreenStyles() {
        const el = this.element;
        if (!el) return;
        el.style.setProperty("display", "flex", "important");
        el.style.setProperty("visibility", "visible", "important");
        el.style.setProperty("opacity", "1", "important");
        el.style.setProperty("position", "fixed", "important");
        el.style.setProperty("top", "0", "important");
        el.style.setProperty("bottom", "0", "important");
        el.style.setProperty("left", "0", "important");
        el.style.setProperty("right", "0", "important");
        el.style.setProperty("width", "100vw", "important");
        el.style.setProperty("height", "100vh", "important");
        el.style.setProperty("max-height", "none", "important");
        el.style.setProperty("max-width", "none", "important");
        el.style.setProperty("min-height", "100vh", "important");
        el.style.setProperty("min-width", "100vw", "important");
        el.style.setProperty("z-index", "200000", "important");
        el.style.setProperty("margin", "0", "important");
        el.style.setProperty("padding", "0", "important");
        el.style.setProperty("inset", "0", "important");
    }

    async #loadD3() {
        return new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "https://d3js.org/d3.v7.min.js";
            script.onload = () => resolve();
            script.onerror = () => reject(new Error("Failed to load D3.js"));
            document.head.appendChild(script);
        });
    }

    // --- Data Management ---

    async getJournalEntry() {
        let entry = game.journal.getName("FANG Graph");
        if (!entry) {
            if (game.user.isGM) {
                // 1. Ensure the dedicated folder exists
                const folderName = game.i18n.localize("FANG.Journal.FolderName") || "FANG - Do Not Delete";
                let folder = game.folders.find(f => f.name === folderName && f.type === "JournalEntry");

                if (!folder) {
                    folder = await Folder.create({
                        name: folderName,
                        type: "JournalEntry",
                        color: "#8b0000" // Dark red logic
                    });
                }

                // 2. Create the FANG Graph Journal inside the folder
                entry = await JournalEntry.create({
                    name: "FANG Graph",
                    folder: folder ? folder.id : null,
                    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER }
                });

                // 3. Create the initial Warning / Info Page
                await JournalEntryPage.create({
                    name: game.i18n.localize("FANG.Journal.Title") || "About FANG",
                    type: "text",
                    text: {
                        content: `
                        <div style="background: rgba(139, 0, 0, 0.1); border: 2px solid #8b0000; padding: 10px; text-align: center; margin-bottom: 20px; border-radius: 5px;">
                            <h2 style="color: #8b0000; margin-top: 0;"><i class="fas fa-exclamation-triangle"></i> ${game.i18n.localize("FANG.Journal.WarningTitle")} <i class="fas fa-exclamation-triangle"></i></h2>
                            <p><strong>${game.i18n.localize("FANG.Journal.WarningText")}</strong></p>
                        </div>
                        <h2 style="border-bottom: 2px solid var(--fang-accent-gold); padding-bottom: 5px;">${game.i18n.localize("FANG.Journal.Header")}</h2>
                        <p>${game.i18n.localize("FANG.Journal.Desc1")}</p>
                        <p><strong>${game.i18n.localize("FANG.Journal.Desc2")}</strong></p>
                        <hr>
                        <div style="text-align: center; margin-top: 20px;">
                            <a class="content-link fang-open-btn" style="cursor: pointer; font-size: 1.2em; padding: 10px; background: #8b0000; color: white; border: 1px solid #d4af37; border-radius: 5px; display: inline-block; min-width: 250px;">
                                <i class="fas fa-project-diagram"></i> ${game.i18n.localize("FANG.Journal.OpenBtn")}
                            </a>
                        </div>
                        `
                    }
                }, { parent: entry });

                ui.notifications.info(game.i18n.localize("FANG.Messages.JournalInitSuccess"));
            } else {
                ui.notifications.warn(game.i18n.localize("FANG.Messages.JournalMissing"));
                return null;
            }
        }
        return entry;
    }

    async loadData() {
        const entry = await this.getJournalEntry();
        if (entry) {
            const data = entry.getFlag("fang", "graphData");
            if (data) {
                this.graphData = foundry.utils.duplicate(data);

                // --- Migration Logic ---
                // Rename 'groups' array to 'factions'
                if (this.graphData.groups && !this.graphData.factions) {
                    this.graphData.factions = this.graphData.groups;
                    delete this.graphData.groups;
                }

                if (!this.graphData.factions) this.graphData.factions = [];

                // Convert 'groupIds' array or 'groupId' string to 'factionId' string
                this.graphData.nodes.forEach(node => {
                    if (node.groupIds && Array.isArray(node.groupIds) && !node.factionId) {
                        node.factionId = node.groupIds[0] || null;
                        delete node.groupIds;
                    } else if (node.groupId && !node.factionId) {
                        node.factionId = node.groupId;
                        delete node.groupId;
                    }
                });

                // Ensure factions have X/Y positions for drawing hubs
                this.graphData.factions.forEach(f => {
                    if (f.x === undefined || f.y === undefined) {
                        f.x = (this.width || 800) / 2 + (Math.random() - 0.5) * 150;
                        f.y = (this.height || 600) / 2 + (Math.random() - 0.5) * 150;
                    }
                });

                // Migration: Identity & Conditions fields
                this.graphData.nodes.forEach(node => {
                    if (!node.originalName) node.originalName = node.name;
                    if (node.actorId === undefined) node.actorId = game.actors.get(node.id) ? node.id : null;
                    if (node.isPlaceholder === undefined) node.isPlaceholder = !node.actorId;
                    if (node.placeholderType === undefined) node.placeholderType = node.isPlaceholder ? "legacy" : null;
                    if (node.img === undefined || node.img === null) node.img = null;
                    node.img = normalizeLegacyPlaceholderImagePath(node.img);
                    if (node.hidden === undefined) node.hidden = false;
                    if (!node.displayName) node.displayName = "";
                    if (!node.conditions) node.conditions = [];
                    // Migration: Journal linking fields
                    if (node.playerLorePageId === undefined) node.playerLorePageId = null;
                    if (node.journalUuid === undefined) node.journalUuid = null;
                    // Migration: questUuid (single) -> questUuids (array)
                    if (node.questUuid !== undefined && !node.questUuids) {
                        node.questUuids = node.questUuid ? [{ uuid: node.questUuid, name: node._questJournalName || "Quest Journal" }] : [];
                        delete node.questUuid;
                        delete node._questJournalName;
                    }
                    if (!node.questUuids) node.questUuids = [];
                });

                if (this.graphData.showFactionLines === undefined) {
                    this.graphData.showFactionLines = true;
                }
                if (this.graphData.showFactionLegend === undefined) {
                    this.graphData.showFactionLegend = true;
                }
            } else {
                this.graphData = { nodes: [], links: [], factions: [] };
            }
        } else {
            this.graphData = { nodes: [], links: [], factions: [] };
        }

        if (!this.graphData.factions) this.graphData.factions = [];
        await this._syncDiploGlassFactions({ saveIfChanged: true, triggerSync: true });
    }

    _getDiploGlassMetaFromFaction(sourceFaction) {
        return {
            journalId: sourceFaction?.journalId ?? null,
            rollTableId: sourceFaction?.rollTableId ?? null,
            steps: Number.isFinite(sourceFaction?.steps) ? Number(sourceFaction.steps) : null,
            usePerPlayerReputation: typeof sourceFaction?.usePerPlayerReputation === "boolean"
                ? sourceFaction.usePerPlayerReputation
                : null
        };
    }

    _getDiploGlassColor(seed) {
        const str = String(seed ?? "");
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        const colorInt = (Math.abs(hash * 2654435761) % 0xFFFFFF) || 0x8b5e3c;
        return `#${colorInt.toString(16).padStart(6, "0")}`;
    }

    async _syncDiploGlassFactions({ saveIfChanged = true, triggerSync = true } = {}) {
        if (!game.user.isGM) return false;
        if (!game.settings.get("fang", "diploglassOneWaySync")) return false;
        if (!game.modules.get("diploglass")?.active) return false;

        let rawFactions;
        let playerReputations;
        let globalPerPlayerMode = true;
        try {
            rawFactions = game.settings.get("diploglass", "factions") || {};
            playerReputations = game.settings.get("diploglass", "playerReputations") || {};
            globalPerPlayerMode = !!game.settings.get("diploglass", "usePerPlayerReputation");
        } catch (err) {
            console.warn("FANG | Could not read DiploGlass factions for sync", err);
            return false;
        }

        const sourceFactions = Object.values(rawFactions).filter((f) => {
            if (!f || typeof f !== "object") return false;
            if (!f.id) return false;
            return typeof f.name === "string" && f.name.trim().length > 0;
        });

        const existingFactions = Array.isArray(this.graphData.factions) ? this.graphData.factions : [];
        let nextFactions = [...existingFactions];
        const factionById = new Map(nextFactions.map((f) => [f.id, f]));
        const importedByExternalId = new Map(
            nextFactions
                .filter((f) => f?.externalSource?.module === "diploglass" && f?.externalSource?.id != null)
                .map((f) => [String(f.externalSource.id), f])
        );
        const seenExternalIds = new Set();
        let changed = false;

        for (const source of sourceFactions) {
            const externalId = String(source.id);
            const sourceName = String(source.name).trim();
            const sourceIcon = source.icon || null;
            const nextMeta = this._getDiploGlassMetaFromFaction(source);
            seenExternalIds.add(externalId);

            const existing = importedByExternalId.get(externalId);
            if (existing) {
                if (existing.name !== sourceName) {
                    existing.name = sourceName;
                    changed = true;
                }
                if ((existing.icon || null) !== sourceIcon) {
                    existing.icon = sourceIcon;
                    changed = true;
                }
                if (!existing.color) {
                    existing.color = this._getDiploGlassColor(externalId);
                    changed = true;
                }
                if (existing.x === undefined || existing.y === undefined) {
                    existing.x = (this.width || 800) / 2 + (Math.random() - 0.5) * 150;
                    existing.y = (this.height || 600) / 2 + (Math.random() - 0.5) * 150;
                    changed = true;
                }

                const prevSource = existing.externalSource || null;
                const nextSource = { module: "diploglass", id: externalId };
                if (JSON.stringify(prevSource) !== JSON.stringify(nextSource)) {
                    existing.externalSource = nextSource;
                    changed = true;
                }

                const prevMeta = existing.externalMeta || null;
                if (JSON.stringify(prevMeta) !== JSON.stringify(nextMeta)) {
                    existing.externalMeta = nextMeta;
                    changed = true;
                }
            } else {
                const newFaction = {
                    id: foundry.utils.randomID(),
                    name: sourceName,
                    icon: sourceIcon,
                    color: this._getDiploGlassColor(externalId),
                    x: (this.width || 800) / 2 + (Math.random() - 0.5) * 150,
                    y: (this.height || 600) / 2 + (Math.random() - 0.5) * 150,
                    externalSource: { module: "diploglass", id: externalId },
                    externalMeta: nextMeta
                };
                nextFactions.push(newFaction);
                factionById.set(newFaction.id, newFaction);
                changed = true;
            }
        }

        const staleImportedFactionIds = new Set(
            nextFactions
                .filter((f) => f?.externalSource?.module === "diploglass")
                .filter((f) => !seenExternalIds.has(String(f.externalSource.id)))
                .map((f) => f.id)
        );

        if (staleImportedFactionIds.size > 0) {
            const before = nextFactions.length;
            nextFactions = nextFactions.filter((f) => !staleImportedFactionIds.has(f.id));
            if (nextFactions.length !== before) changed = true;
            factionById.clear();
            nextFactions.forEach((f) => factionById.set(f.id, f));

            for (const node of (this.graphData.nodes || [])) {
                if (node.factionId && staleImportedFactionIds.has(node.factionId)) {
                    node.factionId = null;
                    changed = true;
                }
            }
        }

        // Optional actor/token assignment from DiploGlass per-character reputation:
        // choose the faction with the highest positive reputation value.
        const assignmentMinValue = 1;
        const diploExternalToFangId = new Map(
            nextFactions
                .filter((f) => f?.externalSource?.module === "diploglass" && f?.externalSource?.id != null)
                .filter((f) => {
                    const sourceFaction = rawFactions?.[String(f.externalSource.id)];
                    const usePerPlayer = (typeof sourceFaction?.usePerPlayerReputation === "boolean")
                        ? sourceFaction.usePerPlayerReputation
                        : globalPerPlayerMode;
                    return !!usePerPlayer;
                })
                .map((f) => [String(f.externalSource.id), f.id])
        );

        for (const node of (this.graphData.nodes || [])) {
            if (!node?.actorId || node?.isPlaceholder) continue;
            const actor = game.actors?.get?.(node.actorId) ?? null;

            const repBuckets = [];
            const directActorRep = playerReputations?.[node.actorId];
            if (directActorRep && typeof directActorRep === "object") {
                repBuckets.push(directActorRep);
            }

            if (actor?.ownership && typeof actor.ownership === "object") {
                for (const [ownerId, level] of Object.entries(actor.ownership)) {
                    if (Number(level) < 3) continue;
                    const ownerRep = playerReputations?.[ownerId];
                    if (ownerRep && typeof ownerRep === "object") {
                        repBuckets.push(ownerRep);
                    }
                }
            }

            const bestByExternalId = new Map();
            for (const bucket of repBuckets) {
                for (const [externalIdRaw, valueRaw] of Object.entries(bucket)) {
                    const externalId = String(externalIdRaw);
                    if (!diploExternalToFangId.has(externalId)) continue;
                    const value = Number(valueRaw);
                    if (!Number.isFinite(value)) continue;
                    const prev = bestByExternalId.get(externalId);
                    if (prev === undefined || value > prev) {
                        bestByExternalId.set(externalId, value);
                    }
                }
            }

            let bestExternalId = null;
            let bestValue = -Infinity;
            for (const [externalId, value] of bestByExternalId.entries()) {
                if (value > bestValue) {
                    bestValue = value;
                    bestExternalId = externalId;
                }
            }

            const nextFactionId = (bestExternalId && bestValue >= assignmentMinValue)
                ? diploExternalToFangId.get(bestExternalId)
                : null;
            const currentFaction = node.factionId ? factionById.get(node.factionId) : null;
            const currentIsDiploFaction = currentFaction?.externalSource?.module === "diploglass";

            if (nextFactionId) {
                if (node.factionId !== nextFactionId) {
                    node.factionId = nextFactionId;
                    changed = true;
                }
            } else if (currentIsDiploFaction && node.factionId) {
                node.factionId = null;
                changed = true;
            }
        }

        if (!changed) return false;

        this.graphData.factions = nextFactions;
        if (saveIfChanged) {
            await this.saveData(triggerSync);
        }
        return true;
    }

    async saveData(triggerSync = true) {
        const entry = await this.getJournalEntry();

        // Prepare the exportable state
        const exportData = {
            nodes: this.graphData.nodes.map(n => ({
                id: n.id,
                actorId: n.actorId || null,
                isPlaceholder: !!n.isPlaceholder,
                placeholderType: n.placeholderType || null,
                img: n.img || null,
                name: n.name,
                originalName: n.originalName || n.name,
                role: n.role,
                factionId: n.factionId || null,
                x: n.x,
                y: n.y,
                vx: n.vx,
                vy: n.vy,
                isCenter: n.isCenter || false,
                lore: n.lore || "",
                playerLorePageId: n.playerLorePageId || null,
                journalUuid: n.journalUuid || null,
                questUuids: (n.questUuids || []).map(q => ({ uuid: q.uuid, name: q.name })),
                hidden: n.hidden || false,
                displayName: n.displayName || "",
                conditions: n.conditions || []
            })),
            links: this.graphData.links.map(l => ({
                source: typeof l.source === 'object' ? l.source.id : l.source,
                target: typeof l.target === 'object' ? l.target.id : l.target,
                label: l.label,
                info: l.info || "",
                directional: l.directional || false
            })),
            factions: this.graphData.factions.map(f => ({
                id: f.id,
                name: f.name,
                icon: f.icon,
                color: f.color,
                x: f.x,
                y: f.y,
                externalSource: f.externalSource ? foundry.utils.duplicate(f.externalSource) : null,
                externalMeta: f.externalMeta ? foundry.utils.duplicate(f.externalMeta) : null
            })),
            showFactionLines: this.graphData.showFactionLines !== false,
            showFactionLegend: this.graphData.showFactionLegend !== false
        };

        if (entry && entry.isOwner) {
            await entry.setFlag("fang", "graphData", exportData);

            // If GM is saving, optionally force all players to sync to this new baseline
            if (triggerSync && game.user.isGM) {
                game.socket.emit("module.fang", { action: "refreshGraph" });
            }
        } else {
            // Player Collaborative Edit Relay
            const allowPlayerEdit = game.settings.get("fang", "allowPlayerEditing");
            if (allowPlayerEdit) {
                const isGMOnline = game.users.some(u => u.isGM && u.active);
                if (isGMOnline) {
                    console.log("FANG | Sending edit request to GM via socket.");
                    game.socket.emit("module.fang", {
                        action: "playerEditGraph",
                        payload: { newGraphData: exportData }
                    });
                } else {
                    ui.notifications.warn(game.i18n.localize("FANG.Messages.WarnNoGMOnline"));
                }
            } else {
                ui.notifications.warn(game.i18n.localize("FANG.Messages.SaveNoPermission"));
            }
        }
    }

    // --- BACKGROUND LOGIC ---

    /**
     * Updates the visibility of background sub-sections based on selected mode.
     */
    _updateBackgroundUI() {
        if (!this.element) return;
        const mode = game.settings.get("fang", "canvasBackgroundMode");

        const sections = {
            palette: this.element.querySelector("#bgPaletteSection"),
            image: this.element.querySelector("#bgImageSection"),
            preset: this.element.querySelector("#bgPresetSection")
        };

        Object.keys(sections).forEach(k => {
            if (sections[k]) sections[k].classList.toggle("hidden", k !== mode);
        });

        // Highlight active color patch if in palette mode
        if (mode === "palette") {
            const currentColor = game.settings.get("fang", "canvasBackgroundColor");
            const patches = this.element.querySelectorAll(".color-patch");
            patches.forEach(p => p.classList.toggle("active", p.dataset.color === currentColor));
        }
    }

    /**
     * Applies the background style to the #fang-bg-layer element.
     */
    _applyBackground() {
        if (!this.element) return;
        const layer = this.element.querySelector("#fang-bg-layer");
        if (!layer) return;

        const mode = game.settings.get("fang", "canvasBackgroundMode");

        // --- Startup Stabilization ---
        // If this is the very first apply (or within the first 500ms of render),
        // we skip the transition to prevent the jarring zoom/blur effect.
        const isStartup = !this._bgInitialized;
        if (isStartup) {
            layer.classList.add("no-transition");
            this._bgInitialized = true;
            setTimeout(() => {
                if (layer) layer.classList.remove("no-transition");
            }, 500);
        }

        // Reset
        layer.style.backgroundColor = "";
        layer.style.backgroundImage = "";
        layer.style.filter = "";
        layer.style.transform = "";
        layer.style.opacity = "";
        // Keep no-transition if it was just added above
        const hasNoTrans = layer.classList.contains("no-transition");
        layer.className = hasNoTrans ? "no-transition" : "";

        if (mode === "palette") {
            const color = game.settings.get("fang", "canvasBackgroundColor");
            layer.style.backgroundColor = color;
        } else if (mode === "image") {
            const path = game.settings.get("fang", "canvasBackgroundImage");
            const blur = game.settings.get("fang", "canvasBackgroundBlur");
            const opacity = game.settings.get("fang", "canvasBackgroundOpacity");

            const applyImageStyles = () => {
                if (path) {
                    layer.style.backgroundImage = `url("${path}")`;
                    layer.style.backgroundSize = "cover";
                    layer.style.backgroundPosition = "center";
                    layer.style.backgroundRepeat = "no-repeat";
                    // Constant scale: no visible zoom when blur changes; also hides blur edge artifacts.
                    layer.style.transform = "scale(1.08)";
                }
                layer.style.filter = blur > 0 ? `blur(${blur}px)` : "";
                layer.style.opacity = `${opacity}`;
            };

            if (!path) {
                applyImageStyles();
                return;
            }

            const isLoaded = this._bgImageLoaded.get(path) === true;
            if (isLoaded) {
                applyImageStyles();
                return;
            }

            // Avoid a "sharp first, blurred later" flash while the image decodes:
            // keep the layer hidden until the image is ready, then apply blur immediately.
            layer.classList.add("no-transition");
            layer.style.opacity = "0";
            layer.style.backgroundImage = `url("${path}")`;
            layer.style.backgroundSize = "cover";
            layer.style.backgroundPosition = "center";
            layer.style.backgroundRepeat = "no-repeat";
            layer.style.transform = "scale(1.08)";
            layer.style.filter = blur > 0 ? `blur(${blur}px)` : "";

            const img = new Image();
            img.onload = () => {
                this._bgImageLoaded.set(path, true);
                applyImageStyles();
                // Let the browser commit filter/paint first, then show.
                requestAnimationFrame(() => {
                    layer.style.opacity = `${opacity}`;
                    setTimeout(() => layer.classList.remove("no-transition"), 60);
                });
            };
            img.onerror = () => {
                this._bgImageLoaded.set(path, false);
                // Fallback: show whatever we can.
                applyImageStyles();
                setTimeout(() => layer.classList.remove("no-transition"), 60);
            };
            img.src = path;
        } else if (mode === "preset") {
            const preset = game.settings.get("fang", "canvasBackgroundPreset");
            layer.classList.add(`fang-bg-preset-${preset}`);
        } else {
            // Default: no styles applied (shows the CSS-defined default parchment)
        }
    }

    // --- UI Interactivity ---

    _normalizeSearchText(value) {
        return String(value ?? "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
    }

    _getNodeActor(node) {
        if (!node) return null;
        if (node.actorId) return game.actors.get(node.actorId) || null;
        return game.actors.get(node.id) || null;
    }

    _getNodeImageSource(node) {
        const actor = this._getNodeActor(node);
        const normalizedNodeImg = normalizeLegacyPlaceholderImagePath(node?.img);
        if (node?.isPlaceholder) {
            return normalizedNodeImg || FANG_DEFAULT_PLACEHOLDER_IMG;
        }
        return normalizedNodeImg || actor?.prototypeToken?.texture?.src || actor?.img || "icons/svg/mystery-man.svg";
    }

    _buildPlaceholderNode({
        name,
        role = null,
        factionId = null,
        img = FANG_DEFAULT_PLACEHOLDER_IMG,
        placeholderType = "custom",
        x,
        y
    }) {
        return {
            id: `ph-${foundry.utils.randomID()}`,
            actorId: null,
            isPlaceholder: true,
            placeholderType,
            img,
            name,
            originalName: name,
            role,
            factionId,
            x,
            y,
            hidden: game.settings.get("fang", "defaultHiddenMode"),
            displayName: "",
            conditions: [],
            playerLorePageId: null,
            journalUuid: null,
            questUuids: []
        };
    }

    async _onAddPlaceholder() {
        if (!this._canEditGraph()) return;
        if (!game.user.isGM) return;

        const factions = this.graphData.factions || [];
        const factionOptions = [`<option value="">-- None --</option>`]
            .concat(factions.map(f => `<option value="${f.id}">${f.name}</option>`))
            .join("");
        const defaultName = game.i18n.localize("FANG.Placeholder.DefaultName") || "Unknown Contact";

        new Dialog({
            title: game.i18n.localize("FANG.Placeholder.CreateTitle") || "Create Placeholder NPC",
            content: `
                <div class="form-group">
                    <label>${game.i18n.localize("FANG.Placeholder.Name") || "Display Name"}:</label>
                    <div class="form-fields">
                        <input type="text" id="fang-placeholder-name" value="${defaultName}" style="width: 100%;">
                    </div>
                </div>
                <div class="form-group">
                    <label>${game.i18n.localize("FANG.Dialogs.RoleInput") || "Role"}:</label>
                    <div class="form-fields">
                        <input type="text" id="fang-placeholder-role" value="" style="width: 100%;">
                    </div>
                </div>
                <div class="form-group">
                    <label>${game.i18n.localize("FANG.Dialogs.FactionInput") || "Faction"}:</label>
                    <div class="form-fields">
                        <select id="fang-placeholder-faction" style="width: 100%;">${factionOptions}</select>
                    </div>
                </div>
            `,
            buttons: {
                create: {
                    icon: '<i class="fas fa-user-secret"></i>',
                    label: game.i18n.localize("FANG.Placeholder.CreateBtn") || "Create",
                    callback: async (html) => {
                        const name = html.find("#fang-placeholder-name").val().trim() || (game.i18n.localize("FANG.Placeholder.DefaultName") || "Unknown Contact");
                        const roleVal = html.find("#fang-placeholder-role").val().trim();
                        const role = roleVal || null;
                        const factionIdVal = html.find("#fang-placeholder-faction").val();
                        const factionId = factionIdVal || null;

                        const x = this.transform ? this.transform.invertX(this.width / 2) : (this.width / 2);
                        const y = this.transform ? this.transform.invertY(this.height / 2) : (this.height / 2);
                        const node = this._buildPlaceholderNode({
                            name,
                            role,
                            factionId,
                            img: FANG_DEFAULT_PLACEHOLDER_IMG,
                            placeholderType: "default",
                            x: x + (Math.random() - 0.5) * 20,
                            y: y + (Math.random() - 0.5) * 20
                        });

                        this.graphData.nodes.push(node);
                        this.initSimulation();
                        this.simulation.alpha(0.5).restart();
                        this._populateActors();
                        await this.saveData();
                    }
                },
                cancel: { icon: '<i class="fas fa-times"></i>', label: game.i18n.localize("FANG.Dialogs.BtnCancel") || "Cancel" }
            },
            default: "create"
        }, { classes: ["dialog", "fang-dialog"], width: 420 }).render(true);
    }

    async _applyActorToPlaceholder(node, actor, { keepName = false, keepRole = true, keepAlias = true } = {}) {
        node.actorId = actor.id;
        node.isPlaceholder = false;
        node.placeholderType = null;
        node.originalName = actor.name;
        node.img = actor.prototypeToken?.texture?.src || actor.img || node.img;
        // Force token portrait refresh; otherwise cached placeholder image can survive replacement.
        node.imgElement = null;
        if (!keepName) {
            node.name = actor.name;
            if (!keepAlias) node.displayName = "";
        }
        if (!keepRole) {
            node.role = null;
            node.factionId = null;
        }
        this.initSimulation();
        this.simulation.alpha(0.25).restart();
        this._populateActors();
        await this.saveData();
    }

    async _onReplacePlaceholder(node) {
        if (!game.user.isGM) return;
        if (!node?.isPlaceholder) return;
        if (!this._canEditGraph()) return;

        const usedActorIds = new Set(this.graphData.nodes.filter(n => n.id !== node.id).map(n => n.actorId || n.id));
        const actorOptions = game.actors.contents
            .filter(a => !usedActorIds.has(a.id))
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(a => `<option value="${a.id}">${a.name}</option>`)
            .join("");

        if (!actorOptions) {
            ui.notifications.warn(game.i18n.localize("FANG.Placeholder.NoActorAvailable") || "No actor available for replacement.");
            return;
        }

        new Dialog({
            title: game.i18n.localize("FANG.Placeholder.ReplaceTitle") || "Replace Placeholder",
            content: `
                <p>${(game.i18n.localize("FANG.Placeholder.ReplaceHint") || "Select an actor to replace <strong>{name}</strong>.").replace("{name}", node.name)}</p>
                <div class="form-group">
                    <label>${game.i18n.localize("FANG.Placeholder.SelectActor") || "Actor"}:</label>
                    <div class="form-fields">
                        <select id="fang-replace-placeholder-actor" style="width: 100%;">${actorOptions}</select>
                    </div>
                </div>
                <div class="form-group">
                    <label style="display:flex;align-items:center;gap:8px;">
                        <input type="checkbox" id="fang-replace-keep-name" checked style="width:auto;margin:0;">
                        <span>${game.i18n.localize("FANG.Placeholder.KeepAlias") || "Keep current display name"}</span>
                    </label>
                </div>
                <div class="form-group">
                    <label style="display:flex;align-items:center;gap:8px;">
                        <input type="checkbox" id="fang-replace-keep-role" checked style="width:auto;margin:0;">
                        <span>${game.i18n.localize("FANG.Placeholder.KeepRoleFaction") || "Keep role and faction"}</span>
                    </label>
                </div>
            `,
            buttons: {
                replace: {
                    icon: '<i class="fas fa-random"></i>',
                    label: game.i18n.localize("FANG.Placeholder.ReplaceBtn") || "Replace",
                    callback: async (html) => {
                        const actorId = html.find("#fang-replace-placeholder-actor").val();
                        const actor = game.actors.get(actorId);
                        if (!actor) return;

                        const keepName = html.find("#fang-replace-keep-name").is(":checked");
                        const keepRole = html.find("#fang-replace-keep-role").is(":checked");
                        await this._applyActorToPlaceholder(node, actor, { keepName, keepRole, keepAlias: true });
                    }
                },
                cancel: { icon: '<i class="fas fa-times"></i>', label: game.i18n.localize("FANG.Dialogs.BtnCancel") || "Cancel" }
            },
            default: "replace"
        }, { classes: ["dialog", "fang-dialog"], width: 440 }).render(true);
    }

    _setSearchUiVisible(visible, { focus = false } = {}) {
        this._searchUiVisible = !!visible;
        const panel = this.element?.querySelector("#fang-search-floating");
        if (panel) panel.classList.toggle("hidden", !this._searchUiVisible);
        if (focus && this._searchUiVisible) {
            setTimeout(() => this.element?.querySelector("#fangSearchInput")?.focus(), 0);
        }
    }

    _clearSearchState() {
        this._searchQuery = "";
        this._searchIsolate = false;
        const searchInput = this.element?.querySelector("#fangSearchInput");
        const searchIsolate = this.element?.querySelector("#fangSearchIsolate");
        if (searchInput) searchInput.value = "";
        if (searchIsolate) searchIsolate.checked = false;
        this._rebuildSearchMatches();
        this.ticked();
    }

    _rebuildSearchMatches() {
        const query = this._normalizeSearchText(this._searchQuery).trim();
        if (!query) {
            this._searchMatchedNodeIds = new Set();
            this._searchMatchedLinkIndices = new Set();
            return;
        }

        const terms = query.split(/\s+/).filter(Boolean);
        const matchAllTerms = (text) => {
            const normalized = this._normalizeSearchText(text);
            return terms.every(term => normalized.includes(term));
        };

        const factionsById = new Map((this.graphData.factions || []).map(f => [f.id, f]));

        const matchedNodes = new Set();
        const matchedLinks = new Set();

        for (const node of this.graphData.nodes) {
            const factionName = node.factionId ? factionsById.get(node.factionId)?.name || "" : "";
            const nodeText = [
                node.name,
                node.originalName,
                node.displayName,
                node.role,
                factionName
            ].join(" ");
            if (matchAllTerms(nodeText)) matchedNodes.add(node.id);
        }

        this.graphData.links.forEach((link, index) => {
            const linkText = [link.label, link.info].join(" ");
            if (!matchAllTerms(linkText)) return;
            matchedLinks.add(index);
        });

        this._searchMatchedNodeIds = matchedNodes;
        this._searchMatchedLinkIndices = matchedLinks;
    }

    _populateActors() {
        // Populate Source/Target from game.actors
        const selectSource = this.element.querySelector("#sourceSelect");
        const selectTarget = this.element.querySelector("#targetSelect");

        if (selectSource && selectTarget) {
            selectSource.innerHTML = `<option value="" disabled selected>${game.i18n.localize("FANG.UI.SelectSource")}</option>`;
            selectTarget.innerHTML = `<option value="" disabled selected>${game.i18n.localize("FANG.UI.SelectTarget")}</option>`;

            // Partition actors into groups
            const canvasActorIds = new Set(this.graphData.nodes.map(n => n.actorId || n.id));
            const otherActors = [];

            game.actors.contents.forEach(actor => {
                if (canvasActorIds.has(actor.id)) return;
                // Spoiling Protection: Only GMs see ALL other actors.
                // Players only see actors they have at least Observer permission for.
                if (game.user.isGM || actor.testUserPermission(game.user, "OBSERVER")) {
                    otherActors.push(actor);
                }
            });

            const sortByString = (a, b) => a.name.localeCompare(b.name);
            otherActors.sort(sortByString);

            // Populate Helper
            const appendOptGroup = (selectElem, label, actors) => {
                if (actors.length === 0) return;
                const optgroup = document.createElement("optgroup");
                optgroup.label = label;
                actors.forEach(actor => {
                    let opt = document.createElement("option");
                    opt.value = actor.id;
                    opt.textContent = actor.name;
                    optgroup.appendChild(opt);
                });
                selectElem.appendChild(optgroup);
            };

            const appendCanvasNodeGroup = (selectElem) => {
                const optgroup = document.createElement("optgroup");
                optgroup.label = game.i18n.localize("FANG.Dropdowns.GroupCanvas");
                let hasEntries = false;
                const sortedNodes = [...this.graphData.nodes].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
                const isPlayerView = !game.user.isGM;
                sortedNodes.forEach(node => {
                    const shownName = (isPlayerView && node.hidden)
                        ? (node.displayName || game.i18n.localize("FANG.Dropdowns.Unknown"))
                        : (node.name || game.i18n.localize("FANG.Dropdowns.Unknown"));
                    const actor = this._getNodeActor(node);
                    const suffix = game.user.isGM
                        ? (node.isPlaceholder ? ` (${game.i18n.localize("FANG.Placeholder.Tag") || "Placeholder"})` : (actor ? "" : " (?)"))
                        : "";
                    const opt = document.createElement("option");
                    opt.value = node.id;
                    opt.textContent = `${shownName}${suffix}`;
                    optgroup.appendChild(opt);
                    hasEntries = true;
                });
                if (hasEntries) selectElem.appendChild(optgroup);
            };

            const lblDirectory = game.i18n.localize("FANG.Dropdowns.GroupDirectory");

            appendCanvasNodeGroup(selectSource);
            appendOptGroup(selectSource, lblDirectory, otherActors);

            appendCanvasNodeGroup(selectTarget);
            appendOptGroup(selectTarget, lblDirectory, otherActors);
        }
        // Populate Delete Dropdown from current graph data
        const selectDelete = this.element.querySelector("#deleteSelect");
        if (selectDelete) {
            selectDelete.innerHTML = `<option value="" disabled selected>${game.i18n.localize("FANG.UI.SelectElement")}</option>`;

            // Add Nodes
            if (this.graphData.nodes.length > 0) {
                const optGroupN = document.createElement("optgroup");
                optGroupN.label = game.i18n.localize("FANG.Dropdowns.Nodes");
                const isPlayerView = !game.user.isGM;
                this.graphData.nodes.forEach(node => {
                    let opt = document.createElement("option");
                    opt.value = `node|${node.id}`;
                    const shownName = (isPlayerView && node.hidden)
                        ? (node.displayName || game.i18n.localize("FANG.Dropdowns.Unknown"))
                        : node.name;
                    opt.textContent = `${game.i18n.localize("FANG.Dropdowns.TokenPrefix")} ${shownName}`;
                    optGroupN.appendChild(opt);
                });
                selectDelete.appendChild(optGroupN);
            }

            if (this.graphData.links.length > 0) {
                const optGroupL = document.createElement("optgroup");
                optGroupL.label = game.i18n.localize("FANG.Dropdowns.Links");
                const isPlayerView = !game.user.isGM;
                const getNodeName = (ref) => {
                    const node = typeof ref === 'object' ? ref : this.graphData.nodes.find(n => n.id === ref);
                    if (!node) return game.i18n.localize("FANG.Dropdowns.Unknown");
                    if (isPlayerView && node.hidden) return node.displayName || game.i18n.localize("FANG.Dropdowns.Unknown");
                    return node.name || game.i18n.localize("FANG.Dropdowns.Unknown");
                };
                this.graphData.links.forEach((link, index) => {
                    let opt = document.createElement("option");
                    opt.value = `link|${index}`;
                    const sourceName = getNodeName(link.source);
                    const targetName = getNodeName(link.target);
                    opt.textContent = `${sourceName} -> ${targetName} (${link.label})`;
                    optGroupL.appendChild(opt);
                });
                selectDelete.appendChild(optGroupL);
            }
        }

        this._rebuildSearchMatches();
    }

    _canEditGraph(silent = false, allowGMOverride = false) {
        // GMs can bypass for specific functions (like sharing, spotlight, export)
        if (game.user.isGM && allowGMOverride) return true;

        // --- NEW: Strict Lock Check for Everyone ---
        const entry = game.journal.getName("FANG Graph");
        const lock = entry?.getFlag("fang", "editLock");

        if (!lock || lock.userId !== game.user.id) {
            if (!silent) ui.notifications.warn(game.i18n.localize("FANG.Messages.AlreadyEditing"));
            return false;
        }

        const allowPlayerEdit = game.settings.get("fang", "allowPlayerEditing");
        if (!game.user.isGM && !allowPlayerEdit) {
            if (!silent) ui.notifications.warn(game.i18n.localize("FANG.Messages.SaveNoPermission"));
            return false;
        }

        return true;
    }

    async _onAddLink() {
        if (!this._canEditGraph()) return;
        const sourceId = this.element.querySelector("#sourceSelect").value;
        const targetId = this.element.querySelector("#targetSelect").value;
        const label = this.element.querySelector("#linkLabel").value.trim();
        const directional = this.element.querySelector("#linkDirectional").checked;

        if (!label) {
            ui.notifications.warn(game.i18n.localize("FANG.Messages.WarningNoLabel"));
            return;
        }

        if (sourceId && targetId && sourceId !== targetId) {
            // Check if nodes exist, else create them from Actors
            [sourceId, targetId].forEach(id => {
                if (!this.graphData.nodes.find(n => n.id === id)) {
                    const actor = game.actors.get(id);
                    if (actor) {
                            this.graphData.nodes.push({
                            id: id, actorId: actor.id, isPlaceholder: false, placeholderType: null, img: actor.prototypeToken?.texture?.src || actor.img || null,
                            name: actor.name, originalName: actor.name,
                            hidden: game.settings.get("fang", "defaultHiddenMode"),
                            displayName: "", conditions: []
                        });
                    }
                }
            });

            this.graphData.links.push({ source: sourceId, target: targetId, label: label, directional: directional });
            this.element.querySelector("#linkLabel").value = "";
            this.element.querySelector("#linkDirectional").checked = false;

            this.initSimulation();
            this.simulation.alpha(0.3).restart();
            this._populateActors(); // Update delete dropdown

            await this.saveData();
        } else if (sourceId === targetId && sourceId !== "") {
            ui.notifications.warn(game.i18n.localize("FANG.Messages.WarningSelfLink"));
        } else {
            ui.notifications.warn(game.i18n.localize("FANG.Messages.WarningNoSourceTarget"));
        }
    }

    async _onDeleteElement() {
        if (!this._canEditGraph()) return;
        const selectDelete = this.element.querySelector("#deleteSelect");
        const val = selectDelete?.value;

        if (!val) {
            ui.notifications.warn(game.i18n.localize("FANG.Messages.WarningNoDeleteSelect"));
            return;
        }

        const [selectedType, selectedId] = val.split("|").map(s => s.trim());

        const deleteElement = async (type, id) => {
            if (type === "node") {
                this.graphData.nodes = this.graphData.nodes.filter(n => n.id !== id);
                this.graphData.links = this.graphData.links.filter(l => {
                    const sId = typeof l.source === 'object' ? l.source.id : l.source;
                    const tId = typeof l.target === 'object' ? l.target.id : l.target;
                    return sId !== id && tId !== id;
                });
                ui.notifications.info(game.i18n.localize("FANG.Messages.DeletedNode"));
            } else if (type === "link") {
                const lIndex = parseInt(id, 10);
                if (!Number.isNaN(lIndex)) {
                    this.graphData.links.splice(lIndex, 1);
                    ui.notifications.info(game.i18n.localize("FANG.Messages.DeletedLink"));
                }
            }

            this._toggleNodeEditor(false);
            this._toggleLinkEditor(-1);

            this.initSimulation();
            this.simulation.alpha(0.3).restart();
            this._populateActors();
            await this.saveData();
        };

        const dialogTitle = game.i18n.localize("FANG.Dialogs.DeleteConfirmTitle") || "Confirm Deletion";

        if (selectedType === "node") {
            const node = this.graphData.nodes.find(n => n.id === selectedId);
            if (!node) return;

            const dialogContent = game.i18n.localize("FANG.Dialogs.DeleteNodeContent")
                || "Are you sure you want to delete this token from the graph? Your Player Lore notes will be kept safe.";

            new Dialog({
                title: dialogTitle,
                content: `<p style="margin-bottom: 15px;">${dialogContent}</p>`,
                buttons: {
                    yes: {
                        icon: '<i class="fas fa-check"></i>',
                        label: game.i18n.localize("Yes"),
                        callback: async () => deleteElement("node", selectedId)
                    },
                    no: {
                        icon: '<i class="fas fa-times"></i>',
                        label: game.i18n.localize("No"),
                        className: "cancel"
                    }
                },
                default: "no"
            }, { classes: ["dialog", "fang-dialog"], width: 400 }).render(true);
            return;
        }

        if (selectedType === "link") {
            const linkIndex = parseInt(selectedId, 10);
            if (Number.isNaN(linkIndex) || !this.graphData.links[linkIndex]) return;

            const dialogContent = game.i18n.localize("FANG.Dialogs.DeleteLinkContent")
                || "Are you sure you want to delete this connection?";

            new Dialog({
                title: dialogTitle,
                content: `<p style="margin-bottom: 15px;">${dialogContent}</p>`,
                buttons: {
                    yes: {
                        icon: '<i class="fas fa-check"></i>',
                        label: game.i18n.localize("Yes"),
                        callback: async () => deleteElement("link", selectedId)
                    },
                    no: {
                        icon: '<i class="fas fa-times"></i>',
                        label: game.i18n.localize("No"),
                        className: "cancel"
                    }
                },
                default: "no"
            }, { classes: ["dialog", "fang-dialog"], width: 400 }).render(true);
        }
    }

    async _onToggleCenterNode() {
        if (!this._canEditGraph()) return;
        const selectDelete = this.element.querySelector("#deleteSelect");
        const val = selectDelete.value;

        if (!val) {
            ui.notifications.warn(game.i18n.localize("FANG.Messages.WarningNoSelect"));
            return;
        }

        const [type, id] = val.split("|");

        if (type !== "node") {
            ui.notifications.warn(game.i18n.localize("FANG.Messages.WarningNodeOnly"));
            return;
        }

        const node = this.graphData.nodes.find(n => n.id === id);
        if (node) {
            node.isCenter = !node.isCenter;

            if (node.isCenter) {
                ui.notifications.info(`${node.name} ${game.i18n.localize("FANG.Messages.CenterEnabled")}`);
            } else {
                ui.notifications.info(`${node.name} ${game.i18n.localize("FANG.Messages.CenterDisabled")}`);
            }

            this.initSimulation();
            this.simulation.alpha(0.6).restart(); // High heat to let it fly to center
            this._populateActors();

            // Save + sync once simulation has mostly settled (alpha < 0.05 = visually arrived)
            this.simulation.on("tick.centerSync", async () => {
                if (this.simulation.alpha() < 0.05) {
                    this.simulation.on("tick.centerSync", null); // Remove one-time listener
                    await this.saveData();
                    game.socket.emit("module.fang", { action: "refreshGraph" });
                }
            });
        }
    }

    async _onManageFactions() {
        if (!game.user.isGM) return; // Only GM can manage factions

        // Check if the current user has the lock before opening the dialog
        if (!this._canEditGraph(false, true)) {
            // If not GM, and player editing is allowed, try to acquire the lock
            if (!game.user.isGM && game.settings.get("fang", "allowPlayerEditing")) {
                const acquired = await this._requestLock();
                if (!acquired) return; // If lock not acquired, stop here
            } else {
                return; // If GM, but _canEditGraph() returned false (e.g., another GM has the lock), stop
            }
        }

        let factionsHtml = this.graphData.factions.map((f, index) => `
            <div class="fang-faction-item" style="display: flex; gap: 5px; align-items: center; margin-bottom: 5px;">
                <input type="hidden" class="faction-id" value="${f.id}">
                <input type="color" class="faction-color" data-index="${index}" value="${f.color}" title="${game.i18n.localize('FANG.UI.Color') || 'Farbe'}" style="flex: 0 0 30px; height: 30px; padding: 0;">
                <input type="text" class="faction-name" data-index="${index}" value="${f.name}" placeholder="Fraktionsname" style="flex: 1;">
                <div class="faction-icon-preview" style="flex: 0 0 30px; height: 30px; border: 1px solid rgba(0,0,0,0.2); border-radius: 3px; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.1); overflow: hidden;">
                    <img src="${f.icon || ''}" id="preview-icon-${index}" style="max-width: 100%; max-height: 100%; display: ${f.icon ? 'block' : 'none'}; object-fit: contain;">
                </div>
                <button type="button" class="btn file-picker" data-type="image" data-target="faction-icon-${index}" title="Icon auswählen" style="flex: 0 0 30px; padding: 0;">
                    <i class="fas fa-file-image"></i>
                </button>
                <input type="hidden" class="faction-icon" id="faction-icon-${index}" data-index="${index}" value="${f.icon || ''}">
                <button type="button" class="btn danger-btn btn-delete-faction" data-index="${index}" title="Fraktion löschen" style="flex: 0 0 30px; padding: 0;">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `).join("");

        const dialogContent = `
            <div style="display: flex; flex-direction: column; height: 100%;">
                <p style="flex: 0 0 auto;">${game.i18n.localize("FANG.UI.ManageFactionsHint")}</p>
                <div style="flex: 0 0 auto; margin-bottom: 10px; display: flex; align-items: center; gap: 10px;">
                    <input type="checkbox" id="fang-show-faction-lines" ${this.graphData.showFactionLines !== false ? 'checked' : ''}>
                    <label for="fang-show-faction-lines">${game.i18n.localize("FANG.Dialogs.ShowFactionLines")}</label>
                </div>
                <div style="flex: 0 0 auto; margin-bottom: 10px; display: flex; align-items: center; gap: 10px;">
                    <input type="checkbox" id="fang-show-faction-legend" ${this.graphData.showFactionLegend !== false ? 'checked' : ''}>
                    <label for="fang-show-faction-legend">${game.i18n.localize("FANG.Dialogs.ShowFactionLegend")}</label>
                </div>
                <div id="fang-factions-list" style="flex: 1 1 auto; overflow-y: auto; overflow-x: hidden; margin-bottom: 10px; min-height: 150px; border: 1px solid rgba(0,0,0,0.2); padding: 5px;">
                    ${factionsHtml}
                </div>
                <button type="button" id="fang-add-faction-btn" class="btn" style="flex: 0 0 auto; width: 100%; margin-bottom: 10px; border: 1px solid #d4af37; background: rgba(139, 0, 0, 0.05); font-weight: bold; color: #4b443c;">
                    <i class="fas fa-plus"></i> ${game.i18n.localize("FANG.Dialogs.BtnAddFaction") || 'Fraktion hinzufügen'}
                </button>
            </div>
        `;
        const factionDialog = new Dialog({
            title: game.i18n.localize("FANG.UI.ManageFactions"),
            content: dialogContent,
            render: (html) => {
                // Add new blank row dynamically
                html.find("#fang-add-faction-btn").on("click", () => {
                    const list = html.find("#fang-factions-list");
                    const newIndex = list.children().length;
                    const randomColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
                    list.append(`
                        <div class="fang-faction-item" style="display: flex; gap: 5px; align-items: center; margin-bottom: 5px;">
                            <input type="hidden" class="faction-id" value="">
                            <input type="color" class="faction-color" data-index="${newIndex}" value="${randomColor}" title="Farbe" style="flex: 0 0 30px; height: 30px; padding: 0;">
                            <input type="text" class="faction-name" data-index="${newIndex}" value="Neue Fraktion" placeholder="Fraktionsname" style="flex: 1;">
                            <div class="faction-icon-preview" style="flex: 0 0 30px; height: 30px; border: 1px solid rgba(0,0,0,0.2); border-radius: 3px; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.1); overflow: hidden;">
                                <img src="" id="preview-icon-${newIndex}" style="max-width: 100%; max-height: 100%; display: none; object-fit: contain;">
                            </div>
                            <button type="button" class="btn file-picker" data-type="image" data-target="faction-icon-${newIndex}" title="Icon auswählen" style="flex: 0 0 30px; padding: 0;">
                                <i class="fas fa-file-image"></i>
                            </button>
                            <input type="hidden" class="faction-icon" id="faction-icon-${newIndex}" data-index="${newIndex}" value="">
                            <button type="button" class="btn danger-btn btn-delete-faction" data-index="${newIndex}" title="Fraktion löschen" style="flex: 0 0 30px; padding: 0;">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    `);

                    // Bind delete specifically to the newly added row
                    html.find(`.btn-delete-faction[data-index='${newIndex}']`).on("click", (e) => {
                        $(e.currentTarget).closest('.fang-faction-item').remove();
                    });
                });

                // Bind FilePicker
                html.find(".file-picker").on("click", (event) => {
                    event.preventDefault();
                    const button = event.currentTarget;
                    const targetInput = button.dataset.target;
                    new FilePicker({
                        type: "image",
                        callback: (path) => {
                            html.find(`#${targetInput}`).val(path);
                            // Update preview immediately
                            const index = targetInput.split("-").pop();
                            const previewImg = html.find(`#preview-icon-${index}`);
                            previewImg.attr("src", path);
                            previewImg.show();
                        }
                    }).render(true);
                });

                // Bind delete to existing rows
                html.find(".btn-delete-faction").on("click", (e) => {
                    $(e.currentTarget).closest('.fang-faction-item').remove();
                });
            },
            buttons: {
                save: {
                    icon: '<i class="fas fa-save"></i>',
                    label: game.i18n.localize("FANG.Dialogs.BtnSave"),
                    callback: async (html) => {
                        this.graphData.showFactionLines = html.find("#fang-show-faction-lines").is(":checked");
                        this.graphData.showFactionLegend = html.find("#fang-show-faction-legend").is(":checked");
                        const newFactions = [];
                        html.find(".fang-faction-item").each((i, el) => {
                            const factionIdFromInput = $(el).find(".faction-id").val();
                            const name = $(el).find(".faction-name").val().trim();
                            const color = $(el).find(".faction-color").val();
                            const icon = $(el).find(".faction-icon").val().trim();

                            if (name) {
                                // Find existing faction by ID to maintain stability even if renamed
                                const existingFaction = factionIdFromInput ? this.graphData.factions.find(f => f.id === factionIdFromInput) : null;

                                newFactions.push({
                                    id: existingFaction ? existingFaction.id : foundry.utils.randomID(),
                                    name: name,
                                    color: color,
                                    icon: icon !== "" ? icon : null,
                                    x: existingFaction && existingFaction.x !== undefined ? existingFaction.x : this.width / 2 + (Math.random() - 0.5) * 100,
                                    y: existingFaction && existingFaction.y !== undefined ? existingFaction.y : this.height / 2 + (Math.random() - 0.5) * 100,
                                    externalSource: existingFaction?.externalSource ? foundry.utils.duplicate(existingFaction.externalSource) : null,
                                    externalMeta: existingFaction?.externalMeta ? foundry.utils.duplicate(existingFaction.externalMeta) : null
                                });
                            }
                        });

                        // Handle faction cleanup
                        const keptFactionIds = new Set(newFactions.map(f => f.id));
                        this.graphData.nodes.forEach(node => {
                            if (node.factionId && !keptFactionIds.has(node.factionId)) {
                                node.factionId = null;
                            }
                        });

                        this.graphData.factions = newFactions;

                        this.initSimulation();
                        this.simulation.alpha(0.05).restart();
                        await this.saveData();
                    }
                },
                cancel: {
                    icon: '<i class="fas fa-times"></i>',
                    label: game.i18n.localize("FANG.Dialogs.BtnCancel")
                }
            },
            default: "save"
        }, {
            classes: ["dialog", "fang-dialog"],
            width: 450,
            height: 480,
            resizable: true
        });

        factionDialog.render(true);
    }

    _onDragOver(event) {
        event.preventDefault(); // Necessary to allow dropping
    }

    async _onDrop(event) {
        if (!this._canEditGraph()) return;
        event.preventDefault();
        if (!this._canEditGraph()) return;
        let data;
        try {
            data = JSON.parse(event.dataTransfer.getData("text/plain"));
        } catch (err) {
            return; // Not valid JSON, ignore
        }

        const isActorDrop = data.type === "Actor";
        const isJournalDrop = data.type === "JournalEntry" || data.type === "JournalEntryPage";

        if (!isActorDrop && !isJournalDrop) return;
        if (!data.uuid) return;

        const droppedDoc = await fromUuid(data.uuid);
        if (!droppedDoc) return;

        if (!this.transform) return;

        // Convert mouse coordinates to canvas coordinate space
        const bounds = this.canvas.getBoundingClientRect();
        const mouseX = event.clientX - bounds.left;
        const mouseY = event.clientY - bounds.top;

        const x = this.transform.invertX(mouseX);
        const y = this.transform.invertY(mouseY);

        // Check if dropped ON an existing node
        const s2 = (30 * 30); // Base radius squared
        let targetNode = null;
        let minD2 = s2;

        for (let node of this.graphData.nodes) {
            const dx = x - node.x;
            const dy = y - node.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < minD2) {
                targetNode = node;
                minD2 = d2;
            }
        }

        if (isJournalDrop) {
            if (!targetNode) {
                ui.notifications.warn("Please drop the Journal onto a specific node in the graph.");
                return;
            }

            const title = (game.i18n.localize("FANG.Dialogs.AssignJournalTitle") || "Assign Journal to {actor}").replace("{actor}", targetNode.name);
            const contentString = "<p>" + (game.i18n.localize("FANG.Dialogs.AssignJournalContent") || "Select how you want to link the journal <strong>{journal}</strong> to <strong>{actor}</strong>.")
                .replace("{journal}", droppedDoc.name)
                .replace("{actor}", targetNode.name) + "</p>";

            new Dialog({
                title: title,
                content: contentString,
                buttons: {
                    gm: {
                        icon: '<i class="fas fa-book"></i>',
                        label: game.i18n.localize("FANG.Dialogs.GMNotesTitle") || "GM Private Notes",
                        callback: async () => {
                            targetNode.journalUuid = data.uuid;
                            targetNode._gmJournalName = droppedDoc.name;
                            await this.saveData();
                            ui.notifications.info("GM Note linked to " + targetNode.name + ".");
                        }
                    },
                    quest: {
                        icon: '<i class="fas fa-scroll"></i>',
                        label: game.i18n.localize("FANG.Dialogs.QuestLogTitle") || "Public Quest Log",
                        callback: async () => {
                            if (!targetNode.questUuids) targetNode.questUuids = [];
                            const alreadyLinked = targetNode.questUuids.some(q => q.uuid === data.uuid);
                            if (!alreadyLinked) {
                                targetNode.questUuids.push({ uuid: data.uuid, name: droppedDoc.name });
                            }
                            if (!targetNode.conditions) targetNode.conditions = [];
                            if (!targetNode.conditions.includes("questgiver")) {
                                targetNode.conditions.push("questgiver");
                            }
                            this.ticked();
                            await this.saveData();
                            ui.notifications.info("Quest Log linked to " + targetNode.name + ".");
                        }
                    }
                },
                default: "gm",
                render: html => {
                    html.find(".dialog-buttons").css({
                        "align-items": "stretch"
                    });
                    html.find(".dialog-button").css({
                        "white-space": "normal",
                        "display": "flex",
                        "flex-direction": "column",
                        "align-items": "center",
                        "justify-content": "center",
                        "gap": "5px",
                        "min-height": "60px",
                        "padding": "5px"
                    });
                }
            }, { classes: ["dialog", "fang-dialog"], width: 420 }).render(true);
            return;
        }

        // From here, we handle Actor drops
        const actor = droppedDoc;

        if (targetNode) {
            const openFastLinkDialog = () => {
                if (targetNode.id === actor.id || targetNode.actorId === actor.id) {
                    ui.notifications.warn(game.i18n.localize("FANG.Messages.WarningSelfLink"));
                    return;
                }

                const title = game.i18n.localize("FANG.Dialogs.FastLinkTitle");
                const contentString = game.i18n.localize("FANG.Dialogs.FastLinkContent")
                    .replace("{source}", actor.name)
                    .replace("{target}", targetNode.name);
                const lblLabel = game.i18n.localize("FANG.Dialogs.LabelInput");
                const lblDir = game.i18n.localize("FANG.Dialogs.DirectionalInput");
                const btnConn = game.i18n.localize("FANG.Dialogs.BtnConnect");
                const btnCancel = game.i18n.localize("FANG.Dialogs.BtnCancel");

                const dialogContent = `
                    <p><strong>${contentString}</strong></p>
                    <div class="form-group">
                        <label>${lblLabel}:</label>
                        <div class="form-fields">
                            <input type="text" id="fang-fast-label" style="width: 100%;">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>${lblDir}:</label>
                        <div class="form-fields">
                            <input type="checkbox" id="fang-fast-dir">
                        </div>
                    </div>
                `;

                new Dialog({
                    title: title,
                    content: dialogContent,
                    buttons: {
                        connect: {
                            icon: '<i class="fas fa-link"></i>',
                            label: btnConn,
                            callback: async (html) => {
                                const labelStr = html.find("#fang-fast-label").val().trim();
                                const isDir = html.find("#fang-fast-dir").is(":checked");

                                // Find or create the source node
                                let sourceNode = this.graphData.nodes.find(n => n.id === actor.id || n.actorId === actor.id);
                                if (!sourceNode) {
                                    // Add near target to make the simulation look nice
                                    let generatedLorePageId = null;
                                    const entry = await this.getJournalEntry();
                                    if (entry) {
                                        const matchingPage = entry.pages.find(p => p.name === "Lore: " + actor.name);
                                        if (matchingPage) generatedLorePageId = matchingPage.id;
                                    }

                                    sourceNode = {
                                        id: actor.id, actorId: actor.id, isPlaceholder: false, placeholderType: null, img: actor.prototypeToken?.texture?.src || actor.img || null,
                                        name: actor.name, originalName: actor.name,
                                        x: x - 20, y: y - 20,
                                        hidden: game.settings.get("fang", "defaultHiddenMode"),
                                        displayName: "", conditions: [],
                                        playerLorePageId: generatedLorePageId
                                    };

                                    if (!generatedLorePageId) {
                                        const legacyLore = actor.getFlag("fang", "legacyLore");
                                        if (legacyLore) sourceNode.lore = legacyLore;
                                    }

                                    this.graphData.nodes.push(sourceNode);
                                }

                                this.graphData.links.push({
                                    source: sourceNode.id,
                                    target: targetNode.id,
                                    label: labelStr,
                                    directional: isDir
                                });

                                this.initSimulation();
                                this.simulation.alpha(0.3).restart();
                                this._populateActors();
                                await this.saveData();
                            }
                        },
                        cancel: {
                            icon: '<i class="fas fa-times"></i>',
                            label: btnCancel
                        }
                    },
                    default: "connect"
                }, {
                    classes: ["dialog", "fang-dialog"],
                    width: 400
                }).render(true);
            };

            const actorAlreadyOnCanvas = this.graphData.nodes.some(n =>
                n.id !== targetNode.id && (n.id === actor.id || n.actorId === actor.id)
            );

            if (targetNode.isPlaceholder && game.user.isGM && !actorAlreadyOnCanvas) {
                const title = game.i18n.localize("FANG.Placeholder.DropTitle") || "Actor dropped on placeholder";
                const content = (game.i18n.localize("FANG.Placeholder.DropContent") || "Do you want to replace <strong>{target}</strong> with <strong>{actor}</strong>, or create a relationship?")
                    .replace("{target}", targetNode.name)
                    .replace("{actor}", actor.name);
                new Dialog({
                    title,
                    content: `<p>${content}</p>`,
                    buttons: {
                        replace: {
                            icon: '<i class="fas fa-random"></i>',
                            label: game.i18n.localize("FANG.Placeholder.DropReplace") || "Replace placeholder",
                            callback: async () => {
                                await this._applyActorToPlaceholder(targetNode, actor, { keepName: false, keepRole: true, keepAlias: true });
                            }
                        },
                        connect: {
                            icon: '<i class="fas fa-link"></i>',
                            label: game.i18n.localize("FANG.Placeholder.DropConnect") || "Create relationship",
                            callback: () => openFastLinkDialog()
                        },
                        cancel: { icon: '<i class="fas fa-times"></i>', label: game.i18n.localize("FANG.Dialogs.BtnCancel") || "Cancel" }
                    },
                    default: "replace"
                }, { classes: ["dialog", "fang-dialog"], width: 460 }).render(true);
            } else {
                openFastLinkDialog();
            }

        } else {
            // Scenario 1: Dropped on empty canvas -> Add the node immediately without prompting
            let existingNode = this.graphData.nodes.find(n => n.id === actor.id || n.actorId === actor.id);
            if (existingNode) {
                // If it already exists, just move it to the new mouse location
                existingNode.x = x;
                existingNode.y = y;
                existingNode.fx = null;
                existingNode.fy = null;
            } else {
                // Add new node at precise location with a tiny random offset to prevent perfect stacking
                const jitterX = x + (Math.random() - 0.5) * 5;
                const jitterY = y + (Math.random() - 0.5) * 5;

                let generatedLorePageId = null;
                const entry = await this.getJournalEntry();
                if (entry) {
                    const matchingPage = entry.pages.find(p => p.name === "Lore: " + actor.name);
                    if (matchingPage) {
                        generatedLorePageId = matchingPage.id;
                        ui.notifications.info(`Auto-linked existing Player Lore journal for ${actor.name}.`);
                    }
                }

                const newNode = {
                    id: actor.id,
                    actorId: actor.id,
                    isPlaceholder: false,
                    placeholderType: null,
                    img: actor.prototypeToken?.texture?.src || actor.img || null,
                    name: actor.name,
                    originalName: actor.name,
                    role: null,
                    factionId: null,
                    x: jitterX,
                    y: jitterY,
                    hidden: game.settings.get("fang", "defaultHiddenMode"),
                    displayName: "",
                    conditions: [],
                    playerLorePageId: generatedLorePageId
                };

                if (!generatedLorePageId) {
                    const legacyLore = actor.getFlag("fang", "legacyLore");
                    if (legacyLore) newNode.lore = legacyLore;
                }

                this.graphData.nodes.push(newNode);
            }

            this.initSimulation();
            this.simulation.alpha(0.8).restart();
            this._populateActors();
            await this.saveData();
        }
    }


    _onCanvasDoubleClick(event) {
        if (!this.transform) return;

        // Convert mouse coordinates to canvas coordinate space
        const bounds = this.canvas.getBoundingClientRect();
        const mouseX = event.clientX - bounds.left;
        const mouseY = event.clientY - bounds.top;

        const x = this.transform.invertX(mouseX);
        const y = this.transform.invertY(mouseY);

        // Find the clicked node
        const s2 = (30 * 30); // Base radius squared
        let clickedNode = null;
        let minD2 = s2;

        for (let node of this.graphData.nodes) {
            const dx = x - node.x;
            const dy = y - node.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < minD2) {
                clickedNode = node;
                minD2 = d2;
            }
        }

        if (clickedNode) {
            const actor = this._getNodeActor(clickedNode);
            if (actor) {
                actor.sheet.render(true);
            } else {
                ui.notifications.warn(game.i18n.localize("FANG.Messages.ActorNotFound"));
            }
        }
    }

    _showContextMenu(node, mouseX, mouseY) {

        const menu = this.element.querySelector("#fang-context-menu");
        if (!menu) return;

        // Position menu at cursor
        menu.style.left = `${mouseX}px`;
        menu.style.top = `${mouseY}px`;
        menu.classList.remove("hidden");

        const btnRole = menu.querySelector("#ctxEditRole");
        const btnLore = menu.querySelector("#ctxEditLore");
        const btnOpenJournal = menu.querySelector("#ctxOpenJournal");
        const btnOpenQuest = menu.querySelector("#ctxOpenQuest");
        const btnSpotlight = menu.querySelector("#ctxSpotlight");
        const btnIdentity = menu.querySelector("#ctxIdentity");
        const btnReplacePlaceholder = menu.querySelector("#ctxReplacePlaceholder");
        const btnCondition = menu.querySelector("#ctxCondition");
        const btnDelete = menu.querySelector("#ctxDeleteNode");

        // Clear previous listeners by cloning nodes
        const newBtnRole = btnRole.cloneNode(true);
        const newBtnLore = btnLore.cloneNode(true);
        const newBtnOpenJournal = btnOpenJournal ? btnOpenJournal.cloneNode(true) : null;
        const newBtnOpenQuest = btnOpenQuest ? btnOpenQuest.cloneNode(true) : null;
        const newBtnSpotlight = btnSpotlight.cloneNode(true);
        const newBtnIdentity = btnIdentity ? btnIdentity.cloneNode(true) : null;
        const newBtnReplacePlaceholder = btnReplacePlaceholder ? btnReplacePlaceholder.cloneNode(true) : null;
        const newBtnCondition = btnCondition ? btnCondition.cloneNode(true) : null;
        const newBtnDelete = btnDelete.cloneNode(true);

        btnRole.parentNode.replaceChild(newBtnRole, btnRole);
        btnLore.parentNode.replaceChild(newBtnLore, btnLore);
        if (btnOpenJournal && newBtnOpenJournal) btnOpenJournal.parentNode.replaceChild(newBtnOpenJournal, btnOpenJournal);
        if (btnOpenQuest && newBtnOpenQuest) btnOpenQuest.parentNode.replaceChild(newBtnOpenQuest, btnOpenQuest);
        btnSpotlight.parentNode.replaceChild(newBtnSpotlight, btnSpotlight);
        if (btnIdentity && newBtnIdentity) btnIdentity.parentNode.replaceChild(newBtnIdentity, btnIdentity);
        if (btnReplacePlaceholder && newBtnReplacePlaceholder) btnReplacePlaceholder.parentNode.replaceChild(newBtnReplacePlaceholder, btnReplacePlaceholder);
        if (btnCondition && newBtnCondition) btnCondition.parentNode.replaceChild(newBtnCondition, btnCondition);
        btnDelete.parentNode.replaceChild(newBtnDelete, btnDelete);

        // --- Permission Logic ---
        const hasLock = this._canEditGraph(true);
        const isPlayerView = !game.user.isGM;
        const tokenIsHidden = node.hidden;

        newBtnRole.style.display = hasLock ? "block" : "none";
        newBtnLore.style.display = hasLock ? "block" : "none";
        if (newBtnOpenJournal) newBtnOpenJournal.style.display = (game.user.isGM && node.journalUuid) ? "block" : "none";
        if (newBtnOpenQuest) newBtnOpenQuest.style.display = (node.questUuids && node.questUuids.length > 0) ? "block" : "none";
        newBtnDelete.style.display = hasLock ? "block" : "none";
        if (newBtnIdentity) newBtnIdentity.style.display = (game.user.isGM && hasLock) ? "block" : "none";
        if (newBtnReplacePlaceholder) newBtnReplacePlaceholder.style.display = (game.user.isGM && hasLock && node.isPlaceholder) ? "block" : "none";
        if (newBtnCondition) newBtnCondition.style.display = (game.user.isGM && hasLock) ? "block" : "none";

        // Protection: Hide info buttons for players viewing hidden tokens
        if (isPlayerView && tokenIsHidden) {
            newBtnRole.style.display = "none";
            newBtnLore.style.display = "none";
            if (newBtnOpenQuest) newBtnOpenQuest.style.display = "none";
        }

        // Spotlight is always visible
        newBtnSpotlight.style.display = "block";

        // --- Context Action: Spotlight ---
        newBtnSpotlight.addEventListener("click", () => {
            menu.classList.add("hidden");
            if (node.hidden) {
                ui.notifications.warn(game.i18n.localize("FANG.Messages.SpotlightHiddenBlocked") || "Reveal the character first before using Spotlight!");
                return;
            }
            this._onSpotlight(node);
        });

        if (newBtnReplacePlaceholder) {
            newBtnReplacePlaceholder.addEventListener("click", () => {
                menu.classList.add("hidden");
                this._onReplacePlaceholder(node);
            });
        }

        // --- Context Action: Open GM Journal ---
        if (newBtnOpenJournal) {
            newBtnOpenJournal.addEventListener("click", async () => {
                menu.classList.add("hidden");
                if (!node.journalUuid) return;
                const doc = await fromUuid(node.journalUuid);
                if (doc) doc.sheet.render(true);
            });
        }

        // --- Context Action: Open Quest Log ---
        if (newBtnOpenQuest) {
            newBtnOpenQuest.addEventListener("click", async (evt) => {
                menu.classList.add("hidden");
                if (!node.questUuids || node.questUuids.length === 0) return;

                if (node.questUuids.length === 1) {
                    // Only one quest – open directly
                    const doc = await fromUuid(node.questUuids[0].uuid);
                    if (doc) doc.sheet.render(true);
                    else if (!game.user.isGM) ui.notifications.warn("Quest Journal not found or you lack permissions.");
                    return;
                }

                // Multiple quests – show the in-canvas quest picker panel
                const picker = this.element.querySelector("#fang-quest-picker");
                const pickerTitle = picker.querySelector("#fang-quest-picker-title");
                const pickerList = picker.querySelector("#fang-quest-picker-list");
                if (!picker) return;

                // Set header text: character name
                pickerTitle.textContent = node.name;

                // Build the list of quests
                pickerList.innerHTML = node.questUuids.map((q, i) => `
                    <li class="fang-quest-pick-item ctx-item" data-idx="${i}" style="padding: 9px 14px; cursor: pointer; display: flex; align-items: center; gap: 10px; border-left: 3px solid transparent; transition: background 0.15s, border-color 0.15s;">
                        <i class="fas fa-scroll" style="color: var(--fang-accent-gold); width:16px; text-align:center;"></i>
                        <span style="font-size:0.92rem;">${q.name || "Quest " + (i + 1)}</span>
                    </li>
                `).join("");

                // Position next to cursor, within canvas bounds
                const canvasBounds = this.canvas.getBoundingClientRect();
                const containerBounds = this.element.querySelector("main").getBoundingClientRect();
                let px = mouseX + 10;
                let py = mouseY;
                picker.classList.remove("hidden");
                // Clamp to canvas
                const pw = picker.offsetWidth || 240;
                const ph = picker.offsetHeight || 150;
                if (px + pw > containerBounds.width) px = mouseX - pw - 10;
                if (py + ph > containerBounds.height) py = containerBounds.height - ph - 10;
                picker.style.left = `${px}px`;
                picker.style.top = `${py}px`;

                // Click handlers on items
                picker.querySelectorAll(".fang-quest-pick-item").forEach(el => {
                    el.addEventListener("click", async () => {
                        picker.classList.add("hidden");
                        const idx = parseInt(el.dataset.idx);
                        const q = node.questUuids[idx];
                        if (!q) return;
                        const doc = await fromUuid(q.uuid);
                        if (doc) doc.sheet.render(true);
                        else ui.notifications.warn("Quest Journal not found or you lack permissions.");
                    });
                    el.addEventListener("mouseover", () => {
                        el.style.background = "var(--fang-nav-bg)";
                        el.style.borderLeftColor = "var(--fang-primary-red)";
                        el.style.color = "var(--fang-primary-red)";
                    });
                    el.addEventListener("mouseout", () => {
                        el.style.background = "";
                        el.style.borderLeftColor = "transparent";
                        el.style.color = "";
                    });
                });

                // Close on outside click
                const closePicker = (e) => {
                    if (!picker.contains(e.target)) {
                        picker.classList.add("hidden");
                        document.removeEventListener("click", closePicker, true);
                    }
                };
                setTimeout(() => document.addEventListener("click", closePicker, true), 50);
            });
        }



        // --- Context Action: Identity ---
        if (newBtnIdentity) {
            newBtnIdentity.addEventListener("click", () => {
                menu.classList.add("hidden");
                if (!this._canEditGraph()) return;

                const title = game.i18n.localize("FANG.Dialogs.IdentityTitle") || "Identity";
                const lblName = game.i18n.localize("FANG.Dialogs.IdentityName") || "Displayed Name";
                const lblOriginal = (game.i18n.localize("FANG.Dialogs.IdentityOriginal") || "Original: {name}").replace("{name}", node.originalName || node.name);
                const lblHidden = game.i18n.localize("FANG.Dialogs.IdentityHidden") || "Hidden for Players";
                const lblAlias = game.i18n.localize("FANG.Dialogs.IdentityAlias") || "Alias (when hidden)";

                new Dialog({
                    title: title,
                    content: `
                        <div class="form-group">
                            <label>${lblName}:</label>
                            <div class="form-fields">
                                <input type="text" id="fang-identity-name" value="${node.name || ""}" style="width: 100%;">
                            </div>
                            <p style="font-size: 0.8em; color: #888; margin: 2px 0 8px 0;">${lblOriginal}</p>
                        </div>
                        <div class="form-group">
                            <label>${lblHidden}:</label>
                            <div class="form-fields">
                                <input type="checkbox" id="fang-identity-hidden" ${node.hidden ? "checked" : ""} style="width: auto;">
                            </div>
                        </div>
                        <div class="form-group">
                            <label>${lblAlias}:</label>
                            <div class="form-fields">
                                <input type="text" id="fang-identity-alias" value="${node.displayName || ""}" placeholder="???" style="width: 100%;">
                            </div>
                        </div>
                    `,
                    buttons: {
                        save: {
                            icon: '<i class="fas fa-save"></i>',
                            label: game.i18n.localize("FANG.Dialogs.BtnSave") || "Save",
                            callback: async (html) => {
                                const newName = html.find("#fang-identity-name").val().trim();
                                const isHidden = html.find("#fang-identity-hidden").is(":checked");
                                const newAlias = html.find("#fang-identity-alias").val().trim();
                                if (newName) node.name = newName;
                                node.hidden = isHidden;
                                node.displayName = newAlias;
                                this.ticked();
                                this._populateActors();
                                await this.saveData();
                            }
                        },
                        cancel: { icon: '<i class="fas fa-times"></i>', label: game.i18n.localize("FANG.Dialogs.BtnCancel") || "Cancel" }
                    },
                    default: "save"
                }, { classes: ["dialog", "fang-dialog"], width: 420 }).render(true);
            });
        }

        // --- Context Action: Condition ---
        if (newBtnCondition) {
            newBtnCondition.addEventListener("click", () => {
                menu.classList.add("hidden");
                if (!this._canEditGraph()) return;

                const title = game.i18n.localize("FANG.Dialogs.ConditionTitle") || "Set Condition";
                const conditions = node.conditions || [];
                const conditionDefs = [
                    { id: "deceased", label: game.i18n.localize("FANG.Dialogs.ConditionDeceased") || "Deceased", icon: "fa-skull" },
                    { id: "missing", label: game.i18n.localize("FANG.Dialogs.ConditionMissing") || "Missing", icon: "fa-question-circle" },
                    { id: "captured", label: game.i18n.localize("FANG.Dialogs.ConditionCaptured") || "Captured", icon: "fa-link" },
                    { id: "questgiver", label: game.i18n.localize("FANG.Dialogs.ConditionQuestgiver") || "Quest Giver", icon: "fa-scroll" }
                ];

                const checkboxes = conditionDefs.map(c => {
                    const checked = conditions.includes(c.id) ? "checked" : "";
                    return `<div style="display: flex; align-items: center; gap: 8px; padding: 4px 0;">
                        <input type="checkbox" id="fang-cond-${c.id}" ${checked} style="width: auto; margin: 0;">
                        <i class="fas ${c.icon}" style="width: 18px; text-align: center;"></i>
                        <label for="fang-cond-${c.id}" style="cursor: pointer;">${c.label}</label>
                    </div>`;
                }).join("");

                new Dialog({
                    title: title,
                    content: `
                        <p><strong>${(game.i18n.localize("FANG.Dialogs.ConditionContent") || "Conditions for {actor}:").replace("{actor}", node.name)}</strong></p>
                        <div class="form-group" style="flex-direction: column; gap: 2px;">${checkboxes}</div>
                    `,
                    buttons: {
                        save: {
                            icon: '<i class="fas fa-save"></i>',
                            label: game.i18n.localize("FANG.Dialogs.BtnSave") || "Save",
                            callback: async (html) => {
                                const newConditions = [];
                                conditionDefs.forEach(c => {
                                    if (html.find(`#fang-cond-${c.id}`).is(":checked")) newConditions.push(c.id);
                                });
                                node.conditions = newConditions;
                                this.ticked();
                                await this.saveData();
                            }
                        },
                        cancel: { icon: '<i class="fas fa-times"></i>', label: game.i18n.localize("FANG.Dialogs.BtnCancel") || "Cancel" }
                    },
                    default: "save"
                }, { classes: ["dialog", "fang-dialog"], width: 380 }).render(true);
            });
        }

        // --- Context Action: Edit Role ---
        newBtnRole.addEventListener("click", () => {
            menu.classList.add("hidden");
            if (!this._canEditGraph()) return;

            const title = game.i18n.localize("FANG.Dialogs.EditRoleTitle") || "Details bearbeiten";
            const contentString = (game.i18n.localize("FANG.Dialogs.EditRoleContent") || "Details für {actor}:").replace("{actor}", node.name);
            const lblRole = game.i18n.localize("FANG.Dialogs.RoleInput") || "Rolle";

            const factionOptions = this.graphData.factions.map(f => {
                const selected = f.id === node.factionId ? "selected" : "";
                return `<option value="${f.id}" ${selected}>${f.name}</option>`;
            }).join("");

            new Dialog({
                title: title,
                content: `
                    <p><strong>${contentString}</strong></p>
                    <div class="form-group">
                        <label>${lblRole}:</label>
                        <div class="form-fields">
                            <input type="text" id="fang-edit-role" value="${node.role || ""}" style="width: 100%;">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>${game.i18n.localize("FANG.Dialogs.FactionInput") || "Fraktion"}:</label>
                        <div class="form-fields">
                            <select id="fang-edit-faction" style="width: 100%;">
                                <option value="">-- Keine --</option>
                                ${factionOptions}
                            </select>
                        </div>
                    </div>
                `,
                buttons: {
                    save: {
                        icon: '<i class="fas fa-save"></i>',
                        label: game.i18n.localize("FANG.Dialogs.BtnSave") || "Speichern",
                        callback: async (html) => {
                            const newRole = html.find("#fang-edit-role").val().trim();
                            const newFactionId = html.find("#fang-edit-faction").val();
                            node.role = newRole !== "" ? newRole : null;
                            node.factionId = newFactionId !== "" ? newFactionId : null;
                            this.initSimulation();
                            this.simulation.alpha(0.05).restart();
                            await this.saveData();
                        }
                    },
                    cancel: { icon: '<i class="fas fa-times"></i>', label: game.i18n.localize("FANG.Dialogs.BtnCancel") || "Abbrechen" }
                },
                default: "save"
            }, { classes: ["dialog", "fang-dialog"], width: 400 }).render(true);
        });

        // --- Context Action: Edit Lore / Journals ---
        newBtnLore.addEventListener("click", () => {
            menu.classList.add("hidden");
            if (!this._canEditGraph()) return;

            const title = game.i18n.localize("FANG.Dialogs.EditLoreTitle") || "Edit Information & Journals";
            const contentString = (game.i18n.localize("FANG.Dialogs.EditLoreContent") || "Manage details and journals for {actor}:").replace("{actor}", node.name);
            const isGM = game.user.isGM;

            // Prepare GM sections HTML
            let gmHtml = "";
            if (isGM) {
                // Translations
                const gmNotesTitle = game.i18n.localize("FANG.Dialogs.GMNotesTitle") || "GM Private Notes";
                const gmNotesHint = game.i18n.localize("FANG.Dialogs.GMNotesHint") || "Drag & Drop a Journal Entry here, or click to open.";
                const questLogTitle = game.i18n.localize("FANG.Dialogs.QuestLogTitle") || "Public Quest Log";
                const questLogHint = game.i18n.localize("FANG.Dialogs.QuestLogHint") || "Visible to players as a Questgiver mark. Drop Journal here.";
                const dropJournalHere = game.i18n.localize("FANG.Dialogs.DropJournalHere") || "Drop Journal Here";

                // GM Private Notes Section
                const gmJournalName = node.journalUuid ? (node._gmJournalName || "Linked Journal") : "None";
                 const gmSection = `
                     <div class="fang-dialog-section">
                         <h3 style="margin-bottom: 5px; color: var(--fang-accent-gold);"><i class="fas fa-book"></i> ${gmNotesTitle}</h3>
                         <p style="font-size: 0.8em; color: #888; margin-bottom: 5px;">${gmNotesHint}</p>
                         <div id="fang-drop-gm" class="fang-drop-zone ${node.journalUuid ? 'has-link' : ''}">
                             <span id="fang-gm-link-text">${node.journalUuid ? '<i class="fas fa-link"></i> ' + gmJournalName : dropJournalHere}</span>
                             <button id="fang-remove-gm" class="btn danger-btn fang-drop-remove ${node.journalUuid ? '' : 'hidden'}" title="Remove Link">
                                 <i class="fas fa-times"></i>
                             </button>
                         </div>
                     </div>
                 `;

                // Public Quest Log Section (dynamic multi-entry list)
                const addQuestBtn = game.i18n.localize("FANG.Dialogs.QuestLogAddBtn") || "Add Quest Journal";
                 const existingQuestItems = (node.questUuids || []).map((q, i) => `
                     <div id="fang-quest-item-${i}" class="fang-quest-item">
                         <i class="fas fa-scroll" style="color: var(--fang-accent-gold);"></i>
                         <span style="flex:1; font-size:0.9em;">${q.name}</span>
                         <button class="btn danger-btn fang-quest-remove" data-idx="${i}" style="padding: 2px 6px; width: auto;" title="Remove">
                             <i class="fas fa-times"></i>
                         </button>
                     </div>
                 `).join("");

                 const questSection = `
                     <div class="fang-dialog-section">
                         <h3 style="margin-bottom: 5px; color: var(--fang-accent-gold);"><i class="fas fa-scroll"></i> ${questLogTitle}</h3>
                         <p style="font-size: 0.8em; color: #888; margin-bottom: 5px;">${questLogHint}</p>
                         <div id="fang-quest-list">${existingQuestItems}</div>
                         <div id="fang-drop-quest-new" class="fang-drop-zone fang-drop-zone-add" style="color: #888; font-size: 0.9em;">
                             <i class="fas fa-plus"></i> ${addQuestBtn}
                         </div>
                     </div>
                 `;
                gmHtml = gmSection + questSection;
            }

            const legacyNotesLabel = game.i18n.localize("FANG.Dialogs.LegacyNotes") || "Quick Lore Note:";
            const btnOpenPlayerJournal = game.i18n.localize("FANG.Dialogs.BtnOpenPlayerJournal") || "Open Player Notes Journal";
            const btnConvertPlayerJournal = game.i18n.localize("FANG.Dialogs.BtnConvertPlayerJournal") || "Convert & Open in Player Journal";
            const btnConvertHint = game.i18n.localize("FANG.Dialogs.BtnConvertPlayerJournalHint") || "Converts this simple text note into a dedicated, player-editable Foundry Journal. This gives you and the player full text formatting freedom.";

            const dialogContent = `
                <p><strong>${contentString}</strong></p>
                <div class="form-group" style="height: 120px; display: ${node.playerLorePageId ? 'none' : 'block'};">
                    <label style="font-size:0.8em; color:#888;">${legacyNotesLabel}</label>
                    <textarea id="fang-edit-lore" style="width: 100%; height: 100%; resize: none; font-family: var(--fang-font-main); padding: 5px;">${node.lore || ""}</textarea>
                </div>
                <div style="margin-top: 10px;">
                    <button id="fang-btn-player-journal" class="btn action-btn" style="width: 100%; padding: 8px;" title="${node.playerLorePageId ? '' : btnConvertHint}">
                        <i class="fa-solid fa-book" aria-hidden="true"></i> ${node.playerLorePageId ? btnOpenPlayerJournal : btnConvertPlayerJournal}
                    </button>
                </div>
                ${gmHtml}
                <div style="margin-bottom: 15px;"></div>
            `;

            let d = new Dialog({
                title: title,
                content: dialogContent,
                render: (html) => {
                    // --- Player Journal Button ---
                    html.find("#fang-btn-player-journal").click(async (ev) => {
                        ev.preventDefault();
                        const legacyText = html.find("#fang-edit-lore").val();
                        if (legacyText !== node.lore) node.lore = legacyText; // Save temp state
                        d.close();

                        // Handle Journal Page Creation/Opening
                        const entry = await this.getJournalEntry();
                        if (!entry) return;

                        if (node.playerLorePageId) {
                            // Try to open existing
                            const page = entry.pages.get(node.playerLorePageId);
                            if (page) {
                                entry.sheet.render(true, { pageId: node.playerLorePageId });
                                return;
                            }
                            // If missing, fall through to create new
                        }

                        // Create new page
                        if (game.user.isGM) {
                            const newPage = await JournalEntryPage.create({
                                name: "Lore: " + node.name,
                                type: "text",
                                text: { content: node.lore ? "<p>" + node.lore.replace(/\n/g, '<br>') + "</p>" : "" },
                                ownership: { default: 3 } // Allow players to edit the page
                            }, { parent: entry });

                            node.playerLorePageId = newPage.id;
                            node.lore = ""; // Clear legacy text

                            const actorContext = this._getNodeActor(node);
                            if (actorContext) await actorContext.unsetFlag("fang", "legacyLore");

                            await this.saveData();
                            entry.sheet.render(true, { pageId: newPage.id });
                        } else {
                            ui.notifications.warn("Only a GM can create the initial journal page for this node. Ask them to click 'Convert & Open' first.");
                        }
                    });

                    // --- GM Drag & Drop Logic ---
                    if (isGM) {
                        const setupDropZone = (zoneId, textId, removeBtnId, fieldName, cacheName) => {
                            const zone = html.find(`#${zoneId}`)[0];
                            if (!zone) return;

                            // Handle Clicks to open
                            zone.addEventListener("click", async (e) => {
                                if (e.target.closest(`#${removeBtnId}`)) return; // Ignore if clicking remove
                                const uuid = node[fieldName];
                                if (uuid) {
                                    const doc = await fromUuid(uuid);
                                    if (doc) doc.sheet.render(true);
                                }
                            });

                            // Handle Removals
                            html.find(`#${removeBtnId}`).click((e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                node[fieldName] = null;
                                delete node[cacheName];
                                 html.find(`#${textId}`).text("Drop Journal Here");
                                 html.find(`#${removeBtnId}`).addClass("hidden");
                                 zone.classList.remove("has-link");
                                 zone.style.borderColor = "";
                             });

                            // Drag & Drop
                            zone.addEventListener("dragover", (e) => {
                                e.preventDefault();
                                zone.style.borderColor = "var(--fang-accent-gold)";
                                zone.style.backgroundColor = "rgba(212, 175, 55, 0.1)";
                            });
                             zone.addEventListener("dragleave", (e) => {
                                 e.preventDefault();
                                 zone.style.borderColor = "";
                                 zone.style.backgroundColor = "";
                             });
                             zone.addEventListener("drop", async (e) => {
                                 e.preventDefault();
                                 zone.style.borderColor = "";
                                 zone.style.backgroundColor = "";

                                let data;
                                try { data = JSON.parse(e.dataTransfer.getData("text/plain")); }
                                catch (err) { return; }

                                if (data.type !== "JournalEntry" && data.type !== "JournalEntryPage") {
                                    ui.notifications.warn("Please drop a Journal Entry or Journal Page here.");
                                    return;
                                }

                                const doc = await fromUuid(data.uuid);
                                if (!doc) return;

                                node[fieldName] = data.uuid;
                                node[cacheName] = doc.name;

                                html.find(`#${textId}`).html(`<i class="fas fa-link"></i> ${doc.name}`);
                                html.find(`#${removeBtnId}`).removeClass("hidden");
                                zone.classList.add("has-link");
                            });
                        };

                        setupDropZone("fang-drop-gm", "fang-gm-link-text", "fang-remove-gm", "journalUuid", "_gmJournalName");

                        // Multi-Quest Drop Zone
                        const questListEl = html.find("#fang-quest-list")[0];
                        const newQuestZone = html.find("#fang-drop-quest-new")[0];

                        const refreshQuestRemoveButtons = () => {
                            html.find(".fang-quest-remove").off("click").on("click", (e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                const idx = parseInt($(e.currentTarget).data("idx"));
                                node.questUuids.splice(idx, 1);
                                // Re-render list
                                questListEl.innerHTML = (node.questUuids).map((q, i) => `
                                     <div id="fang-quest-item-${i}" class="fang-quest-item">
                                         <i class="fas fa-scroll" style="color:var(--fang-accent-gold);"></i>
                                         <span style="flex:1;font-size:0.9em;">${q.name}</span>
                                         <button class="btn danger-btn fang-quest-remove" data-idx="${i}" style="padding:2px 6px;width:auto;" title="Remove">
                                             <i class="fas fa-times"></i>
                                         </button>
                                     </div>
                                 `).join("");
                                refreshQuestRemoveButtons();
                            });
                        };
                        refreshQuestRemoveButtons();

                        if (newQuestZone) {
                            newQuestZone.addEventListener("dragover", (e) => {
                                e.preventDefault();
                                newQuestZone.style.borderColor = "var(--fang-accent-gold)";
                                newQuestZone.style.backgroundColor = "rgba(212,175,55,0.1)";
                            });
                            newQuestZone.addEventListener("dragleave", () => {
                                newQuestZone.style.borderColor = "";
                                newQuestZone.style.backgroundColor = "";
                            });
                            newQuestZone.addEventListener("drop", async (e) => {
                                e.preventDefault();
                                newQuestZone.style.borderColor = "";
                                newQuestZone.style.backgroundColor = "";
                                let dropData;
                                try { dropData = JSON.parse(e.dataTransfer.getData("text/plain")); } catch { return; }
                                if (dropData.type !== "JournalEntry" && dropData.type !== "JournalEntryPage") {
                                    ui.notifications.warn("Please drop a Journal Entry or Journal Page here.");
                                    return;
                                }
                                const doc = await fromUuid(dropData.uuid);
                                if (!doc) return;
                                if (!node.questUuids) node.questUuids = [];
                                if (!node.questUuids.some(q => q.uuid === dropData.uuid)) {
                                    node.questUuids.push({ uuid: dropData.uuid, name: doc.name });
                                    const idx = node.questUuids.length - 1;
                                    questListEl.insertAdjacentHTML("beforeend", `
                                        <div id="fang-quest-item-${idx}" class="fang-quest-item">
                                            <i class="fas fa-scroll" style="color:var(--fang-accent-gold);"></i>
                                            <span style="flex:1;font-size:0.9em;">${doc.name}</span>
                                            <button class="btn danger-btn fang-quest-remove" data-idx="${idx}" style="padding:2px 6px;width:auto;" title="Remove">
                                                <i class="fas fa-times"></i>
                                            </button>
                                        </div>
                                    `);
                                    refreshQuestRemoveButtons();
                                } else {
                                    ui.notifications.info("This Quest Journal is already linked.");
                                }
                            });
                        }
                    }
                },
                buttons: {
                    save: {
                        icon: '<i class="fas fa-save"></i>',
                        label: game.i18n.localize("FANG.Dialogs.BtnSave") || "Save & Close",
                        callback: async (html) => {
                            if (!node.playerLorePageId) {
                                const newLore = html.find("#fang-edit-lore").val().trim();
                                node.lore = newLore !== "" ? newLore : null;

                                const actorContext = this._getNodeActor(node);
                                if (actorContext) {
                                    if (node.lore) await actorContext.setFlag("fang", "legacyLore", node.lore);
                                    else await actorContext.unsetFlag("fang", "legacyLore");
                                }
                            }

                            // Re-evaluate Questgiver condition
                            if (node.questUuids && node.questUuids.length > 0 && !node.conditions.includes("questgiver")) {
                                node.conditions.push("questgiver");
                            } else if ((!node.questUuids || node.questUuids.length === 0) && node.conditions.includes("questgiver")) {
                                node.conditions = node.conditions.filter(c => c !== "questgiver");
                            }

                            this.ticked(); // Refresh visuals for questgiver
                            await this.saveData();
                        }
                    },
                    cancel: { icon: '<i class="fas fa-times"></i>', label: game.i18n.localize("FANG.Dialogs.BtnCancel") || "Cancel" }
                },
                default: "save"
            }, { classes: ["dialog", "fang-dialog"], width: 450 }).render(true);
        });

        // --- Context Action: Delete Node ---
        newBtnDelete.addEventListener("click", async () => {
            menu.classList.add("hidden");
            if (!this._canEditGraph()) return;

            const dialogTitle = game.i18n.localize("FANG.Dialogs.DeleteConfirmTitle") || "Confirm Deletion";
            const dialogContent = game.i18n.localize("FANG.Dialogs.DeleteNodeContent") || "Are you sure you want to delete this token from the graph? Your Player Lore notes will be kept safe.";

            new Dialog({
                title: dialogTitle,
                content: `<p style="margin-bottom: 15px;">${dialogContent}</p>`,
                buttons: {
                    yes: {
                        icon: '<i class="fas fa-check"></i>',
                        label: game.i18n.localize("Yes"),
                        callback: async () => {
                            this.graphData.nodes = this.graphData.nodes.filter(n => n.id !== node.id);
                            this.graphData.links = this.graphData.links.filter(l => {
                                const sId = typeof l.source === 'object' ? l.source.id : l.source;
                                const tId = typeof l.target === 'object' ? l.target.id : l.target;
                                return sId !== node.id && tId !== node.id;
                            });

                            ui.notifications.info(game.i18n.localize("FANG.Messages.DeletedNode"));
                            this.initSimulation();
                            this.simulation.alpha(0.3).restart();
                            this._populateActors();
                            await this.saveData();
                        }
                    },
                    no: {
                        icon: '<i class="fas fa-times"></i>',
                        label: game.i18n.localize("No"),
                        className: "cancel" // Applies the white/grey FANG cancel styling
                    }
                },
                default: "no"
            }, { classes: ["dialog", "fang-dialog"], width: 400 }).render(true);
        });
    }

    _onCanvasRightClick(event) {
        event.preventDefault();
        if (!this.transform) return;

        // Convert mouse coordinates to canvas coordinate space
        const bounds = this.canvas.getBoundingClientRect();
        const mouseX = event.clientX - bounds.left;
        const mouseY = event.clientY - bounds.top;

        const x = this.transform.invertX(mouseX);
        const y = this.transform.invertY(mouseY);

        // Find the clicked node
        const s2 = (30 * 30); // Base radius squared
        let clickedNode = null;
        let minD2 = s2;

        for (let node of this.graphData.nodes) {
            const dx = x - node.x;
            const dy = y - node.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < minD2) {
                clickedNode = node;
                minD2 = d2;
            }
        }

        if (clickedNode) {
            this._showContextMenu(clickedNode, mouseX, mouseY);
            return;
        }

        // If no node clicked, check for Edge click
        let clickedLinkIndex = -1;
        let minLDist = 15 / this.transform.k; // Threshold scaled by zoom

        this.graphData.links.forEach((link, idx) => {
            const s = link.source;
            const t = link.target;
            if (!s || !t || s.x === undefined || t.x === undefined) return;

            let dist;
            const pairInfo = this._linkCounts ? this._linkCounts[link.pairKey] : null;
            const totalParams = pairInfo ? pairInfo.total : 1;

            if (totalParams === 1) {
                // Linear hit detection
                dist = this._pointToSegmentDistance({ x, y }, s, t);
            } else {
                // Curved hit detection
                const linkIndex = pairInfo.links.indexOf(idx);
                const offsetMultiplier = (totalParams % 2 === 0)
                    ? (linkIndex % 2 === 0 ? 1 : -1) * (Math.floor(linkIndex / 2) + 0.5)
                    : (linkIndex === 0 ? 0 : (linkIndex % 2 === 0 ? 1 : -1) * Math.floor((linkIndex + 1) / 2));

                const ddx = t.x - s.x;
                const ddy = t.y - s.y;
                const ddist = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
                const spreadDistance = 12 + (ddist * 0.05) + (totalParams * 4);
                const finalOffset = offsetMultiplier * spreadDistance;

                const isCanonical = link.source.id < link.target.id;
                const cDx = isCanonical ? ddx : -ddx;
                const cDy = isCanonical ? ddy : -ddy;
                const cDist = ddist;
                const nx = -cDy / cDist;
                const ny = cDx / cDist;

                const midX = (s.x + t.x) / 2;
                const midY = (s.y + t.y) / 2;
                const ctrlX = midX + nx * finalOffset * 2;
                const ctrlY = midY + ny * finalOffset * 2;

                const numSamples = 25;
                let minDistToCurve = Infinity;
                let prevPx, prevPy;
                for (let step = 0; step <= numSamples; step++) {
                    const tVal = step / numSamples;
                    const u = 1 - tVal;
                    const px = (u * u) * s.x + 2 * u * tVal * ctrlX + (tVal * tVal) * t.x;
                    const py = (u * u) * s.y + 2 * u * tVal * ctrlY + (tVal * tVal) * t.y;

                    if (step > 0) {
                        const segDist = this._pointToSegmentDistance({ x, y }, { x: prevPx, y: prevPy }, { x: px, y: py });
                        if (segDist < minDistToCurve) minDistToCurve = segDist;
                    }
                    prevPx = px;
                    prevPy = py;
                }
                dist = minDistToCurve;
            }

            if (dist < minLDist) {
                clickedLinkIndex = idx;
                minLDist = dist;
            }
        });

        if (clickedLinkIndex !== -1) {
            this._showEdgeContextMenu(clickedLinkIndex, mouseX, mouseY);
        } else {
            // Hide menus if clicked elsewhere
            const menu = this.element.querySelector("#fang-context-menu");
            if (menu) menu.classList.add("hidden");
            const edgeMenu = this.element.querySelector("#fang-edge-context-menu");
            if (edgeMenu) edgeMenu.classList.add("hidden");

            // Local quick access: right-click on empty canvas opens search overlay.
            this._setSearchUiVisible(true, { focus: true });
        }
    }

    _onMouseMove(event) {
        if (!this.transform || this._isDragging) return;

        const rect = this.canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        const x = (mouseX - this.transform.x) / this.transform.k;
        const y = (mouseY - this.transform.y) / this.transform.k;

        let hoveredNode = null;
        let minNDist = 30; // Same radius as click

        for (const node of this.graphData.nodes) {
            const dx = x - node.x;
            const dy = y - node.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < minNDist) {
                hoveredNode = node;
                minNDist = dist;
            }
        }

        const newHoverId = hoveredNode ? hoveredNode.id : null;
        if (this._hoveredNodeId !== newHoverId) {
            this._hoveredNodeId = newHoverId;
            this.ticked(); // Trigger immediate redraw for focus effect
        }
    }

    _onMouseLeave() {
        if (this._hoveredNodeId !== null) {
            this._hoveredNodeId = null;
            this.ticked();
        }
    }

    _showEdgeContextMenu(linkIndex, mouseX, mouseY) {
        const menu = this.element.querySelector("#fang-edge-context-menu");
        if (!menu) return;

        const link = this.graphData.links[linkIndex];
        if (!link) return;

        // Position menu at cursor
        menu.style.left = `${mouseX}px`;
        menu.style.top = `${mouseY}px`;
        menu.classList.remove("hidden");

        const btnEdit = menu.querySelector("#ctxEditConnection");
        const btnSpotlight = menu.querySelector("#ctxEdgeSpotlight");
        const btnDelete = menu.querySelector("#ctxDeleteConnection");

        const newBtnEdit = btnEdit.cloneNode(true);
        const newBtnSpotlight = btnSpotlight.cloneNode(true);
        const newBtnDelete = btnDelete.cloneNode(true);

        btnEdit.parentNode.replaceChild(newBtnEdit, btnEdit);
        btnSpotlight.parentNode.replaceChild(newBtnSpotlight, btnSpotlight);
        btnDelete.parentNode.replaceChild(newBtnDelete, btnDelete);

        const hasLock = this._canEditGraph(true);
        newBtnEdit.style.display = hasLock ? "block" : "none";
        newBtnDelete.style.display = hasLock ? "block" : "none";
        newBtnSpotlight.style.display = "block"; // Always available

        // Action: Edit
        newBtnEdit.addEventListener("click", () => {
            menu.classList.add("hidden");
            if (!this._canEditGraph()) return;

            const title = game.i18n.localize("FANG.Dialogs.EditConnectionTitle") || "Informationen bearbeiten";
            const contentString = game.i18n.localize("FANG.Dialogs.EditConnectionContent") || "Zusätzliche Details für die Verbindung:";
            const lblName = game.i18n.localize("FANG.Dialogs.LabelInput") || "Bezeichnung (Label)";
            const lblInfo = game.i18n.localize("FANG.Dialogs.InfoInput") || "Notizen";

            new Dialog({
                title: title,
                content: `
                                < p > <strong>${contentString}</strong></p >
                    <div class="form-group" style="margin-bottom: 10px;">
                        <div class="form-fields">
                            <input type="text" id="fang-edit-link-name" value="${link.label || ""}" placeholder="${lblName}" style="width: 100%; font-family: var(--fang-font-main); padding: 5px;">
                        </div>
                    </div>
                    <div class="form-group" style="height: 150px;">
                        <textarea id="fang-edit-link-info" placeholder="${lblInfo}" style="width: 100%; height: 100%; resize: none; font-family: var(--fang-font-main); padding: 5px;">${link.info || ""}</textarea>
                    </div>
                `,
                buttons: {
                    save: {
                        icon: '<i class="fas fa-save"></i>',
                        label: game.i18n.localize("FANG.Dialogs.BtnSave") || "Save",
                        callback: async (html) => {
                            const newLabel = html.find("#fang-edit-link-name").val().trim();
                            const newInfo = html.find("#fang-edit-link-info").val().trim();
                            if (newLabel) link.label = newLabel;
                            link.info = newInfo !== "" ? newInfo : null;

                            this.initSimulation();
                            this.simulation.alpha(0.05).restart();
                            await this.saveData();
                            this._toggleLinkEditor(linkIndex); // Sync sidebar if open
                        }
                    },
                    cancel: { icon: '<i class="fas fa-times"></i>', label: game.i18n.localize("FANG.Dialogs.BtnCancel") || "Cancel" }
                },
                default: "save"
            }, { classes: ["dialog", "fang-dialog"], width: 450 }).render(true);
        });

        // Action: Delete
        newBtnDelete.addEventListener("click", async () => {
            menu.classList.add("hidden");
            if (!this._canEditGraph()) return;

            const dialogTitle = game.i18n.localize("FANG.Dialogs.DeleteConfirmTitle") || "Confirm Deletion";
            const dialogContent = game.i18n.localize("FANG.Dialogs.DeleteLinkContent") || "Are you sure you want to delete this connection?";

            new Dialog({
                title: dialogTitle,
                content: `<p style="margin-bottom: 15px;">${dialogContent}</p>`,
                buttons: {
                    yes: {
                        icon: '<i class="fas fa-check"></i>',
                        label: game.i18n.localize("Yes"),
                        callback: async () => {
                            this.graphData.links.splice(linkIndex, 1);
                            ui.notifications.info(game.i18n.localize("FANG.Messages.DeletedLink") || "Connection deleted.");
                            this.initSimulation();
                            this.simulation.alpha(0.3).restart();
                            this._toggleLinkEditor(-1); // Close sidebar link editor if it was open
                            await this.saveData();
                        }
                    },
                    no: {
                        icon: '<i class="fas fa-times"></i>',
                        label: game.i18n.localize("No"),
                        className: "cancel"
                    }
                },
                default: "no"
            }, { classes: ["dialog", "fang-dialog"], width: 400 }).render(true);
        });

        // Action: Edge Spotlight
        newBtnSpotlight.addEventListener("click", () => {
            menu.classList.add("hidden");
            this._onEdgeSpotlight(link);
        });
    }

    async _onCanvasClick(event) {
        // Prevent click logic if we just finished a drag
        if (Date.now() - (this._lastDragTime || 0) < 200) return;

        if (!this.transform) return;

        // Support both mouse and touch events
        const rect = event.target.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        const x = (mouseX - this.transform.x) / this.transform.k;
        const y = (mouseY - this.transform.y) / this.transform.k;

        // If d3.zoom or d3.drag already handled this, we might want to check for it
        // but for now, the 200ms guard handles the collision.

        // 1. Check Nodes (higher priority)
        let clickedNode = null;
        let minNDist = 30; // Radius selection threshold

        for (const node of this.graphData.nodes) {
            const dx = x - node.x;
            const dy = y - node.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < minNDist) {
                clickedNode = node;
                minNDist = dist;
            }
        }

        if (clickedNode) {
            this._syncSidebarSelection("node", clickedNode.id);
            return;
        }

        // 2. Check Links (lower priority)
        let clickedLinkIndex = -1;
        let minLDist = 15 / this.transform.k; // Threshold scaled by zoom

        this.graphData.links.forEach((link, idx) => {
            const s = link.source;
            const t = link.target;
            if (!s || !t || s.x === undefined || t.x === undefined) return;

            let dist;
            const pairInfo = this._linkCounts ? this._linkCounts[link.pairKey] : null;
            const totalParams = pairInfo ? pairInfo.total : 1;

            if (totalParams === 1) {
                // Linear hit detection
                dist = this._pointToSegmentDistance({ x, y }, s, t);
            } else {
                // Curved hit detection (Sampling with segment distance)
                const linkIndex = pairInfo.links.indexOf(idx);
                const offsetMultiplier = (totalParams % 2 === 0)
                    ? (linkIndex % 2 === 0 ? 1 : -1) * (Math.floor(linkIndex / 2) + 0.5)
                    : (linkIndex === 0 ? 0 : (linkIndex % 2 === 0 ? 1 : -1) * Math.floor((linkIndex + 1) / 2));

                const ddx = t.x - s.x;
                const ddy = t.y - s.y;
                const ddist = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
                // Match the rendering spreadDistance formula exactly
                const spreadDistance = 12 + (ddist * 0.05) + (totalParams * 4);
                const finalOffset = offsetMultiplier * spreadDistance;

                // Use canonical direction (A < B) for consistent normal vector
                const isCanonical = link.source.id < link.target.id;
                const cDx = isCanonical ? ddx : -ddx;
                const cDy = isCanonical ? ddy : -ddy;
                const cDist = ddist;
                const nx = -cDy / cDist;
                const ny = cDx / cDist;

                const midX = (s.x + t.x) / 2;
                const midY = (s.y + t.y) / 2;
                const ctrlX = midX + nx * finalOffset * 2;
                const ctrlY = midY + ny * finalOffset * 2;

                // Sample 25 points along the quadratic curve, using segment distance
                const numSamples = 25;
                let minDistToCurve = Infinity;
                let prevPx, prevPy;
                for (let step = 0; step <= numSamples; step++) {
                    const tVal = step / numSamples;
                    const u = 1 - tVal;
                    const px = (u * u) * s.x + 2 * u * tVal * ctrlX + (tVal * tVal) * t.x;
                    const py = (u * u) * s.y + 2 * u * tVal * ctrlY + (tVal * tVal) * t.y;

                    if (step > 0) {
                        // Use point-to-segment distance between consecutive samples
                        const segDist = this._pointToSegmentDistance({ x, y }, { x: prevPx, y: prevPy }, { x: px, y: py });
                        if (segDist < minDistToCurve) minDistToCurve = segDist;
                    }
                    prevPx = px;
                    prevPy = py;
                }
                dist = minDistToCurve;
            }

            if (dist < minLDist) {
                clickedLinkIndex = idx;
                minLDist = dist;
            }
        });

        if (clickedLinkIndex !== -1) {
            this._syncSidebarSelection("link", clickedLinkIndex);
        } else {
            // Clicked empty space - Reset sidebar selection and hide context menu
            this._syncSidebarSelection("none", null);
            const menu = this.element.querySelector("#fang-context-menu");
            if (menu) menu.classList.add("hidden");
            const edgeMenu = this.element.querySelector("#fang-edge-context-menu");
            if (edgeMenu) edgeMenu.classList.add("hidden");
        }
    }

    _pointToSegmentDistance(p, a, b) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const l2 = dx * dx + dy * dy;
        if (l2 === 0) return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2);
        let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
        t = Math.max(0, Math.min(1, t));
        return Math.sqrt((p.x - (a.x + t * dx)) ** 2 + (p.y - (a.y + t * dy)) ** 2);
    }

    _toggleLinkEditor(linkIndex) {
        const group = this.element.querySelector("#linkEditGroup");
        if (!group) return;

        if (linkIndex === -1) {
            group.classList.add("hidden");
            return;
        }

        const link = this.graphData.links[linkIndex];
        if (!link) {
            group.classList.add("hidden");
            return;
        }

        // Populate fields
        const labelInput = this.element.querySelector("#editLinkLabel");
        const dirCheckbox = this.element.querySelector("#editLinkDirectional");

        if (labelInput) labelInput.value = link.label || "";
        if (dirCheckbox) dirCheckbox.checked = !!link.directional;

        group.classList.remove("hidden");
    }

    _toggleNodeEditor(show) {
        const group = this.element.querySelector("#nodeEditGroup");
        if (!group) return;
        if (show) group.classList.remove("hidden");
        else group.classList.add("hidden");
    }

    async _onUpdateLink() {
        if (!this._canEditGraph()) return;

        const selectDelete = this.element.querySelector("#deleteSelect");
        const val = selectDelete.value;
        if (!val || !val.startsWith("link|")) return;

        const linkIndex = parseInt(val.split("|")[1]);
        const link = this.graphData.links[linkIndex];
        if (!link) return;

        const newLabel = this.element.querySelector("#editLinkLabel").value.trim();
        const newDirectional = this.element.querySelector("#editLinkDirectional").checked;

        if (!newLabel) {
            ui.notifications.warn(game.i18n.localize("FANG.Messages.WarningNoLabel"));
            return;
        }

        // Apply changes
        link.label = newLabel;
        link.directional = newDirectional;

        // Visual Refresh
        this.initSimulation();
        this.simulation.alpha(0.1).restart();
        this._populateActors(); // Refresh labels in dropdowns

        // Re-select to keep editor open with fresh data
        const newSelect = this.element.querySelector("#deleteSelect");
        if (newSelect) newSelect.value = `link|${linkIndex}`;

        await this.saveData();
        ui.notifications.info(game.i18n.localize("FANG.Messages.SaveSuccess") || "Changes saved.");
    }

    _syncSidebarSelection(type, id) {
        // Auto-switch to Editor Tab
        const editorTab = this.element.querySelector('.tab-btn[data-tab="editor"]');
        if (editorTab && !editorTab.classList.contains('active')) {
            editorTab.click();
        }

        if (type === "node") {
            const sourceSelect = this.element.querySelector("#sourceSelect");
            const deleteSelect = this.element.querySelector("#deleteSelect");

            if (sourceSelect) {
                sourceSelect.value = id;
            }
            if (deleteSelect) {
                deleteSelect.value = `node|${id}`;
            }
            // Trigger node UI
            this._toggleNodeEditor(true);
            this._toggleLinkEditor(-1);
        } else if (type === "link") {
            const deleteSelect = this.element.querySelector("#deleteSelect");
            if (deleteSelect) {
                deleteSelect.value = `link|${id}`;
            }
            // Trigger link UI
            this._toggleLinkEditor(id);
            this._toggleNodeEditor(false);
        } else if (type === "none") {
            const sourceSelect = this.element.querySelector("#sourceSelect");
            const deleteSelect = this.element.querySelector("#deleteSelect");
            if (sourceSelect) sourceSelect.value = "";
            if (deleteSelect) deleteSelect.value = "";

            this._toggleNodeEditor(false);
            this._toggleLinkEditor(-1);
        }
    }

    // --- D3 Logic ---

    resizeCanvas() {
        if (!this.canvas) return;

        const newWidth = this.canvas.parentElement.clientWidth;
        const newHeight = this.canvas.parentElement.clientHeight;

        // Prevent layout engines from triggering physics explosion when sized 0x0 temporarily
        if (newWidth === 0 || newHeight === 0) return;

        this.width = newWidth;
        this.height = newHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        if (this.simulation) {
            this.simulation.force("center", d3.forceCenter(this.width / 2, this.height / 2));
            this.simulation.force("x", d3.forceX(this.width / 2).strength(node => node.isCenter ? 0.4 : 0.025));
            this.simulation.force("y", d3.forceY(this.height / 2).strength(node => node.isCenter ? 0.4 : 0.025));
            this.simulation.alpha(0.1).restart(); // Lower alpha bump on resize to prevent wild scattering
        }

        // --- Monitor View Auto-Centering ---
        // If this is the monitor (no sidebar), we want to "pin" the view to the center
        if (game.user.name.toLowerCase().includes("monitor")) {
            if (this._monitorResizeTimeout) clearTimeout(this._monitorResizeTimeout);
            this._monitorResizeTimeout = setTimeout(() => this.zoomToFit(false), 100);
        }
    }

    _initD3() {
        this.canvas = this.element.querySelector("#graphCanvas");
        this.context = this.canvas.getContext("2d");
        if (!this.transform) this.transform = d3.zoomIdentity;
        this.width = this.canvas.parentElement.clientWidth;
        this.height = this.canvas.parentElement.clientHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;

        // Initialize simulation
        this.initSimulation();

        // Setup behaviors
        this.zoom = d3.zoom()
            .scaleExtent([0.1, 4])
            .on("zoom", this.zoomed.bind(this));

        d3.select(this.canvas)
            .call(d3.drag()
                .container(this.canvas)
                .subject(this.dragSubject.bind(this))
                .on("start", this.dragstarted.bind(this))
                .on("drag", this.dragged.bind(this))
                .on("end", this.dragended.bind(this)))
            .call(this.zoom);

        this.canvas.addEventListener("mousemove", this._onMouseMove.bind(this));
        this.canvas.addEventListener("mouseleave", this._onMouseLeave.bind(this));

        // Apply initial zoom-to-fit once on window open
        if (!this._initialZoomApplied && this.graphData.nodes.length > 0) {
            this._initialZoomApplied = true;
            // Delay slightly to allow simulation to get initial positions and container to settle
            setTimeout(() => this.zoomToFit(false), 200);
        }
    }

    initSimulation() {
        if (this.simulation) this.simulation.stop();

        const links = this.graphData.links.map(d => ({
            ...d,
            source: typeof d.source === "object" ? d.source.id : d.source,
            target: typeof d.target === "object" ? d.target.id : d.target
        }));
        const nodes = this.graphData.nodes.map(d => {
            const oldNode = this.graphData.nodes.find(n => n.id === d.id);
            let nInfo = d;
            if (oldNode && oldNode.x !== undefined) {
                nInfo = {
                    ...d,
                    x: oldNode.x,
                    y: oldNode.y,
                    vx: 0, // Reset velocity on load to prevent residual explosion
                    vy: 0, // Reset velocity on load to prevent residual explosion
                    isCenter: oldNode.isCenter || false
                };
            } else {
                nInfo = {
                    ...d,
                    x: this.width / 2 + (Math.random() - 0.5) * 50,
                    y: this.height / 2 + (Math.random() - 0.5) * 50,
                    isCenter: d.isCenter || false
                };
            }

            // Cache token image
            if (!nInfo.imgElement) {
                const imgSrc = this._getNodeImageSource(nInfo);
                const img = new Image();
                img.onerror = () => {
                    // Placeholder default image may not exist yet; keep a hard fallback.
                    if (nInfo?.isPlaceholder && img.src !== FANG_FALLBACK_PLACEHOLDER_IMG) {
                        img.src = FANG_FALLBACK_PLACEHOLDER_IMG;
                        return;
                    }
                    img.src = "icons/svg/mystery-man.svg";
                };
                img.src = imgSrc;
                img.onload = () => { if (this.simulation) this.simulation.alpha(0.05).restart(); };
                nInfo.imgElement = img;
            } else if (oldNode && oldNode.imgElement) {
                nInfo.imgElement = oldNode.imgElement;
            }
            return nInfo;
        });

        const cosmicWindEnabled = game.settings.get("fang", "enableCosmicWind");

        if (this.simulation) this.simulation.stop();
        this.simulation = d3.forceSimulation(nodes)
            .force("charge", d3.forceManyBody().strength(-1000))
            .force("link", d3.forceLink(links).id(d => d.id).distance(game.settings.get("fang", "tokenSize") * 4 + 140))
            .force("center", d3.forceCenter(this.width / 2, this.height / 2))
            .force("x", d3.forceX(this.width / 2).strength(node => node.isCenter ? 0.4 : 0.025))
            .force("y", d3.forceY(this.height / 2).strength(node => node.isCenter ? 0.4 : 0.025))
            .force("collide", d3.forceCollide().radius(game.settings.get("fang", "tokenSize") + 120))
            .force("link-avoidance", this._createLinkRepulsionForce())
            .on("tick", this.ticked.bind(this));

        // Start a pure visual render loop that triggers ticked() 60fps unconditionally
        if (this._animationFrameId) cancelAnimationFrame(this._animationFrameId);
        const renderLoop = () => {
            if (this.context && cosmicWindEnabled) {
                // Force an update when D3 is asleep (alpha below threshold)
                if (this.simulation && this.simulation.alpha() < 0.05) {
                    this.ticked();
                }
            }
            this._animationFrameId = requestAnimationFrame(renderLoop);
        };
        renderLoop();

        this.graphData.nodes = nodes;

        // --- Monitor View Auto-Centering (on Sync) ---
        if (game.user.name.toLowerCase().includes("monitor")) {
            setTimeout(() => this.zoomToFit(false), 300);
        }
        this.graphData.links = links;
    }

    _createLinkRepulsionForce() {
        let nodes;
        const force = (alpha) => {
            const links = this.graphData.links;
            const repulsionRadius = 80; // Increased: The-distance nodes must keep from lines
            const strength = 1.2 * alpha; // Slightly stronger push

            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];
                for (let j = 0; j < links.length; j++) {
                    const link = links[j];
                    if (!link.source || !link.target) continue;
                    // Don't repel from lines the node is directly attached to
                    if (link.source.id === node.id || link.target.id === node.id) continue;

                    const x1 = link.source.x, y1 = link.source.y;
                    const x2 = link.target.x, y2 = link.target.y;
                    const x0 = node.x, y0 = node.y;

                    let projX, projY;
                    const pairInfo = this._linkCounts ? this._linkCounts[link.pairKey] : null;
                    const totalParams = pairInfo ? pairInfo.total : 1;

                    if (totalParams === 1) {
                        // Mathematics for point-to-line-segment distance
                        const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
                        if (l2 === 0) continue;
                        let t = ((x0 - x1) * (x2 - x1) + (y0 - y1) * (y2 - y1)) / l2;
                        t = Math.max(0, Math.min(1, t)); // Constrain to segment
                        projX = x1 + t * (x2 - x1);
                        projY = y1 + t * (y2 - y1);
                    } else {
                        // For curved links, repel from the mid-point of the curve (simplified)
                        const linkIndex = pairInfo.links.indexOf(j);
                        const offsetMultiplier = (totalParams % 2 === 0) ? (linkIndex % 2 === 0 ? 1 : -1) * (Math.floor(linkIndex / 2) + 0.5) : (linkIndex === 0 ? 0 : (linkIndex % 2 === 0 ? 1 : -1) * Math.floor((linkIndex + 1) / 2));

                        // Use canonical direction (A < B) for consistent normal vector
                        const isCanonical = link.source.id < link.target.id;
                        const cX1 = isCanonical ? x1 : x2;
                        const cY1 = isCanonical ? y1 : y2;
                        const cX2 = isCanonical ? x2 : x1;
                        const cY2 = isCanonical ? y2 : y1;

                        const ddx = cX2 - cX1;
                        const ddy = cY2 - cY1;
                        const ddist = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
                        const spreadDistance = 12 + (ddist * 0.05) + (totalParams * 4);
                        const finalOffset = offsetMultiplier * spreadDistance;
                        const nx = -ddy / ddist;
                        const ny = ddx / ddist;
                        const midX = (x1 + x2) / 2;
                        const midY = (y1 + y2) / 2;
                        projX = midX + nx * finalOffset * 2;
                        projY = midY + ny * finalOffset * 2;
                    }

                    const dx = x0 - projX;
                    const dy = y0 - projY;
                    let dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < repulsionRadius) {
                        // Node is too close to line/curve center, repel perpendicularly
                        if (dist === 0) {
                            dist = 1;
                            node.vx += (Math.random() - 0.5) * strength * 10;
                            node.vy += (Math.random() - 0.5) * strength * 10;
                        } else {
                            const pushFactor = ((repulsionRadius - dist) / dist) * strength;
                            node.vx += dx * pushFactor;
                            node.vy += dy * pushFactor;
                        }
                    }
                }
            }
        };

        force.initialize = (_) => { nodes = _; };
        return force;
    }





    ticked() {
        if (!this.context) return;
        const transform = this.transform || globalThis.d3?.zoomIdentity || { x: 0, y: 0, k: 1 };
        if (!this.transform) this.transform = transform;

        // Visual Cosmic Wind Calculation (Does NOT affect D3 math)
        const cosmicWindEnabled = game.settings.get("fang", "enableCosmicWind");
        const amplitude = game.settings.get("fang", "cosmicWindStrength") || 4.0;
        const time = Date.now() * 0.003;
        const speed = 1.0;

        // Fetch Boss Aura Color safely (V13 ColorField returns a Color instance/Number, not a string)
        let centerColorRaw = game.settings.get("fang", "centerNodeColor");
        let centerColorHex = "#d4af37";
        if (centerColorRaw) {
            if (typeof centerColorRaw === "string") {
                centerColorHex = centerColorRaw;
            } else if (centerColorRaw.css) {
                centerColorHex = centerColorRaw.css;
            } else if (typeof centerColorRaw === "number") {
                centerColorHex = "#" + centerColorRaw.toString(16).padStart(6, '0');
            }
        }

        let auraR = 212, auraG = 175, auraB = 55; // Default Gold RGB
        if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(centerColorHex)) {
            let c = centerColorHex.substring(1).split('');
            if (c.length === 3) {
                c = [c[0], c[0], c[1], c[1], c[2], c[2]];
            }
            c = '0x' + c.join('');
            auraR = (c >> 16) & 255;
            auraG = (c >> 8) & 255;
            auraB = c & 255;
        }

        // Create a lookup for rendered positions
        const renderPos = {};
        this.graphData.nodes.forEach(node => {
            let rx = node.x;
            let ry = node.y;

            if (cosmicWindEnabled && (node.fx === undefined || node.fx === null)) {
                let hash = 0;
                for (let i = 0; i < node.id.length; i++) {
                    hash = node.id.charCodeAt(i) + ((hash << 5) - hash);
                }
                const phaseX = (hash % 100) / 100.0 * Math.PI * 2;
                const phaseY = ((hash >> 2) % 100) / 100.0 * Math.PI * 2;

                // Set X/Y drifting effect
                rx += Math.sin(time * speed + phaseX) * amplitude;
                ry += Math.cos(time * speed * 0.8 + phaseY) * amplitude;
            }
            renderPos[node.id] = { x: rx, y: ry };
        });

        // --- Hover focus logic ---
        const hoveredNodeId = this._hoveredNodeId;
        const connectedNodeIds = new Set();
        if (hoveredNodeId) {
            connectedNodeIds.add(hoveredNodeId);
            this.graphData.links.forEach(link => {
                const sId = typeof link.source === 'object' ? link.source.id : link.source;
                const tId = typeof link.target === 'object' ? link.target.id : link.target;
                if (sId === hoveredNodeId) connectedNodeIds.add(tId);
                if (tId === hoveredNodeId) connectedNodeIds.add(sId);
            });
        }

        const searchActive = !!this._normalizeSearchText(this._searchQuery).trim();
        const isolateSearch = searchActive && !!this._searchIsolate;
        const exactNodeMatches = this._searchMatchedNodeIds;
        const exactLinkMatches = this._searchMatchedLinkIndices;
        const visibleNodeIds = new Set();
        const getId = (ref) => (typeof ref === "object" ? ref?.id : ref);

        if (isolateSearch) {
            exactNodeMatches.forEach(id => visibleNodeIds.add(id));
            this.graphData.links.forEach((link, idx) => {
                if (!exactLinkMatches.has(idx)) return;
                const sId = getId(link.source);
                const tId = getId(link.target);
                if (sId) visibleNodeIds.add(sId);
                if (tId) visibleNodeIds.add(tId);
            });
        }

        this.context.save();
        this.context.clearRect(0, 0, this.width, this.height);
        this.context.translate(transform.x, transform.y);
        this.context.scale(transform.k, transform.k);

        // --- Draw Direct Faction Member Links (Ring Topology + Adaptive Rendering) ---
        // Drawing these FIRST ensures they are UNDERNEATH regular links and nodes
        if (this.graphData.showFactionLines !== false && this.graphData.factions && this.graphData.factions.length > 0) {
            // Build a set of existing regular link pairs for overlap detection
            const regularLinkPairs = new Set();
            this.graphData.links.forEach(l => {
                const sId = typeof l.source === 'object' ? l.source.id : l.source;
                const tId = typeof l.target === 'object' ? l.target.id : l.target;
                regularLinkPairs.add(sId < tId ? `${sId} - ${tId}` : `${tId} - ${sId}`);
            });

            this.graphData.factions.forEach(faction => {
                const members = this.graphData.nodes.filter(n => n.factionId === faction.id);
                if (members.length < 2) return;

                // 1. Calculate Centroid for sorting
                let cx = 0, cy = 0;
                members.forEach(m => {
                    const pos = renderPos[m.id];
                    cx += pos.x;
                    cy += pos.y;
                });
                cx /= members.length;
                cy /= members.length;

                // 2. Sort members by angle to create a clean perimeter ring
                const sortedMembers = [...members].sort((a, b) => {
                    const posA = renderPos[a.id];
                    const posB = renderPos[b.id];
                    return Math.atan2(posA.y - cy, posA.x - cx) - Math.atan2(posB.y - cy, posB.x - cx);
                });

                this.context.save();
                this.context.setLineDash([8, 8]);
                this.context.strokeStyle = faction.color || "#ffffff";

                // Dim faction lines if hover is active and none of the members are hovered/connected
                if (hoveredNodeId) {
                    const hasRelevantMember = members.some(m => connectedNodeIds.has(m.id));
                    this.context.globalAlpha = hasRelevantMember ? 0.4 : 0.1;
                }

                for (let i = 0; i < sortedMembers.length; i++) {
                    const node1 = sortedMembers[i];
                    const node2 = sortedMembers[(i + 1) % sortedMembers.length];
                    if (isolateSearch && (!visibleNodeIds.has(node1.id) || !visibleNodeIds.has(node2.id))) continue;

                    const m1 = renderPos[node1.id];
                    const m2 = renderPos[node2.id];
                    if (!m1 || !m2) continue;

                    const pairKey = node1.id < node2.id ? `${node1.id} - ${node2.id}` : `${node2.id} - ${node1.id}`;
                    const hasRegularLink = regularLinkPairs.has(pairKey);

                    if (hasRegularLink) {
                        // Adaptive Glow: Draw a wider, faint background trail behind the regular link
                        this.context.lineWidth = 6;
                        this.context.globalAlpha = 0.2;
                    } else {
                        // Sharp default: Sharp thin dashed line
                        this.context.lineWidth = 1.5;
                        this.context.globalAlpha = 0.5; // Slightly transparent to keep it premium
                    }

                    this.context.beginPath();
                    this.context.moveTo(m1.x, m1.y);
                    this.context.lineTo(m2.x, m2.y);
                    this.context.stroke();
                }
                this.context.restore();
            });
        }
        // ----------------------------------------------------
        // ----------------------------------------------------

        // Draw Links
        const nodeRadius = game.settings.get("fang", "tokenSize") || 33;
        this.context.lineWidth = 2;
        this.context.strokeStyle = "#888";
        const linkFontSize = Math.max(12, Math.floor(nodeRadius / 2.5));
        this.context.font = `${linkFontSize}px 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif`;
        this.context.textAlign = "center";
        this.context.textBaseline = "middle";

        this._linkCounts = {};
        this.graphData.links.forEach((link, i) => {
            const pairKey = link.source.id < link.target.id
                ? `${link.source.id} - ${link.target.id}`
                : `${link.target.id} - ${link.source.id}`;

            if (!this._linkCounts[pairKey]) {
                this._linkCounts[pairKey] = { total: 0, links: [] };
            }
            this._linkCounts[pairKey].total++;
            this._linkCounts[pairKey].links.push(i);
            link.pairKey = pairKey;
        });

        const labelsToDraw = [];

        this.graphData.links.forEach((link, i) => {
            const pairInfo = this._linkCounts[link.pairKey];
            const linkIndex = pairInfo.links.indexOf(i);
            const totalParams = pairInfo.total;

            const sIdRaw = typeof link.source === 'object' ? link.source.id : link.source;
            const tIdRaw = typeof link.target === 'object' ? link.target.id : link.target;
            const showLinkInIsolate = exactLinkMatches.has(i)
                || (visibleNodeIds.has(sIdRaw) && visibleNodeIds.has(tIdRaw) && exactNodeMatches.has(sIdRaw) && exactNodeMatches.has(tIdRaw));
            if (isolateSearch && !showLinkInIsolate) return;

            const sPos = renderPos[link.source.id];
            const tPos = renderPos[link.target.id];

            const dx = tPos.x - sPos.x;
            const dy = tPos.y - sPos.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const midX = (sPos.x + tPos.x) / 2;
            const midY = (sPos.y + tPos.y) / 2;

            let ctrlX, ctrlY, labelX, labelY;

            const sId = sIdRaw;
            const tId = tIdRaw;
            const isRelevantLink = hoveredNodeId ? (sId === hoveredNodeId || tId === hoveredNodeId) : true;

            this.context.save();
            this.context.globalAlpha = isRelevantLink ? 1.0 : 0.15;

            this.context.lineWidth = 2;
            this.context.strokeStyle = "#888";

            const arrowSize = 10;

            const drawArrowhead = (context, x, y, angle) => {
                context.save();
                context.translate(x, y);
                context.rotate(angle);
                context.beginPath();
                context.moveTo(0, 0);
                context.lineTo(-arrowSize, arrowSize / 2);
                context.lineTo(-arrowSize, -arrowSize / 2);
                context.closePath();
                context.fillStyle = "#888";
                context.fill();
                context.restore();
            };

            const getNodeBoundOffset = (node, rayAngle) => {
                let R = nodeRadius + 2;
                this.context.font = "bold 15px 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
                const tWidth = Math.max(this.context.measureText(node.name).width, 40);
                const halfW = (tWidth / 2) + 12;
                const topY = nodeRadius - 10;
                const bottomY = nodeRadius + (node.role ? 42 : 28);

                const vx = Math.cos(rayAngle);
                const vy = Math.sin(rayAngle);

                if (vy > 0) {
                    const t_bottom = bottomY / vy;
                    if (Math.abs(t_bottom * vx) <= halfW) return Math.max(R, t_bottom);
                }
                if (vx !== 0) {
                    const t_side = halfW / Math.abs(vx);
                    const y_hit = t_side * vy;
                    if (y_hit >= topY && y_hit <= bottomY) return Math.max(R, t_side);
                }
                return R;
            };

            if (totalParams === 1) {
                ctrlX = midX;
                ctrlY = midY;

                let angle = Math.atan2(dy, dx);
                const offsetTarget = getNodeBoundOffset(link.target, angle + Math.PI);
                const offsetSource = getNodeBoundOffset(link.source, angle);

                const sourceX = sPos.x;
                const sourceY = sPos.y;
                const targetX = link.directional ? tPos.x - Math.cos(angle) * offsetTarget : tPos.x;
                const targetY = link.directional ? tPos.y - Math.sin(angle) * offsetTarget : tPos.y;

                labelX = sourceX + (targetX - sourceX) * 0.5;
                labelY = sourceY + (targetY - sourceY) * 0.5;

                this.context.beginPath();
                this.context.moveTo(sourceX, sourceY);

                let dTX = link.directional ? targetX - Math.cos(angle) * (arrowSize - 3) : targetX;
                let dTY = link.directional ? targetY - Math.sin(angle) * (arrowSize - 3) : targetY;

                this.context.lineTo(dTX, dTY);
                this.context.stroke();

                if (link.directional) drawArrowhead(this.context, targetX, targetY, angle);
            } else {
                let offsetMultiplier = 0;
                if (totalParams % 2 === 0) {
                    offsetMultiplier = (linkIndex % 2 === 0 ? 1 : -1) * (Math.floor(linkIndex / 2) + 0.5);
                } else {
                    if (linkIndex !== 0) {
                        offsetMultiplier = (linkIndex % 2 === 0 ? 1 : -1) * Math.floor((linkIndex + 1) / 2);
                    }
                }

                const spreadDistance = 12 + (dist * 0.05) + (totalParams * 4); // Aesthetic Tighter curves
                const finalOffset = offsetMultiplier * spreadDistance;

                const nx = -dy / dist, ny = dx / dist;
                const isCanonical = link.source.id < link.target.id;
                const fNx = isCanonical ? nx : -nx, fNy = isCanonical ? ny : -ny;

                ctrlX = midX + fNx * finalOffset * 2;
                ctrlY = midY + fNy * finalOffset * 2;

                let targetAngle = Math.atan2(tPos.y - ctrlY, tPos.x - ctrlX);
                let sourceAngle = Math.atan2(ctrlY - sPos.y, ctrlX - sPos.x);

                const offsetTarget = getNodeBoundOffset(link.target, targetAngle + Math.PI);
                const offsetSource = getNodeBoundOffset(link.source, sourceAngle);

                const sourceX = sPos.x;
                const sourceY = sPos.y;
                const targetX = link.directional ? tPos.x - Math.cos(targetAngle) * offsetTarget : tPos.x;
                const targetY = link.directional ? tPos.y - Math.sin(targetAngle) * offsetTarget : tPos.y;

                const t1 = offsetSource / Math.max(dist, 1);
                const t2 = 1.0 - (offsetTarget / Math.max(dist, 1));

                const minStep = 45 / Math.max(dist, 1);
                const staggerStep = Math.min(0.2, Math.max(0.12, minStep));
                const stagger = (linkIndex - (totalParams - 1) / 2) * staggerStep;
                const tMid = Math.min(Math.max((t1 + t2) / 2 + stagger, 0.3), 0.7);

                const u = 1.0 - tMid;
                labelX = (u * u) * sPos.x + 2 * u * tMid * ctrlX + (tMid * tMid) * tPos.x;
                labelY = (u * u) * sPos.y + 2 * u * tMid * ctrlY + (tMid * tMid) * tPos.y;

                // Removed forced nudge to keep labels perfectly centered on the line by default

                this.context.beginPath();
                this.context.moveTo(sourceX, sourceY);

                let dTX = link.directional ? targetX - Math.cos(targetAngle) * (arrowSize - 3) : targetX;
                let dTY = link.directional ? targetY - Math.sin(targetAngle) * (arrowSize - 3) : targetY;

                this.context.quadraticCurveTo(ctrlX, ctrlY, dTX, dTY);
                this.context.stroke();

                if (link.directional) drawArrowhead(this.context, targetX, targetY, targetAngle);
            }

            if (link.label) {
                const linkFontSize = Math.max(12, Math.floor(nodeRadius / 2.5));
                this.context.font = `${linkFontSize}px 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif`;
                const met = this.context.measureText(link.label);
                labelsToDraw.push({
                    text: link.label, x: labelX, y: labelY,
                    w: met.width + 10, h: linkFontSize + 6, fs: linkFontSize,
                    alpha: this.context.globalAlpha
                });
            }
            this.context.restore();
        });

        // Inter-pair Label Collision Repulsion (12 iterations for stability)
        for (let iter = 0; iter < 12; iter++) {
            for (let i = 0; i < labelsToDraw.length; i++) {
                const a = labelsToDraw[i];
                for (let j = i + 1; j < labelsToDraw.length; j++) {
                    const b = labelsToDraw[j];
                    const dx = a.x - b.x, dy = a.y - b.y;
                    const hD = (a.w + b.w) / 2 + 2, vD = (a.h + b.h) / 2 + 2;

                    if (Math.abs(dx) < hD && Math.abs(dy) < vD) {
                        const overlapX = hD - Math.abs(dx), overlapY = vD - Math.abs(dy);
                        if (overlapX < overlapY) {
                            const push = overlapX * (dx > 0 ? 1 : -1) * 0.5;
                            a.x += push; b.x -= push;
                        } else {
                            const push = overlapY * (dy > 0 ? 1 : -1) * 0.5;
                            a.y += push; b.y -= push;
                        }
                    }
                }
            }
        }

        // Draw Labels at resolved positions
        labelsToDraw.forEach(l => {
            this.context.save();
            this.context.globalAlpha = l.alpha;
            this.context.font = `${l.fs}px 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif`;
            this.context.fillStyle = "#ffffff";
            this.context.beginPath();
            this.context.roundRect(l.x - l.w / 2, l.y - l.h / 2, l.w, l.h, 4);
            this.context.fill();
            this.context.lineWidth = 1;
            this.context.strokeStyle = "#dcd6cc";
            this.context.stroke();
            this.context.fillStyle = "#1a1a1a";
            this.context.fillText(l.text, l.x, l.y);
            this.context.restore();
        });

        // --- Condition Constants (from project palette) ---
        const FANG_CONDITIONS = {
            deceased: { color: "#3d3d3d", icon: "\uf54c" }, // fa-skull
            missing: { color: "#4a6a8a", icon: "\uf059" }, // fa-question-circle
            captured: { color: "#8B0000", icon: "\uf0c1" }, // fa-link
            questgiver: { color: "#D4AF37", icon: "\uf70e" }  // fa-scroll
        };

        // Draw Nodes
        const radius = game.settings.get("fang", "tokenSize") || 33;
        const isGM = game.user.isGM;

        this.graphData.nodes.forEach(node => {
            const pos = renderPos[node.id];
            const isHidden = node.hidden && !isGM;
            const conditions = node.conditions || [];
            const isDeceased = conditions.includes("deceased");
            const isMissing = conditions.includes("missing");
            if (isolateSearch && !visibleNodeIds.has(node.id)) return;

            const isRelevantNode = hoveredNodeId ? connectedNodeIds.has(node.id) : true;

            this.context.save();
            this.context.globalAlpha = isRelevantNode ? 1.0 : 0.15;

            // --- Condition: Missing -> halbtransparent ---
            if (isMissing) {
                this.context.globalAlpha *= 0.5;
            }

            // -----------------------------
            const faction = node.factionId ? this.graphData.factions.find(f => f.id === node.factionId) : null;

            // --- Draw Center (Boss) Aura ---
            if (node.isCenter) {
                this.context.beginPath();
                this.context.arc(pos.x, pos.y, radius + 2, 0, Math.PI * 2);
                this.context.strokeStyle = `rgba(${auraR}, ${auraG}, ${auraB}, 0.8)`;
                this.context.lineWidth = 4;
                this.context.shadowBlur = 15;
                this.context.shadowColor = `rgba(${auraR}, ${auraG}, ${auraB}, 1)`;
                this.context.stroke();
                this.context.shadowBlur = 0;
            }

            // Search highlight ring for exact node matches
            if (searchActive && exactNodeMatches.has(node.id)) {
                this.context.beginPath();
                this.context.arc(pos.x, pos.y, radius + 8, 0, Math.PI * 2);
                this.context.strokeStyle = "rgba(212, 175, 55, 0.95)";
                this.context.lineWidth = 3;
                this.context.shadowBlur = 14;
                this.context.shadowColor = "rgba(212, 175, 55, 0.85)";
                this.context.stroke();
                this.context.shadowBlur = 0;
            }
            // -----------------------------

            // --- Draw Token Image ---
            // Apply visual filters for conditions and hidden state
            const needsFilter = isDeceased || isHidden;
            if (needsFilter) {
                const filters = [];
                if (isDeceased) filters.push("grayscale(1)");
                if (isHidden) filters.push("blur(10px) brightness(0.65)");
                this.context.filter = filters.join(" ");
            }

            if (node.imgElement && node.imgElement.complete && node.imgElement.naturalWidth !== 0) {
                this.context.drawImage(node.imgElement, pos.x - radius, pos.y - radius, radius * 2, radius * 2);
            } else {
                this.context.beginPath();
                this.context.arc(pos.x, pos.y, radius, 0, Math.PI * 2, true);
                this.context.fillStyle = "#b91c1c";
                this.context.fill();
                this.context.lineWidth = 3;
                this.context.strokeStyle = "#d97706";
                this.context.stroke();
            }

            // Reset filter after token image
            if (needsFilter) {
                this.context.filter = "none";
            }

            // Soft dark overlay for hidden tokens (obscure but keep silhouette)
            if (isHidden) {
                this.context.beginPath();
                this.context.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
                this.context.fillStyle = "rgba(20, 20, 30, 0.3)";
                this.context.fill();
            }

            // --- Faction Icon (Top-Left corner) ---
            if (faction && faction.icon && !isHidden) {
                if (!this._iconCache) this._iconCache = {};
                let img = this._iconCache[faction.icon];
                if (!img) {
                    img = new Image();
                    img.src = faction.icon;
                    this._iconCache[faction.icon] = img;
                }

                if (img.complete && img.naturalWidth > 0) {
                    const iconSize = 24;
                    const offset = radius * 0.7;
                    this.context.drawImage(img, pos.x - offset - iconSize / 2, pos.y - offset - iconSize / 2, iconSize, iconSize);
                }
            }

            this.context.restore();

            // --- Condition Badges (drawn AFTER restore so token effects don't leak) ---
            if (conditions.length > 0) {
                const badgeRadius = 10;
                conditions.forEach((cond, ci) => {
                    const condDef = FANG_CONDITIONS[cond];
                    if (!condDef) return;
                    const angle = -Math.PI / 2 + (ci - (conditions.length - 1) / 2) * 0.55;
                    const bx = pos.x + Math.cos(angle) * (radius + badgeRadius + 2);
                    const by = pos.y + Math.sin(angle) * (radius + badgeRadius + 2);

                    // Badge circle background
                    this.context.beginPath();
                    this.context.arc(bx, by, badgeRadius, 0, Math.PI * 2);
                    this.context.fillStyle = condDef.color;
                    this.context.fill();
                    this.context.lineWidth = 1.5;
                    // Icon Style (FontAwesome)
                    this.context.fillStyle = "#e8e0d4";
                    this.context.font = '900 13px "Font Awesome 6 Pro", "Font Awesome 6 Free", "FontAwesome"';
                    this.context.textAlign = "center";
                    this.context.textBaseline = "middle";
                    this.context.fillText(condDef.icon, bx, by);
                });
            }

            // --- GM Hidden Indicator Badge ---
            if (node.hidden && isGM) {
                const hbx = pos.x - radius - 4;
                const hby = pos.y - radius - 4;
                this.context.beginPath();
                this.context.arc(hbx, hby, 9, 0, Math.PI * 2);
                this.context.fillStyle = "rgba(80, 70, 100, 0.85)";
                this.context.fill();
                this.context.lineWidth = 1;
                this.context.strokeStyle = "rgba(255,255,255,0.15)";
                this.context.stroke();

                // Eye-slash icon (FontAwesome)
                this.context.fillStyle = "#e8e0d4";
                this.context.font = '900 12px "Font Awesome 6 Pro", "Font Awesome 6 Free", "FontAwesome"';
                this.context.textAlign = "center";
                this.context.textBaseline = "middle";
                this.context.fillText("\uf070", hbx, hby); // fa-eye-slash
            }

            // --- Determine displayed name ---
            const isPlayerView = !isGM;
            let shownName;
            let shownRole;
            if (node.hidden && isPlayerView) {
                shownName = node.displayName || game.i18n.localize("FANG.Dropdowns.Unknown");
                shownRole = null; // Hide role for hidden tokens
            } else {
                shownName = node.name;
                shownRole = node.role;
            }

            // Draw Label Background for readability
            const nodeFontSize = 15;
            const roleFontSize = 12;
            this.context.font = `bold ${nodeFontSize}px 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif`;
            const metrics = this.context.measureText(shownName);
            let textWidth = Math.max(metrics.width, 40);

            let roleTextWidth = 0;
            if (shownRole) {
                this.context.font = `italic ${roleFontSize}px 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif`;
                roleTextWidth = this.context.measureText(shownRole).width;
                textWidth = Math.max(textWidth, roleTextWidth);
            }

            const textHeight = shownRole ? 36 : 22;
            const labelYOffset = radius + (shownRole ? 18 : 11);

            this.context.fillStyle = "rgba(0, 0, 0, 0.8)";
            this.context.beginPath();
            this.context.roundRect(pos.x - textWidth / 2 - 6, pos.y + labelYOffset - textHeight / 2, textWidth + 12, textHeight, 6);
            this.context.fill();

            // Gold border for text box
            this.context.lineWidth = 1.5;
            this.context.strokeStyle = "#d4af37";
            this.context.stroke();

            // Draw Node Name Text
            this.context.font = `bold ${nodeFontSize}px 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif`;
            this.context.fillStyle = "#ffffff";
            this.context.textAlign = "center";
            this.context.textBaseline = "middle";
            this.context.fillText(shownName, pos.x, pos.y + labelYOffset - (shownRole ? 7 : 0));

            // Draw Role Text
            if (shownRole) {
                this.context.font = `italic ${roleFontSize}px 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif`;
                this.context.fillStyle = "#dcd6cc";
                this.context.fillText(shownRole, pos.x, pos.y + labelYOffset + 8);
            }
        });


        // ------------------------------------------

        this.context.restore();

        // --- Draw Faction Legend (Bottom-Right) ---
        if (this.graphData.showFactionLegend !== false && this.graphData.factions && this.graphData.factions.length > 0) {
            this.context.save();
            const padding = 10;
            const itemHeight = 30;
            const iconSize = 20;
            const legendWidth = 180;
            const legendHeight = (this.graphData.factions.length * itemHeight) + (padding * 2);

            const startX = this.width - legendWidth - 20;
            const startY = this.height - legendHeight - 20;

            // Background Box
            this.context.fillStyle = "rgba(0, 0, 0, 0.7)";
            this.context.strokeStyle = "#d4af37";
            this.context.lineWidth = 1.5;
            this.context.beginPath();
            this.context.roundRect(startX, startY, legendWidth, legendHeight, 8);
            this.context.fill();
            this.context.stroke();

            // Legend Items
            this.context.textAlign = "left";
            this.context.textBaseline = "middle";
            this.context.font = "bold 13px 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";

            this.graphData.factions.forEach((f, i) => {
                const itemY = startY + padding + (i * itemHeight) + (itemHeight / 2);

                // Draw Icon or Color Circle
                if (f.icon) {
                    if (!this._iconCache) this._iconCache = {};
                    let img = this._iconCache[f.icon];
                    if (!img) {
                        img = new Image();
                        img.src = f.icon;
                        this._iconCache[f.icon] = img;
                    }
                    if (img.complete && img.naturalWidth > 0) {
                        this.context.drawImage(img, startX + padding, itemY - iconSize / 2, iconSize, iconSize);
                    } else {
                        // Temp fallback color dot if image not loaded
                        this.context.beginPath();
                        this.context.arc(startX + padding + iconSize / 2, itemY, iconSize / 3, 0, Math.PI * 2);
                        this.context.fillStyle = f.color || "#ffffff";
                        this.context.fill();
                    }
                } else {
                    this.context.beginPath();
                    this.context.arc(startX + padding + iconSize / 2, itemY, iconSize / 3, 0, Math.PI * 2);
                    this.context.fillStyle = f.color || "#ffffff";
                    this.context.fill();
                }

                // Name Text
                this.context.fillStyle = "#ffffff";
                const textX = startX + padding + iconSize + 10;
                // Clip text if it's too long
                const maxWidth = legendWidth - (padding * 2) - iconSize - 10;
                let name = f.name;
                if (this.context.measureText(name).width > maxWidth) {
                    while (name.length > 0 && this.context.measureText(name + "...").width > maxWidth) {
                        name = name.slice(0, -1);
                    }
                    name += "...";
                }
                this.context.fillText(name, textX, itemY);
            });

            this.context.restore();
        }
    }

    dragSubject(event) {
        const radius = game.settings.get("fang", "tokenSize") || 33;
        let s2 = (radius + 10) * (radius + 10) * this.transform.k; // Increased drag target slop 
        let subject = null;
        let x = this.transform.invertX(event.x);
        let y = this.transform.invertY(event.y);

        // 1. Check if we clicked a node
        for (let node of this.graphData.nodes) {
            let dx = x - node.x;
            let dy = y - node.y;
            let d2 = dx * dx + dy * dy;
            if (d2 < s2) {
                subject = { type: 'node', data: node };
                s2 = d2;
            }
        }



        return subject;
    }

    dragstarted(event) {
        if (!this._canEditGraph(true)) return;
        if (!event.active) this.simulation.alphaTarget(0.3).restart();
        if (event.subject.type === 'node') {
            event.subject.data.fx = event.subject.data.x;
            event.subject.data.fy = event.subject.data.y;
            // Immediate selection in sidebar when grabbing a node
            this._syncSidebarSelection("node", event.subject.data.id);
        }
        this._hasDragged = false;

        // Hide tooltip immediately when dragging starts
        if (this._hoverTimeout) {
            clearTimeout(this._hoverTimeout);
            this._hoverTimeout = null;
        }
        this._tooltipVisibleForNode = null;
        const tooltip = this.element.querySelector("#fang-tooltip");
        if (tooltip) tooltip.classList.add("hidden");
    }

    dragged(event) {
        if (event.subject.type === 'node') {
            if (!this._canEditGraph(true)) return; // Silent during rapid drag events
            // Invert coordinates to account for zoom/pan
            event.subject.data.fx = this.transform.invertX(event.x);
            event.subject.data.fy = this.transform.invertY(event.y);
            this._hasDragged = true;
        }
    }

    dragended(event) {
        if (!this._canEditGraph(true)) return; // Silent at end
        if (!event.active) this.simulation.alphaTarget(0);
        if (event.subject.type === 'node') {
            event.subject.data.fx = null;
            event.subject.data.fy = null;
        }
        if (this._hasDragged) {
            this._lastDragTime = Date.now();
        }
        // Save position data after drag
        this.saveData();
    }

    zoomed(event) {
        this.transform = event.transform;
        this.ticked();

        // Hide UI elements on pan/zoom
        const menu = this.element.querySelector("#fang-context-menu");
        if (menu) menu.classList.add("hidden");
        const tooltip = this.element.querySelector("#fang-tooltip");
        if (tooltip) tooltip.classList.add("hidden");

        if (this._hoverTimeout) {
            clearTimeout(this._hoverTimeout);
            this._hoverTimeout = null;
        }
        this._tooltipVisibleForNode = null;

        // Broadcast camera sync if active and we are GM
        if (this._isSyncCameraActive && game.user.isGM && !this._remoteSyncing) {
            game.socket.emit("module.fang", {
                action: "syncCamera",
                payload: {
                    x: event.transform.x,
                    y: event.transform.y,
                    k: event.transform.k
                }
            });
        }
    }

    /**
     * Re-centers the graph and adjusts zoom so all nodes are visible.
     * @param {boolean} transition - Whether to animate the transition.
     */
    // Re-centers the graph and adjusts zoom so all nodes are visible.
    // @param {boolean} transition - Whether to animate the transition.
    zoomToFit(transition = true) {
        const isMonitor = game.user.name.toLowerCase().includes("monitor");
        // Centering is a view-only operation — no edit lock required
        if (!this.canvas || !this.zoom || !this.graphData.nodes.length) return;

        const padding = 60;
        const width = isMonitor ? window.innerWidth : this.width;
        const height = isMonitor ? window.innerHeight : this.height;
        const sidebar = this.element ? this.element.querySelector(".sidebar") : null;
        const actualWidth = (sidebar && sidebar.style.display !== "none") ? width - 300 : width;

        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        this.graphData.nodes.forEach(d => {
            if (d.x < x0) x0 = d.x;
            if (d.y < y0) y0 = d.y;
            if (d.x > x1) x1 = d.x;
            if (d.y > y1) y1 = d.y;
        });

        // Add padding for token size + margin
        const nodeRadius = game.settings.get("fang", "tokenSize") || 40;
        const totalPadding = nodeRadius + padding;
        x0 -= totalPadding;
        y0 -= totalPadding;
        x1 += totalPadding;
        y1 += totalPadding;

        // Default: Center on the geometric middle of the bounding box
        let midX = (x0 + x1) / 2;
        let midY = (y0 + y1) / 2;

        // EXCLUSIVE: PIVOT ON BOSS NODES FOR MONITOR
        const centerNodes = this.graphData.nodes.filter(n => n.isCenter);
        if (isMonitor && centerNodes.length > 0) {
            midX = centerNodes.reduce((acc, n) => acc + n.x, 0) / centerNodes.length;
            midY = centerNodes.reduce((acc, n) => acc + n.y, 0) / centerNodes.length;
        }

        const dx = Math.max(x1 - x0, 100);
        const dy = Math.max(y1 - y0, 100);

        let scale;
        if (isMonitor && centerNodes.length > 0) {
            // Symmetrical scale for Monitor: 
            // Calculate distance to furthest edge from the BOSS mid-point
            const distRight = x1 - midX;
            const distLeft = midX - x0;
            const distBottom = y1 - midY;
            const distTop = midY - y0;
            const maxDX = Math.max(distRight, distLeft) * 2;
            const maxDY = Math.max(distBottom, distTop) * 2;
            scale = 0.9 / Math.max(maxDX / width, maxDY / height);
        } else {
            scale = 0.95 / Math.max(dx / width, dy / height);
        }

        // Constrain extreme zoom
        if (!isFinite(scale) || scale > 1.0) scale = 1.0;
        if (scale < 0.1) scale = 0.1;

        const transform = d3.zoomIdentity
            .translate(width / 2, height / 2)
            .scale(scale)
            .translate(-midX, -midY);

        if (transition) {
            d3.select(this.canvas).transition().duration(750).call(this.zoom.transform, transform);
        } else {
            d3.select(this.canvas).call(this.zoom.transform, transform);
        }
    }
    _handleCanvasMouseMove(event) {
        if (!this.transform) return;

        const bounds = this.canvas.getBoundingClientRect();
        const mouseX = event.clientX - bounds.left;
        const mouseY = event.clientY - bounds.top;

        const x = this.transform.invertX(mouseX);
        const y = this.transform.invertY(mouseY);

        const radius = game.settings.get("fang", "tokenSize") || 33;
        const s2 = (radius * radius); // Node radius squared
        let hoveredNode = null;
        let minD2 = s2;

        for (let node of this.graphData.nodes) {
            const dx = x - node.x;
            const dy = y - node.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < minD2) {
                hoveredNode = node;
                minD2 = d2;
            }
        }

        const tooltip = this.element.querySelector("#fang-tooltip");
        if (!tooltip) return;

        // If the hovered node changed or we stopped hovering:
        if (this._hoveredNodeId !== (hoveredNode ? hoveredNode.id : null)) {
            // Clear existing timeout
            if (this._hoverTimeout) {
                clearTimeout(this._hoverTimeout);
                this._hoverTimeout = null;
            }
            this._hoveredNodeId = hoveredNode ? hoveredNode.id : null;
            this._tooltipVisibleForNode = null;

            // Hide tooltip immediately when moving off a node or onto a new one
            tooltip.classList.add("hidden");

            // Determine cursor: pointer for nodes, pointer for hoverable links, grab otherwise
            if (hoveredNode) {
                this.canvas.style.cursor = "pointer";
            } else {
                // Check if hovering over a link
                let overLink = false;
                const linkThreshold = 15 / (this.transform ? this.transform.k : 1);
                if (this._linkCounts) {
                    for (let idx = 0; idx < this.graphData.links.length; idx++) {
                        const link = this.graphData.links[idx];
                        const s = link.source;
                        const t = link.target;
                        if (!s || !t || s.x === undefined || t.x === undefined) continue;

                        const pairInfo = this._linkCounts[link.pairKey];
                        const totalParams = pairInfo ? pairInfo.total : 1;
                        let dist;

                        if (totalParams === 1) {
                            dist = this._pointToSegmentDistance({ x, y }, s, t);
                        } else {
                            const linkIndex = pairInfo.links.indexOf(idx);
                            const offsetMultiplier = (totalParams % 2 === 0)
                                ? (linkIndex % 2 === 0 ? 1 : -1) * (Math.floor(linkIndex / 2) + 0.5)
                                : (linkIndex === 0 ? 0 : (linkIndex % 2 === 0 ? 1 : -1) * Math.floor((linkIndex + 1) / 2));
                            const ddx = t.x - s.x;
                            const ddy = t.y - s.y;
                            const ddist = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
                            const spreadDistance = 12 + (ddist * 0.05) + (totalParams * 4);
                            const finalOffset = offsetMultiplier * spreadDistance;
                            const isCanonical = link.source.id < link.target.id;
                            const cDx = isCanonical ? ddx : -ddx;
                            const cDy = isCanonical ? ddy : -ddy;
                            const nx = -cDy / ddist;
                            const ny = cDx / ddist;
                            const midX = (s.x + t.x) / 2;
                            const midY = (s.y + t.y) / 2;
                            const ctrlX = midX + nx * finalOffset * 2;
                            const ctrlY = midY + ny * finalOffset * 2;

                            let minDistToCurve = Infinity;
                            let prevPx, prevPy;
                            for (let step = 0; step <= 15; step++) {
                                const tVal = step / 15;
                                const u = 1 - tVal;
                                const px = (u * u) * s.x + 2 * u * tVal * ctrlX + (tVal * tVal) * t.x;
                                const py = (u * u) * s.y + 2 * u * tVal * ctrlY + (tVal * tVal) * t.y;
                                if (step > 0) {
                                    const segDist = this._pointToSegmentDistance({ x, y }, { x: prevPx, y: prevPy }, { x: px, y: py });
                                    if (segDist < minDistToCurve) minDistToCurve = segDist;
                                }
                                prevPx = px;
                                prevPy = py;
                            }
                            dist = minDistToCurve;
                        }

                        if (dist < linkThreshold) {
                            overLink = true;
                            break;
                        }
                    }
                }
                this.canvas.style.cursor = overLink ? "pointer" : "grab";
            }

            // If we are now hovering over a node with lore, start the timer
            if (hoveredNode && (hoveredNode.lore || hoveredNode.playerLorePageId)) {
                // Protection: Don't show lore tooltip to players for hidden tokens
                const canSeeLore = game.user.isGM || !hoveredNode.hidden;
                if (!canSeeLore) return;

                this._hoverTimeout = setTimeout(async () => {
                    const currentNodeId = hoveredNode.id;
                    let tooltipHtml = "";

                    if (hoveredNode.playerLorePageId) {
                        try {
                            const entry = await this.getJournalEntry();
                            if (entry) {
                                const page = entry.pages.get(hoveredNode.playerLorePageId);
                                if (page && page.text && page.text.content) {
                                    tooltipHtml = page.text.content;
                                } else {
                                    tooltipHtml = "<em>(Empty Journal Page)</em>";
                                }
                            } else {
                                tooltipHtml = "<em>(Could not load Journal)</em>";
                            }
                        } catch (e) {
                            tooltipHtml = "<em>(Could not load Journal Page)</em>";
                        }
                    } else if (hoveredNode.lore) {
                        tooltipHtml = hoveredNode.lore.replace(/\n/g, '<br>');
                    }

                    if (this._hoveredNodeId !== currentNodeId) return;

                    this._tooltipVisibleForNode = currentNodeId;

                    // Show it immediately
                    tooltip.innerHTML = tooltipHtml;
                    const nodeScreenX = this.transform.applyX(hoveredNode.x);
                    const nodeScreenY = this.transform.applyY(hoveredNode.y);
                    const nodeRadiusScaled = (game.settings.get("fang", "tokenSize") || 33) * this.transform.k;
                    const cWidth = this.canvas.parentElement.clientWidth;

                    // Measure actual tooltip width by briefly rendering it off-screen
                    tooltip.style.left = '-9999px';
                    tooltip.style.top = '-9999px';
                    tooltip.classList.remove("hidden");
                    const actualTooltipWidth = tooltip.offsetWidth;

                    let tooltipX = nodeScreenX + nodeRadiusScaled + 15;
                    if (tooltipX + actualTooltipWidth > cWidth) {
                        tooltipX = nodeScreenX - nodeRadiusScaled - actualTooltipWidth - 15;
                    }

                    let tooltipY = nodeScreenY - 10;
                    tooltip.style.left = `${tooltipX}px`;
                    tooltip.style.top = `${tooltipY}px`;
                }, 450); // 450ms hover delay
            }
        } else if (hoveredNode && (hoveredNode.lore || hoveredNode.playerLorePageId) && this._tooltipVisibleForNode === hoveredNode.id) {
            // If the tooltip is actively visible for this node, keep it glued exactly to the node's potential bounds during mouse movement
            const nodeScreenX = this.transform.applyX(hoveredNode.x);
            const nodeScreenY = this.transform.applyY(hoveredNode.y);
            const nodeRadiusScaled = (game.settings.get("fang", "tokenSize") || 33) * this.transform.k;
            const cWidth = this.canvas.parentElement.clientWidth;
            const actualTooltipWidth = tooltip.offsetWidth;

            let tooltipX = nodeScreenX + nodeRadiusScaled + 15;
            if (tooltipX + actualTooltipWidth > cWidth) {
                tooltipX = nodeScreenX - nodeRadiusScaled - actualTooltipWidth - 15;
            }
            let tooltipY = nodeScreenY - 10;
            tooltip.style.left = `${tooltipX}px`;
            tooltip.style.top = `${tooltipY}px`;
        } else if (!hoveredNode) {
            // No node hovered and no change in hover state - still update cursor for link proximity
            let overLink = false;
            const linkThreshold = 15 / (this.transform ? this.transform.k : 1);
            if (this._linkCounts) {
                for (let idx = 0; idx < this.graphData.links.length; idx++) {
                    const link = this.graphData.links[idx];
                    const s = link.source;
                    const t = link.target;
                    if (!s || !t || s.x === undefined || t.x === undefined) continue;

                    const pairInfo = this._linkCounts[link.pairKey];
                    const totalParams = pairInfo ? pairInfo.total : 1;
                    let dist;

                    if (totalParams === 1) {
                        dist = this._pointToSegmentDistance({ x, y }, s, t);
                    } else {
                        const linkIndex = pairInfo.links.indexOf(idx);
                        const offsetMultiplier = (totalParams % 2 === 0)
                            ? (linkIndex % 2 === 0 ? 1 : -1) * (Math.floor(linkIndex / 2) + 0.5)
                            : (linkIndex === 0 ? 0 : (linkIndex % 2 === 0 ? 1 : -1) * Math.floor((linkIndex + 1) / 2));
                        const ddx = t.x - s.x;
                        const ddy = t.y - s.y;
                        const ddist = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
                        const spreadDistance = 12 + (ddist * 0.05) + (totalParams * 4);
                        const finalOffset = offsetMultiplier * spreadDistance;
                        const isCanonical = link.source.id < link.target.id;
                        const cDx = isCanonical ? ddx : -ddx;
                        const cDy = isCanonical ? ddy : -ddy;
                        const nx = -cDy / ddist;
                        const ny = cDx / ddist;
                        const midX = (s.x + t.x) / 2;
                        const midY = (s.y + t.y) / 2;
                        const ctrlX = midX + nx * finalOffset * 2;
                        const ctrlY = midY + ny * finalOffset * 2;

                        let minDistToCurve = Infinity;
                        let prevPx, prevPy;
                        for (let step = 0; step <= 15; step++) {
                            const tVal = step / 15;
                            const u = 1 - tVal;
                            const px = (u * u) * s.x + 2 * u * tVal * ctrlX + (tVal * tVal) * t.x;
                            const py = (u * u) * s.y + 2 * u * tVal * ctrlY + (tVal * tVal) * t.y;
                            if (step > 0) {
                                const segDist = this._pointToSegmentDistance({ x, y }, { x: prevPx, y: prevPy }, { x: px, y: py });
                                if (segDist < minDistToCurve) minDistToCurve = segDist;
                            }
                            prevPx = px;
                            prevPy = py;
                        }
                        dist = minDistToCurve;
                    }

                    if (dist < linkThreshold) {
                        overLink = true;
                        break;
                    }
                }
            }
            this.canvas.style.cursor = overLink ? "pointer" : "grab";
        }
    }

    // --- Export / Import ---

    /**
     * Export the current graph data as a JSON file.
     */
    _onExportGraph(event) {
        if (event) event.preventDefault();
        if (!this._canEditGraph(false, true)) return;

        // Prepare data (full state including factions and settings)
        const exportData = {
            nodes: this.graphData.nodes.map(n => ({
                id: n.id,
                actorId: n.actorId || null,
                isPlaceholder: !!n.isPlaceholder,
                placeholderType: n.placeholderType || null,
                img: n.img || null,
                name: n.name,
                isCenter: n.isCenter || false,
                lore: n.lore || "",
                factionId: n.factionId || null,
                role: n.role || "",
                x: n.x,
                y: n.y,
                vx: n.vx || 0,
                vy: n.vy || 0
            })),
            links: this.graphData.links.map(l => ({
                source: typeof l.source === "object" ? l.source.id : l.source,
                target: typeof l.target === "object" ? l.target.id : l.target,
                label: l.label,
                directional: l.directional || false
            })),
            factions: this.graphData.factions.map(f => ({
                id: f.id,
                name: f.name,
                icon: f.icon,
                color: f.color,
                x: f.x,
                y: f.y,
                externalSource: f.externalSource ? foundry.utils.duplicate(f.externalSource) : null,
                externalMeta: f.externalMeta ? foundry.utils.duplicate(f.externalMeta) : null
            })),
            showFactionLines: this.graphData.showFactionLines !== false,
            showFactionLegend: this.graphData.showFactionLegend !== false
        };

        const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const worldName = game.world.id;
        const filename = `fang - ${worldName} - ${timestamp}.json`;

        saveDataToFile(JSON.stringify(exportData, null, 2), "application/json", filename);
        ui.notifications.info(game.i18n.localize("FANG.Messages.ExportSuccess"));
    }

    /**
     * Import graph data from a JSON file.
     */
    async _onImportGraph(event) {
        if (!this._canEditGraph(false, true)) {
            event.target.value = "";
            return;
        }
        const file = event.target.files[0];
        if (!file) return;

        // Confirm overwrite with custom FANG dialog styling
        const confirm = await new Promise(resolve => {
            new Dialog({
                title: game.i18n.localize("FANG.UI.Import"),
                content: `< p > ${game.i18n.localize("FANG.Messages.ConfirmImport")}</p > `,
                buttons: {
                    yes: {
                        icon: '<i class="fas fa-check"></i>',
                        label: game.i18n.localize("Yes"),
                        callback: () => resolve(true)
                    },
                    no: {
                        icon: '<i class="fas fa-times"></i>',
                        label: game.i18n.localize("No"),
                        callback: () => resolve(false)
                    }
                },
                default: "no",
                close: () => resolve(false)
            }, {
                classes: ["dialog", "fang-dialog"]
            }).render(true);
        });

        if (!confirm) {
            event.target.value = ""; // Reset input
            return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const content = e.target.result;
                if (!content) throw new Error("File is empty");

                const importedData = JSON.parse(content);

                // Detailed structure log for debugging
                console.log("FANG | Debugging Import Data:", importedData);

                // Basic validation
                if (!importedData.nodes || !Array.isArray(importedData.nodes)) {
                    throw new Error("Missing or invalid 'nodes' array");
                }
                if (!importedData.links || !Array.isArray(importedData.links)) {
                    throw new Error("Missing or invalid 'links' array");
                }

                // Ensure all expected properties exist (provide defaults for older/manual exports)
                if (!importedData.factions || !Array.isArray(importedData.factions)) {
                    importedData.factions = [];
                }
                if (importedData.showFactionLines === undefined) importedData.showFactionLines = true;
                if (importedData.showFactionLegend === undefined) importedData.showFactionLegend = true;
                importedData.nodes = importedData.nodes.map(node => ({
                    actorId: null,
                    isPlaceholder: false,
                    placeholderType: null,
                    img: null,
                    ...node
                }));
                importedData.nodes.forEach(node => {
                    if (node.actorId === undefined || node.actorId === null) {
                        node.actorId = game.actors.get(node.id) ? node.id : null;
                    }
                    if (node.isPlaceholder === undefined) node.isPlaceholder = !node.actorId;
                    if (node.placeholderType === undefined) node.placeholderType = node.isPlaceholder ? "import" : null;
                });

                // Update internal state
                this.graphData = importedData;

                // Save to Journal
                await this.saveData();

                // Re-initialize and render
                this.initSimulation();
                this.render({ force: true });

                ui.notifications.info(game.i18n.localize("FANG.Messages.ImportSuccess"));
            } catch (err) {
                console.error("FANG | Import Error:", err);
                const errorMsg = `${game.i18n.localize("FANG.Messages.ImportError")}(${err.message})`;
                ui.notifications.error(errorMsg);
            } finally {
                event.target.value = ""; // Reset input
            }
        };
        reader.readAsText(file);
    }

    // --- Share / Remote Controls ---

    async _onShareGraph(event) {
        if (event) event.preventDefault();
        if (!this._canEditGraph(false, true)) return;
        game.socket.emit("module.fang", { action: "showGraph", payload: { journalName: "FANG Graph" } });
        ui.notifications.info(game.i18n.localize("FANG.Messages.GraphShown"));
    }

    async _onShareGraphMonitor(event) {
        if (event) event.preventDefault();
        if (!this._canEditGraph(false, true)) return;
        const monitorName = game.settings.get("fang", "monitorDisplayName").toLowerCase();
        game.socket.emit("module.fang", { action: "showGraphMonitor", payload: { journalName: "FANG Graph" } });
        ui.notifications.info(`${game.i18n.localize("FANG.Messages.GraphMonitorShown")}(${monitorName})`);
    }

    async _onCloseGraphRemote(event) {
        if (event) event.preventDefault();
        if (!this._canEditGraph(false, true)) return;
        game.socket.emit("module.fang", { action: "closeGraph" });
        ui.notifications.info(game.i18n.localize("FANG.Messages.GraphClosed"));
    }

    async _onCloseGraphMonitor(event) {
        if (event) event.preventDefault();
        if (!this._canEditGraph(false, true)) return;
        const monitorName = game.settings.get("fang", "monitorDisplayName").toLowerCase();
        game.socket.emit("module.fang", { action: "closeGraphMonitor" });
        ui.notifications.info(`${game.i18n.localize("FANG.Messages.MonitorViewClosed")}(${monitorName})`);
    }

    _onEdgeSpotlight(link) {
        const sourceNode = link.source;
        const targetNode = link.target;
        if (!sourceNode || !targetNode) return;

        // Prevent spotlight if either node is hidden block the spotlight entirely
        if ((sourceNode.hidden || targetNode.hidden) && !game.user.isGM) {
            return;
        }
        if (sourceNode.hidden || targetNode.hidden) {
            ui.notifications.warn(game.i18n.localize("FANG.Messages.SpotlightHiddenBlocked") || "Reveal the characters first before using Spotlight!");
            return;
        }

        const sActor = this._getNodeActor(sourceNode);
        const tActor = this._getNodeActor(targetNode);

        const sourceImg = this._getNodeImageSource(sourceNode) || sourceNode.imgElement?.src || "icons/svg/mystery-man.svg";
        const targetImg = this._getNodeImageSource(targetNode) || targetNode.imgElement?.src || "icons/svg/mystery-man.svg";

        game.socket.emit("module.fang", {
            action: "spotlightEdgeStart",
            payload: {
                linkId: link.index, // Not strictly needed but good to have
                label: link.label || "",
                info: link.info || "",
                sourcePortrait: sourceImg,
                targetPortrait: targetImg,
                sourceX: sourceNode.x,
                sourceY: sourceNode.y,
                targetX: targetNode.x,
                targetY: targetNode.y,
                directional: link.directional || false
            }
        });

        this.startEdgeSpotlight({
            linkId: link.index,
            label: link.label || "",
            info: link.info || "",
            sourcePortrait: sourceImg,
            targetPortrait: targetImg,
            sourceX: sourceNode.x,
            sourceY: sourceNode.y,
            targetX: targetNode.x,
            targetY: targetNode.y,
            directional: link.directional || false
        });
    }

    startEdgeSpotlight(payload) {
        if (this._spotlightTimeout) clearTimeout(this._spotlightTimeout);
        this._isSpotlightActive = true;

        if (this.zoom) {
            // Center camera between the two nodes
            const midX = (payload.sourceX + payload.targetX) / 2;
            const midY = (payload.sourceY + payload.targetY) / 2;
            const dx = payload.targetX - payload.sourceX;
            const dy = payload.targetY - payload.sourceY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // Scale based on distance to fit both nodes roughly on screen. Cap at 1.5, floor at 0.5
            let targetScale = Math.min(1.5, Math.max(0.5, this.width / (dist * 1.5)));
            const tx = this.width / 2 - midX * targetScale;
            const ty = this.height / 2 - midY * targetScale;

            d3.select(this.canvas)
                .transition()
                .duration(1000)
                .call(this.zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(targetScale));
        }

        this._spotlightOverlayTimeout = setTimeout(() => {
            const overlay = this.element.querySelector("#fang-edge-spotlight-overlay");
            const title = this.element.querySelector("#edge-narrative-title");
            const textArea = this.element.querySelector("#edge-narrative-text");
            const sourcePortrait = this.element.querySelector("#edge-source-portrait");
            const targetPortrait = this.element.querySelector("#edge-target-portrait");

            if (overlay && title && textArea) {
                title.textContent = payload.label;
                textArea.innerHTML = payload.info || "";

                if (payload.sourcePortrait && sourcePortrait) sourcePortrait.src = payload.sourcePortrait;
                if (payload.targetPortrait && targetPortrait) targetPortrait.src = payload.targetPortrait;

                // Handle directional indicator
                const directionalIndicator = overlay.querySelector(".edge-directional-indicator");
                if (directionalIndicator) {
                    directionalIndicator.style.display = payload.directional ? "flex" : "none";
                }

                overlay.classList.remove("hidden");
            }
        }, 1000);

        ui.notifications.info(game.i18n.localize("FANG.Messages.SpotlightStarted").replace("{actor}", payload.label));
    }

    async _onSpotlight(node) {
        // Spotlight can be used by anyone who can right-click (no lock required)

        // Broadcast spotlight event
        const imgSrc = this._getNodeImageSource(node);
        const role = node.role || "";
        const factionObj = this.graphData.factions.find(f => f.id === node.factionId);
        const faction = factionObj ? factionObj.name : "";
        const subtitle = [role, faction].filter(s => s).join(" • ");

        let loreText = node.lore || "";
        if (node.playerLorePageId) {
            try {
                const entry = await this.getJournalEntry();
                if (entry) {
                    const page = entry.pages.get(node.playerLorePageId);
                    if (page && page.text && page.text.content) {
                        loreText = page.text.content;
                    }
                }
            } catch (e) {
                console.error("FANG | Error loading Spotlight Journal Page", e);
            }
        }

        game.socket.emit("module.fang", {
            action: "spotlightStart",
            payload: {
                nodeId: node.id,
                name: node.name,
                subtitle: subtitle,
                lore: loreText,
                portrait: imgSrc,
                quests: node.questUuids || []
            }
        });

        // Also start locally for the GM
        this.startSpotlight({
            nodeId: node.id,
            name: node.name,
            subtitle: subtitle,
            lore: loreText,
            portrait: imgSrc,
            quests: node.questUuids || []
        });
    }

    startSpotlight(payload) {
        if (this._spotlightTimeout) clearTimeout(this._spotlightTimeout);
        this._isSpotlightActive = true;

        // 1. Find the node position
        const node = this.graphData.nodes.find(n => n.id === payload.nodeId);
        if (node && this.zoom) {
            // 2. Animate camera zoom to node
            const targetScale = 1.5;
            const tx = this.width / 2 - node.x * targetScale;
            const ty = this.height / 2 - node.y * targetScale;

            d3.select(this.canvas)
                .transition()
                .duration(1000)
                .call(this.zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(targetScale));
        }

        // 3. Populate and show narrative overlay (Delayed for 1s to allow zoom to settle)
        this._spotlightOverlayTimeout = setTimeout(() => {
            const overlay = this.element.querySelector("#fang-narrative-overlay");
            const title = this.element.querySelector("#narrative-title");
            const subtitle = this.element.querySelector("#narrative-subtitle");
            const textArea = this.element.querySelector("#narrative-text");
            const portrait = this.element.querySelector("#narrative-portrait");
            const portraitContainer = this.element.querySelector(".narrative-portrait-container");
            const questsContainer = this.element.querySelector("#narrative-quests-container");
            const questsList = this.element.querySelector("#narrative-quests-list");

            if (overlay && title && textArea) {
                title.textContent = payload.name;
                if (subtitle) subtitle.textContent = payload.subtitle || "";
                textArea.innerHTML = payload.lore || "...";

                if (payload.portrait && portrait) {
                    portrait.src = payload.portrait;
                    portraitContainer.classList.remove("hidden");
                } else {
                    portraitContainer.classList.add("hidden");
                }

                // Handle Quests
                if (payload.quests && payload.quests.length > 0) {
                    questsList.innerHTML = payload.quests.map(q => `
                        <li class="narrative-quest-item" data-uuid="${q.uuid}">
                            <i class="fas fa-scroll"></i>
                            <span>${q.name}</span>
                        </li>
                    `).join("");

                    // Add click listeners to quest items (Short Click vs Long Press)
                    questsList.querySelectorAll(".narrative-quest-item").forEach(item => {
                        let clickTimer = null;
                        const uuid = item.dataset.uuid;

                        item.addEventListener("mousedown", (e) => {
                            if (e.button !== 0) return;
                            clickTimer = setTimeout(async () => {
                                clickTimer = null;
                                // Long Press: Open Journal Sheet
                                const doc = await fromUuid(uuid);
                                if (doc) doc.sheet.render(true);
                                else ui.notifications.warn("Quest Journal not found or permissions missing.");
                            }, 500);
                        });

                        item.addEventListener("mouseup", (e) => {
                            if (e.button !== 0) return;
                            if (clickTimer) {
                                clearTimeout(clickTimer);
                                clickTimer = null;
                                // Short Click: Narrative Spotlight
                                this._onQuestSpotlight(uuid);
                            }
                        });

                        item.addEventListener("mouseleave", () => {
                            if (clickTimer) {
                                clearTimeout(clickTimer);
                                clickTimer = null;
                            }
                        });
                    });

                    questsContainer.classList.remove("hidden");
                } else {
                    questsContainer.classList.add("hidden");
                }

                overlay.classList.remove("hidden");
            }
        }, 1000);

        ui.notifications.info(game.i18n.localize("FANG.Messages.SpotlightStarted").replace("{actor}", payload.name));
    }

    stopSpotlight() {
        if (this._spotlightTimeout) clearTimeout(this._spotlightTimeout);
        if (this._spotlightOverlayTimeout) clearTimeout(this._spotlightOverlayTimeout);
        this._isSpotlightActive = false;
        this._stopMonitorAutoScroll();
        this._detachQuestSpotlightScrollSync();

        // Hide overlays
        const overlay = this.element.querySelector("#fang-narrative-overlay");
        const edgeOverlay = this.element.querySelector("#fang-edge-spotlight-overlay");
        const questOverlay = this.element.querySelector("#fang-quest-spotlight-overlay");
        if (overlay) overlay.classList.add("hidden");
        if (edgeOverlay) edgeOverlay.classList.add("hidden");
        if (questOverlay) questOverlay.classList.add("hidden");

        // Return to normal view
        this.zoomToFit(true);

        // If we are GM, tell everyone to stop too
        if (game.user.isGM) {
            game.socket.emit("module.fang", { action: "spotlightStop" });
            game.socket.emit("module.fang", { action: "questSpotlightStop" });
        }
    }

    async _onQuestSpotlight(questUuid) {
        try {
            const doc = await fromUuid(questUuid);
            if (!doc) return;

            // Extract content from the first text page
            let content = "";
            let title = doc.name;

            const page = doc.pages.contents[0];
            if (page && page.type === "text" && page.text && page.text.content) {
                content = page.text.content;
            } else if (doc.pages.size === 0 && doc.content) {
                // Legacy Journal compatibility
                content = doc.content;
            }

            if (!content) content = "...";

            const payload = {
                uuid: questUuid,
                name: title,
                content: content
            };

            // Broadcast
            game.socket.emit("module.fang", {
                action: "questSpotlightStart",
                payload: payload
            });

            // Start locally
            this.startQuestSpotlight(payload);

        } catch (e) {
            console.error("FANG | Error in Quest Spotlight", e);
        }
    }

    startQuestSpotlight(payload) {
        const overlay = this.element.querySelector("#fang-quest-spotlight-overlay");
        const title = this.element.querySelector("#quest-spotlight-title");
        const textArea = this.element.querySelector("#quest-spotlight-text");

        if (overlay && title && textArea) {
            this._stopMonitorAutoScroll();
            this._detachQuestSpotlightScrollSync();
            title.textContent = payload.name;
            textArea.innerHTML = payload.content;

            // Hide other overlays just in case
            const mainOverlay = this.element.querySelector("#fang-narrative-overlay");
            if (mainOverlay) mainOverlay.classList.add("hidden");

            overlay.classList.remove("hidden");

            // Close listener
            overlay.querySelector(".narrative-close").onclick = () => {
                this.stopQuestSpotlight();
            };

            // Monitor mode: auto-scroll long quest text since nobody can interact with the display.
            // We scroll the card container (it already has overflow-y: auto).
            const card = overlay.querySelector(".quest-spotlight-card");
            this._startMonitorAutoScroll(card);

            // GM: broadcast scroll position so in-person monitor(s) can follow without interaction.
            this._attachQuestSpotlightScrollSync(card);
        }
    }

    stopQuestSpotlight() {
        this._stopMonitorAutoScroll();
        this._detachQuestSpotlightScrollSync();
        const overlay = this.element.querySelector("#fang-quest-spotlight-overlay");
        if (overlay) overlay.classList.add("hidden");

        // Re-show main narrative spotlight if it was active
        if (this._isSpotlightActive) {
            const mainOverlay = this.element.querySelector("#fang-narrative-overlay");
            if (mainOverlay) mainOverlay.classList.remove("hidden");
        }

        if (game.user.isGM) {
            game.socket.emit("module.fang", { action: "questSpotlightStop" });
        }
    }

    _attachQuestSpotlightScrollSync(scrollEl) {
        if (!game.user.isGM) return;
        if (this._isMonitorClient()) return;
        if (!scrollEl) return;

        this._questSpotlightScrollEl = scrollEl;
        this._questSpotlightScrollHandler = () => {
            if (this._questSpotlightScrollRaf) return;
            this._questSpotlightScrollRaf = requestAnimationFrame(() => {
                this._questSpotlightScrollRaf = null;
                if (!this._questSpotlightScrollEl?.isConnected) return;

                game.socket.emit("module.fang", {
                    action: "questSpotlightScroll",
                    payload: {
                        scrollTop: this._questSpotlightScrollEl.scrollTop
                    }
                });
            });
        };

        scrollEl.addEventListener("scroll", this._questSpotlightScrollHandler, { passive: true });

        // Send initial position (top) after layout so monitors start correctly.
        setTimeout(() => {
            if (!this._questSpotlightScrollEl?.isConnected) return;
            game.socket.emit("module.fang", { action: "questSpotlightScroll", payload: { scrollTop: 0 } });
        }, 50);
    }

    _detachQuestSpotlightScrollSync() {
        if (this._questSpotlightScrollEl && this._questSpotlightScrollHandler) {
            this._questSpotlightScrollEl.removeEventListener("scroll", this._questSpotlightScrollHandler);
        }
        if (this._questSpotlightScrollRaf) cancelAnimationFrame(this._questSpotlightScrollRaf);
        this._questSpotlightScrollEl = null;
        this._questSpotlightScrollHandler = null;
        this._questSpotlightScrollRaf = null;
        this._remoteQuestSpotlightScrolling = false;
    }

    syncQuestSpotlightScroll(payload) {
        if (!this._isMonitorClient()) return;
        const overlay = this.element.querySelector("#fang-quest-spotlight-overlay");
        if (!overlay || overlay.classList.contains("hidden")) return;
        const card = overlay.querySelector(".quest-spotlight-card");
        if (!card) return;

        // If GM is driving the scroll, do not also auto-scroll locally.
        this._stopMonitorAutoScroll();

        this._remoteQuestSpotlightScrolling = true;
        card.scrollTop = Math.max(0, Number(payload?.scrollTop ?? 0));
        this._remoteQuestSpotlightScrolling = false;
    }

    _isMonitorClient() {
        // The app sets this class for the configured monitor display name.
        return document?.body?.classList?.contains("fang-monitor");
    }

    _startMonitorAutoScroll(scrollEl) {
        this._stopMonitorAutoScroll();
        if (!this._isMonitorClient()) return;
        if (!scrollEl) return;

        // Wait for layout so scrollHeight is correct after innerHTML changes.
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const maxScroll = scrollEl.scrollHeight - scrollEl.clientHeight;
                if (!(maxScroll > 8)) return; // no overflow, nothing to do

                const pxPerSecond = 14; // slow, readable pace on big screens
                const pauseMs = 1800;
                let lastTs = null;

                const step = (ts) => {
                    if (!this._isMonitorClient()) return; // safety if mode changes
                    if (!scrollEl.isConnected) return;

                    const currentMax = scrollEl.scrollHeight - scrollEl.clientHeight;
                    if (!(currentMax > 8)) return;

                    if (lastTs == null) lastTs = ts;
                    const dt = (ts - lastTs) / 1000;
                    lastTs = ts;

                    scrollEl.scrollTop = Math.min(currentMax, scrollEl.scrollTop + pxPerSecond * dt);

                    if (scrollEl.scrollTop >= currentMax - 1) {
                        this._monitorAutoScrollTimer = setTimeout(() => {
                            if (!scrollEl.isConnected) return;
                            scrollEl.scrollTop = 0;
                            lastTs = null;
                            this._monitorAutoScrollRaf = requestAnimationFrame(step);
                        }, pauseMs);
                        return;
                    }

                    this._monitorAutoScrollRaf = requestAnimationFrame(step);
                };

                this._monitorAutoScrollTimer = setTimeout(() => {
                    this._monitorAutoScrollRaf = requestAnimationFrame(step);
                }, pauseMs);
            });
        });
    }

    _stopMonitorAutoScroll() {
        if (this._monitorAutoScrollRaf) cancelAnimationFrame(this._monitorAutoScrollRaf);
        if (this._monitorAutoScrollTimer) clearTimeout(this._monitorAutoScrollTimer);
        this._monitorAutoScrollRaf = null;
        this._monitorAutoScrollTimer = null;
    }

    remoteSyncCamera(payload) {
        if (!this.zoom || !this.canvas || this._remoteSyncing) return;

        // Set syncing flag to prevent feedback loops if we are also a GM (unlikely but safe)
        this._remoteSyncing = true;

        const transform = d3.zoomIdentity.translate(payload.x, payload.y).scale(payload.k);

        // Apply transform immediately without transition for smooth following
        d3.select(this.canvas)
            .call(this.zoom.transform, transform);

        this._remoteSyncing = false;
    }

    _onClose(options) {
        super._onClose(options);
        if (this._spotlightTimeout) clearTimeout(this._spotlightTimeout);
        if (this._spotlightOverlayTimeout) clearTimeout(this._spotlightOverlayTimeout);
        if (this._animationFrameId) cancelAnimationFrame(this._animationFrameId);
        if (this.simulation) this.simulation.stop();
        this._animationFrameId = null;
        this._initialZoomApplied = false;
        this.transform = null;

        // Release edit lock if I am the holder
        this._releaseMyLock();
    }

    async _releaseMyLock() {
        const entry = game.journal.getName("FANG Graph");
        const lock = entry?.getFlag("fang", "editLock");
        if (lock && lock.userId === game.user.id) {
            if (game.user.isGM) {
                await entry.unsetFlag("fang", "editLock");
                game.socket.emit("module.fang", { action: "lockStatusUpdate" });
            } else {
                game.socket.emit("module.fang", { action: "requestReleaseLock", payload: { userId: game.user.id } });
            }
        }
    }

    // --- Edit Lock System ---

    async _onToggleEditLock() {
        const entry = await this.getJournalEntry();
        if (!entry) return;

        const currentLock = entry.getFlag("fang", "editLock");
        const isLocked = !!currentLock;
        const iAmLockHolder = isLocked && currentLock.userId === game.user.id;

        if (iAmLockHolder) {
            // Release the lock
            if (game.user.isGM) {
                await entry.unsetFlag("fang", "editLock");
                ui.notifications.info(game.i18n.localize("FANG.Messages.LockReleased") || "Bearbeitung freigegeben.");
                game.socket.emit("module.fang", { action: "lockStatusUpdate" });
                this.render();
            } else {
                game.socket.emit("module.fang", { action: "requestReleaseLock", payload: { userId: game.user.id } });
            }
        } else {
            // Take the lock
            if (game.user.isGM) {
                await entry.setFlag("fang", "editLock", {
                    userId: game.user.id,
                    userName: game.user.name,
                    time: Date.now()
                });
                ui.notifications.info(game.user.name + " " + game.i18n.localize("FANG.Messages.LockAcquired") || "hat die Bearbeitung übernommen.");
                game.socket.emit("module.fang", { action: "lockStatusUpdate" });
                this.render();
            } else {
                game.socket.emit("module.fang", { action: "requestLock", payload: { userId: game.user.id, userName: game.user.name } });
            }
        }
    }

    async _onForceReleaseLock() {
        if (!game.user.isGM) return;
        const entry = await this.getJournalEntry();
        if (!entry) return;

        await entry.unsetFlag("fang", "editLock");
        ui.notifications.info("GM forced lock release.");

        game.socket.emit("module.fang", { action: "lockStatusUpdate" });
        this.render();
    }

    _updateLockUI() {
        const entry = game.journal.getName("FANG Graph");
        const lock = entry?.getFlag("fang", "editLock");

        const banner = this.element.querySelector("#fang-lock-banner");
        const lockText = this.element.querySelector("#lock-text");
        const btnToggleLock = this.element.querySelector("#btnToggleLock");
        const btnText = this.element.querySelector("#lock-btn-text");
        const btnIcon = btnToggleLock?.querySelector("i");
        const bannerIcon = banner.querySelector(".lock-info i");
        const btnForce = this.element.querySelector("#btnForceRelease");
        const sidebar = this.element.querySelector(".sidebar");

        // New Canvas UI
        const canvasIndicator = this.element.querySelector("#fang-canvas-lock-indicator");
        const canvasText = this.element.querySelector("#canvas-lock-text");

        if (!banner || !lockText || !btnToggleLock) return;

        // Reset classes and visibility
        banner.classList.remove("no-editor", "i-am-editor", "someone-else-editing");
        banner.classList.add("hidden"); // Default hidden for GM
        sidebar?.classList.remove("sidebar-locked");

        // Remove tab-level locking
        const editorTab = this.element.querySelector(".tab-content[data-tab='editor']");
        if (editorTab) editorTab.classList.remove("tab-locked");

        if (btnForce) btnForce.classList.add("hidden");
        if (canvasIndicator) canvasIndicator.classList.add("hidden");
        if (bannerIcon) bannerIcon.className = "fas fa-lock-open";

        if (!lock) {
            // NO ACTIVE LOCK - Everyone is blocked for editing by default
            banner.classList.add("no-editor");
            lockText.textContent = game.i18n.localize("FANG.UI.NoEditor");
            btnText.textContent = game.i18n.localize("FANG.UI.EditMode");
            btnIcon.className = "fas fa-pencil-alt";
            btnToggleLock.classList.remove("active");

            // Block editor tab exclusively for everyone until lock is taken
            if (editorTab) editorTab.classList.add("tab-locked");

            const allowPlayerEdit = game.settings.get("fang", "allowPlayerEditing");
            if (!game.user.isGM) {
                banner.classList.remove("hidden");
                btnToggleLock.style.display = allowPlayerEdit ? "flex" : "none";
                // Players have no View/Advanced anyway, so we can lock their whole sidebar for simplicity
                sidebar?.classList.add("sidebar-locked");
            } else {
                // GM: Show the button even if no lock, so they can take it
                banner.classList.remove("hidden");
                btnToggleLock.style.display = "flex";
            }
        } else {
            // ACTIVE LOCK
            const iAmEditor = lock.userId === game.user.id;
            const someoneElse = !iAmEditor;
            const lockUser = iAmEditor ? game.user.name : lock.userName;

            if (iAmEditor) {
                // I AM THE EDITOR
                banner.classList.remove("hidden");
                banner.classList.add("i-am-editor");
                lockText.textContent = lockUser;
                btnText.textContent = game.i18n.localize("FANG.UI.ReleaseLock");
                btnIcon.className = "fas fa-lock"; // Use closed lock when holding
                btnToggleLock.classList.add("active");
                btnToggleLock.style.display = "flex";
                if (bannerIcon) bannerIcon.className = "fas fa-lock"; // Match the button
            } else {
                // SOMEONE ELSE IS EDITING
                banner.classList.remove("hidden");
                banner.classList.add("someone-else-editing");
                lockText.textContent = game.i18n.format("FANG.UI.CurrentlyEditing", { user: lockUser });
                btnToggleLock.style.display = "none";
                if (bannerIcon) bannerIcon.className = "fas fa-lock";

                // Block ONLY the editor tab for GMs, but the whole sidebar for players
                if (game.user.isGM) {
                    if (editorTab) editorTab.classList.add("tab-locked");
                } else {
                    sidebar?.classList.add("sidebar-locked");
                }

                if (game.user.isGM && btnForce) {
                    btnForce.classList.remove("hidden");
                }

                // Show floating indicator on canvas for everyone except the editor
                if (canvasIndicator && canvasText) {
                    canvasIndicator.classList.remove("hidden");
                    canvasText.textContent = game.i18n.format("FANG.UI.CurrentlyEditing", { user: lockUser });
                }
            }
        }
    }
}
