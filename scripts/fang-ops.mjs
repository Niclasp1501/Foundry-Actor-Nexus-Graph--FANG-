/**
 * Changes as operations instead of whole-graph states.
 *
 * The three-way merge in fang-merge.mjs answers "what did I change?" by comparing three
 * complete graphs every time someone saves. This module makes that answer explicit: a
 * save first works out the list of operations between the baseline and the current
 * state, and the writer applies that list to whatever is stored right now.
 *
 *   diffGraph(base, mine)      ->  [ op, op, ... ]        what I did
 *   applyOps(stored, ops)      ->  { state, conflicts }   what the graph is now
 *   invertOps(ops)             ->  [ op, ... ]            how to take it back
 *
 * Nothing at the 26 call sites of saveData() had to change for this: the diff is taken
 * once, at save time, from the two states that were already there. What the list buys
 * is everything the state comparison could not give:
 *
 *   - a relay carries a few operations instead of a whole graph plus its baseline
 *   - a conflict names the field, the value that was there and the value that won
 *   - every operation knows the value it replaced, so undo is the inverted list
 *   - the writer can keep a log of who changed what, when
 *
 * The result of apply(stored, diff(base, mine)) is the same graph the three-way merge
 * produces from (base, mine, stored). tools/fang-ops-test.mjs proves that on every
 * scenario the merge tests cover, plus the ones only operations can express.
 *
 * No Foundry globals in here on purpose, same as fang-merge.mjs.
 */

import { valuesEqual, POSITION_FIELDS, VELOCITY_FIELDS } from "./fang-merge.mjs";

/** The three collections of id-bearing elements a graph consists of. */
export const COLLECTIONS = ["nodes", "links", "factions"];

/** Top-level keys that are not user data and never become an operation. */
const TOP_LEVEL_SKIP = new Set([...COLLECTIONS, "schemaVersion"]);

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

/** An element as it is stored: without the simulation's scratch fields. */
function stripRuntime(element) {
    const copy = { ...element };
    for (const field of VELOCITY_FIELDS) delete copy[field];
    return copy;
}

function elementName(element, id) {
    return element?.name ?? element?.label ?? id;
}

/**
 * The operations that turn `base` into `mine`.
 *
 * Positions of nodes are only reported for nodes in `draggedNodeIds`: the simulation
 * moves every node all the time, and only a node someone actually dragged carries
 * intent. Factions have no simulation of their own, so their position is an ordinary
 * field. Velocity and index fields are never reported.
 *
 * @param {object} base
 * @param {object} mine
 * @param {{ draggedNodeIds?: Set<string> }} [options]
 * @returns {Array<object>}
 */
export function diffGraph(base, mine, { draggedNodeIds = new Set() } = {}) {
    const ops = [];
    const b = base ?? {};
    const m = mine ?? {};

    for (const coll of COLLECTIONS) {
        const baseMap = byId(b[coll]);
        const mineMap = byId(m[coll]);
        const kind = coll.slice(0, -1);   // node, link, faction

        for (const [id, before] of baseMap) {
            if (!mineMap.has(id)) ops.push({ op: "remove", coll, kind, id, prev: stripRuntime(before) });
        }

        for (const [id, after] of mineMap) {
            const before = baseMap.get(id);
            if (!before) { ops.push({ op: "add", coll, kind, id, value: stripRuntime(after) }); continue; }

            const fields = new Set([...Object.keys(before), ...Object.keys(after)]);
            for (const field of fields) {
                if (VELOCITY_FIELDS.includes(field)) continue;
                if (coll === "nodes" && POSITION_FIELDS.includes(field) && !draggedNodeIds.has(id)) continue;
                const prev = before[field];
                const value = after[field];
                if (valuesEqual(prev, value)) continue;
                ops.push({ op: "set", coll, kind, id, field, value: clone(value), prev: clone(prev) });
            }
        }
    }

    const topKeys = new Set([...Object.keys(b), ...Object.keys(m)].filter(k => !TOP_LEVEL_SKIP.has(k)));
    for (const field of topKeys) {
        const prev = b[field];
        const value = m[field];
        if (valuesEqual(prev, value)) continue;
        ops.push({ op: "setTop", field, value: clone(value), prev: clone(prev) });
    }

    return ops;
}

/**
 * Apply operations to a stored state and return the new state.
 *
 * The stored state is never modified; the result is a copy. Every operation is applied
 * in order. Rules, chosen to match the three-way merge exactly:
 *
 *   - a removed element stays removed, whatever anyone did to it since (deletion wins)
 *   - a set on an element that is gone is dropped and reported as "<kind>.deleted"
 *   - a set whose element still holds the value the operation expected applies quietly
 *   - a set whose element already holds the new value is a no-op
 *   - a set whose element holds something else applies anyway (last writer wins) and is
 *     reported as "<kind>.field", with both values, so the caller can show them
 *   - positions never count as a conflict: two people dragging the same node is not a
 *     disagreement about facts, the later drop simply wins
 *   - an add whose id already exists replaces the element and is reported as
 *     "<kind>.created" unless the two are identical
 *
 * A link whose endpoint is gone after all operations is dropped, as the merge does.
 *
 * With `strict`, an operation whose expectation no longer holds (the field moved on, an
 * element with that id exists) is skipped and counted instead of applied. That is the
 * mode for undo: taking one change back must never overwrite a newer one.
 *
 * @param {object} stored
 * @param {Array<object>} ops
 * @param {{ strict?: boolean }} [options]
 * @returns {{ state: object, conflicts: Array<object>, applied: number, skipped: number }}
 */
export function applyOps(stored, ops, { strict = false } = {}) {
    const state = clone(stored ?? {});
    for (const coll of COLLECTIONS) state[coll] = Array.isArray(state[coll]) ? state[coll] : [];
    const conflicts = [];
    let applied = 0;
    let skipped = 0;

    const maps = Object.fromEntries(COLLECTIONS.map(coll => [coll, byId(state[coll])]));

    for (const op of Array.isArray(ops) ? ops : []) {
        if (!op || typeof op !== "object") continue;

        if (op.op === "setTop") {
            const current = state[op.field];
            if (valuesEqual(current, op.value)) continue;
            if (!valuesEqual(current, op.prev)) {
                // In strict mode a value that moved on since is left alone: this is what
                // undo needs, so taking back one change never wipes out a newer one.
                if (strict) { skipped++; continue; }
                conflicts.push({ type: "graph.field", id: null, name: op.field, field: op.field, theirs: clone(current), mine: clone(op.value) });
            }
            if (op.value === undefined) delete state[op.field]; else state[op.field] = clone(op.value);
            applied++;
            continue;
        }

        if (!COLLECTIONS.includes(op.coll) || !op.id) continue;
        const map = maps[op.coll];
        const kind = op.kind ?? op.coll.slice(0, -1);

        if (op.op === "remove") {
            if (!map.has(op.id)) continue;
            map.delete(op.id);
            applied++;
            continue;
        }

        if (op.op === "add") {
            const existing = map.get(op.id);
            if (existing && valuesEqual(existing, op.value)) continue;
            if (existing) {
                // Strict: something with that id lives there now; do not replace it.
                if (strict) { skipped++; continue; }
                conflicts.push({ type: `${kind}.created`, id: op.id, name: elementName(op.value, op.id), field: null });
            }
            map.set(op.id, clone(op.value));
            applied++;
            continue;
        }

        if (op.op === "set") {
            const element = map.get(op.id);
            if (!element) {
                conflicts.push({ type: `${kind}.deleted`, id: op.id, name: op.id, field: op.field });
                continue;
            }
            const current = element[op.field];
            if (valuesEqual(current, op.value)) continue;
            const isPosition = op.coll !== "links" && POSITION_FIELDS.includes(op.field);
            if (!isPosition && !valuesEqual(current, op.prev)) {
                if (strict) { skipped++; continue; }
                conflicts.push({ type: `${kind}.field`, id: op.id, name: elementName(element, op.id), field: op.field, theirs: clone(current), mine: clone(op.value) });
            }
            if (op.value === undefined) delete element[op.field]; else element[op.field] = clone(op.value);
            applied++;
        }
    }

    for (const coll of COLLECTIONS) state[coll] = Array.from(maps[coll].values());

    const nodeIds = new Set(state.nodes.map(n => n.id));
    state.links = state.links.filter(l => nodeIds.has(l.source) && nodeIds.has(l.target));

    return { state, conflicts, applied, skipped };
}

/**
 * The operations that take a list back, in reverse order.
 * Applying invertOps(ops) after ops restores the element values the ops replaced.
 */
export function invertOps(ops) {
    const out = [];
    for (const op of [...(Array.isArray(ops) ? ops : [])].reverse()) {
        if (!op) continue;
        switch (op.op) {
            case "add": out.push({ op: "remove", coll: op.coll, kind: op.kind, id: op.id, prev: clone(op.value) }); break;
            case "remove": out.push({ op: "add", coll: op.coll, kind: op.kind, id: op.id, value: clone(op.prev) }); break;
            case "set": out.push({ op: "set", coll: op.coll, kind: op.kind, id: op.id, field: op.field, value: clone(op.prev), prev: clone(op.value) }); break;
            case "setTop": out.push({ op: "setTop", field: op.field, value: clone(op.prev), prev: clone(op.value) }); break;
            default: break;
        }
    }
    return out;
}

/**
 * A one-line, human-readable account of what a list of operations did, for the log.
 * Counts per kind of change; the full list stays with the entry.
 */
export function summarizeOps(ops) {
    const counts = { add: 0, remove: 0, set: 0, setTop: 0 };
    for (const op of Array.isArray(ops) ? ops : []) if (op?.op in counts) counts[op.op]++;
    return counts;
}
