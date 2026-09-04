import { mergeGraphData, valuesEqual, structurallyEqual } from "./fang-merge.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const FANG_DEFAULT_PLACEHOLDER_IMG = "modules/fang/assets/placeholder-npc.svg";
const FANG_FALLBACK_PLACEHOLDER_IMG = "modules/fang/assets/placeholder-npc.svg";
const FANG_LEGACY_PLACEHOLDER_IMG_REGEX = /(?:^|\/)modules\/fang\/assets\/placeholder-npc-default\.webp(?:\?.*)?$/i;

/**
 * Fields that exist only while the graph is live and must never reach the journal flag.
 * `imgElement` is an HTMLImageElement, `index`/`vx`/`vy`/`fx`/`fy` belong to the d3
 * simulation, the underscore keys are lookup caches. Everything NOT listed here is
 * persisted — so a new data field never silently disappears just because someone
 * forgot to extend a save whitelist.
 */
const FANG_RUNTIME_NODE_FIELDS = ["imgElement", "index", "vx", "vy", "fx", "fy", "_gmJournalName", "_questJournalName"];
const FANG_RUNTIME_LINK_FIELDS = ["index", "imgElement"];
const FANG_RUNTIME_FACTION_FIELDS = ["imgElement", "index", "vx", "vy", "fx", "fy"];

/**
 * Storage schema version of the graph flag.
 *   1 (implicit) — links have no id, zones/relationshipTypes are not persisted
 *   2            — links carry a stable id, deny-list serialization
 *
 * The merge compares elements by id. Against a v1 state that is fatal: its links have
 * no id, so they do not appear in the id map and the merge reads that as "everything
 * was deleted". A v1 state must therefore be migrated by a plain overwrite first —
 * exactly what happened before merging existed. Only once both sides are v2 do the
 * three-way rules apply.
 */
const FANG_GRAPH_SCHEMA_VERSION = 2;

/** Which rail button belongs to which sidebar panel. Add a panel -> add a line here. */
const FANG_RAIL_BY_PANEL = {
    affiliation: "#fangRailAffiliation",
    view: "#fangRailPresentation",
    advanced: "#fangRailManage"
};

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
                // .implementation, not the bare global: the global is deprecated since V13
                // and gone in V15, and going through implementation lets a system swap in
                // its own picker.
                new foundry.applications.apps.FilePicker.implementation({
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
        this._hoveredFactionId = null;   // legend row under the pointer, see _factionAtLegendPoint
        this._legendHitAreas = [];
        this._hoverLoreTooltipEnabled = false;
        this._bgImageLoaded = new Map();
        this._searchQuery = "";
        this._searchIsolate = false;
        this._searchMatchedNodeIds = new Set();
        this._searchMatchedLinkIndices = new Set();
        this._searchUiVisible = false;
        this._groupingMode = "none";        // "none" | "faction" | "zone" — never two at once
        this._clusterTargets = null;
        this._layoutSnapshot = null;        // layout before grouping, restored on reset
        this._quickConnectMode = false;
        this._quickConnectSourceId = null;
        this._touchLongPressTimer = null;
        this._touchLongPressStart = null;
        this._suppressNextCanvasClick = false;
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

    _normalizeFaction(faction = {}) {
        return {
            ...faction,
            description: typeof faction.description === "string" ? faction.description : "",
            playerVisible: faction.playerVisible !== false,
            showInLegendForPlayers: faction.showInLegendForPlayers !== false,
            showLinesForPlayers: faction.showLinesForPlayers !== false
        };
    }

    _normalizeZone(zone = {}) {
        const id = zone.id || foundry.utils.randomID();
        // A location is a place, not a group. Older data offered "organization" (that is
        // what factions are for) and court/underworld, which read as groups just as much
        // as places. Map them onto the closest place so nothing ends up with a type the
        // dropdown cannot show.
        const legacyTypes = { organization: "building", court: "building", underworld: "district" };
        const rawType = String(zone.type || "region");
        const type = legacyTypes[rawType] ?? rawType;

        return {
            ...zone,
            id,
            name: String(zone.name || this._localize("FANG.Zones.NewZone", "New Location")),
            type,
            color: String(zone.color || "#d4af37"),
            description: String(zone.description || ""),
            playerVisible: zone.playerVisible !== false
        };
    }

    _getDefaultRelationshipTypes() {
        return [
            { id: "ally", label: this._localize("FANG.RelationshipTypes.Ally", "Ally"), color: "#2f9e44", dash: "" },
            { id: "enemy", label: this._localize("FANG.RelationshipTypes.Enemy", "Enemy"), color: "#b91c1c", dash: "" },
            { id: "family", label: this._localize("FANG.RelationshipTypes.Family", "Family"), color: "#d97706", dash: "" },
            // Note: there is deliberately no "faction" type here. Belonging to a faction
            // is set in the faction manager and shown as a ring on the character —
            // offering it as a relationship type as well said the same thing twice, in a
            // place where it could never actually change the membership. "hierarchy"
            // covers what those links really expressed: reports to, works for, serves.
            { id: "hierarchy", label: this._localize("FANG.RelationshipTypes.Hierarchy", "Hierarchy"), color: "#2563eb", dash: "8,5" },
            { id: "quest", label: this._localize("FANG.RelationshipTypes.Quest", "Quest"), color: "#9333ea", dash: "4,4" },
            { id: "unknown", label: this._localize("FANG.RelationshipTypes.Unknown", "Unknown"), color: "#6b7280", dash: "2,5" }
        ];
    }

    _normalizeRelationshipType(type = {}) {
        return {
            ...type,
            id: String(type.id || foundry.utils.randomID()),
            label: String(type.label || type.name || this._localize("FANG.RelationshipTypes.Custom", "Custom")),
            color: String(type.color || "#888888"),
            dash: String(type.dash || "")
        };
    }

    _getRelationshipType(typeId) {
        const types = Array.isArray(this.graphData?.relationshipTypes) && this.graphData.relationshipTypes.length
            ? this.graphData.relationshipTypes.map(type => this._normalizeRelationshipType(type))
            : this._getDefaultRelationshipTypes();
        return types.find(type => type.id === typeId) || null;
    }

    _isFactionVisibleToCurrentUser(faction) {
        if (!faction) return false;
        return game.user.isGM || faction.playerVisible !== false;
    }

    _shouldShowFactionLinesToCurrentUser(faction) {
        if (!this._isFactionVisibleToCurrentUser(faction)) return false;
        return faction.showLinesForPlayers !== false;
    }

    _shouldShowFactionInLegendToCurrentUser(faction) {
        if (!this._isFactionVisibleToCurrentUser(faction)) return false;
        return faction.showInLegendForPlayers !== false;
    }

    _canUserSeeNode(node, user = game.user) {
        if (!node) return false;
        if (!user?.isGM && node.gmOnly === true) return false;
        // Hidden nodes are still player-managed contacts. Players may interact
        // with their safe facade, but must never receive the real identity.
        return true;
    }

    _isNodeHiddenForUser(node, user = game.user) {
        return !!node?.hidden && !user?.isGM;
    }

    _canUserSeeQuest(node, quest, user = game.user) {
        if (!node || !quest) return false;
        if (!this._canUserSeeNode(node, user)) return false;
        if (user?.isGM) return true;
        return quest.visibleToPlayers !== false;
    }

    _canUserSeeLink(link, user = game.user) {
        if (!link) return false;
        if (!user?.isGM && link.gmOnly === true) return false;
        const sourceNode = this._resolveNodeReference(link.source);
        const targetNode = this._resolveNodeReference(link.target);
        return this._canUserSeeNode(sourceNode, user) && this._canUserSeeNode(targetNode, user);
    }

    _getVisibleNodesForUser(user = game.user) {
        return (this.graphData?.nodes || []).filter(node => this._canUserSeeNode(node, user));
    }

    _getVisibleLinksForUser(user = game.user) {
        return (this.graphData?.links || []).filter(link => this._canUserSeeLink(link, user));
    }

    _getVisibleNodeIdSetForUser(user = game.user) {
        return new Set(this._getVisibleNodesForUser(user).map(node => node.id));
    }

    _canUseGraphAction(action, target, user = game.user) {
        const hasLock = this._canEditGraph(true);
        switch (action) {
            case "viewNode":
            case "spotlightNode":
                return this._canUserSeeNode(target, user);
            case "viewLink":
            case "spotlightLink":
                return this._canUserSeeLink(target, user);
            case "manageQuests":
                return user?.isGM ? hasLock || this._getNodeQuestsForUser(target, user).length > 0 : this._getNodeQuestsForUser(target, user).length > 0;
            case "edit":
            case "delete":
            case "addQuest":
                return hasLock;
            default:
                return false;
        }
    }

    _resolveNodeReference(ref) {
        if (!ref) return null;
        if (typeof ref === "object") return ref;
        return this.graphData?.nodes?.find(n => n.id === ref) ?? null;
    }

    _getSafeNodeName(node, user = game.user) {
        if (!node) return game.i18n.localize("FANG.Dropdowns.Unknown");
        if (this._isNodeHiddenForUser(node, user)) {
            return node.displayName || game.i18n.localize("FANG.Dropdowns.Unknown");
        }
        return node.name || game.i18n.localize("FANG.Dropdowns.Unknown");
    }

    _getNodeQuestsForUser(node, user = game.user) {
        if (this._isNodeHiddenForUser(node, user) && node.showHiddenQuestsToPlayers === false) return [];
        const quests = Array.isArray(node?.questUuids) ? node.questUuids : [];
        return quests.filter(q => this._canUserSeeQuest(node, q, user));
    }

    _localize(key, fallback) {
        const value = game.i18n.localize(key);
        return value && value !== key ? value : fallback;
    }

    _escapeHtml(value) {
        const escapeHtml = foundry.utils.escapeHTML ?? ((input) => String(input ?? "").replace(/[&<>"']/g, (char) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        }[char])));
        return escapeHtml(String(value ?? ""));
    }

    /**
     * The game days the chronicle already knows, newest first. Offering these as a list is what
     * makes back-dating reliable: typing "12. Hammer" a second time with a different spelling
     * used to create a second day group that looks identical and sorts somewhere else entirely.
     */
    /**
     * What the active calendar offers a date picker: month names with their real lengths, and
     * where "now" sits. Built from Foundry's own calendar, because that is the one that can
     * convert components back into a timestamp. Returns null when there is no usable calendar --
     * then the form falls back to a plain text field.
     */
    _getCalendarPickerModel() {
        const calendar = game.time?.calendar;
        if (!calendar || typeof calendar.componentsToTime !== "function" || typeof calendar.timeToComponents !== "function") return null;
        const months = calendar.months?.values;
        if (!Array.isArray(months) || !months.length) return null;

        const now = calendar.timeToComponents(Number.isFinite(game.time?.worldTime) ? game.time.worldTime : 0);
        const year = this._calendarNumber(now?.year) ?? 0;
        const leap = typeof calendar.isLeapYear === "function";
        return {
            year,
            monthIndex: this._calendarNumber(now?.month) ?? 0,
            dayIndex: this._calendarNumber(now?.dayOfMonth ?? now?.day) ?? 0,
            months: months.map((month, index) => ({
                index,
                // Month names are i18n keys in every shipped calendar.
                name: month?.name ? this._localize(month.name, month.name) : `${index + 1}`,
                days: this._getCalendarMonthLength(month, year, leap ? calendar : null)
            }))
        };
    }

    _getCalendarMonthLength(month, year, calendarForLeap = null) {
        const normal = this._calendarNumber(month?.days);
        const leapDays = this._calendarNumber(month?.leapDays);
        let days = normal;
        if (leapDays !== null && calendarForLeap) {
            try {
                if (calendarForLeap.isLeapYear(year)) days = leapDays;
            } catch (_err) {
                // Calendar does not want to answer for this year -- the ordinary length will do.
            }
        }
        return Math.max(1, days ?? 1);
    }

    /**
     * How far a calendar module's reckoning is from Foundry's own. Harptos as shipped by
     * Calendaria has yearZero 1501, so the module says 1501 where the core calendar says 0, and
     * it counts months and days from one where the core counts from zero. Rather than hard-code
     * any of that, the offset is measured against "now", which both sides can describe.
     */
    _getCalendarModuleOffsets(api) {
        const calendar = game.time?.calendar;
        if (!api || typeof calendar?.timeToComponents !== "function") return null;
        let theirs = null;
        try {
            theirs = api.getCurrentDate?.() ?? api.currentDateTime?.() ?? api.currentDate?.() ?? api.getCurrentDateTime?.();
        } catch (_err) {
            return null;
        }
        const ours = calendar.timeToComponents(Number.isFinite(game.time?.worldTime) ? game.time.worldTime : 0);
        const theirYear = this._calendarNumber(theirs?.year);
        const theirMonth = this._calendarNumber(theirs?.month?.number ?? theirs?.month?.ordinal ?? theirs?.month);
        const theirDay = this._calendarNumber(theirs?.day ?? theirs?.dayOfMonth);
        const ourYear = this._calendarNumber(ours?.year);
        const ourMonth = this._calendarNumber(ours?.month);
        const ourDay = this._calendarNumber(ours?.dayOfMonth ?? ours?.day);
        if ([theirYear, theirMonth, theirDay, ourYear, ourMonth, ourDay].some(v => v === null)) return null;
        return { year: theirYear - ourYear, month: theirMonth - ourMonth, day: theirDay - ourDay };
    }

    /**
     * Describe an arbitrary game day the same way detectCurrentGameDate describes today, so a
     * hand-picked date carries a label and a sort key of exactly the same shape as an automatic
     * one. Takes Foundry's own components; asks the calendar module first.
     */
    _describeGameDateForComponents(components) {
        const calendar = game.time?.calendar;
        if (!components || !calendar) return null;

        for (const candidate of this._getCalendarApiCandidates()) {
            const offsets = this._getCalendarModuleOffsets(candidate.api);
            if (!offsets) continue;
            const theirDate = {
                year: this._calendarNumber(components.year) + offsets.year,
                month: this._calendarNumber(components.month) + offsets.month,
                day: this._calendarNumber(components.dayOfMonth ?? components.day) + offsets.day
            };
            const label = this._sanitizeCalendarLabel(this._formatWithCalendarModule(candidate.api, theirDate));
            if (!this._calendarLabelLooksUsable(label)) continue;
            return { label, sort: this._getCalendarSort(theirDate), source: candidate.source };
        }

        const label = this._buildCalendarLabelFromComponents(components, calendar);
        if (!this._calendarLabelLooksUsable(label)) return null;
        return { label, sort: this._getCalendarSort(components), source: "foundry-calendar" };
    }

    /** Turn a picked year/month/day into a game date, via the calendar so festivals land right. */
    _describePickedGameDate(year, monthIndex, dayIndex) {
        const calendar = game.time?.calendar;
        if (!calendar) return null;
        try {
            const timestamp = calendar.componentsToTime({ year, month: monthIndex, dayOfMonth: dayIndex });
            return this._describeGameDateForComponents(calendar.timeToComponents(timestamp));
        } catch (_err) {
            return this._describeGameDateForComponents({ year, month: monthIndex, dayOfMonth: dayIndex });
        }
    }

    _getKnownGameDays({ user = game.user } = {}) {
        const days = [];
        const seen = new Set();
        for (const entry of this._getHistoryEntriesForUser({ user })) {
            const label = entry.gameDate?.label;
            if (!label || seen.has(label)) continue;
            seen.add(label);
            days.push({ label, sort: String(entry.gameDate?.sort || ""), source: String(entry.gameDate?.source || "manual") });
        }
        return days;
    }

    _getHistoryCategories() {
        return [
            { kind: "encounter", icon: "fa-handshake", label: this._localize("FANG.History.Categories.Encounter", "Encounter") },
            { kind: "insight", icon: "fa-lightbulb", label: this._localize("FANG.History.Categories.Insight", "Insight") },
            { kind: "flashback", icon: "fa-clock-rotate-left", label: this._localize("FANG.History.Categories.Flashback", "Flashback") },
            { kind: "quest", icon: "fa-scroll", label: this._localize("FANG.History.Categories.Quest", "Quest") },
            { kind: "relationship", icon: "fa-link", label: this._localize("FANG.History.Categories.Relationship", "Relationship") },
            { kind: "faction", icon: "fa-users", label: this._localize("FANG.History.Categories.Faction", "Faction") },
            { kind: "note", icon: "fa-feather", label: this._localize("FANG.History.Categories.Note", "Note") }
        ];
    }

    _getHistoryCategory(kind) {
        return this._getHistoryCategories().find(category => category.kind === kind) || this._getHistoryCategories().find(category => category.kind === "insight");
    }

    _getManualHistoryCategories() {
        return this._getHistoryCategories().filter(category => ["encounter", "insight", "flashback", "note"].includes(category.kind));
    }

    _getHistoryType(type) {
        return String(type || "manual");
    }

    _canCreateHistoryEntry(silent = false) {
        if (game.user?.isGM) return true;

        const monitorName = String(game.settings.get("fang", "monitorDisplayName") || "").toLowerCase();
        const isMonitor = monitorName && String(game.user?.name || "").toLowerCase().includes(monitorName);
        if (isMonitor) return false;

        const gmOnline = Array.from(game.users || []).some(user => user?.isGM && user?.active);
        if (!gmOnline && !silent) {
            ui.notifications.warn(game.i18n.localize("FANG.Messages.WarnNoGMOnline"));
        }
        return gmOnline;
    }

    _canEditHistoryEntry(entry, user = game.user) {
        const normalized = this._normalizeHistoryEntry(entry);
        if (!normalized) return false;
        if (user?.isGM) return true;
        return normalized.visibility === "players" && normalized.editableByPlayers !== false;
    }

    _getHistoryPlayerNodeName(node) {
        if (!node) return this._localize("FANG.Dropdowns.Unknown", "Unknown");
        if (node.hidden) return node.displayName || this._localize("FANG.Dropdowns.Unknown", "Unknown");
        return node.name || this._localize("FANG.Dropdowns.Unknown", "Unknown");
    }

    _getHistoryEntryImage(entry, user = game.user) {
        const nodeRef = entry.refs?.find(ref => ref.type === "node");
        const node = nodeRef ? this.graphData.nodes.find(n => n.id === nodeRef.id) : null;
        if (!node) return FANG_DEFAULT_PLACEHOLDER_IMG;
        return this._isNodeHiddenForUser(node, user) ? FANG_DEFAULT_PLACEHOLDER_IMG : this._getNodeImageSource(node);
    }

    _normalizeGameDate(gameDate = {}) {
        if (typeof gameDate === "string") {
            const label = gameDate || this._localize("FANG.History.UnknownDate", "Unscheduled");
            return {
                label,
                sort: "",
                source: "manual"
            };
        }
        const label = String(gameDate?.label || this._localize("FANG.History.UnknownDate", "Unscheduled"));
        return {
            label,
            sort: String(gameDate?.sort || ""),
            source: String(gameDate?.source || "manual")
        };
    }

    _calendarNumber(value) {
        if (value === null || value === undefined) return null;
        if (typeof value === "number" && Number.isFinite(value)) return value;
        const match = String(value).match(/-?\d+/);
        return match ? Number(match[0]) : null;
    }

    _formatCalendarTime(dateLike) {
        if (!dateLike || typeof dateLike !== "object") return "";
        const displayTime = typeof dateLike.display?.time === "string" ? dateLike.display.time.trim() : "";
        if (displayTime && /^\d{1,2}:\d{2}/.test(displayTime)) return displayTime;
        const time = dateLike.time && typeof dateLike.time === "object" ? dateLike.time : dateLike;
        const hour = this._calendarNumber(time.hour ?? time.hours);
        const minute = this._calendarNumber(time.minute ?? time.minutes);
        if (hour === null || minute === null) return "";
        return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }

    _getCalendarMonthName(dateLike, api = null) {
        const direct = dateLike?.display?.monthName
            || dateLike?.monthName
            || dateLike?.month?.name
            || dateLike?.month?.label
            || dateLike?.month?.display;
        if (typeof direct === "string" && direct.trim()) return direct.trim();

        const monthValue = this._calendarNumber(dateLike?.month?.number ?? dateLike?.month?.value ?? dateLike?.month?.index ?? dateLike?.month);
        if (monthValue === null || !api || typeof api.getMonthNames !== "function") return "";
        try {
            const names = api.getMonthNames();
            if (!Array.isArray(names)) return "";
            const oneBased = names[monthValue - 1];
            const zeroBased = names[monthValue];
            return String(oneBased || zeroBased || "").trim();
        } catch (_err) {
            return "";
        }
    }

    _extractCalendarEra(formatted = "") {
        const match = String(formatted).trim().match(/\s([A-ZÄÖÜ]{2,8})$/);
        return match ? match[1] : "";
    }

    _sanitizeCalendarLabel(label) {
        return String(label || "")
            .trim()
            .replace(/^\s*\d+\s+day,\s*/i, "")
            .replace(/\b(\d+)(st|nd|rd|th)\b/gi, "$1.")
            .replace(/\s+/g, " ");
    }

    _formatCalendarDateObject(dateLike, api = null, formatted = "") {
        if (!dateLike || typeof dateLike !== "object") return null;
        const day = this._calendarNumber(dateLike.day ?? dateLike.dayOfMonth ?? dateLike.display?.day ?? dateLike.date?.day);
        const year = this._calendarNumber(dateLike.year ?? dateLike.y ?? dateLike.display?.year ?? dateLike.date?.year);
        const monthName = this._getCalendarMonthName(dateLike, api);
        const monthNumber = this._calendarNumber(dateLike.month?.number ?? dateLike.month?.value ?? dateLike.month?.index ?? dateLike.month);
        const era = dateLike.era?.abbreviation || dateLike.era?.name || dateLike.yearSuffix || dateLike.display?.yearSuffix || this._extractCalendarEra(formatted);
        if (day !== null && year !== null && (monthName || monthNumber !== null)) {
            const dateLabel = monthName
                ? `${day}. ${monthName} ${year}${era ? ` ${era}` : ""}`
                : `${day}.${monthNumber}.${year}${era ? ` ${era}` : ""}`;
            return dateLabel;
        }

        const fallback = [
            dateLike.display?.date,
            dateLike.display?.long,
            dateLike.display?.full,
            dateLike.display,
            dateLike.label,
            dateLike.formatted,
            dateLike.date,
            dateLike.dateString,
            formatted
        ].find(value => typeof value === "string" && value.trim());
        const sanitized = this._sanitizeCalendarLabel(fallback);
        return sanitized || null;
    }

    _safeCalendarFormat(calendar, timestamp, formatter) {
        try {
            const value = calendar.format(timestamp, formatter, { includeTime: false });
            return typeof value === "string" ? value.trim() : "";
        } catch (_err) {
            return "";
        }
    }

    /** "0000-04-11 00:00:00" -> "0000-04-11". The timestamp formatter ignores includeTime. */
    _stripClockFromLabel(label) {
        return String(label || "").replace(/[s,]+d{1,2}:d{2}(:d{2})?$/, "").trim();
    }

    /**
     * Assemble "11. April 0" from Foundry's TimeComponents when the calendar offers no readable
     * formatter. Month and dayOfMonth are zero-based there, and month names are i18n keys.
     */
    _buildCalendarLabelFromComponents(components, calendar) {
        if (!components || typeof components !== "object") return "";
        const year = this._calendarNumber(components.year);
        const monthIndex = this._calendarNumber(components.month);
        const dayIndex = this._calendarNumber(components.dayOfMonth ?? components.day);
        if (year === null || monthIndex === null || dayIndex === null) return "";
        const months = calendar?.months?.values ?? calendar?.months;
        const rawName = Array.isArray(months) ? (months[monthIndex]?.name || months[monthIndex]?.abbreviation || "") : "";
        const monthName = rawName ? this._localize(rawName, rawName) : "";
        return monthName
            ? `${dayIndex + 1}. ${monthName} ${year}`
            : `${dayIndex + 1}.${monthIndex + 1}.${year}`;
    }

    _getCalendarSort(dateLike) {
        if (!dateLike || typeof dateLike !== "object") return "";
        const year = this._calendarNumber(dateLike.year ?? dateLike.y);
        const monthValue = this._calendarNumber(dateLike.month?.number ?? dateLike.month?.value ?? dateLike.month?.index ?? dateLike.month);
        // Foundry's TimeComponents carries BOTH fields: "day" is the day of the YEAR, "dayOfMonth" the
        // day within the month. Reading "day" first produced keys like "000000-03-100" for day 100,
        // which sorts before "000000-03-99" as a string. Calendar modules only ever send "day", so
        // prefer dayOfMonth whenever both are present.
        const hasBothDayFields = dateLike.dayOfMonth !== undefined && dateLike.day !== undefined;
        const day = this._calendarNumber(hasBothDayFields ? dateLike.dayOfMonth : (dateLike.day ?? dateLike.dayOfMonth ?? dateLike.date?.day));
        if (year === null || monthValue === null || day === null) return "";
        const month = Number(monthValue) + (dateLike.month?.index !== undefined ? 1 : 0);
        // Three digits for the day so that a day-of-year value still compares numerically.
        const yearKey = year < 0 ? `-${String(Math.abs(year)).padStart(6, "0")}` : String(year).padStart(6, "0");
        return `${yearKey}-${String(month).padStart(3, "0")}-${String(day).padStart(3, "0")}`;
    }

    _calendarLabelLooksUsable(label) {
        if (!label || typeof label !== "string") return false;
        const normalized = label.trim().toLowerCase();
        if (!normalized) return false;
        return !["world time", "world day", "welttag"].some(token => normalized.includes(token));
    }

    _getCalendarApiCandidates() {
        const candidates = [
            { source: "seasons-stars", api: game.seasonsStars?.integration?.api },
            { source: "seasons-stars", api: game.seasonsStars?.api },
            { source: "calendaria", api: globalThis.CALENDARIA?.api || game.modules.get("calendaria")?.api },
            { source: "simple-calendar", api: globalThis.SimpleCalendar?.api },
            { source: "simple-calendar", api: game.modules.get("foundryvtt-simple-calendar")?.api },
            { source: "simple-calendar", api: game.modules.get("simple-calendar")?.api },
            { source: "simple-calendar", api: game.modules.get("simple-calendar-compat")?.api },
            { source: "simple-calendar", api: game.modules.get("simple-calendar-reborn")?.api }
        ];
        return candidates.filter(candidate => candidate.api && typeof candidate.api === "object");
    }

    /**
     * Ask a calendar module to render a date. Each module wants its own arguments -- Calendaria's
     * formatDate takes a token string and turns an options object into "n.replace is not a
     * function", while others expect exactly that object. A module that refuses one call must not
     * cost us the date entirely, so every attempt stands on its own and the no-argument form (the
     * module's own default rendering) is tried first.
     */
    _formatWithCalendarModule(api, dateLike) {
        if (!api || !dateLike) return "";
        const attempts = [
            () => api.formatDate(dateLike),
            () => api.formatDate(dateLike, { includeTime: false, format: "long" }),
            () => api.formatDateTime(dateLike)
        ];
        for (const attempt of attempts) {
            try {
                const value = attempt();
                if (typeof value === "string" && value.trim()) return value.trim();
            } catch (_err) {
                // Next shape.
            }
        }
        return "";
    }

    _detectCalendarApiGameDate() {
        const timestamp = Number.isFinite(game.time?.worldTime) ? game.time.worldTime : 0;
        for (const candidate of this._getCalendarApiCandidates()) {
            const api = candidate.api;
            try {
                const apiTimestamp = typeof api.timestamp === "function" ? api.timestamp() : timestamp;
                const dateLike = api.getCurrentDate?.()
                    || api.currentDateTime?.()
                    || api.currentDate?.()
                    || api.getCurrentDateTime?.()
                    || (typeof api.worldTimeToDate === "function" ? api.worldTimeToDate(timestamp) : null)
                    || (typeof api.timestampToDate === "function" && Number.isFinite(apiTimestamp) ? api.timestampToDate(apiTimestamp) : null);
                const formatted = this._formatWithCalendarModule(api, dateLike);
                const built = this._formatCalendarDateObject(dateLike, api, formatted);
                // Three sources, in order of trust. A label we assembled ourselves is best -- but
                // only when it carries a month NAME; without one it degrades to "1.1.1501", and the
                // module's own rendering ("1 Hammer, 1501") is plainly better than that.
                const label = built && /\p{L}/u.test(built)
                    ? built
                    : (this._calendarLabelLooksUsable(formatted) ? this._sanitizeCalendarLabel(formatted) : built);
                if (!this._calendarLabelLooksUsable(label)) continue;
                return {
                    label,
                    sort: this._getCalendarSort(dateLike),
                    source: candidate.source
                };
            } catch (err) {
                console.warn(`FANG | Calendar date detection failed for ${candidate.source}`, err);
            }
        }
        return null;
    }

    _detectFoundryCalendarGameDate() {
        const calendar = game.time?.calendar;
        if (!calendar || typeof calendar.format !== "function") return null;
        try {
            const timestamp = Number.isFinite(game.time?.worldTime) ? game.time.worldTime : undefined;
            const components = typeof calendar.timeToComponents === "function" ? calendar.timeToComponents(timestamp) : null;
            // Foundry resolves a formatter name either from CONFIG.time.formatters or from a static
            // method on the calendar class. The base class registers only "timestamp", "duration" and
            // "ago" -- and "timestamp" renders a machine string like "0000-04-11 00:00:00" that also
            // ignores includeTime. Systems add readable ones (dnd5e ships formatMonthDayYear), so try
            // those first, then build the label from the components, and keep the timestamp last.
            const label = ["formatMonthDayYear", "formatMonthDay", "date"]
                .map(formatter => this._safeCalendarFormat(calendar, timestamp, formatter))
                .find(value => this._calendarLabelLooksUsable(value))
                || this._buildCalendarLabelFromComponents(components, calendar)
                || this._stripClockFromLabel(this._safeCalendarFormat(calendar, timestamp, "timestamp"));
            if (!this._calendarLabelLooksUsable(label)) return null;
            return {
                label,
                sort: this._getCalendarSort(components),
                source: "foundry-calendar"
            };
        } catch (err) {
            console.warn("FANG | Foundry calendar date detection failed", err);
            return null;
        }
    }

    detectCurrentGameDate() {
        const moduleCalendarDate = this._detectCalendarApiGameDate();
        if (moduleCalendarDate?.label) return moduleCalendarDate;

        const foundryCalendarDate = this._detectFoundryCalendarGameDate();
        if (foundryCalendarDate?.label) return foundryCalendarDate;

        const lastDate = this._normalizeGameDate(game.settings.get("fang", "historyLastGameDate"));
        if (lastDate?.label && lastDate.label !== this._localize("FANG.History.UnknownDate", "Unscheduled")) {
            return { ...lastDate, source: "last-used" };
        }

        return {
            label: this._localize("FANG.History.UnknownDate", "Unscheduled"),
            sort: "",
            source: "unknown"
        };
    }

    _getHistoryStore() {
        const rawStore = game.settings.get("fang", "history");
        const store = rawStore && typeof rawStore === "object" ? foundry.utils.duplicate(rawStore) : {};
        store.schemaVersion = Number.isFinite(store.schemaVersion) ? store.schemaVersion : 1;
        store.entries = Array.isArray(store.entries) ? store.entries.map(entry => this._normalizeHistoryEntry(entry)).filter(Boolean) : [];
        return store;
    }

    _normalizeHistoryEntry(entry = {}) {
        if (!entry || typeof entry !== "object") return null;
        const refs = Array.isArray(entry.refs) ? entry.refs
            .filter(ref => ref && typeof ref === "object" && ref.type && ref.id)
            .map(ref => ({ type: String(ref.type), id: String(ref.id) }))
            : [];
        return {
            schemaVersion: Number.isFinite(entry.schemaVersion) ? entry.schemaVersion : 1,
            id: entry.id || foundry.utils.randomID(16),
            origin: entry.origin === "auto" ? "auto" : "manual",
            type: this._getHistoryType(entry.type || (entry.origin === "auto" ? "auto" : "manual")),
            kind: this._getHistoryCategory(entry.kind || entry.type || "insight")?.kind || "insight",
            createdAt: entry.createdAt || new Date().toISOString(),
            updatedAt: entry.updatedAt || entry.createdAt || null,
            orderKey: String(entry.orderKey || entry.createdAt || ""),
            authorUserId: entry.authorUserId || null,
            authorName: entry.authorName || "",
            gameDate: this._normalizeGameDate(entry.gameDate || {
                label: entry.gameDateLabel,
                sort: entry.gameDateSort,
                source: "manual"
            }),
            visibility: entry.visibility === "players" ? "players" : "gm",
            title: String(entry.title || ""),
            playerText: String(entry.playerText || entry.text || ""),
            gmText: String(entry.gmText || ""),
            editableByPlayers: entry.editableByPlayers !== false,
            // When the group learned of it, if that is not the day it happened. The entry still
            // belongs to the day of the event -- this only records that it was a revelation.
            knownSince: entry.knownSince?.label ? this._normalizeGameDate(entry.knownSince) : null,
            refs,
            payload: entry.payload && typeof entry.payload === "object" ? foundry.utils.duplicate(entry.payload) : {}
        };
    }

    _getHistoryEntriesForUser({ nodeId = null, user = game.user } = {}) {
        if (nodeId) {
            const scopedNode = this.graphData.nodes.find(node => node.id === nodeId);
            if (!this._canUserSeeNode(scopedNode, user)) return [];
        }

        return this._getHistoryStore().entries
            .filter(entry => !nodeId || entry.refs.some(ref => ref.type === "node" && ref.id === nodeId))
            .map(entry => this._getHistoryEntryForUser(entry, user))
            .filter(Boolean)
            .sort((a, b) => {
                // The chronicle is ordered by GAME day, newest first -- not by the real-world moment
                // the entry was typed. Anything typed up later still lands on its own day.
                const aSort = String(a.gameDate?.sort || "");
                const bSort = String(b.gameDate?.sort || "");
                if (aSort !== bSort) {
                    // Undated entries collect at the end rather than jumping to the top.
                    if (!aSort) return 1;
                    if (!bSort) return -1;
                    return bSort.localeCompare(aSort);
                }
                if (!aSort) {
                    // Without a sortable date, at least keep entries of the same label together.
                    const labelCompare = String(a.gameDate?.label || "").localeCompare(String(b.gameDate?.label || ""));
                    if (labelCompare) return labelCompare;
                }
                const orderCompare = String(b.orderKey || b.createdAt).localeCompare(String(a.orderKey || a.createdAt));
                if (orderCompare) return orderCompare;
                return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
            });
    }

    _getHistoryEntryForUser(entry, user = game.user) {
        const normalized = this._normalizeHistoryEntry(entry);
        if (!normalized) return null;
        if (!user?.isGM && normalized.visibility !== "players") return null;
        const isGM = !!user?.isGM;
        const playerText = String(normalized.playerText || "").trim();
        const gmText = String(normalized.gmText || "").trim();
        // GM sees BOTH player and GM text side-by-side. Players see only the player text.
        const displayText = playerText;
        const displayGmText = isGM ? gmText : "";
        if (!isGM && !playerText) return null;
        if (isGM && !playerText && !gmText) return null;
        const displayRefs = this._getHistoryDisplayRefs(normalized, user);
        if (!isGM && normalized.refs.some(ref => ref.type === "node") && !displayRefs.some(ref => ref.type === "node")) return null;
        return {
            ...normalized,
            displayText,
            displayGmText,
            displayRefs
        };
    }

    _getHistoryDisplayRefs(entry, user = game.user) {
        return entry.refs.map(ref => {
            if (ref.type === "node") {
                const node = this.graphData.nodes.find(n => n.id === ref.id);
                if (!node || !this._canUserSeeNode(node, user)) return null;
                return {
                    ...ref,
                    label: this._getSafeNodeName(node, user),
                    canFocus: this._canUserSeeNode(node, user) && !this._isNodeHiddenForUser(node, user)
                };
            }
            if (ref.type === "faction") {
                const faction = this.graphData.factions.find(f => f.id === ref.id);
                if (!faction || (!user?.isGM && faction.playerVisible === false)) return null;
                return { ...ref, label: faction.name || this._localize("FANG.History.Faction", "Faction"), canFocus: false };
            }
            if (ref.type === "journal" || ref.type === "quest") {
                return { ...ref, label: this._localize("FANG.UI.Quests", "Quests"), canFocus: false };
            }
            return { ...ref, label: ref.id, canFocus: false };
        }).filter(Boolean);
    }

    async _saveHistoryStore(store) {
        if (!game.user?.isGM) return false;
        const normalized = {
            schemaVersion: 1,
            entries: Array.isArray(store?.entries) ? store.entries.map(entry => this._normalizeHistoryEntry(entry)).filter(Boolean) : []
        };
        await game.settings.set("fang", "history", normalized);
        return true;
    }

    async _createHistoryEntry({ node = null, refs = null, title, playerText, gmText, gameDate, knownSince = null, kind, visibility, origin = "manual", type = "manual", editableByPlayers = true, authorUserId = null, authorName = "" }) {
        if (!game.user?.isGM) {
            if (!this._canCreateHistoryEntry(false)) return false;
            game.socket.emit("module.fang", {
                action: "playerCreateHistoryEntry",
                payload: {
                    nodeId: node?.id || null,
                    refs,
                    title,
                    playerText,
                    gameDate,
                    knownSince,
                    kind,
                    origin,
                    type,
                    editableByPlayers,
                    authorUserId: game.user.id,
                    authorName: game.user.name
                }
            });
            ui.notifications.info(this._localize("FANG.History.PlayerSubmitted", "Event submitted."));
            return true;
        }

        const store = this._getHistoryStore();
        const normalizedGameDate = this._normalizeGameDate(gameDate);
        if (normalizedGameDate.source === "manual" && normalizedGameDate.label && normalizedGameDate.label !== this._localize("FANG.History.UnknownDate", "Unscheduled")) {
            await game.settings.set("fang", "historyLastGameDate", {
                label: normalizedGameDate.label,
                sort: normalizedGameDate.sort || normalizedGameDate.label,
                source: "manual"
            });
        }
        const entryRefs = Array.isArray(refs)
            ? refs.filter(ref => ref?.type && ref?.id).map(ref => ({ type: String(ref.type), id: String(ref.id) }))
            : (node?.id ? [{ type: "node", id: node.id }] : []);
        const createdAt = new Date().toISOString();
        store.entries.push(this._normalizeHistoryEntry({
            id: foundry.utils.randomID(16),
            origin: origin === "auto" ? "auto" : "manual",
            type,
            kind: this._getHistoryCategory(kind)?.kind || "insight",
            createdAt,
            orderKey: createdAt,
            authorUserId: authorUserId || game.user.id,
            authorName: authorName || game.user.name,
            gameDate: normalizedGameDate,
            knownSince,
            visibility: visibility === "players" ? "players" : "gm",
            title,
            playerText,
            gmText,
            editableByPlayers,
            refs: entryRefs,
            payload: {}
        }));
        return this._saveHistoryStore(store);
    }

    async _deleteHistoryEntry(entryId) {
        if (!game.user?.isGM || !entryId) return false;
        const store = this._getHistoryStore();
        const before = store.entries.length;
        store.entries = store.entries.filter(entry => entry.id !== entryId);
        if (store.entries.length === before) return false;
        return this._saveHistoryStore(store);
    }

    async _updateHistoryEntry(entryId, patch = {}) {
        if (!entryId) return false;
        if (!game.user?.isGM) {
            game.socket.emit("module.fang", {
                action: "playerUpdateHistoryEntry",
                payload: {
                    entryId,
                    title: patch.title,
                    playerText: patch.playerText,
                    authorUserId: game.user.id,
                    authorName: game.user.name
                }
            });
            ui.notifications.info(this._localize("FANG.History.PlayerSubmitted", "Event submitted."));
            return true;
        }
        const store = this._getHistoryStore();
        const index = store.entries.findIndex(entry => entry.id === entryId);
        if (index === -1) return false;
        const current = store.entries[index];
        const next = this._normalizeHistoryEntry({
            ...current,
            ...patch,
            id: current.id,
            updatedAt: new Date().toISOString(),
            refs: current.refs,
            authorUserId: current.authorUserId,
            authorName: current.authorName,
            createdAt: current.createdAt,
            payload: current.payload
        });
        store.entries[index] = next;
        return this._saveHistoryStore(store);
    }

    async _updateHistoryEntryFromPlayer(entryId, patch = {}) {
        if (!game.user?.isGM || !entryId) return false;
        const entry = this._getHistoryStore().entries.find(item => item.id === entryId);
        if (!entry || entry.visibility !== "players" || entry.editableByPlayers === false) return false;
        const cleanPatch = {
            title: String(patch.title || "").trim(),
            playerText: String(patch.playerText || "").trim()
        };
        if (!cleanPatch.title && !cleanPatch.playerText) return false;
        return this._updateHistoryEntry(entryId, cleanPatch);
    }

    async _recordAutoHistoryEntry({ type, nodes = [], title, playerText, gmText = "", kind = "insight" } = {}) {
        const entryNodes = nodes.filter(Boolean);
        if (!entryNodes.length || !playerText) return false;
        return this._createHistoryEntry({
            refs: entryNodes.map(node => ({ type: "node", id: node.id })),
            title,
            playerText,
            gmText,
            gameDate: this.detectCurrentGameDate(),
            kind,
            visibility: "players",
            origin: "auto",
            type,
            editableByPlayers: true
        });
    }

    async _recordNodeAppearedHistory(node) {
        const name = this._getHistoryPlayerNodeName(node);
        return this._recordAutoHistoryEntry({
            type: "node-added",
            nodes: [node],
            title: this._localize("FANG.History.Auto.NodeAppearedTitle", "Appeared"),
            playerText: this._localize("FANG.History.Auto.NodeAppearedText", "{name} tritt in Erscheinung.").replace("{name}", name),
            gmText: node?.hidden ? `${node.name || name} wurde verdeckt als ${name} in den Graphen aufgenommen.` : "",
            kind: "encounter"
        });
    }

    async _recordIdentityRevealedHistory(node, previousAlias = "") {
        return this._recordAutoHistoryEntry({
            type: "identity-revealed",
            nodes: [node],
            title: this._localize("FANG.History.Auto.IdentityRevealedTitle", "Identität enthüllt"),
            playerText: this._localize("FANG.History.Auto.IdentityRevealedText", "Die wahre Identität wird enthüllt: {name}.").replace("{name}", node?.name || this._localize("FANG.Dropdowns.Unknown", "Unknown")),
            gmText: previousAlias ? `${previousAlias} wurde als ${node?.name || ""} enthüllt.` : "",
            kind: "insight"
        });
    }

    async _recordRelationshipHistory(sourceNode, targetNode, label = "") {
        const sourceName = this._getHistoryPlayerNodeName(sourceNode);
        const targetName = this._getHistoryPlayerNodeName(targetNode);
        const hasLabel = String(label || "").trim();
        const key = hasLabel ? "FANG.History.Auto.RelationshipTextWithLabel" : "FANG.History.Auto.RelationshipText";
        const fallback = hasLabel ? "{source} und {target} stehen in Beziehung: {label}." : "Zwischen {source} und {target} wird eine Verbindung sichtbar.";
        const playerText = this._localize(key, fallback)
            .replace("{source}", sourceName)
            .replace("{target}", targetName)
            .replace("{label}", hasLabel);
        return this._recordAutoHistoryEntry({
            type: "relationship-added",
            nodes: [sourceNode, targetNode],
            title: this._localize("FANG.History.Auto.RelationshipTitle", "Neue Verbindung"),
            playerText,
            kind: "relationship"
        });
    }

    _canQuestHistoryBeVisibleToPlayers(node, quest) {
        if (!node || !quest || quest.visibleToPlayers === false) return false;
        if (node.hidden && node.showHiddenQuestsToPlayers === false) return false;
        return true;
    }

    async _recordQuestVisibleHistory(node, quest) {
        if (!this._canQuestHistoryBeVisibleToPlayers(node, quest)) return false;
        const nodeName = this._getHistoryPlayerNodeName(node);
        const questName = quest?.name || this._localize("FANG.ContextMenu.OpenQuest", "Auftrag");
        return this._recordAutoHistoryEntry({
            type: "quest-visible",
            nodes: [node],
            title: this._localize("FANG.History.Auto.QuestVisibleTitle", "Auftrag"),
            playerText: this._localize("FANG.History.Auto.QuestVisibleText", "{name} hat einen Auftrag: {quest}.")
                .replace("{name}", nodeName)
                .replace("{quest}", questName),
            kind: "quest"
        });
    }

    _canFactionHistoryBeVisibleToPlayers(node, faction) {
        if (!node || !faction) return false;
        if (node.hidden) return false;
        return faction.playerVisible !== false;
    }

    async _recordFactionAssignedHistory(node, faction) {
        if (!this._canFactionHistoryBeVisibleToPlayers(node, faction)) return false;
        const nodeName = this._getHistoryPlayerNodeName(node);
        const factionName = faction?.name || this._localize("FANG.History.Faction", "Fraktion");
        return this._recordAutoHistoryEntry({
            type: "faction-assigned",
            nodes: [node],
            title: this._localize("FANG.History.Auto.FactionAssignedTitle", "Fraktion"),
            playerText: this._localize("FANG.History.Auto.FactionAssignedText", "{name} wird mit {faction} in Verbindung gebracht.")
                .replace("{name}", nodeName)
                .replace("{faction}", factionName),
            kind: "faction"
        });
    }

    _getHistoryPanelHost() {
        return this.element?.querySelector(".fang-app-container") || this.element;
    }

    /**
     * Wire the day rail: clicking a chip scrolls its section into view, and scrolling the log marks
     * the chip of the day currently at the top. The scroll container is .fang-history-log itself.
     */
    _wireHistoryTimeline(panel) {
        const log = panel.querySelector(".fang-history-log");
        const chips = [...panel.querySelectorAll(".fang-history-jump")];
        const sections = [...panel.querySelectorAll(".fang-history-day")];
        if (!log || !chips.length || !sections.length) return;

        const markActive = (dayIndex) => {
            for (const chip of chips) chip.classList.toggle("active", Number(chip.dataset.dayIndex) === dayIndex);
        };

        for (const chip of chips) {
            chip.addEventListener("click", () => {
                const dayIndex = Number(chip.dataset.dayIndex);
                const section = sections.find(item => Number(item.dataset.dayIndex) === dayIndex);
                if (!section) return;
                // scrollIntoView would also scroll the rail itself out of sight, so move the log by hand.
                const offset = section.offsetTop - log.offsetTop - 8;
                log.scrollTo({ top: Math.max(0, offset), behavior: "smooth" });
                markActive(dayIndex);
                // Keep the chip in view by moving the rail's own track. scrollIntoView would walk
                // every scrollable ancestor -- including the log -- and cancel the smooth scroll
                // that was just started, leaving the log sitting at the top.
                const track = chip.closest("ol");
                if (track) {
                    const left = chip.offsetLeft - track.offsetLeft;
                    const right = left + chip.offsetWidth;
                    if (left < track.scrollLeft) track.scrollLeft = left - 8;
                    else if (right > track.scrollLeft + track.clientWidth) track.scrollLeft = right - track.clientWidth + 8;
                }
            });
        }

        let scheduled = false;
        const syncActive = () => {
            scheduled = false;
            // At the bottom the last day may still begin below the cutoff -- there is no content
            // left to scroll it up. Mark it anyway, or the final day could never become active.
            if (log.scrollTop + log.clientHeight >= log.scrollHeight - 2) {
                markActive(Number(sections[sections.length - 1]?.dataset?.dayIndex ?? 0));
                return;
            }
            const cutoff = log.scrollTop + 24;
            let current = sections[0];
            for (const section of sections) {
                if (section.offsetTop - log.offsetTop <= cutoff) current = section;
                else break;
            }
            markActive(Number(current?.dataset?.dayIndex ?? 0));
        };
        log.addEventListener("scroll", () => {
            if (scheduled) return;
            scheduled = true;
            requestAnimationFrame(syncActive);
        });
        markActive(0);
    }

    _closeHistoryPanel() {
        this._getHistoryPanelHost()?.querySelector(".fang-history-canvas-panel")?.remove();
        this._historyPanelContext = null;
    }

    /**
     * The chronicle store changed. Redraw an open log in place, keeping the reading position --
     * but never while someone is filling in the entry form, which would throw away their text.
     */
    _onHistoryStoreChanged() {
        const context = this._historyPanelContext;
        if (context?.mode !== "log") return;
        const panel = this._getHistoryPanelHost()?.querySelector(".fang-history-canvas-panel");
        if (!panel) { this._historyPanelContext = null; return; }
        const node = context.nodeId ? this.graphData.nodes.find(n => n.id === context.nodeId) : null;
        if (context.nodeId && !node) { this._closeHistoryPanel(); return; }
        const scrollTop = panel.querySelector(".fang-history-log")?.scrollTop ?? 0;
        this._openHistoryDialog({ node });
        const log = this._getHistoryPanelHost()?.querySelector(".fang-history-log");
        if (log && scrollTop) log.scrollTop = scrollTop;
    }

    _closeCanvasPrompt() {
        this._getHistoryPanelHost()?.querySelector(".fang-canvas-prompt-panel")?.remove();
    }

    _openCanvasPrompt({ title, icon = "fa-circle-question", body = "", content = "", actions = [] } = {}) {
        return new Promise(resolve => {
            const panelHost = this._getHistoryPanelHost();
            this._closeCanvasPrompt();
            const panel = document.createElement("div");
            panel.className = "fang-canvas-prompt-panel";
            const actionButtons = actions.map(action => `
                <button type="button" class="fang-canvas-prompt-action ${this._escapeHtml(action.className || "")}" data-action="${this._escapeHtml(action.id)}">
                    <i class="fas ${this._escapeHtml(action.icon || "fa-check")}"></i>
                    <span>${this._escapeHtml(action.label || "")}</span>
                </button>`).join("");
            panel.innerHTML = `
                <div class="fang-canvas-prompt-card">
                    <header class="fang-canvas-prompt-header">
                        <h3><i class="fas ${this._escapeHtml(icon)}"></i> ${this._escapeHtml(title || "")}</h3>
                        <button type="button" class="fang-canvas-prompt-close" title="${this._escapeHtml(this._localize("FANG.UI.ClosePanel", "Close"))}"><i class="fas fa-times"></i></button>
                    </header>
                    <div class="fang-canvas-prompt-body">
                        ${body ? `<p>${this._escapeHtml(body)}</p>` : ""}
                        ${content}
                    </div>
                    <div class="fang-canvas-prompt-actions">
                        ${actionButtons}
                    </div>
                </div>`;
            panelHost?.appendChild(panel);

            const close = (value) => {
                panel.remove();
                resolve(value);
            };
            panel.querySelector(".fang-canvas-prompt-close")?.addEventListener("click", () => close(null));
            panel.querySelectorAll(".fang-canvas-prompt-action").forEach(button => {
                button.addEventListener("click", () => {
                    const action = actions.find(item => item.id === button.dataset.action);
                    close(typeof action?.resolve === "function" ? action.resolve(panel) : action?.id);
                });
            });
        });
    }

    async _promptActorDropVisibility(actor) {
        if (!game.user?.isGM) {
            return { hidden: false, displayName: "" };
        }
        const unknown = this._localize("FANG.Dropdowns.Unknown", "Unbekannt");
        return this._openCanvasPrompt({
            title: this._localize("FANG.Dialogs.ActorDropVisibilityTitle", "Token anzeigen"),
            icon: "fa-user-plus",
            body: this._localize("FANG.Dialogs.ActorDropVisibilityBody", "Wie soll der neue Token fuer Spieler erscheinen?").replace("{name}", actor?.name || ""),
            content: `
                <div class="fang-canvas-prompt-fields">
                    <label>${this._escapeHtml(this._localize("FANG.Dialogs.IdentityAlias", "Alias"))}</label>
                    <input type="text" class="fang-drop-alias" value="${this._escapeHtml(unknown)}">
                    <p class="hint">${this._escapeHtml(this._localize("FANG.Dialogs.ActorDropAliasHint", "Der Alias wird nur verwendet, wenn du den Token verdeckt hinzufuegst."))}</p>
                </div>`,
            actions: [
                {
                    id: "visible",
                    label: this._localize("FANG.Dialogs.ActorDropVisible", "Offen anzeigen"),
                    icon: "fa-eye",
                    className: "primary",
                    resolve: () => ({ hidden: false, displayName: "" })
                },
                {
                    id: "hidden",
                    label: this._localize("FANG.Dialogs.ActorDropHidden", "Verdeckt anzeigen"),
                    icon: "fa-user-secret",
                    resolve: (panel) => ({
                        hidden: true,
                        displayName: panel.querySelector(".fang-drop-alias")?.value?.trim() || unknown
                    })
                },
                {
                    id: "gmOnly",
                    label: this._localize("FANG.Dialogs.ActorDropGMOnly", "Nur GM"),
                    icon: "fa-user-shield",
                    className: "danger",
                    resolve: () => ({ hidden: true, gmOnly: true, displayName: unknown })
                }
            ]
        });
    }

    _openAddHistoryEntryDialog({ node = null, refresh = null, entry = null } = {}) {
        if (entry ? !this._canEditHistoryEntry(entry) : !this._canCreateHistoryEntry()) return;
        const isGM = game.user?.isGM;
        const editingEntry = entry ? this._normalizeHistoryEntry(entry) : null;
        const safeNodeName = node ? this._getSafeNodeName(node, game.user) : "";
        const detectedGameDate = this.detectCurrentGameDate();
        const categorySource = editingEntry?.origin === "auto" ? this._getHistoryCategories() : this._getManualHistoryCategories();
        const categoryOptions = categorySource
            .map(category => `<option value="${this._escapeHtml(category.kind)}" ${category.kind === (editingEntry?.kind || "insight") ? "selected" : ""}>${this._escapeHtml(category.label)}</option>`)
            .join("");
        const canEditCategory = !editingEntry || editingEntry.origin !== "auto";
        const title = node
            ? (editingEntry ? this._localize("FANG.History.EditEventForNode", "Edit Event for {name}") : this._localize("FANG.History.AddEventForNode", "Add Event for {name}")).replace("{name}", safeNodeName)
            : (editingEntry ? this._localize("FANG.History.EditEvent", "Edit Event") : this._localize("FANG.History.AddEvent", "Add Event"));
        const gmFields = isGM ? `
                    <label>${this._escapeHtml(this._localize("FANG.History.GMText", "GM Notes"))}</label>
                    <textarea id="fang-history-gm-text" placeholder="${this._escapeHtml(this._localize("FANG.History.GMTextHint", "Private GM context."))}">${this._escapeHtml(editingEntry?.gmText || "")}</textarea>
                    <label class="fang-editor-check"><input type="checkbox" id="fang-history-visible" ${editingEntry?.visibility === "players" ? "checked" : ""}> ${this._escapeHtml(this._localize("FANG.History.VisibleToPlayers", "Visible to players"))}</label>` : "";
        const formGameDate = editingEntry?.gameDate || detectedGameDate;
        // Two questions, kept apart: WHEN did it happen, and did we only find out about it now.
        // Backfilling last session's notes is not the same thing as a revelation about the past,
        // and lumping them together was what made the free-text field so easy to get wrong.
        const isEarlier = !!editingEntry && formGameDate.label !== detectedGameDate.label;
        const knownDays = this._getKnownGameDays().filter(day => day.label !== detectedGameDate.label);
        const matchedDayIndex = knownDays.findIndex(day => day.label === formGameDate.label);
        const useCustom = isEarlier && matchedDayIndex === -1;
        const dayOptions = knownDays
            .map((day, index) => `<option value="${index}" data-label="${this._escapeHtml(day.label)}" data-sort="${this._escapeHtml(day.sort)}" ${index === matchedDayIndex ? "selected" : ""}>${this._escapeHtml(day.label)}</option>`)
            .join("")
            + `<option value="custom" ${useCustom ? "selected" : ""}>${this._escapeHtml(this._localize("FANG.History.CustomDate", "Own date..."))}</option>`;
        // A real date picker whenever the world has a calendar: month names with their true
        // lengths (Harptos festivals are one-day months), the year as a spinner. Falls back to a
        // text field when there is no calendar to ask.
        const picker = this._getCalendarPickerModel();
        const customControl = picker
            ? `<div class="fang-history-picker" ${useCustom ? "" : "hidden"}>
                            <select id="fang-history-pick-day"></select>
                            <select id="fang-history-pick-month">${picker.months.map(month => `<option value="${month.index}" ${month.index === picker.monthIndex ? "selected" : ""}>${this._escapeHtml(month.name)}</option>`).join("")}</select>
                            <input type="number" id="fang-history-pick-year" value="${picker.year}" step="1">
                        </div>
                        <p class="fang-hint fang-history-picked" ${useCustom ? "" : "hidden"}></p>`
            : `<input type="text" id="fang-history-date" value="${this._escapeHtml(useCustom ? formGameDate.label : "")}" placeholder="${this._escapeHtml(this._localize("FANG.History.GameDatePlaceholder", "e.g. 12th of Praios"))}" ${useCustom ? "" : "hidden"}>`;
        const dateReadonly = !isGM && editingEntry;
        const dateControl = dateReadonly
            ? `<label>${this._escapeHtml(this._localize("FANG.History.GameDate", "Game Date"))}</label>
                    <input type="text" id="fang-history-date" value="${this._escapeHtml(formGameDate.label)}" readonly>`
            : `<label>${this._escapeHtml(this._localize("FANG.History.When", "When did it happen?"))}</label>
                    <div class="fang-segmented fang-history-when">
                        <button type="button" class="fang-segment${isEarlier ? "" : " active"}" data-when="today">${this._escapeHtml(this._localize("FANG.History.WhenToday", "Today"))} <span class="fang-history-when-date">${this._escapeHtml(detectedGameDate.label)}</span></button>
                        <button type="button" class="fang-segment${isEarlier ? " active" : ""}" data-when="earlier">${this._escapeHtml(this._localize("FANG.History.WhenEarlier", "On an earlier day"))}</button>
                    </div>
                    <div class="fang-history-when-earlier" ${isEarlier ? "" : "hidden"}>
                        <label>${this._escapeHtml(this._localize("FANG.History.PickDay", "Game day"))}</label>
                        <select id="fang-history-day">${dayOptions}</select>
                        ${customControl}
                        <label class="fang-editor-check"><input type="checkbox" id="fang-history-learned-today" ${editingEntry?.knownSince?.label ? "checked" : ""}> ${this._escapeHtml(this._localize("FANG.History.LearnedToday", "We only found out about this today"))}</label>
                        <p class="fang-hint">${this._escapeHtml(this._localize("FANG.History.LearnedTodayHint", "The entry stays on the day it happened and is marked as a flashback."))}</p>
                    </div>`;
        const panelHost = this._getHistoryPanelHost();
        this._closeHistoryPanel();
        this._historyPanelContext = { mode: "editor", nodeId: node?.id || null };
        const panel = document.createElement("div");
        panel.className = "fang-history-canvas-panel";
        panel.innerHTML = `
            <div class="fang-history-canvas-card">
                <header class="fang-history-canvas-header">
                    <h3><i class="fas fa-feather"></i> ${this._escapeHtml(title)}</h3>
                    <button type="button" class="fang-history-canvas-close" title="${this._escapeHtml(this._localize("FANG.UI.ClosePanel", "Close panel"))}"><i class="fas fa-times"></i></button>
                </header>
                <div class="fang-history-editor">
                    ${node ? `<p class="hint">${this._escapeHtml(this._localize("FANG.History.LinkedTo", "Linked to"))}: <strong>${this._escapeHtml(safeNodeName)}</strong></p>` : ""}
                    ${dateControl}
                    <label>${this._escapeHtml(this._localize("FANG.History.Category", "Category"))}</label>
                    <select id="fang-history-kind" ${canEditCategory ? "" : "disabled"}>${categoryOptions}</select>
                    <label>${this._escapeHtml(this._localize("FANG.History.Title", "Title"))}</label>
                    <input type="text" id="fang-history-title" value="${this._escapeHtml(editingEntry?.title || "")}">
                    <label>${this._escapeHtml(this._localize("FANG.History.PlayerText", "Player Text"))}</label>
                    <textarea id="fang-history-player-text" placeholder="${this._escapeHtml(this._localize("FANG.History.PlayerTextHint", "Safe text players may see if published."))}">${this._escapeHtml(editingEntry?.playerText || "")}</textarea>
                    ${gmFields}
                    <div class="fang-history-editor-actions">
                        <button type="button" class="btn action-btn fang-history-save"><i class="fas fa-save"></i> ${this._escapeHtml(this._localize("FANG.Dialogs.BtnSave", "Save"))}</button>
                        <button type="button" class="btn secondary-btn fang-history-cancel"><i class="fas fa-arrow-left"></i> ${this._escapeHtml(this._localize("FANG.Dialogs.BtnCancel", "Cancel"))}</button>
                    </div>
                </div>
            </div>`;
        panelHost?.appendChild(panel);

        const whenButtons = [...panel.querySelectorAll(".fang-history-when button")];
        const earlierBlock = panel.querySelector(".fang-history-when-earlier");
        const daySelect = panel.querySelector("#fang-history-day");
        const customDate = panel.querySelector("#fang-history-date");
        const learnedToday = panel.querySelector("#fang-history-learned-today");
        for (const button of whenButtons) {
            button.addEventListener("click", () => {
                for (const other of whenButtons) other.classList.toggle("active", other === button);
                if (earlierBlock) earlierBlock.hidden = button.dataset.when !== "earlier";
            });
        }
        const pickerBox = panel.querySelector(".fang-history-picker");
        const pickedHint = panel.querySelector(".fang-history-picked");
        const pickDay = panel.querySelector("#fang-history-pick-day");
        const pickMonth = panel.querySelector("#fang-history-pick-month");
        const pickYear = panel.querySelector("#fang-history-pick-year");

        const refillDays = (keep = null) => {
            if (!picker || !pickDay || !pickMonth) return;
            const month = picker.months[Number(pickMonth.value)] ?? picker.months[0];
            const wanted = keep ?? Number(pickDay.value) || 1;
            pickDay.innerHTML = Array.from({ length: month.days }, (_, i) =>
                `<option value="${i}" ${i === Math.min(wanted, month.days) - 1 ? "selected" : ""}>${i + 1}</option>`).join("");
        };
        const showPicked = () => {
            if (!picker || !pickedHint) return;
            const described = this._describePickedGameDate(Number(pickYear.value), Number(pickMonth.value), Number(pickDay.value));
            pickedHint.textContent = described?.label || "";
        };
        if (picker) {
            refillDays(picker.dayIndex + 1);
            showPicked();
            pickMonth?.addEventListener("change", () => { refillDays(); showPicked(); });
            pickDay?.addEventListener("change", showPicked);
            pickYear?.addEventListener("change", showPicked);
            pickYear?.addEventListener("input", showPicked);
        }

        daySelect?.addEventListener("change", () => {
            const custom = daySelect.value === "custom";
            if (customDate) customDate.hidden = !custom;
            if (pickerBox) pickerBox.hidden = !custom;
            if (pickedHint) pickedHint.hidden = !custom;
            if (custom) {
                if (picker) showPicked();
                else customDate?.focus();
            }
        });
        learnedToday?.addEventListener("change", () => {
            // A revelation about the past is exactly what the flashback category is for. Only a
            // nudge -- the category stays freely selectable afterwards.
            const kindSelect = panel.querySelector("#fang-history-kind");
            if (learnedToday.checked && kindSelect && !kindSelect.disabled) kindSelect.value = "flashback";
        });

        panel.querySelector(".fang-history-canvas-close")?.addEventListener("click", () => this._closeHistoryPanel());
        panel.querySelector(".fang-history-cancel")?.addEventListener("click", () => {
            if (typeof refresh === "function") refresh();
            else this._openHistoryDialog({ node });
        });
        panel.querySelector(".fang-history-save")?.addEventListener("click", async () => {
            const entryTitle = panel.querySelector("#fang-history-title")?.value?.trim() || "";
            const playerText = panel.querySelector("#fang-history-player-text")?.value?.trim() || "";
            const gmText = isGM ? (panel.querySelector("#fang-history-gm-text")?.value?.trim() || "") : "";
            if (!entryTitle && !playerText && !gmText) return;
            const gameDate = this._readHistoryFormGameDate(panel, detectedGameDate, formGameDate, dateReadonly);
            const patch = {
                title: entryTitle || this._localize("FANG.History.Untitled", "Untitled insight"),
                playerText,
                gmText,
                kind: canEditCategory ? (panel.querySelector("#fang-history-kind")?.value || "insight") : (editingEntry?.kind || "insight"),
                gameDate: gameDate.gameDate,
                knownSince: gameDate.knownSince,
                visibility: isGM && panel.querySelector("#fang-history-visible")?.checked ? "players" : (isGM ? "gm" : "players")
            };
            if (!isGM && editingEntry) {
                delete patch.kind;
                delete patch.gmText;
                delete patch.gameDate;
                delete patch.knownSince;
                delete patch.visibility;
            }
            if (editingEntry) await this._updateHistoryEntry(editingEntry.id, patch);
            else await this._createHistoryEntry({ node, ...patch });
            if (typeof refresh === "function") refresh();
            else this._openHistoryDialog({ node });
        });
    }

    /**
     * Read the game date out of the entry form. Picking an existing day carries that day's own
     * sort key over verbatim, which is the point: a hand-typed label sorts nowhere.
     */
    _readHistoryFormGameDate(panel, detectedGameDate, formGameDate, readonly = false) {
        if (readonly) return { gameDate: formGameDate, knownSince: null };
        const earlier = panel.querySelector('.fang-history-when button[data-when="earlier"]')?.classList.contains("active");
        if (!earlier) return { gameDate: { ...detectedGameDate }, knownSince: null };

        const daySelect = panel.querySelector("#fang-history-day");
        const option = daySelect?.selectedOptions?.[0];
        let gameDate;
        if (option && option.value !== "custom") {
            gameDate = { label: option.dataset.label || "", sort: option.dataset.sort || "", source: "chronicle" };
        } else {
            const pickMonth = panel.querySelector("#fang-history-pick-month");
            const pickDay = panel.querySelector("#fang-history-pick-day");
            const pickYear = panel.querySelector("#fang-history-pick-year");
            const picked = pickMonth && pickDay && pickYear
                ? this._describePickedGameDate(Number(pickYear.value), Number(pickMonth.value), Number(pickDay.value))
                : null;
            if (picked?.label) gameDate = picked;
            else {
                const label = panel.querySelector("#fang-history-date")?.value?.trim() || "";
                gameDate = { label, sort: "", source: "manual" };
            }
        }
        if (!gameDate.label) gameDate = { ...detectedGameDate };
        const knownSince = panel.querySelector("#fang-history-learned-today")?.checked ? { ...detectedGameDate } : null;
        return { gameDate, knownSince };
    }

    _renderHistoryDialogContent({ node = null } = {}) {
        const entries = this._getHistoryEntriesForUser({ nodeId: node?.id || null });
        const grouped = new Map();
        for (const entry of entries) {
            const key = entry.gameDate.label || this._localize("FANG.History.UnknownDate", "Unscheduled");
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key).push(entry);
        }

        const canAdd = this._canCreateHistoryEntry(true);
        const canDelete = game.user?.isGM;
        const addButton = canAdd
            ? `<button type="button" class="fang-history-add"><i class="fas fa-plus"></i> ${this._escapeHtml(this._localize("FANG.History.AddEvent", "Add Event"))}</button>`
            : "";
        const empty = `<div class="fang-history-empty">${this._escapeHtml(this._localize("FANG.History.Empty", "No chronicle entries yet."))}</div>`;
        const dayGroups = [...grouped.entries()];
        const groupsHtml = dayGroups.map(([date, dayEntries], dayIndex) => `
            <section class="fang-history-day" data-day-index="${dayIndex}">
                <h3><i class="fas fa-calendar-day"></i> ${this._escapeHtml(date)}</h3>
                <ol class="fang-history-list">
                    ${dayEntries.map(entry => {
                        const primaryRef = node ? null : entry.displayRefs.find(ref => ref.type === "node");
                        const visibleRefs = node
                            ? entry.displayRefs.filter(ref => !(ref.type === "node" && ref.id === node.id))
                            : entry.displayRefs.filter(ref => !(primaryRef && ref.type === primaryRef.type && ref.id === primaryRef.id));
                        const refs = visibleRefs.length
                            ? `<div class="fang-history-refs">${visibleRefs.map(ref => `<span>${this._escapeHtml(ref.label)}</span>`).join("")}</div>`
                            : "";
                        const focusRef = entry.displayRefs.find(ref => ref.type === "node" && ref.canFocus);
                        const imageSrc = this._getHistoryEntryImage(entry);
                        const canEdit = this._canEditHistoryEntry(entry);
                        const category = this._getHistoryCategory(entry.kind);
                        return `
                            <li class="fang-history-entry" data-entry-id="${this._escapeHtml(entry.id)}">
                                <div class="fang-history-entry-media">
                                    <img src="${this._escapeHtml(imageSrc)}" alt="">
                                    <div class="fang-history-entry-body">
                                        <div class="fang-history-entry-head">
                                            <div class="fang-history-title-line">
                                                ${primaryRef ? `<span class="fang-history-token-label">${this._escapeHtml(primaryRef.label)}</span>` : ""}
                                                <strong><i class="fas ${this._escapeHtml(category.icon)}"></i> ${this._escapeHtml(entry.title || this._localize("FANG.History.Untitled", "Untitled insight"))}</strong>
                                            </div>
                                            <div class="fang-history-category">${this._escapeHtml(category.label)}</div>
                                        </div>
                                        ${entry.knownSince?.label ? `<div class="fang-history-learned"><i class="fas fa-clock-rotate-left" aria-hidden="true"></i> ${this._escapeHtml(this._localize("FANG.History.LearnedOn", "Found out on {date}").replace("{date}", entry.knownSince.label))}</div>` : ""}
                                        ${entry.displayText ? `<p class="fang-history-player-text">${this._escapeHtml(entry.displayText)}</p>` : ""}
                                        ${entry.displayGmText ? `<p class="fang-history-gm-text"><i class="fas fa-user-shield" aria-hidden="true"></i> <span>${this._escapeHtml(entry.displayGmText)}</span></p>` : ""}
                                        ${refs}
                                    </div>
                                </div>
                                <div class="fang-history-actions">
                                    ${focusRef ? `<button type="button" class="fang-icon-btn fang-history-focus" data-node-id="${this._escapeHtml(focusRef.id)}" title="${this._escapeHtml(this._localize("FANG.History.Focus", "Focus"))}"><i class="fas fa-crosshairs"></i></button>` : ""}
                                    ${canEdit ? `<button type="button" class="fang-icon-btn fang-history-edit" title="${this._escapeHtml(this._localize("FANG.ContextMenu.Edit", "Edit"))}"><i class="fas fa-pen-to-square"></i></button>` : ""}
                                    ${canDelete ? `<button type="button" class="fang-icon-btn danger fang-history-delete" title="${this._escapeHtml(this._localize("FANG.UI.Delete", "Delete"))}"><i class="fas fa-trash"></i></button>` : ""}
                                </div>
                            </li>`;
                    }).join("")}
                </ol>
            </section>`).join("");

        // A day rail above the log. Same order as the sections below (newest day first) so that the
        // leftmost chip is always the topmost section -- a true oldest-to-newest axis would read the
        // opposite way from the list and make every click a surprise.
        const timelineHtml = dayGroups.length > 1 ? `
            <nav class="fang-history-timeline" aria-label="${this._escapeHtml(this._localize("FANG.History.JumpToDay", "Jump to game day"))}">
                <ol>
                    ${dayGroups.map(([date, dayEntries], dayIndex) => `
                        <li>
                            <button type="button" class="fang-history-jump" data-day-index="${dayIndex}" title="${this._escapeHtml(date)}">
                                <span class="fang-history-jump-date">${this._escapeHtml(date)}</span>
                                <span class="fang-history-jump-count">${dayEntries.length}</span>
                            </button>
                        </li>`).join("")}
                </ol>
            </nav>` : "";

        return `
            <div class="fang-history-log">
                <header class="fang-history-log-header">
                    <div>
                        <h2>${this._escapeHtml(node ? this._localize("FANG.History.NodeChronicle", "Token Chronicle") : this._localize("FANG.History.Timeline", "Chronicle"))}</h2>
                        ${node ? `<p>${this._escapeHtml(this._getSafeNodeName(node))}</p>` : ""}
                    </div>
                    ${addButton}
                </header>
                ${entries.length ? timelineHtml : ""}
                ${entries.length ? groupsHtml : empty}
            </div>`;
    }

    _openHistoryDialog({ node = null } = {}) {
        const panelHost = this._getHistoryPanelHost();
        this._closeHistoryPanel();
        // Remember what is on screen so a store change can redraw exactly this view -- and so it
        // knows to leave a half-written entry alone.
        this._historyPanelContext = { mode: "log", nodeId: node?.id || null };
        const panel = document.createElement("div");
        panel.className = "fang-history-canvas-panel";
        panel.innerHTML = `
            <div class="fang-history-canvas-card">
                <button type="button" class="fang-history-canvas-close" title="${this._escapeHtml(this._localize("FANG.UI.ClosePanel", "Close panel"))}"><i class="fas fa-times"></i></button>
                ${this._renderHistoryDialogContent({ node })}
            </div>`;
        panelHost?.appendChild(panel);

        const refresh = () => this._openHistoryDialog({ node });
        panel.querySelector(".fang-history-canvas-close")?.addEventListener("click", () => this._closeHistoryPanel());
        panel.querySelector(".fang-history-add")?.addEventListener("click", () => this._openAddHistoryEntryDialog({ node, refresh }));
        panel.querySelectorAll(".fang-history-edit").forEach(button => {
            button.addEventListener("click", (event) => {
                const entryId = event.currentTarget.closest(".fang-history-entry")?.dataset?.entryId;
                const entry = this._getHistoryStore().entries.find(item => item.id === entryId);
                if (entry) this._openAddHistoryEntryDialog({ node, refresh, entry });
            });
        });
        panel.querySelectorAll(".fang-history-delete").forEach(button => {
            button.addEventListener("click", async (event) => {
                const entryId = event.currentTarget.closest(".fang-history-entry")?.dataset?.entryId;
                if (await this._deleteHistoryEntry(entryId)) refresh();
            });
        });
        this._wireHistoryTimeline(panel);
        panel.querySelectorAll(".fang-history-focus").forEach(button => {
            button.addEventListener("click", (event) => {
                const nodeId = event.currentTarget?.dataset?.nodeId;
                const targetNode = this.graphData.nodes.find(n => n.id === nodeId);
                if (targetNode && !this._isNodeHiddenForUser(targetNode, game.user)) {
                    this._closeHistoryPanel();
                    this._focusNodeOnCanvas(targetNode);
                }
            });
        });
    }

    _focusNodeOnCanvas(node) {
        if (!node || !this.canvas || !this.zoom || typeof d3 === "undefined") return;
        const sidebar = this.element ? this.element.querySelector(".sidebar") : null;
        const sidebarWidth = (sidebar && sidebar.style.display !== "none") ? sidebar.getBoundingClientRect().width : 0;
        const canvasBounds = this.canvas.getBoundingClientRect?.();
        const baseWidth = this.width || this.position?.width || canvasBounds?.width || 800;
        const baseHeight = this.height || this.position?.height || canvasBounds?.height || 600;
        const width = Math.max(100, baseWidth - sidebarWidth);
        const height = Math.max(100, baseHeight);
        const scale = Math.max(this.transform?.k || 0.8, 0.85);
        const transform = d3.zoomIdentity
            .translate(width / 2 + sidebarWidth / 2, height / 2)
            .scale(scale)
            .translate(-node.x, -node.y);
        d3.select(this.canvas).transition().duration(600).call(this.zoom.transform, transform);
        this._hoveredNodeId = node.id;
        this.ticked();
        setTimeout(() => {
            if (this._hoveredNodeId === node.id) {
                this._hoveredNodeId = null;
                this.ticked();
            }
        }, 1800);
    }

    /**
     * Normalize/migrate a graph structure in place and return it.
     * Only adopts the result as the live graph when called for our own data — passing a
     * foreign structure (e.g. a freshly read server state during a merge) must never
     * swap out this.graphData underneath us.
     */
    _repairGraphData(graphData = this.graphData) {
        const isLiveGraph = graphData === this.graphData;
        const graph = graphData && typeof graphData === "object" ? graphData : {};
        graph.nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
        graph.links = Array.isArray(graph.links) ? graph.links : [];
        graph.factions = Array.isArray(graph.factions) ? graph.factions.map(f => this._normalizeFaction(f)) : [];

        const nodeIds = new Set(graph.nodes.map(n => n?.id).filter(Boolean));
        graph.links = graph.links.filter(link => {
            const sourceId = this._getLinkEndpointId(link?.source);
            const targetId = this._getLinkEndpointId(link?.target);
            return sourceId && targetId && nodeIds.has(sourceId) && nodeIds.has(targetId);
        });

        const factionIds = new Set(graph.factions.map(f => f.id).filter(Boolean));
        for (const node of graph.nodes) {
            if (node.factionId && !factionIds.has(node.factionId)) node.factionId = null;
            node.conditions = Array.isArray(node.conditions) ? node.conditions : [];
            node.questUuids = Array.isArray(node.questUuids) ? node.questUuids : [];
            node.questUuids = node.questUuids.map(q => ({ ...q, status: q.status || "open" }));
            if (node.showHiddenQuestsToPlayers === undefined) node.showHiddenQuestsToPlayers = true;
            if (node.gmOnly === undefined) node.gmOnly = false;
            if (node.secretKind === undefined) node.secretKind = node.gmOnly ? "secret" : "";
            if (node.zoneId === undefined) node.zoneId = null;
        }

        graph.links.forEach(link => {
            // Stable identity for every link. Nodes and factions have had an id from the
            // start, links were only identified by source+target — which cannot tell two
            // parallel relations apart, and cannot distinguish "label edited" from
            // "deleted and recreated". The merge logic needs that distinction.
            // Migration is silent and additive: old worlds get ids on first load.
            if (!link.id) link.id = foundry.utils.randomID();
            if (link.gmOnly === undefined) link.gmOnly = false;
            if (link.relationshipType === undefined) link.relationshipType = "";
            // "faction" as a relationship type duplicated the faction manager. What those
            // links actually meant was a chain of command, so they become "hierarchy".
            if (link.relationshipType === "faction") link.relationshipType = "hierarchy";
            if (link.questStatus === undefined) link.questStatus = "";
        });

        if (graph.showFactionLines === undefined) graph.showFactionLines = true;
        if (graph.showFactionLegend === undefined) graph.showFactionLegend = true;
        graph.zones = Array.isArray(graph.zones) ? graph.zones.map(zone => this._normalizeZone(zone)) : [];
        graph.relationshipTypes = Array.isArray(graph.relationshipTypes)
            ? graph.relationshipTypes.map(type => this._normalizeRelationshipType(type))
            : this._getDefaultRelationshipTypes();

        // Worlds created before this store the old "faction" type in their own list, so
        // dropping it from the defaults is not enough — rename it there too, and only if
        // "hierarchy" is not already present (never produce a duplicate).
        const legacyFactionType = graph.relationshipTypes.find(t => t.id === "faction");
        if (legacyFactionType) {
            if (graph.relationshipTypes.some(t => t.id === "hierarchy")) {
                graph.relationshipTypes = graph.relationshipTypes.filter(t => t.id !== "faction");
            } else {
                legacyFactionType.id = "hierarchy";
                legacyFactionType.label = this._localize("FANG.RelationshipTypes.Hierarchy", "Hierarchy");
            }
        }
        if (isLiveGraph) this.graphData = graph;
        return graph;
    }

    _onRender(context, options) {
        super._onRender(context, options);
        this._applyVisualTheme();

        const monitorName = game.settings.get("fang", "monitorDisplayName").toLowerCase();

        // 1. UI Setup (Pre-D3 Dimensions)
        // Manage Sidebar visibility and Fullscreen classes first
        if (!game.user.isGM) {
            const sidebar = this.element.querySelector(".sidebar");
            if (sidebar) {
                const isMonitor = game.user.name.toLowerCase().includes(monitorName);
                sidebar.style.display = !isMonitor ? "flex" : "none";
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
        this._rebuildSearchMatches();

        // Rotating a tablet or opening its keyboard changes how much room there is. Re-clamp,
        // or the window keeps a height the screen no longer has.
        if (!this._viewportFitHandler) {
            this._viewportFitHandler = foundry.utils.debounce(() => {
                if (this.rendered) this.setPosition({});
            }, 120);
            window.addEventListener("resize", this._viewportFitHandler);
            window.addEventListener("orientationchange", this._viewportFitHandler);
        }

        // Manage ResizeObserver
        if (this._resizeObserver) this._resizeObserver.disconnect();
        const canvasContainer = this.element.querySelector(".canvas-container");
        this._resizeObserver = new ResizeObserver(() => this.resizeCanvas());
        this._resizeObserver.observe(canvasContainer);

        // 3. Re-attach Event Listeners (Universal)
        // The old editor sidebar (link form, delete dropdown, inline link editor) is gone —
        // it had been display:none for ages. Connecting runs through the canvas tools,
        // deleting through the right-click menu.
        const btnCanvasQuickConnect = this.element.querySelector("#btnCanvasQuickConnect");
        if (btnCanvasQuickConnect) btnCanvasQuickConnect.addEventListener("click", this._onToggleQuickConnectMode.bind(this));
        const btnCanvasAddPlaceholder = this.element.querySelector("#btnCanvasAddPlaceholder");
        if (btnCanvasAddPlaceholder) btnCanvasAddPlaceholder.addEventListener("click", this._onAddPlaceholder.bind(this));
        const btnManageFactions = this.element.querySelector("#btnManageFactions");
        if (btnManageFactions) btnManageFactions.addEventListener("click", this._onManageFactions.bind(this));

        const btnToggleLock = this.element.querySelector("#btnToggleLock");
        if (btnToggleLock) btnToggleLock.addEventListener("click", this._onToggleEditLock.bind(this));

        const btnForceRelease = this.element.querySelector("#btnForceRelease");
        if (btnForceRelease) btnForceRelease.addEventListener("click", this._onForceReleaseLock.bind(this));

        const canvas = this.element.querySelector("#graphCanvas");
        canvas.addEventListener("click", this._onCanvasClick.bind(this));
        canvas.addEventListener("dblclick", this._onCanvasDoubleClick.bind(this));
        canvas.addEventListener("pointerdown", this._onCanvasPointerDown.bind(this));
        canvas.addEventListener("pointermove", this._onCanvasPointerMove.bind(this));
        canvas.addEventListener("pointerup", this._onCanvasPointerUp.bind(this));
        canvas.addEventListener("pointercancel", this._onCanvasPointerCancel.bind(this));

        // 4. Update Lock UI status
        this._updateLockUI();
        canvas.addEventListener("contextmenu", this._onCanvasRightClick.bind(this));
        canvas.addEventListener("mousemove", this._handleCanvasMouseMove.bind(this));

        // (The old tab-bar wiring lived here. The tab bar had been display:none for ages —
        //  the rail replaced it — so this only ever bound listeners to nothing.)

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

        const railSearch = this.element.querySelector("#fangRailSearch");
        if (railSearch) railSearch.addEventListener("click", () => {
            this._setSearchUiVisible(!this._searchUiVisible, { focus: true });
        });

        // Affiliation: faction ("who does someone belong to") and location ("where is
        // someone") are siblings, so managing and grouping by either lives in one panel.
        // It used to be scattered: factions opened a dialog straight from the rail, the
        // location manager sat under Advanced, and the two grouping buttons under View.
        const railAffiliation = this.element.querySelector("#fangRailAffiliation");
        if (railAffiliation) railAffiliation.addEventListener("click", () => this._openSidebarPanel("affiliation"));

        const railPresentation = this.element.querySelector("#fangRailPresentation");
        if (railPresentation) railPresentation.addEventListener("click", () => this._openSidebarPanel("view"));

        const railHistory = this.element.querySelector("#fangRailHistory");
        if (railHistory) railHistory.addEventListener("click", (event) => {
            event.preventDefault();
            this._closeSidebarPanel();
            this._openHistoryDialog();
        });

        const railManage = this.element.querySelector("#fangRailManage");
        if (railManage) railManage.addEventListener("click", () => this._openSidebarPanel("advanced"));

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

            // Grouping is one exclusive mode, not two independent actions — a segmented
            // control says that on its own, where two buttons said nothing about being
            // mutually exclusive or which one was currently on.
            this.element.querySelectorAll(".fang-segment[data-grouping]").forEach(segment => {
                segment.addEventListener("click", (e) => {
                    e.preventDefault();
                    this._setGroupingMode(segment.dataset.grouping);
                });
            });

            // Faction lines: the primary way factions are shown, so the switch belongs
            // next to the faction manager rather than buried in a dialog.
            const cbShowFactionLines = this.element.querySelector("#cbShowFactionLines");
            if (cbShowFactionLines) {
                cbShowFactionLines.checked = this.graphData.showFactionLines !== false;
                cbShowFactionLines.addEventListener("change", async (e) => {
                    this.graphData.showFactionLines = !!e.target.checked;
                    this.ticked();
                    await this.saveData();
                });
            }

            const cbShowFactionLegend = this.element.querySelector("#cbShowFactionLegend");
            if (cbShowFactionLegend) {
                cbShowFactionLegend.checked = this.graphData.showFactionLegend !== false;
                cbShowFactionLegend.addEventListener("change", async (e) => {
                    this.graphData.showFactionLegend = !!e.target.checked;
                    this.ticked();
                    await this.saveData();
                });
            }

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

            const btnManageZones = this.element.querySelector("#btnManageZones");
            if (btnManageZones) btnManageZones.addEventListener("click", () => this._onManageZones());
        } else {
            setTimeout(() => this.resizeCanvas(), 50);
        }

        this._updateGroupByFactionButtonState();
        this._updateQuickConnectButtonState();

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
        const normalizedTheme = selectedTheme === "cyberpunk" ? "cyberpunk" : "fantasy";
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

        if (this._viewportFitHandler) {
            window.removeEventListener("resize", this._viewportFitHandler);
            window.removeEventListener("orientationchange", this._viewportFitHandler);
            this._viewportFitHandler = null;
        }

        super._onClose(options);
    }

    setPosition(position = {}) {
        if (game.user.name.toLowerCase().includes("monitor")) {
            // Force absolute fullscreen for Monitor to avoid Foundry UI offsets
            return this;
        }
        return super.setPosition(this._fitPositionToViewport(position));
    }

    /**
     * Keep the window inside what the browser actually shows.
     *
     * The defaults are 1400x950, which is more than a tablet in landscape has left once the
     * browser's own chrome is subtracted. The lower edge of the window then sits below the
     * screen -- and with it the footer of the in-window editor, the one holding Save. Nothing
     * scrolls it into view either: that overlay is anchored to the window, not to the page, so
     * players simply could not save. Shrinking is the fix; the panel bodies scroll on their own.
     */
    _fitPositionToViewport(position = {}) {
        const margin = 12;
        const maxWidth = Math.max(320, window.innerWidth - margin * 2);
        const maxHeight = Math.max(320, window.innerHeight - margin * 2);
        const fitted = { ...position };
        const width = Number.isFinite(fitted.width) ? fitted.width : this.position?.width;
        const height = Number.isFinite(fitted.height) ? fitted.height : this.position?.height;

        if (Number.isFinite(width) && width > maxWidth) fitted.width = maxWidth;
        if (Number.isFinite(height) && height > maxHeight) fitted.height = maxHeight;
        // A window that had to shrink is as wide or tall as the screen allows, so its only
        // valid origin is the margin. Leaving the old offset would push it back off the edge.
        if (fitted.width === maxWidth) fitted.left = margin;
        if (fitted.height === maxHeight) fitted.top = margin;
        return fitted;
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
        // The merge baseline has to be what was actually stored, *before* migrations run.
        // Taking it after migrating makes every migration look like "someone else changed
        // this" on the next save — the merge then prefers the stored (unmigrated) value
        // and quietly undoes the migration. Measured: the faction->hierarchy rename was
        // reverted on every single save until this was fixed.
        const storedBeforeMigration = entry?.getFlag("fang", "graphData") ?? null;
        if (entry) {
            const data = storedBeforeMigration;
            if (data) {
                this.graphData = foundry.utils.duplicate(data);

                // --- Migration Logic ---
                // Rename 'groups' array to 'factions'
                if (this.graphData.groups && !this.graphData.factions) {
                    this.graphData.factions = this.graphData.groups;
                    delete this.graphData.groups;
                }

                if (!this.graphData.factions) this.graphData.factions = [];
                this.graphData.factions = this.graphData.factions.map(f => this._normalizeFaction(f));

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
                    if (node.playerNotes === undefined) node.playerNotes = "";
                    if (node.showHiddenQuestsToPlayers === undefined) node.showHiddenQuestsToPlayers = true;
                    if (!node.conditions) node.conditions = [];
                    // Migration: Journal linking fields
                    if (node.playerLorePageId === undefined) node.playerLorePageId = null;
                    if (node.journalUuid === undefined) node.journalUuid = null;
                    // Migration: questUuid (single) -> questUuids (array)
                    if (node.questUuid !== undefined && !node.questUuids) {
                        node.questUuids = node.questUuid ? [{ uuid: node.questUuid, name: node._questJournalName || "Quest Journal", visibleToPlayers: true }] : [];
                        delete node.questUuid;
                        delete node._questJournalName;
                    }
                    if (!node.questUuids) node.questUuids = [];
                    node.questUuids = node.questUuids.map(q => ({
                        uuid: q.uuid,
                        name: q.name || "Quest Journal",
                        visibleToPlayers: q.visibleToPlayers !== false,
                        status: q.status || "open"
                    }));
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
        this.graphData.factions = this.graphData.factions.map(f => this._normalizeFaction(f));
        this._repairGraphData();

        // Baseline for the merge: the stored state as it was, not what our migrations
        // just made of it — see the comment at the top of this method.
        // Must be set *before* the DiploGlass sync, because that can trigger a save —
        // which would then merge against a missing baseline and take our whole graph
        // as "changed by us".
        this._setBaseline(storedBeforeMigration ?? this._buildExportData());

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
                    description: "",
                    playerVisible: true,
                    showInLegendForPlayers: true,
                    showLinesForPlayers: true,
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

    /**
     * Build the persistable snapshot of the current graph.
     *
     * Deny-list approach: everything in graphData is persisted except live runtime
     * fields (see FANG_RUNTIME_* above). Previously this was a hand-maintained
     * allow-list, which silently dropped every field a new feature added — zones,
     * relationship types, secret flags and quest status were all lost on reload.
     */
    _buildExportData() {
        const exportData = {};

        // 1. Top-level scalars/arrays (zones, relationshipTypes, showFactionLines, ...)
        //    Collections with runtime state are handled separately below.
        for (const [key, value] of Object.entries(this.graphData)) {
            if (["nodes", "links", "factions"].includes(key)) continue;
            if (value === undefined) continue;
            exportData[key] = foundry.utils.duplicate(value);
        }

        // 2. Nodes — strip d3 state and the cached HTMLImageElement.
        exportData.nodes = this.graphData.nodes.map(n => this._serializeForStorage(n, FANG_RUNTIME_NODE_FIELDS));

        // 3. Links — d3 replaces source/target with live node objects, which would be
        //    circular. Normalize back to plain ids before cloning.
        exportData.links = this.graphData.links
            .map(l => {
                const clean = this._serializeForStorage(l, [...FANG_RUNTIME_LINK_FIELDS, "source", "target"]);
                clean.source = this._getLinkEndpointId(l.source);
                clean.target = this._getLinkEndpointId(l.target);
                return clean;
            })
            .filter(l => l.source && l.target);

        // 4. Factions
        exportData.factions = this.graphData.factions.map(f => this._serializeForStorage(f, FANG_RUNTIME_FACTION_FIELDS));

        // 5. Mark the schema we wrote, so a merge can tell whether the other side speaks
        //    the same language (see FANG_GRAPH_SCHEMA_VERSION).
        exportData.schemaVersion = FANG_GRAPH_SCHEMA_VERSION;

        return exportData;
    }

    /**
     * The "no factions yet" placeholder, as markup.
     *
     * Needed in two places — when the manager opens with nothing in it, and when the last
     * faction is deleted while it is open — so it lives here rather than being written out
     * twice and drifting apart.
     *
     * @param {HTMLElement} [listElement] when given, the placeholder is rendered into it
     * @returns {string} the markup
     */
    _renderFactionsEmptyState(listElement = null) {
        const html = `
            <div class="fang-empty-state">
                <i class="fas fa-users-slash"></i>
                <p class="fang-empty-state__title">${this._localize("FANG.Dialogs.NoFactionsTitle", "No factions yet")}</p>
                <p class="fang-empty-state__hint">${this._localize("FANG.Dialogs.NoFactionsHint", "Create a faction, then assign characters to it via right-click → Edit.")}</p>
            </div>`;
        if (listElement) {
            listElement.classList.add("is-empty");
            listElement.innerHTML = html;
        }
        return html;
    }

    /**
     * Open an editor as a large panel INSIDE the FANG window, not as a separate Foundry
     * dialog window.
     *
     * Takes the exact same config shape as _openDialog ({ title, content, render, buttons,
     * default }), so a caller switches from a popup to this by changing one word. The
     * faction and location managers use it: "ein schönes Fenster in unserem Fenster,
     * statt tausende weitere Fenster".
     *
     * @param {object} config  same as _openDialog: { title, content, render, buttons, default }
     * @returns {Promise<any>} resolves with the pressed button's callback result (or null on close)
     */
    _openPanelEditor({ title, content, buttons = {}, default: defaultButton, render } = {}) {
        const overlay = this.element?.querySelector("#fang-editor-overlay");
        if (!overlay) {
            // No overlay in the DOM (shouldn't happen) — fall back to the dialog so the
            // feature still works rather than silently doing nothing.
            return this._openDialog({ title, content, buttons, default: defaultButton, render });
        }

        const titleEl = overlay.querySelector("#fang-editor-title");
        const bodyEl = overlay.querySelector(".fang-editor-body");
        const footerEl = overlay.querySelector(".fang-editor-footer");
        const closeBtn = overlay.querySelector(".fang-editor-close");
        const backdrop = overlay.querySelector(".fang-editor-backdrop");

        return new Promise((resolve) => {
            let settled = false;
            const close = (result = null) => {
                if (settled) return;
                settled = true;
                overlay.classList.add("hidden");
                bodyEl.innerHTML = "";
                footerEl.innerHTML = "";
                document.removeEventListener("keydown", onKey, true);
                resolve(result);
            };
            const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); close(null); } };

            titleEl.textContent = title ?? "";
            bodyEl.innerHTML = content ?? "";

            // Footer buttons. A button with `side: "left"` (e.g. a destructive Delete) is
            // pushed to the far left, away from Save/Cancel — the conventional place for a
            // dangerous action so it is not next to the button you press all the time.
            footerEl.innerHTML = "";
            const leftGroup = document.createElement("div");
            leftGroup.className = "fang-editor-footer-left";
            const rightGroup = document.createElement("div");
            rightGroup.className = "fang-editor-footer-right";
            for (const [action, cfg] of Object.entries(buttons)) {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "btn fang-editor-btn"
                    + (action === defaultButton ? " primary" : "")
                    + (cfg.className ? ` ${cfg.className}` : "");
                const iconClass = /class=["']([^"']+)["']/.exec(cfg.icon || "")?.[1];
                btn.innerHTML = `${iconClass ? `<i class="${iconClass}"></i> ` : ""}${cfg.label ?? action}`;
                btn.addEventListener("click", async () => {
                    let result = action;
                    if (cfg.callback) result = await cfg.callback($(bodyEl));
                    close(result ?? action);
                });
                (cfg.side === "left" ? leftGroup : rightGroup).appendChild(btn);
            }
            footerEl.appendChild(leftGroup);
            footerEl.appendChild(rightGroup);

            closeBtn.onclick = () => close(null);
            backdrop.onclick = () => close(null);
            document.addEventListener("keydown", onKey, true);

            overlay.classList.remove("hidden");
            if (render) render($(bodyEl), { close });
        });
    }

    /**
     * Open a dialog on the modern application framework.
     *
     * FANG's dialogs were all built on `this._openDialog()` — the V1 framework, which warns on
     * every open ("removed in Version 16") and looks like the old Foundry. This takes the
     * shape those call sites already use and runs it on DialogV2, so the migration is one
     * change here instead of fourteen rewrites, and the dialogs pick up the current
     * styling on the way.
     *
     * Deliberately keeps the jQuery handle in `render` and `callback`: the dialog bodies
     * are full of `html.find(...)`, and porting all of that to plain DOM in the same step
     * would be a lot of churn for no behaviour change.
     *
     * @param {object} config
     * @param {string} config.title           window title
     * @param {string} config.content         dialog body HTML
     * @param {object} config.buttons         { key: { label, icon?, className?, callback? } }
     * @param {string} [config.default]       key of the button that gets focus/Enter
     * @param {Function} [config.render]      (jQueryHtml, dialog) => void, after the body renders
     * @param {Function} [config.close]       () => void, when the dialog closes
     * @param {string[]} [config.classes]     CSS classes for the window
     * @param {number} [config.width]         window width (V1 passed this flat; V2 wants position.width)
     * @param {object} [config.options]       any further DialogV2 options
     * @returns {Promise<any>} whatever the pressed button's callback returned, or null
     */
    async _openDialog({ title, content, buttons = {}, default: defaultButton, render, close, classes, width, options = {} } = {}) {
        const toIconClass = (icon) => {
            if (!icon) return undefined;
            // V1 took a full `<i class="...">` tag, V2 wants the class list.
            const match = /class=["']([^"']+)["']/.exec(icon);
            return match ? match[1] : icon;
        };

        const buttonList = Object.entries(buttons).map(([action, config]) => ({
            action,
            label: config.label ?? action,
            icon: toIconClass(config.icon),
            class: config.className,
            default: action === defaultButton,
            // V2 hands us (event, button, dialog); the old bodies expect the jQuery form.
            callback: config.callback
                ? async (event, button, dialog) => config.callback($(dialog.element))
                : undefined
        }));

        // A dialog with no buttons still needs a way out.
        if (!buttonList.length) {
            buttonList.push({ action: "close", label: game.i18n.localize("Close"), icon: "fas fa-xmark" });
        }

        // V1 dialogs were styled via classes: ["dialog", "fang-dialog"]. "dialog" is the V1
        // window class and would drag the old look back in; the FANG ones we keep.
        const windowClasses = (classes ?? []).filter(c => c !== "dialog");

        return foundry.applications.api.DialogV2.wait({
            window: { title },
            content,
            buttons: buttonList,
            classes: windowClasses.length ? windowClasses : undefined,
            position: width ? { width } : undefined,
            render: render ? (event, dialog) => render($(dialog.element), dialog) : undefined,
            close: close ? () => close() : undefined,
            rejectClose: false,   // closing via X resolves to null instead of throwing
            ...options
        });
    }

    /**
     * Take the merged result as our live graph.
     *
     * Called when a merge pulled in changes we did not have — our in-memory graph is
     * then behind what we just stored. Without this, a node someone else deleted would
     * still sit in our memory and the next save would re-add it as a "new" node (it is
     * absent from the fresh baseline), quietly resurrecting it.
     *
     * Cached image elements are carried over by id so the canvas does not flash.
     *
     * Positions are deliberately *not* taken from the merge unless someone actually moved
     * the node. The merge discards our physics drift on purpose (drift is not intent, and
     * must not overwrite other clients) — but that discarded drift is what is on screen
     * right now. Writing the stored position back would make every node jump to where it
     * used to be the moment we let go of a drag. So: a node whose position is unchanged
     * against the baseline keeps its live coordinates; only a position someone really
     * changed is adopted.
     *
     * @param {object} merged           the merge result we just stored
     * @param {object|null} baselineBefore  the baseline the merge ran against
     */
    _adoptMergedState(merged, baselineBefore = null) {
        const live = new Map();
        for (const node of this.graphData?.nodes ?? []) {
            if (node?.id) live.set(node.id, node);
        }
        const baseById = new Map();
        for (const node of baselineBefore?.nodes ?? []) {
            if (node?.id) baseById.set(node.id, node);
        }

        this.graphData = foundry.utils.duplicate(merged);
        for (const node of this.graphData.nodes) {
            const liveNode = live.get(node.id);
            if (!liveNode) continue;              // new to us — take it as merged, images load on init
            node.imgElement = liveNode.imgElement;

            const base = baseById.get(node.id);
            const movedByOther = base && (!valuesEqual(base.x, node.x) || !valuesEqual(base.y, node.y));
            if (!movedByOther) {
                node.x = liveNode.x;
                node.y = liveNode.y;
                node.vx = liveNode.vx;
                node.vy = liveNode.vy;
            }
        }
        this._repairGraphData();

        // Links now hold plain ids again; d3 needs to re-resolve them to node objects.
        if (this.rendered) {
            this.initSimulation();
            this.simulation?.alpha(0.05).restart();
            this._rebuildSearchMatches();
        }
    }

    /**
     * Is this stored state new enough to merge against?
     * A pre-v2 state has no link ids — merging against it would drop every link, because
     * the merge matches by id and would see them all as missing. Such a state must be
     * migrated by a plain overwrite first (the behaviour we had before merging existed).
     */
    _isMergeableState(data) {
        return !!data && Number(data.schemaVersion ?? 1) >= FANG_GRAPH_SCHEMA_VERSION;
    }

    /**
     * Remember the state we started from. Every later save merges against this to work
     * out which fields *we* touched, as opposed to someone else in the meantime.
     */
    _setBaseline(data) {
        this._baseline = data ? foundry.utils.duplicate(data) : { nodes: [], links: [], factions: [] };
        this._draggedNodeIds = new Set();
    }

    /**
     * Do we hold changes that were never written? Cheap guard so the common case
     * (someone else saved, we have nothing pending) stays a plain reload.
     */
    _hasUnsavedLocalChanges() {
        if (!this._baseline) return false;
        try {
            return !valuesEqual(this._baseline, this._buildExportData());
        } catch (err) {
            console.warn("FANG | Could not compare local state against baseline.", err);
            return false;
        }
    }

    /**
     * A player relayed an edit to us (GM). Merge their change into our state rather than
     * adopting their graph wholesale — they may have loaded before our latest changes,
     * and we must not resurrect what we deleted since.
     *
     * @param {object} payload  { newGraphData, baseline, draggedNodeIds, authorName }
     */
    /**
     * Take over an edit a player relayed to us, because they cannot write the flag themselves.
     *
     * Our own baseline deliberately stays where it is. It describes what the SERVER holds, and
     * the save that follows this call needs it that way: it merges baseline / ours / server, and
     * the player's addition only counts as OUR pending change while the baseline still lacks it.
     * Moving the baseline forward to the merged result made the very next merge read that node
     * as "the server deleted it" -- so a placeholder a player added in edit mode was neither
     * broadcast nor written, it just quietly vanished. See scenario 14 in the merge tests.
     */
    async applyRemoteGraphEdit(payload = {}) {
        const theirState = payload.newGraphData;
        if (!theirState) return;

        // Without a usable baseline we cannot tell what they changed — fall back to the
        // old behaviour rather than guessing. Happens when a player still runs an older
        // module version (no baseline, or a pre-v2 schema without link ids).
        if (!this._isMergeableState(payload.baseline) || !this._isMergeableState(theirState)) {
            console.warn("FANG | Player edit without a mergeable baseline, applying as-is.");
            this.graphData = theirState;
            this._repairGraphData();
            return;
        }

        try {
            const mine = this._buildExportData();
            const { merged, conflicts } = mergeGraphData(payload.baseline, theirState, mine, {
                // Their perspective: nodes they dragged win over our simulation drift.
                draggedNodeIds: new Set(payload.draggedNodeIds ?? [])
            });
            this.graphData = merged;
            this._repairGraphData();
            if (conflicts.length) {
                console.log(`FANG | Merged edit from ${payload.authorName ?? "player"} with ${conflicts.length} conflict(s).`, conflicts);
            }
        } catch (err) {
            console.error("FANG | Could not merge player edit, applying as-is.", err);
            this.graphData = theirState;
            this._repairGraphData();
        }
    }

    /**
     * Someone else saved. Pull their state, but keep whatever we changed locally instead
     * of silently dropping it — which is what a plain reload used to do.
     */
    async refreshFromServer() {
        if (!this._hasUnsavedLocalChanges()) {
            await this.loadData();
            return;
        }

        const myBaseline = foundry.utils.duplicate(this._baseline);
        const myState = this._buildExportData();
        const myDragged = new Set(this._draggedNodeIds ?? []);

        await this.loadData();   // server state, migrated, new baseline

        try {
            const server = this._buildExportData();
            const { merged, conflicts } = mergeGraphData(myBaseline, myState, server, { draggedNodeIds: myDragged });
            this.graphData = merged;
            this._repairGraphData();
            this._setBaseline(this._buildExportData());
            this._draggedNodeIds = myDragged;   // still ours until we save them
            this._reportMergeConflicts(conflicts);
        } catch (err) {
            // A broken merge must never leave a broken graph on screen — the freshly
            // loaded server state is already in place, so just keep that.
            console.error("FANG | Merge on refresh failed, keeping server state.", err);
        }
    }

    /**
     * saveData is called from ~26 places, sometimes in quick succession. Without a queue
     * two of our own saves could interleave between read-merge-write and lose a field.
     * Serialize them; each save merges against whatever the previous one just wrote.
     */
    async saveData(triggerSync = true) {
        const run = () => this._saveDataNow(triggerSync);
        this._saveChain = (this._saveChain ?? Promise.resolve()).then(run, run);
        return this._saveChain;
    }

    async _saveDataNow(triggerSync = true) {
        const entry = await this.getJournalEntry();
        this._repairGraphData();

        let exportData = this._buildExportData();

        if (entry && entry.isOwner) {
            // Three-way merge against the state as it is *right now*, not as it was when
            // we loaded. Someone else may have saved in the meantime.
            // Both our baseline and the stored state must already speak schema v2 —
            // against an older state we simply write ours, which migrates it.
            const server = entry.getFlag("fang", "graphData");
            const baselineBefore = this._baseline;
            let mergeChangedUs = false;
            if (this._isMergeableState(this._baseline) && this._isMergeableState(server)) {
                const { merged, conflicts } = mergeGraphData(this._baseline, exportData, server, {
                    draggedNodeIds: this._draggedNodeIds ?? new Set()
                });
                merged.schemaVersion = FANG_GRAPH_SCHEMA_VERSION;
                // Did the merge pull in anything we did not have? Then our live graph is
                // now out of date and must follow, or the next save would "resurrect"
                // what someone else deleted and undo what they added.
                // Positions are excluded on purpose: the merge always drops our physics
                // drift, so comparing them would report a change on literally every save
                // and rebuild the simulation each time we let go of a node.
                mergeChangedUs = !structurallyEqual(merged, exportData);
                exportData = merged;
                this._reportMergeConflicts(conflicts);
            } else if (server) {
                console.log("FANG | Stored graph predates the merge schema — migrating it with this save.");
            }

            await entry.setFlag("fang", "graphData", exportData);
            // What we just wrote is the new common ground for our next save.
            this._setBaseline(exportData);

            if (mergeChangedUs) this._adoptMergedState(exportData, baselineBefore);

            // If GM is saving, optionally force all players to sync to this new baseline
            if (triggerSync && game.user.isGM) {
                game.socket.emit("module.fang", { action: "refreshGraph" });
            }
        } else {
            // Player Collaborative Edit Relay.
            // Players cannot write the flag, so the GM applies it for them. We send our
            // baseline along so the GM can tell which fields *we* actually changed
            // instead of blindly taking our whole graph.
            const allowPlayerEdit = game.settings.get("fang", "allowPlayerEditing");
            if (allowPlayerEdit) {
                const isGMOnline = game.users.some(u => u.isGM && u.active);
                if (isGMOnline) {
                    console.log("FANG | Sending edit request to GM via socket.");
                    game.socket.emit("module.fang", {
                        action: "playerEditGraph",
                        payload: {
                            newGraphData: exportData,
                            baseline: this._baseline ?? null,
                            draggedNodeIds: Array.from(this._draggedNodeIds ?? []),
                            authorName: game.user.name
                        }
                    });
                    // Our request is on its way; treat it as our new starting point so a
                    // follow-up save does not re-send the same diff.
                    this._setBaseline(exportData);
                } else {
                    ui.notifications.warn(game.i18n.localize("FANG.Messages.WarnNoGMOnline"));
                }
            } else {
                ui.notifications.warn(game.i18n.localize("FANG.Messages.SaveNoPermission"));
            }
        }
    }

    /**
     * Tell the user when their change collided with someone else's. One notification per
     * save, summarized — never a dialog. A merge conflict prompt would be overkill at a
     * roleplaying table; knowing that it happened is enough to have a quick word.
     */
    _reportMergeConflicts(conflicts) {
        if (!conflicts?.length) return;

        const deleted = conflicts.filter(c => c.type.endsWith(".deleted"));
        const edited = conflicts.filter(c => !c.type.endsWith(".deleted"));

        if (deleted.length) {
            const names = [...new Set(deleted.map(c => c.name))].join(", ");
            ui.notifications.warn(
                this._localize("FANG.Merge.DeletedElsewhere", "{names} was deleted by someone else — your change to it was dropped.")
                    .replace("{names}", names)
            );
        }
        if (edited.length) {
            const names = [...new Set(edited.map(c => c.name))].join(", ");
            ui.notifications.info(
                this._localize("FANG.Merge.ConflictResolved", "{names} was also being edited — your version was kept.")
                    .replace("{names}", names)
            );
        }
        console.log("FANG | Merge conflicts resolved:", conflicts);
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
            playerNotes: "",
            showHiddenQuestsToPlayers: true,
            conditions: [],
            playerLorePageId: null,
            journalUuid: null,
            questUuids: []
        };
    }

    async _onAddPlaceholder() {
        if (!this._canEditGraph()) return;

        const factions = this.graphData.factions || [];
        const factionOptions = [`<option value="">-- None --</option>`]
            .concat(factions.map(f => `<option value="${f.id}">${f.name}</option>`))
            .join("");
        const defaultName = game.i18n.localize("FANG.Placeholder.DefaultName") || "Unknown Contact";
        const isGM = game.user.isGM;

        this._openPanelEditor({
            title: game.i18n.localize("FANG.Placeholder.CreateTitle") || "Create Placeholder NPC",
            content: `
                <div class="form-group">
                    <label>${game.i18n.localize("FANG.Placeholder.Name") || "Display Name"}:</label>
                    <div class="form-fields">
                        <input type="text" id="fang-placeholder-name" value="${defaultName}" style="width: 100%;">
                    </div>
                </div>
                ${isGM ? `<div class="form-group">
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
                </div>` : `<p class="hint">${game.i18n.localize("FANG.Placeholder.PlayerCreateHint") || "Creates a visible placeholder contact. A GM can add role, faction, and secret details later."}</p>`}
            `,
            buttons: {
                create: {
                    icon: '<i class="fas fa-user-secret"></i>',
                    label: game.i18n.localize("FANG.Placeholder.CreateBtn") || "Create",
                    callback: async (html) => {
                        const name = html.find("#fang-placeholder-name").val().trim() || (game.i18n.localize("FANG.Placeholder.DefaultName") || "Unknown Contact");
                        const roleVal = isGM ? html.find("#fang-placeholder-role").val().trim() : "";
                        const role = roleVal || null;
                        const factionIdVal = isGM ? html.find("#fang-placeholder-faction").val() : "";
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
                        if (!isGM) {
                            node.hidden = false;
                            node.displayName = "";
                            node.playerNotes = "";
                            node.conditions = [];
                        }

                        this.graphData.nodes.push(node);
                        this._rememberDropPosition(node);
                        this.initSimulation();
                        this.simulation.alpha(0.5).restart();
                        this._rebuildSearchMatches();
                        await this.saveData();
                        await this._recordNodeAppearedHistory(node);
                    }
                },
                cancel: { icon: '<i class="fas fa-times"></i>', label: game.i18n.localize("FANG.Dialogs.BtnCancel") || "Cancel" }
            },
            default: "create",
            classes: ["dialog", "fang-dialog"], width: 420
        });
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
        this._rebuildSearchMatches();
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

        this._openPanelEditor({
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
            default: "replace",
            classes: ["dialog", "fang-dialog"], width: 440
        });
    }

    _setSearchUiVisible(visible, { focus = false } = {}) {
        this._searchUiVisible = !!visible;
        const panel = this.element?.querySelector("#fang-search-floating");
        if (panel) panel.classList.toggle("hidden", !this._searchUiVisible);
        if (focus && this._searchUiVisible) {
            setTimeout(() => this.element?.querySelector("#fangSearchInput")?.focus(), 0);
        }
    }

    _openSidebarPanel(tabName) {
        const appContainer = this.element.querySelector(".fang-app-container") || this.element;
        const isOpen = appContainer.classList.contains("sidebar-panel-open");
        const activeContent = this.element.querySelector(".tab-content.active");
        if (isOpen && activeContent?.dataset.tab === tabName) {
            this._closeSidebarPanel();
            return;
        }

        const tabContents = this.element.querySelectorAll(".tab-content");
        tabContents.forEach(content => content.classList.toggle("active", content.dataset.tab === tabName));
        appContainer.classList.add("sidebar-panel-open");
        this.element.querySelectorAll(".fang-rail-btn").forEach(btn => btn.classList.remove("active"));
        this.element.querySelector(FANG_RAIL_BY_PANEL[tabName])?.classList.add("active");
    }

    _closeSidebarPanel() {
        const appContainer = this.element.querySelector(".fang-app-container") || this.element;
        appContainer.classList.remove("sidebar-panel-open");
        this.element.querySelectorAll(".fang-rail-btn").forEach(btn => btn.classList.remove("active"));
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

        const factionsById = new Map((this.graphData.factions || []).map(f => [f.id, this._normalizeFaction(f)]));

        const matchedNodes = new Set();
        const matchedLinks = new Set();

        // Search index is built and consumed LOCALLY per client — never synced via
        // socket. Each client computes its own visible-node set based on its own user.
        // The originalName entry below is intentionally GM-conditional so a search
        // text dump (even via dev tools) leaks nothing extra to players.
        for (const node of this.graphData.nodes) {
            if (!this._canUserSeeNode(node)) continue;
            const faction = node.factionId ? factionsById.get(node.factionId) : null;
            const factionName = this._isFactionVisibleToCurrentUser(faction) ? faction?.name || "" : "";
            const gmOriginalName = (game.user.isGM && node.originalName) || "";
            const nodeText = [
                this._getSafeNodeName(node),
                gmOriginalName,
                node.displayName,
                this._isNodeHiddenForUser(node) ? "" : node.role,
                factionName
            ].join(" ");
            if (matchAllTerms(nodeText)) matchedNodes.add(node.id);
        }

        this.graphData.links.forEach((link, index) => {
            if (!this._canUserSeeLink(link)) return;
            const linkText = [link.label, link.info].join(" ");
            if (!matchAllTerms(linkText)) return;
            matchedLinks.add(index);
        });

        this._searchMatchedNodeIds = matchedNodes;
        this._searchMatchedLinkIndices = matchedLinks;
    }

    /** Is the world running in collaborative mode (no exclusive lock)? */
    _isCollaborativeMode() {
        try {
            return game.settings.get("fang", "collaborativeEditing") === true;
        } catch (err) {
            return false;   // setting not registered yet (early boot)
        }
    }

    _canEditGraph(silent = false, allowGMOverride = false) {
        // GMs can bypass for specific functions (like sharing, spotlight, export)
        if (game.user.isGM && allowGMOverride) return true;

        // Permission is independent of the lock and always applies.
        const allowPlayerEdit = game.settings.get("fang", "allowPlayerEditing");
        if (!game.user.isGM && !allowPlayerEdit) {
            if (!silent) ui.notifications.warn(game.i18n.localize("FANG.Messages.SaveNoPermission"));
            return false;
        }

        // Collaborative mode: no exclusive lock. Saves are merged field by field, so two
        // people working on different things no longer overwrite each other — the reason
        // the lock existed in the first place.
        if (this._isCollaborativeMode()) return true;

        // Classic mode: whoever holds the lock may edit.
        const entry = game.journal.getName("FANG Graph");
        const lock = entry?.getFlag("fang", "editLock");
        if (!lock || lock.userId !== game.user.id) {
            if (!silent) ui.notifications.warn(game.i18n.localize("FANG.Messages.AlreadyEditing"));
            return false;
        }

        return true;
    }

    _updateQuickConnectButtonState() {
        const buttons = this.element?.querySelectorAll?.("#btnCanvasQuickConnect") || [];
        buttons.forEach(button => {
            button.classList.toggle("active", !!this._quickConnectMode);
            button.classList.toggle("awaiting-target", !!this._quickConnectMode && !!this._quickConnectSourceId);
        });
        this._updateCanvasEditStatus();
    }

    _updateCanvasEditStatus(message = "") {
        const status = this.element?.querySelector?.("#fangCanvasEditStatus");
        if (!status) return;

        let text = message;
        if (!text && this._quickConnectMode) {
            if (this._quickConnectSourceId) {
                const source = this.graphData.nodes.find(n => n.id === this._quickConnectSourceId);
                text = game.i18n.format("FANG.Messages.QuickConnectSourceSelected", { name: source?.name || "?" });
            } else {
                text = game.i18n.localize("FANG.Messages.QuickConnectEnabled");
            }
        }

        status.textContent = text || "";
        status.classList.toggle("hidden", !text);
    }

    _onToggleQuickConnectMode(event) {
        event?.preventDefault?.();
        if (!this._canEditGraph()) return;

        this._quickConnectMode = !this._quickConnectMode;
        this._quickConnectSourceId = null;
        this._updateQuickConnectButtonState();
    }

    async _handleQuickConnectNodeClick(node) {
        if (!this._quickConnectMode || !node) return false;
        if (!this._canEditGraph()) return true;

        if (!this._quickConnectSourceId) {
            this._quickConnectSourceId = node.id;
            this._updateQuickConnectButtonState();
            this.ticked();
            return true;
        }

        const sourceId = this._quickConnectSourceId;
        const targetId = node.id;
        if (sourceId === targetId) {
            ui.notifications.warn(game.i18n.localize("FANG.Messages.QuickConnectSameNode"));
            return true;
        }

        const sourceNode = this.graphData.nodes.find(n => n.id === sourceId);
        const targetNode = this.graphData.nodes.find(n => n.id === targetId);
        if (!sourceNode || !targetNode) {
            this._quickConnectSourceId = null;
            this._quickConnectMode = false;
            this._updateQuickConnectButtonState();
            this.ticked();
            return true;
        }

        const result = await this._promptQuickConnectLink(sourceNode, targetNode);
        if (!result?.label) {
            this._quickConnectSourceId = null;
            this._quickConnectMode = false;
            this._updateQuickConnectButtonState();
            this.ticked();
            return true;
        }

        this.graphData.links.push({ source: sourceId, target: targetId, label: result.label, directional: !!result.directional });
        this._quickConnectSourceId = null;
        this._quickConnectMode = false;
        this._updateQuickConnectButtonState();
        this.ticked();
        const legacyLabel = this.element.querySelector("#linkLabel");
        if (legacyLabel) legacyLabel.value = "";
        this.initSimulation();
        this.simulation.alpha(0.3).restart();
        this._rebuildSearchMatches();
        await this.saveData();
        await this._recordRelationshipHistory(sourceNode, targetNode, result.label);
        return true;
    }

    async _promptQuickConnectLink(sourceNode, targetNode, defaultLabel = "") {
        const title = game.i18n.localize("FANG.Messages.QuickConnectLabelTitle");
        const content = game.i18n.format("FANG.Messages.QuickConnectLabelContent", {
            source: sourceNode?.name || game.i18n.localize("FANG.Dropdowns.Unknown"),
            target: targetNode?.name || game.i18n.localize("FANG.Dropdowns.Unknown")
        });
        const placeholder = game.i18n.localize("FANG.Messages.QuickConnectLabelPlaceholder");
        const escapeHtml = foundry.utils.escapeHTML ?? ((value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "\"": "&quot;",
            "'": "&#39;"
        }[char])));

        return new Promise(resolve => {
            this._openPanelEditor({
                title,
                content: `
                    <p>${content}</p>
                    <input type="text" id="fang-quick-connect-label" value="${escapeHtml(defaultLabel)}" placeholder="${escapeHtml(placeholder)}" style="width: 100%;">
                    <label class="fang-editor-check" style="margin-top: 10px;">
                        <input type="checkbox" id="fang-quick-connect-directional">
                        ${game.i18n.localize("FANG.UI.Directional")}
                    </label>
                `,
                buttons: {
                    save: {
                        icon: '<i class="fas fa-link"></i>',
                        label: game.i18n.localize("FANG.UI.Connect"),
                        callback: html => resolve({
                            label: html.find("#fang-quick-connect-label").val().trim(),
                            directional: html.find("#fang-quick-connect-directional").is(":checked")
                        })
                    },
                    cancel: {
                        icon: '<i class="fas fa-times"></i>',
                        label: game.i18n.localize("FANG.Dialogs.BtnCancel"),
                        callback: () => resolve(null)
                    }
                },
                default: "save",
                close: () => resolve(null),
            classes: ["dialog", "fang-dialog"], width: 420
        });
        });
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
                ui.notifications.info(`${this._getSafeNodeName(node)} ${game.i18n.localize("FANG.Messages.CenterEnabled")}`);
            } else {
                ui.notifications.info(`${this._getSafeNodeName(node)} ${game.i18n.localize("FANG.Messages.CenterDisabled")}`);
            }

            this.initSimulation();
            this.simulation.alpha(0.6).restart(); // High heat to let it fly to center
            this._rebuildSearchMatches();

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
        if (!game.user.isGM) return;

        if (!this._canEditGraph(false, true)) {
            if (!game.user.isGM && game.settings.get("fang", "allowPlayerEditing")) {
                const acquired = await this._requestLock();
                if (!acquired) return;
            } else {
                return;
            }
        }

        const localize = (key, fallback) => game.i18n.localize(key) || fallback;
        const escapeHtml = foundry.utils.escapeHTML ?? ((value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "\"": "&quot;",
            "'": "&#39;"
        }[char])));
        const confirmRemoveFactionRow = (row) => {
            if (!row) return;
            const name = row.querySelector(".faction-name")?.value?.trim() || localize("FANG.Dialogs.NewFaction", "New Faction");
            const title = game.i18n.localize("FANG.Dialogs.DeleteConfirmTitle") || "Confirm Deletion";
            const content = localize("FANG.Dialogs.DeleteFactionConfirm", "Delete this faction?");
            // DialogV2.confirm, not Dialog.confirm — the latter is the V1 framework too.
            foundry.applications.api.DialogV2.confirm({
                window: { title },
                content: `<p>${content.replace("{name}", `<strong>${escapeHtml(name)}</strong>`)}</p>`,
                yes: {
                    callback: () => {
                        const list = row.closest("#fang-factions-list");
                        row.remove();
                        // Last one gone? Then say so again, instead of leaving a blank box.
                        if (list && !list.querySelector(".fang-faction-item")) this._renderFactionsEmptyState(list);
                    }
                },
                no: { callback: () => {} }
            });
        };
        const renderFactionRow = (faction, index) => {
            const f = this._normalizeFaction(faction);
            return `
                <div class="fang-faction-item">
                    <div class="fang-faction-main-row">
                        <input type="hidden" class="faction-id" value="${escapeHtml(f.id || "")}">
                        <input type="color" class="faction-color" data-index="${index}" value="${escapeHtml(f.color || "#ffffff")}" title="${localize("FANG.UI.Color", "Color")}">
                        <input type="text" class="faction-name" data-index="${index}" value="${escapeHtml(f.name || "")}" placeholder="${localize("FANG.Dialogs.FactionNamePlaceholder", "Faction name")}">
                        <div class="faction-icon-preview">
                            <img src="${escapeHtml(f.icon || "")}" id="preview-icon-${index}" style="max-width: 100%; max-height: 100%; display: ${f.icon ? 'block' : 'none'}; object-fit: contain;">
                        </div>
                        <button type="button" class="btn file-picker fang-faction-icon-btn" data-type="image" data-target="faction-icon-${index}" title="${localize("FANG.Dialogs.ChooseFactionIcon", "Choose icon")}">
                            <i class="fas fa-file-image"></i>
                        </button>
                        <input type="hidden" class="faction-icon" id="faction-icon-${index}" data-index="${index}" value="${escapeHtml(f.icon || "")}">
                    </div>
                    <textarea class="faction-description" rows="2" placeholder="${localize("FANG.Dialogs.FactionDescriptionPlaceholder", "Short description")}">${escapeHtml(f.description || "")}</textarea>
                    <div class="fang-faction-visibility-row">
                        <label><input type="checkbox" class="faction-player-visible" ${f.playerVisible !== false ? 'checked' : ''}> ${localize("FANG.Dialogs.FactionVisibleToPlayers", "Visible to players")}</label>
                        <label><input type="checkbox" class="faction-show-legend-player" ${f.showInLegendForPlayers !== false ? 'checked' : ''}> ${localize("FANG.Dialogs.FactionLegendForPlayers", "Player legend")}</label>
                        <label><input type="checkbox" class="faction-show-lines-player" ${f.showLinesForPlayers !== false ? 'checked' : ''}> ${localize("FANG.Dialogs.FactionLinesForPlayers", "Player lines")}</label>
                    </div>
                    <div class="fang-faction-actions-row">
                        <button type="button" class="btn danger-btn btn-delete-faction fang-faction-delete-btn" data-index="${index}" title="${localize("FANG.Dialogs.DeleteFaction", "Delete faction")}">
                            <i class="fas fa-trash"></i> ${localize("FANG.Dialogs.DeleteFaction", "Delete faction")}
                        </button>
                    </div>
                </div>
            `;
        };

        const factionsHtml = this.graphData.factions.map((f, index) => renderFactionRow(f, index)).join("");
        const dialogContent = `
            <div class="fang-faction-manager">
                <p class="fang-editor-lead">${game.i18n.localize("FANG.UI.ManageFactionsHint")}</p>
                <div id="fang-factions-list" class="${this.graphData.factions.length ? "" : "is-empty"}">${factionsHtml || this._renderFactionsEmptyState()}</div>
                <button type="button" id="fang-add-faction-btn" class="btn fang-add-faction-btn">
                    <i class="fas fa-plus"></i> ${localize("FANG.Dialogs.BtnAddFaction", "Add Faction")}
                </button>
            </div>
        `;

        await this._openPanelEditor({
            title: game.i18n.localize("FANG.UI.ManageFactions"),
            content: dialogContent,
            render: (html) => {
                html.find("#fang-add-faction-btn").on("click", () => {
                    const list = html.find("#fang-factions-list");
                    // The empty state lives inside the list — drop it before counting, or it
                    // would both stay on screen next to the new row and be counted as one.
                    list.removeClass("is-empty").find(".fang-empty-state").remove();
                    const newIndex = list.children().length;
                    const randomColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
                    list.append(renderFactionRow({
                        id: "",
                        name: localize("FANG.Dialogs.NewFaction", "New Faction"),
                        color: randomColor,
                        icon: null,
                        description: "",
                        playerVisible: true,
                        showInLegendForPlayers: true,
                        showLinesForPlayers: true
                    }, newIndex));

                    html.find(`.btn-delete-faction[data-index='${newIndex}']`).on("click", (e) => {
                        confirmRemoveFactionRow(e.currentTarget.closest(".fang-faction-item"));
                    });
                });

                html.find(".file-picker").on("click", (event) => {
                    event.preventDefault();
                    const button = event.currentTarget;
                    const targetInput = button.dataset.target;
                    new foundry.applications.apps.FilePicker.implementation({
                        type: "image",
                        callback: (path) => {
                            html.find(`#${targetInput}`).val(path);
                            const index = targetInput.split("-").pop();
                            const previewImg = html.find(`#preview-icon-${index}`);
                            previewImg.attr("src", path);
                            previewImg.show();
                        }
                    }).render(true);
                });

                html.find(".btn-delete-faction").on("click", (e) => {
                    confirmRemoveFactionRow(e.currentTarget.closest(".fang-faction-item"));
                });
            },
            buttons: {
                save: {
                    icon: '<i class="fas fa-save"></i>',
                    label: game.i18n.localize("FANG.Dialogs.BtnSave"),
                    callback: async (html) => {
                        const previousFactionVisibility = new Map((this.graphData.factions || []).map(f => [f.id, this._normalizeFaction(f).playerVisible !== false]));
                        // The lines/legend switches moved to the Affiliation panel — this
                        // dialog manages factions, the panel controls how they are shown.
                        // (Reading them here would now find nothing and silently turn the
                        // faction display off on every save.)
                        const newFactions = [];
                        html.find(".fang-faction-item").each((i, el) => {
                            const factionIdFromInput = $(el).find(".faction-id").val();
                            const name = $(el).find(".faction-name").val().trim();
                            const color = $(el).find(".faction-color").val();
                            const icon = $(el).find(".faction-icon").val().trim();
                            const description = $(el).find(".faction-description").val().trim();
                            const playerVisible = $(el).find(".faction-player-visible").is(":checked");
                            const showInLegendForPlayers = $(el).find(".faction-show-legend-player").is(":checked");
                            const showLinesForPlayers = $(el).find(".faction-show-lines-player").is(":checked");

                            if (name) {
                                const existingFaction = factionIdFromInput ? this.graphData.factions.find(f => f.id === factionIdFromInput) : null;
                                newFactions.push({
                                    id: existingFaction ? existingFaction.id : foundry.utils.randomID(),
                                    name,
                                    color,
                                    icon: icon !== "" ? icon : null,
                                    description,
                                    playerVisible,
                                    showInLegendForPlayers,
                                    showLinesForPlayers,
                                    x: existingFaction && existingFaction.x !== undefined ? existingFaction.x : this.width / 2 + (Math.random() - 0.5) * 100,
                                    y: existingFaction && existingFaction.y !== undefined ? existingFaction.y : this.height / 2 + (Math.random() - 0.5) * 100,
                                    externalSource: existingFaction?.externalSource ? foundry.utils.duplicate(existingFaction.externalSource) : null,
                                    externalMeta: existingFaction?.externalMeta ? foundry.utils.duplicate(existingFaction.externalMeta) : null
                                });
                            }
                        });

                        const keptFactionIds = new Set(newFactions.map(f => f.id));
                        this.graphData.nodes.forEach(node => {
                            if (node.factionId && !keptFactionIds.has(node.factionId)) node.factionId = null;
                        });

                        this.graphData.factions = newFactions.map(f => this._normalizeFaction(f));
                        this.initSimulation();
                        this.simulation.alpha(0.05).restart();
                        await this.saveData();
                        for (const faction of this.graphData.factions) {
                            const wasVisible = previousFactionVisibility.get(faction.id);
                            if (wasVisible === false && faction.playerVisible !== false) {
                                const members = this.graphData.nodes.filter(node => node.factionId === faction.id);
                                for (const member of members) await this._recordFactionAssignedHistory(member, faction);
                            }
                        }
                    }
                },
                cancel: {
                    icon: '<i class="fas fa-times"></i>',
                    label: game.i18n.localize("FANG.Dialogs.BtnCancel")
                }
            },
            default: "save",
            classes: ["dialog", "fang-dialog"],
            width: 560,
            height: 620,
            resizable: true
        });
    }

    async _onManageZones() {
        if (!game.user?.isGM) return;
        const zones = Array.isArray(this.graphData.zones) ? this.graphData.zones.map(z => this._normalizeZone(z)) : [];
        const escapeHtml = (value) => this._escapeHtml(value);
        const localize = (key, fallback) => this._localize(key, fallback);
        // Places, not groups. "organization" used to live here, but an organization is a
        // faction — that is what factions are for. Legacy values are migrated in
        // _normalizeZone.
        const zoneTypes = ["region", "city", "district", "building", "realm", "other"];

        // How many characters sit in each zone? A zone is only drawn on the canvas once
        // it has members, so without this the manager gives no clue why a freshly
        // created zone stays invisible.
        const memberCount = (zoneId) => (this.graphData.nodes || []).filter(n => n.zoneId === zoneId).length;

        const renderZoneRow = (zone, index) => `
            <div class="fang-faction-item fang-zone-item">
                <div class="fang-faction-main-row">
                    <input type="hidden" class="zone-id" value="${escapeHtml(zone.id || "")}">
                    <input type="color" class="zone-color" value="${escapeHtml(zone.color || "#d4af37")}">
                    <input type="text" class="zone-name" value="${escapeHtml(zone.name || "")}" placeholder="${escapeHtml(localize("FANG.Zones.NamePlaceholder", "Zone name"))}">
                    <select class="zone-type">
                        ${zoneTypes.map(type => `<option value="${type}" ${zone.type === type ? "selected" : ""}>${escapeHtml(localize(`FANG.Zones.Types.${type}`, type))}</option>`).join("")}
                    </select>
                </div>
                <textarea class="zone-description" rows="2" placeholder="${escapeHtml(localize("FANG.Zones.DescriptionPlaceholder", "Short zone description"))}">${escapeHtml(zone.description || "")}</textarea>
                ${(() => {
                    const count = memberCount(zone.id);
                    return count
                        ? `<p class="fang-zone-members"><i class="fas fa-user-group" aria-hidden="true"></i> ${escapeHtml(localize("FANG.Zones.MemberCount", "{count} characters in this zone").replace("{count}", count))}</p>`
                        : `<p class="fang-zone-members is-empty"><i class="fas fa-circle-info" aria-hidden="true"></i> ${escapeHtml(localize("FANG.Zones.EmptyHint", "No characters yet — the zone stays hidden on the canvas until you assign some (right-click a character, Edit)."))}</p>`;
                })()}
                <div class="fang-faction-visibility-row">
                    <label><input type="checkbox" class="zone-player-visible" ${zone.playerVisible !== false ? "checked" : ""}> ${escapeHtml(localize("FANG.Zones.VisibleToPlayers", "Visible to players"))}</label>
                </div>
                <div class="fang-faction-actions-row">
                    <button type="button" class="btn danger-btn btn-delete-zone fang-faction-delete-btn" data-index="${index}">
                        <i class="fas fa-trash"></i> ${escapeHtml(localize("FANG.Zones.Delete", "Delete zone"))}
                    </button>
                </div>
            </div>`;

        await this._openPanelEditor({
            title: localize("FANG.Zones.Title", "Affiliation Zones"),
            content: `
                <div class="fang-faction-manager">
                    <p class="fang-editor-lead">${escapeHtml(localize("FANG.Zones.Hint", "Create campaign zones such as cities, regions, organizations, courts, or underworld groups."))}</p>
                    <div id="fang-zones-list" class="${zones.length ? "" : "is-empty"}">${zones.map(renderZoneRow).join("")}${zones.length ? "" : `
                        <div class="fang-empty-state">
                            <i class="fas fa-location-dot"></i>
                            <p class="fang-empty-state__title">${escapeHtml(localize("FANG.Zones.NoZonesTitle", "No locations yet"))}</p>
                            <p class="fang-empty-state__hint">${escapeHtml(localize("FANG.Zones.NoZonesHint", "Add a location, then assign characters to it via right-click → Edit."))}</p>
                        </div>`}</div>
                    <button type="button" id="fang-add-zone-btn" class="btn fang-add-faction-btn">
                        <i class="fas fa-plus"></i> ${escapeHtml(localize("FANG.Zones.Add", "Add zone"))}
                    </button>
                </div>`,
            render: (html) => {
                html.find("#fang-add-zone-btn").on("click", () => {
                    const list = html.find("#fang-zones-list");
                    // Drop the empty state before counting — it sits inside the list.
                    list.removeClass("is-empty").find(".fang-empty-state").remove();
                    list.append(renderZoneRow(this._normalizeZone({ name: localize("FANG.Zones.NewZone", "New Zone") }), list.children().length));
                });
                html.on("click", ".btn-delete-zone", (event) => {
                    const row = event.currentTarget.closest(".fang-zone-item");
                    const list = row?.closest("#fang-zones-list");
                    row?.remove();
                    // Last one gone? Bring the hint back rather than leave a blank box.
                    if (list && !list.querySelector(".fang-zone-item")) {
                        list.classList.add("is-empty");
                        list.innerHTML = `
                            <div class="fang-empty-state">
                                <i class="fas fa-location-dot"></i>
                                <p class="fang-empty-state__title">${escapeHtml(localize("FANG.Zones.NoZonesTitle", "No locations yet"))}</p>
                                <p class="fang-empty-state__hint">${escapeHtml(localize("FANG.Zones.NoZonesHint", "Add a location, then assign characters to it via right-click → Edit."))}</p>
                            </div>`;
                    }
                });
            },
            buttons: {
                save: {
                    icon: '<i class="fas fa-save"></i>',
                    label: localize("FANG.Dialogs.BtnSave", "Save"),
                    callback: async (html) => {
                        const nextZones = [];
                        html.find(".fang-zone-item").each((_, el) => {
                            const id = $(el).find(".zone-id").val() || foundry.utils.randomID();
                            const name = $(el).find(".zone-name").val()?.trim();
                            if (!name) return;
                            nextZones.push(this._normalizeZone({
                                id,
                                name,
                                type: $(el).find(".zone-type").val() || "region",
                                color: $(el).find(".zone-color").val() || "#d4af37",
                                description: $(el).find(".zone-description").val()?.trim() || "",
                                playerVisible: $(el).find(".zone-player-visible").is(":checked")
                            }));
                        });
                        const zoneIds = new Set(nextZones.map(z => z.id));
                        this.graphData.nodes.forEach(node => {
                            if (node.zoneId && !zoneIds.has(node.zoneId)) node.zoneId = null;
                        });
                        this.graphData.zones = nextZones;
                        await this.saveData();
                        this.ticked();
                    }
                },
                cancel: { icon: '<i class="fas fa-times"></i>', label: localize("FANG.Dialogs.BtnCancel", "Cancel") }
            },
            default: "save",
            classes: ["dialog", "fang-dialog"], width: 620, height: 620, resizable: true
        });
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

        for (let node of this._getVisibleNodesForUser()) {
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

            this._openDialog({
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
                                targetNode.questUuids.push({ uuid: data.uuid, name: this._getJournalDocumentTitle(droppedDoc), visibleToPlayers: false, status: "open" });
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
                },
            classes: ["dialog", "fang-dialog"], width: 420
        });
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

                this._openDialog({
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
                                let createdSourceNode = false;
                                if (!sourceNode) {
                                    const visibility = await this._promptActorDropVisibility(actor);
                                    if (!visibility) return;
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
                                        hidden: visibility.hidden,
                                        gmOnly: visibility.gmOnly === true,
                                        secretKind: visibility.gmOnly ? "secret" : "",
                                        displayName: visibility.displayName || "", playerNotes: "", showHiddenQuestsToPlayers: true, conditions: [],
                                        playerLorePageId: generatedLorePageId
                                    };

                                    if (!generatedLorePageId) {
                                        const legacyLore = actor.getFlag("fang", "legacyLore");
                                        if (legacyLore) sourceNode.lore = legacyLore;
                                    }

                                    this.graphData.nodes.push(sourceNode);
                                    this._rememberDropPosition(sourceNode);
                                    createdSourceNode = true;
                                }

                                this.graphData.links.push({
                                    source: sourceNode.id,
                                    target: targetNode.id,
                                    label: labelStr,
                                    directional: isDir,
                                    relationshipType: "",
                                    questStatus: "",
                                    gmOnly: sourceNode.gmOnly === true || targetNode.gmOnly === true
                                });

                                this.initSimulation();
                                this.simulation.alpha(0.3).restart();
                                this._rebuildSearchMatches();
                                await this.saveData();
                                if (createdSourceNode) await this._recordNodeAppearedHistory(sourceNode);
                                await this._recordRelationshipHistory(sourceNode, targetNode, labelStr);
                            }
                        },
                        cancel: {
                            icon: '<i class="fas fa-times"></i>',
                            label: btnCancel
                        }
                    },
                    default: "connect",
            classes: ["dialog", "fang-dialog"],
                    width: 400
        });
            };

            const actorAlreadyOnCanvas = this.graphData.nodes.some(n =>
                n.id !== targetNode.id && (n.id === actor.id || n.actorId === actor.id)
            );

            if (targetNode.isPlaceholder && game.user.isGM && !actorAlreadyOnCanvas) {
                const title = game.i18n.localize("FANG.Placeholder.DropTitle") || "Actor dropped on placeholder";
                const content = (game.i18n.localize("FANG.Placeholder.DropContent") || "Do you want to replace <strong>{target}</strong> with <strong>{actor}</strong>, or create a relationship?")
                    .replace("{target}", targetNode.name)
                    .replace("{actor}", actor.name);
                this._openDialog({
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
                    default: "replace",
            classes: ["dialog", "fang-dialog"], width: 460
        });
            } else {
                openFastLinkDialog();
            }

        } else {
            // Scenario 1: Dropped on empty canvas -> Add the node immediately without prompting
            let existingNode = this.graphData.nodes.find(n => n.id === actor.id || n.actorId === actor.id);
            let createdNode = null;
            if (existingNode) {
                // If it already exists, just move it to the new mouse location
                existingNode.x = x;
                existingNode.y = y;
                existingNode.fx = null;
                existingNode.fy = null;
            } else {
                // Add new node at precise location with a tiny random offset to prevent perfect stacking
                const visibility = await this._promptActorDropVisibility(actor);
                if (!visibility) return;
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
                    hidden: visibility.hidden,
                    gmOnly: visibility.gmOnly === true,
                    secretKind: visibility.gmOnly ? "secret" : "",
                    displayName: visibility.displayName || "",
                    playerNotes: "",
                    showHiddenQuestsToPlayers: true,
                    conditions: [],
                    playerLorePageId: generatedLorePageId
                };

                if (!generatedLorePageId) {
                    const legacyLore = actor.getFlag("fang", "legacyLore");
                    if (legacyLore) newNode.lore = legacyLore;
                }

                this.graphData.nodes.push(newNode);
                this._rememberDropPosition(newNode);
                createdNode = newNode;
            }

            this.initSimulation();
            this.simulation.alpha(0.8).restart();
            this._rebuildSearchMatches();
            await this.saveData();
            if (createdNode) await this._recordNodeAppearedHistory(createdNode);
        }
    }


    _getCanvasPointerPosition(event) {
        if (!this.transform || !this.canvas) return null;
        const bounds = this.canvas.getBoundingClientRect();
        const mouseX = event.clientX - bounds.left;
        const mouseY = event.clientY - bounds.top;
        const x = this.transform.invertX(mouseX);
        const y = this.transform.invertY(mouseY);
        return { mouseX, mouseY, x, y };
    }

    _getLinkEndpointId(endpoint) {
        return typeof endpoint === "object" ? endpoint?.id : endpoint;
    }

    /**
     * Copy an object for persistence, dropping only the listed runtime fields.
     * Deny-list on purpose: any field we do not explicitly reject gets saved, so new
     * features cannot lose their data by forgetting to register a field here.
     * Values are deep-cloned so the stored snapshot never aliases live objects.
     */
    _serializeForStorage(source, runtimeFields = []) {
        const out = {};
        for (const [key, value] of Object.entries(source ?? {})) {
            if (runtimeFields.includes(key)) continue;
            if (value === undefined) continue;
            out[key] = value;
        }
        try {
            return foundry.utils.duplicate(out);
        } catch (err) {
            // Should not happen once runtime fields are stripped, but a single bad node
            // must never take the whole save down.
            console.error("FANG | Could not serialize graph element, storing shallow copy.", err, source);
            return { ...out };
        }
    }

    _findNodeAtCanvasPoint(x, y, threshold = 30) {
        let clickedNode = null;
        let minD2 = threshold * threshold;

        for (let node of this.graphData.nodes) {
            const dx = x - node.x;
            const dy = y - node.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < minD2) {
                clickedNode = node;
                minD2 = d2;
            }
        }
        return clickedNode;
    }

    _findLinkIndexAtCanvasPoint(x, y, threshold = 15) {
        let clickedLinkIndex = -1;
        let minLDist = threshold / (this.transform?.k || 1);

        this.graphData.links.forEach((link, idx) => {
            if (!this._canUserSeeLink(link)) return;
            const s = link.source;
            const t = link.target;
            if (!s || !t || s.x === undefined || t.x === undefined) return;

            let dist;
            const pairInfo = this._linkCounts ? this._linkCounts[link.pairKey] : null;
            const totalParams = pairInfo ? pairInfo.total : 1;

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
                const isCanonical = this._getLinkEndpointId(link.source) < this._getLinkEndpointId(link.target);
                const cDx = isCanonical ? ddx : -ddx;
                const cDy = isCanonical ? ddy : -ddy;
                const nx = -cDy / ddist;
                const ny = cDx / ddist;
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
        return clickedLinkIndex;
    }

    _onCanvasDoubleClick(event) {
        const pos = this._getCanvasPointerPosition(event);
        if (!pos) return;

        const clickedNode = this._findNodeAtCanvasPoint(pos.x, pos.y);

        if (clickedNode) {
            const actor = this._getNodeActor(clickedNode);
            if (actor) {
                actor.sheet.render(true);
            } else {
                ui.notifications.warn(game.i18n.localize("FANG.Messages.ActorNotFound"));
            }
        }
    }

    _positionFloatingMenu(menu, mouseX, mouseY) {
        if (!menu) return;
        const container = this.element?.querySelector(".canvas-container") || this.element;
        const bounds = container?.getBoundingClientRect?.();
        if (!bounds) {
            menu.style.left = `${mouseX}px`;
            menu.style.top = `${mouseY}px`;
            return;
        }

        const margin = 8;
        const menuWidth = menu.offsetWidth || 220;
        const menuHeight = menu.offsetHeight || 44;
        const maxX = Math.max(margin, bounds.width - menuWidth - margin);
        const maxY = Math.max(margin, bounds.height - menuHeight - margin);
        const left = Math.min(Math.max(mouseX, margin), maxX);
        const top = Math.min(Math.max(mouseY, margin), maxY);

        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
    }

    _showContextMenu(node, mouseX, mouseY) {
        const menu = this.element.querySelector("#fang-context-menu");
        if (!menu) return;

        menu.style.left = `${mouseX}px`;
        menu.style.top = `${mouseY}px`;
        menu.classList.remove("hidden");

        const btnInfo = menu.querySelector("#ctxInfo");
        const btnEdit = menu.querySelector("#ctxEditActor");
        const btnSpotlight = menu.querySelector("#ctxSpotlight");
        const btnQuests = menu.querySelector("#ctxQuests");
        const btnHistory = menu.querySelector("#ctxHistory");
        const btnDelete = menu.querySelector("#ctxDeleteNode");
        const btnUnpin = menu.querySelector("#ctxUnpinNode");

        const newBtnUnpin = btnUnpin ? btnUnpin.cloneNode(true) : null;
        if (btnUnpin && newBtnUnpin) btnUnpin.parentNode.replaceChild(newBtnUnpin, btnUnpin);

        const newBtnInfo = btnInfo ? btnInfo.cloneNode(true) : null;
        const newBtnEdit = btnEdit ? btnEdit.cloneNode(true) : null;
        const newBtnSpotlight = btnSpotlight ? btnSpotlight.cloneNode(true) : null;
        const newBtnQuests = btnQuests ? btnQuests.cloneNode(true) : null;
        const newBtnHistory = btnHistory ? btnHistory.cloneNode(true) : null;
        const newBtnDelete = btnDelete ? btnDelete.cloneNode(true) : null;

        if (btnInfo && newBtnInfo) btnInfo.parentNode.replaceChild(newBtnInfo, btnInfo);
        if (btnEdit && newBtnEdit) btnEdit.parentNode.replaceChild(newBtnEdit, btnEdit);
        if (btnSpotlight && newBtnSpotlight) btnSpotlight.parentNode.replaceChild(newBtnSpotlight, btnSpotlight);
        if (btnQuests && newBtnQuests) btnQuests.parentNode.replaceChild(newBtnQuests, btnQuests);
        if (btnHistory && newBtnHistory) btnHistory.parentNode.replaceChild(newBtnHistory, btnHistory);
        if (btnDelete && newBtnDelete) btnDelete.parentNode.replaceChild(newBtnDelete, btnDelete);

        const hasLock = this._canEditGraph(true);
        const canViewNode = this._canUseGraphAction("viewNode", node);
        const canSpotlightNode = this._canUseGraphAction("spotlightNode", node);
        const hasQuests = !!this._getNodeQuestsForUser(node).length;

        if (newBtnInfo) newBtnInfo.style.display = canViewNode ? "flex" : "none";
        if (newBtnSpotlight) newBtnSpotlight.style.display = canSpotlightNode ? "flex" : "none";
        if (newBtnQuests) newBtnQuests.style.display = this._canUseGraphAction("manageQuests", node) ? "flex" : "none";
        if (newBtnHistory) newBtnHistory.style.display = canViewNode ? "flex" : "none";
        if (newBtnEdit) newBtnEdit.style.display = (hasLock && (game.user.isGM || canViewNode)) ? "flex" : "none";
        if (newBtnDelete) newBtnDelete.style.display = hasLock ? "flex" : "none";
        // Only worth showing on a node that is actually pinned.
        if (newBtnUnpin) newBtnUnpin.style.display = (hasLock && node?.pinned) ? "flex" : "none";

        newBtnUnpin?.addEventListener("click", async () => {
            menu.classList.add("hidden");
            if (!this._canEditGraph()) return;
            const live = this.simulation?.nodes().find(n => n.id === node.id) ?? node;
            live.pinned = false;
            live.fx = null;
            live.fy = null;
            const stored = this.graphData.nodes.find(n => n.id === node.id);
            if (stored) { stored.pinned = false; stored.fx = null; stored.fy = null; }
            this._draggedNodeIds?.add(node.id);   // we changed this node's position on purpose
            this.simulation?.alpha(0.3).restart();
            ui.notifications.info(`${this._getSafeNodeName(node)} — ${this._localize("FANG.Messages.NodeUnpinned", "position released.")}`);
            await this.saveData();
        });

        newBtnInfo?.addEventListener("click", () => {
            menu.classList.add("hidden");
            this._openLocalNodeInfo(node);
        });

        newBtnSpotlight?.addEventListener("click", () => {
            menu.classList.add("hidden");
            if (!this._canUseGraphAction("spotlightNode", node)) {
                ui.notifications.warn(game.i18n.localize("FANG.Messages.SpotlightHiddenBlocked") || "Reveal the character first before using Spotlight!");
                return;
            }
            this._onSpotlight(node);
        });

        newBtnQuests?.addEventListener("click", () => {
            menu.classList.add("hidden");
            this._onManageNodeQuests(node);
        });

        newBtnHistory?.addEventListener("click", () => {
            menu.classList.add("hidden");
            this._openHistoryDialog({ node });
        });

        newBtnEdit?.addEventListener("click", () => {
            menu.classList.add("hidden");
            this._onEditActorProfile(node);
        });

        newBtnDelete?.addEventListener("click", () => {
            menu.classList.add("hidden");
            this._confirmDeleteNode(node);
        });

        this._positionFloatingMenu(menu, mouseX, mouseY);
    }

    _confirmDeleteNode(node) {
        if (!this._canEditGraph()) return;
        const dialogTitle = game.i18n.localize("FANG.Dialogs.DeleteConfirmTitle") || "Confirm Deletion";
        const dialogContent = game.i18n.localize("FANG.Dialogs.DeleteNodeContent") || "Are you sure you want to delete this token from the graph? Your Player Lore notes will be kept safe.";

        this._openDialog({
            title: dialogTitle,
            content: `<p style="margin-bottom: 15px;">${dialogContent}</p>`,
            buttons: {
                yes: {
                    icon: '<i class="fas fa-check"></i>',
                    label: game.i18n.localize("Yes"),
                    callback: async () => {
                        this.graphData.nodes = this.graphData.nodes.filter(n => n.id !== node.id);
                        this.graphData.links = this.graphData.links.filter(l => {
                            const sId = this._getLinkEndpointId(l.source);
                            const tId = this._getLinkEndpointId(l.target);
                            return sId !== node.id && tId !== node.id;
                        });

                        ui.notifications.info(game.i18n.localize("FANG.Messages.DeletedNode"));
                        this.initSimulation();
                        this.simulation.alpha(0.3).restart();
                        this._rebuildSearchMatches();
                        await this.saveData();
                    }
                },
                no: {
                    icon: '<i class="fas fa-times"></i>',
                    label: game.i18n.localize("No"),
                    className: "cancel"
                }
            },
            default: "no",
            classes: ["dialog", "fang-dialog"], width: 400
        });
    }

    async _openNodeJournal(node) {
        if (!node?.journalUuid) return;
        await this._openJournalDocument(node.journalUuid);
    }

    async _openNodeQuest(node) {
        if (!node?.questUuids?.length) return;
        const quest = node.questUuids[0];
        const opened = await this._openJournalDocument(quest.uuid);
        if (!opened && !game.user.isGM) ui.notifications.warn("Quest Journal not found or you lack permissions.");
    }

    async _resolveJournalDocument(uuid) {
        if (!uuid) return null;
        const doc = await fromUuid(uuid);
        if (!doc || !["JournalEntry", "JournalEntryPage"].includes(doc.documentName)) return null;
        return doc;
    }

    async _openJournalDocument(uuid) {
        const doc = await this._resolveJournalDocument(uuid);
        if (!doc) return false;

        if (doc.documentName === "JournalEntryPage") {
            const parent = doc.parent;
            if (parent?.sheet) {
                parent.sheet.render(true, { pageId: doc.id });
                return true;
            }
            doc.sheet?.render?.(true);
            return true;
        }

        doc.sheet?.render?.(true);
        return true;
    }

    _getJournalDocumentTitle(doc) {
        if (!doc) return "Quest Journal";
        if (doc.documentName === "JournalEntryPage" && doc.parent?.name) return `${doc.parent.name}: ${doc.name}`;
        return doc.name || "Quest Journal";
    }

    _getJournalDocumentTextContent(doc) {
        if (!doc) return "";

        if (doc.documentName === "JournalEntryPage") {
            if (doc.type === "text" && doc.text?.content) return doc.text.content;
            return "";
        }

        const page = doc.pages?.contents?.find(p => p.type === "text" && p.text?.content);
        if (page?.text?.content) return page.text.content;

        // Legacy Journal compatibility
        return doc.content || "";
    }

    _getNodeQuestsForCurrentUser(node) {
        return this._getNodeQuestsForUser(node);
    }

    async _addQuestToNode(node, uuid, { visibleToPlayers = false } = {}) {
        if (!this._canEditGraph(true) || !node || !uuid) return false;
        const doc = await fromUuid(uuid);
        if (!doc) return false;
        if (!["JournalEntry", "JournalEntryPage"].includes(doc.documentName)) return false;

        if (!node.questUuids) node.questUuids = [];
        let addedQuest = null;
        if (!node.questUuids.some(q => q.uuid === uuid)) {
            addedQuest = { uuid, name: this._getJournalDocumentTitle(doc), visibleToPlayers, status: "open" };
            node.questUuids.push(addedQuest);
        }
        if (!node.conditions) node.conditions = [];
        if (!node.conditions.includes("questgiver")) node.conditions.push("questgiver");
        await this.saveData();
        this.ticked();
        if (addedQuest && visibleToPlayers) await this._recordQuestVisibleHistory(node, addedQuest);
        return true;
    }

    async _onManageNodeQuests(node) {
        const escapeHtml = foundry.utils.escapeHTML ?? ((value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        }[char])));
        const localize = (key, fallback) => {
            const value = game.i18n.localize(key);
            return value && value !== key ? value : fallback;
        };
        const canEdit = game.user.isGM && this._canEditGraph(true);
        const quests = canEdit ? (Array.isArray(node.questUuids) ? node.questUuids : []) : this._getNodeQuestsForCurrentUser(node);
        const journalOptions = game.journal.contents
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(j => `<option value="${escapeHtml(j.uuid)}" data-search="${escapeHtml(j.name.toLowerCase())}">${escapeHtml(j.name)}</option>`)
            .join("");
        const emptyText = canEdit
            ? localize("FANG.Dialogs.QuestLogHint", "Visible to players as a Questgiver mark. Drop Journal here.")
            : localize("FANG.Dialogs.SelectQuestContent", "Choose a Quest Journal to open:");
        const rows = quests.length
            ? quests.map((quest, index) => `
                <li class="fang-quest-manager-row" data-index="${index}" data-uuid="${escapeHtml(quest.uuid)}">
                    <span class="fang-quest-title"><i class="fas fa-scroll"></i> ${escapeHtml(quest.name || "Quest Journal")}</span>
                    <div class="fang-quest-manager-actions">
                        ${game.user.isGM ? `<span class="fang-quest-visibility ${quest.visibleToPlayers === false ? "is-hidden" : "is-visible"}">${quest.visibleToPlayers === false ? localize("FANG.Dialogs.QuestHiddenFromPlayers", "Hidden from players") : localize("FANG.Dialogs.QuestVisibleToPlayers", "Visible to players")}</span>` : ""}
                        ${canEdit ? `<select class="fang-quest-status" title="${localize("FANG.QuestStatus.Label", "Quest status")}">
                            ${["open", "active", "done", "failed", "rumor"].map(status => `<option value="${status}" ${String(quest.status || "open") === status ? "selected" : ""}>${localize(`FANG.QuestStatus.${status}`, status)}</option>`).join("")}
                        </select>` : ""}
                        <button type="button" class="fang-icon-btn fang-quest-open" title="${localize("FANG.ContextMenu.OpenQuest", "Open Quest Log")}" data-tooltip="${localize("FANG.ContextMenu.OpenQuest", "Open Quest Log")}"><i class="fas fa-book-open"></i></button>
                        <button type="button" class="fang-icon-btn fang-quest-spotlight" title="${localize("FANG.ContextMenu.Spotlight", "Spotlight for Everyone")}" data-tooltip="${localize("FANG.ContextMenu.Spotlight", "Spotlight for Everyone")}"><i class="fas fa-compass"></i></button>
                        ${canEdit ? `<button type="button" class="fang-icon-btn fang-quest-toggle-visibility" title="${quest.visibleToPlayers === false ? localize("FANG.Dialogs.QuestMakeVisible", "Reveal") : localize("FANG.Dialogs.QuestMakeHidden", "Hide")}" data-tooltip="${quest.visibleToPlayers === false ? localize("FANG.Dialogs.QuestMakeVisible", "Reveal") : localize("FANG.Dialogs.QuestMakeHidden", "Hide")}"><i class="fas ${quest.visibleToPlayers === false ? "fa-eye" : "fa-eye-slash"}"></i></button>` : ""}
                        ${canEdit ? `<button type="button" class="fang-icon-btn danger fang-quest-remove" title="${localize("FANG.UI.Delete", "Delete")}" data-tooltip="${localize("FANG.UI.Delete", "Delete")}"><i class="fas fa-trash"></i></button>` : ""}
                    </div>
                </li>`)
                .join("")
            : `<li class="fang-quest-manager-empty">${escapeHtml(emptyText)}</li>`;
        const addQuestForm = canEdit
            ? `<div class="fang-quest-add">
                    <div class="fang-quest-add-heading">
                        <i class="fas fa-link"></i>
                        <span>${localize("FANG.Dialogs.QuestAttachTitle", "Attach another quest journal")}</span>
                    </div>
                    <div class="fang-quest-drop-zone" data-drop-zone="quest">
                        <i class="fas fa-file-import"></i>
                        <strong>${localize("FANG.Dialogs.QuestDropTitle", "Drop Journal here")}</strong>
                        <span>${localize("FANG.Dialogs.QuestDropHint", "Drop a Journal here to add it as a hidden quest.")}</span>
                    </div>
                    <div class="fang-quest-add-picker">
                        <label for="fang-quest-add-select">${localize("FANG.Dialogs.QuestPickerTitle", "Or choose from journal list")}</label>
                        <input type="search" id="fang-quest-search" placeholder="${localize("FANG.Dialogs.QuestSearchPlaceholder", "Search quest journals...")}">
                        <select id="fang-quest-add-select">
                            <option value="">-- ${localize("FANG.Dialogs.SelectQuestContent", "Choose a Quest Journal to open:")} --</option>
                            ${journalOptions}
                        </select>
                        <label class="fang-editor-check">
                            <input type="checkbox" id="fang-quest-add-visible">
                            ${localize("FANG.Dialogs.QuestVisibleToPlayers", "Visible to players")}
                        </label>
                        <button type="button" id="fang-quest-add-btn" class="btn action-btn"><i class="fas fa-link"></i> ${localize("FANG.Dialogs.QuestLogAddBtn", "Add Quest Journal")}</button>
                    </div>
                    <p class="hint">${localize("FANG.Dialogs.QuestAddHiddenHint", "New quests are hidden from players until you reveal them.")}</p>
                </div>`
            : "";

        const panelHost = this.element?.querySelector(".fang-app-container") || this.element;
        panelHost?.querySelector(".fang-quest-canvas-panel")?.remove();
        const panel = document.createElement("div");
        panel.className = "fang-quest-canvas-panel";
        panel.innerHTML = `
            <div class="fang-quest-canvas-card">
                <header class="fang-quest-canvas-header">
                    <h3><i class="fas fa-scroll"></i> ${localize("FANG.UI.Quests", "Quests")}: ${escapeHtml(this._getSafeNodeName(node))}</h3>
                    <button type="button" class="fang-quest-canvas-close" title="${localize("FANG.UI.ClosePanel", "Close")}"><i class="fas fa-times"></i></button>
                </header>
                <div class="fang-quest-manager">
                    <div class="fang-quest-section-title">
                        <i class="fas fa-scroll"></i>
                        <span>${localize("FANG.Dialogs.QuestLinkedTitle", "Linked quests")}</span>
                    </div>
                    <ul>${rows}</ul>
                    ${addQuestForm}
                </div>
            </div>`;
        panelHost?.appendChild(panel);

        const refreshPanel = () => {
            panel.remove();
            this._onManageNodeQuests(node);
        };

        panel.querySelector(".fang-quest-canvas-close")?.addEventListener("click", () => panel.remove());
        panel.querySelectorAll(".fang-quest-manager-row").forEach(row => {
            row.addEventListener("click", async (event) => {
                if (event.target.closest("button, select, input")) return;
                if (row.dataset?.uuid) await this._onQuestSpotlight(row.dataset.uuid, { broadcast: false });
            });
        });
        panel.querySelectorAll(".fang-quest-open").forEach(button => {
            button.addEventListener("click", async (event) => {
                const row = event.currentTarget.closest(".fang-quest-manager-row");
                const opened = row?.dataset?.uuid ? await this._openJournalDocument(row.dataset.uuid) : false;
                if (!opened) ui.notifications.warn("Quest Journal not found or permissions missing.");
            });
        });
        panel.querySelectorAll(".fang-quest-spotlight").forEach(button => {
            button.addEventListener("click", async (event) => {
                const row = event.currentTarget.closest(".fang-quest-manager-row");
                if (row?.dataset?.uuid) await this._onQuestSpotlight(row.dataset.uuid, { broadcast: true });
            });
        });
        panel.querySelectorAll(".fang-quest-toggle-visibility").forEach(button => {
            button.addEventListener("click", async (event) => {
                if (!canEdit) return;
                const row = event.currentTarget.closest(".fang-quest-manager-row");
                const index = Number(row?.dataset?.index);
                if (!Number.isInteger(index) || !node.questUuids?.[index]) return;
                const wasVisible = node.questUuids[index].visibleToPlayers !== false;
                node.questUuids[index].visibleToPlayers = node.questUuids[index].visibleToPlayers === false;
                await this.saveData();
                if (!wasVisible && node.questUuids[index].visibleToPlayers !== false) {
                    await this._recordQuestVisibleHistory(node, node.questUuids[index]);
                }
                refreshPanel();
            });
        });
        panel.querySelectorAll(".fang-quest-status").forEach(selectEl => {
            selectEl.addEventListener("change", async (event) => {
                if (!canEdit) return;
                const row = event.currentTarget.closest(".fang-quest-manager-row");
                const index = Number(row?.dataset?.index);
                if (!Number.isInteger(index) || !node.questUuids?.[index]) return;
                node.questUuids[index].status = event.currentTarget.value || "open";
                await this.saveData();
                refreshPanel();
            });
        });
        panel.querySelectorAll(".fang-quest-remove").forEach(button => {
            button.addEventListener("click", async (event) => {
                if (!canEdit) return;
                const row = event.currentTarget.closest(".fang-quest-manager-row");
                const index = Number(row?.dataset?.index);
                if (!Number.isInteger(index)) return;
                node.questUuids.splice(index, 1);
                if (!node.questUuids.length) {
                    node.conditions = (node.conditions || []).filter(c => c !== "questgiver");
                }
                await this.saveData();
                this.ticked();
                refreshPanel();
            });
        });

        const search = panel.querySelector("#fang-quest-search");
        const select = panel.querySelector("#fang-quest-add-select");
        search?.addEventListener("input", (event) => {
            const query = String(event.currentTarget.value || "").toLowerCase().trim();
            select?.querySelectorAll("option").forEach(option => {
                if (!option.value) return;
                option.hidden = query && !String(option.dataset.search || "").includes(query);
            });
        });

        const dropZone = panel.querySelector(".fang-quest-drop-zone");
        dropZone?.addEventListener("dragover", (event) => {
            event.preventDefault();
            event.currentTarget.classList.add("drag-over");
        });
        dropZone?.addEventListener("dragleave", (event) => event.currentTarget.classList.remove("drag-over"));
        dropZone?.addEventListener("drop", async (event) => {
            event.preventDefault();
            event.currentTarget.classList.remove("drag-over");
            let data;
            try {
                data = JSON.parse(event.dataTransfer.getData("text/plain"));
            } catch (err) {
                return;
            }
            if (!["JournalEntry", "JournalEntryPage"].includes(data?.type) || !data.uuid) return;
            if (await this._addQuestToNode(node, data.uuid, { visibleToPlayers: false })) refreshPanel();
        });

        panel.querySelector("#fang-quest-add-btn")?.addEventListener("click", async () => {
            if (!canEdit) return;
            const uuid = select?.value;
            if (!uuid) return;
            const visibleToPlayers = !!panel.querySelector("#fang-quest-add-visible")?.checked;
            if (await this._addQuestToNode(node, uuid, { visibleToPlayers })) refreshPanel();
        });
    }

    async _onEditActorProfile(node) {
        if (!this._canEditGraph()) return;
        const isGM = game.user.isGM;
        const escapeHtml = foundry.utils.escapeHTML ?? ((value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        }[char])));
        const localize = (key, fallback) => {
            const value = game.i18n.localize(key);
            return value && value !== key ? value : fallback;
        };
        const conditions = new Set(node.conditions || []);
        const conditionGrid = `
                    <div class="fang-condition-grid">
                        <label><input type="checkbox" data-condition="deceased" ${conditions.has("deceased") ? "checked" : ""}> ${localize("FANG.Dialogs.ConditionDeceased", "Deceased")}</label>
                        <label><input type="checkbox" data-condition="missing" ${conditions.has("missing") ? "checked" : ""}> ${localize("FANG.Dialogs.ConditionMissing", "Missing")}</label>
                        <label><input type="checkbox" data-condition="captured" ${conditions.has("captured") ? "checked" : ""}> ${localize("FANG.Dialogs.ConditionCaptured", "Captured")}</label>
                        <label><input type="checkbox" data-condition="questgiver" ${conditions.has("questgiver") ? "checked" : ""}> ${localize("FANG.Dialogs.ConditionQuestgiver", "Quest Giver")}</label>
                    </div>`;
        const openPlayerLorePage = async ({ createIfMissing = false, button = null } = {}) => {
            const entry = await this.getJournalEntry();
            if (!entry) return;
            if (node.playerLorePageId) {
                const page = entry.pages.get(node.playerLorePageId);
                if (page) {
                    entry.sheet.render(true, { pageId: node.playerLorePageId });
                    return;
                }
                node.playerLorePageId = null;
                await this.saveData();
                button?.remove?.();
            }
            if (!createIfMissing) {
                ui.notifications.warn(localize("FANG.Messages.PlayerLoreMissing", "A GM needs to create the player notes journal first."));
                return;
            }
            if (!game.user.isGM) {
                ui.notifications.warn(localize("FANG.Messages.PlayerLoreCreateGMOnly", "Only a GM can create the initial player notes journal."));
                return;
            }
            const newPage = await JournalEntryPage.create({
                name: "Lore: " + (node.name || "Unknown"),
                type: "text",
                text: { content: node.lore ? "<p>" + node.lore.replace(/\n/g, "<br>") + "</p>" : "" },
                ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER }
            }, { parent: entry });
            node.playerLorePageId = newPage.id;
            node.lore = "";
            await this.saveData();
            entry.sheet.render(true, { pageId: newPage.id });
        };

        if (!isGM && this._isNodeHiddenForUser(node)) {
            const safeName = node.displayName || game.i18n.localize("FANG.Dropdowns.Unknown");
            const playerLoreButton = node.playerLorePageId
                ? `<button type="button" id="fang-safe-player-lore" class="btn action-btn"><i class="fas fa-book-open"></i> ${localize("FANG.Dialogs.BtnOpenPlayerJournal", "Open Player Notes Journal")}</button>`
                : "";
            const content = `
            <div class="fang-actor-editor fang-actor-editor-safe">
                <section class="fang-editor-section">
                    <h3><i class="fas fa-user-secret"></i> ${localize("FANG.ActorEditor.PlayerView", "Player View")}</h3>
                    <label>${localize("FANG.Dialogs.IdentityAlias", "Alias")}</label>
                    <input type="text" id="fang-safe-alias" value="${escapeHtml(safeName)}" placeholder="???">
                </section>
                <section class="fang-editor-section">
                    <h3><i class="fas fa-tags"></i> ${localize("FANG.ActorEditor.Conditions", "Conditions")}</h3>
                    ${conditionGrid}
                </section>
                <section class="fang-editor-section fang-editor-notes">
                    <h3><i class="fas fa-feather"></i> ${localize("FANG.ActorEditor.PlayerNotesTitle", "Player Notes")}</h3>
                    <textarea id="fang-safe-player-notes" placeholder="${localize("FANG.Dialogs.InfoInput", "Notes")}">${escapeHtml(node.playerNotes || "")}</textarea>
                    ${playerLoreButton}
                </section>
            </div>`;

            this._openPanelEditor({
                title: localize("FANG.ActorEditor.Title", "Edit Actor"),
                content,
                buttons: {
                    save: {
                        icon: '<i class="fas fa-save"></i>',
                        label: localize("FANG.Dialogs.BtnSave", "Save"),
                        callback: async (html) => {
                            const alias = html.find("#fang-safe-alias").val().trim();
                            const newConditions = [];
                            html.find("[data-condition]").each((_, el) => {
                                if (el.checked) newConditions.push(el.dataset.condition);
                            });
                            node.displayName = alias || "";
                            node.playerNotes = html.find("#fang-safe-player-notes").val().trim();
                            node.conditions = newConditions;
                            this.ticked();
                            this._rebuildSearchMatches();
                            await this.saveData();
                        }
                    },
                    cancel: {
                        icon: '<i class="fas fa-times"></i>',
                        label: localize("FANG.Dialogs.BtnCancel", "Cancel")
                    }
                },
                default: "save",
                render: (html) => {
                    html.find("#fang-safe-player-lore").on("click", async (event) => openPlayerLorePage({ createIfMissing: false, button: event.currentTarget }));
                },
            classes: ["dialog", "fang-dialog", "fang-actor-editor-dialog"], width: 620
        });
            return;
        }

        const factionOptions = (this.graphData.factions || [])
            .map(f => this._normalizeFaction(f))
            .filter(f => this._isFactionVisibleToCurrentUser(f) || f.id === node.factionId)
            .map(f => `<option value="${escapeHtml(f.id)}" ${f.id === node.factionId ? "selected" : ""}>${escapeHtml(f.name)}</option>`)
            .join("");
        const zoneOptions = (this.graphData.zones || [])
            .map(z => this._normalizeZone(z))
            .filter(z => game.user?.isGM || z.playerVisible !== false || z.id === node.zoneId)
            .map(z => `<option value="${escapeHtml(z.id)}" ${z.id === node.zoneId ? "selected" : ""}>${escapeHtml(z.name)}</option>`)
            .join("");
        const gmJournalLabel = node.journalUuid ? localize("FANG.ContextMenu.OpenJournal", "Open GM Journal") : "GM Journal";
        const playerLoreLabel = node.playerLorePageId
            ? localize("FANG.Dialogs.BtnOpenPlayerJournal", "Open Player Notes Journal")
            : localize("FANG.Dialogs.BtnConvertPlayerJournal", "Convert & Open in Player Journal");
        const playerViewSection = isGM ? `
                <section class="fang-editor-section">
                    <h3><i class="fas fa-user-secret"></i> ${localize("FANG.ActorEditor.PlayerViewGMSettings", "GM Settings for Player View")}</h3>
                    <label class="fang-editor-check"><input type="checkbox" id="fang-profile-hidden" ${node.hidden ? "checked" : ""}> ${localize("FANG.Dialogs.IdentityHidden", "Hidden for Players")}</label>
                    <label class="fang-editor-check"><input type="checkbox" id="fang-profile-gm-only" ${node.gmOnly ? "checked" : ""}> ${localize("FANG.Dialogs.IdentityGMOnly", "GM only - hide completely")}</label>
                    <label class="fang-editor-check"><input type="checkbox" id="fang-profile-hidden-quests" ${node.showHiddenQuestsToPlayers !== false ? "checked" : ""}> ${localize("FANG.Dialogs.HiddenQuestsVisible", "Show quests while hidden")}</label>
                    <label>${localize("FANG.Dialogs.IdentityAlias", "Alias")}</label>
                    <input type="text" id="fang-profile-alias" value="${escapeHtml(node.displayName || "")}" placeholder="???">
                    <button type="button" id="fang-profile-player-lore" class="btn action-btn"><i class="fas fa-book-open"></i> ${playerLoreLabel}</button>
                </section>` : "";
        // Delete lives in the footer (bottom-left, danger) now, not here — a destructive
        // action does not belong in the middle of the form next to Save. Only the
        // navigational actions (open journal, replace placeholder) stay in the body, and
        // the section is omitted entirely when there are none.
        const bodyActions = [
            node.journalUuid ? `<button type="button" id="fang-profile-gm-journal" class="btn action-btn fang-btn-block"><i class="fas fa-book"></i> ${gmJournalLabel}</button>` : "",
            node.isPlaceholder ? `<button type="button" id="fang-profile-replace" class="btn action-btn fang-btn-block"><i class="fas fa-random"></i> ${localize("FANG.ContextMenu.ReplacePlaceholder", "Replace with Actor")}</button>` : ""
        ].filter(Boolean).join("");
        const actionSection = (isGM && bodyActions) ? `
                <section class="fang-editor-actions">${bodyActions}</section>` : "";

        const content = `
            <div class="fang-actor-editor">
                <section class="fang-editor-section">
                    <h3><i class="fas fa-id-card"></i> ${localize("FANG.ActorEditor.Profile", "Profile")}</h3>
                    <label>${localize("FANG.Dialogs.IdentityName", "Displayed Name")}</label>
                    <input type="text" id="fang-profile-name" value="${escapeHtml(node.name || "")}">
                    <label>${localize("FANG.Dialogs.RoleInput", "Role")}</label>
                    <input type="text" id="fang-profile-role" value="${escapeHtml(node.role || "")}">
                    <label>${localize("FANG.Dialogs.FactionInput", "Faction")}</label>
                    <select id="fang-profile-faction">
                        <option value="">-- None --</option>
                        ${factionOptions}
                    </select>
                    <label>${localize("FANG.Zones.Zone", "Zone")}</label>
                    <select id="fang-profile-zone">
                        <option value="">-- None --</option>
                        ${zoneOptions}
                    </select>
                </section>
                ${playerViewSection}
                <section class="fang-editor-section">
                    <h3><i class="fas fa-tags"></i> ${localize("FANG.ActorEditor.Conditions", "Conditions")}</h3>
                    ${conditionGrid}
                </section>
                <section class="fang-editor-section fang-editor-notes">
                    <h3><i class="fas fa-feather"></i> ${localize("FANG.ActorEditor.Notes", "Notes")}</h3>
                    <textarea id="fang-profile-lore" placeholder="${localize("FANG.Dialogs.InfoInput", "Notes")}">${escapeHtml(node.lore || "")}</textarea>
                </section>
                ${actionSection}
            </div>`;

        await this._openPanelEditor({
            title: localize("FANG.ActorEditor.Title", "Edit Actor"),
            content,
            buttons: {
                save: {
                    icon: '<i class="fas fa-save"></i>',
                    label: localize("FANG.Dialogs.BtnSave", "Save"),
                    callback: async (html) => {
                        const wasHidden = !!node.hidden;
                        const previousAlias = node.displayName || "";
                        const previousFactionId = node.factionId || null;
                        const previousShowHiddenQuests = node.showHiddenQuestsToPlayers !== false;
                        const newName = html.find("#fang-profile-name").val().trim();
                        const newRole = html.find("#fang-profile-role").val().trim();
                        const newFactionId = html.find("#fang-profile-faction").val();
                        const newZoneId = html.find("#fang-profile-zone").val();
                        const newAlias = isGM ? html.find("#fang-profile-alias").val().trim() : node.displayName;
                        const newLore = html.find("#fang-profile-lore").val().trim();
                        const newConditions = [];
                        html.find("[data-condition]").each((_, el) => {
                            if (el.checked) newConditions.push(el.dataset.condition);
                        });

                        if (newName) node.name = newName;
                        node.role = newRole || null;
                        node.factionId = newFactionId || null;
                        node.zoneId = newZoneId || null;
                        if (isGM) {
                            node.hidden = html.find("#fang-profile-hidden").is(":checked");
                            node.gmOnly = html.find("#fang-profile-gm-only").is(":checked");
                            if (node.gmOnly) node.hidden = true;
                            node.secretKind = node.gmOnly ? "secret" : (node.secretKind || "");
                            node.displayName = newAlias;
                            node.showHiddenQuestsToPlayers = html.find("#fang-profile-hidden-quests").is(":checked");
                        }
                        node.lore = newLore || null;
                        node.conditions = newConditions;

                        this.ticked();
                        this._rebuildSearchMatches();
                        await this.saveData();
                        if (isGM && wasHidden && !node.hidden) {
                            await this._recordIdentityRevealedHistory(node, previousAlias);
                        }
                        if (isGM && previousFactionId !== node.factionId && node.factionId) {
                            const faction = this.graphData.factions.find(f => f.id === node.factionId);
                            await this._recordFactionAssignedHistory(node, faction);
                        }
                        if (isGM && !previousShowHiddenQuests && node.showHiddenQuestsToPlayers !== false) {
                            for (const quest of node.questUuids || []) {
                                await this._recordQuestVisibleHistory(node, quest);
                            }
                        }
                    }
                },
                cancel: {
                    icon: '<i class="fas fa-times"></i>',
                    label: localize("FANG.Dialogs.BtnCancel", "Cancel")
                },
                // Destructive action, pinned bottom-left away from Save. Only for the GM.
                ...(isGM ? {
                    delete: {
                        icon: '<i class="fas fa-trash"></i>',
                        label: localize("FANG.ContextMenu.DeleteNode", "Delete Actor"),
                        className: "danger-btn",
                        side: "left",
                        callback: () => { this._confirmDeleteNode(node); }
                    }
                } : {})
            },
            default: "save",
            render: (html, dialog) => {
                if (!isGM) return;
                html.find("#fang-profile-gm-journal").on("click", async () => this._openNodeJournal(node));
                html.find("#fang-profile-replace").on("click", async () => {
                    dialog.close();
                    await this._onReplacePlaceholder(node);
                });
                html.find("#fang-profile-player-lore").on("click", async (event) => openPlayerLorePage({ createIfMissing: true, button: event.currentTarget }));
            },
            classes: ["dialog", "fang-dialog", "fang-actor-editor-dialog"], width: 760
        });
    }
    _onCanvasPointerDown(event) {
        if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
        const pos = this._getCanvasPointerPosition(event);
        if (!pos) return;

        this._clearTouchLongPress();
        this._touchLongPressStart = {
            pointerId: event.pointerId,
            clientX: event.clientX,
            clientY: event.clientY,
            pos
        };

        this._touchLongPressTimer = setTimeout(() => {
            const start = this._touchLongPressStart;
            if (!start || start.pointerId !== event.pointerId) return;

            const node = this._findNodeAtCanvasPoint(start.pos.x, start.pos.y, 44);
            const linkIndex = node ? -1 : this._findLinkIndexAtCanvasPoint(start.pos.x, start.pos.y, 28);
            if (!node && linkIndex === -1) return;

            event.preventDefault();
            this._suppressNextCanvasClick = true;
            if (node) this._showContextMenu(node, start.pos.mouseX, start.pos.mouseY);
            else this._showEdgeContextMenu(linkIndex, start.pos.mouseX, start.pos.mouseY);
        }, 520);
    }

    _onCanvasPointerMove(event) {
        if (!this._touchLongPressStart || this._touchLongPressStart.pointerId !== event.pointerId) return;
        const dx = event.clientX - this._touchLongPressStart.clientX;
        const dy = event.clientY - this._touchLongPressStart.clientY;
        if (Math.sqrt(dx * dx + dy * dy) > 12) this._clearTouchLongPress();
    }

    _onCanvasPointerUp(event) {
        if (this._touchLongPressStart?.pointerId === event.pointerId) this._clearTouchLongPress();
    }

    _onCanvasPointerCancel(event) {
        if (this._touchLongPressStart?.pointerId === event.pointerId) this._clearTouchLongPress();
    }

    _clearTouchLongPress() {
        if (this._touchLongPressTimer) clearTimeout(this._touchLongPressTimer);
        this._touchLongPressTimer = null;
        this._touchLongPressStart = null;
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

                const isCanonical = this._getLinkEndpointId(link.source) < this._getLinkEndpointId(link.target);
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
        // Both hovers have to let go here, or a faction stays highlighted after the pointer
        // has left the canvas entirely.
        const warGehovert = this._hoveredNodeId !== null || this._hoveredFactionId !== null;
        this._hoveredNodeId = null;
        this._hoveredFactionId = null;
        if (warGehovert) this.ticked();
    }

    _showEdgeContextMenu(linkIndex, mouseX, mouseY) {
        const menu = this.element.querySelector("#fang-edge-context-menu");
        if (!menu) return;

        const link = this.graphData.links[linkIndex];
        if (!link) return;

        // Position menu at cursor; final clamping happens after visibility/actions are set.
        menu.style.left = `${mouseX}px`;
        menu.style.top = `${mouseY}px`;
        menu.classList.remove("hidden");

        const btnInfo = menu.querySelector("#ctxEdgeInfo");
        const btnEdit = menu.querySelector("#ctxEditConnection");
        const btnSpotlight = menu.querySelector("#ctxEdgeSpotlight");
        const btnDelete = menu.querySelector("#ctxDeleteConnection");

        const newBtnInfo = btnInfo ? btnInfo.cloneNode(true) : null;
        const newBtnEdit = btnEdit.cloneNode(true);
        const newBtnSpotlight = btnSpotlight.cloneNode(true);
        const newBtnDelete = btnDelete.cloneNode(true);

        if (btnInfo && newBtnInfo) btnInfo.parentNode.replaceChild(newBtnInfo, btnInfo);
        btnEdit.parentNode.replaceChild(newBtnEdit, btnEdit);
        btnSpotlight.parentNode.replaceChild(newBtnSpotlight, btnSpotlight);
        btnDelete.parentNode.replaceChild(newBtnDelete, btnDelete);

        const hasLock = this._canEditGraph(true);
        const hiddenEndpoint = !!(link.source?.hidden || link.target?.hidden);
        if (newBtnInfo) newBtnInfo.style.display = this._canUseGraphAction("viewLink", link) ? "block" : "none";
        newBtnEdit.style.display = hasLock ? "block" : "none";
        newBtnDelete.style.display = hasLock ? "block" : "none";
        newBtnSpotlight.style.display = this._canUseGraphAction("spotlightLink", link) ? "block" : "none";

        if (newBtnInfo) {
            newBtnInfo.addEventListener("click", () => {
                menu.classList.add("hidden");
                if (!this._canUseGraphAction("viewLink", link)) return;
                this.startEdgeSpotlight(this._buildEdgeSpotlightPayload(link), { notify: false });
            });
        }

        // Action: Edit
        newBtnEdit.addEventListener("click", () => {
            menu.classList.add("hidden");
            if (!this._canEditGraph()) return;

            const title = game.i18n.localize("FANG.Dialogs.EditConnectionTitle") || "Informationen bearbeiten";
            const contentString = game.i18n.localize("FANG.Dialogs.EditConnectionContent") || "ZusÃ¤tzliche Details fÃ¼r die Verbindung:";
            const lblName = game.i18n.localize("FANG.Dialogs.LabelInput") || "Bezeichnung (Label)";
            const lblInfo = game.i18n.localize("FANG.Dialogs.InfoInput") || "Notizen";
            const lblDirectional = game.i18n.localize("FANG.Dialogs.DirectionalInput") || "Gerichtet (Pfeil)";
            const lblReverseDirection = game.i18n.localize("FANG.Dialogs.ReverseDirectionInput") || "Richtung umkehren";
            const relationshipOptions = (this.graphData.relationshipTypes || this._getDefaultRelationshipTypes())
                .map(t => this._normalizeRelationshipType(t))
                .map(t => `<option value="${this._escapeHtml(t.id)}" ${link.relationshipType === t.id ? "selected" : ""}>${this._escapeHtml(t.label)}</option>`)
                .join("");

            this._openPanelEditor({
                title: title,
                content: `
                    <p><strong>${contentString}</strong></p>
                    <div class="form-group" style="margin-bottom: 10px;">
                        <div class="form-fields">
                            <input type="text" id="fang-edit-link-name" value="${link.label || ""}" placeholder="${lblName}" style="width: 100%; font-family: var(--fang-font-main); padding: 5px;">
                        </div>
                    </div>
                    <div class="form-group" style="height: 150px;">
                        <textarea id="fang-edit-link-info" placeholder="${lblInfo}" style="width: 100%; height: 100%; resize: none; font-family: var(--fang-font-main); padding: 5px;">${link.info || ""}</textarea>
                    </div>
                    <div class="form-group" style="margin-top: 10px;">
                        <label for="fang-edit-link-type">${this._escapeHtml(this._localize("FANG.RelationshipTypes.Label", "Relationship type"))}</label>
                        <select id="fang-edit-link-type" style="width: 100%;">
                            <option value="">-- ${this._escapeHtml(this._localize("FANG.RelationshipTypes.Default", "Default"))} --</option>
                            ${relationshipOptions}
                        </select>
                    </div>
                    <div class="form-group" style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px;">
                        <label for="fang-edit-link-gm-only" style="cursor: pointer;">${this._escapeHtml(this._localize("FANG.Dialogs.IdentityGMOnly", "GM only - hide completely"))}</label>
                        <input type="checkbox" id="fang-edit-link-gm-only" ${link.gmOnly ? "checked" : ""} style="width: auto; margin: 0; cursor: pointer;">
                    </div>
                    <div class="form-group" style="display: flex; align-items: center; justify-content: space-between; margin-top: 10px;">
                        <label for="fang-edit-link-directional" style="cursor: pointer;">${lblDirectional}</label>
                        <input type="checkbox" id="fang-edit-link-directional" ${link.directional ? "checked" : ""} style="width: auto; margin: 0; cursor: pointer;">
                    </div>
                    <div class="form-group" style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px;">
                        <label for="fang-edit-link-reverse" style="cursor: pointer;">${lblReverseDirection}</label>
                        <input type="checkbox" id="fang-edit-link-reverse" style="width: auto; margin: 0; cursor: pointer;">
                    </div>
                `,
                buttons: {
                    save: {
                        icon: '<i class="fas fa-save"></i>',
                        label: game.i18n.localize("FANG.Dialogs.BtnSave") || "Save",
                        callback: async (html) => {
                            const newLabel = html.find("#fang-edit-link-name").val().trim();
                            const newInfo = html.find("#fang-edit-link-info").val().trim();
                            const newDirectional = html.find("#fang-edit-link-directional").is(":checked");
                            const reverseDirection = html.find("#fang-edit-link-reverse").is(":checked");
                            if (newLabel) link.label = newLabel;
                            link.info = newInfo !== "" ? newInfo : null;
                            link.relationshipType = html.find("#fang-edit-link-type").val() || "";
                            link.gmOnly = html.find("#fang-edit-link-gm-only").is(":checked");
                            link.directional = reverseDirection ? true : newDirectional;
                            if (reverseDirection) {
                                const oldSource = link.source;
                                link.source = link.target;
                                link.target = oldSource;
                            }

                            this.initSimulation();
                            this.simulation.alpha(0.05).restart();
                            await this.saveData();
                        }
                    },
                    cancel: { icon: '<i class="fas fa-times"></i>', label: game.i18n.localize("FANG.Dialogs.BtnCancel") || "Cancel" }
                },
                default: "save",
            classes: ["dialog", "fang-dialog"], width: 450
        });
        });

        // Action: Delete
        newBtnDelete.addEventListener("click", async () => {
            menu.classList.add("hidden");
            if (!this._canEditGraph()) return;

            const dialogTitle = game.i18n.localize("FANG.Dialogs.DeleteConfirmTitle") || "Confirm Deletion";
            const dialogContent = game.i18n.localize("FANG.Dialogs.DeleteLinkContent") || "Are you sure you want to delete this connection?";

            this._openDialog({
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
                            await this.saveData();
                        }
                    },
                    no: {
                        icon: '<i class="fas fa-times"></i>',
                        label: game.i18n.localize("No"),
                        className: "cancel"
                    }
                },
                default: "no",
            classes: ["dialog", "fang-dialog"], width: 400
        });
        });

        // Action: Edge Spotlight
        newBtnSpotlight.addEventListener("click", () => {
            menu.classList.add("hidden");
            if (!this._canUseGraphAction("spotlightLink", link)) return;
            this._onEdgeSpotlight(link);
        });

        this._positionFloatingMenu(menu, mouseX, mouseY);
    }

    async _onCanvasClick(event) {
        if (this._suppressNextCanvasClick) {
            this._suppressNextCanvasClick = false;
            return;
        }

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
            if (await this._handleQuickConnectNodeClick(clickedNode)) return;
            if (!game.user.isGM) {
                await this._openLocalNodeInfo(clickedNode);
                return;
            }
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
                const isCanonical = this._getLinkEndpointId(link.source) < this._getLinkEndpointId(link.target);
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
        } else {
            // Clicked empty space - Reset sidebar selection and hide context menu
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
        this._rebuildSearchMatches(); // Refresh labels in dropdowns

        // Re-select to keep editor open with fresh data
        const newSelect = this.element.querySelector("#deleteSelect");
        if (newSelect) newSelect.value = `link|${linkIndex}`;

        await this.saveData();
        ui.notifications.info(game.i18n.localize("FANG.Messages.SaveSuccess") || "Changes saved.");
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
            // _applyAxisForces rebuilds forceX/forceY against the new width/height, which is
            // all the re-centring a resize needs. (There used to be a forceCenter here too —
            // it hard-shifted the whole graph on every resize; see initSimulation.)
            this._applyAxisForces();
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
            .call(this.zoom)
            // d3.zoom installs its own double-click-to-zoom. We bind dblclick ourselves to
            // open the character sheet, so both fired at once: the sheet opened *and* the
            // canvas zoomed in under it. The sheet is the useful one.
            .on("dblclick.zoom", null);

        this.canvas.addEventListener("mousemove", this._onMouseMove.bind(this));
        this.canvas.addEventListener("mouseleave", this._onMouseLeave.bind(this));

        // Apply initial zoom-to-fit once on window open
        if (!this._initialZoomApplied && this.graphData.nodes.length > 0) {
            this._initialZoomApplied = true;
            // Delay slightly to allow simulation to get initial positions and container to settle
            setTimeout(() => this.zoomToFit(false), 200);
        }
    }

    // While grouping, the cluster target wins over isCenter: a centred character still
    // belongs with their group. Outside the view, isCenter keeps its old meaning.
    _getNodeTargetX(node) {
        const groupedTarget = this._clusterTargets?.get(node?.id);
        if (groupedTarget) return groupedTarget.x;
        return this.width / 2;
    }

    _getNodeTargetY(node) {
        const groupedTarget = this._clusterTargets?.get(node?.id);
        if (groupedTarget) return groupedTarget.y;
        return this.height / 2;
    }

    _getNodeAxisStrength(node) {
        // Grouping needs a firm hand: relationships run across groups and would otherwise
        // drag members out of their cluster far enough to blow up the area drawn around
        // it. Measured on real data — at 0.11 members ended up ~680px off their target.
        // Paired with the weakened link force during grouping (see _applyLinkStrength),
        // 0.9 pins members close enough to their cell that the areas stop overlapping
        // (measured: 57px drift, 0 overlaps, down from 214px / 2 overlaps).
        if (this._groupingMode !== "none" && this._clusterTargets?.has(node?.id)) return 0.9;
        if (node?.isCenter) return 0.4;
        return 0.025;
    }

    /**
     * Set the link force strength for the current mode.
     *
     * Normal view: d3's default, 1/min(degree) — well-connected nodes pull less so the
     * layout does not collapse. Grouping view: almost off. The cluster forces decide the
     * layout there; leaving the links at full strength is what dragged members across cell
     * boundaries and made the group areas overlap. Reducing them is what took the drift
     * from 214px to 57px and the overlaps from 2 to 0.
     */
    _applyLinkStrength() {
        const link = this.simulation?.force("link");
        if (!link) return;
        const endpointId = (v) => (typeof v === "object" ? v?.id : v);
        const degree = new Map();
        for (const l of link.links()) {
            const s = endpointId(l.source), t = endpointId(l.target);
            degree.set(s, (degree.get(s) || 0) + 1);
            degree.set(t, (degree.get(t) || 0) + 1);
        }
        const grouping = this._groupingMode !== "none";
        link.strength((l) => {
            if (grouping) return 0.06;
            const s = endpointId(l.source), t = endpointId(l.target);
            return 1 / Math.max(1, Math.min(degree.get(s) || 1, degree.get(t) || 1));
        });
    }

    /**
     * How far apart the collide force holds any two tokens.
     *
     * Normal view: tokenSize + 120. The big gap is there so the relationship lines
     * between tokens have room to be read.
     *
     * Grouping view: much tighter. There are no relationship lines *inside* a cluster to
     * make room for — members only need to not visually overlap. Keeping the normal 320px
     * here is what stopped three clusters from fitting: the rings could not be packed onto
     * the canvas, so they were scaled down below what collide would allow, and collide then
     * shoved every member back out (measured drift ~250px, all three areas overlapping).
     * A snug radius lets each cluster pack into a tight ring that actually fits.
     *
     * @param {"normal"|"grouping"} [context]  defaults to the current grouping mode
     * @returns {number} collide radius in px
     */
    _getCollideRadius(context = this._groupingMode !== "none" ? "grouping" : "normal") {
        const tokenSize = game.settings.get("fang", "tokenSize");
        // Grouping: the binding constraint is the NAME LABEL, not the token. Labels are
        // drawn centred under the token and run wider than it — the widest in the test
        // graph is 171px. At the old +45 the closest tokens sat 170px apart, so two wide
        // labels touched edge to edge: still unreadable, which is what "immer noch zu eng"
        // was. +70 gives ~206px min separation — the 171px label plus a ~35px gap — while
        // still fitting three across a cell (3 * 206 = 618 < 661px cell width; +80 would be
        // 678 and no longer fit). Safe to widen now only because the areas are clamped to
        // their grid cell, so a wider spread pushes members towards the edge, never into a
        // neighbour.
        return context === "grouping" ? tokenSize + 70 : tokenSize + 120;
    }

    _applyAxisForces() {
        if (!this.simulation) return;
        this.simulation
            .force("x", d3.forceX(node => this._getNodeTargetX(node)).strength(node => this._getNodeAxisStrength(node)))
            .force("y", d3.forceY(node => this._getNodeTargetY(node)).strength(node => this._getNodeAxisStrength(node)));

        // Collide tightens up when grouping turns on and relaxes when it turns off — the
        // clusters need to pack closer than the normal 320px, which is only there to give
        // relationship lines room. Applied here too, not just in initSimulation, because
        // toggling the mode does not rebuild the simulation.
        const collide = this.simulation.force("collide");
        if (collide) collide.radius(this._getCollideRadius());

        // Same for link strength — near-off while grouping, back to normal after.
        this._applyLinkStrength();

        // forceCenter used to be dropped here for grouping, because it fought the cluster
        // targets. It is gone entirely now (see initSimulation) — it fought the user just
        // as hard everywhere else. Nothing left to do.
    }

    _buildFactionClusterTargets() {
        return this._buildClusterTargets("faction");
    }

    /** Cluster nodes by their zone, same layout rules as factions. */
    _buildZoneClusterTargets() {
        return this._buildClusterTargets("zone");
    }

    /**
     * Arrange nodes in orbiting clusters, grouped by faction or by zone.
     *
     * Faction and zone are mutually exclusive on purpose: a character cannot stand with
     * their faction and inside their zone at the same time — two pulls would fight over
     * the same node. See _setGroupingMode.
     *
     * @param {"faction"|"zone"} mode
     * @returns {Map<string,{x:number,y:number}>|null} null when there is nothing to group
     */
    _buildClusterTargets(mode) {
        const groupKey = mode === "zone" ? "zoneId" : "factionId";
        const known = mode === "zone"
            ? new Set((this.graphData.zones || []).map(z => z.id))
            : new Set((this.graphData.factions || []).map(f => f.id));

        const buckets = new Map();
        const allNodes = Array.isArray(this.graphData.nodes) ? this.graphData.nodes : [];

        for (const node of allNodes) {
            if (!node) continue;
            // isCenter pins a node to the middle of the canvas — meaningful in the normal
            // view (the boss sits centre stage), wrong here: while grouping, everyone
            // belongs with their group. Leaving them behind stretched their group's area
            // from the cluster all the way to the canvas centre, which is what made
            // areas overlap even when the groups themselves were cleanly separated.
            const group = node[groupKey];
            if (!group || !known.has(group)) continue;
            if (!buckets.has(group)) buckets.set(group, []);
            buckets.get(group).push(node);
        }

        const groupedEntries = Array.from(buckets.entries()).filter(([, nodes]) => nodes.length > 0);
        if (groupedEntries.length < 2) return null;

        const targets = new Map();

        // Lay the clusters out on a GRID, not a ring around the centre.
        //
        // The old orbit layout put cluster centres on a circle, which wastes the corners of
        // a rectangular canvas and, worse, packed the centres closer than the drawn areas
        // need: the spacing formula only counted the rings, never the padding the box adds
        // around them, so three areas overlapped no matter how the physics settled. Twice
        // reported as "die Kästen überlagern sich".
        //
        // A grid tiles the canvas into one cell per group. Cells cannot overlap by
        // construction, and the drawn area is clamped to its cell (see the draw code), so
        // the areas cannot overlap either — regardless of how far members drift. Members
        // are then laid out on a sub-grid *within* the cell, not a ring, so their labels
        // have room.
        const clusterCount = groupedEntries.length;
        const pad = Math.max(70, (game.settings.get("fang", "tokenSize") || 33) * 2.4);
        const gap = 24; // breathing room between neighbouring cells

        // Columns/rows chosen to match the canvas shape, so cells stay as square as the
        // aspect ratio allows (a wide canvas gets more columns).
        const cols = Math.max(1, Math.min(clusterCount,
            Math.round(Math.sqrt(clusterCount * (this.width / this.height)))));
        const rows = Math.ceil(clusterCount / cols);
        const cellW = this.width / cols;
        const cellH = this.height / rows;

        // Each group's cell, so the drawing can clamp its area to it. Even if a member
        // drifts to the cell edge, the drawn box stops at the boundary and the areas can
        // never overlap.
        this._groupingCells = new Map();

        groupedEntries.forEach(([groupId, members], clusterIndex) => {
            const col = clusterIndex % cols;
            const row = Math.floor(clusterIndex / cols);
            // Last row may be short; centre its cells across the width.
            const itemsInRow = Math.min(cols, clusterCount - row * cols);
            const rowOffset = (cols - itemsInRow) * cellW / 2;
            const clusterX = rowOffset + (col + 0.5) * cellW;
            const clusterY = (row + 0.5) * cellH;

            this._groupingCells.set(groupId, {
                x0: clusterX - cellW / 2 + gap / 2,
                x1: clusterX + cellW / 2 - gap / 2,
                y0: clusterY - cellH / 2 + gap / 2,
                y1: clusterY + cellH / 2 - gap / 2
            });

            if (members.length === 1) {
                targets.set(members[0].id, { x: clusterX, y: clusterY });
                return;
            }

            // Arrange members on a GRID that fills the cell, not a ring at its centre.
            // A ring puts everyone on one small circle — fine for two or three, but five
            // crammed onto it and, worse, their name labels (wider than the tokens) piled
            // on top of each other: "man kann kaum was lesen". A grid spreads members
            // across the whole rectangular cell, so each token *and its label* gets its own
            // patch of space.
            //
            // Placement uses nearly the whole cell (only a small edge margin), not the
            // padded box: the point is to push members apart for their labels, and the
            // drawn area is clamped to the cell anyway, so a member near the edge cannot
            // make the box bleed into a neighbour.
            // Small margin so the grid uses almost the full cell width — the grid step then
            // matches the collide separation (~206px), instead of the two fighting: a
            // narrower grid would place members closer than collide wants, and collide would
            // shove them apart into a messier layout.
            const placeMargin = 20;
            const usableW = Math.max(1, cellW - placeMargin * 2);
            const usableH = Math.max(1, cellH - placeMargin * 2);
            const n = members.length;
            // Columns matched to the cell's shape, so the grid stays roughly square.
            const gCols = Math.max(1, Math.min(n, Math.round(Math.sqrt(n * (usableW / usableH)))));
            const gRows = Math.ceil(n / gCols);
            const stepX = usableW / gCols;
            const stepY = usableH / gRows;

            members.forEach((member, i) => {
                const gc = i % gCols;
                const gr = Math.floor(i / gCols);
                // Last grid row may be short; centre it.
                const inThisRow = Math.min(gCols, n - gr * gCols);
                const rowInset = (gCols - inThisRow) * stepX / 2;
                targets.set(member.id, {
                    x: clusterX - usableW / 2 + rowInset + (gc + 0.5) * stepX,
                    y: clusterY - usableH / 2 + (gr + 0.5) * stepY
                });
            });
        });

        return targets;
    }

    /**
     * Reflect the current grouping mode in the segmented control.
     *
     * The label no longer flips to "Reset grouping" when a mode is active — that trick
     * existed because two buttons had to double as their own off-switch. The control now
     * has a "none" segment, so each segment can just say what it is and show whether it
     * is the selected one.
     */
    _updateGroupingButtonStates() {
        const segments = this.element?.querySelectorAll?.(".fang-segment[data-grouping]") ?? [];
        for (const segment of segments) {
            const active = segment.dataset.grouping === this._groupingMode;
            segment.classList.toggle("active", active);
            segment.setAttribute("aria-checked", active ? "true" : "false");
            segment.disabled = !game.user.isGM;
        }

        // While a grouping view is on, positions are read-only. Say so where it is
        // decided, instead of only warning after someone tries to drag a token.
        const lockedHint = this.element?.querySelector?.("#groupingLockedHint");
        if (lockedHint) lockedHint.hidden = this._groupingMode === "none";
    }

    /** @deprecated kept so older call sites keep working — use _updateGroupingButtonStates */
    _updateGroupByFactionButtonState() {
        this._updateGroupingButtonStates();
    }

    /**
     * Remember where every node sits before we start pushing them around, so switching
     * grouping off can put the layout back the way the user arranged it.
     * Only taken on the first activation — switching faction <-> zone must keep the
     * original arrangement as the thing we return to.
     */
    _captureLayoutSnapshot() {
        if (this._layoutSnapshot) return;
        this._layoutSnapshot = new Map();
        for (const node of this.graphData.nodes ?? []) {
            if (node?.id) this._layoutSnapshot.set(node.id, { x: node.x, y: node.y });
        }
    }

    /**
     * A node created while the grouping view is on has no entry in the snapshot, so a
     * reset would leave it wherever the clustering forces parked it. Record the spot it
     * was actually dropped at, so reset puts it there.
     * No-op when grouping is off — then the drop position is simply the live position.
     */
    _rememberDropPosition(node) {
        if (!this._layoutSnapshot || !node?.id) return;
        if (this._layoutSnapshot.has(node.id)) return;
        this._layoutSnapshot.set(node.id, { x: node.x, y: node.y });
    }

    /** Put the nodes back where they were before grouping started. */
    _restoreLayoutSnapshot() {
        if (!this._layoutSnapshot) return;
        for (const node of this.graphData.nodes ?? []) {
            const pos = this._layoutSnapshot.get(node.id);
            if (!pos) continue;                 // added while grouping was on — leave it
            node.x = pos.x;
            node.y = pos.y;
            node.vx = 0;                        // no leftover momentum
            node.vy = 0;
            // Pins were released to let the clustering move everyone; put them back on the
            // restored position, not on wherever the pin used to point.
            if (node.pinned) {
                node.fx = pos.x;
                node.fy = pos.y;
            }
        }
        // The simulation holds different node objects than graphData after a rebuild.
        const live = this.simulation?.nodes() ?? [];
        for (const node of live) {
            const pos = this._layoutSnapshot.get(node.id);
            if (!pos) continue;
            node.x = pos.x; node.y = pos.y; node.vx = 0; node.vy = 0;
            if (node.pinned) { node.fx = pos.x; node.fy = pos.y; }
        }
        this._layoutSnapshot = null;
    }

    /**
     * Switch grouping between off, by faction and by zone.
     *
     * Exactly one at a time: a character belongs to a faction *and* sits in a zone, so
     * two clustering forces would pull the same node in different directions. Picking
     * one replaces the other.
     *
     * @param {"none"|"faction"|"zone"} mode
     */
    _setGroupingMode(mode) {
        if (!this.simulation) return;
        // Picking the mode that is already on is a no-op. It used to toggle back to "none",
        // which made sense when two buttons were the only way to switch grouping off —
        // now the segmented control has an explicit "none", and a radio group that
        // unselects itself when you press the selected option would just be confusing.
        if (mode === this._groupingMode) return;

        if (mode === "none") {
            this._restoreLayoutSnapshot();
            this._clusterTargets = null;
            this._groupingMode = "none";
            this._applyAxisForces();
            this.simulation.alpha(0.35).restart();           // settle gently, don't fling
            this._updateGroupingButtonStates();
            ui.notifications.info(this._localize("FANG.Messages.GroupingReset", "Grouping reset — previous layout restored."));
            return;
        }

        const targets = mode === "zone" ? this._buildZoneClusterTargets() : this._buildFactionClusterTargets();
        if (!targets) {
            ui.notifications.warn(mode === "zone"
                ? this._localize("FANG.Messages.ZoneGroupingInsufficient", "Assign characters to at least two zones first.")
                : game.i18n.localize("FANG.Messages.FactionGroupingInsufficient"));
            return;
        }

        this._captureLayoutSnapshot();                        // before the first push only
        // Release pins for the duration of the view: a pinned node ignores the cluster
        // forces entirely and would just sit there while its group forms elsewhere.
        // _restoreLayoutSnapshot puts both the position and the pin back.
        for (const node of this.simulation.nodes()) {
            if (node.pinned) { node.fx = null; node.fy = null; }
        }
        this._clusterTargets = targets;
        this._groupingMode = mode;
        this._applyAxisForces();
        this.simulation.alpha(0.9).restart();
        this._updateGroupingButtonStates();
        const applied = mode === "zone"
            ? this._localize("FANG.Messages.ZoneGroupingApplied", "Grouped by zone.")
            : game.i18n.localize("FANG.Messages.FactionGroupingApplied");
        // Say up front that this is a view, so the locked positions are expected
        // behaviour rather than a surprise.
        ui.notifications.info(`${applied} ${this._localize("FANG.Messages.GroupingIsAView", "This is a view — positions stay locked until you reset it.")}`);
    }

    _onToggleGroupByFaction() {
        this._setGroupingMode("faction");
    }

    _onToggleGroupByZone() {
        this._setGroupingMode("zone");
    }

    initSimulation() {
        const hadSimulation = !!this.simulation;
        const previousAlpha = this.simulation?.alpha() ?? 1;
        if (this.simulation) this.simulation.stop();

        const nodeIds = new Set(this.graphData.nodes.map(n => n.id));
        const links = this.graphData.links
            .map(d => ({
                ...d,
                source: typeof d.source === "object" ? d.source?.id : d.source,
                target: typeof d.target === "object" ? d.target?.id : d.target,
                directional: !!d.directional
            }))
            .filter(d => d.source && d.target && nodeIds.has(d.source) && nodeIds.has(d.target));
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

            // A pinned node was placed by hand. fx/fy are runtime-only (never stored), so
            // they have to be restored from the stored `pinned` flag on every rebuild —
            // otherwise the physics reclaims the node the next time the window opens.
            if (nInfo.pinned) {
                nInfo.fx = nInfo.x;
                nInfo.fy = nInfo.y;
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

        // Graph data changed while grouping is on — recompute the cluster targets.
        // If there is nothing left to group by, fall back to the ungrouped layout.
        if (this._groupingMode !== "none") {
            const refreshedTargets = this._groupingMode === "zone"
                ? this._buildZoneClusterTargets()
                : this._buildFactionClusterTargets();
            if (refreshedTargets) {
                this._clusterTargets = refreshedTargets;
            } else {
                this._restoreLayoutSnapshot();
                this._groupingMode = "none";
                this._clusterTargets = null;
                this._updateGroupingButtonStates();
            }
        }

        const cosmicWindEnabled = game.settings.get("fang", "enableCosmicWind");

        // Link distance and collision radius have to agree, or connected nodes sit in a
        // tug-of-war forever: the link pulls them to its distance, collision shoves them
        // back out to twice its radius, neither ever wins. Measured before this: the link
        // wanted 300px while collision demanded 320px, and 7 of 17 connected pairs sat in
        // that contradiction permanently. That is why the graph never actually settled —
        // alpha reaching its floor only means frozen, the tension is still there, so
        // anything that woke the simulation made the whole layout lurch.
        // Deriving one from the other keeps them consistent at any token size.
        const tokenSize = game.settings.get("fang", "tokenSize");
        const collideRadius = this._getCollideRadius();
        // Link distance follows the *normal* collide radius, not the current one — links
        // only exist in the normal view, and this keeps the two consistent there.
        const linkDistance = Math.max(tokenSize * 4 + 140, (tokenSize + 120) * 2 + 20);

        if (this.simulation) this.simulation.stop();
        // No forceCenter on purpose. It is not a force in the usual sense: it hard-shifts
        // every node each tick so their centre of mass sits dead centre, ignoring alpha
        // entirely. The graph therefore snapped back the instant anything woke the
        // simulation — measured on real data: 606px on a plain alpha(0.05) wake-up vs
        // 186px without it, and 146px just from opening the edit lock. Worse, dragging one
        // node moved the centre of mass, so every *other* node got shoved the opposite way
        // (414px vs 194px). forceX/forceY below already pull towards the middle, softly and
        // scaled by alpha, which is the behaviour we actually want.
        this.simulation = d3.forceSimulation(nodes)
            .force("charge", d3.forceManyBody().strength(-1000))
            .force("link", d3.forceLink(links).id(d => d.id).distance(linkDistance))
            .force("x", d3.forceX(node => this._getNodeTargetX(node)).strength(node => this._getNodeAxisStrength(node)))
            .force("y", d3.forceY(node => this._getNodeTargetY(node)).strength(node => this._getNodeAxisStrength(node)))
            .force("collide", d3.forceCollide().radius(collideRadius))
            .force("link-avoidance", this._createLinkRepulsionForce())
            .on("tick", this.ticked.bind(this));

        // Link strength depends on the mode — full when showing relationships, almost off
        // while grouping so the cluster forces can win.
        this._applyLinkStrength();

        // A fresh forceSimulation starts at full heat (alpha 1) and spends ~300 ticks
        // rearranging everything. That is right the first time, but this method also runs
        // on every render() — opening the edit lock re-renders, and the graph would fly
        // apart for no reason.
        // Carrying the previous alpha over is the point: a settled graph (alpha at the
        // 0.001 floor) is not *balanced*, it is merely frozen — the forces are still under
        // tension. Waking it with any fixed alpha lets it resume rearranging, which is why
        // opening the edit lock shoved every token by 146px. Rebuilding must preserve the
        // motion state, not invent one. Callers that *want* heat set their own alpha after.
        if (hadSimulation) this.simulation.alpha(previousAlpha);

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
        this._updateGroupByFactionButtonState();

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
                    if (this._getLinkEndpointId(link.source) === node.id || this._getLinkEndpointId(link.target) === node.id) continue;

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
                        const isCanonical = this._getLinkEndpointId(link.source) < this._getLinkEndpointId(link.target);
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
        const visibleNodes = this._getVisibleNodesForUser();
        const visibleLinks = (this.graphData.links || [])
            .map((link, index) => ({ link, index }))
            .filter(entry => this._canUserSeeLink(entry.link));

        visibleNodes.forEach(node => {
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
            visibleLinks.forEach(({ link }) => {
                const sId = this._getLinkEndpointId(link.source);
                const tId = this._getLinkEndpointId(link.target);
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
        const factionsById = new Map((this.graphData.factions || []).map(f => [f.id, this._normalizeFaction(f)]));
        const visibleLegendFactions = Array.from(factionsById.values()).filter(f => this._shouldShowFactionInLegendToCurrentUser(f));

        if (isolateSearch) {
            exactNodeMatches.forEach(id => visibleNodeIds.add(id));
            visibleLinks.forEach(({ link, index }) => {
                if (!exactLinkMatches.has(index)) return;
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
        const nodeRadius = game.settings.get("fang", "tokenSize") || 33;

        // --- Draw grouping areas behind links and nodes ---
        // An area is only drawn in the matching grouping view, for both factions and
        // locations.
        //
        // The area is a box around wherever the members currently sit — but the physics
        // does not know about groups, it spreads people by links and repulsion. With
        // scattered members two boxes overlap even when they share no member at all: one
        // person in the corner stretches their group across the whole canvas. The box
        // would claim an order that does not exist outside the view.
        // Inside the grouping view the members are pulled together, so the area around
        // them is honest — and separate groups no longer overlap.
        const gruppenBereiche = this._groupingMode === "zone"
            ? (this.graphData.zones || [])
                .map(z => this._normalizeZone(z))
                .filter(z => game.user?.isGM || z.playerVisible !== false)
                .map(z => ({ gruppe: z, mitglieder: visibleNodes.filter(n => n.zoneId === z.id) }))
            : this._groupingMode === "faction"
                ? (this.graphData.factions || [])
                    .map(f => this._normalizeFaction(f))
                    .filter(f => this._isFactionVisibleToCurrentUser(f))
                    .map(f => ({ gruppe: f, mitglieder: visibleNodes.filter(n => n.factionId === f.id) }))
                : [];

        gruppenBereiche.forEach(({ gruppe, mitglieder }) => {
            if (!mitglieder.length) return;
            const points = mitglieder.map(node => renderPos[node.id]).filter(Boolean);
            if (!points.length) return;
            const pad = Math.max(70, nodeRadius * 2.4);
            let minX = Math.min(...points.map(p => p.x)) - pad;
            let maxX = Math.max(...points.map(p => p.x)) + pad;
            let minY = Math.min(...points.map(p => p.y)) - pad;
            let maxY = Math.max(...points.map(p => p.y)) + pad;
            // Clamp the box to the group's grid cell. A member can drift to the cell edge,
            // but the box stops at the boundary — so two areas can never overlap, whatever
            // the physics does. This is what lets the ring stay wide enough to breathe.
            const cell = this._groupingCells?.get(gruppe.id);
            if (cell) {
                minX = Math.max(minX, cell.x0);
                maxX = Math.min(maxX, cell.x1);
                minY = Math.max(minY, cell.y0);
                maxY = Math.min(maxY, cell.y1);
            }
            if (maxX <= minX || maxY <= minY) return;
            const farbe = gruppe.color || "#d4af37";
            // Hovering a legend row lifts that faction's box out of the rest.
            const gedimmt = this._hoveredFactionId && this._hoveredFactionId !== gruppe.id;
            const betont = this._hoveredFactionId === gruppe.id;

            this.context.save();
            this.context.globalAlpha = gedimmt ? 0.05 : (betont ? 0.26 : 0.16);
            this.context.fillStyle = farbe;
            this.context.strokeStyle = farbe;
            this.context.lineWidth = betont ? 3 : 2;
            this.context.setLineDash([10, 8]);
            this.context.beginPath();
            this.context.roundRect(minX, minY, maxX - minX, maxY - minY, 18);
            this.context.fill();
            this.context.globalAlpha = gedimmt ? 0.18 : (betont ? 0.95 : 0.55);
            this.context.stroke();
            this.context.setLineDash([]);
            this.context.font = `bold ${Math.max(13, nodeRadius / 2.4)}px 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif`;
            this.context.fillStyle = farbe;
            this.context.textAlign = "left";
            this.context.textBaseline = "top";
            this.context.fillText(gruppe.name || "", minX + 14, minY + 10);
            this.context.restore();
        });

        // --- Draw Direct Faction Member Links (Ring Topology + Adaptive Rendering) ---
        // Drawing these FIRST ensures they are UNDERNEATH regular links and nodes
        if (this.graphData.showFactionLines !== false && this.graphData.factions && this.graphData.factions.length > 0) {
            // Build a set of existing regular link pairs for overlap detection
            const regularLinkPairs = new Set();
            visibleLinks.forEach(({ link: l }) => {
                const sId = this._getLinkEndpointId(l.source);
                const tId = this._getLinkEndpointId(l.target);
                regularLinkPairs.add(sId < tId ? `${sId} - ${tId}` : `${tId} - ${sId}`);
            });

            this.graphData.factions.forEach(faction => {
                faction = this._normalizeFaction(faction);
                if (!this._shouldShowFactionLinesToCurrentUser(faction)) return;
                const members = visibleNodes.filter(n => n.factionId === faction.id);
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
                this.context.lineCap = "round";

                // How loud should this faction be?
                //  - hovering its legend row: this one loud, the others almost gone. That is
                //    the point of the legend hover — pick one faction out of the tangle.
                //  - hovering a character: factions it touches stay up, the rest step back.
                //  - otherwise: normal.
                const isolierteFraktion = this._hoveredFactionId;
                let hoverFactor = 1;
                if (isolierteFraktion) {
                    hoverFactor = isolierteFraktion === faction.id ? 1 : 0.12;
                } else if (hoveredNodeId) {
                    const hasRelevantMember = members.some(m => connectedNodeIds.has(m.id));
                    hoverFactor = hasRelevantMember ? 0.9 : 0.15;
                }
                const hervorgehoben = isolierteFraktion === faction.id;

                // A coloured halo under the line lifts it off the background and out from
                // under the relationship lines. Only for the picked faction — on all of them
                // at once it would be the same mush the lines already were.
                if (hervorgehoben) {
                    this.context.shadowColor = faction.color || "#ffffff";
                    this.context.shadowBlur = 14;
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
                        // Adaptive glow: a wider trail behind the existing relationship line.
                        // This is the common case — faction members tend to be related — so it
                        // has to hold its own under a solid line drawn on top of it.
                        this.context.lineWidth = hervorgehoben ? 16 : 11;
                        this.context.globalAlpha = (hervorgehoben ? 0.75 : 0.5) * hoverFactor;
                    } else {
                        // Sharp default: dashed line, on its own against the background.
                        this.context.lineWidth = hervorgehoben ? 4.5 : 3;
                        this.context.globalAlpha = (hervorgehoben ? 1 : 0.9) * hoverFactor;
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
        this.context.lineWidth = 2;
        this.context.strokeStyle = "#888";
        const linkFontSize = Math.max(12, Math.floor(nodeRadius / 2.5));
        this.context.font = `${linkFontSize}px 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif`;
        this.context.textAlign = "center";
        this.context.textBaseline = "middle";

        this._linkCounts = {};
        visibleLinks.forEach(({ link, index }) => {
            const sId = this._getLinkEndpointId(link?.source);
            const tId = this._getLinkEndpointId(link?.target);
            if (!sId || !tId) return;
            const pairKey = sId < tId ? `${sId} - ${tId}` : `${tId} - ${sId}`;

            if (!this._linkCounts[pairKey]) {
                this._linkCounts[pairKey] = { total: 0, links: [] };
            }
            this._linkCounts[pairKey].total++;
            this._linkCounts[pairKey].links.push(index);
            link.pairKey = pairKey;
        });

        const labelsToDraw = [];

        visibleLinks.forEach(({ link, index: i }) => {
            const sIdRaw = this._getLinkEndpointId(link?.source);
            const tIdRaw = this._getLinkEndpointId(link?.target);
            if (!sIdRaw || !tIdRaw) return;
            const pairInfo = this._linkCounts[link.pairKey];
            if (!pairInfo) return;
            const linkIndex = pairInfo.links.indexOf(i);
            const totalParams = pairInfo.total;

            const showLinkInIsolate = exactLinkMatches.has(i)
                || (visibleNodeIds.has(sIdRaw) && visibleNodeIds.has(tIdRaw) && exactNodeMatches.has(sIdRaw) && exactNodeMatches.has(tIdRaw));
            if (isolateSearch && !showLinkInIsolate) return;

            const sPos = renderPos[sIdRaw];
            const tPos = renderPos[tIdRaw];
            if (!sPos || !tPos) return;

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
            const relationshipType = this._getRelationshipType(link.relationshipType);
            const linkColor = relationshipType?.color || "#888";
            this.context.strokeStyle = linkColor;
            if (relationshipType?.dash) {
                this.context.setLineDash(relationshipType.dash.split(",").map(v => Number(v.trim())).filter(v => Number.isFinite(v) && v > 0));
            } else {
                this.context.setLineDash([]);
            }

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
                context.fillStyle = linkColor;
                context.fill();
                context.restore();
            };

            const getNodeBoundOffset = (node, rayAngle) => {
                let R = nodeRadius + 2;
                this.context.font = "bold 15px 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
                const tWidth = Math.max(this.context.measureText(this._getSafeNodeName(node)).width, 40);
                const halfW = (tWidth / 2) + 12;
                const topY = nodeRadius - 10;
                const bottomY = nodeRadius + (!this._isNodeHiddenForUser(node) && node.role ? 42 : 28);

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
                const isCanonical = this._getLinkEndpointId(link.source) < this._getLinkEndpointId(link.target);
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
            this.context.setLineDash([]);

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
        const drawUnknownContactIcon = (context, x, y, size) => {
            const scale = size / 32;

            context.save();
            context.fillStyle = "rgba(232, 224, 212, 0.94)";

            // Anonymous contact silhouette: head plus shoulders.
            context.beginPath();
            context.arc(x - 4 * scale, y - 6 * scale, 6 * scale, 0, Math.PI * 2);
            context.fill();

            context.beginPath();
            context.moveTo(x - 17 * scale, y + 13 * scale);
            context.bezierCurveTo(x - 14 * scale, y + 3 * scale, x - 8 * scale, y + 1 * scale, x - 4 * scale, y + 1 * scale);
            context.bezierCurveTo(x + 5 * scale, y + 1 * scale, x + 11 * scale, y + 5 * scale, x + 13 * scale, y + 14 * scale);
            context.closePath();
            context.fill();

            // Question mark on top makes the token read as an unknown person, not just hidden.
            context.font = `900 ${Math.max(9, size * 0.55)}px "Signika", "Palatino Linotype", serif`;
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.lineWidth = Math.max(1.5, 2 * scale);
            context.strokeStyle = "rgba(10, 12, 18, 0.95)";
            context.fillStyle = "rgba(255, 244, 203, 0.98)";
            context.strokeText("?", x + 9 * scale, y - 5 * scale);
            context.fillText("?", x + 9 * scale, y - 5 * scale);

            context.restore();
        };

        visibleNodes.forEach(node => {
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
            const faction = node.factionId ? factionsById.get(node.factionId) : null;
            const visibleFaction = this._isFactionVisibleToCurrentUser(faction) ? faction : null;

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

            // QuickConnect source marker: keep the workflow visible without notification spam.
            if (this._quickConnectMode && this._quickConnectSourceId === node.id) {
                this.context.beginPath();
                this.context.arc(pos.x, pos.y, radius + 12, 0, Math.PI * 2);
                this.context.strokeStyle = "rgba(36, 83, 143, 0.95)";
                this.context.lineWidth = 4;
                this.context.setLineDash([8, 5]);
                this.context.shadowBlur = 16;
                this.context.shadowColor = "rgba(36, 83, 143, 0.65)";
                this.context.stroke();
                this.context.setLineDash([]);
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
                // Clip the portrait to a circle. Everything drawn around a token is round —
                // the centre aura, the search ring, the faction ring, the hidden overlay —
                // but portraits are whatever the actor happens to use, and a square one
                // pokes its corners out from under every one of those rings.
                this.context.save();
                this.context.beginPath();
                this.context.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
                this.context.clip();
                this.context.drawImage(node.imgElement, pos.x - radius, pos.y - radius, radius * 2, radius * 2);
                this.context.restore();
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

            // --- Faction tint on the token ring ---
            // Faction lines are the primary display; this tints the ring in the faction
            // colour as a second, quieter cue so membership stays readable when the lines
            // get lost among the relationships. Tied to the same toggle as the lines, so
            // "faction display off" really means off.
            // Sits just inside the portrait edge: everything else drawn around a token is
            // a circle, and the outward radii are taken — the centre aura owns radius+2,
            // the search ring radius+8, the QuickConnect marker radius+12.
            // globalAlpha is inherited on purpose. It already encodes focus and the
            // "missing" condition; overriding it here made faded-out characters light up.
            if (visibleFaction && !isHidden && this.graphData.showFactionLines !== false) {
                this.context.save();
                this.context.beginPath();
                this.context.arc(pos.x, pos.y, Math.max(2, radius - 2), 0, Math.PI * 2);
                this.context.lineWidth = 3;
                this.context.strokeStyle = visibleFaction.color || "#d4af37";
                this.context.stroke();
                this.context.restore();
            }

            // --- Pin marker ---
            // A pinned character sits still while everything else drifts. Without a mark
            // that reads as a bug rather than a decision. Upper right, outside the faction
            // ring, GM-side only — players never place anyone.
            //
            // Drawn as a thumbtack seen from the side, not a dot: a dot says "there is
            // something here" and nothing more — the first person to see one asked what it
            // meant, which is the whole answer on whether a dot was enough. Drawn rather
            // than typed as an icon glyph, because that would depend on the icon font being
            // loaded and canvas-ready, which is not guaranteed.
            if (node.pinned && !isHidden && game.user.isGM) {
                const px = pos.x + radius * 0.72, py = pos.y - radius * 0.72;
                const gold = "rgba(212, 175, 55, 0.95)";
                this.context.save();

                // Dark disc so the tack reads on any portrait.
                this.context.beginPath();
                this.context.arc(px, py, 8, 0, Math.PI * 2);
                this.context.fillStyle = "rgba(24, 28, 38, 0.92)";
                this.context.fill();
                this.context.lineWidth = 1.2;
                this.context.strokeStyle = "rgba(212, 175, 55, 0.55)";
                this.context.stroke();

                this.context.translate(px, py);
                this.context.rotate(-Math.PI / 8);   // slight tilt, like a real tack
                this.context.strokeStyle = gold;
                this.context.fillStyle = gold;
                this.context.lineCap = "round";

                // Head (the flat disc you press)
                this.context.beginPath();
                this.context.lineWidth = 2.6;
                this.context.moveTo(-3.2, -3.4);
                this.context.lineTo(3.2, -3.4);
                this.context.stroke();
                // Shaft
                this.context.beginPath();
                this.context.lineWidth = 1.6;
                this.context.moveTo(0, -3.4);
                this.context.lineTo(0, 1.2);
                this.context.stroke();
                // Point
                this.context.beginPath();
                this.context.moveTo(-1.5, 1.2);
                this.context.lineTo(1.5, 1.2);
                this.context.lineTo(0, 4.2);
                this.context.closePath();
                this.context.fill();

                this.context.restore();
            }

            // Soft dark overlay for hidden tokens (obscure but keep silhouette)
            if (isHidden) {
                this.context.beginPath();
                this.context.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
                this.context.fillStyle = "rgba(10, 12, 18, 0.72)";
                this.context.fill();
                this.context.lineWidth = 2;
                this.context.strokeStyle = "rgba(212, 175, 55, 0.55)";
                this.context.stroke();
                drawUnknownContactIcon(this.context, pos.x, pos.y, Math.max(28, radius * 1.05));
            }

            // --- Faction Icon (Top-Left corner) ---
            if (visibleFaction && visibleFaction.icon && !isHidden) {
                if (!this._iconCache) this._iconCache = {};
                let img = this._iconCache[visibleFaction.icon];
                if (!img) {
                    img = new Image();
                    img.src = visibleFaction.icon;
                    this._iconCache[visibleFaction.icon] = img;
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

                drawUnknownContactIcon(this.context, hbx, hby, 14);
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
        if (this.graphData.showFactionLegend !== false && visibleLegendFactions.length > 0) {
            this.context.save();
            const padding = 10;
            const itemHeight = 30;
            const iconSize = 20;
            const legendWidth = 180;
            const legendHeight = (visibleLegendFactions.length * itemHeight) + (padding * 2);

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

            // Remember where each entry sits so the hover handler can hit-test it. The
            // legend is drawn after restore(), i.e. in screen coordinates, so these are
            // directly comparable to mouse position — no transform maths needed.
            this._legendHitAreas = [];

            visibleLegendFactions.forEach((f, i) => {
                const itemY = startY + padding + (i * itemHeight) + (itemHeight / 2);
                this._legendHitAreas.push({
                    id: f.id,
                    x: startX, y: itemY - itemHeight / 2,
                    w: legendWidth, h: itemHeight
                });

                const istGehovert = this._hoveredFactionId === f.id;
                if (istGehovert) {
                    // Mark the row so it is obvious which faction the graph is highlighting.
                    this.context.save();
                    this.context.beginPath();
                    this.context.roundRect(startX + 3, itemY - itemHeight / 2 + 2, legendWidth - 6, itemHeight - 4, 5);
                    this.context.fillStyle = f.color || "#d4af37";
                    this.context.globalAlpha = 0.28;
                    this.context.fill();
                    this.context.globalAlpha = 0.9;
                    this.context.lineWidth = 1;
                    this.context.strokeStyle = f.color || "#d4af37";
                    this.context.stroke();
                    this.context.restore();
                }

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
        } else {
            this._legendHitAreas = [];
        }
    }

    /**
     * Which legend row is the pointer over? Screen coordinates, see _legendHitAreas.
     * @returns {string|null} faction id, or null
     */
    _factionAtLegendPoint(screenX, screenY) {
        for (const area of this._legendHitAreas ?? []) {
            if (screenX >= area.x && screenX <= area.x + area.w &&
                screenY >= area.y && screenY <= area.y + area.h) return area.id;
        }
        return null;
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

    /**
     * While grouping is on, node positions are off limits.
     *
     * There is exactly one set of positions — the one in the database. Grouping only
     * borrows it for a look and gives it back on reset. If dragging were allowed, the
     * dragged node would carry its *cluster* position into the saved layout and the
     * original arrangement would be gone for good.
     *
     * Only node dragging is blocked; panning and zooming stay available.
     */
    _isNodeDragBlocked() {
        return this._groupingMode !== "none";
    }

    dragstarted(event) {
        if (!this._canEditGraph(true)) return;
        if (event.subject.type === 'node' && this._isNodeDragBlocked()) {
            ui.notifications.info(this._localize("FANG.Messages.GroupingPositionsLocked", "Grouping view — positions are locked. Reset grouping to move characters."));
            return;
        }
        if (!event.active) this.simulation.alphaTarget(0.3).restart();
        if (event.subject.type === 'node') {
            event.subject.data.fx = event.subject.data.x;
            event.subject.data.fy = event.subject.data.y;
            // Immediate selection in sidebar when grabbing a node
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
            if (this._isNodeDragBlocked()) return; // Grouping view: positions are read-only
            // Invert coordinates to account for zoom/pan
            event.subject.data.fx = this.transform.invertX(event.x);
            event.subject.data.fy = this.transform.invertY(event.y);
            this._hasDragged = true;
        }
    }

    dragended(event) {
        if (!this._canEditGraph(true)) return; // Silent at end
        // Grouping view: nothing was moved, so there is nothing to store. Saving here
        // would write cluster positions into the one real layout.
        if (event.subject.type === 'node' && this._isNodeDragBlocked()) return;
        if (!event.active) this.simulation.alphaTarget(0);
        if (event.subject.type === 'node') {
            // Keep the node where it was dropped instead of releasing it back to the forces.
            // Placing someone is a statement — you put the family together on purpose — and
            // the physics cannot honour that: the relationship links pull a released node
            // straight back. Measured: dropped 300px away, it settled 214px off target.
            // Pinned it stays exactly put. "Position freigeben" in the right-click menu
            // hands it back to the simulation.
            if (this._hasDragged) {
                event.subject.data.fx = event.subject.data.x;
                event.subject.data.fy = event.subject.data.y;
                event.subject.data.pinned = true;
            } else {
                event.subject.data.fx = null;
                event.subject.data.fy = null;
            }
            // Remember that *we* placed this node. Only dragged nodes are allowed to
            // write their position during a merge — everything else the simulation
            // moved is drift, not intent, and must not overwrite other clients.
            if (event.subject.data.id && this._hasDragged) {
                (this._draggedNodeIds ??= new Set()).add(event.subject.data.id);
            }
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
        // Centering is a view-only operation â€” no edit lock required
        if (!this.canvas || !this.zoom || !this.graphData.nodes.length) return;

        const padding = 60;
        const width = isMonitor ? window.innerWidth : this.width;
        const height = isMonitor ? window.innerHeight : this.height;
        const sidebar = this.element ? this.element.querySelector(".sidebar") : null;
        const sidebarWidth = (sidebar && sidebar.style.display !== "none") ? sidebar.getBoundingClientRect().width : 0;
        const actualWidth = Math.max(100, width - sidebarWidth);

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

        // Legend first: it sits on top of the canvas in screen space, so a pointer over it
        // is over the legend, not over whatever node happens to be underneath.
        const legendFaction = this._factionAtLegendPoint(mouseX, mouseY);
        if (legendFaction !== this._hoveredFactionId) {
            this._hoveredFactionId = legendFaction;
            this.ticked();
        }
        if (legendFaction) {
            this.canvas.style.cursor = "pointer";
            return;
        }

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

        // _hoverLoreTooltipEnabled is initialised to false and never set to true anywhere —
        // hover lore was switched off long ago and reading lore moved to the context menu
        // (right-click → Info). The tooltip machinery below is therefore dormant, but it is
        // still the only place that can explain the pin marker, so the pin note is allowed
        // through while lore stays off.
        const nurPinHinweis = !this._hoverLoreTooltipEnabled;
        if (nurPinHinweis && !(hoveredNode?.pinned && game.user.isGM)) {
            if (this._hoverTimeout) {
                clearTimeout(this._hoverTimeout);
                this._hoverTimeout = null;
            }
            // Track who we are over even when we have nothing to show. The logic below only
            // starts its timer when the hovered node *changes*, so leaving this stale means
            // moving from a node we skipped onto one we want to show reads as "no change"
            // and never fires.
            this._hoveredNodeId = hoveredNode ? hoveredNode.id : null;
            this._tooltipVisibleForNode = null;
            tooltip.classList.add("hidden");
            this.canvas.style.cursor = hoveredNode ? "pointer" : "grab";
            return;
        }

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
                            const isCanonical = this._getLinkEndpointId(link.source) < this._getLinkEndpointId(link.target);
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

            // Start the timer if there is anything to say: lore, or — for the GM — the fact
            // that this character is pinned. Without the pin case a pinned character with no
            // lore would show the marker and never explain it.
            const hatPinHinweis = hoveredNode?.pinned && game.user.isGM;
            if (hoveredNode && (hoveredNode.lore || hoveredNode.playerLorePageId || hatPinHinweis)) {
                // Protection: Don't show lore tooltip to players for hidden or
                // GM-only tokens. _canUserSeeNode already filters gmOnly nodes from
                // the render, but a stale hover reference could still slip through —
                // belt-and-suspenders.
                const canSeeLore = game.user.isGM || (!hoveredNode.hidden && !hoveredNode.gmOnly);
                if (!canSeeLore) return;

                this._hoverTimeout = setTimeout(async () => {
                    const currentNodeId = hoveredNode.id;
                    let tooltipHtml = "";

                    // Lore only when lore tooltips are actually on — otherwise this tooltip
                    // exists solely to explain the pin, and must not leak lore that the
                    // switch says to keep out of hover.
                    if (nurPinHinweis) {
                        // no lore
                    } else if (hoveredNode.playerLorePageId) {
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

                    // Say what the pin means, in words. The marker alone only tells you
                    // that *something* is true about this character — the first person to
                    // see one asked what it was.
                    if (hoveredNode.pinned && game.user.isGM) {
                        tooltipHtml += `<p class="fang-tooltip-pin"><i class="fas fa-thumbtack"></i> ${
                            this._localize("FANG.UI.PinnedHint", "Position held. Right-click → Release position.")}</p>`;
                    }

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
                        const isCanonical = this._getLinkEndpointId(link.source) < this._getLinkEndpointId(link.target);
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
                originalName: n.originalName || n.name,
                isCenter: n.isCenter || false,
                lore: n.lore || "",
                playerLorePageId: n.playerLorePageId || null,
                journalUuid: n.journalUuid || null,
                questUuids: (n.questUuids || []).map(q => ({ uuid: q.uuid, name: q.name, visibleToPlayers: q.visibleToPlayers !== false, status: q.status || "open" })),
                hidden: n.hidden || false,
                gmOnly: n.gmOnly === true,
                secretKind: n.secretKind || "",
                displayName: n.displayName || "",
                playerNotes: n.playerNotes || "",
                showHiddenQuestsToPlayers: n.showHiddenQuestsToPlayers !== false,
                conditions: n.conditions || [],
                factionId: n.factionId || null,
                zoneId: n.zoneId || null,
                role: n.role || "",
                x: n.x,
                y: n.y,
                vx: n.vx || 0,
                vy: n.vy || 0
            })),
            links: this.graphData.links
                .map(l => ({
                    source: typeof l.source === "object" ? l.source?.id : l.source,
                    target: typeof l.target === "object" ? l.target?.id : l.target,
                    label: l.label,
                    directional: !!l.directional,
                    gmOnly: l.gmOnly === true,
                    relationshipType: l.relationshipType || "",
                    questStatus: l.questStatus || ""
                }))
                .filter(l => l.source && l.target),
            factions: this.graphData.factions.map(f => ({
                id: f.id,
                name: f.name,
                icon: f.icon,
                color: f.color,
                description: f.description || "",
                playerVisible: f.playerVisible !== false,
                showInLegendForPlayers: f.showInLegendForPlayers !== false,
                showLinesForPlayers: f.showLinesForPlayers !== false,
                x: f.x,
                y: f.y,
                externalSource: f.externalSource ? foundry.utils.duplicate(f.externalSource) : null,
                externalMeta: f.externalMeta ? foundry.utils.duplicate(f.externalMeta) : null
            })),
            zones: (this.graphData.zones || []).map(z => this._normalizeZone(z)),
            relationshipTypes: (this.graphData.relationshipTypes || this._getDefaultRelationshipTypes()).map(t => this._normalizeRelationshipType(t)),
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
            this._openDialog({
                title: game.i18n.localize("FANG.UI.Import"),
                content: `<p>${game.i18n.localize("FANG.Messages.ConfirmImport")}</p>`,
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
                close: () => resolve(false),
            classes: ["dialog", "fang-dialog"]
        });
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
                importedData.factions = importedData.factions.map(f => this._normalizeFaction(f));
                importedData.zones = Array.isArray(importedData.zones) ? importedData.zones.map(z => this._normalizeZone(z)) : [];
                importedData.relationshipTypes = Array.isArray(importedData.relationshipTypes) ? importedData.relationshipTypes.map(t => this._normalizeRelationshipType(t)) : this._getDefaultRelationshipTypes();
                if (importedData.showFactionLines === undefined) importedData.showFactionLines = true;
                if (importedData.showFactionLegend === undefined) importedData.showFactionLegend = true;
                importedData.nodes = importedData.nodes.map(node => ({
                    actorId: null,
                    isPlaceholder: false,
                    placeholderType: null,
                    img: null,
                    gmOnly: false,
                    secretKind: "",
                    zoneId: null,
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

        if (!this._canUseGraphAction("spotlightLink", link)) {
            ui.notifications.warn(game.i18n.localize("FANG.Messages.SpotlightHiddenBlocked") || "Reveal the characters first before using Spotlight!");
            return;
        }

        const payload = this._buildEdgeSpotlightPayload(link);
        if (!payload) return;

        game.socket.emit("module.fang", {
            action: "spotlightEdgeStart",
            payload
        });

        this.startEdgeSpotlight(payload);
    }

    _buildEdgeSpotlightPayload(link) {
        if (!this._canUserSeeLink(link)) return null;
        const sourceNode = link.source;
        const targetNode = link.target;
        const sourceImg = this._isNodeHiddenForUser(sourceNode)
            ? FANG_DEFAULT_PLACEHOLDER_IMG
            : this._getNodeImageSource(sourceNode) || sourceNode.imgElement?.src || "icons/svg/mystery-man.svg";
        const targetImg = this._isNodeHiddenForUser(targetNode)
            ? FANG_DEFAULT_PLACEHOLDER_IMG
            : this._getNodeImageSource(targetNode) || targetNode.imgElement?.src || "icons/svg/mystery-man.svg";

        return {
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
        };
    }

    startEdgeSpotlight(payload, options = {}) {
        if (!payload) return;
        const notify = options.notify !== false;
        if (this._spotlightTimeout) clearTimeout(this._spotlightTimeout);
        this._isSpotlightActive = true;
        this._playSpotlightSound();

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

        if (notify) ui.notifications.info(game.i18n.localize("FANG.Messages.SpotlightStarted").replace("{actor}", payload.label));
    }

    async _buildNodeSpotlightPayload(node, { forceAsPlayer = false } = {}) {
        if (!this._canUserSeeNode(node)) return null;
        // Spotlight payload travels via socket to every connected player. When the GM
        // broadcasts a spotlight, pass forceAsPlayer:true so the payload is composed
        // from the player perspective — same fields, same hidden/alias handling. The
        // GM then sees the player-safe overlay too (consistent across the table).
        // Private GM context belongs in the lore editor, not the spotlight.
        const hiddenForUser = forceAsPlayer ? !!(node.hidden) : this._isNodeHiddenForUser(node);
        const escapeHtml = foundry.utils.escapeHTML ?? ((value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        }[char])));
        const formatPlayerNotes = (notes) => String(notes || "")
            .trim()
            .split(/\n{2,}/)
            .map(paragraph => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
            .join("");

        const imgSrc = hiddenForUser ? FANG_DEFAULT_PLACEHOLDER_IMG : this._getNodeImageSource(node);
        const role = hiddenForUser ? "" : node.role || "";
        const factionObj = hiddenForUser ? null : this.graphData.factions.find(f => f.id === node.factionId);
        const faction = factionObj?.playerVisible !== false ? factionObj?.name || "" : "";
        const subtitle = [role, faction].filter(s => s).join(" - ");

        let loreText = hiddenForUser ? formatPlayerNotes(node.playerNotes) : node.lore || "";
        if (node.playerLorePageId) {
            try {
                const entry = await this.getJournalEntry();
                if (entry) {
                    const page = entry.pages.get(node.playerLorePageId);
                    if (page && page.text && page.text.content) {
                        loreText = hiddenForUser && node.playerNotes
                            ? `${page.text.content}<hr>${formatPlayerNotes(node.playerNotes)}`
                            : page.text.content;
                    }
                }
            } catch (e) {
                console.error("FANG | Error loading Spotlight Journal Page", e);
            }
        }

        return {
            nodeId: node.id,
            name: this._getSafeNodeName(node),
            subtitle: subtitle,
            lore: loreText,
            portrait: imgSrc,
            quests: this._getNodeQuestsForCurrentUser(node)
        };
    }

    async _openLocalNodeInfo(node) {
        if (!node || !this._canUseGraphAction("viewNode", node)) return;
        const payload = await this._buildNodeSpotlightPayload(node);
        this.startSpotlight(payload, { broadcastQuests: false, notify: false });
    }

    async _onSpotlight(node) {
        if (!node || !this._canUseGraphAction("spotlightNode", node)) return;
        // Spotlight can be used by anyone who can right-click (no lock required).
        // Always build the payload from the player perspective — see comment on
        // _buildNodeSpotlightPayload. This prevents any GM-only fields (e.g. private
        // notes in node.lore) from being shipped to players via the socket.
        const payload = await this._buildNodeSpotlightPayload(node, { forceAsPlayer: true });
        if (!payload) return;

        game.socket.emit("module.fang", {
            action: "spotlightStart",
            payload
        });

        this.startSpotlight(payload);
    }

    /**
     * Play the configured spotlight sting.
     *
     * Local playback only: every spotlight is already broadcast to all clients, so each
     * one calls this for itself. Routing the audio through Foundry's socket as well
     * would play it twice for everyone.
     * Silent by default (no sound configured) and never fatal — a missing file must not
     * take the spotlight down with it.
     */
    _playSpotlightSound() {
        try {
            const src = game.settings.get("fang", "spotlightSound");
            if (!src) return;
            const volume = Number(game.settings.get("fang", "spotlightSoundVolume") ?? 0.6);
            if (!(volume > 0)) return;
            foundry.audio.AudioHelper.play({ src, volume, autoplay: true, loop: false }, false);
        } catch (err) {
            console.warn("FANG | Could not play spotlight sound.", err);
        }
    }

    startSpotlight(payload, options = {}) {
        if (!payload) return;
        const broadcastQuests = options.broadcastQuests !== false;
        const notify = options.notify !== false;

        if (this._spotlightTimeout) clearTimeout(this._spotlightTimeout);
        this._isSpotlightActive = true;
        this._playSpotlightSound();

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
                                const opened = await this._openJournalDocument(uuid);
                                if (!opened) ui.notifications.warn("Quest Journal not found or permissions missing.");
                            }, 500);
                        });

                        item.addEventListener("mouseup", (e) => {
                            if (e.button !== 0) return;
                            if (clickTimer) {
                                clearTimeout(clickTimer);
                                clickTimer = null;
                                // Short Click: keep quests local when the parent node info was opened locally.
                                this._onQuestSpotlight(uuid, { broadcast: broadcastQuests });
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

        if (notify) ui.notifications.info(game.i18n.localize("FANG.Messages.SpotlightStarted").replace("{actor}", payload.name));
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

    async _getQuestSpotlightPayload(questUuid) {
        const doc = await this._resolveJournalDocument(questUuid);
        if (!doc) return null;

        const title = this._getJournalDocumentTitle(doc);
        let content = this._getJournalDocumentTextContent(doc);

        if (!content) content = "...";

        return {
            uuid: questUuid,
            name: title,
            content: content
        };
    }

    async _onQuestSpotlight(questUuid, { broadcast = true } = {}) {
        try {
            const payload = await this._getQuestSpotlightPayload(questUuid);
            if (!payload) return;

            if (broadcast) {
                game.socket.emit("module.fang", {
                    action: "questSpotlightStart",
                    payload: payload
                });
            }

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
            this._playSpotlightSound();
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
                game.socket.emit("module.fang", { action: "lockStatusUpdate" });
                this.render();
            } else {
                game.socket.emit("module.fang", { action: "requestReleaseLock", payload: { userId: game.user.id } });
            }
        } else {
            // Take the lock
            if (game.user.isGM) {
                // Edit-Lock-Race protection: if someone else holds the lock,
                // ask for confirmation before stomping. Re-fetch the flag to minimise race window.
                const freshLock = entry.getFlag("fang", "editLock");
                if (freshLock && freshLock.userId !== game.user.id) {
                    const otherName = freshLock.userName || this._localize("FANG.Messages.OtherUser", "another user");
                    const confirmMsg = this._localize("FANG.Messages.LockStompConfirm", "{user} is currently editing. Take over anyway?").replace("{user}", otherName);
                    const result = await this._openCanvasPrompt({
                        title: this._localize("FANG.Messages.LockStompTitle", "Take over edit lock?"),
                        icon: "fa-lock",
                        body: confirmMsg,
                        actions: [
                            { id: "yes", label: this._localize("FANG.Dialogs.BtnYes", "Yes"), icon: "fa-check", className: "primary" },
                            { id: "no",  label: this._localize("FANG.Dialogs.BtnNo",  "No"),  icon: "fa-times" }
                        ]
                    });
                    if (result !== "yes") return;
                }
                // Editing always happens on the real layout, never on a temporary grouped
                // view. The grouped positions are locked and not the true ones, so editing
                // there would be editing a picture. Taking the edit lock snaps the view back
                // to normal first (_setGroupingMode shows its own "grouping reset" notice).
                if (this._groupingMode !== "none") this._setGroupingMode("none");
                await entry.setFlag("fang", "editLock", {
                    userId: game.user.id,
                    userName: game.user.name,
                    time: Date.now()
                });
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

        game.socket.emit("module.fang", { action: "lockStatusUpdate" });
        this.render();
    }

    _setButtonTooltip(button, text) {
        if (!button) return;
        button.title = text;
        button.setAttribute("data-tooltip", text);
        button.setAttribute("aria-label", text);
    }

    _getLockDisplayName(lock) {
        if (!lock) return game.i18n.localize("FANG.Dropdowns.Unknown");
        const user = game.users?.get?.(lock.userId);
        const character = user?.character;
        if (character) {
            const node = this.graphData?.nodes?.find(n => n.actorId === character.id || n.id === character.id);
            if (node) return this._getSafeNodeName(node);
            if (character.name) return character.name;
        }
        return lock.userName || user?.name || game.i18n.localize("FANG.Dropdowns.Unknown");
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
        const canvasEditTools = this.element.querySelector("#fang-canvas-edit-tools");

        if (!banner || !lockText || !btnToggleLock) return;

        // Collaborative mode: there is no lock to show. Everyone who may edit, edits;
        // the merge sorts out who changed what. Show who else is in the graph instead.
        if (this._isCollaborativeMode()) {
            banner.classList.remove("no-editor", "i-am-editor", "someone-else-editing", "hidden");
            banner.classList.add("collaborative");
            btnToggleLock.classList.add("hidden");
            btnForce?.classList.add("hidden");
            canvasIndicator?.classList.add("hidden");
            sidebar?.classList.remove("sidebar-locked");
            canvasEditTools?.classList.remove("hidden");
            if (bannerIcon) bannerIcon.className = "fas fa-users";

            const others = game.users.filter(u => u.active && u.id !== game.user.id && (u.isGM || game.settings.get("fang", "allowPlayerEditing")));
            lockText.textContent = others.length
                ? this._localize("FANG.UI.CollaborativeWith", "Collaborative editing — also here: {users}")
                      .replace("{users}", others.map(u => u.name).join(", "))
                : this._localize("FANG.UI.CollaborativeAlone", "Collaborative editing");
            return;
        }

        // Reset classes and visibility
        banner.classList.remove("no-editor", "i-am-editor", "someone-else-editing", "collaborative");
        banner.classList.add("hidden"); // Default hidden for GM
        sidebar?.classList.remove("sidebar-locked");


        if (btnForce) btnForce.classList.add("hidden");
        if (canvasIndicator) canvasIndicator.classList.add("hidden");
        if (canvasEditTools) canvasEditTools.classList.add("hidden");
        if (bannerIcon) bannerIcon.className = "fas fa-lock-open";
        this._setButtonTooltip(btnToggleLock, game.i18n.localize("FANG.UI.EditMode"));
        this._setButtonTooltip(btnForce, game.i18n.localize("FANG.UI.ForceRelease"));

        if (!lock) {
            this._quickConnectMode = false;
            this._quickConnectSourceId = null;
            this._updateQuickConnectButtonState();
            // NO ACTIVE LOCK - Everyone is blocked for editing by default
            banner.classList.add("no-editor");
            lockText.textContent = game.i18n.localize("FANG.UI.NoEditor");
            btnText.textContent = game.i18n.localize("FANG.UI.EditMode");
            btnIcon.className = "fas fa-pen-to-square";
            btnToggleLock.classList.remove("active");
            this._setButtonTooltip(btnToggleLock, game.i18n.localize("FANG.UI.EditMode"));


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
            const lockUser = this._getLockDisplayName(lock);

            if (iAmEditor) {
                // I AM THE EDITOR
                banner.classList.remove("hidden");
                banner.classList.add("i-am-editor");
                lockText.textContent = lockUser;
                btnText.textContent = game.i18n.localize("FANG.UI.ReleaseLock");
                btnIcon.className = "fas fa-lock-open";
                btnToggleLock.classList.add("active");
                btnToggleLock.style.display = "flex";
                this._setButtonTooltip(btnToggleLock, game.i18n.localize("FANG.UI.ReleaseLock"));
                if (bannerIcon) bannerIcon.className = "fas fa-lock";
                if (canvasEditTools) canvasEditTools.classList.remove("hidden");
            } else {
                this._quickConnectMode = false;
                this._quickConnectSourceId = null;
                this._updateQuickConnectButtonState();
                // SOMEONE ELSE IS EDITING
                banner.classList.remove("hidden");
                banner.classList.add("someone-else-editing");
                lockText.textContent = game.i18n.format("FANG.UI.CurrentlyEditing", { user: lockUser });
                btnToggleLock.style.display = "none";
                if (bannerIcon) bannerIcon.className = "fas fa-lock";

                if (game.user.isGM) {
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
