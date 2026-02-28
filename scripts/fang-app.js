const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

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
    }

    async _prepareContext(options) {
        return {
            ...await super._prepareContext(options)
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

        // Re-initialize D3 and Canvas context on every render
        this._initD3();
        this._populateActors();

        // Manage ResizeObserver
        if (this._resizeObserver) this._resizeObserver.disconnect();
        const canvasContainer = this.element.querySelector(".canvas-container");
        this._resizeObserver = new ResizeObserver(() => this.resizeCanvas());
        this._resizeObserver.observe(canvasContainer);

        // Re-attach Event Listeners (Universal)
        this.element.querySelector("#btnAddLink").addEventListener("click", this._onAddLink.bind(this));
        const btnDelete = this.element.querySelector("#btnDeleteElement");
        if (btnDelete) btnDelete.addEventListener("click", this._onDeleteElement.bind(this));
        const btnUpdateLink = this.element.querySelector("#btnUpdateLink");
        if (btnUpdateLink) btnUpdateLink.addEventListener("click", this._onUpdateLink.bind(this));
        const btnToggleCenter = this.element.querySelector("#btnToggleCenter");
        if (btnToggleCenter) btnToggleCenter.addEventListener("click", this._onToggleCenterNode.bind(this));
        const btnManageFactions = this.element.querySelector("#btnManageFactions");
        if (btnManageFactions) btnManageFactions.addEventListener("click", this._onManageFactions.bind(this));

        const canvas = this.element.querySelector("#graphCanvas");
        canvas.addEventListener("click", this._onCanvasClick.bind(this));
        canvas.addEventListener("dblclick", this._onCanvasDoubleClick.bind(this));
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
                const [type, id] = val.split("|");
                this._syncSidebarSelection(type, id);
            });
        }

        // Fullscreen and Sidebar hide for players
        if (!game.user.isGM) {
            const sidebar = this.element.querySelector(".sidebar");
            const allowPlayerEdit = game.settings.get("fang", "allowPlayerEditing");
            const isGMOnline = game.users.some(u => u.isGM && u.active);
            if (sidebar) {
                sidebar.style.display = (allowPlayerEdit && isGMOnline) ? "flex" : "none";
                const gmControls = sidebar.querySelectorAll(".gm-only");
                gmControls.forEach(el => el.style.display = "none");
            }
            if (game.user.name.toLowerCase().includes("monitor")) {
                this.element.classList.add("fang-fullscreen-player");
                this.element.style.setProperty("display", "flex", "important");
                this.element.style.setProperty("visibility", "visible", "important");
                this.element.style.setProperty("opacity", "1", "important");
            }
            setTimeout(() => this.resizeCanvas(), 50);
        } else {
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
            });

            const cbAllowPlayerEdit = this.element.querySelector("#cbAllowPlayerEdit");
            if (cbAllowPlayerEdit) {
                cbAllowPlayerEdit.checked = game.settings.get("fang", "allowPlayerEditing");
                cbAllowPlayerEdit.addEventListener("change", async (e) => {
                    await game.settings.set("fang", "allowPlayerEditing", e.target.checked);
                    ui.notifications.info(game.i18n.localize(e.target.checked ? "FANG.Messages.PlayersCanEdit" : "FANG.Messages.PlayersCannotEdit"));
                });
            }
        }
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
                entry = await JournalEntry.create({
                    name: "FANG Graph",
                    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER }
                });

                await JournalEntryPage.create({
                    name: game.i18n.localize("FANG.Journal.Title"),
                    type: "text",
                    text: {
                        content: `
                        <h2>${game.i18n.localize("FANG.Journal.Header")}</h2>
                        <p>${game.i18n.localize("FANG.Journal.Desc1")}</p>
                        <p><strong>${game.i18n.localize("FANG.Journal.Desc2")}</strong></p>
                        <hr>
                        <div style="text-align: center; margin-top: 20px;">
                            <a class="content-link fang-open-btn" style="cursor: pointer; font-size: 1.2em; padding: 10px; background: #8b0000; color: white; border: 1px solid #d4af37; border-radius: 5px; display: inline-block;">
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
    }

    async saveData(triggerSync = true) {
        const entry = await this.getJournalEntry();

        // Prepare the exportable state
        const exportData = {
            nodes: this.graphData.nodes.map(n => ({
                id: n.id,
                name: n.name,
                role: n.role,
                factionId: n.factionId || null,
                x: n.x,
                y: n.y,
                vx: n.vx,
                vy: n.vy,
                isCenter: n.isCenter || false,
                lore: n.lore || ""
            })),
            links: this.graphData.links.map(l => ({
                source: typeof l.source === 'object' ? l.source.id : l.source,
                target: typeof l.target === 'object' ? l.target.id : l.target,
                label: l.label,
                directional: l.directional || false
            })),
            factions: this.graphData.factions.map(f => ({
                id: f.id,
                name: f.name,
                icon: f.icon,
                color: f.color,
                x: f.x,
                y: f.y
            })),
            showFactionLines: this.graphData.showFactionLines !== false,
            showFactionLegend: this.graphData.showFactionLegend !== false
        };

        if (entry && entry.isOwner) {
            await entry.setFlag("fang", "graphData", exportData);

            // If GM is saving, optionally force all players to sync to this new baseline
            if (triggerSync && game.user.isGM) {
                game.socket.emit("module.fang", { action: "showGraph" });
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

    // --- UI Interactivity ---

    _populateActors() {
        // Populate Source/Target from game.actors
        const selectSource = this.element.querySelector("#sourceSelect");
        const selectTarget = this.element.querySelector("#targetSelect");

        if (selectSource && selectTarget) {
            selectSource.innerHTML = `<option value="" disabled selected>${game.i18n.localize("FANG.UI.SelectSource")}</option>`;
            selectTarget.innerHTML = `<option value="" disabled selected>${game.i18n.localize("FANG.UI.SelectTarget")}</option>`;

            // Partition actors into two groups: On Canvas vs Others
            const canvasActorIds = new Set(this.graphData.nodes.map(n => n.id));
            const onCanvasActors = [];
            const otherActors = [];

            game.actors.contents.forEach(actor => {
                // If it's already on the canvas, everyone can see it in that optgroup
                if (canvasActorIds.has(actor.id)) {
                    onCanvasActors.push(actor);
                } else {
                    // Spoiling Protection: Only GMs see ALL other actors.
                    // Players only see actors they have at least Observer permission for.
                    if (game.user.isGM || actor.testUserPermission(game.user, "OBSERVER")) {
                        otherActors.push(actor);
                    }
                }
            });

            const sortByString = (a, b) => a.name.localeCompare(b.name);
            onCanvasActors.sort(sortByString);
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

            const lblCanvas = game.i18n.localize("FANG.Dropdowns.GroupCanvas");
            const lblDirectory = game.i18n.localize("FANG.Dropdowns.GroupDirectory");

            appendOptGroup(selectSource, lblCanvas, onCanvasActors);
            appendOptGroup(selectSource, lblDirectory, otherActors);

            appendOptGroup(selectTarget, lblCanvas, onCanvasActors);
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
                this.graphData.nodes.forEach(node => {
                    let opt = document.createElement("option");
                    opt.value = `node|${node.id}`;
                    opt.textContent = `${game.i18n.localize("FANG.Dropdowns.TokenPrefix")} ${node.name}`;
                    optGroupN.appendChild(opt);
                });
                selectDelete.appendChild(optGroupN);
            }

            if (this.graphData.links.length > 0) {
                const optGroupL = document.createElement("optgroup");
                optGroupL.label = game.i18n.localize("FANG.Dropdowns.Links");
                this.graphData.links.forEach((link, index) => {
                    let opt = document.createElement("option");
                    opt.value = `link|${index}`;
                    const unknownLabel = game.i18n.localize("FANG.Dropdowns.Unknown");
                    const sourceName = typeof link.source === 'object' ? link.source.name : this.graphData.nodes.find(n => n.id === link.source)?.name || unknownLabel;
                    const targetName = typeof link.target === 'object' ? link.target.name : this.graphData.nodes.find(n => n.id === link.target)?.name || unknownLabel;
                    opt.textContent = `${sourceName} -> ${targetName} (${link.label})`;
                    optGroupL.appendChild(opt);
                });
                selectDelete.appendChild(optGroupL);
            }
        }
    }

    _canEditGraph(silent = false) {
        if (game.user.isGM) return true;
        const allowPlayerEdit = game.settings.get("fang", "allowPlayerEditing");
        if (!allowPlayerEdit) {
            if (!silent) ui.notifications.warn(game.i18n.localize("FANG.Messages.SaveNoPermission"));
            return false;
        }
        const isGMOnline = game.users.some(u => u.isGM && u.active);
        if (!isGMOnline) {
            if (!silent) ui.notifications.warn(game.i18n.localize("FANG.Messages.WarnNoGMOnline"));
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
                        this.graphData.nodes.push({ id: id, name: actor.name });
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
        const val = selectDelete.value;

        if (!val) {
            ui.notifications.warn(game.i18n.localize("FANG.Messages.WarningNoDeleteSelect"));
            return;
        }

        const [type, id] = val.split("|");

        if (type === "node") {
            // Remove node
            this.graphData.nodes = this.graphData.nodes.filter(n => n.id !== id);
            // Remove any links connected to this node
            this.graphData.links = this.graphData.links.filter(l => {
                const sId = typeof l.source === 'object' ? l.source.id : l.source;
                const tId = typeof l.target === 'object' ? l.target.id : l.target;
                return sId !== id && tId !== id;
            });
            ui.notifications.info(game.i18n.localize("FANG.Messages.DeletedNode"));
        } else if (type === "link") {
            // Remove specific link by index
            const lIndex = parseInt(id, 10);
            this.graphData.links.splice(lIndex, 1);
            ui.notifications.info(game.i18n.localize("FANG.Messages.DeletedLink"));
        }

        this._toggleNodeEditor(false);
        this._toggleLinkEditor(-1);

        this.initSimulation();
        this.simulation.alpha(0.3).restart();
        this._populateActors(); // Update dropdown
        await this.saveData();
    }

    async _onToggleCenterNode() {
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
            await this.saveData();

            // Broadcast live update
            game.socket.emit("module.fang", { action: "showGraph" });
        }
    }

    async _onManageFactions() {
        if (!game.user.isGM) return;

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
                                    y: existingFaction && existingFaction.y !== undefined ? existingFaction.y : this.height / 2 + (Math.random() - 0.5) * 100
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
        event.preventDefault();
        if (!this._canEditGraph()) return;
        let data;
        try {
            data = JSON.parse(event.dataTransfer.getData("text/plain"));
        } catch (err) {
            return; // Not valid JSON, ignore
        }

        if (data.type !== "Actor" || !data.uuid) return;

        const actor = await fromUuid(data.uuid);
        if (!actor) return;

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

        if (targetNode) {
            // Scenario 2: Dropped on an existing node -> Ask for link details natively
            if (targetNode.id === actor.id) {
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
                            let sourceNode = this.graphData.nodes.find(n => n.id === actor.id);
                            if (!sourceNode) {
                                // Add near target to make the simulation look nice
                                sourceNode = { id: actor.id, name: actor.name, x: x - 20, y: y - 20 };
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

        } else {
            // Scenario 1: Dropped on empty canvas -> Add the node immediately without prompting
            let existingNode = this.graphData.nodes.find(n => n.id === actor.id);
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

                this.graphData.nodes.push({
                    id: actor.id,
                    name: actor.name,
                    role: null,
                    factionId: null,
                    x: jitterX,
                    y: jitterY
                });
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
            const actor = game.actors.get(clickedNode.id);
            if (actor) {
                actor.sheet.render(true);
            } else {
                ui.notifications.warn(game.i18n.localize("FANG.Messages.ActorNotFound"));
            }
        }
    }

    _showContextMenu(node, mouseX, mouseY) {
        if (!game.user.isGM && !game.settings.get("fang", "allowPlayerEditing")) return;

        const menu = this.element.querySelector("#fang-context-menu");
        if (!menu) return;

        // Position menu at cursor
        menu.style.left = `${mouseX}px`;
        menu.style.top = `${mouseY}px`;
        menu.classList.remove("hidden");

        const btnRole = menu.querySelector("#ctxEditRole");
        const btnLore = menu.querySelector("#ctxEditLore");
        const btnDelete = menu.querySelector("#ctxDeleteNode");

        // Clear previous listeners by cloning nodes
        const newBtnRole = btnRole.cloneNode(true);
        const newBtnLore = btnLore.cloneNode(true);
        const newBtnDelete = btnDelete.cloneNode(true);
        btnRole.parentNode.replaceChild(newBtnRole, btnRole);
        btnLore.parentNode.replaceChild(newBtnLore, btnLore);
        btnDelete.parentNode.replaceChild(newBtnDelete, btnDelete);

        // --- Context Action: Edit Role ---
        newBtnRole.addEventListener("click", () => {
            menu.classList.add("hidden");
            if (!game.user.isGM) return;

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

        // --- Context Action: Edit Lore ---
        newBtnLore.addEventListener("click", () => {
            menu.classList.add("hidden");
            if (!this._canEditGraph()) return;

            const title = game.i18n.localize("FANG.Dialogs.EditLoreTitle") || "Edit Information";
            const contentString = (game.i18n.localize("FANG.Dialogs.EditLoreContent") || "Additional details for {actor}:").replace("{actor}", node.name);

            new Dialog({
                title: title,
                content: `
                    <p><strong>${contentString}</strong></p>
                    <div class="form-group" style="height: 150px;">
                        <textarea id="fang-edit-lore" style="width: 100%; height: 100%; resize: none; font-family: var(--fang-font-main); padding: 5px;">${node.lore || ""}</textarea>
                    </div>
                `,
                buttons: {
                    save: {
                        icon: '<i class="fas fa-save"></i>',
                        label: game.i18n.localize("FANG.Dialogs.BtnSave") || "Save",
                        callback: async (html) => {
                            const newLore = html.find("#fang-edit-lore").val().trim();
                            node.lore = newLore !== "" ? newLore : null;
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
        } else {
            // Hide menu if clicked elsewhere
            const menu = this.element.querySelector("#fang-context-menu");
            if (menu) menu.classList.add("hidden");
        }
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
        let minLDist = 12 / this.transform.k; // Threshold scaled by zoom

        this.graphData.links.forEach((link, idx) => {
            const s = link.source;
            const t = link.target;
            if (!s || !t || !s.x || !t.x) return; // Wait for simulation

            const dist = this._pointToSegmentDistance({ x, y }, s, t);
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
                sourceSelect.dispatchEvent(new Event('change'));
            }
            if (deleteSelect) {
                deleteSelect.value = `node|${id}`;
                deleteSelect.dispatchEvent(new Event('change'));
            }
            // Trigger node UI
            this._toggleNodeEditor(true);
            this._toggleLinkEditor(-1);
        } else if (type === "link") {
            const deleteSelect = this.element.querySelector("#deleteSelect");
            if (deleteSelect) {
                deleteSelect.value = `link|${id}`;
                deleteSelect.dispatchEvent(new Event('change'));
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
                const actor = game.actors.get(nInfo.id);
                // Try prototypeToken texture first, fallback to standard img
                const imgSrc = actor ? (actor.prototypeToken?.texture?.src || actor.img) : "icons/svg/mystery-man.svg";
                const img = new Image();
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
            .force("charge", d3.forceManyBody().strength(-800))
            .force("link", d3.forceLink(links).id(d => d.id).distance(game.settings.get("fang", "tokenSize") * 4 + 100))
            .force("center", d3.forceCenter(this.width / 2, this.height / 2))
            .force("x", d3.forceX(this.width / 2).strength(node => node.isCenter ? 0.4 : 0.025)) // Boss Node Gravity Pull
            .force("y", d3.forceY(this.height / 2).strength(node => node.isCenter ? 0.4 : 0.025)) // Boss Node Gravity Pull
            .force("collide", d3.forceCollide().radius(game.settings.get("fang", "tokenSize") + 100)) // Linear breathing room
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
        this.graphData.links = links;
    }

    _createLinkRepulsionForce() {
        let nodes;
        const force = (alpha) => {
            const links = this.graphData.links;
            const repulsionRadius = 50; // The distance nodes must keep from lines
            const strength = 1.0 * alpha; // Push strength

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

                    // Mathematics for point-to-line-segment distance
                    const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
                    if (l2 === 0) continue;

                    let t = ((x0 - x1) * (x2 - x1) + (y0 - y1) * (y2 - y1)) / l2;
                    t = Math.max(0, Math.min(1, t)); // Constrain to segment

                    const projX = x1 + t * (x2 - x1);
                    const projY = y1 + t * (y2 - y1);

                    const dx = x0 - projX;
                    const dy = y0 - projY;
                    let dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < repulsionRadius) {
                        // Node is too close to line, repel perpendicularly
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

        this.context.save();
        this.context.clearRect(0, 0, this.width, this.height);
        this.context.translate(this.transform.x, this.transform.y);
        this.context.scale(this.transform.k, this.transform.k);

        // --- Draw Direct Faction Member Links (Ring Topology + Adaptive Rendering) ---
        // Drawing these FIRST ensures they are UNDERNEATH regular links and nodes
        if (this.graphData.showFactionLines !== false && this.graphData.factions && this.graphData.factions.length > 0) {
            // Build a set of existing regular link pairs for overlap detection
            const regularLinkPairs = new Set();
            this.graphData.links.forEach(l => {
                const sId = typeof l.source === 'object' ? l.source.id : l.source;
                const tId = typeof l.target === 'object' ? l.target.id : l.target;
                regularLinkPairs.add(sId < tId ? `${sId}-${tId}` : `${tId}-${sId}`);
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

                for (let i = 0; i < sortedMembers.length; i++) {
                    const node1 = sortedMembers[i];
                    const node2 = sortedMembers[(i + 1) % sortedMembers.length];
                    const m1 = renderPos[node1.id];
                    const m2 = renderPos[node2.id];
                    if (!m1 || !m2) continue;

                    const pairKey = node1.id < node2.id ? `${node1.id}-${node2.id}` : `${node2.id}-${node1.id}`;
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
        const nodeRadius = game.settings.get("fang", "tokenSize") || 40;
        this.context.lineWidth = 2;
        this.context.strokeStyle = "#888";
        const linkFontSize = Math.max(12, Math.floor(nodeRadius / 2.5));
        this.context.font = `${linkFontSize}px 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif`;
        this.context.textAlign = "center";
        this.context.textBaseline = "middle";

        const linkCounts = {};
        this.graphData.links.forEach((link, i) => {
            const pairKey = link.source.id < link.target.id
                ? `${link.source.id}-${link.target.id}`
                : `${link.target.id}-${link.source.id}`;

            if (!linkCounts[pairKey]) {
                linkCounts[pairKey] = { total: 0, links: [] };
            }
            linkCounts[pairKey].total++;
            linkCounts[pairKey].links.push(i);
            link.pairKey = pairKey;
        });

        this.graphData.links.forEach((link, i) => {
            const pairInfo = linkCounts[link.pairKey];
            const linkIndex = pairInfo.links.indexOf(i);
            const totalParams = pairInfo.total;

            // Use virtual positions
            const sPos = renderPos[link.source.id];
            const tPos = renderPos[link.target.id];

            const dx = tPos.x - sPos.x;
            const dy = tPos.y - sPos.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const midX = (sPos.x + tPos.x) / 2;
            const midY = (sPos.y + tPos.y) / 2;

            let ctrlX, ctrlY, labelX, labelY;

            this.context.lineWidth = 2;
            this.context.strokeStyle = "#888";

            const arrowSize = 10;   // Size of the arrowhead

            // Helper function to draw arrowhead
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
                const halfW = (tWidth / 2) + 12; // Label width + padding

                // Dynamic Label Y-bounds based on node radius
                const topY = nodeRadius - 5;
                const bottomY = nodeRadius + (node.role ? 36 : 22);

                // Ray vector starting from the center of the node outwards
                const vx = Math.cos(rayAngle);
                const vy = Math.sin(rayAngle);

                // Check intersection with bottom edge
                if (vy > 0) {
                    const t_bottom = bottomY / vy;
                    if (Math.abs(t_bottom * vx) <= halfW) {
                        return Math.max(R, t_bottom);
                    }
                }
                // Check intersection with side edges
                if (vx !== 0) {
                    const t_side = halfW / Math.abs(vx);
                    const y_hit = t_side * vy;
                    if (y_hit >= topY && y_hit <= bottomY) {
                        return Math.max(R, t_side);
                    }
                }
                return R;
            };

            if (totalParams === 1) {
                ctrlX = midX;
                ctrlY = midY;

                let targetX = tPos.x;
                let targetY = tPos.y;
                let angle = Math.atan2(dy, dx);

                const offsetTarget = getNodeBoundOffset(link.target, angle + Math.PI);
                const offsetSource = getNodeBoundOffset(link.source, angle);

                let boundTargetX = tPos.x - Math.cos(angle) * offsetTarget;
                let boundTargetY = tPos.y - Math.sin(angle) * offsetTarget;

                if (link.directional) {
                    targetX = boundTargetX;
                    targetY = boundTargetY;
                }

                // Place label perfectly in the middle of the VISIBLE line gap between the two node boundaries
                const boundSourceX = sPos.x + Math.cos(angle) * offsetSource;
                const boundSourceY = sPos.y + Math.sin(angle) * offsetSource;

                labelX = boundSourceX + ((link.directional ? targetX : boundTargetX) - boundSourceX) * 0.5;
                labelY = boundSourceY + ((link.directional ? targetY : boundTargetY) - boundSourceY) * 0.5;

                this.context.beginPath();
                this.context.moveTo(sPos.x, sPos.y);

                // Draw the line segment itself slightly short so the flat butt doesn't poke out of the arrowhead
                let drawTargetX = targetX;
                let drawTargetY = targetY;
                if (link.directional) {
                    drawTargetX -= Math.cos(angle) * (arrowSize - 3);
                    drawTargetY -= Math.sin(angle) * (arrowSize - 3);
                }

                this.context.lineTo(drawTargetX, drawTargetY);
                this.context.stroke();

                if (link.directional) {
                    drawArrowhead(this.context, targetX, targetY, angle);
                }
            } else {
                let offsetMultiplier = 0;
                if (totalParams % 2 === 0) {
                    offsetMultiplier = (linkIndex % 2 === 0 ? 1 : -1) * (Math.floor(linkIndex / 2) + 0.5);
                } else {
                    if (linkIndex !== 0) {
                        offsetMultiplier = (linkIndex % 2 === 0 ? 1 : -1) * Math.floor((linkIndex + 1) / 2);
                    }
                }

                const spreadDistance = 30 + (dist * 0.1);
                const finalOffset = offsetMultiplier * spreadDistance;

                const nx = -dy / dist;
                const ny = dx / dist;

                ctrlX = midX + nx * finalOffset * 2;
                ctrlY = midY + ny * finalOffset * 2;

                let targetX = tPos.x;
                let targetY = tPos.y;
                let angle = Math.atan2(tPos.y - ctrlY, tPos.x - ctrlX); // Ray entering target
                let angleOut = Math.atan2(ctrlY - sPos.y, ctrlX - sPos.x); // Ray exiting source

                const offsetTarget = getNodeBoundOffset(link.target, angle + Math.PI);
                const offsetSource = getNodeBoundOffset(link.source, angleOut);

                if (link.directional) {
                    targetX = tPos.x - Math.cos(angle) * offsetTarget;
                    targetY = tPos.y - Math.sin(angle) * offsetTarget;
                }

                // Bezier curve approximation to slide the label along the drawn path
                const t1 = offsetSource / Math.max(dist, 1);
                const t2 = 1.0 - (offsetTarget / Math.max(dist, 1));
                const tMid = Math.min(Math.max((t1 + t2) / 2.0, 0.1), 0.9); // Clamp to avoid label sitting too far out
                const u = 1.0 - tMid;

                // Place label perfectly in the middle of the available curve time
                labelX = (u * u) * sPos.x + 2 * u * tMid * ctrlX + (tMid * tMid) * tPos.x; // Use original tPos for true curve tracing
                labelY = (u * u) * sPos.y + 2 * u * tMid * ctrlY + (tMid * tMid) * tPos.y;

                this.context.beginPath();
                this.context.moveTo(sPos.x, sPos.y);

                // Draw the line segment itself slightly short so the flat butt doesn't poke out of the arrowhead
                let drawTargetX = targetX;
                let drawTargetY = targetY;
                if (link.directional) {
                    drawTargetX -= Math.cos(angle) * (arrowSize - 3);
                    drawTargetY -= Math.sin(angle) * (arrowSize - 3);
                }

                this.context.quadraticCurveTo(ctrlX, ctrlY, drawTargetX, drawTargetY);
                this.context.stroke();

                if (link.directional) {
                    drawArrowhead(this.context, targetX, targetY, angle);
                }
            }

            if (link.label) {
                const linkFontSize = Math.max(12, Math.floor(nodeRadius / 2.5));
                this.context.font = `${linkFontSize}px 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif`;
                const metrics = this.context.measureText(link.label);
                const textWidth = metrics.width;
                const textHeight = linkFontSize + 4;
                this.context.fillStyle = "#ffffff";
                this.context.beginPath();
                this.context.roundRect(labelX - textWidth / 2 - 4, labelY - textHeight / 2, textWidth + 8, textHeight, 4);
                this.context.fill();

                this.context.lineWidth = 1;
                this.context.strokeStyle = "#dcd6cc";
                this.context.stroke();

                this.context.fillStyle = "#1a1a1a";
                this.context.fillText(link.label, labelX, labelY);
            }
        });

        // Draw Nodes
        const radius = game.settings.get("fang", "tokenSize") || 33;
        this.graphData.nodes.forEach(node => {
            const pos = renderPos[node.id];

            this.context.save();

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
                this.context.shadowBlur = 0; // Reset for token
            }
            // -----------------------------

            // -----------------------------
            // Faction visuals (lines and labels) are handled after the node loop
            // to ensure they are on top or clearly visible.
            // -----------------------------

            if (node.imgElement && node.imgElement.complete && node.imgElement.naturalWidth !== 0) {
                // Just draw the raw token image without extra circles/borders
                this.context.drawImage(node.imgElement, pos.x - radius, pos.y - radius, radius * 2, radius * 2);
            } else {
                // Fallback fill if not loaded
                this.context.beginPath();
                this.context.arc(pos.x, pos.y, radius, 0, Math.PI * 2, true);
                this.context.fillStyle = "#b91c1c";
                this.context.fill();
                this.context.lineWidth = 3;
                this.context.strokeStyle = "#d97706";
                this.context.stroke();
            }

            // --- Faction Icon (Top-Left corner) ---
            if (faction && faction.icon) {
                if (!this._iconCache) this._iconCache = {};
                let img = this._iconCache[faction.icon];
                if (!img) {
                    img = new Image();
                    img.src = faction.icon;
                    this._iconCache[faction.icon] = img;
                }

                if (img.complete && img.naturalWidth > 0) {
                    const iconSize = 24;
                    // Calculate position at top-left of circle
                    const offset = radius * 0.7; // Approx 45 degrees
                    this.context.drawImage(img, pos.x - offset - iconSize / 2, pos.y - offset - iconSize / 2, iconSize, iconSize);
                }
            }

            this.context.restore();

            // Draw Label Background for readability
            const nodeFontSize = 15;
            const roleFontSize = 12;
            this.context.font = `bold ${nodeFontSize}px 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif`;
            const metrics = this.context.measureText(node.name);
            let textWidth = Math.max(metrics.width, 40);

            let roleTextWidth = 0;
            if (node.role) {
                this.context.font = `italic ${roleFontSize}px 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif`;
                roleTextWidth = this.context.measureText(node.role).width;
                textWidth = Math.max(textWidth, roleTextWidth);
            }

            const textHeight = node.role ? 36 : 22; // Make background taller if we have a role
            // Base the label offset on the BASE radius, so the label doesn't jump up and down
            const labelYOffset = radius + (node.role ? 18 : 11); // Push down slightly further if role exists

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
            this.context.fillText(node.name, pos.x, pos.y + labelYOffset - (node.role ? 7 : 0));

            // Draw Role Text
            if (node.role) {
                this.context.font = `italic ${roleFontSize}px 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif`;
                this.context.fillStyle = "#dcd6cc"; // slightly dimmer color
                this.context.fillText(node.role, pos.x, pos.y + labelYOffset + 8);
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
        if (!this._canEditGraph(false)) return; // Show warning on first click
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
    }

    /**
     * Re-centers the graph and adjusts zoom so all nodes are visible.
     * @param {boolean} transition - Whether to animate the transition.
     */
    zoomToFit(transition = true) {
        if (!this.canvas || !this.zoom || !this.graphData.nodes.length) return;

        const padding = 60;
        const width = this.width;
        const height = this.height;

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

        const dx = x1 - x0;
        const dy = y1 - y0;
        const midX = (x0 + x1) / 2;
        const midY = (y0 + y1) / 2;

        let scale = 0.95 / Math.max(dx / width, dy / height);

        // Constrain extreme zoom
        if (scale > 1.0) scale = 1.0;
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
            this.canvas.style.cursor = hoveredNode ? "pointer" : "grab";

            // If we are now hovering over a node with lore, start the timer
            if (hoveredNode && hoveredNode.lore) {
                this._hoverTimeout = setTimeout(() => {
                    this._tooltipVisibleForNode = hoveredNode.id;

                    // Show it immediately
                    tooltip.innerHTML = hoveredNode.lore.replace(/\n/g, '<br>');
                    const nodeScreenX = this.transform.applyX(hoveredNode.x);
                    const nodeScreenY = this.transform.applyY(hoveredNode.y);
                    const nodeRadiusScaled = (game.settings.get("fang", "tokenSize") || 33) * this.transform.k;
                    const cWidth = this.canvas.parentElement.clientWidth;
                    const estimatedTooltipWidth = 340;

                    let tooltipX = nodeScreenX + nodeRadiusScaled + 15;
                    if (tooltipX + estimatedTooltipWidth > cWidth) {
                        tooltipX = nodeScreenX - nodeRadiusScaled - estimatedTooltipWidth - 15;
                    }

                    let tooltipY = nodeScreenY - 10;
                    tooltip.style.left = `${tooltipX}px`;
                    tooltip.style.top = `${tooltipY}px`;

                    tooltip.classList.remove("hidden");
                }, 450); // 450ms hover delay
            }
        } else if (hoveredNode && hoveredNode.lore && this._tooltipVisibleForNode === hoveredNode.id) {
            // If the tooltip is actively visible for this node, keep it glued exactly to the node's potential bounds during mouse movement
            const nodeScreenX = this.transform.applyX(hoveredNode.x);
            const nodeScreenY = this.transform.applyY(hoveredNode.y);
            const nodeRadiusScaled = (game.settings.get("fang", "tokenSize") || 33) * this.transform.k;
            const cWidth = this.canvas.parentElement.clientWidth;
            const estimatedTooltipWidth = 340;

            let tooltipX = nodeScreenX + nodeRadiusScaled + 15;
            if (tooltipX + estimatedTooltipWidth > cWidth) {
                tooltipX = nodeScreenX - nodeRadiusScaled - estimatedTooltipWidth - 15;
            }
            let tooltipY = nodeScreenY - 10;
            tooltip.style.left = `${tooltipX}px`;
            tooltip.style.top = `${tooltipY}px`;
        }
    }

    // --- Export / Import ---

    /**
     * Export the current graph data as a JSON file.
     */
    _onExportGraph(event) {
        if (event) event.preventDefault();

        // Prepare data (full state including factions and settings)
        const exportData = {
            nodes: this.graphData.nodes.map(n => ({
                id: n.id,
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
                y: f.y
            })),
            showFactionLines: this.graphData.showFactionLines !== false,
            showFactionLegend: this.graphData.showFactionLegend !== false
        };

        const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const worldName = game.world.id;
        const filename = `fang-${worldName}-${timestamp}.json`;

        saveDataToFile(JSON.stringify(exportData, null, 2), "application/json", filename);
        ui.notifications.info(game.i18n.localize("FANG.Messages.ExportSuccess"));
    }

    /**
     * Import graph data from a JSON file.
     */
    async _onImportGraph(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Confirm overwrite with custom FANG dialog styling
        const confirm = await new Promise(resolve => {
            new Dialog({
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
                const errorMsg = `${game.i18n.localize("FANG.Messages.ImportError")} (${err.message})`;
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
        await this.saveData();
        game.socket.emit("module.fang", { action: "showGraph" });
        ui.notifications.info(game.i18n.localize("FANG.Messages.GraphShown"));
    }

    async _onShareGraphMonitor(event) {
        if (event) event.preventDefault();
        await this.saveData();
        game.socket.emit("module.fang", { action: "showGraphMonitor" });
        ui.notifications.info(game.i18n.localize("FANG.Messages.MonitorViewOpened"));
    }

    _onCloseGraphRemote(event) {
        if (event) event.preventDefault();
        game.socket.emit("module.fang", { action: "closeGraph" });
        ui.notifications.info(game.i18n.localize("FANG.Messages.GraphClosed"));
    }

    _onCloseGraphMonitor(event) {
        if (event) event.preventDefault();
        game.socket.emit("module.fang", { action: "closeGraphMonitor" });
        ui.notifications.info(game.i18n.localize("FANG.Messages.MonitorViewClosed"));
    }

    _onClose(options) {
        super._onClose(options);
        this._initialZoomApplied = false;
        this.transform = null;
    }
}
