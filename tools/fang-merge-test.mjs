/**
 * Unit tests for the three-way graph merge.
 * Run: node tools/fang-merge-test.mjs
 *
 * Mirrors the scenarios from the collaboration concept. Scenario 6 (physics drift) is
 * the reason the position handling exists at all — if that one ever breaks, saving a
 * bit of lore will start yanking everyone else's layout around.
 */
import { mergeGraphData, valuesEqual, structurallyEqual } from "../scripts/fang-merge.mjs";

let failed = 0;
let passed = 0;
const ok = (cond, msg) => {
    if (cond) { passed++; console.log(`  OK    ${msg}`); }
    else { failed++; console.log(`  FAIL  ${msg}`); }
};
const section = (title) => console.log(`\n--- ${title} ---`);
const clone = (o) => JSON.parse(JSON.stringify(o));

const node = (id, extra = {}) => ({ id, name: id, lore: "", role: "", factionId: null, hidden: false, x: 0, y: 0, ...extra });
const baseGraph = () => ({
    nodes: [node("elara", { lore: "Eine Hexe.", x: 100, y: 100 }), node("garrek", { role: "Söldner", x: 200, y: 200 })],
    links: [{ id: "l1", source: "elara", target: "garrek", label: "kennt", directional: false }],
    factions: [{ id: "f1", name: "Kreis", color: "#f00", x: 50, y: 50 }],
    zones: [],
    showFactionLines: true
});

// 1 — different nodes
section("1. Verschiedene Nodes");
{
    const base = baseGraph();
    const mine = clone(base); mine.nodes[0].lore = "Eine mächtige Hexe.";
    const server = clone(base); server.nodes[1].role = "Hauptmann";
    const { merged, conflicts } = mergeGraphData(base, mine, server);
    ok(merged.nodes.find(n => n.id === "elara").lore === "Eine mächtige Hexe.", "meine Lore-Änderung überlebt");
    ok(merged.nodes.find(n => n.id === "garrek").role === "Hauptmann", "fremde Rollen-Änderung überlebt");
    ok(conflicts.length === 0, "kein Konflikt gemeldet");
}

// 2 — same node, different fields
section("2. Selber Node, verschiedene Felder");
{
    const base = baseGraph();
    const mine = clone(base); mine.nodes[0].lore = "Neue Lore";
    const server = clone(base); server.nodes[0].factionId = "f1";
    const { merged, conflicts } = mergeGraphData(base, mine, server);
    const elara = merged.nodes.find(n => n.id === "elara");
    ok(elara.lore === "Neue Lore", "meine Lore überlebt");
    ok(elara.factionId === "f1", "fremde Fraktion überlebt");
    ok(conflicts.length === 0, "kein Konflikt (verschiedene Felder)");
}

// 3 — same field
section("3. Selbes Feld");
{
    const base = baseGraph();
    const mine = clone(base); mine.nodes[0].lore = "Meine Version";
    const server = clone(base); server.nodes[0].lore = "Fremde Version";
    const { merged, conflicts } = mergeGraphData(base, mine, server);
    ok(merged.nodes.find(n => n.id === "elara").lore === "Meine Version", "letzter Schreiber gewinnt");
    ok(conflicts.length === 1 && conflicts[0].field === "lore", "Konflikt auf 'lore' gemeldet");
    ok(conflicts[0].name === "elara", "Konflikt nennt das Element");
}

// 3b — same field, identical value
section("3b. Selbes Feld, gleicher Wert");
{
    const base = baseGraph();
    const mine = clone(base); mine.nodes[0].lore = "Gleiche Idee";
    const server = clone(base); server.nodes[0].lore = "Gleiche Idee";
    const { conflicts } = mergeGraphData(base, mine, server);
    ok(conflicts.length === 0, "kein Konflikt wenn beide dasselbe schreiben");
}

// 4 — delete vs edit
section("4. Löschung vs. Bearbeitung");
{
    const base = baseGraph();
    const mine = clone(base); mine.nodes[1].role = "Verräter";
    const server = clone(base); server.nodes = server.nodes.filter(n => n.id !== "garrek");
    const { merged, conflicts } = mergeGraphData(base, mine, server);
    ok(!merged.nodes.find(n => n.id === "garrek"), "Löschung gewinnt");
    ok(conflicts.some(c => c.type === "node.deleted"), "Hinweis auf verfallene Änderung");
    ok(merged.links.length === 0, "verwaiste Kante wird mit entfernt");
}
{
    const base = baseGraph();
    const mine = clone(base); mine.nodes = mine.nodes.filter(n => n.id !== "garrek");
    const server = clone(base);
    const { merged, conflicts } = mergeGraphData(base, mine, server);
    ok(!merged.nodes.find(n => n.id === "garrek"), "meine Löschung bleibt bestehen");
    ok(conflicts.length === 0, "eigene Löschung ist kein Konflikt");
}

// 5 — both drag different nodes
section("5. Positionen: beide ziehen verschiedene Nodes");
{
    const base = baseGraph();
    const mine = clone(base); mine.nodes[0].x = 999; mine.nodes[0].y = 999;
    const server = clone(base); server.nodes[1].x = 777; server.nodes[1].y = 777;
    const { merged } = mergeGraphData(base, mine, server, { draggedNodeIds: new Set(["elara"]) });
    ok(merged.nodes.find(n => n.id === "elara").x === 999, "meine gezogene Position bleibt");
    ok(merged.nodes.find(n => n.id === "garrek").x === 777, "fremde gezogene Position bleibt");
}

// 6 — physics drift must not overwrite others (the important one)
section("6. Physik-Drift überschreibt fremde Positionen NICHT");
{
    const base = baseGraph();
    // I only edited lore, but the simulation has been nudging every node meanwhile.
    const mine = clone(base);
    mine.nodes[0].lore = "Nur Lore geändert";
    mine.nodes[0].x = 103.7; mine.nodes[0].y = 98.2;   // drift
    mine.nodes[1].x = 205.1; mine.nodes[1].y = 199.4;  // drift
    // Meanwhile someone deliberately dragged garrek somewhere.
    const server = clone(base);
    server.nodes[1].x = 800; server.nodes[1].y = 600;
    const { merged } = mergeGraphData(base, mine, server, { draggedNodeIds: new Set() });
    ok(merged.nodes.find(n => n.id === "garrek").x === 800, "fremde Drag-Position überlebt meinen Lore-Save");
    ok(merged.nodes.find(n => n.id === "garrek").y === 600, "auch y überlebt");
    ok(merged.nodes.find(n => n.id === "elara").lore === "Nur Lore geändert", "meine Lore kommt trotzdem an");
    ok(merged.nodes.find(n => n.id === "elara").x === 100, "mein Drift wird verworfen (nicht gezogen)");
}

// 7 — creation on both sides
section("7. Neuanlage");
{
    const base = baseGraph();
    const mine = clone(base); mine.nodes.push(node("kael", { role: "Dieb" }));
    const server = clone(base); server.nodes.push(node("borin", { role: "Zwerg" }));
    const { merged, conflicts } = mergeGraphData(base, mine, server);
    ok(merged.nodes.some(n => n.id === "kael"), "mein neuer Node bleibt");
    ok(merged.nodes.some(n => n.id === "borin"), "fremder neuer Node kommt dazu");
    ok(merged.nodes.length === 4, "insgesamt 4 Nodes");
    ok(conflicts.length === 0, "kein Konflikt");
}

// 8 — links
section("8. Kanten");
{
    const base = baseGraph();
    const mine = clone(base); mine.links[0].label = "verbündet";
    const server = clone(base);
    server.links.push({ id: "l2", source: "garrek", target: "elara", label: "schuldet", directional: true });
    const { merged, conflicts } = mergeGraphData(base, mine, server);
    ok(merged.links.find(l => l.id === "l1").label === "verbündet", "mein Label bleibt");
    ok(merged.links.find(l => l.id === "l2"), "fremde neue Kante kommt dazu");
    ok(conflicts.length === 0, "parallele Kanten sind kein Konflikt (dank Link-IDs)");
}

// 9 — top level fields (zones etc.)
section("9. Top-Level-Felder");
{
    const base = baseGraph();
    const mine = clone(base); mine.zones = [{ id: "z1", name: "Hafen" }];
    const server = clone(base); server.showFactionLines = false;
    const { merged, conflicts } = mergeGraphData(base, mine, server);
    ok(merged.zones.length === 1 && merged.zones[0].name === "Hafen", "meine Zone überlebt");
    ok(merged.showFactionLines === false, "fremdes Flag überlebt");
    ok(conflicts.length === 0, "kein Konflikt");
}
{
    // A top-level field nobody has taught the merge about must still survive.
    const base = baseGraph(); base.futureFeature = { a: 1 };
    const mine = clone(base); mine.futureFeature = { a: 2 };
    const server = clone(base);
    const { merged } = mergeGraphData(base, mine, server);
    ok(merged.futureFeature.a === 2, "unbekanntes Zukunfts-Feld wird mitgemergt");
}

// 10 — no-op
section("10. Nichts geändert");
{
    const base = baseGraph();
    const { merged, conflicts } = mergeGraphData(base, clone(base), clone(base));
    ok(valuesEqual(merged.nodes, base.nodes), "Nodes unverändert");
    ok(conflicts.length === 0, "keine Konflikte");
}

// 11 — velocities never leak
section("11. Simulationszustand");
{
    const base = baseGraph();
    const mine = clone(base); mine.nodes[0].vx = 5; mine.nodes[0].vy = 5; mine.nodes[0].index = 3;
    const server = clone(base);
    const { merged } = mergeGraphData(base, mine, server, { draggedNodeIds: new Set(["elara"]) });
    const elara = merged.nodes.find(n => n.id === "elara");
    ok(elara.vx === undefined && elara.vy === undefined, "vx/vy werden nicht gemergt");
    ok(elara.index === undefined, "d3 index wird nicht gemergt");
}

// 12 — legacy state without link ids (regression: this deleted every link live)
section("12. Alter Stand ohne Link-IDs (Schema v1)");
{
    // What a pre-merge FANG wrote: links identified only by source+target.
    const legacyServer = {
        nodes: [node("elara"), node("garrek")],
        links: [{ source: "elara", target: "garrek", label: "kennt" }],   // no id!
        factions: []
    };
    // What we hold after loading + migrating it: same links, but now with ids.
    const migratedMine = clone(legacyServer);
    migratedMine.links[0].id = "generated1";

    const { merged } = mergeGraphData(migratedMine, migratedMine, legacyServer);
    ok(merged.links.length === 0,
        "BELEG: gegen einen v1-Stand loescht der Merge alle Kanten — deshalb das Schema-Gate");
    ok(true, "-> _isMergeableState() in fang-app.js verhindert diesen Merge; v1 wird stattdessen ueberschrieben");
}

// 13 — structurallyEqual: the guard that stops every save from rebuilding the simulation
section("13. structurallyEqual ignoriert Positionen");
{
    // Exactly the live case: I drag one node, the other drifts. The merge keeps my drag
    // and discards the drift -> merged != mine, but *only* in coordinates. If that counts
    // as a change, the graph gets rebuilt on every single drag and everything jumps.
    const base = baseGraph();
    const mine = clone(base);
    mine.nodes[0].x = 400; mine.nodes[0].y = 200;      // dragged by me
    mine.nodes[1].x = 203.4; mine.nodes[1].y = 197.9;  // drift
    const server = clone(base);
    const { merged } = mergeGraphData(base, mine, server, { draggedNodeIds: new Set(["elara"]) });

    ok(!valuesEqual(merged, mine), "Merge liefert andere Koordinaten als gesendet (Drift verworfen)");
    ok(structurallyEqual(merged, mine),
        "BELEG: strukturell identisch -> kein _adoptMergedState, kein Sprung beim Loslassen");
}
{
    // A real change must still be reported, or deleted nodes come back to life.
    const base = baseGraph();
    const mine = clone(base); mine.nodes[0].x = 999;
    const server = clone(base); server.nodes = server.nodes.filter(n => n.id !== "garrek");
    const { merged } = mergeGraphData(base, mine, server, { draggedNodeIds: new Set(["elara"]) });
    ok(!structurallyEqual(merged, mine), "fremde Löschung gilt weiterhin als Änderung");
}
{
    const base = baseGraph();
    const mine = clone(base);
    const server = clone(base); server.nodes[0].lore = "Fremde Lore";
    const { merged } = mergeGraphData(base, mine, server);
    ok(!structurallyEqual(merged, mine), "fremde Feldänderung gilt weiterhin als Änderung");
    ok(structurallyEqual(merged, merged), "reflexiv");
}

console.log(`\n${failed === 0 ? "=== ALLE TESTS BESTANDEN ===" : `=== ${failed} FEHLER ===`}  (${passed} ok, ${failed} fail)\n`);
process.exit(failed ? 1 : 0);
