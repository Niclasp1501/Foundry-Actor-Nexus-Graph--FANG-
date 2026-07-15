/**
 * Three-way merge for FANG graph data.
 *
 * FANG stores the whole graph as one blob. Whoever saves last would overwrite every
 * change made by anyone else in the meantime — not just on the same node, on
 * everything. The global edit lock exists to prevent exactly that.
 *
 * This module compares three states, the way git does on a merge:
 *   baseline  the graph as it looked when I loaded it
 *   mine      my current local state
 *   server    the state currently stored, read fresh right before writing
 *
 * From that it can tell who touched what:
 *   mine != baseline, server == baseline  ->  I changed it       -> take mine
 *   mine == baseline, server != baseline  ->  someone else did   -> take server
 *   both changed                          ->  real conflict      -> take mine, report
 *
 * Comparison is per field, so two people editing different fields of the same node
 * both keep their change. Only the same field changed twice is a conflict.
 *
 * No Foundry globals in here on purpose — this file is pure logic so it can be unit
 * tested in plain node. See tools/fang-merge-test.mjs.
 */

/** Node/faction position fields — handled by their own rule, see mergeGraphData. */
export const POSITION_FIELDS = ["x", "y"];

/** Never merged, never compared: pure simulation state that means nothing to others. */
export const VELOCITY_FIELDS = ["vx", "vy", "fx", "fy", "index"];

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Deep value equality. Arrays are compared element-wise and are order-sensitive. */
export function valuesEqual(a, b) {
    if (a === b) return true;
    if (a === null || b === null || a === undefined || b === undefined) return a === b;
    if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
        return a.every((item, i) => valuesEqual(item, b[i]));
    }
    if (isPlainObject(a) && isPlainObject(b)) {
        const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
        for (const key of keys) if (!valuesEqual(a[key], b[key])) return false;
        return true;
    }
    return false;
}

function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function byId(list) {
    const map = new Map();
    for (const item of Array.isArray(list) ? list : []) {
        if (item?.id) map.set(item.id, item);
    }
    return map;
}

/**
 * Merge one element (node/link/faction) field by field.
 * @returns {{ merged: object, conflicts: string[] }} conflicts = names of contested fields
 */
function mergeElement(baseline, mine, server, { skipFields = [] } = {}) {
    const merged = {};
    const conflicts = [];
    const keys = new Set([
        ...Object.keys(baseline ?? {}),
        ...Object.keys(mine ?? {}),
        ...Object.keys(server ?? {})
    ]);

    for (const key of keys) {
        if (skipFields.includes(key)) continue;

        const base = baseline?.[key];
        const ours = mine?.[key];
        const theirs = server?.[key];

        const weChanged = !valuesEqual(ours, base);
        const theyChanged = !valuesEqual(theirs, base);

        if (weChanged && theyChanged) {
            if (!valuesEqual(ours, theirs)) conflicts.push(key);
            merged[key] = clone(ours);          // last writer wins, but we report it
        } else if (weChanged) {
            merged[key] = clone(ours);
        } else if (theyChanged) {
            merged[key] = clone(theirs);
        } else {
            // Untouched by both. Prefer whichever side actually has the field.
            merged[key] = clone(ours !== undefined ? ours : (theirs !== undefined ? theirs : base));
        }

        if (merged[key] === undefined) delete merged[key];
    }

    return { merged, conflicts };
}

/**
 * Positions are special. The d3 simulation rewrites x/y constantly, so a plain
 * comparison would mark every node as "changed by me" and my save would drag every
 * other client's layout along. Only nodes I actually dragged may write a position;
 * for all others the server position wins. Physics drift is not user intent, and the
 * simulation re-settles it within a moment anyway.
 */
function resolvePosition(mine, server, base, wasDraggedByMe) {
    const source = wasDraggedByMe ? mine : (server ?? mine ?? base);
    const out = {};
    for (const field of POSITION_FIELDS) {
        const value = source?.[field];
        if (value !== undefined) out[field] = value;
    }
    return out;
}

/**
 * Merge a collection of id-bearing elements.
 * Deletion always wins: an element removed on either side stays removed, even if the
 * other side edited it. Resurrecting edited-but-deleted elements would spawn zombies
 * nobody asked for — we report it instead.
 */
function mergeCollection(baselineList, mineList, serverList, { draggedIds = null, label = "element" } = {}) {
    const baseMap = byId(baselineList);
    const mineMap = byId(mineList);
    const serverMap = byId(serverList);
    const conflicts = [];
    const merged = [];

    const allIds = new Set([...baseMap.keys(), ...mineMap.keys(), ...serverMap.keys()]);

    for (const id of allIds) {
        const base = baseMap.get(id);
        const ours = mineMap.get(id);
        const theirs = serverMap.get(id);

        const existedBefore = baseMap.has(id);
        const iDeleted = existedBefore && !mineMap.has(id);
        const theyDeleted = existedBefore && !serverMap.has(id);

        if (iDeleted || theyDeleted) {
            // Deletion wins. Only worth reporting if the other side had edited it.
            if (theyDeleted && ours && base && !valuesEqual(ours, base)) {
                conflicts.push({ type: `${label}.deleted`, id, name: ours.name ?? ours.label ?? id, field: null });
            }
            continue;
        }

        if (!existedBefore) {
            // Created on one or both sides since baseline.
            const created = ours ?? theirs;
            if (ours && theirs && !valuesEqual(ours, theirs)) {
                // Same id created twice with different content — practically impossible
                // (ids are random), but do not silently pick one without saying so.
                conflicts.push({ type: `${label}.created`, id, name: created.name ?? created.label ?? id, field: null });
            }
            merged.push(clone(created));
            continue;
        }

        // Present everywhere: field-level merge.
        const skipFields = [...VELOCITY_FIELDS, ...(draggedIds ? POSITION_FIELDS : [])];
        const { merged: mergedElement, conflicts: fieldConflicts } = mergeElement(base, ours, theirs, { skipFields });

        if (draggedIds) {
            Object.assign(mergedElement, resolvePosition(ours, theirs, base, draggedIds.has(id)));
        }

        for (const field of fieldConflicts) {
            conflicts.push({ type: `${label}.field`, id, name: mergedElement.name ?? mergedElement.label ?? id, field });
        }

        merged.push(mergedElement);
    }

    return { merged, conflicts };
}

/**
 * Three-way merge of two graph states against a common baseline.
 *
 * @param {object} baseline        graph as loaded (deep copy, not the live object)
 * @param {object} mine           my current graph
 * @param {object} server         graph currently stored
 * @param {object} [options]
 * @param {Set<string>} [options.draggedNodeIds]  nodes I dragged myself since baseline
 * @returns {{ merged: object, conflicts: Array<{type:string,id:string,name:string,field:string|null}> }}
 */
export function mergeGraphData(baseline, mine, server, { draggedNodeIds = new Set() } = {}) {
    const base = baseline ?? {};
    const ours = mine ?? {};
    const theirs = server ?? {};
    const conflicts = [];

    const nodes = mergeCollection(base.nodes, ours.nodes, theirs.nodes, {
        draggedIds: draggedNodeIds,
        label: "node"
    });
    const links = mergeCollection(base.links, ours.links, theirs.links, { label: "link" });
    const factions = mergeCollection(base.factions, ours.factions, theirs.factions, {
        // Faction hubs are dragged as a unit with the graph; treat their position like
        // any other field rather than tying it to the node drag set.
        label: "faction"
    });

    conflicts.push(...nodes.conflicts, ...links.conflicts, ...factions.conflicts);

    // Everything else on the top level (zones, relationshipTypes, showFactionLines, ...)
    // is merged field by field, so a new top-level feature is covered automatically.
    const { merged, conflicts: topConflicts } = mergeElement(base, ours, theirs, {
        skipFields: ["nodes", "links", "factions"]
    });
    for (const field of topConflicts) {
        conflicts.push({ type: "graph.field", id: null, name: field, field });
    }

    merged.nodes = nodes.merged;
    merged.links = links.merged;
    merged.factions = factions.merged;

    // Referential integrity: a link whose endpoint lost the merge must not survive.
    const nodeIds = new Set(merged.nodes.map(n => n.id));
    merged.links = merged.links.filter(l => nodeIds.has(l.source) && nodeIds.has(l.target));

    return { merged, conflicts };
}
