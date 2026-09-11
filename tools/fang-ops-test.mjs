/**
 * Unit tests for operations (scripts/fang-ops.mjs).
 * Run: node tools/fang-ops-test.mjs
 *
 * The first block is the contract that matters most: for every situation the merge
 * tests cover, applying the diff to the stored state gives the same graph the three-way
 * merge gives. If that ever breaks, the operations model silently disagrees with the
 * behaviour every FANG world has relied on since the merge was introduced.
 */
import { mergeGraphData, valuesEqual } from "../scripts/fang-merge.mjs";
import { diffGraph, applyOps, invertOps, summarizeOps } from "../scripts/fang-ops.mjs";

let failed = 0;
let passed = 0;
const ok = (cond, msg) => {
    if (cond) { passed++; console.log(`  OK    ${msg}`); }
    else { failed++; console.log(`  FAIL  ${msg}`); }
};
const section = (title) => console.log(`\n--- ${title} ---`);
const clone = (o) => JSON.parse(JSON.stringify(o));

const node = (id, extra = {}) => ({ id, name: id, lore: "", role: "", factionId: null, factionIds: [], hidden: false, x: 0, y: 0, ...extra });
const baseGraph = () => ({
    schemaVersion: 2,
    nodes: [node("elara", { lore: "Eine Hexe.", x: 100, y: 100 }), node("garrek", { role: "Söldner", x: 200, y: 200 }), node("mira", { x: 300, y: 300 })],
    links: [{ id: "l1", source: "elara", target: "garrek", label: "kennt", directional: false }],
    factions: [{ id: "f1", name: "Kreis", color: "#f00", x: 50, y: 50 }],
    zones: [],
    showFactionLines: true
});

/** Order-free, undefined-free view of a graph, so two equal graphs compare equal. */
const normal = (g) => {
    const sortById = (list) => [...(list ?? [])].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const out = clone({ ...g, nodes: sortById(g.nodes), links: sortById(g.links), factions: sortById(g.factions) });
    return out;
};
const sameGraph = (a, b) => valuesEqual(normal(a), normal(b));

/** The contract: apply(stored, diff(base, mine)) == merge(base, mine, stored). */
const gleichwertig = (name, base, mine, server, opts = {}) => {
    const ops = diffGraph(base, mine, opts);
    const { state } = applyOps(server, ops);
    const { merged } = mergeGraphData(base, mine, server, opts);
    const gleich = sameGraph(state, merged);
    ok(gleich, `Gleichwertig mit dem Abgleich: ${name}`);
    if (!gleich) {
        console.log("     ops:   ", JSON.stringify(ops));
        console.log("     ops -> ", JSON.stringify(normal(state)));
        console.log("     merge->", JSON.stringify(normal(merged)));
    }
    return { ops, state };
};

section("A. Gleichwertigkeit mit dem Dreifach-Abgleich");
{
    // 1. different nodes
    const base = baseGraph(); const mine = clone(base); const server = clone(base);
    mine.nodes[0].lore = "Meine Hexe."; server.nodes[1].role = "Hauptmann";
    gleichwertig("verschiedene Knoten", base, mine, server);
}
{
    // 2. same node, different fields
    const base = baseGraph(); const mine = clone(base); const server = clone(base);
    mine.nodes[0].lore = "Neu"; server.nodes[0].role = "Erzmagierin";
    gleichwertig("selber Knoten, verschiedene Felder", base, mine, server);
}
{
    // 3. same field: mine wins
    const base = baseGraph(); const mine = clone(base); const server = clone(base);
    mine.nodes[0].lore = "Meins"; server.nodes[0].lore = "Ihres";
    const { state } = gleichwertig("selbes Feld", base, mine, server);
    ok(state.nodes.find(n => n.id === "elara").lore === "Meins", "letzter Schreiber gewinnt");
}
{
    // 4. deleted by them, edited by me
    const base = baseGraph(); const mine = clone(base); const server = clone(base);
    mine.nodes[1].role = "Neu"; server.nodes = server.nodes.filter(n => n.id !== "garrek");
    gleichwertig("von ihnen geloescht, von mir bearbeitet", base, mine, server);
    // deleted by me, edited by them
    const mine2 = clone(base); const server2 = clone(base);
    mine2.nodes = mine2.nodes.filter(n => n.id !== "garrek"); server2.nodes[1].role = "Neu";
    gleichwertig("von mir geloescht, von ihnen bearbeitet", base, mine2, server2);
}
{
    // 5. positions: dragged wins, undragged is drift
    const base = baseGraph(); const mine = clone(base); const server = clone(base);
    mine.nodes[0].x = 999; mine.nodes[1].x = 555; server.nodes[1].x = 444;
    gleichwertig("gezogener Knoten schreibt, Drift nicht", base, mine, server, { draggedNodeIds: new Set(["elara"]) });
}
{
    // 6. created on both sides, links, factions, top-level
    const base = baseGraph(); const mine = clone(base); const server = clone(base);
    mine.nodes.push(node("neu-mein")); server.nodes.push(node("neu-ihr"));
    mine.links.push({ id: "l2", source: "elara", target: "mira", label: "Freundin" });
    server.links = server.links.filter(l => l.id !== "l1");
    mine.factions[0].color = "#0f0"; server.factions.push({ id: "f2", name: "Gilde", color: "#00f", x: 0, y: 0 });
    mine.showFactionLines = false; server.zones = [{ id: "z1", name: "Stadt" }];
    gleichwertig("beidseitig angelegt, Verbindungen, Fraktionen, oberste Ebene", base, mine, server);
}
{
    // 7. link to a node the other side deleted
    const base = baseGraph(); const mine = clone(base); const server = clone(base);
    mine.links.push({ id: "l2", source: "garrek", target: "mira", label: "x" });
    server.nodes = server.nodes.filter(n => n.id !== "garrek");
    const { state } = gleichwertig("Verbindung zu einem geloeschten Knoten", base, mine, server);
    ok(!state.links.some(l => l.id === "l2"), "und die Verbindung ohne Endpunkt faellt weg");
}
{
    // 8. nothing changed
    const base = baseGraph();
    const { ops } = gleichwertig("nichts geaendert", base, clone(base), clone(base));
    ok(ops.length === 0, "keine Vorgaenge, wenn nichts passiert ist");
}
{
    // 9. faction list field (scenario 16)
    const base = baseGraph(); const mine = clone(base); const server = clone(base);
    mine.nodes[0].factionIds = ["f1", "f2"]; server.nodes[0].lore = "anders";
    gleichwertig("Fraktionsliste neben fremder Textaenderung", base, mine, server);
}
{
    // 10. relay chain (scenario 14): player -> GM -> stored, baseline must not move
    const server0 = baseGraph();
    const playerMine = clone(server0); playerMine.nodes.push(node("ph-neu", { name: "Unbekannter Kontakt" }));
    const playerOps = diffGraph(server0, playerMine);
    const gmLive = applyOps(clone(server0), playerOps).state;          // GM applied the relay
    const gmOps = diffGraph(server0, gmLive);                          // GM saves against unchanged baseline
    const stored = applyOps(clone(server0), gmOps).state;
    ok(!!stored.nodes.find(n => n.id === "ph-neu"), "Relay: der neue Knoten des Spielers landet im Speicher");
    const wrong = diffGraph(gmLive, gmLive);                           // baseline moved: nothing to say
    ok(wrong.length === 0, "BELEG: mitgewanderte Grundlage haette nichts zu speichern gehabt");
}
{
    // 11. unloaded GM (scenario 17) is not a problem for operations at all
    const server = baseGraph();
    const playerMine = clone(server); playerMine.links.push({ id: "l9", source: "garrek", target: "mira", label: "neu" });
    const ops = diffGraph(server, playerMine);
    const { state } = applyOps(server, ops);
    ok(state.nodes.length === 3 && state.links.some(l => l.id === "l9"), "Vorgaenge brauchen keinen geladenen Empfaengerstand");
}

section("B. Was nur Vorgaenge koennen");
{
    const base = baseGraph(); const mine = clone(base);
    mine.nodes[0].lore = "Neu"; mine.nodes.push(node("x")); mine.links = []; mine.showFactionLines = false;
    const ops = diffGraph(base, mine);
    const counts = summarizeOps(ops);
    ok(counts.set === 1 && counts.add === 1 && counts.remove === 1 && counts.setTop === 1, "Zusammenfassung zaehlt je Art");
    ok(ops.find(o => o.op === "set").prev === "Eine Hexe.", "ein set kennt den vorherigen Wert");
    ok(ops.find(o => o.op === "remove").prev.label === "kennt", "ein remove traegt den geloeschten Eintrag");

    // Undo: apply, then apply the inverse, and we are back.
    const after = applyOps(base, ops).state;
    const back = applyOps(after, invertOps(ops)).state;
    ok(sameGraph(back, base), "invertOps stellt den Ausgangszustand wieder her");
}
{
    // Conflicts name both values.
    const base = baseGraph(); const mine = clone(base); const stored = clone(base);
    mine.nodes[0].lore = "Meins"; stored.nodes[0].lore = "Ihres";
    const { conflicts } = applyOps(stored, diffGraph(base, mine));
    const c = conflicts.find(x => x.type === "node.field");
    ok(!!c && c.theirs === "Ihres" && c.mine === "Meins", "ein Konflikt nennt beide Werte");
    ok(c.name === "elara" && c.field === "lore", "und Element und Feld");
}
{
    // A set that already holds the new value is not a conflict; positions never are.
    const base = baseGraph(); const mine = clone(base); const stored = clone(base);
    mine.nodes[0].lore = "Gleich"; stored.nodes[0].lore = "Gleich";
    mine.nodes[1].x = 10; stored.nodes[1].x = 20;
    const { conflicts, applied } = applyOps(stored, diffGraph(base, mine, { draggedNodeIds: new Set(["garrek"]) }));
    ok(!conflicts.some(c => c.field === "lore"), "gleicher Wert auf beiden Seiten ist kein Konflikt");
    ok(!conflicts.some(c => c.field === "x"), "zwei Leute ziehen denselben Knoten: kein Konflikt");
    ok(applied === 1, "aber die Position wurde geschrieben");
}
{
    // A set on an element the store no longer has is dropped and reported.
    const base = baseGraph(); const mine = clone(base); const stored = clone(base);
    mine.nodes[1].role = "Neu"; stored.nodes = stored.nodes.filter(n => n.id !== "garrek");
    const { state, conflicts } = applyOps(stored, diffGraph(base, mine));
    ok(!state.nodes.some(n => n.id === "garrek"), "Loeschen gewinnt");
    ok(conflicts.some(c => c.type === "node.deleted" && c.id === "garrek"), "und wird gemeldet");
}
{
    // Velocity fields never become operations, even when the live graph carries them.
    const base = baseGraph(); const mine = clone(base);
    mine.nodes[0].vx = 3; mine.nodes[0].fx = 100; mine.nodes[0].index = 7;
    ok(diffGraph(base, mine).length === 0, "Simulationsfelder erzeugen keine Vorgaenge");
}
{
    // The stored state is never modified.
    const base = baseGraph(); const mine = clone(base); mine.nodes[0].lore = "Neu";
    const stored = clone(base); const before = JSON.stringify(stored);
    applyOps(stored, diffGraph(base, mine));
    ok(JSON.stringify(stored) === before, "applyOps laesst den Eingabestand unangetastet");
}

console.log(`\n${failed === 0 ? "=== ALLE TESTS BESTANDEN ===" : `=== ${failed} FEHLER ===`}  (${passed} ok, ${failed} fail)\n`);
process.exit(failed ? 1 : 0);
