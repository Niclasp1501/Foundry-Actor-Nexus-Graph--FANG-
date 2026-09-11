# Konzept: Gemeinsames Bearbeiten in FANG

Stand 11.09.2026. Nur Konzept, nichts davon ist gebaut. Zielbild zuerst, dann der heutige
Stand, dann die Bausteine in der Reihenfolge, in der sie sich lohnen.

## 1. Zielbild

Mehrere Leute arbeiten gleichzeitig am selben Graphen, so wie an einem gemeinsamen
Dokument:

- Jeder sieht, wer gerade wo arbeitet, ohne dass jemand speichern muss.
- Zwei Leute können nicht dasselbe Feld gleichzeitig ändern, alles andere dürfen sie.
- Ein Zug am Knoten ist bei allen anderen sofort zu sehen.
- Ein Spieler braucht keine Spielleitung, die gerade FANG offen hat.
- Jede Änderung lässt sich zurücknehmen, und man kann nachsehen, wer was geändert hat.
- Es funktioniert am Tablet am Tisch genauso wie am Schreibtisch.

Kein globaler Bearbeitungsmodus mehr. Die Frage "wer hat gerade die Sperre" verschwindet.

## 2. Was heute da ist

Die Option "Gleichzeitiges Bearbeiten" (standardmäßig aus) schaltet die exklusive Sperre ab.
Jeder, der bearbeiten darf, bearbeitet. Beim Speichern wird der eigene Stand gegen die
Grundlage (Stand beim Laden) und den gespeicherten Stand dreifach abgeglichen, Feld für Feld.
Löschen gewinnt. Positionen zählen nur, wenn jemand den Knoten gezogen hat.

Das ist ein guter Kern. Er löst das Überschreiben. Er löst nicht:

| Lücke | Folge am Tisch |
|---|---|
| Niemand sieht, was andere gerade tun | Zwei Leute ändern denselben Text, der zweite verliert |
| Konflikt heißt "letzter gewinnt" plus Hinweis | Der Verlierer erfährt es, kann aber nichts zurückholen |
| Spieler speichern über den Client der Spielleitung | Ohne Spielleitung mit offenem FANG geht nichts |
| Jedes Speichern liest, mischt und schreibt den ganzen Graphen | Bei fünf Leuten viele volle Schreibvorgänge für kleine Änderungen |
| Kein Rückgängig | Ein Fehlklick auf Löschen ist endgültig |
| Bewegungen kommen erst mit dem nächsten Speichern an | Jeder sieht ein anderes Bild, bis jemand speichert |

## 3. Was Foundry hergibt, und was nicht

Das bestimmt, was überhaupt möglich ist:

- **Sockets sind reines Rundsenden.** Eine Nachricht geht an alle Clients. Kein Code läuft
  auf dem Server. Wer etwas dauerhaft schreiben will, braucht einen Client, der es darf.
- **Schreiben können nur Besitzer.** Der Graph liegt als Flag am Journal "FANG Graph".
  Spieler haben dort "Beobachter". Foundry kennt keine halbe Berechtigung ("darf Flag
  schreiben, aber Journal nicht löschen").
- **Jede Änderung am Journal löst bei allen `updateJournalEntry` aus.** Das ist ein
  verlässlicher Kanal, der heute nicht genutzt wird. FANG schickt stattdessen "refreshGraph"
  per Socket und lädt neu.
- **Spielleitung kann fehlen.** Eine Runde kann Spieler enthalten, deren Spielleitung gerade
  nicht in FANG ist oder gar nicht angemeldet.

Daraus folgt: Das Modell braucht einen Schreiber. Entweder ein Client mit Besitzrecht
(Spielleitung, oder ein Spieler, dem man das Recht gibt) oder eine Warteschlange, die auf den
nächsten Schreiber wartet.

## 4. Die Bausteine

Jeder Baustein ist einzeln nützlich. Sie bauen aufeinander auf, aber man kann nach jedem
aufhören.

### Baustein 1: Sehen, wer wo ist

Jeder Client meldet per Socket, was er gerade anfasst: Knoten unter der Maus, Knoten im
Editor, Verbindung im Editor. Keine Speicherung, nur Anzeige.

- Ein Knoten, den jemand anderes im Editor hat, bekommt einen farbigen Rand mit dem Namen
  ("Anna bearbeitet").
- Das Rechtsklickmenü zeigt "Bearbeiten" bei diesem Knoten als gesperrt an, mit dem Namen
  als Grund. Das ist derselbe Mechanismus wie heute die gesperrten Einträge ohne
  Bearbeitungsmodus, nur mit einem anderen Grund.
- Das Banner oben zeigt nicht mehr nur "auch hier: Anna", sondern "Anna bearbeitet Baron
  Valmont".

Das ist die **Sperre pro Element statt pro Graph.** Sie ist weich: Sie hält niemanden
technisch ab, sie sagt nur, dass gerade jemand dran ist. Bricht der Client weg, verfällt die
Meldung nach kurzer Zeit von selbst (Heartbeat, 5 Sekunden ohne Lebenszeichen). Kein Flag,
nichts zum Aufräumen.

Aufwand: zwei bis drei Tage. Größter Nutzen pro Aufwand, weil er die häufigste Kollision
(zwei Leute im selben Editor) verhindert, bevor sie entsteht.

### Baustein 2: Bewegungen sofort

Wer einen Knoten zieht, sendet die Position während des Ziehens, gedrosselt auf etwa zehn
Nachrichten pro Sekunde. Die anderen Clients setzen den Knoten fest, solange er gezogen wird,
und geben ihn beim Loslassen an ihre Physik zurück.

Ergebnis: Alle sehen dasselbe Bild in Bewegung. Das Speichern der Position bleibt wie heute.

Aufwand: zwei Tage. Die Drosselung und das Festsetzen sind die Arbeit, der Rest ist da.

### Baustein 3: Änderungen als Vorgänge, nicht als Zustände

Das ist der große Umbau. Heute schickt ein Client "hier ist mein ganzer Graph, bitte
zusammenführen". Künftig schickt er "setze bei Knoten X das Feld Rolle auf Y" oder "lösche
Verbindung Z". Eine Liste kleiner Vorgänge:

```
{ art: "feld",       ziel: "knoten:abc", feld: "role", wert: "Söldner", vorher: null }
{ art: "verbinden",  quelle: "abc", ziel: "def", label: "kennt" }
{ art: "loeschen",   ziel: "verbindung:L7" }
{ art: "bewegen",    ziel: "knoten:abc", x: 120, y: 80 }
```

Der Schreiber (siehe Baustein 4) wendet Vorgänge in Eingangsreihenfolge auf den gespeicherten
Stand an und schreibt. Was das bringt:

- **Konflikte werden selten und genau.** Zwei Vorgänge stoßen sich nur, wenn sie dasselbe
  Feld desselben Elements betreffen. Alles andere geht einfach durch.
- **Rückgängig kommt fast umsonst.** Jeder Vorgang trägt den vorherigen Wert. Rückgängig ist
  der umgekehrte Vorgang.
- **Ein Verlauf entsteht von selbst.** Wer hat wann was geändert. Das ist die Grundlage für
  Baustein 6.
- **Kleine Schreibvorgänge.** Der Schreiber schreibt zwar weiter das ganze Flag, aber er liest
  und mischt nicht mehr fünf ganze Graphen gegeneinander.

Der heutige Dreifach-Abgleich bleibt als Sicherheitsnetz: für einen Client, der lange offline
war und einen ganzen Stand mitbringt, und für alte Modulversionen.

Aufwand: ein bis zwei Wochen. Betroffen sind alle rund 26 Stellen, die heute `saveData()`
aufrufen. Jede muss sagen, was sie geändert hat, statt nur "speichern". Das ist auch eine
Aufräumaktion: Heute weiß niemand an diesen Stellen mehr, was genau sich geändert hat.

### Baustein 4: Ein Schreiber, der da ist

Zwei Wege, die sich ergänzen:

**a) Warteschlange statt Verlust.** Ist keine Spielleitung mit geladenem FANG da, gehen
Vorgänge heute mit einer Warnung verloren. Künftig behält der Client sie und schickt sie,
sobald ein Schreiber erscheint. Er zeigt das an ("3 Änderungen warten auf die
Spielleitung"). Das nimmt den Zeitdruck aus dem Tisch.

**b) Spieler als Schreiber.** Eine Option "Spieler dürfen direkt speichern" gibt Spielern
Besitzrecht am Journal "FANG Graph". Dann schreiben sie selbst, ohne Umweg. Der Preis:
Ein Besitzer kann das Journal auch löschen oder umbenennen. Foundry kann das nicht
verhindern. Deshalb eine Option mit klarem Hinweis, nicht die Voreinstellung. Für die
meisten Runden ist das in Ordnung: Wer den Graphen mit bearbeiten darf, darf ihn auch
kaputt machen, und ein Export ist eine Sicherung.

Wichtig bei b): Es gibt dann mehrere Schreiber gleichzeitig. Dann braucht es Baustein 3
zwingend, weil zwei Schreiber, die ganze Graphen schreiben, sich wieder überschreiben. Mit
Vorgängen ist es harmlos: Jeder Schreiber liest das Flag, wendet seinen Vorgang an, schreibt.
Foundry serialisiert die Schreibvorgänge am Server. Zwei Vorgänge auf dasselbe Feld in
derselben Sekunde sind der einzige Fall, und den fängt Baustein 5.

Aufwand: a) ein Tag. b) ein Tag plus Doku, aber erst nach Baustein 3.

### Baustein 5: Konflikte zeigen statt entscheiden

Für den seltenen Fall, dass zwei Leute dasselbe Textfeld ändern (Notiz, Rolle, Bezeichnung
einer Verbindung): kein "letzter gewinnt" mehr, sondern ein kleines Fenster beim Verlierer:

> Anna hat die Rolle von Baron Valmont inzwischen auf "Hausherr" gesetzt. Deine Fassung:
> "Patriarch". [Annas behalten] [Meine übernehmen] [Beide sehen]

Nur für Textfelder. Positionen, Kästchen und Zugehörigkeiten brauchen das nicht, da ist
"letzter gewinnt" richtig.

Aufwand: zwei Tage nach Baustein 3.

### Baustein 6: Rückgängig und Verlauf

Aus der Vorgangsliste:

- **Rückgängig** für die eigenen letzten Vorgänge, Strg+Z im Graphen. Fremde Vorgänge nimmt
  man nicht zurück, das wäre Streit.
- **Verlauf** als Liste: "Anna hat die Verbindung Baron/Lyra gelöscht, 21:14". Mit
  "Wiederherstellen" an jeder Zeile. Das ist auch die Antwort auf "wer hat das gemacht",
  die heute niemand beantworten kann.

Der Verlauf ist etwas anderes als die Chronik. Die Chronik erzählt die Geschichte der Welt,
der Verlauf protokolliert die Arbeit am Graphen. Sie bleiben getrennt.

Aufwand: drei Tage nach Baustein 3.

## 5. Was ich nicht empfehle

**Eine CRDT-Bibliothek (Yjs, Automerge).** Das sind die Werkzeuge, mit denen Google Docs
oder Figma gleichzeitiges Bearbeiten lösen. Sie lohnen sich, wenn viele Clients ohne
zentralen Schreiber zusammenlaufen müssen. FANG hat einen Schreiber (Foundry serialisiert
Schreibvorgänge am Server), einen kleinen Graphen und einen Tisch mit fünf Leuten. Vorgänge
plus ein Schreiber reichen, und sie sind lesbar. Eine CRDT wäre eine große Abhängigkeit für
ein Problem, das FANG nicht hat.

**Den Graphen in viele kleine Dokumente aufteilen** (ein Journal je Knoten), damit Foundry die
Rechte je Element regelt. Das gäbe echte Berechtigung pro Knoten, aber hundert Journale in
der Seitenleiste, langsames Laden und einen Umbau von allem. Der Gewinn ist zu klein.

## 6. Reihenfolge und Entscheidungen

| Schritt | Aufwand | Nutzen sofort |
|---|---|---|
| 1 Sehen, wer wo ist | 2 bis 3 Tage | Verhindert die häufigste Kollision |
| 2 Bewegungen sofort | 2 Tage | Alle sehen dasselbe Bild |
| 4a Warteschlange | 1 Tag | Nichts geht mehr verloren |
| 3 Vorgänge statt Zustände | 1 bis 2 Wochen | Grundlage für alles Weitere |
| 5 Konflikte zeigen | 2 Tage | Kein stiller Verlust mehr |
| 6 Rückgängig und Verlauf | 3 Tage | Fehlklicks sind nicht mehr endgültig |
| 4b Spieler als Schreiber | 1 Tag | Keine Abhängigkeit von der Spielleitung |

Die ersten drei Schritte sind unabhängig vom großen Umbau und zusammen etwa eine Woche.
Danach ist das Bearbeiten am Tisch spürbar anders, ohne dass das Speichern angefasst wurde.

Drei Entscheidungen brauche ich vorher:

1. **Weiche Sperre pro Element** (Baustein 1): Soll "Anna bearbeitet" nur anzeigen, oder
   soll es den Editor für andere wirklich blockieren? Ich empfehle anzeigen und blockieren,
   mit Übersteuern per Klick ("trotzdem öffnen").
2. **Spieler als Schreiber** (4b): Willst du diese Option überhaupt, mit dem Risiko, dass ein
   Spieler das Journal löschen kann? Ohne sie bleibt die Spielleitung der einzige Schreiber,
   mit Warteschlange.
3. **Der große Umbau** (3): Jetzt einplanen oder erst die Bausteine 1, 2 und 4a bauen und
   sehen, wie weit das trägt? Ich empfehle das zweite. Der Umbau ist richtig, aber er wird
   besser, wenn die kleinen Bausteine vorher zeigen, welche Vorgänge am Tisch wirklich
   vorkommen.
