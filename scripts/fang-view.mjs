/**
 * Was ein Nutzer von FANG sehen darf, als reine Funktionen ohne `game`.
 *
 * Bis zum 23.11.2026 stand diese Logik verteilt in `fang-app.js`, jede Prüfung an der Stelle,
 * an der die Oberfläche sie brauchte. Für die Oberfläche genügte das. Für ein Programm, das
 * für einen anderen Nutzer liest (eine Begleit-App oder ein Zusatzmodul), fehlte eine Stelle,
 * die sagt: „Das hier, und nur das, sieht Spieler X.“ Hätte jedes solche Programm die Regeln
 * nachgebaut, wäre mit der nächsten FANG-Version ein Spoiler entstanden.
 *
 * Deshalb gilt hier:
 *
 * - **Weiße Listen statt schwarzer.** Eine Projektion übernimmt nur Felder, die genannt sind.
 *   Ein neues Feld am Knoten (morgen vielleicht ein Geheimnis) erscheint erst, wenn jemand es
 *   hier ausdrücklich freigibt.
 * - **`fang-app.js` ruft dieselben Funktionen.** Was die Oberfläche zeigt und was
 *   `view.forUser` liefert, kommt aus einer Quelle.
 * - **Ohne `game`, damit es in Node prüfbar ist** (`tools/fang-view-test.mjs`). Ein Nutzer ist
 *   hier `{ id, isGM, ownedActorIds }`, keine Foundry-Instanz.
 *
 * Das ist eine Grenze für das, was gezeigt und weitergegeben wird, keine Verschlüsselung:
 * Foundry liefert jedem Client alle Dokumente, wer die Konsole bedient, liest sie.
 */

const asList = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (v === undefined || v === null ? "" : String(v));

/** Übernimmt aus `source` nur die genannten Felder, die gesetzt sind. */
function pick(source, keys) {
    const out = {};
    for (const key of keys) {
        if (source?.[key] !== undefined) out[key] = clone(source[key]);
    }
    return out;
}

function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/** Ob der Nutzer Besitzer eines Akteurs ist. Akzeptiert Kennung oder `Actor.<id>`. */
export function ownsActor(user, actorRef) {
    if (!user || !actorRef) return false;
    const id = String(actorRef).startsWith("Actor.") ? String(actorRef).slice(6) : String(actorRef);
    return asList(user.ownedActorIds).includes(id);
}

// --- Figuren --------------------------------------------------------------------------------

/** `gmOnly` heißt für Spieler: gibt es nicht. Eine verdeckte Figur ist dagegen sichtbar, als Fassade. */
export function canSeeNode(node, user) {
    if (!node) return false;
    if (!user?.isGM && node.gmOnly === true) return false;
    return true;
}

export function isNodeHidden(node, user) {
    return !!node?.hidden && !user?.isGM;
}

export function nodeName(node, user, unknown = "Unknown") {
    if (!node) return unknown;
    if (isNodeHidden(node, user)) return node.displayName || unknown;
    return node.name || unknown;
}

/** Quest-Verweise am Knoten, wie das Quest-Panel von FANG sie einem Nutzer zeigt. */
export function nodeQuestsFor(node, user) {
    if (!canSeeNode(node, user)) return [];
    if (isNodeHidden(node, user) && node.showHiddenQuestsToPlayers === false) return [];
    return asList(node.questUuids).filter(q => q && (user?.isGM || q.visibleToPlayers !== false));
}

/** Felder einer sichtbaren Figur, die ein Spieler bekommt. */
const NODE_OPEN = ["id", "actorId", "name", "role", "lore", "img", "imgView", "imageSource", "playerNotes", "conditions",
    "isCenter", "isPlaceholder", "placeholderType", "x", "y", "ring", "ringColor", "playerLorePageId"];
/** Felder einer verdeckten Figur: nur die Fassade, kein Akteur, kein Bild, keine Beschreibung. */
const NODE_HIDDEN = ["id", "playerNotes", "conditions", "isPlaceholder", "placeholderType", "x", "y"];

/**
 * Eine Figur, wie der Nutzer sie sieht, oder `null`. Die Spielleitung bekommt alles.
 * `ctx.factionIds` und `ctx.zoneIds` sind die Fraktionen und Orte, die der Nutzer sieht.
 */
export function projectNode(node, user, ctx = {}) {
    if (!canSeeNode(node, user)) return null;
    if (user?.isGM) return clone(node);
    const hidden = isNodeHidden(node, user);
    const out = pick(node, hidden ? NODE_HIDDEN : NODE_OPEN);
    out.name = nodeName(node, user, ctx.unknown);
    out.hidden = hidden;
    // Eine verdeckte Figur zeigt keine Rolle (siehe Beschriftung im Graphen); ihre Fraktion
    // trägt sie wie jede andere, aber nur, wenn die Fraktion selbst sichtbar ist.
    const factionIds = asList(node.factionIds).length ? node.factionIds : (node.factionId ? [node.factionId] : []);
    out.factionIds = factionIds.map(String).filter(id => !ctx.factionIds || ctx.factionIds.has(id));
    out.zoneId = node.zoneId && (!ctx.zoneIds || ctx.zoneIds.has(node.zoneId)) ? node.zoneId : null;
    out.quests = nodeQuestsFor(node, user).map(q => pick(q, ["uuid", "name", "status"]));
    return out;
}

// --- Verbindungen und Fraktionen -------------------------------------------------------------

const endId = (end) => (end && typeof end === "object" ? end.id : end);

export function canSeeLink(link, nodesById, user) {
    if (!link) return false;
    if (!user?.isGM && link.gmOnly === true) return false;
    return canSeeNode(nodesById.get(endId(link.source)), user) && canSeeNode(nodesById.get(endId(link.target)), user);
}

const LINK_OPEN = ["id", "label", "info", "directional", "relationshipType", "type", "pairKey", "questStatus"];

export function projectLink(link, nodesById, user) {
    if (!canSeeLink(link, nodesById, user)) return null;
    if (user?.isGM) return { ...clone(link), source: endId(link.source), target: endId(link.target) };
    return { ...pick(link, LINK_OPEN), source: endId(link.source), target: endId(link.target) };
}

export function canSeeFaction(faction, user) {
    if (!faction) return false;
    return !!user?.isGM || faction.playerVisible !== false;
}

const FACTION_OPEN = ["id", "name", "color", "description", "icon", "img", "showLinesForPlayers", "showInLegendForPlayers"];

export function projectFaction(faction, user) {
    if (!canSeeFaction(faction, user)) return null;
    return user?.isGM ? clone(faction) : pick(faction, FACTION_OPEN);
}

// --- Orte ------------------------------------------------------------------------------------

/**
 * Die Orte, die ein Spieler kennt: selbst angelegt, oder eine Figur, die er sieht, gehört dort
 * hin. `extra` sind Orte, die ein Zusatzmodul hinzufügt (Hook `fang.zonesKnown`, etwa eine
 * Reise in der Chronik). Einen Raum zu kennen heißt nicht, das Haus zu kennen.
 */
export function knownZoneIds(zones, nodes, user, extra = []) {
    const known = new Set(asList(extra).map(String));
    for (const z of asList(zones)) if (z?.createdBy && z.createdBy === user?.id) known.add(z.id);
    for (const node of asList(nodes)) if (node?.zoneId && canSeeNode(node, user)) known.add(node.zoneId);
    return known;
}

export function canSeeZone(zone, user, known = new Set()) {
    if (!zone) return false;
    if (user?.isGM) return true;
    if (zone.playerVisible === false) return false;
    if (zone.reveal !== "visited") return true;
    return known.has(zone.id);
}

export function zoneName(zone, user) {
    if (!zone) return "";
    if (!user?.isGM && zone.hidden) return zone.displayName || "???";
    return zone.name;
}

const ZONE_OPEN = ["id", "type", "color", "description", "img", "imgView", "bannerView", "reveal"];
const ZONE_HIDDEN = ["id", "type", "color", "reveal"];

/** Ein Ort, wie der Nutzer ihn sieht. Liegt er in einem Ort, den der Nutzer nicht kennt, steht er oben. */
export function projectZone(zone, user, visibleIds) {
    if (user?.isGM) return clone(zone);
    const out = pick(zone, zone.hidden ? ZONE_HIDDEN : ZONE_OPEN);
    out.name = zoneName(zone, user);
    out.hidden = !!zone.hidden;
    out.parentId = zone.parentId && visibleIds.has(zone.parentId) ? zone.parentId : null;
    return out;
}

// --- Chronik ---------------------------------------------------------------------------------

/**
 * Für wen ein Eintrag gedacht ist, über „alle Spieler“ hinaus. `onlyFor` nennt Akteure
 * (Kennung oder `Actor.<id>`); dann lesen den Eintrag nur deren Besitzer und die Spielleitung.
 * Gebraucht für die Einträge einer persönlichen Quest: Deren Abschluss stand bis zum 23.11.2026
 * für alle Spieler in der Chronik, sobald die Quest gelöscht oder FANG Premium aus war.
 */
export function entryAudienceAllows(entry, user) {
    if (user?.isGM) return true;
    const only = asList(entry?.onlyFor);
    if (!only.length) return true;
    return only.some(ref => ownsActor(user, ref));
}

/**
 * Ob ein Eintrag für den Nutzer sichtbar ist, nach den Regeln von FANG selbst: Spielleitung
 * alles; Spieler nur `players`, nur wenn `onlyFor` sie einschließt, und nicht, wenn alle
 * Figuren, auf die er verweist, für sie unsichtbar sind.
 */
export function canSeeEntry(entry, user, nodesById) {
    if (!entry) return false;
    if (user?.isGM) return true;
    if (entry.visibility !== "players") return false;
    if (!entryAudienceAllows(entry, user)) return false;
    const nodeRefs = asList(entry.refs).filter(ref => ref?.type === "node");
    if (nodeRefs.length && !nodeRefs.some(ref => canSeeNode(nodesById.get(ref.id), user))) return false;
    const showsSomething = str(entry.playerText).trim() || entry.recapPageId || str(entry.title).trim();
    return !!showsSomething;
}

const ENTRY_OPEN = ["id", "origin", "type", "kind", "createdAt", "updatedAt", "orderKey", "gameDate", "knownSince",
    "visibility", "title", "authorName", "editableByPlayers"];

/**
 * Ein Eintrag, wie der Nutzer ihn liest, oder `null`. Ohne `gmText`, ohne `payload` (dessen
 * Felder gibt ein Zusatzmodul über `fang.viewForUser` frei, das sie kennt), ohne die Kennung
 * eines fremden Autors, und eine Rückblick-Seite nur, wenn `ctx.canReadPage(id)` es erlaubt.
 */
export function projectEntry(entry, user, ctx = {}) {
    const nodesById = ctx.nodesById ?? new Map();
    if (!canSeeEntry(entry, user, nodesById)) return null;
    if (ctx.entryVisible && ctx.entryVisible(entry) === false) return null;
    if (user?.isGM) return clone(entry);
    const out = pick(entry, ENTRY_OPEN);
    out.text = str(entry.playerText);
    out.mine = !!entry.authorUserId && entry.authorUserId === user?.id;
    if (out.mine) out.authorUserId = user.id;
    out.canEdit = out.mine && entry.editableByPlayers !== false;
    out.recapPageId = entry.recapPageId && ctx.canReadPage?.(entry.recapPageId) ? entry.recapPageId : null;
    out.hasRecap = !!entry.recapPageId;
    out.refs = [];
    for (const ref of asList(entry.refs)) {
        if (ref?.type === "node") {
            const node = nodesById.get(ref.id);
            if (!canSeeNode(node, user)) continue;
            out.refs.push({ type: "node", id: ref.id, label: nodeName(node, user, ctx.unknown), canFocus: !isNodeHidden(node, user) });
        } else if (ref?.type === "faction") {
            const faction = ctx.factionsById?.get(ref.id);
            if (!canSeeFaction(faction, user)) continue;
            out.refs.push({ type: "faction", id: ref.id, label: faction.name || "", canFocus: false });
        }
        // Verweise auf Journale und Quests tragen Kennungen, die ein Spieler nicht braucht.
    }
    out.payload = {};
    return out;
}

// --- Rechte ----------------------------------------------------------------------------------

/** Was ein Nutzer in FANG ändern darf, nach den Welteinstellungen. */
export function rightsFor(settings, user) {
    if (user?.isGM) return { graph: true, places: true, chronicle: true, notes: true };
    const allowGraph = settings?.allowPlayerEditing === true;
    return {
        graph: allowGraph,
        places: allowGraph && settings?.playerPlaces === true,
        chronicle: settings?.playerChronicle !== false,
        notes: true
    };
}

/**
 * Darf ein Spieler diesen Chronik-Eintrag ändern? Nur seinen eigenen, nur einen für Spieler
 * sichtbaren, und nur, wenn er änderbar ist. `userId` kommt aus dem Socket (vom Server
 * gesetzt), nicht aus dem, was der Spieler mitschickt.
 */
export function playerMayEditEntry(entry, userId) {
    if (!entry || !userId) return false;
    if (entry.visibility !== "players" || entry.editableByPlayers === false) return false;
    return entry.authorUserId === userId;
}

// --- Die ganze Sicht -------------------------------------------------------------------------

/**
 * Alles, was ein Nutzer von FANG sieht, schon projiziert.
 *
 * `data = { graph, history, settings, notes, knownZoneIds?, canReadPage?, entryVisible? }`:
 * - `graph` der gespeicherte Graph (`nodes`, `links`, `factions`, `zones`)
 * - `history` die Einträge der Chronik (roh, wie in der Einstellung)
 * - `settings` die Welteinstellungen von FANG, die Rechte bestimmen
 * - `notes` die persönlichen Notizen **dieses** Nutzers (`{ [nodeId]: { html, updated } }`)
 * - `knownZoneIds` Orte, die ein Zusatzmodul als bekannt meldet
 * - `canReadPage(pageId)` ob der Nutzer eine Rückblick-Seite lesen darf
 * - `entryVisible(entry)` ein zusätzliches Nein eines Zusatzmoduls (etwa für Quest-Einträge)
 *
 * `user = { id, name, isGM, ownedActorIds }`. `options.unknown` ist das Wort für Unbekannte.
 */
export function viewFor(data, user, options = {}) {
    const graph = data?.graph ?? {};
    const nodes = asList(graph.nodes);
    const nodesById = new Map(nodes.map(n => [n.id, n]));
    const factionsAll = asList(graph.factions);
    const factionsById = new Map(factionsAll.map(f => [f.id, f]));
    const factions = factionsAll.map(f => projectFaction(f, user)).filter(Boolean);
    const factionIds = new Set(factions.map(f => f.id));

    const zonesAll = asList(graph.zones);
    const known = knownZoneIds(zonesAll, nodes, user, data?.knownZoneIds);
    const visibleZoneIds = new Set(zonesAll.filter(z => canSeeZone(z, user, known)).map(z => z.id));
    const zones = zonesAll.filter(z => visibleZoneIds.has(z.id)).map(z => projectZone(z, user, visibleZoneIds));

    const ctx = { unknown: options.unknown ?? "Unknown", factionIds, zoneIds: visibleZoneIds };
    const viewNodes = nodes.map(n => projectNode(n, user, ctx)).filter(Boolean);
    const links = asList(graph.links).map(l => projectLink(l, nodesById, user)).filter(Boolean);

    const entryCtx = { nodesById, factionsById, unknown: ctx.unknown, canReadPage: data?.canReadPage, entryVisible: data?.entryVisible };
    const history = asList(data?.history).map(e => projectEntry(e, user, entryCtx)).filter(Boolean);

    const notes = {};
    for (const [nodeId, note] of Object.entries(data?.notes ?? {})) {
        if (!nodesById.has(nodeId) || !canSeeNode(nodesById.get(nodeId), user)) continue;
        const html = typeof note?.html === "string" ? note.html : "";
        if (html) notes[nodeId] = { html, updated: note.updated ?? null };
    }

    return {
        user: { id: user?.id ?? null, name: user?.name ?? "", isGM: !!user?.isGM },
        rights: rightsFor(data?.settings, user),
        nodes: viewNodes,
        links,
        factions,
        zones,
        history,
        notes
    };
}
