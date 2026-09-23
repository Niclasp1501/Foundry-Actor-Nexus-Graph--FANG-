/**
 * FANG's tools for Ninjo's Foundry MCP. An AI assistant connected to the world through
 * that module can read the graph and change characters, connections, factions, places and
 * the chronicle, exactly as far as FANG's own api allows.
 *
 * Nothing here runs unless the GM releases "fang" in the MCP module's settings, and every
 * tool that changes something says so, so the MCP's write switch stops it. The tools run
 * in the browser of the GM connected to the bridge, with the GM's rights.
 *
 * Names and ids are both accepted wherever something is referred to: an assistant knows
 * "Tiefwasser", not "a8Kq3...". A name that fits more than one thing is refused with the
 * candidates, rather than guessed.
 */

const MODULE_ID = "fang";

const fang = () => game.modules.get(MODULE_ID)?.api;

function pick(list, ref, label, nameOf = (x) => x.name) {
    if (!ref) throw new Error(`${label} is missing.`);
    const byId = list.find(x => x.id === ref);
    if (byId) return byId;
    const wanted = String(ref).trim().toLowerCase();
    const hits = list.filter(x => String(nameOf(x) ?? "").trim().toLowerCase() === wanted);
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) throw new Error(`"${ref}" fits more than one ${label}: ${hits.map(h => `${nameOf(h)} (${h.id})`).join(", ")}. Use the id.`);
    throw new Error(`No ${label} "${ref}".`);
}

const node = (ref) => pick(fang().nodes.list(), ref, "character or item");
const place = (ref) => pick(fang().zones.list(), ref, "place");
const faction = (ref) => pick(fang().factions.list(), ref, "faction");
const placeOrNull = (ref) => (ref === null || ref === "" || ref === "none" ? null : place(ref).id);

/** What an assistant needs to know about the graph, without positions and internals. */
function overview() {
    const api = fang();
    const zones = api.zones.list();
    const factions = api.factions.list();
    const name = (list, id) => list.find(x => x.id === id)?.name ?? null;
    const nodes = api.nodes.list();
    return {
        characters: nodes.map(n => ({
            id: n.id, name: n.name, role: n.role || null,
            kind: n.placeholderType === "item" ? "item" : (n.actorId ? "actor" : "placeholder"),
            hidden: !!n.hidden, gmOnly: !!n.gmOnly, alias: n.displayName || null,
            place: name(zones, n.zoneId),
            factions: (n.factionIds ?? (n.factionId ? [n.factionId] : [])).map(id => name(factions, id)).filter(Boolean),
            conditions: n.conditions ?? []
        })),
        connections: api.links.list().map(l => ({
            id: l.id, from: name(nodes, l.source), to: name(nodes, l.target), label: l.label || "",
            directional: !!l.directional, hidden: !!l.hidden, gmOnly: !!l.gmOnly
        })),
        factions: factions.map(f => ({ id: f.id, name: f.name, color: f.color, playerVisible: f.playerVisible !== false })),
        places: zones.map(z => ({
            id: z.id, name: z.name, type: z.type, liesIn: name(zones, z.parentId),
            playerVisible: z.playerVisible !== false, hidden: !!z.hidden, alias: z.displayName || null,
            description: z.description || ""
        }))
    };
}

const PLACE_TYPES = ["realm", "region", "city", "district", "building", "other"];

const TOOLS = [
    {
        name: "fang-read",
        description: "Read FANG, the relationship graph of the campaign: characters and items with their place and factions, connections between them, factions, and places (which can lie inside each other). Use `chronicle: true` to also get the chronicle of events, optionally for one character.",
        inputSchema: {
            type: "object",
            properties: {
                chronicle: { type: "boolean", description: "Also return chronicle entries." },
                character: { type: "string", description: "Only the chronicle of this character (name or id)." },
                limit: { type: "number", description: "At most this many chronicle entries, newest first. Default 50." }
            }
        },
        annotations: { readOnlyHint: true },
        handler: async (args = {}) => {
            const out = overview();
            if (args.chronicle || args.character) {
                const id = args.character ? node(args.character).id : null;
                const entries = fang().history.list()
                    .filter(e => !id || (e.refs ?? []).some(r => r.id === id))
                    .slice(-(args.limit || 50)).reverse();
                out.chronicle = entries.map(e => ({
                    id: e.id, title: e.title, date: e.gameDate?.label || null, time: e.gameDate?.time || null,
                    kind: e.kind, visibility: e.visibility, playerText: e.playerText || "", gmText: e.gmText || "",
                    characters: (e.refs ?? []).filter(r => r.type === "node").map(r => out.characters.find(c => c.id === r.id)?.name ?? r.id),
                    place: e.payload?.location?.to ? (out.places.find(p => p.id === e.payload.location.to)?.name ?? null) : null
                }));
            }
            return out;
        }
    },
    {
        name: "fang-place",
        description: "Create, change or delete a place in FANG, or put a character or item at a place. Places nest: a vault can lie in a tower in a city. A hidden place shows players only its alias; a place that is not playerVisible exists for the GM only.",
        inputSchema: {
            type: "object",
            properties: {
                action: { type: "string", enum: ["add", "update", "remove", "assign"] },
                place: { type: "string", description: "The place to change, remove or assign to (name or id). For assign, empty or \"none\" takes the character out of any place." },
                name: { type: "string" },
                type: { type: "string", enum: PLACE_TYPES },
                liesIn: { type: "string", description: "The place it lies in (name or id), or \"none\"." },
                description: { type: "string" },
                img: { type: "string", description: "Image path in the Foundry data folder." },
                playerVisible: { type: "boolean" },
                hidden: { type: "boolean", description: "Show players the alias instead of the name." },
                alias: { type: "string" },
                character: { type: "string", description: "For assign: the character or item (name or id)." }
            },
            required: ["action"]
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
        handler: async (args) => {
            const api = fang();
            const fields = {};
            if (args.name !== undefined) fields.name = args.name;
            if (args.type !== undefined) fields.type = args.type;
            if (args.description !== undefined) fields.description = args.description;
            if (args.img !== undefined) fields.img = args.img;
            if (args.playerVisible !== undefined) fields.playerVisible = args.playerVisible;
            if (args.hidden !== undefined) fields.hidden = args.hidden;
            if (args.alias !== undefined) fields.displayName = args.alias;
            if (args.liesIn !== undefined) fields.parentId = placeOrNull(args.liesIn);
            switch (args.action) {
                case "add": {
                    if (!args.name) throw new Error("A new place needs a name.");
                    const made = await api.zones.add(fields);
                    return `Place "${made.name}" created (${made.id}).`;
                }
                case "update": {
                    const target = place(args.place);
                    await api.zones.update(target.id, fields);
                    return `Place "${fields.name ?? target.name}" changed.`;
                }
                case "remove": {
                    const target = place(args.place);
                    await api.zones.remove(target.id);
                    return `Place "${target.name}" removed. What lay in it moved up one level.`;
                }
                case "assign": {
                    const who = node(args.character);
                    const where = placeOrNull(args.place);
                    await api.zones.assign(who.id, where);
                    return where ? `${who.name} is now at ${place(where).name}.` : `${who.name} is at no place now.`;
                }
                default: throw new Error(`Unknown action "${args.action}".`);
            }
        }
    },
    {
        name: "fang-character",
        description: "Add a character or item to FANG, change it, or remove it from the graph. `actor` adds an existing Foundry actor; without it a placeholder is created (use kind \"item\" for an item).",
        inputSchema: {
            type: "object",
            properties: {
                action: { type: "string", enum: ["add", "update", "remove"] },
                character: { type: "string", description: "For update and remove: the character or item (name or id)." },
                actor: { type: "string", description: "For add: an actor in the world (name, id or uuid)." },
                name: { type: "string" },
                kind: { type: "string", enum: ["character", "item"] },
                role: { type: "string" },
                img: { type: "string" },
                hidden: { type: "boolean", description: "Players see the alias instead of the name." },
                gmOnly: { type: "boolean", description: "Players do not see it at all." },
                alias: { type: "string" },
                place: { type: "string", description: "Place (name or id), or \"none\"." },
                factions: { type: "array", items: { type: "string" }, description: "Factions (names or ids), replacing the current ones." },
                conditions: { type: "array", items: { type: "string", enum: ["deceased", "missing", "captured", "questgiver"] } }
            },
            required: ["action"]
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
        handler: async (args) => {
            const api = fang();
            const fields = {};
            for (const key of ["name", "role", "img", "hidden", "gmOnly", "conditions"]) if (args[key] !== undefined) fields[key] = args[key];
            if (args.alias !== undefined) fields.displayName = args.alias;
            if (args.place !== undefined) fields.zoneId = placeOrNull(args.place);
            if (Array.isArray(args.factions)) fields.factionIds = args.factions.map(f => faction(f).id);
            switch (args.action) {
                case "add": {
                    let actor = null;
                    if (args.actor) {
                        actor = String(args.actor).includes(".") ? await fromUuid(args.actor) : (game.actors.get(args.actor) ?? game.actors.getName(args.actor));
                        if (!actor) throw new Error(`No actor "${args.actor}" in this world.`);
                    } else if (!args.name) throw new Error("Give an actor, or a name for a placeholder.");
                    const made = await api.nodes.add({ ...fields, ...(actor ? { actorUuid: actor.uuid } : { type: args.kind === "item" ? "item" : undefined }) });
                    return `"${made.name}" is in the graph (${made.id}).`;
                }
                case "update": {
                    const target = node(args.character);
                    await api.nodes.update(target.id, fields);
                    return `"${fields.name ?? target.name}" changed.`;
                }
                case "remove": {
                    const target = node(args.character);
                    await api.nodes.remove(target.id);
                    return `"${target.name}" and its connections were removed from the graph. The actor itself is untouched.`;
                }
                default: throw new Error(`Unknown action "${args.action}".`);
            }
        }
    },
    {
        name: "fang-connection",
        description: "Connect two characters in FANG with a labelled line (\"owes money to\", \"hates\"), change such a connection, or remove it.",
        inputSchema: {
            type: "object",
            properties: {
                action: { type: "string", enum: ["add", "update", "remove"] },
                id: { type: "string", description: "For update and remove: the connection id. Alternatively give from and to." },
                from: { type: "string", description: "Character (name or id)." },
                to: { type: "string", description: "Character (name or id)." },
                label: { type: "string" },
                directional: { type: "boolean", description: "Draw an arrow from `from` to `to`." },
                hidden: { type: "boolean" },
                gmOnly: { type: "boolean" }
            },
            required: ["action"]
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
        handler: async (args) => {
            const api = fang();
            const fields = {};
            for (const key of ["label", "directional", "hidden", "gmOnly"]) if (args[key] !== undefined) fields[key] = args[key];
            const find = () => {
                if (args.id) return api.links.list().find(l => l.id === args.id) ?? (() => { throw new Error(`No connection ${args.id}.`); })();
                const a = node(args.from).id, b = node(args.to).id;
                const hits = api.links.list().filter(l => (l.source === a && l.target === b) || (l.source === b && l.target === a));
                if (hits.length !== 1) throw new Error(hits.length ? "More than one connection between them. Use the id from fang-read." : "No connection between them.");
                return hits[0];
            };
            switch (args.action) {
                case "add": {
                    const made = await api.links.add({ ...fields, source: node(args.from).id, target: node(args.to).id });
                    return `Connected (${made.id}).`;
                }
                case "update": { const link = find(); await api.links.update(link.id, fields); return "Connection changed."; }
                case "remove": { const link = find(); await api.links.remove(link.id); return "Connection removed."; }
                default: throw new Error(`Unknown action "${args.action}".`);
            }
        }
    },
    {
        name: "fang-faction",
        description: "Create, change or delete a faction in FANG. Characters join factions through fang-character.",
        inputSchema: {
            type: "object",
            properties: {
                action: { type: "string", enum: ["add", "update", "remove"] },
                faction: { type: "string", description: "For update and remove: name or id." },
                name: { type: "string" },
                color: { type: "string", description: "Hex colour such as #8b0000." },
                description: { type: "string" },
                playerVisible: { type: "boolean" }
            },
            required: ["action"]
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
        handler: async (args) => {
            const api = fang();
            const fields = {};
            for (const key of ["name", "color", "description", "playerVisible"]) if (args[key] !== undefined) fields[key] = args[key];
            switch (args.action) {
                case "add": { if (!args.name) throw new Error("A faction needs a name."); const made = await api.factions.add(fields); return `Faction "${made.name}" created (${made.id}).`; }
                case "update": { const f = faction(args.faction); await api.factions.update(f.id, fields); return `Faction "${fields.name ?? f.name}" changed.`; }
                case "remove": { const f = faction(args.faction); await api.factions.remove(f.id); return `Faction "${f.name}" removed; its members keep everything else.`; }
                default: throw new Error(`Unknown action "${args.action}".`);
            }
        }
    },
    {
        name: "fang-chronicle",
        description: "Write, change or delete an entry in FANG's chronicle: what happened, to whom, optionally where. Entries are dated with the game calendar's current date unless a date is given. `visibility` \"players\" shows the player text to players; the GM text stays private.",
        inputSchema: {
            type: "object",
            properties: {
                action: { type: "string", enum: ["add", "update", "remove"] },
                id: { type: "string", description: "For update and remove: the entry id from fang-read." },
                title: { type: "string" },
                playerText: { type: "string" },
                gmText: { type: "string" },
                characters: { type: "array", items: { type: "string" }, description: "Who it is about or who was there (names or ids)." },
                place: { type: "string", description: "Where it happened (name or id). With FANG Premium this moves the characters there." },
                visibility: { type: "string", enum: ["gm", "players"] },
                kind: { type: "string", enum: ["insight", "encounter", "relationship", "faction", "quest", "note"] }
            },
            required: ["action"]
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
        handler: async (args) => {
            const api = fang();
            const ids = Array.isArray(args.characters) ? args.characters.map(c => node(c).id) : undefined;
            const payload = args.place ? { location: { from: null, to: place(args.place).id }, travellers: ids ?? [] } : undefined;
            switch (args.action) {
                case "add": {
                    if (!args.title) throw new Error("An entry needs a title.");
                    const id = await api.history.add({ title: args.title, playerText: args.playerText ?? "", gmText: args.gmText ?? "",
                        nodeIds: ids, visibility: args.visibility ?? "gm", kind: args.kind ?? "insight", payload });
                    if (!id) throw new Error("FANG did not create the entry.");
                    return `Entry written (${id}).`;
                }
                case "update": {
                    if (!args.id) throw new Error("Give the entry id.");
                    const patch = {};
                    for (const key of ["title", "playerText", "gmText", "visibility", "kind"]) if (args[key] !== undefined) patch[key] = args[key];
                    if (ids) patch.nodeIds = ids;
                    if (payload) patch.payload = payload;
                    if (!(await api.history.update(args.id, patch))) throw new Error(`No entry ${args.id}.`);
                    return "Entry changed.";
                }
                case "remove": {
                    if (!args.id) throw new Error("Give the entry id.");
                    if (!(await api.history.remove(args.id))) throw new Error(`No entry ${args.id}.`);
                    return "Entry removed.";
                }
                default: throw new Error(`Unknown action "${args.action}".`);
            }
        }
    }
];

// Subscribed at the top level: the MCP module sends the hook at its init and again at ready,
// and FANG may load before or after it.
Hooks.on("ninjos-foundry-mcp.registerTools", (register) => {
    if (!fang()) return;
    for (const tool of TOOLS) {
        const result = register(MODULE_ID, tool);
        if (!result?.accepted) console.debug(`FANG | MCP tool ${tool.name} not offered: ${result?.reason}`);
    }
});

