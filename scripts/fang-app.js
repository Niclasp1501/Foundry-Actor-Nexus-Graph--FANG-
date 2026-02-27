const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class FangApplication extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "fang-app",
        classes: ["fang-app-window", "common-display"],
        position: {
            width: 1400,
            height: 900
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
    }

    async _prepareContext(options) {
        return {
            ...await super._prepareContext(options)
        };
    }

    async _onFirstRender(context, options) {
        super._onFirstRender(context, options);

        // Load D3 JS from CDN if not already loaded
        if (typeof d3 === "undefined") {
            await this.#loadD3();
        }

        await this.loadData();

        this._initD3();
        this._populateActors();

        // Resize observer
        const canvasContainer = this.element.querySelector(".canvas-container");
        this._resizeObserver = new ResizeObserver(() => this.resizeCanvas());
        this._resizeObserver.observe(canvasContainer);

        // Event listeners
        this.element.querySelector("#btnAddLink").addEventListener("click", this._onAddLink.bind(this));

        const btnDelete = this.element.querySelector("#btnDeleteElement");
        if (btnDelete) btnDelete.addEventListener("click", this._onDeleteElement.bind(this));

        const btnToggleCenter = this.element.querySelector("#btnToggleCenter");
        if (btnToggleCenter) btnToggleCenter.addEventListener("click", this._onToggleCenterNode.bind(this));

        const btnManageGroups = this.element.querySelector("#btnManageGroups");
        if (btnManageGroups) btnManageGroups.addEventListener("click", this._onManageGroups.bind(this));

        const canvas = this.element.querySelector("#graphCanvas");
        canvas.addEventListener("dblclick", this._onCanvasDoubleClick.bind(this));
        canvas.addEventListener("contextmenu", this._onCanvasRightClick.bind(this));

        // Drag & Drop Listeners
        canvasContainer.addEventListener("dragover", this._onDragOver.bind(this));
        canvasContainer.addEventListener("drop", this._onDrop.bind(this));

        // Fullscreen and Sidebar hide for players
        if (!game.user.isGM) {
            const sidebar = this.element.querySelector(".sidebar");
            if (sidebar) sidebar.style.display = "none";

            // Only apply pure fullscreen to players with 'monitor' in their name
            if (game.user.name.toLowerCase().includes("monitor")) {
                this.element.classList.add("fang-fullscreen-player");

                // Absolute nuke for Monk's Common Display
                this.element.style.setProperty("display", "flex", "important");
                this.element.style.setProperty("visibility", "visible", "important");
                this.element.style.setProperty("opacity", "1", "important");
            }

            // Force a resize calculation for D3
            setTimeout(() => this.resizeCanvas(), 50);
        } else {
            // GM-only Event Listeners
            const btnShare = this.element.querySelector("#btnShareGraph");
            if (btnShare) {
                btnShare.addEventListener("click", (e) => {
                    e.preventDefault();

                    // Critical Fix: Before sharing, ensure the data is fully synced and saved
                    this.saveData().then(() => {
                        game.socket.emit("module.fang", { action: "showGraph" });
                        ui.notifications.info(game.i18n.localize("FANG.Messages.GraphShown"));
                    });
                });
            }

            const btnShareMonitor = this.element.querySelector("#btnShareGraphMonitor");
            if (btnShareMonitor) {
                btnShareMonitor.addEventListener("click", (e) => {
                    e.preventDefault();
                    this.saveData().then(() => {
                        game.socket.emit("module.fang", { action: "showGraphMonitor" });
                        ui.notifications.info(game.i18n.localize("FANG.Messages.GraphMonitorShown"));
                    });
                });
            }

            const btnCloseRemote = this.element.querySelector("#btnCloseGraphRemote");
            if (btnCloseRemote) {
                btnCloseRemote.addEventListener("click", (e) => {
                    e.preventDefault();
                    game.socket.emit("module.fang", { action: "closeGraph" });
                    ui.notifications.info(game.i18n.localize("FANG.Messages.GraphClosed"));
                });
            }

            const btnCloseMonitor = this.element.querySelector("#btnCloseGraphMonitor");
            if (btnCloseMonitor) {
                btnCloseMonitor.addEventListener("click", (e) => {
                    e.preventDefault();
                    game.socket.emit("module.fang", { action: "closeGraphMonitor" });
                    ui.notifications.info(game.i18n.localize("FANG.Messages.GraphMonitorClosed"));
                });
            }
        }

        // Initially populate all dropdowns (source, target, and the new delete dropdown)
        this._populateActors();
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
                if (!this.graphData.groups) this.graphData.groups = []; // Migration for old saves
            } else {
                this.graphData = { nodes: [], links: [], groups: [] };
            }
        } else {
            this.graphData = { nodes: [], links: [], groups: [] };
        }
    }

    async saveData() {
        const entry = await this.getJournalEntry();
        if (entry && entry.isOwner) {
            const exportData = {
                nodes: this.graphData.nodes.map(n => ({
                    id: n.id,
                    name: n.name,
                    role: n.role,
                    group: n.group,
                    x: n.x,
                    y: n.y,
                    vx: n.vx,
                    vy: n.vy,
                    isCenter: n.isCenter || false
                })),
                links: this.graphData.links.map(l => ({
                    source: typeof l.source === 'object' ? l.source.id : l.source,
                    target: typeof l.target === 'object' ? l.target.id : l.target,
                    label: l.label,
                    directional: l.directional
                })),
                groups: this.graphData.groups
            };
            await entry.setFlag("fang", "graphData", exportData);
        } else {
            ui.notifications.warn(game.i18n.localize("FANG.Messages.SaveNoPermission"));
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
                if (canvasActorIds.has(actor.id)) {
                    onCanvasActors.push(actor);
                } else {
                    otherActors.push(actor);
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

    async _onAddLink() {
        const sourceId = this.element.querySelector("#sourceSelect").value;
        const targetId = this.element.querySelector("#targetSelect").value;
        const label = this.element.querySelector("#linkLabel").value.trim();
        const directional = this.element.querySelector("#linkDirectional").checked;

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

    async _onManageGroups() {
        if (!game.user.isGM) return;

        let groupsHtml = this.graphData.groups.map((g, index) => `
            <div class="fang-group-item" style="display: flex; gap: 5px; align-items: center; margin-bottom: 5px;">
                <input type="color" class="group-color" data-index="${index}" value="${g.color}" title="Zonen-Farbe" style="flex: 0 0 30px; height: 30px; padding: 0;">
                <input type="text" class="group-name" data-index="${index}" value="${g.name}" placeholder="Gruppenname" style="flex: 1;">
                <button type="button" class="btn file-picker" data-type="image" data-target="group-icon-${index}" title="Icon auswählen" style="flex: 0 0 30px; padding: 0;">
                    <i class="fas fa-file-image"></i>
                </button>
                <input type="hidden" class="group-icon" id="group-icon-${index}" data-index="${index}" value="${g.icon || ''}">
                <button type="button" class="btn danger-btn btn-delete-group" data-index="${index}" title="Gruppe löschen" style="flex: 0 0 30px; padding: 0;">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `).join("");

        const dialogContent = `
            <div style="display: flex; flex-direction: column; height: 100%;">
                <p style="flex: 0 0 auto;">Verwalte vordefinierte Gruppen. Jede Gruppe zieht ihr zugewiesene Tokens an (Kreis-Zonen).</p>
                <div id="fang-groups-list" style="flex: 1 1 auto; overflow-y: auto; overflow-x: hidden; margin-bottom: 10px; min-height: 150px; border: 1px solid rgba(0,0,0,0.2); padding: 5px;">
                    ${groupsHtml}
                </div>
                <button type="button" id="fang-add-group-btn" class="btn secondary-btn" style="flex: 0 0 auto; width: 100%; margin-bottom: 10px;">
                    <i class="fas fa-plus"></i> Neue Gruppe erstellen
                </button>
            </div>
        `;
        const groupDialog = new Dialog({
            title: "Gruppen verwalten",
            content: dialogContent,
            render: (html) => {
                // Add new blank row dynamically
                html.find("#fang-add-group-btn").on("click", () => {
                    const list = html.find("#fang-groups-list");
                    const newIndex = list.children().length;
                    const randomColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
                    list.append(`
                        <div class="fang-group-item" style="display: flex; gap: 5px; align-items: center; margin-bottom: 5px;">
                            <input type="color" class="group-color" data-index="${newIndex}" value="${randomColor}" title="Zonen-Farbe" style="flex: 0 0 30px; height: 30px; padding: 0;">
                            <input type="text" class="group-name" data-index="${newIndex}" value="Neue Gruppe" placeholder="Gruppenname" style="flex: 1;">
                            <button type="button" class="btn file-picker" data-type="image" data-target="group-icon-${newIndex}" title="Icon auswählen" style="flex: 0 0 30px; padding: 0;">
                                <i class="fas fa-file-image"></i>
                            </button>
                            <input type="hidden" class="group-icon" id="group-icon-${newIndex}" data-index="${newIndex}" value="">
                            <button type="button" class="btn danger-btn btn-delete-group" data-index="${newIndex}" title="Gruppe löschen" style="flex: 0 0 30px; padding: 0;">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    `);

                    // Bind delete specifically to the newly added row
                    html.find(`.btn-delete-group[data-index='${newIndex}']`).on("click", (e) => {
                        $(e.currentTarget).closest('.fang-group-item').remove();
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
                        }
                    }).render(true);
                });

                // Bind delete to existing rows
                html.find(".btn-delete-group").on("click", (e) => {
                    $(e.currentTarget).closest('.fang-group-item').remove();
                });
            },
            buttons: {
                save: {
                    icon: '<i class="fas fa-save"></i>',
                    label: "Speichern",
                    callback: async (html) => {
                        const newGroups = [];
                        html.find(".fang-group-item").each((i, el) => {
                            const name = $(el).find(".group-name").val().trim();
                            const color = $(el).find(".group-color").val();
                            const icon = $(el).find(".group-icon").val().trim();

                            if (name) {
                                // Keep old position if it exists, otherwise put it at the center
                                const existingGroup = this.graphData.groups.find(g => g.name === name);
                                newGroups.push({
                                    id: existingGroup ? existingGroup.id : foundry.utils.randomID(),
                                    name: name,
                                    color: color,
                                    icon: icon !== "" ? icon : null,
                                    x: existingGroup && existingGroup.x ? existingGroup.x : this.width / 2 + (Math.random() - 0.5) * 100,
                                    y: existingGroup && existingGroup.y ? existingGroup.y : this.height / 2 + (Math.random() - 0.5) * 100,
                                });
                            }
                        });

                        // Handle multi-group cleanup
                        const keptGroupIds = new Set(newGroups.map(g => g.id));
                        this.graphData.nodes.forEach(node => {
                            if (node.groupIds && node.groupIds.length > 0) {
                                node.groupIds = node.groupIds.filter(id => keptGroupIds.has(id));
                            }
                        });

                        this.graphData.groups = newGroups;

                        // Give simulation a huge hot restart because a new group mass-moves physics nodes!
                        this.initSimulation();
                        this.simulation.alpha(0.8).restart();
                        await this.saveData();
                    }
                },
                cancel: {
                    icon: '<i class="fas fa-times"></i>',
                    label: "Abbrechen"
                }
            },
            default: "save"
        }, {
            classes: ["dialog", "fang-dialog"],
            width: 450,
            height: 480,
            resizable: true
        });

        groupDialog.render(true);
    }

    _onDragOver(event) {
        event.preventDefault(); // Necessary to allow dropping
    }

    async _onDrop(event) {
        event.preventDefault();
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
                    groupIds: [],
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

        if (clickedNode && game.user.isGM) {
            const title = game.i18n.localize("FANG.Dialogs.EditRoleTitle") || "Details bearbeiten";
            const contentString = (game.i18n.localize("FANG.Dialogs.EditRoleContent") || "Details für {actor}:").replace("{actor}", clickedNode.name);
            const lblRole = game.i18n.localize("FANG.Dialogs.RoleInput") || "Rolle";
            const lblGroup = game.i18n.localize("FANG.Dialogs.GroupInput") || "Gruppe / Standort";
            const btnSave = game.i18n.localize("FANG.Dialogs.BtnSave") || "Speichern";
            const btnCancel = game.i18n.localize("FANG.Dialogs.BtnCancel") || "Abbrechen";

            const currentRole = clickedNode.role || "";
            // Migration for older single-groupId
            const currentGroupIds = clickedNode.groupIds || (clickedNode.groupId ? [clickedNode.groupId] : []);

            const groupOptions = this.graphData.groups.map(g => {
                const checked = currentGroupIds.includes(g.id) ? "checked" : "";
                return `
                <label style="display: flex; align-items: center; gap: 4px; font-weight: normal; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    <input type="checkbox" name="fang-edit-group" value="${g.id}" ${checked}> 
                    ${g.name}
                </label>
                `;
            }).join("");

            const dialogContent = `
                <p><strong>${contentString}</strong></p>
                <div class="form-group">
                    <label>${lblRole}:</label>
                    <div class="form-fields">
                        <input type="text" id="fang-edit-role" value="${currentRole}" style="width: 100%;">
                    </div>
                </div>
                <div class="form-group">
                    <label>${lblGroup}:</label>
                    <div class="form-fields fang-checkbox-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px; max-height: 120px; overflow-y: auto; overflow-x: hidden; border: 1px solid rgba(0,0,0,0.2); padding: 5px;">
                        ${groupOptions}
                    </div>
                </div>
            `;

            new Dialog({
                title: title,
                content: dialogContent,
                buttons: {
                    save: {
                        icon: '<i class="fas fa-save"></i>',
                        label: btnSave,
                        callback: async (html) => {
                            const newRole = html.find("#fang-edit-role").val().trim();

                            const selectedGroups = [];
                            html.find("input[name='fang-edit-group']:checked").each((_, el) => {
                                selectedGroups.push($(el).val());
                            });

                            clickedNode.role = newRole !== "" ? newRole : null;
                            clickedNode.groupIds = selectedGroups;
                            // No longer need to delete groupId as it's replaced by groupIds

                            // Force re-render
                            this.initSimulation();
                            this.simulation.alpha(0.05).restart();
                            await this.saveData();
                        }
                    },
                    cancel: {
                        icon: '<i class="fas fa-times"></i>',
                        label: btnCancel
                    }
                },
                default: "save"
            }).render(true);
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
        this.transform = d3.zoomIdentity;
        this.width = this.canvas.parentElement.clientWidth;
        this.height = this.canvas.parentElement.clientHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;

        // Initialize simulation
        this.initSimulation();

        // Setup behaviors
        d3.select(this.canvas)
            .call(d3.drag()
                .container(this.canvas)
                .subject(this.dragSubject.bind(this))
                .on("start", this.dragstarted.bind(this))
                .on("drag", this.dragged.bind(this))
                .on("end", this.dragended.bind(this)))
            .call(d3.zoom().scaleExtent([0.1, 4]).on("zoom", this.zoomed.bind(this)));
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

        this.simulation = d3.forceSimulation(nodes)
            .force("charge", d3.forceManyBody().strength(-800))
            .force("link", d3.forceLink(links).id(d => d.id).distance(200))
            .force("center", d3.forceCenter(this.width / 2, this.height / 2))
            .force("x", d3.forceX(this.width / 2).strength(node => node.isCenter ? 0.4 : 0.025)) // Boss Node Gravity Pull
            .force("y", d3.forceY(this.height / 2).strength(node => node.isCenter ? 0.4 : 0.025)) // Boss Node Gravity Pull
            .force("collide", d3.forceCollide().radius(60))
            .force("link-avoidance", this._createLinkRepulsionForce())
            .force("groups", this._createGroupGravityForce())
            .force("group-repulsion", this._createGroupRepulsionForce())
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

        // Calculate dynamic dimensions for groups
        if (this.graphData.groups) {
            this.graphData.groups.forEach(g => {
                g._memberCount = nodes.filter(n => {
                    const gids = n.groupIds || (n.groupId ? [n.groupId] : []);
                    return gids.includes(g.id);
                }).length;

                // Check for overlapping/shared memberships to give extra space
                let hasSharedMembers = false;
                for (let otherG of this.graphData.groups) {
                    if (otherG.id === g.id) continue;
                    const sharedCount = nodes.filter(n => {
                        const gids = n.groupIds || (n.groupId ? [n.groupId] : []);
                        return gids.includes(g.id) && gids.includes(otherG.id);
                    }).length;
                    if (sharedCount > 0) {
                        hasSharedMembers = true;
                        break;
                    }
                }

                // Base radius 120, plus surface area expansion per node. 
                // Add flat +120 if we need room for overlapping venn-diagrams
                // This ensures circles are HUGE when they overlap
                g._computedRadius = Math.max(120, 60 + Math.sqrt(g._memberCount) * 50) + (hasSharedMembers ? 120 : 0);
            });
        }
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

    _createGroupGravityForce() {
        let nodes;

        const force = (alpha) => {
            if (!this.graphData.groups || this.graphData.groups.length === 0) return;

            const strength = 0.08 * alpha;
            const boundaryStrength = 0.8 * alpha;
            const nonMemberRepulsion = 0.4 * alpha;

            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];
                if (node.isCenter) continue;

                const myGroupIds = node.groupIds || (node.groupId ? [node.groupId] : []);

                for (let group of this.graphData.groups) {
                    if (group.x === undefined || group.y === undefined) continue;

                    const dx = group.x - node.x;
                    const dy = group.y - node.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const padding = group._computedRadius || 200;

                    if (myGroupIds.includes(group.id)) {
                        // Node is IN this group
                        // Pull towards center
                        node.vx += dx * strength;
                        node.vy += dy * strength;

                        // Hard constraint: Push back if trying to leave circle
                        if (dist > padding - 40) { // 40 is roughly node radius + margin
                            const pushDist = dist - (padding - 40);
                            const nx = dx / dist;
                            const ny = dy / dist;
                            node.vx += nx * pushDist * boundaryStrength;
                            node.vy += ny * pushDist * boundaryStrength;
                        }

                        // Orbit constraint: Push outward from the absolute center to leave room for the group icon/name
                        // Keep a massive inner core clear so text/icon isn't covered
                        const coreRadius = group.icon ? 110 : 90;
                        if (dist < coreRadius) {
                            if (dist === 0) continue; // prevent div zero
                            const pushDist = coreRadius - dist;
                            const nx = -(dx / dist); // Pointing OUTWARD from center
                            const ny = -(dy / dist);
                            // Extremely strong outward push from the center core
                            node.vx += nx * pushDist * boundaryStrength * 3.0;
                            node.vy += ny * pushDist * boundaryStrength * 3.0;
                        }
                    } else {
                        // Node is NOT in this group
                        // Hard constraint: Push out if it entered the circle
                        // Changed from `padding + 40` to `padding + 5` to let tokens sit closer to the border
                        if (dist < padding + 5) {
                            if (dist === 0) continue; // prevent div zero
                            const pushDist = (padding + 5) - dist;
                            const nx = dx / dist;
                            const ny = dy / dist;
                            // Extremely strong outward push if a non-member is trapped inside
                            node.vx -= nx * pushDist * nonMemberRepulsion * 4.0;
                            node.vy -= ny * pushDist * nonMemberRepulsion * 4.0;
                        }
                    }
                }
            }
        };

        force.initialize = (_) => { nodes = _; };
        return force;
    }

    _createGroupRepulsionForce() {
        let nodes; // Need nodes to count shared membership at runtime
        const force = (alpha) => {
            if (!this.graphData.groups || this.graphData.groups.length < 2) return;

            const groups = this.graphData.groups;
            const strength = 0.1 * alpha;
            const attractionStrength = 0.05 * alpha;

            for (let i = 0; i < groups.length; i++) {
                for (let j = i + 1; j < groups.length; j++) {
                    const g1 = groups[i];
                    const g2 = groups[j];

                    if (g1.x !== undefined && g1.y !== undefined && g2.x !== undefined && g2.y !== undefined) {
                        const dx = g2.x - g1.x;
                        const dy = g2.y - g1.y;
                        let dist = Math.sqrt(dx * dx + dy * dy);
                        if (dist === 0) dist = 1;

                        const r1 = g1._computedRadius || 200;
                        const r2 = g2._computedRadius || 200;

                        // Check if they share members
                        let sharedMembers = 0;
                        if (nodes) {
                            for (let n of nodes) {
                                const gids = n.groupIds || (n.groupId ? [n.groupId] : []);
                                if (gids.includes(g1.id) && gids.includes(g2.id)) {
                                    sharedMembers++;
                                }
                            }
                        }

                        if (sharedMembers > 0) {
                            // Groups share members: they should intersect deeply to leave room for shared tokens.
                            // 45% diameter overlap target distance = (r1 + r2) * 0.55
                            const idealDist = (r1 + r2) * 0.55;

                            if (dist > idealDist) {
                                // Pull together (groups too far apart)
                                const pullAmt = (dist - idealDist) * attractionStrength;
                                const nx = (dx / dist) * pullAmt;
                                const ny = (dy / dist) * pullAmt;
                                g1.x += nx;
                                g1.y += ny;
                                g2.x -= nx;
                                g2.y -= ny;
                            } else if (dist < idealDist - 30) {
                                // Don't let them swallow each other completely, leave some non-overlapping rims
                                const pushAmt = ((idealDist - 30) - dist) * strength;
                                const nx = (dx / dist) * pushAmt;
                                const ny = (dy / dist) * pushAmt;
                                g1.x -= nx;
                                g1.y -= ny;
                                g2.x += nx;
                                g2.y += ny;
                            }
                        } else {
                            // Groups do not share members: they MUST NOT intersect
                            const safeDistance = r1 + r2 + 60; // Distance to maintain between centers + buffer
                            if (dist < safeDistance) {
                                // Push apart
                                const pushAmt = (safeDistance - dist) * strength;
                                const nx = (dx / dist) * pushAmt;
                                const ny = (dy / dist) * pushAmt;
                                g1.x -= nx;
                                g1.y -= ny;
                                g2.x += nx;
                                g2.y += ny;
                            }
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

        let cx = 212, cy = 175, cz = 55; // Default Gold RGB
        if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(centerColorHex)) {
            let c = centerColorHex.substring(1).split('');
            if (c.length === 3) {
                c = [c[0], c[0], c[1], c[1], c[2], c[2]];
            }
            c = '0x' + c.join('');
            cx = (c >> 16) & 255;
            cy = (c >> 8) & 255;
            cz = c & 255;
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

        // --- Draw Predefined Group Zones (Fixed Circles) ---
        if (this.graphData.groups && this.graphData.groups.length > 0) {
            this.graphData.groups.forEach(group => {
                if (group.x === undefined || group.y === undefined) return;

                const padding = group._computedRadius || 200;

                // Extract RGB from hex color
                let r = 200, g = 200, b = 200;
                if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(group.color)) {
                    let c = group.color.substring(1).split('');
                    if (c.length === 3) {
                        c = [c[0], c[0], c[1], c[1], c[2], c[2]];
                    }
                    c = '0x' + c.join('');
                    r = (c >> 16) & 255;
                    g = (c >> 8) & 255;
                    b = c & 255;
                }

                // Draw the subtle background circle
                this.context.fillStyle = `rgba(${r}, ${g}, ${b}, 0.08)`;
                this.context.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.5)`;
                this.context.lineWidth = 3;
                this.context.setLineDash([10, 15]); // Dashed border for zones

                this.context.beginPath();
                this.context.arc(group.x, group.y, padding, 0, Math.PI * 2);
                this.context.fill();
                this.context.stroke();

                this.context.setLineDash([]); // Reset line dash

                // Draw the group Image/Icon in the middle (if exists)
                if (group.icon) {
                    // Try to fetch image, or draw it if we have it cached
                    if (!this._iconCache) this._iconCache = {};
                    let img = this._iconCache[group.icon];
                    if (!img) {
                        img = new Image();
                        img.src = group.icon;
                        this._iconCache[group.icon] = img;
                    }

                    if (img.complete && img.naturalWidth > 0) {
                        const iconSize = 60; // 60x60
                        this.context.drawImage(img, group.x - iconSize / 2, group.y - iconSize / 2 - 20, iconSize, iconSize);
                    }
                }

                // Draw the group label at the center (below the icon)
                this.context.fillStyle = `rgba(${r}, ${g}, ${b}, 0.9)`;
                this.context.font = "bold 24px 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
                this.context.textAlign = "center";
                this.context.textBaseline = "middle";

                // Add a subtle text shadow/glow for readability
                this.context.shadowColor = "rgba(0,0,0,0.8)";
                this.context.shadowBlur = 4;
                const nameY = group.icon ? group.y + 25 : group.y; // Shift down if there's an icon
                this.context.fillText(group.name, group.x, nameY);
                this.context.shadowBlur = 0; // Reset
            });
        }
        // ------------------------------------------------

        // Draw Links
        this.context.lineWidth = 2;
        this.context.strokeStyle = "#888";
        this.context.font = "12px 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
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

            const nodeRadius = 30; // Radius of token
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
                const topY = 25; // Label start Y relative to center
                const bottomY = 58; // Label end Y relative to center

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
                const metrics = this.context.measureText(link.label);
                const textWidth = metrics.width;
                const textHeight = 16;
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
        this.graphData.nodes.forEach(node => {
            const radius = 30; // Fixed radius restored
            const pos = renderPos[node.id];

            this.context.save();

            // --- Boss Aura Rendering ---
            if (node.isCenter) {
                const auraTime = Date.now() * 0.003;
                // Subtle pulsating effect using sine wave for the aura ring
                const pulseRadius = radius + 6 + Math.sin(auraTime) * 3;

                this.context.beginPath();
                this.context.arc(pos.x, pos.y, pulseRadius, 0, Math.PI * 2, true);

                // Create a radial gradient for the aura using parsed RGB
                const gradient = this.context.createRadialGradient(pos.x, pos.y, radius, pos.x, pos.y, pulseRadius);
                gradient.addColorStop(0, `rgba(${cx}, ${cy}, ${cz}, 0.8)`); // Solid Inner
                gradient.addColorStop(1, `rgba(${cx}, ${cy}, ${cz}, 0.0)`); // Transparent Outer

                this.context.fillStyle = gradient;
                this.context.fill();

                // Crisp hard line around the token itself
                this.context.beginPath();
                this.context.arc(pos.x, pos.y, radius + 2, 0, Math.PI * 2, true);
                this.context.lineWidth = 3;
                this.context.strokeStyle = `rgba(${cx}, ${cy}, ${cz}, 0.9)`;
                this.context.stroke();
            }
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

            this.context.restore();

            // Draw Label Background for readability
            this.context.font = "bold 15px 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
            const metrics = this.context.measureText(node.name);
            let textWidth = Math.max(metrics.width, 40);

            let roleTextWidth = 0;
            if (node.role) {
                this.context.font = "italic 12px 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
                roleTextWidth = this.context.measureText(node.role).width;
                textWidth = Math.max(textWidth, roleTextWidth);
            }

            const textHeight = node.role ? 36 : 22; // Make background taller if we have a role
            // Base the label offset on the BASE radius, so the label doesn't jump up and down
            const labelYOffset = 30 + (node.role ? 18 : 11); // Push down slightly further if role exists

            this.context.fillStyle = "rgba(0, 0, 0, 0.8)";
            this.context.beginPath();
            this.context.roundRect(pos.x - textWidth / 2 - 6, pos.y + labelYOffset - textHeight / 2, textWidth + 12, textHeight, 6);
            this.context.fill();

            // Gold border for text box
            this.context.lineWidth = 1.5;
            this.context.strokeStyle = "#d4af37";
            this.context.stroke();

            // Draw Node Name Text
            this.context.font = "bold 15px 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
            this.context.fillStyle = "#ffffff";
            this.context.textAlign = "center";
            this.context.textBaseline = "middle";
            this.context.fillText(node.name, pos.x, pos.y + labelYOffset - (node.role ? 7 : 0));

            // Draw Role Text
            if (node.role) {
                this.context.font = "italic 12px 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
                this.context.fillStyle = "#dcd6cc"; // slightly dimmer color
                this.context.fillText(node.role, pos.x, pos.y + labelYOffset + 8);
            }
        });

        this.context.restore();
    }

    dragSubject(event) {
        let s2 = 40 * 40 * this.transform.k; // Increased drag target slop 
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

        // 2. If no node clicked, check if we clicked a group's central core to drag the group
        if (!subject && this.graphData.groups && game.user.isGM) {
            for (let group of this.graphData.groups) {
                if (group.x !== undefined && group.y !== undefined) {

                    // Check if clicked near the absolute center
                    let dx = x - group.x;
                    let dy = y - group.y;
                    let d2 = dx * dx + dy * dy;

                    if (d2 < 60 * 60 * this.transform.k) { // Generous hit area around center (60px)
                        subject = { type: 'group', data: group };
                        break;
                    }
                }
            }
        }

        return subject;
    }

    dragstarted(event) {
        if (!event.active) this.simulation.alphaTarget(0.3).restart();
        if (event.subject.type === 'node') {
            event.subject.data.fx = event.subject.data.x;
            event.subject.data.fy = event.subject.data.y;
        }
    }

    dragged(event) {
        if (event.subject.type === 'node') {
            event.subject.data.fx = event.x;
            event.subject.data.fy = event.y;
        } else if (event.subject.type === 'group') {
            // Drag the entire group zone
            event.subject.data.x = event.x;
            event.subject.data.y = event.y;

            // Wake up simulation so nodes follow
            this.simulation.alpha(0.3).restart();
        }
    }

    dragended(event) {
        if (!event.active) this.simulation.alphaTarget(0);
        if (event.subject.type === 'node') {
            event.subject.data.fx = null;
            event.subject.data.fy = null;
        }
        // Save position data after drag
        this.saveData();
    }

    zoomed(event) {
        this.transform = event.transform;
        this.ticked();
    }
}
