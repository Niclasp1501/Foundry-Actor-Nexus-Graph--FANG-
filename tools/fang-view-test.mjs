/**
 * Spoiler test for what a user sees of FANG (fang-view.mjs).
 * Run: node tools/fang-view-test.mjs
 *
 * The fixture marks every secret with GEHEIM-<n>. For each player the whole view is turned
 * into JSON and searched for marks; a mark may appear only where the fixture's `allowed`
 * list says so. It has to pass before any program, a companion app or an add-on, reads FANG
 * on behalf of a player.
 */
import fs from "node:fs";
import * as v from "../scripts/fang-view.mjs";

let failed = 0;
let passed = 0;
const ok = (cond, msg) => {
    if (cond) { passed++; console.log(`  OK    ${msg}`); }
    else { failed++; console.log(`  FAIL  ${msg}`); }
};
const section = (title) => console.log(`\n--- ${title} ---`);

const fixture = JSON.parse(fs.readFileSync(new URL("./fang-view-fixture.json", import.meta.url), "utf8"));
const dataFor = (user) => ({
    graph: fixture.graph,
    history: fixture.history,
    settings: fixture.settings,
    notes: fixture.notes[user.id] ?? {},
    canReadPage: (id) => (fixture.readablePages[user.id] ?? []).includes(id)
});
const marksIn = (value) => [...new Set(JSON.stringify(value).match(/GEHEIM-\d+/g) ?? [])].sort();

// --- 1. Marken-Suche ---
section("1. Marken: jeder Spieler sieht nur, was für ihn freigegeben ist");
for (const key of ["A", "B"]) {
    const user = fixture.users[key];
    const view = v.viewFor(dataFor(user), user, { unknown: "Unknown" });
    const found = marksIn(view);
    const allowed = fixture.allowed[key];
    const leaked = found.filter(m => !allowed.includes(m));
    const missing = allowed.filter(m => !found.includes(m));
    ok(!leaked.length, `${key}: keine fremden Geheimnisse${leaked.length ? " (gefunden: " + leaked.join(", ") + ")" : ""}`);
    ok(!missing.length, `${key}: alles Eigene da${missing.length ? " (fehlt: " + missing.join(", ") + ")" : ""}`);
}
{
    const gm = fixture.users.GM;
    const all = marksIn({ graph: fixture.graph, history: fixture.history });
    const view = v.viewFor({ ...dataFor(gm), notes: {} }, gm);
    const found = marksIn(view);
    ok(all.every(m => found.includes(m)), "Spielleitung sieht alle Geheimnisse aus Graph und Chronik");
}

// --- 2. Einzelregeln ---
const A = fixture.users.A, B = fixture.users.B;
const viewA = v.viewFor(dataFor(A), A);
const viewB = v.viewFor(dataFor(B), B);

section("2. Figuren");
const hidden = viewA.nodes.find(n => n.id === "nHidden");
ok(hidden && hidden.name === "Hooded Stranger" && hidden.hidden === true, "verdeckte Figur mit Deckname");
ok(hidden && !("actorId" in hidden) && !("img" in hidden) && !("lore" in hidden) && !("role" in hidden), "verdeckte Figur ohne Akteur, Bild, Beschreibung, Rolle");
ok(hidden && hidden.playerNotes === "Wears a grey hood.", "verdeckte Figur behält die Spielernotiz");
ok(hidden && hidden.quests.length === 0, "showHiddenQuestsToPlayers: false hält Quests zurück");
ok(!viewA.nodes.some(n => n.id === "nGmOnly"), "gmOnly-Figur fehlt");
const asha = viewA.nodes.find(n => n.id === "nA");
ok(asha && asha.quests.length === 1 && asha.quests[0].name === "Open quest", "nur freigegebene Quests am Knoten");
ok(asha && !("journalUuid" in asha), "GM-Journal am Knoten fehlt");
const bram = viewB.nodes.find(n => n.id === "nB");
ok(bram && bram.factionIds.join() === "fOpen", "unsichtbare Fraktion fehlt an der Figur");

section("3. Verbindungen und Fraktionen");
ok(viewA.links.map(l => l.id).sort().join() === "lOpen,lToHidden", "nur offene Verbindungen zwischen sichtbaren Figuren");
ok(viewA.links.find(l => l.id === "lOpen")?.info === "Since the shipwreck.", "Hinweis einer offenen Verbindung bleibt");
ok(viewA.factions.map(f => f.id).join() === "fOpen", "Fraktion mit playerVisible: false fehlt");

section("4. Orte");
const zonesA = new Map(viewA.zones.map(z => [z.id, z]));
const zonesB = new Map(viewB.zones.map(z => [z.id, z]));
ok(zonesA.has("zOpen") && !zonesA.has("zUnknown") && !zonesA.has("zGmOnly"), "offen ja, unbekannt und gmOnly nein");
ok(zonesA.get("zAlias")?.name === "Old Ruins" && !("description" in zonesA.get("zAlias")) && !("img" in zonesA.get("zAlias")), "verdeckter Ort nur mit Deckname");
ok(zonesA.has("zRoom") && zonesA.get("zRoom").parentId === null && !zonesA.has("zHouse"), "bekannter Raum ohne das unbekannte Haus");
ok(zonesB.has("zMine") && !zonesA.has("zMine"), "selbst angelegter Ort nur für den Ersteller");
ok(viewA.nodes.find(n => n.id === "nA")?.zoneId === "zRoom", "Figur steht im sichtbaren Raum");

section("5. Chronik");
const idsA = viewA.history.map(e => e.id), idsB = viewB.history.map(e => e.id);
ok(!idsA.includes("hGm") && !idsA.includes("hGmOnlyNode"), "gm-Eintrag und Eintrag nur zu gmOnly-Figur fehlen");
ok(idsA.includes("hQuestA") && !idsB.includes("hQuestA"), "Abschluss der persönlichen Quest nur für A (Lücke 3)");
ok(viewA.history.every(e => !("gmText" in e)), "kein gmText im Objekt (Lücke 2)");
ok(viewA.history.every(e => Object.keys(e.payload).length === 0), "payload leer, bis ein Zusatzmodul Felder freigibt");
const byA = viewA.history.find(e => e.id === "hByA"), byAforB = viewB.history.find(e => e.id === "hByA");
ok(byA?.mine === true && byA.canEdit === true && byA.authorUserId === "userA", "eigener Eintrag: mine, änderbar, mit eigener Kennung");
ok(byAforB && byAforB.mine === false && !("authorUserId" in byAforB), "fremder Eintrag ohne Kennung des Autors");
const travel = viewA.history.find(e => e.id === "hTravelHidden");
ok(travel?.refs.find(r => r.id === "nHidden")?.label === "Hooded Stranger", "Verweis auf verdeckte Figur mit Deckname");
ok(viewA.history.find(e => e.id === "hRecapA")?.recapPageId === "pageGEHEIM-19", "Rückblick-Seite für A mit Leserecht");
ok(viewB.history.find(e => e.id === "hRecapA")?.recapPageId === null, "Rückblick-Seite für B ohne Leserecht nicht");
ok(!viewA.history.find(e => e.id === "hSecretFaction")?.refs.some(r => r.type === "faction"), "Verweis auf unsichtbare Fraktion fehlt");
{
    const veto = v.viewFor({ ...dataFor(A), entryVisible: (e) => e.id !== "hByA" }, A);
    ok(!veto.history.some(e => e.id === "hByA"), "Zusatzmodul kann einen Eintrag verbergen");
}

section("6. Notizen");
ok(Object.keys(viewA.notes).join() === "nB", "nur eigene Notizen, nicht zu unsichtbaren Figuren");
ok(!JSON.stringify(viewB.notes).includes("GEHEIM-22"), "B liest A's Notiz nicht");

section("7. Rechte und Urheberschaft");
ok(JSON.stringify(viewA.rights) === JSON.stringify({ graph: true, places: false, chronicle: true, notes: true }), "Rechte nach Einstellungen");
ok(v.rightsFor({}, { isGM: false }).graph === false && v.rightsFor({}, { isGM: false }).chronicle === true, "Vorgaben: Graph aus, Chronik an");
const entryByA = fixture.history.find(e => e.id === "hByA");
ok(v.playerMayEditEntry(entryByA, "userA"), "A ändert den eigenen Eintrag");
ok(!v.playerMayEditEntry(entryByA, "userB"), "B ändert A's Eintrag nicht (Lücke 9)");
ok(!v.playerMayEditEntry({ ...entryByA, editableByPlayers: false }, "userA"), "gesperrter Eintrag bleibt gesperrt");
ok(!v.playerMayEditEntry({ ...entryByA, visibility: "gm" }, "userA"), "gm-Eintrag ändert kein Spieler");
ok(!v.playerMayEditEntry(fixture.history.find(e => e.id === "hTravelHidden"), "userA"), "Eintrag ohne Autor ändert kein Spieler");
ok(v.entryAudienceAllows({ onlyFor: ["charA"] }, A) && v.entryAudienceAllows({ onlyFor: ["Actor.charA"] }, A), "onlyFor mit Kennung und mit Actor.-Präfix");
ok(!v.entryAudienceAllows({ onlyFor: ["Actor.charA"] }, B) && v.entryAudienceAllows({ onlyFor: ["Actor.charA"] }, fixture.users.GM), "onlyFor: B nein, Spielleitung ja");

console.log(`\n${failed ? "=== FEHLER ===" : "=== ALLE TESTS BESTANDEN ==="}  (${passed} ok, ${failed} fail)`);
process.exit(failed ? 1 : 0);
