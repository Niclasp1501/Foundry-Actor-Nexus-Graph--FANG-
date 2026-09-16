/**
 * Ein Knopf im Akteursverzeichnis.
 *
 * **In jedem Ninjo-Modul dieselbe Datei, unveraendert.** Anders als bei
 * `willkommen.js` und `fensterpassen.js` gibt es hier keinen MODUL-Block: Was je
 * Modul verschieden ist, kommt beim Aufruf herein. Kopiert statt geteilt, weil
 * die Module einzeln im Katalog erscheinen und sich nicht gegenseitig brauchen
 * sollen.
 *
 * **Der Anlass.** Am 15.09.2026 standen im Akteursverzeichnis die Knoepfe von
 * drei Ninjo-Modulen nebeneinander, und jeder sah anders aus: FANG im
 * Foundry-Stil mit einem Namen, der auf zwei Zeilen umbrach, NDRS als roter
 * Balken mit Goldrand, dessen Text abgeschnitten war ("Cheat-Sheet oeff"),
 * Shops als heller Pergamentknopf auf dunklem Grund. Jedes Modul hatte seinen
 * Knopf fuer sich allein entworfen, und keins rechnete damit, dass daneben noch
 * einer steht.
 *
 * **Die Regel.**
 * - Alle Knoepfe stehen in **einer gemeinsamen Leiste** unter Foundrys eigenen
 *   Knoepfen ("Akteur erstellen", "Ordner erstellen"), gleich breit und in
 *   fester Reihenfolge nach Modulkennung, egal welches Modul zuerst laedt.
 * - Der Knopf traegt **Foundrys eigenen Knopfstil**, keine eigene
 *   Hintergrundfarbe. Das Verzeichnis gehoert Foundry, im hellen wie im dunklen
 *   Thema. Die Marke zeigt sich nur im Symbol, in Gold.
 * - Die Beschriftung ist **kurz**: der Name dessen, was sich oeffnet, ohne Verb
 *   und ohne "Ninjo's". Der volle Name steht im Tooltip und im `aria-label` und
 *   muss die kurze Beschriftung enthalten.
 * - **Ein Knopf je Modul.** Wer mehr anbieten will, gehoert in das Fenster
 *   dahinter.
 *
 * Aufruf, einmal beim Laden des Moduls:
 *
 *   verzeichnisKnopfEinrichten("fang", () => ({
 *     symbol: "fas fa-project-diagram",
 *     text: "FANG.ButtonShort",   // kurz, steht auf dem Knopf
 *     tipp: "FANG.ButtonOpen",    // lang, steht im Tooltip
 *     aktion: () => oeffnen()
 *   }));
 *
 * Die Beschreibung wird bei jedem Zeichnen des Verzeichnisses neu gefragt. Gibt
 * sie `null` zurueck, bleibt der Knopf weg. So zeigt ein Modul ihn nur der
 * Spielleitung oder laesst ihn ueber eine Einstellung abschalten.
 */

/**
 * Stand dieser Datei. Das Aussehen landet einmal im Dokument, egal wie viele
 * Module die Datei mitbringen. Liegen verschiedene Staende nebeneinander, gewinnt
 * der hoehere: Ein Modul mit einer alten Kopie dreht das Aussehen nicht zurueck.
 * Wer unten am Stil etwas aendert, zaehlt hier hoch.
 */
const STAND = 1;

const LEISTE = "ninjo-verzeichnisleiste";
const KNOPF = "ninjo-verzeichnisknopf";
const STIL_ID = "ninjo-verzeichnisknopf-stil";

const STIL = `
.${LEISTE} {
  display: flex;
  gap: 4px;
  width: 100%;
  margin-top: 4px;
}
.${LEISTE} .${KNOPF} {
  flex: 1 1 0;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  margin: 0;
  padding: 0 6px;
  white-space: nowrap;
}
.${LEISTE} .${KNOPF} span {
  overflow: hidden;
  text-overflow: ellipsis;
}
.${LEISTE} .${KNOPF} i {
  flex-shrink: 0;
  margin: 0;
  color: var(--ninjo-akzent, #D4AF37);
}
.theme-light .${LEISTE} .${KNOPF} i {
  color: var(--ninjo-akzent-text, #b8860b);
}
`;

function stilEinsetzen() {
  const vorhanden = document.getElementById(STIL_ID);
  if (vorhanden && Number(vorhanden.dataset.stand) >= STAND) return;
  const stil = vorhanden ?? document.createElement("style");
  stil.id = STIL_ID;
  stil.dataset.stand = String(STAND);
  stil.textContent = STIL;
  if (!vorhanden) document.head.append(stil);
}

/**
 * Den Knopf eines Moduls anmelden.
 *
 * @param {string} modulId  Die Modulkennung; sie legt auch den Platz in der Leiste fest.
 * @param {() => ({symbol: string, text: string, tipp?: string, aktion: () => void} | null)} beschreibe
 */
export function verzeichnisKnopfEinrichten(modulId, beschreibe) {
  Hooks.on("renderActorDirectory", (app, element) => {
    const wurzel = element instanceof HTMLElement ? element : element?.[0];
    const kopf = wurzel?.querySelector(".directory-header");
    if (!kopf) return;

    // Neu zeichnen heisst: den eigenen Knopf ersetzen. Die Beschreibung kann sich
    // seit dem letzten Mal geaendert haben, etwa durch eine Einstellung.
    kopf.querySelector(`.${KNOPF}[data-modul="${modulId}"]`)?.remove();

    let leiste = kopf.querySelector(`.${LEISTE}`);
    const angabe = beschreibe();
    if (!angabe) {
      if (leiste && !leiste.children.length) leiste.remove();
      return;
    }

    stilEinsetzen();
    if (!leiste) {
      leiste = document.createElement("div");
      leiste.className = LEISTE;
      const aktionen = kopf.querySelector(".header-actions");
      if (aktionen) aktionen.after(leiste);
      else kopf.append(leiste);
    }

    const text = game.i18n.localize(angabe.text);
    const tipp = game.i18n.localize(angabe.tipp ?? angabe.text);

    const knopf = document.createElement("button");
    knopf.type = "button";
    knopf.className = KNOPF;
    knopf.dataset.modul = modulId;
    knopf.dataset.tooltip = tipp;
    knopf.setAttribute("aria-label", tipp);

    const symbol = document.createElement("i");
    symbol.className = angabe.symbol;
    symbol.setAttribute("aria-hidden", "true");
    const beschriftung = document.createElement("span");
    beschriftung.textContent = text;
    knopf.append(symbol, beschriftung);

    knopf.addEventListener("click", ereignis => {
      ereignis.preventDefault();
      angabe.aktion();
    });

    // Feste Reihenfolge nach Modulkennung. Sonst tauschen die Knoepfe ihre
    // Plaetze, sobald sich die Ladereihenfolge der Module aendert.
    const danach = [...leiste.querySelectorAll(`.${KNOPF}`)]
      .find(anderer => anderer.dataset.modul.localeCompare(modulId) > 0);
    leiste.insertBefore(knopf, danach ?? null);
  });
}
