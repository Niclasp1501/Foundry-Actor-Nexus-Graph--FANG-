/**
 * Kein Fenster darf groesser sein als der Bildschirm.
 *
 * **In jedem Ninjo-Modul dieselbe Datei**, angepasst wird nur der MODUL-Block
 * ganz oben — wie bei `willkommen.js`. Kopiert statt geteilt: Die Module
 * erscheinen einzeln im Katalog und sollen sich nicht gegenseitig brauchen.
 *
 * **Der Fall, der das ausgeloest hat.** Auf einem Tablet stand das
 * Spielerfenster von Shops oben am Rand und lief unten aus dem Bild heraus:
 * Die untere Haelfte der Auslage, die Verkaufsliste und die Fussleiste waren
 * nicht mehr erreichbar. Verschieben half nicht - die Titelleiste war schon
 * oben, und weiter nach oben geht nicht. Die einzige Rettung waere gewesen,
 * das Fenster an seiner unteren Kante kleiner zu ziehen, und die lag
 * ausserhalb des Bildes.
 *
 * Das ist keine Eigenheit eines Moduls, sondern die uebliche Falle bei
 * `height: "auto"`: Foundry misst den Inhalt und macht das Fenster so hoch,
 * wie es sein will. Auf einem grossen Bildschirm faellt das nie auf. Am
 * 07.09.2026 hatte NDRS deshalb `width: 1100` - breiter als ein iPad quer.
 *
 * **Die Regel.** Ein Fenster ist hoechstens so gross wie das Bild minus einem
 * Rand, und es liegt immer vollstaendig darin. Was nicht hineinpasst, wird
 * gescrollt - dafuer hat `.window-content` `overflow-y: auto`. Ein Fenster,
 * an dessen Inhalt man nicht mehr herankommt, gibt es damit nicht mehr.
 *
 * Geprueft wird nach jedem Zeichnen und wenn sich das Bild aendert: Drehen
 * eines Tablets, aufklappende Bildschirmtastatur, geteilter Bildschirm.
 */

/* ── Das Einzige, was je Modul angepasst wird ─────────────────────── */

const MODUL = {
  /** Die Modulkennung - fuer die Einstellung „auch fremde Fenster". */
  id: "fang",

  /**
   * Klassen, an denen dieses Modul seine eigenen Fenster erkennt.
   *
   * Eine Liste, weil kaum ein Modul mit einer auskommt: FANG hat
   * `fang-app-window` fuer das Hauptfenster und `fang-dialog` fuer die
   * Dialoge. Es genuegt, wenn **eine** davon am Fenster haengt.
   */
  marke: ["fang-app-window","fang-dialog"],

  /**
   * Teile, die selbst scrollen — zusaetzlich zu `.window-content`.
   *
   * Aus ihnen liest die Hoehenrechnung ab, wie viel dem Fenster fehlt. Ohne
   * sie waechst ein Fenster nur, wenn der Rahmen ueberlaeuft; mit ihnen auch
   * dann, wenn innen eine Liste abgeschnitten ist. Die Liste darf leer sein.
   */
  scrollteile: [".fang-history-rail",".tabs-container",".fang-editor-body"]
};

/* ── Ab hier ist die Datei in jedem Modul gleich ───────────────────── */

/** Abstand zum Bildrand. Genug, um die Kante zum Ziehen zu treffen. */
const RAND = 8;

/** Kleiner darf ein Fenster nicht werden, sonst ist es keins mehr. */
const MINDEST = { breite: 280, hoehe: 200 };

/**
 * Um wie viel ein Fenster beim ersten Aufmachen wachsen darf.
 *
 * **Warum ueberhaupt.** Die Fenster tragen feste Breiten - 780 fuer einen
 * Ladenbogen, 660 fuer einen Tresen, 520 fuer ein Spielerfenster. Das sind
 * Zahlen fuer einen Laptop. Auf einem 2333 Pixel breiten Schirm nutzte der
 * Ladenbogen die Haelfte davon und liess den Rest schwarz.
 *
 * **Warum ein Faktor und kein Anteil am Bildschirm.** „Sechzig Prozent der
 * Breite" macht aus einem schmalen Fenster auf einem grossen Schirm eine
 * Landebahn, auf der eine Liste von zehn Zeilen verloren steht. Jedes Fenster
 * hat eine Breite, die zu seinem Inhalt passt; sie um die Haelfte zu dehnen
 * bleibt in diesem Verhaeltnis.
 */
const WACHSTUM = 1.5;

/** Was wir zuletzt selbst gesetzt haben - je Fenster. */
const zuletztGesetzt = new WeakMap();

/** Welche Fenster schon einmal gewachsen sind. Gewachsen wird genau einmal. */
const gewachsen = new WeakSet();

/**
 * Das aeussere Element eines Fensters.
 *
 * ApplicationV2 gibt ein `HTMLElement`, die alte `Application` ein
 * jQuery-Objekt. Beide Bauarten laufen im selben Spiel nebeneinander - Player
 * Wheel und das MCP-Modul stehen noch auf der alten -, und diese eine Zeile
 * ist der ganze Unterschied.
 */
function element(app) {
  const el = app?.element;
  if (!el) return null;
  return el instanceof HTMLElement ? el : (el[0] ?? null);
}

/**
 * Duerfen auch fremde Fenster ins Bild gerueckt werden?
 *
 * Ab Werk ja: Ein Dialog, an dessen Rand niemand mehr kommt, ist kaputt -
 * gleich wer ihn gebaut hat. Wer es abstellen will, findet den Schalter in
 * den Moduleinstellungen.
 */
function fremdeKlemmen() {
  try { return game.settings.get(MODUL.id, "fremdeFensterKlemmen") !== false; }
  catch { return true; }
}


/**
 * Wer kuemmert sich um **fremde** Fenster?
 *
 * Diese Datei liegt in mehreren Modulen. Waeren alle zustaendig, klemmte
 * dasselbe fremde Fenster zwei- oder dreimal hintereinander - dieselbe
 * Rechnung, dieselbe Lage, aber jedes Mal ein `setPosition`, und wer den
 * Fehler spaeter sucht, findet drei Schuldige.
 *
 * Deshalb eine feste Reihenfolge statt "wer zuerst laedt": Das **erste
 * aktive** Modul dieser Liste macht die Arbeit, alle uebrigen kuemmern sich
 * nur um ihre eigenen Fenster. Vorn steht der Tisch, denn dort stehen die
 * Tablets, auf denen ein zu grosses Fenster wirklich weh tut - und wer nur
 * eines der beiden Module installiert hat, ist trotzdem versorgt.
 */
const WACHT = ["ninjos-inperson-tools", "ninjos-shops"];

export function ichBinDieWacht() {
  for (const id of WACHT) {
    if (game.modules.get(id)?.active) return id === MODUL.id;
  }
  return false;
}

/** Gehoert das Fenster diesem Modul? */
function unseres(app) {
  const liste = element(app)?.classList;
  return liste ? MODUL.marke.some(k => liste.contains(k)) : false;
}

/** Was den scrollenden Teilen an Hoehe fehlt - der groesste Fehlbetrag. */
function fehlbetrag(el) {
  let fehlt = 0;
  const teile = [el.querySelector(".window-content")];
  for (const wahl of MODUL.scrollteile) teile.push(...el.querySelectorAll(wahl));
  for (const teil of teile) {
    if (teil) fehlt = Math.max(fehlt, teil.scrollHeight - teil.clientHeight);
  }
  return fehlt;
}

/**
 * Ein Fenster ins Bild ruecken - und ihm den Platz geben, den es braucht.
 *
 * Drei Dinge, in dieser Reihenfolge, und die Reihenfolge ist keine Willkuer:
 * die Breite (sie aendert den Umbruch), dann die Lage nach oben (sie gibt den
 * Platz frei), dann die Hoehe.
 */
export function insBildRuecken(app, { nurKlemmen = false } = {}) {
  const el = element(app);
  if (!el || !el.isConnected) return;

  /*
   * **Ein minimiertes Fenster bleibt minimiert.** Foundry merkt sich die alte
   * Groesse selbst und stellt sie beim Aufklappen wieder her. Setzten wir hier
   * eine Hoehe, wuchs die Titelleiste bei jedem Neuzeichnen zu einem halben
   * Fenster, das unten rechts im Weg lag (Spielabend 21.11.2026).
   */
  if (app.minimized || el.classList.contains("minimized")) return;

  /*
   * **Fremdes nur, wenn es wirklich ein schwebendes Fenster ist.**
   *
   * Der Haken haengt an *jedem* `renderApplicationV2`, und in Foundry v13+
   * sind auch die Seitenleiste, die Spielerliste, die Verzeichnisreiter und
   * die Szenen-Werkzeuge ApplicationV2. Gemessen am 08.09.2026 in der
   * laufenden Welt: `max-height: 1139px` stand im Stil von Players, Sidebar,
   * ActorDirectory, CompendiumDirectory und PlaylistDirectory - von uns
   * hineingeschrieben, und wie der Kommentar weiter unten sagt, wird der
   * Deckel nie wieder zurueckgenommen. Bei einem kleineren Bild waere er
   * schlicht falsch.
   *
   * Ein angedockter Reiter liegt im Fluss der Seite (`static`/`relative`), ein
   * schwebendes Fenster nicht. Das ist der Unterschied, um den es geht - nicht
   * ob ein Fenster einen Rahmen hat: Die Verzeichnisse haben einen und sind
   * trotzdem angedockt.
   */
  if (nurKlemmen) {
    const lage = getComputedStyle(el).position;
    if (lage !== "absolute" && lage !== "fixed") return;
  }

  const bildBreite = window.innerWidth;
  const bildHoehe = window.innerHeight;
  const hoechsteHoehe = bildHoehe - 2 * RAND;
  const masse = el.getBoundingClientRect();

  /*
   * **Gemessen wird nicht, gefragt wird.** Im Render-Haken steht das Fenster
   * noch mitten im Aufbau: Ein Bogen mit 780 Pixel Sollbreite mass dort 524.
   * Aus 524 mal anderthalb wurden genau die 780 der Voreinstellung - es sah
   * aus, als passiere gar nichts. `app.position.width` ist die Zahl, die das
   * Fenster meint, und die steht von Anfang an fest.
   */
  const sollBreite = Number.isFinite(app.position?.width) ? app.position.width : masse.width;

  /*
   * **Unberuehrt heisst: so gross, wie wir es zuletzt gemacht haben.** Nur
   * dann fassen wir es noch einmal an. Wer selbst zieht, hat das letzte Wort.
   */
  const unsere = zuletztGesetzt.get(app);
  const unberuehrt = unsere === undefined
    || (Math.abs(unsere.breite - sollBreite) <= 1 && Math.abs(unsere.hoehe - masse.height) <= 2);

  /* ── Breite ─────────────────────────────────────────────────────── */

  let wunschBreite = sollBreite;
  if (nurKlemmen) {
    /*
     * Fremde Fenster werden nur **kleiner** gemacht, nie groesser. Ein Dialog,
     * der in den Schirm passt, gehoert dem Modul, das ihn gebaut hat - wir
     * greifen erst ein, wenn er darueber hinauslaeuft und niemand mehr an
     * seinen Rand kommt.
     */
  } else if (!gewachsen.has(app)) {
    gewachsen.add(app);
    wunschBreite = Math.min(sollBreite * WACHSTUM, bildBreite - 2 * RAND);
  } else if (unberuehrt && unsere?.wunsch) {
    // Zurueck auf die Wunschbreite, soweit das Bild sie jetzt hergibt - so
    // bekommt ein gedrehtes Tablet seine Fenster wieder gross.
    wunschBreite = Math.min(unsere.wunsch * WACHSTUM, bildBreite - 2 * RAND);
  }
  /*
   * **Die Mindestgroesse gilt nur fuer eigene Fenster.** Am 08.09.2026 stand
   * Monk's Common Display mit 280 x 200 im Bild, obwohl es `width: "auto"` und
   * `height: 95` verlangt - die Haelfte des Fensters war leer. Fuer ein
   * fremdes Fenster ist "zu klein" keine Diagnose, die uns zusteht: Wer es
   * gebaut hat, kennt seinen Inhalt. Wir greifen nur ein, wenn es **groesser**
   * ist als der Schirm.
   */
  const breite = nurKlemmen
    ? Math.min(wunschBreite, bildBreite - 2 * RAND)
    : Math.max(MINDEST.breite, Math.min(wunschBreite, bildBreite - 2 * RAND));

  // Zuerst, denn sie aendert den Umbruch: Mit 1170 statt 780 Pixeln steht eine
  // Auslage zweispaltig und braucht die halbe Hoehe.
  if (Math.abs(breite - sollBreite) > 1) app.setPosition({ width: Math.round(breite) });

  /* ── Hoehe ──────────────────────────────────────────────────────── */

  const nach = el.getBoundingClientRect();
  let hoehe = nach.height;

  /*
   * **So hoch, dass man nicht scrollen muss - hoechstens bis zum Bildrand.**
   *
   * Wie viel fehlt, sagen die scrollenden Teile selbst: `scrollHeight` minus
   * `clientHeight`. Fehlt wenig, kommt genau das dazu - ein Fenster wegen
   * zwanzig Pixeln auf Bildschirmhoehe zu ziehen waere unverschaemt. Fehlt
   * viel, geht es gleich bis zum Rand: Der Zuschlag allein reichte dann nicht,
   * weil Teile des Fensters **mitwachsen** koennen (etwa ein Bereich auf
   * `max-height: 42%`).
   *
   * **Nicht nur beim ersten Zeichnen.** Genau das ging schief: Beim ersten Mal
   * steht das Fenster noch im Aufbau, der Fehlbetrag faellt zu klein aus -
   * gemessen 262 statt 630 -, und danach waere „einmal gewachsen" verbraucht.
   * Solange niemand selbst gezogen hat, darf es bei jedem Zeichnen nachwachsen;
   * es aendert sich ohnehin nur, wenn wirklich etwas fehlt.
   */
  if (unberuehrt && !nurKlemmen) {
    const fehlt = fehlbetrag(el);
    if (fehlt > 1) {
      hoehe = fehlt > bildHoehe * 0.15
        ? hoechsteHoehe
        : Math.min(nach.height + fehlt, hoechsteHoehe);
    }
  }
  hoehe = nurKlemmen
    ? Math.min(hoehe, hoechsteHoehe)
    : Math.max(MINDEST.hoehe, Math.min(hoehe, hoechsteHoehe));

  /* ── Lage ───────────────────────────────────────────────────────── */

  const links = Math.min(Math.max(RAND, nach.left), Math.max(RAND, bildBreite - breite - RAND));
  const oben = Math.min(Math.max(RAND, nach.top), Math.max(RAND, bildHoehe - hoehe - RAND));

  /*
   * **Erst hinaufschieben, dann wachsen.** Foundry deckelt die Hoehe eines
   * Fensters auf `Bildhoehe - Oberkante` und rechnet dabei mit der Oberkante,
   * die es in diesem Moment hat. Steht es noch mittig, ist der Deckel
   * entsprechend niedrig: Gemessen wurden 984 verlangt und `max-height: 922px`
   * gesetzt - genau 1000 minus der alten Oberkante 78. Zusammen in einem
   * Aufruf half nicht; es braucht zwei, und der erste raeumt den Platz frei.
   */
  if (Math.abs(oben - nach.top) > 1) app.setPosition({ top: Math.round(oben) });
  if (Math.abs(links - nach.left) > 1) app.setPosition({ left: Math.round(links) });

  if (Math.abs(hoehe - nach.height) > 1) {
    /*
     * **Der Deckel muss vorher weg.** Foundry schreibt einem Fenster mit
     * `height: "auto"` ein `max-height` in den Stil - berechnet aus der
     * Oberkante, die es beim ersten Setzen hatte - und rechnet es danach nie
     * wieder neu. Gemessen: Das Fenster stand auf Oberkante 8, verlangt waren
     * 984, und `max-height` blieb bei 922 (= 1000 minus der urspruenglichen
     * Oberkante 78). Jedes `setPosition` prallte daran ab.
     *
     * Wir setzen ihn deshalb selbst auf den Bildrand. Zurueckgenommen wird er
     * nicht: Die Klemmung weiter oben haelt das Fenster ohnehin im Bild, und
     * das ist die verlaesslichere der beiden Grenzen.
     */
    el.style.maxHeight = `${Math.round(hoechsteHoehe)}px`;
    app.setPosition({ height: Math.round(hoehe) });
  }

  zuletztGesetzt.set(app, {
    wunsch: unsere?.wunsch ?? sollBreite,
    breite: Math.round(breite),
    hoehe: Math.round(el.getBoundingClientRect().height)
  });
}

/**
 * Alle offenen Fenster dieses Moduls nachziehen.
 *
 * Zwei Verzeichnisse, weil es zwei Fensterbauarten gibt:
 * `foundry.applications.instances` kennt nur ApplicationV2, `ui.windows` nur
 * die alten. Ein Modul, das gerade umgestellt wird, hat beide gleichzeitig.
 */
function alleNachziehen() {
  const alle = [
    ...(foundry.applications?.instances?.values?.() ?? []),
    ...Object.values(ui.windows ?? {})
  ];
  for (const app of alle) {
    if (unseres(app)) insBildRuecken(app);
  }
}

/**
 * Anmelden. Gehoert in `ready`.
 */
/**
 * Fenster mit dem Finger verschiebbar machen.
 *
 * **Der Fehler.** Am 08.09.2026 liess sich auf dem Tablet kein Fenster dieses
 * Moduls verschieben. Foundry zieht die Titelleiste ueber Zeigerereignisse,
 * und die kommen auf einem Touchscreen auch an - nur entscheidet der Browser
 * vorher, dass eine Wischgeste ueber einem Element ein *Scrollen* ist, und
 * bricht das Ziehen ab, sobald der Finger sich bewegt. Mit der Maus faellt
 * das nie auf, weil ein Mauszeiger nicht scrollt.
 *
 * `touch-action: none` sagt dem Browser, dass er die Geste dem Element
 * ueberlassen soll. Nur fuer die Titelleiste und die Anfasser zum Groesse-
 * aendern - nicht fuer den Inhalt, der weiter mit dem Finger gescrollt
 * werden muss.
 *
 * Steht hier und nicht im Stylesheet, damit es mit dieser Datei in jedes
 * Modul wandert: Ein Fenster, das man nicht anfassen kann, ist derselbe
 * Fehler wie eines, das aus dem Bild laeuft.
 */
function fingerZiehenErlauben() {
  const id = "ninjo-fensterpassen-touch";
  if (document.getElementById(id)) return;
  const wahl = MODUL.marke.map(k =>
    `.${k} .window-header, .${k} .window-resize-handle, .${k} [data-action="resize"]`
  ).join(", ");
  const stil = document.createElement("style");
  stil.id = id;
  stil.textContent = `${wahl} { touch-action: none; }`;
  document.head.append(stil);
}

export function fensterPassenEinrichten() {
  fingerZiehenErlauben();

  const beimZeichnen = app => {
    const eigenes = unseres(app);
    /*
     * **Fremde Fenster auch - aber nur klemmen.**
     *
     * Am 08.09.2026 am Tisch: Auf einem Tablet oeffnete der Trefferwuerfel-
     * Dialog von dnd5e groesser als der Schirm, und man kam nicht mehr heraus -
     * kein Rand zum Ziehen, kein Schliessen-Kreuz im Bild. Dasselbe beim
     * Bearbeiten der Trefferpunkte. Das sind nicht unsere Fenster, und
     * trotzdem sitzt der Spieler fest.
     *
     * Wir machen sie deshalb nur kleiner, nie groesser, und ruecken sie ins
     * Bild. Wer das nicht will, schaltet es ab - dann bleibt es bei den
     * eigenen Fenstern.
     */
    if (!eigenes && (!ichBinDieWacht() || !fremdeKlemmen())) return;
    /*
     * **Kein `requestAnimationFrame`.** Der naheliegende Weg, auf das fertige
     * Bild zu warten, ist hier der falsche: Ein Browser, dessen Fenster
     * verdeckt oder minimiert ist, zeichnet nicht - und ruft die Funktion
     * dann nie auf. Gemessen am 06.09.2026: Im Haken stand das Fenster auf
     * 524 statt 780, und der Rueckruf kam auch nach zweieinhalb Sekunden
     * nicht. Auf einem zweiten Bildschirm, den gerade niemand ansieht, waere
     * jedes Fenster ungeklemmt geblieben.
     *
     * `setTimeout` laeuft auch dann. Warten muss man trotzdem: Im Haken
     * selbst haengt der Inhalt noch nicht vollstaendig am Dokument.
     */
    setTimeout(() => insBildRuecken(app, { nurKlemmen: !eigenes }), 0);
  };

  Hooks.on("renderApplicationV2", beimZeichnen);
  // Die alte Bauart. Solange ein Modul sie noch benutzt, gilt die Regel dort
  // genauso - ein zu grosses Fenster ist unabhaengig davon kaputt, mit welcher
  // Klasse es gebaut wurde.
  Hooks.on("renderApplication", beimZeichnen);

  let takt = null;
  const nachziehen = () => {
    clearTimeout(takt);
    takt = setTimeout(alleNachziehen, 120);
  };

  window.addEventListener("resize", nachziehen);

  /*
   * Auf Tablets aendert sich die Hoehe beim Drehen und beim Aufklappen der
   * Tastatur, ohne dass "resize" verlaesslich kommt. `visualViewport` meldet
   * beides.
   */
  window.visualViewport?.addEventListener("resize", nachziehen);
}
