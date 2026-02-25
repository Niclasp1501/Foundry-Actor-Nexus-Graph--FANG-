const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class FangApplication extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "fang-app",
        classes: ["fang-app-window", "common-display"],
        position: {
            width: 1200,
            height: 800
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

        const canvas = this.element.querySelector("#graphCanvas");
        canvas.addEventListener("dblclick", this._onCanvasDoubleClick.bind(this));

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
            } else {
                this.graphData = { nodes: [], links: [] };
            }
        } else {
            this.graphData = { nodes: [], links: [] };
        }
    }

    async saveData() {
        const entry = await this.getJournalEntry();
        if (entry && entry.isOwner) {
            const exportData = {
                nodes: this.graphData.nodes.map(n => ({ id: n.id, name: n.name, x: n.x, y: n.y, vx: n.vx, vy: n.vy })),
                links: this.graphData.links.map(l => ({
                    source: typeof l.source === 'object' ? l.source.id : l.source,
                    target: typeof l.target === 'object' ? l.target.id : l.target,
                    label: l.label,
                    directional: l.directional
                }))
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

            const actors = game.actors.contents.sort((a, b) => a.name.localeCompare(b.name));
            actors.forEach(actor => {
                let optS = document.createElement("option");
                optS.value = actor.id;
                optS.textContent = actor.name;
                selectSource.appendChild(optS);

                let optT = document.createElement("option");
                optT.value = actor.id;
                optT.textContent = actor.name;
                selectTarget.appendChild(optT);
            });
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

    // --- D3 Logic ---

    resizeCanvas() {
        if (!this.canvas) return;
        this.width = this.canvas.parentElement.clientWidth;
        this.height = this.canvas.parentElement.clientHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        if (this.simulation) {
            this.simulation.force("center", d3.forceCenter(this.width / 2, this.height / 2));
            this.simulation.alpha(0.3).restart();
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
                nInfo = { ...d, x: oldNode.x, y: oldNode.y, vx: oldNode.vx, vy: oldNode.vy };
            } else {
                nInfo = { ...d, x: this.width / 2 + (Math.random() - 0.5) * 50, y: this.height / 2 + (Math.random() - 0.5) * 50 };
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

        this.simulation = d3.forceSimulation(nodes)
            .force("charge", d3.forceManyBody().strength(-400))
            .force("link", d3.forceLink(links).id(d => d.id).distance(200))
            .force("center", d3.forceCenter(this.width / 2, this.height / 2))
            .force("collide", d3.forceCollide().radius(40))
            .on("tick", this.ticked.bind(this));

        this.graphData.nodes = nodes;
        this.graphData.links = links;
    }

    ticked() {
        if (!this.context) return;
        this.context.save();
        this.context.clearRect(0, 0, this.width, this.height);
        this.context.translate(this.transform.x, this.transform.y);
        this.context.scale(this.transform.k, this.transform.k);

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

            const dx = link.target.x - link.source.x;
            const dy = link.target.y - link.source.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const midX = (link.source.x + link.target.x) / 2;
            const midY = (link.source.y + link.target.y) / 2;

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

            if (totalParams === 1) {
                ctrlX = midX;
                ctrlY = midY;
                labelX = midX;
                labelY = midY;

                let targetX = link.target.x;
                let targetY = link.target.y;
                let angle = Math.atan2(dy, dx);

                if (link.directional) {
                    // Shorten line to edge of token
                    targetX = link.target.x - Math.cos(angle) * (nodeRadius + 2); // +2 for slight padding
                    targetY = link.target.y - Math.sin(angle) * (nodeRadius + 2);
                }

                this.context.beginPath();
                this.context.moveTo(link.source.x, link.source.y);
                this.context.lineTo(targetX, targetY);
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

                labelX = midX + nx * finalOffset;
                labelY = midY + ny * finalOffset;

                let targetX = link.target.x;
                let targetY = link.target.y;
                let angle = Math.atan2(link.target.y - ctrlY, link.target.x - ctrlX);

                if (link.directional) {
                    targetX = link.target.x - Math.cos(angle) * (nodeRadius + 2);
                    targetY = link.target.y - Math.sin(angle) * (nodeRadius + 2);
                }

                this.context.beginPath();
                this.context.moveTo(link.source.x, link.source.y);
                this.context.quadraticCurveTo(ctrlX, ctrlY, targetX, targetY);
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
            const radius = 30;

            this.context.save();

            if (node.imgElement && node.imgElement.complete && node.imgElement.naturalWidth !== 0) {
                // Just draw the raw token image without extra circles/borders
                this.context.drawImage(node.imgElement, node.x - radius, node.y - radius, radius * 2, radius * 2);
            } else {
                // Fallback fill if not loaded
                this.context.beginPath();
                this.context.arc(node.x, node.y, radius, 0, Math.PI * 2, true);
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
            const textWidth = Math.max(metrics.width, 40);
            const textHeight = 22;
            const labelYOffset = radius + 11;

            this.context.fillStyle = "rgba(0, 0, 0, 0.8)";
            this.context.beginPath();
            this.context.roundRect(node.x - textWidth / 2 - 6, node.y + labelYOffset - textHeight / 2, textWidth + 12, textHeight, 6);
            this.context.fill();

            // Gold border for text box
            this.context.lineWidth = 1.5;
            this.context.strokeStyle = "#d4af37";
            this.context.stroke();

            // Draw text
            this.context.fillStyle = "#ffffff";
            this.context.textAlign = "center";
            this.context.textBaseline = "middle";
            this.context.fillText(node.name, node.x, node.y + labelYOffset);
        });

        this.context.restore();
    }

    dragSubject(event) {
        let s2 = 30 * 30 * this.transform.k;
        let subject = null;
        let x = this.transform.invertX(event.x);
        let y = this.transform.invertY(event.y);

        for (let node of this.graphData.nodes) {
            let dx = x - node.x;
            let dy = y - node.y;
            let d2 = dx * dx + dy * dy;
            if (d2 < s2) {
                subject = node;
                s2 = d2;
            }
        }
        return subject;
    }

    dragstarted(event) {
        if (!event.active) this.simulation.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
    }

    dragged(event) {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
    }

    dragended(event) {
        if (!event.active) this.simulation.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
        // Save position data after drag
        this.saveData();
    }

    zoomed(event) {
        this.transform = event.transform;
        this.ticked();
    }
}
