# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/). Module versions follow the Foundry-targeted `<foundry-major>.<YYMM>.<patch>` release scheme documented in `AGENTS.md`.

## [14.2609.3] - 2026-09-11

### Added
- **A window with all of a character's connections.** The actor editor now has a button "Connections (n)". It opens a list of its own: per row the label, the direction and the name at the other end, plus edit and delete. Until now you had to hit the line in the graph, and with many connections the lines lie close together. Deliberately a window of its own and not a section in the editor: a character with fifteen connections would have pushed the profile off the screen. Suggested by @taylor-nightingale (#7).

### Changed
- **Edit and delete in the context menu stay visible when edit mode is off.** They are then greyed out and carry the hint "Edit mode" next to them. Before, they were hidden, and two people in a row concluded from that that connections could not be edited at all. This applies to connections and to nodes. A click on the locked entry names the reason (no lock or no permission).

### Fixed
- **Two German fallback texts with broken encoding** ("ZusÃ¤tzliche Details fÃ¼r die Verbindung") in the connection dialog are replaced by English ones; they only appeared when a language key was missing.
- **A player's change could empty the whole graph.** Players may not write to the journal, so the gamemaster's client applies their change and saves. If the gamemaster had not opened FANG yet in this session, an instance that had never loaded sat there: an empty graph, no basis for the merge. The merge read every existing node as deleted by the gamemaster, deletion wins, and the save that followed wrote the empty result into the journal. The instance now loads first; a second relay that arrives during loading waits for the same load.

  Only worlds with player editing switched on are affected. The path existed since the merge was introduced, so also in 14.2608.1. Found while following up a report by @taylor-nightingale (#7). Scenario 17 in `tools/fang-merge-test.mjs` records the reason: against an unloaded state every node is lost, against the loaded one they stay, and the player's new connection arrives.

- **Saving from an instance that never loaded is refused.** If a window never loaded the graph, it lacks the basis for the merge, and saving would have written its state over the saved one unchecked. After the repair above this should no longer happen. If a new path leads there in future, FANG aborts with a message instead of silently overwriting: a lost change can be repeated, a deleted graph cannot.

## [14.2609.2] - 2026-09-05

### Added
- **A character can belong to several factions.** Until now there was a select box with exactly one faction; whoever wanted to record all three for the mercenary who works for the guild and secretly sits in the circle had to pick one. The node editor now has a list of checkboxes; you tick what applies. Requested by @Axel-of-the-Key (#8).

  **The token ring shows them all.** Instead of a circle in one colour, every faction gets an arc. With one faction it looks as before, so nothing changes for anyone who never assigns a second. The member lines are drawn for every faction too, so a character hangs in several rings.

  **One of them carries a star.** Position and area cannot be shared: grouping pulls a node towards exactly one centre, and a faction area is clipped to its own grid cell so two areas never overlap. So the faction with the star decides where a character stands, and only while grouping is switched on. Everything that is merely drawn takes the whole list. The star only appears from the second faction on; before that there is nothing to decide.

  Existing worlds do not have to do anything. On load the one faction becomes a list with one entry, and the old field stays as a mirror of the primary faction, so an older FANG, an exported file and the Diploglass sync keep reading what they expect.

- **Recaps get a journal page, created and opened from within FANG.** A session recap is running text and does not belong in a world setting that is rewritten and distributed in full on every change, even when only an automatic "token appeared" is added. An entry of the category *Recap* therefore only carries the short version; the long text stands on a page of its own in the journal **FANG Chronicle**, which lives in the same folder as the graph journal.

  It is created and opened through a button on the entry and in the edit form: Foundry's own editor with formatting, images and `@UUID` links to actors, scenes and journals, without FANG having to rebuild any of it.

  The page belongs to its author: a player edits their own recap directly, without the graph's edit lock. Since players may not create documents, the first request goes through the gamemaster, who creates the page and reports the id back.

  When an entry with a page is deleted, you are asked whether the page should go too. Silently deleting someone else's prose would be a loss nobody notices until they look for it.


### Changed
- **A recap only asks whose it is.** Title and short version were both unnecessary: the text is on the page, and the heading is always the same anyway. Instead of two text fields there is now a choice of characters, and the entry is called **"Recap by {name}"**. Your own character is suggested; a gamemaster can write for anyone at the table.

  If the chosen character is in the graph, the entry attaches itself to its node straight away, so the recap also appears in that token's chronicle, not only in the overall one.

  An existing recap keeps its heading as long as nobody touches the choice. Rebuilding it on every save would rename entries written months ago.

- **Button in the sheet view of Ninjo's In-Person Tools.** FANG now registers its button through their interface (`api.sheetView.registerButton`) instead of only looking for Sheet Only's bar. Both ways remain: whoever uses Sheet Only sees the button there as before.

### Fixed
- **The faction picker did nothing.** Checkboxes could be ticked, the star could be clicked, and on save everything was back as before, without a single message in the console. The reason: the editor's options object carried **`render` twice**, my new block and an older one. In that case JavaScript takes the last one and silently discards the first; so the whole wiring never ran. It now sits in the existing block, before that block's GM lock, so a player can operate the picker too. Reported by @Axel-of-the-Key (#8).

  Against it, `fang-validate` now checks: it reads the options object of every dialog call and reports a key that appears there twice. Duplicate keys are allowed even in strict mode, no parser warns about them, and the error only shows in a button that does nothing. Checked against the shipped state: the rule finds it.

- **A node's image now follows its actor.** When a node was added, a copy of the image was stored and preferred when drawing; a portrait or token changed later therefore never reached the graph. The actor's image is now drawn first. The stored copy stays as a fallback for the cases in which there is no actor to read: a player who may not see it and therefore does not have it at all, and a deleted actor. Reported by @taylor-nightingale (#7).

  When an actor changes, FANG also discards the cached image (otherwise the old one would stay until the next opening) and updates copy and name on the gamemaster's side. The name only follows if the node was never renamed by hand; otherwise it stays, and only the stored real name moves along.

- **Recaps did not appear in the chronicle.** The display discarded every entry without text, which made sense as long as text was the only thing an entry could show. Since the short version was dropped, a recap deliberately carries no player text, because its content is on the journal page; so it always disappeared for players, and for the gamemaster as soon as the GM note stayed empty too. A heading or a page to open now count as well. The entries were never lost, only not shown.

- **The input form's styling had been gone since the timeline rework.** The area override in `fang.css` reached further than intended and took the when-switch, the day-month-year choice, the preview line of the chosen date and the hint "Learned on …" with it. The rules are back.

- **"Visible to players" stood under the GM notes** and read as if it applied to them. What is meant is the whole entry. The checkbox is now called **"Share the whole entry with players"**, stands in a frame of its own and says underneath what happens without it; above the checkbox it says that GM notes never reach players anyway.

## [14.2609.1] - 2026-09-05

### Added
- **Real time as a fallback without a calendar.** If FANG finds neither a known calendar module nor a calendar in the world, an entry now carries the real date and time instead of "No game day", in the interface language, with a sort key in the same form as a game date. The chronicle is therefore ordered even in a world without any calendar.

  For entering events after the fact there is a real date field in this case, instead of a text field someone would have to fill in the same way every time.

- **Time of day in the chronicle.** An entry now also records the time of day at which it was created and shows it at the head of the entry next to the category. Within a game day it is ordered by that, the later hour first; entries without a time stand after them. On the "Today" switch it stands after the date.

  A day chosen by hand deliberately gets **no** time: the picker asks for a day, and midnight would be a claim nobody made.

- **Deleting now asks first.** The bin on a chronicle entry deleted at once and for good, right next to the pen for editing. A confirmation now appears that names the entry's title.

- **"Custom date …" is now at the top.** In the game day selection it was the last option below all the days already known and so hard to find, although a fresh date is exactly what you usually need for an event entered after the fact. It is now the first entry and preselected; the known days stand below in a group of their own. The chosen date appears as a line underneath, so nobody has to assemble the three fields in their head.

- **A calendar picker instead of typing.** For a day the chronicle does not yet know there are now three fields (day, month, year), filled from the world's calendar: real month names, real month lengths, and Harptos's one-day festivals as months of their own. Underneath it says at once what the day will be called. Without a calendar in the world, the text field remains.

  The conversion between Foundry's core calendar and a calendar module is not guessed but measured against "today": Calendaria's Harptos counts years from 1501 and months and days from one, Foundry's core from zero. This difference is determined once and applied to the chosen day, so a day chosen by hand carries the same label and the same sort key as one recognised automatically.

- **Category "Recap".** A sixth category for events the group only learns about later.

- **A date picker instead of a free text field.** The form now asks first *when* something happened: today, with the current game day next to it, or on an earlier day. For "earlier" there is a list of the game days that already appear in the chronicle, and a day chosen from it takes over its sort key unchanged. A day that does not exist yet still goes in as free text. Before, every date was free text: a typo created a second day group that looked the same and was sorted into a completely different place.

- **"Only learned about it today".** A switch separates two things that used to look the same: entering notes from the last session that the group already knew at the time, and a revelation about the past that it only learns about now. In both cases the entry stays with the day of the event; the chronicle is a chronology. In the second case "Learned on …" appears underneath, and the category switches to Recap.

- **A timeline in the chronicle.** Above the log there is an axis: one dot per game day, the oldest on the left, the most recent on the right, the way you read a timeline. The dot size shows how much happened that day; below it stands the day you are on or hovering over. A click jumps there, and the marker moves along as you scroll.

  The dots keep a minimum distance instead of moving together when there are many days. If the axis no longer fits, it is **dragged or pushed with the mouse wheel**, deliberately without a scroll bar, since otherwise it would look like an overflowing list again. The edges fade out softly so you can see there is more.

### Fixed
- **A recap now creates its page by itself.** When it was created, nothing happened with the journal page at all; it only came into being when you reopened the entry afterwards and hit the book icon. And the text field looked as if the recap belonged there. Both the wrong way round: the page is now created together with the entry and opens straight after saving.

  For this category the text field also says what it is: **Short version for the log**, a sentence or two, with a hint that the recap itself is written on the page. For all other categories it stays the usual player text.

  If a player creates the entry, the gamemaster also creates the page when taking it over, gives her ownership of it and reports the id back, so the editor opens on her side.

- **The chronicle's close button could no longer be reached.** The pinned header that title and timeline have shared since yesterday spans the full width of the card with an opaque background and lay at `z-index: 3` over the button, which sits at `1`. So it was not only invisible but also swallowed its clicks. The button now lies above it.

- **Players no longer saw "Add event" at all.** A player's entry goes through the gamemaster, so one has to be present; if none was there, the button was simply gone, and nobody could know whether the option existed at all. It now stays, greyed out, with the reason in the tooltip. The display account still gets none: it is a display, not a seat at the table.

- **594 English strings translated in nine languages.** The keys existed everywhere (the check watches for completeness), but in many languages their value was still the English one. Mainly affected was the **entire chronicle**, which had never been translated in eight languages, plus the dialog for dropping an actor, the faction and quest dialogs and a number of messages. Czech and Russian each had over a hundred such places.

  What remains are 29 values that really are the same in their language: "Cyberpunk", "Region", "Ocean" in Polish, "Role" in Czech, "Faction" and "Notes" in French. Also, the German once said "fuer" instead of "für".

- **Negative years sorted the wrong way round.** The sort key padded the absolute value of the year, so `-000009` came before `-000066`, and year -9 looked older than -66. That affects every world whose calendar module FANG does not know: the epoch lives in the module, and without it Foundry's own calendar may count before year zero. The key now uses the complement; non-negative years stay byte for byte as before, so existing entries fall into place unchanged. Recorded as scenario 15 in `tools/fang-merge-test.mjs`.

- **A rectangle around the timeline dot.** A dot is a button, and general button rules from outside this stylesheet drew a rounded rectangle on it: after a click the focus outline, and permanently on the current day an orange glow with a hairline as well. Around a round dot that looked like an error. The button is now only the hit area; everything visible sits on the round element inside it. Keyboard focus is still shown, as a round ring in the shape of the dot.

- **Long jumps in the chronicle did nothing.** The jump to a day always ran as smooth scrolling. Over very long distances Chrome silently refuses that (measured at around 29,000 pixels): the movement does not even start, and the click looks broken. Above 2,000 pixels it now jumps directly; nobody could follow such an animation anyway.

- **The stylesheet broke off in the middle.** When selectors were added, a line ending in `{` was duplicated, which gave a block two opening braces. Five such places made every rule after them ineffective: they still stood in the file, were still shipped and simply stopped applying. The whole back part was affected, which is why the edit windows looked unfinished lately. `tools/fang-validate.mjs` now checks the brace balance of every file under `styles/`.

- **Number fields carried Foundry's dark default look.** Only `input[type="text"]` and `select` were styled; the year field of the date picker therefore stood out as a dark box between two light fields and was ten pixels taller. `input[type="number"]` now belongs everywhere text fields do.

- **FANG could not be loaded at all.** The date picker contained an expression that mixes `??` with `||` without parentheses, which is a syntax error. So `fang-app.js` could no longer be evaluated, `main.js` never ran, and there were no hooks, no button and no graph, for everyone. The browser misleadingly reported a problem with a private method thirty lines further up, in another class.

  Why it got through: the check used `node --check` on a `.js` file, which treats it as a CommonJS script whose grammar lets the expression pass. Foundry loads it as an ES module, and there it is invalid. `tools/fang-validate.mjs` now checks every file under `scripts/` as an ES module and fails on exactly this case, reproduced against the broken state.

- **The FANG button was missing in Sheet Only.** It was hooked in exclusively from a `MutationObserver`, so only when elements were still being added after the observer started. But Sheet Only builds its button bar in its own asynchronous ready hook: if the bar was finished before, no change ever followed, and the button no longer appeared. Whoever had only this path could not reach the graph at all. Hooking in is now a function of its own, called several times: straight away on start, on every DOM change, when a character sheet renders and over a few follow-up attempts. The button thereby also survives the switch to Sheet Only's narrow bar variant, which replaces the bar completely.

- **On tablets the save button could not be reached.** The FANG window opened at a fixed 1400×950 pixels. On a tablet in landscape, less than that remains after the browser bar, so the bottom edge of the window lay below the screen, and with it the footer of the edit windows where "Save" sits. Scrolling did not help: that area belongs to the window, not to the page. Whoever was not the gamemaster simply could not save anything. The window is now limited to the visible area and adjusted again when the device rotates; on small screens the margins of the edit windows are also narrower.

- **Player edits were lost when taken over.** Whoever does not own the journal cannot write the graph themselves; the change goes by socket to the gamemaster, who applies and saves it. When applying it, though, the gamemaster's own comparison basis was also set to the result. The save that followed immediately then compared basis, own state and server state, and since the new node was in the basis but not yet in the server state, the merge read that as "the other side deleted it" and threw it away. A placeholder someone had created in edit mode thereby disappeared without a trace: not saved, not distributed, no error message. The basis now stays with the server state, where it belongs. Recorded as scenario 14 in `tools/fang-merge-test.mjs`.

- **Nobody learned about a player edit that had been taken over.** The gamemaster saved with the broadcast suppressed, so everyone else kept their state until they reopened the window, including the person who had made the change. It is now distributed; unfinished local work is kept.

- **An open chronicle showed the state from when it was opened.** The store had no `onChange` callback, so no change reached a window that was already open: neither an entry a player submitted, nor an automatic one from a graph action, nor an edit by a second gamemaster. You had to close and reopen the chronicle. Now it redraws itself and keeps the reading position, except while someone is filling in the input form, whose text would otherwise be lost.

- **An active calendar module was silently passed over.** FANG always asked a module's formatter with an options object. Calendaria expects a format string there and throws `n.replace is not a function` on an object, and because the whole detection attempt sat in a `try`, this exception discarded the complete calendar. FANG fell back to Foundry's core calendar and, in a world where Calendaria shows **1 Hammer 1501**, wrote the game day **"1. Hammer 0"** into the chronicle. Now every formatting attempt stands on its own: first the form without arguments (the module's default, for Calendaria "1 Hammer, 1501"), then the form with an options object, then `formatDateTime`. If all fail, the label is still built from the date fields, but the calendar itself is no longer lost. Every world with Calendaria was affected; Simple Calendar and Seasons & Stars behave unchanged.

- **The chronicle was sorted by time of typing, not by game day.** Every entry has always carried a sort key from the game date, and it was never read. It was ordered by `createdAt`, the real moment of input. Whoever entered an event from 9 April after the session found it above 12 April, and the day headings stood in the order in which you had typed. It is now sorted by game day (newest first), within a day still by input time; entries without a date gather at the end instead of sliding to the top.

- **The sort key read the wrong field of the Foundry calendar.** Foundry's `TimeComponents` carries both: `day` is the day of the **year**, `dayOfMonth` the day in the month. `day` was read, and the number was padded to two digits, so 11 April gave the key `000000-03-100`, which as a string comes **before** `000000-03-99` (10 April). In every month in which the day of the year grows from two to three digits, the order flipped. Now `dayOfMonth` is preferred as soon as both fields are there (calendar modules only send `day` and stay untouched), and the day is padded to three digits.

- **The built-in calendar delivered a machine timestamp as the day heading.** It looked for a formatter called `date`. That does not exist: Foundry only knows `timestamp`, `duration` and `ago`. So the detection fell back to `timestamp` and wrote `0000-04-11 00:00:00` above the day, time included, since that formatter ignores `includeTime`. Systems bring readable formatters; dnd5e, for instance, `formatMonthDayYear`. Those are now tried first (result: "April 11., 0"), after that the label is built from the components including the translated month name, and only last does the timestamp remain, then at least without the time that is always the same.

### Changed
- **Module description, README and TODO brought up to date.** The catalogue description only named the relationship graph; factions, locations, quests and the calendar-aware chronicle were missing. In the README the guides for gamemaster and players now also explain the chronicle and entering events after the fact. The `TODO.md` still stood at `v14.2605.3` and did not know about the chronicle work.

- **The chronicle's header stays in place.** Title and "Add event" used to scroll away; whoever was far down a long chronicle had to scroll back up first to enter something. Header and timeline now hang at the top together.

- **Recap is the category for session recaps.** It belongs to a character, and its text stands on a journal page; the form asks accordingly whose recap it is. The switch "Only learned about it today" no longer changes the category; it only records when the group learned about it.

- **The point-in-time switch is slimmer.** Icon and label in one line, the game day as a quieter line underneath, and the active state carries the thin gold line of FANG's other controls instead of a solid red block.

### Removed
- **Replacing Sheet Only's actor picker has moved out.** It went to *Ninjo's In-Person Tools* and lives there under "Replace Sheet Only's actor picker". FANG is a tool for webs of relationships; a feature that rearranges another module's interface so that playing at the table is more comfortable belongs with the table tools. Along with it went the setting `replaceOnlySheetActor`, the management of the popout including the defence against Foundry's empty window shells, and the related rules in the stylesheet, around 330 lines.

  **What this means for you:** whoever has both modules finds the feature again in its new place and has to switch it on there once; it is off by default. Whoever only has FANG loses the docked actor directory in Sheet Only mode. The FANG button in Sheet Only's bar stays unchanged, as does everything about the graph.

## [14.2608.1] - 2026-08-29

A large interface and stability release. The sidebar is organised by task, editors open in the FANG window instead of in separate Foundry windows, factions and locations have a shared home, and several errors in data storage, physics and display are fixed. Contains all beta work since 14.2605.5.

### Added
- **Shared editing (optional).** Instead of the exclusive lock, several people can work on the graph at the same time. Saving merges the changes field by field (a three-way merge), so two people working on different things no longer overwrite each other. Physics drift is deliberately discarded in the process: only positions dragged on purpose count as intent.
- **Locations.** Characters can be assigned to a location (region, city, quarter, building, realm). Faction answers "whom does someone belong to", location answers "where is someone".
- **Grouping by faction or location.** A temporary view: the characters arrange themselves by group, every group gets a labelled area, and the previous arrangement returns on reset. Positions are locked meanwhile, so the temporary view does not become the saved one.
- **Making factions visible.** Membership shows as a line between the members and as a coloured ring on the token. Hovering over the legend highlights exactly that faction and dims all the others, which is the way to find a faction in the tangle.
- **Pinning characters.** A dragged character stays where you put it instead of being pulled back by the physics. A drawing pin on the token shows it; right-click, "Release position" hands it back to the physics.
- **Editors open in the FANG window.** Factions, locations, character, relationship, placeholder and quick connect appear as a large panel in the window instead of as a separate Foundry window. Only confirmations ("Really delete?") remain dialogs of their own; they have to be able to lie over an open panel.
- **Empty management views explain themselves.** Factions and locations used to open on an empty box with an "Add" button underneath. Now it says what the area is for and what to do next.
- **Member count per location**, with a note on why a location without members stays invisible on the canvas.
- **Optional sound for the spotlight.**
- **Chronicle MVP Beta:** Added a versioned `fang.history` store for story events, automatic game-day prefill with manual override, a global day-grouped chronicle view, and a token-level chronicle view from the node context menu. Entries keep GM/private text separate from player-safe text so automation can build on the same model without exposing hidden-token secrets.
- **Chronicle Auto Entries:** Normal graph actions now add narrative chronicle entries when tokens appear, hidden identities are revealed, and new relationships become visible. Hidden tokens use their alias and placeholder portrait for player-facing entries.
- **Automated Quest and Faction Chronicle Entries:** Revealed player-facing quests and visible faction assignments now create chronicle entries from their existing workflows instead of requiring manual category selection.
- **Player Chronicle Edits:** Players can create and update the visible title/text of player-facing chronicle entries without taking the graph edit lock; GMs can still fully edit or delete entries.

### Changed
- **The sidebar is organised by task.** Faction and location are siblings and now live together in the **Affiliation** area. Before, this was scattered over three places: factions as a dialog straight from the bar, "Manage locations" under *Advanced*, the grouping buttons under *View*. The other areas: **Presentation** (grouping, players/display, centre, spectator camera) and **Settings** (permissions, physics, background, import/export). "Players may edit" stood under Presentation, and that is a permission.
- **Grouping is one switch instead of two buttons.** It is a mode of which exactly one applies at a time; two buttons said neither that nor which one was on. They also had to serve as their own off switch and change their labels for it. With a segment of its own, *Normal*, the trick is no longer needed. The switch sits with the other view settings, not with the management.
- **Editing resets the grouping.** Whoever goes into edit mode always works on the real layout; the grouped positions are locked and not the true ones.
- **All windows on the current framework** (DialogV2 instead of V1).
- **Background styles reworked.** Forest & jungle, fey forest mist, sea of stars, dungeon stone and starry night have the depth that until now only "Weathered parchment" had.
- **Delete in the character editor** now sits at the bottom left of the footer, set apart from Save, no longer in the middle of the form right above the button you press all the time.

### Fixed
- **Data loss on saving.** Locations, secrets and quest status were silently discarded on save, because serialisation was a hand-maintained allow list. Now everything is saved except what is explicitly excluded.
- **FANG would not have survived Foundry V15.** Foundry names (`KeyboardManager`, `FilePicker`) were addressed globally; those go away in V15. It showed as a warning in the console on every world start.
- **The old windows would not have survived V16.** The V1 framework reported "removed in Version 16" on every opening.
- **The graph jumped for no reason.** Two forces demanded contradictory things: the relationship line pulled connected characters to 300px, the collision pushed them apart to 320px. So the arrangement never came to rest, it only froze, and every wake-up released the tension. In addition, `forceCenter` shifted the whole graph on every frame; a dragged character thereby pushed all the others in the opposite direction.
- **Saving rolled your own view back.** The merge correctly discarded physics drift but also wrote the discarded positions back into the running display.
- **Migrations were undone on every save**, because the merge reference point was taken after instead of before the migration.
- **Portraits are round.** The rings around the tokens were circles, but the image underneath was square, and the corners stuck out.
- **Faction lines were invisible** where members are connected anyway (the normal case): the line lay at 20 % opacity behind a solid relationship line.
- **Double-click zoomed the graph** while it opened the character sheet; the zoom library brings that along out of the box.
- **GM areas were all shown at once**, stacked on top of each other: `.gm-only` forced visibility more strongly than the area could switch it off.
- **Group areas overlapped.** The arrangement calculated what the physics wanted without checking whether it fitted on the canvas; targets landed outside the visible area. Groups now sit in a grid, the drawn area ends at the cell border, and the members spread out inside on a lattice spaced by the width of their name label instead of on a tight ring.
- **Background styles did not take on the theme colours.** 85 colours were hard-wired instead of going through the theme variables; in the cyberpunk theme they stayed D&D gold. The switches were in Foundry's orange too.
- **Chronicle entries** only showed the GM the player text.

### Removed
- **Dead code:** a complete second navigation (a tab bar, invisible for a long time, replaced by the icon bar) with contradictory CSS, and the switched-off editor area, whose form fields the module kept filling on *every* change, including a pass over all actors in the world for select lists nobody could see. 328 lines.

## [14.2605.5] - 2026-05-15
### Fixed
- **Chronicle GM View:** GMs now see both the player-visible and the GM-only text of a chronicle entry instead of only the player-facing part.


## [14.2605.4] - 2026-05-15
### Merged from claude/goofy-gagarin-d190dc design-refactor branch
A selective merge of the parallel design refactor and hotfix work onto the 14.0.19 line. The beta state is kept for UI and code structure; only orthogonal bug fixes and i18n additions were taken over.

### Added
- **9 missing i18n keys** in all 10 locales: `FANG.UI.Color`, `FANG.Messages.SaveSuccess`, `FANG.Messages.OtherUser`, `FANG.Messages.LockStompTitle`, `FANG.Messages.LockStompConfirm`, `FANG.UI.Background.Palette.{DeepMahogany, Forest, Ocean, Shadow}`. The first six are referenced in the code but did not exist; the last three are for the new lock-stomp dialog.

### Fixed
- **Edit-lock race / GM stomping:** a GM could overwrite a player's or another GM's active edit lock without warning. Now the flag is read fresh before `setFlag`; on a conflict a confirmation dialog appears with the name of the current editor. The default answer is "Cancel".
- **Global role-based CSS class:** `document.body` now gets the classes `role-player` (for players) or `role-gm` (for the GM) in `Hooks.once("ready")`. CSS rules such as `body.role-player .gm-only { display: none }` thereby apply reliably to dynamically inserted elements too.

### Not merged (intentional)
- Design token system (`--fang-space-*`, `--fang-radius-*`, `--fang-text-*`): it collides with the chronicle CSS developed on beta. It can be set up later as a PR of its own if wanted.
- ARIA tab pattern (arrow key navigation, aria-selected/-controls): the beta HBS structures tabs differently. A separate accessibility pass is recommended.
- Edge arrow migration to the `.hidden` class: beta uses the old `style.display` mechanism and does not have the bug; my "improvement" was itself a regression.

### Backup
- Tag `backup/claude-refactor-2026-05-15` points at the full unmerged state of the parallel line (`14.1.3-beta.4`).

## [14.2605.3] - 2026-05-14
### Fixed
- **Quest Journal Page Links:** Quest links now support both complete Journal entries and individual Journal pages. Opening a page-linked quest now opens the parent Journal directly on the correct page, and Quest Spotlight reads the page content instead of falling back to an empty view.
- **Portuguese Brazil Localization:** Cleaned up mojibake artifacts in the new UI, faction, quick-connect, and quest-management strings.
- **Localization Validator:** Refined encoding checks so valid Portuguese characters such as `Ã` in `NÃO` are not reported as false-positive mojibake warnings.

## [14.2605.2] - 2026-05-12
### Added
- **Canvas-first Interaction Model:** Added the compact FANG rail, in-canvas edit tools, double-press panel toggles, and clearer edit-lock states for faster table use.
- **Player-Safe Hidden Contact Editing:** Hidden contacts now keep true GM information protected while players can still maintain allowed aliases, player notes, safe state markers, and optionally visible quests.
- **Quest Canvas Panel:** Reworked node quests into an in-canvas panel with clearer linked quest rows, hidden-by-default additions, visible toggles, journal opening, and spotlight actions.
- **Faction Visibility Controls:** Added faction descriptions plus GM/player visibility controls for faction visibility, legend inclusion, and faction line rendering.

### Changed
- **Modernized Sidebar and Panels:** Reduced the permanent sidebar, moved management tasks into floating panels, and aligned faction/background/admin UI with the current fantasy/cyberpunk theme system.
- **Connection Editing Flow:** Relationship editing is safer and supports changing directed links after creation, including direction flipping where appropriate.
- **README Refresh:** Updated the README screenshots and user-facing stable/beta documentation for the new UI.
- **Version Bump:** Advanced the stable module version to `14.2605.2`.

### Fixed
- **Graph Stability After Direct Connections:** Hardened quick-connect link creation so malformed edge state no longer breaks graph rendering.
- **Journal Button Robustness:** FANG journal buttons use delegated click handling so saved journal links remain compatible across Foundry v13/v14 render paths.
- **Localization Coverage:** Updated German/English strings for the redesigned UI and kept generated locale coverage in sync for all shipped languages.
- **Module Language Labels:** Corrected language display names in `module.json` so Foundry shows readable locale names.

## [14.1.3-beta.4] - 2026-05-15
### Added
- **Full ARIA tab pattern support:** tabs in the sidebar now have `aria-controls` and `tabindex="0"`/`-1` kept in sync with `aria-selected`, and the matching tab panels have `role="tabpanel"` plus `aria-labelledby`. Full keyboard navigation: ← → ↑ ↓ switch between visible tabs (skipping hidden GM-only tabs for players), Home/End jump to the beginning/end, Enter/Space activate. Screen-reader compliant.

### Changed
- **Quest picker items entirely in CSS:** the JS that built `.fang-quest-pick-item` via `innerHTML` had picked up inline styles and manual `mouseover`/`mouseout` handlers for the hover effect again during the design refactor. Now a pure CSS class `.fang-quest-pick-item` with a `:hover` pseudo-class, without inline styles and without dedicated JS handlers.
- **Visibility strategy unified:** more than 10 places in `fang-app.js` that set `element.style.display = "none"/"block"/"flex"` (context menu items, sidebar, lock button) now consistently use `classList.toggle("hidden", …)`. The `.hidden` class with `!important` is the single source of truth. That prevents further regressions like the edge arrow bug from 14.1.0-beta.1.

## [14.1.2-beta.3] - 2026-05-15
### Fixed
- **GM-only elements stayed unprotected in dynamically inserted subtrees:** the CSS rule `body.role-player .gm-only { display:none }` existed, but the class was never set. Instead a JS loop (`gmControls.forEach(el.style.display='none')`) hid GM buttons only on the initial render. The class is now set globally in `Hooks.once("ready")` (`role-player` / `role-gm`), and the redundant loop is removed.
- **Edit-lock race / GM stomping:** a GM could overwrite an active edit lock of a player or another GM without warning. Now the flag is read fresh once more before `setFlag`; on a conflict a confirmation dialog appears with the name of the current editor. The default answer is "Cancel".
- **Localize/concatenation operator bug in the lock notification:** in `name + " " + localize(key) || fallback`, `||` binds to the whole concatenation, so the fallback was unreachable and a missing key showed the raw key name. The localised string is now computed separately and then concatenated with the user name.
- **Quest picker null check in the wrong order:** `picker.querySelector(...)` ran before `if (!picker) return`, crashing when the element was missing. The guard was moved up.

### Added
- 3 new i18n keys for the lock-stomp dialog (`FANG.Messages.OtherUser`, `LockStompTitle`, `LockStompConfirm`) in all 10 locales.

## [14.1.1-beta.2] - 2026-05-15
### Fixed
- **Edge direction arrow no longer visible (regression from 14.1.0-beta.1):** the inline style refactor had switched the `style="display:none"` toggles to `class="hidden"`, but the JS kept toggling `style.display`, which no longer took effect because of `!important` in `.hidden`. Arrows of directed edges are shown and hidden correctly again via `classList.toggle("hidden", …)`.
- **Display mode UI leak on closing:** two `_onClose` methods in `FangApplication` overwrote each other. The first (cleanup of `#ui-bottom`, `#hotbar`, `#players`, `body.fang-monitor`, ResizeObserver disconnect, body style reset) never ran. After closing display mode the Foundry UI stayed hidden. Both methods merged into one.
- **6 missing i18n keys in `en.json`:** `FANG.Messages.SaveSuccess`, `FANG.UI.Color`, `FANG.UI.Background.Palette.{DeepMahogany, Forest, Ocean, Shadow}`. They were referenced in the code (`fang-app.js:79-82`, `:1790`, `:3409`) but did not exist, so Foundry showed the raw key name. Keys added and translated into all 9 other locales (cs, de, es, fr, it, nl, pl, pt-BR, ru).

## [14.1.0-beta.1] - 2026-05-04
### Beta: Design System Pass
A focused design refactor; no functional/gameplay changes. Marked **beta** because the surface area touched is large.

### Added
- **Design Tokens:** New CSS custom properties for spacing (`--fang-space-1..6`), radius (`--fang-radius-sm/md/lg/pill`), text sizes (`--fang-text-xs..3xl`), shadows (`--fang-shadow-lg/xl`), motion (`--fang-anim-fast/base/slow`) and z-index layers (`--fang-z-bg/tooltip/context-menu/spectator/overlay/fullscreen`).
- **Color Tokens:** Promoted hardcoded values to variables: `--fang-primary-red-hover`, `--fang-primary-red-light`, `--fang-text-muted/soft/faint/helper/mute-warm`, `--fang-bg-alt`, `--fang-bg-banner`, `--fang-border-hover`, `--fang-danger`, `--fang-danger-bg`.
- **Utility Classes:** Added `.fang-form-row`, `.fang-form-label[--small]`, `.fang-inline-checkbox`, `.fang-help-text[--tight]`, `.fang-section-hint`, `.fang-edit-group`, `.fang-button-row-tight`, `.fang-slider[-group/-meta]`, `.fang-visually-hidden`, `.fang-quest-picker[-header/-list]`, `.btn--block`, `.btn--accent`.
- **Accessibility:** Tab navigation now uses real `<button role="tab">` elements with `aria-selected` (synced via JS) and `aria-label` for icon-only tabs. `<i>` icons carry `aria-hidden="true"`. Added `:focus-visible` outlines for tabs, buttons, inputs, selects, lock-button and context-menu items. Added `prefers-reduced-motion` media query that disables all animations/transitions for affected users.

### Changed
- **CSS deduplication:** Removed ~250 lines of duplicate definitions for `.narrative-quest-item`, `.narrative-quests-header`, `#narrative-quests-container`, `.narrative-close`, `.edge-spotlight-card`, `.spectator-active-indicator`, `.button-group-nest` and the `@keyframes fangPulseIndicator` block. Single source of truth restored.
- **Background presets:** Merged the duplicated `.preset-tile.preset-*` (config dialog) and `#fang-bg-layer.fang-bg-preset-*` (canvas layer) declarations into shared selectors. Saved 6 large `data:` SVG noise URLs from being parsed twice.
- **Cyberpunk theme:** Three separate selectors (`:root`, `body`, `.fang-app-container`) merged into a single grouped selector. Theme also now provides muted-text overrides for cyberpunk palette.
- **Tab markup:** `<a class="tab-btn">` → `<button type="button" class="tab-btn" role="tab">`. Properly keyboard-focusable; CSS resets the native button look.
- **Z-index sanity:** Replaced literal `2147483647` with the `--fang-z-fullscreen` token (`200000`).
- **`will-change` discipline:** `#fang-bg-layer` no longer permanently advertises `will-change: opacity, transform, filter`. Promotion is now opt-in via `.is-animating`.
- **Inline styles removed:** All `style="…"` attributes inside `templates/fang-app.hbs` (≈ 25 instances) replaced with utility classes, including the large quest-picker block and the edge-directional indicator. Easier to theme & override.
- **Danger button:** `.btn.danger-btn` is now a defined CSS variant (was previously inline-styled per-button).

### Fixed
- **Mixed `font-weight` on `.button-group-nest h4`:** removed conflicting `font-weight: 800` and `font-weight: 600` overrides; the header now has a single, intentional weight.
- **Conflicting checkbox styles:** Inline checkbox markup had `style="width:auto; margin:0; cursor:pointer"` repeated 8×, now a single `.fang-inline-checkbox` class.

### Notes
- File size: `styles/fang.css` shrunk from **2518 → ~2500** lines while gaining new utilities (net −250 duplicate lines, +250 token/utility/a11y lines).
- No JS API changes. Foundry compatibility unchanged (V13 / V14).

## [14.0.19] - 2026-04-22
### Added
- **Expanded Localization Pack:** Added full i18n files for French (`fr`), Spanish (`es`), Portuguese Brazil (`pt-BR`), Italian (`it`), Polish (`pl`), Russian (`ru`), Czech (`cs`), and Dutch (`nl`).
- **Translation Automation Script:** Added `tools/translate_i18n_vertex.py` and `tools/vertex_endpoint_client.py` to generate/refresh locale files via the same Vertex/Gemini approach used in your translation toolkit.

### Changed
- **Module Language Metadata:** Updated `module.json` language entries so Foundry can offer all new locales in the UI.
- **Docs/Planning Sync:** Updated README and TODO to reflect multilingual availability.

## [14.0.18] - 2026-04-22
### Fixed
- **Theme On All FANG Windows:** The selected theme now applies consistently to open FANG dialogs, including **Background Settings** and **Manage Factions** windows.
- **Cyberpunk Dialog Styling:** Added dedicated cyberpunk styling for dialog inputs, buttons, faction rows, and premium/background-config elements so the windows no longer keep the old fantasy look.

### Changed
- **No Legacy Theme Flag:** Removed the hidden legacy `cyberpunkTheme` setting and kept a single direct source of truth via `themeVariant`.
- **Global Theme Variables:** Cyberpunk theme variables are now applied globally on the document root/body, ensuring all FANG windows inherit the active design instantly.

## [14.0.17] - 2026-04-22
### Added
- **Theme Variant Dropdown (Module Settings):** Replaced the single Cyberpunk toggle with a normal module-settings dropdown (`Fantasy` / `Cyberpunk`) for world-wide theme selection.

### Changed
- **Theme Live Sync Across Open Windows:** Theme changes now re-apply immediately to all currently open FANG windows on each client, including already opened player/monitor views.
- **Legacy Theme Migration:** Existing worlds that used the previous `cyberpunkTheme` boolean are automatically migrated to the new dropdown setting.
- **Versioning Scheme:** Switched the module to a pure `14.x.xx` version scheme.
- **Beta Version Format:** Beta workflow now generates versions as `14.x.xx-beta.<run_number>`.

## [2.0.16] - 2026-04-22
### Added
- **Optional Cyberpunk Theme (Settings):** Added a new world setting (`Enable Cyberpunk Theme`) in the normal Foundry module settings to switch FANG into a neon cyberpunk visual style.

### Changed
- **Live Theme Application:** The selected theme is now applied immediately to already open FANG windows without reopening the app.
- **Version Bump:** Advanced the module version to v2.0.16.

## [2.0.15] - 2026-04-22
### Changed
- **Foundry Compatibility Visibility:** Beta builds now include the Foundry compatibility range in the version string (`-beta.<run>.fvtt12-14`) to make supported generations immediately visible.
- **Release Naming:** GitHub release names now include the Foundry compatibility target (`Release vX.Y.Z (FVTT 13-14)` and `Beta latest (FVTT 12-14)`).
- **Version Bump:** Advanced the module version to v2.0.15.

## [2.0.14] - 2026-04-22
### Added
- **Beta Release Channel:** Added an automated beta release workflow (`.github/workflows/release-beta.yml`) that builds from the `beta` branch and updates a fixed prerelease tag `beta-latest`.
- **Fixed Beta Install Link:** Beta testers can install using a permanent manifest URL (`releases/download/beta-latest/module-beta.json`).

### Changed
- **Beta Manifest Generation:** Beta builds now generate `module-beta.json` at runtime with version suffix `-beta.<run_number>` and compatibility range `12` to `14`.
- **README Install Docs:** Added explicit Stable/Beta installation channels in English and German, including guidance that both channels use the same module id (`fang`).
- **Stable Workflow Hardening:** Added a guard in `release.yml` so only version tags are treated as stable releases.
- **Version Bump:** Advanced the module version to v2.0.14.

## [2.0.13] - 2026-04-22
### Added
- **Browser Smoke-Test Script:** Added `tools/fang-smoke-test.mjs` to run a fast Foundry login/module smoke test flow (ready-state, module API, FANG window open, Actor Directory button injection).

### Fixed
- **Placeholder Image 404:** Switched the default placeholder image path to the shipped SVG asset and added legacy path normalization for `placeholder-npc-default.webp` values stored in older graph data.
- **Spotlight Image Resolution:** Normalized spotlight portrait sourcing to use the same node image resolver, preventing stale legacy placeholder paths from surfacing during spotlight events.

### Changed
- **Version Bump:** Advanced the module version to v2.0.13.

## [2.0.12] - 2026-04-16
### Added
- **DiploGlass Character-to-Faction Assignment:** FANG now assigns graph nodes to imported DiploGlass factions based on per-character reputation values (highest positive value wins).

### Changed
- **DiploGlass Sync Triggers:** One-way sync now also reacts to DiploGlass reputation/mode setting changes (`playerReputations`, `globalReputations`, `usePerPlayerReputation`) in addition to faction updates.
- **README Update:** Documented the new automatic assignment behavior in the DiploGlass feature section.
- **Version Bump:** Advanced the module version to v2.0.12.

## [2.0.11] - 2026-04-15
### Added
- **DiploGlass One-Way Faction Sync (Optional):** Added a FANG-side integration that imports and syncs DiploGlass factions into FANG (name, icon, and metadata such as journal/rolltable references) without modifying DiploGlass.
- **First-Run GM Prompt:** Added a one-time prompt when DiploGlass is detected, allowing GMs to enable or skip faction sync directly at startup.
- **Sync Metadata Persistence:** Imported factions now store external source references to keep updates and removals consistent on subsequent sync runs.

### Changed
- **Version Bump:** Advanced the module version to v2.0.11 for this feature release.

### Credits
- Thanks to **GM MattCat** for bringing in the DiploGlass sync idea.

## [2.0.10] - 2026-04-03
### Changed
- **Dual-Version Compatibility Metadata**: Updated module compatibility to target Foundry VTT 13 through 14 (`minimum: 13`, `verified: 14`, `maximum: 14`) and refreshed user-facing version text.
- **Actor Directory Popout Detection**: Hardened popout detection to support both v13 (`popOut`) and v14 (`isPopout` / `popout`) code paths for Only-Sheet integration and cleanup logic.

### Fixed
- **v14 Popout Cleanup Reliability**: Added a `closeApplicationV2` fallback hook for Actor Directory popouts to improve close-state synchronization and ghost-shell cleanup under Foundry VTT 14.

## [2.0.9] - 2026-03-28
### Changed
- **Release Version Bump**: Advanced the project to v2.0.9 across module metadata, README, changelog, and task tracking files for the next patch release.
- **Repository Sync Check**: Verified that no additional feature or fix commits landed after v2.0.8 before preparing this release push.

## [2.0.8] - 2026-03-23
### Changed
- **Release Version Bump**: Advanced the project to v2.0.8 across module metadata, README, changelog, and task tracking files for the next patch release.
- **Repository Sync Check**: Verified that no additional feature or fix commits landed after v2.0.7 before preparing this release push.

## [2.0.7] - 2026-03-22
### Changed
- **Release Version Bump**: Advanced the project to v2.0.7 across module metadata, README, changelog, and task tracking files for the next patch release.
- **Repository Sync Check**: Verified that no additional feature or fix commits landed after v2.0.6 before preparing this release push.

## [2.0.6] - 2026-03-21
### Changed
- **Release Version Bump**: Advanced the project to v2.0.6 across module metadata, README, changelog, and task tracking files for the next patch release.
- **Repository Sync Check**: Verified that no additional feature or fix commits landed after v2.0.5 before preparing this release push.

## [2.0.5] - 2026-03-20
### Changed
- **Version Bump**: Advanced the project to v2.0.5 across the release metadata, README, changelog, and task tracking files for the next patch release.

## [2.0.4] - 2026-03-19
### Changed
- **Release Metadata Refresh**: Bumped the documented module version across the project files and aligned the release bookkeeping for the current repository state.

## [2.0.3] - 2026-03-17
### Fixed
- **Player Journal Action Icon**: Swapped the player-journal button to a stable Font Awesome book icon so the action renders consistently in the node details UI.

## [2.0.2] - 2026-03-15
### Added
- **Placeholder NPC Workflow**: GMs can create placeholder contacts directly in the graph, including a dedicated placeholder portrait and localized UI/actions.

### Changed
- **Canvas Actor Handling**: Graph nodes now persist actor references and portrait sources separately, improving dropdowns, export/import, and spotlight handling for non-standard nodes.

### Fixed
- **Drop-to-Replace Flow**: Dropping an actor onto a placeholder can now replace that node in place instead of forcing a second manual rebuild of the surrounding relationships.

## [2.0.1] - 2026-03-14
### Added
- **Search & Filter Overlay**: Added a local search overlay for nodes and links with exact-match highlighting and optional isolate mode for large graphs.

### Fixed
- **Actor Directory Popout Compatibility**: Fixed FANG integration for Actor Directory popout windows and followed up with a second stabilization pass for the popout flow.

## [2.0.0] - 2026-03-14
### Added
- **Background Settings (Live Sync)**: Customize the graph background via palette colors, custom images (blur/opacity), or style presets. Changes sync live to players/monitors.
- **Quest Log Upgrades**: Link one *or multiple* Quest Journals per node and open them via context menu / in-canvas picker.
- **Quest Spotlight**: New quest-focused Spotlight overlay (monitor auto-scroll + GM-driven scroll sync).
- **Only-Sheet Integration**: Optional setting to replace the Only-Sheet actor button and inject quick-access buttons for Actors and FANG.

### Changed
- **Spoiler Protection**: Non-GMs only see actors/journals they have permission to access.
- **Background Rendering**: Background now renders on a dedicated `#fang-bg-layer` behind the canvas.

### Fixed
- **Safer Deletion Flow**: Confirm dialogs for node/link deletion and more robust parsing of node/link identifiers.
- **Selection / Centering Edge Cases**: Trimmed select parsing and normalized select values to prevent wrong sidebar selections.
- **Background Image UX**: Prevents blur/zoom flashes while images load and adds live preview for blur/opacity without excessive settings writes.

## [1.2.7] - 2026-03-10
### Fixed
- **UI Refinements**: Renamed "(Legacy) Quick Notes" to "Quick Lore Note", fixed Assign Journal dialog button alignment, and added explanatory tooltips.
- **Journal Linking Dialog**: Wrapped node and link deletion in native `Dialog.confirm` dialogs, preventing accidental deletion.
- **Data Persistence**: Legacy player lore notes are now backed up in the actor's flags to prevent data loss when deleting nodes.
- **Journal Protection**: FANG Journal is automatically placed inside a localized "FANG - Do Not Delete" folder with explicit warning texts.

## [1.2.6] - 2026-03-08
### Fixed
- **CSS Namespacing**: Fixed an issue where generic CSS classes (like `.container` and `.sidebar`) in FANG caused formatting and layout bugs in the default D&D 5e Actor Sheets. All FANG UI styles are now strictly scoped to the `.fang-app-container`.

## [1.2.5] - 2026-03-07
### Added
- **In-Person Gaming Mode**: New setting to enable specialized monitor controls and display logic.
- **Configurable Monitor Name**: Users can now specify the display name for the monitor view (defaults to "Monitor"). Socket logic and display rules now use this setting (case-insensitive, includes-match).
- **Integrated Physics Controls**: Added a "Physics & Simulation" section to the View tab for GMs, allowing live control of Cosmic Wind and its strength.

### Improved
- **UI Aesthetics**: Completely redesigned the Presentation button groups with a more premium, structured layout, golden accents, and group headers.
- **Internalized Settings**: Moved physics-related settings out of the main module configuration and directly into the app's View tab for better accessibility.
- **Dynamic Visibility**: Monitor controls are now smarter, only appearing when In-Person Gaming Mode is on AND a valid monitor user is online.

## [1.2.4] - 2026-03-07
### Added
- **Connection Context Menu**: Right-click on any connection (edge) to edit its information, add detailed notes, or delete it, mirroring the node features.
- **Connection Narrative Spotlight**: Added a cinematic Spotlight specifically designed for connections, showing the source character portrait, connection details, the target character portrait, and a glowing directional arrow if applicable.

### Fixed
- **Directed Arrow Start Point**: Fixed the starting point of directed arrows so they originate from the center of the source token, matching the behavior of regular connections and preventing "snaking" around the token.
- **Link Click Detection**: Fixed clicking on individual links when multiple connections exist between two tokens. The hit-detection curve formula now matches the rendered curve, sampling increased for better accuracy.
- **Tooltip Positioning**: The hover tooltip no longer appears too far away when flipped to the left side. Now measures actual tooltip width instead of using a hardcoded estimate.

## [1.2.2] - 2026-03-06
- **Center Node Sync**: Centering/uncentering a token now syncs correctly to all players and the monitor. Positions are saved once the simulation has settled, not immediately.
- **Translation Fixes**: Added the missing localization string for closing the Monitor View.

### Improved
- **Connection Details UI**: Upgraded the edit connection dialog to match the visual style and terminology of node lore editing.
- **Link Hover Cursor**: The cursor now changes to a pointer when hovering over clickable links, indicating they are interactive.

## [1.2.1] - 2026-03-02
### Fixed
- **Monitor Fullscreen Black Bar**: Resolved the persistent ~78px gap at the bottom of the Monitor view. Applied a multi-layered fix: `_updatePosition` override, `MutationObserver` to guard against Foundry resetting styles, forced body padding/margin reset, and explicit hiding of all Foundry UI containers via JS.

## [1.2.0] - 2026-03-01
### Added
- **Exclusive Edit-Lock**: Only one user can edit the graph at a time to prevent conflicts.
- **Canvas Status Indicator**: A floating banner at the top of the canvas shows who is currently editing.
- **GM Override**: GMs can force-release locks held by players.
- **Socket Synchronization**: Real-time updates for lock status across all clients.
- **Auto-Zoom for All Users**: When the GM shares the graph, all players and monitors now automatically zoom-to-fit so all tokens are visible.
- **Center Graph Sync**: The GM's "Center Graph" button now works for all connected clients (players and monitors), not just locally.
- **Live Permission Toggle**: Toggling "Allow Player Editing" now instantly shows/hides the sidebar and edit controls for players without requiring a close/reopen.

### Fixed
- **Monitor Fullscreen Centering**: The Monitor's `zoomToFit` was blocked by the edit-lock guard. Centering is now treated as a view-only operation accessible to all users.
- **Context Menu Crash**: Fixed a `replaceChild` typo in `_showContextMenu` that could cause the right-click menu to break.
- **Player Sidebar Refresh**: When the GM toggles player editing permissions, the lock UI now updates in real-time (previously required close/reopen).
- **Label Overlap & Physics**: Reduced global repulsion force, tighter link curves, centered labels by default with collision-resolution pass.
- **Undirected Link Alignment**: Undirected links now draw center-to-center; directed links clip at token boundary for clean arrow placement.
- Improved Edit-Lock reliability for players (socket-based permission bypass).
- Fixed UI state where players could interact with sidebar before acquiring lock.

## [1.1.9] - 2026-03-01
### Added
- **Enhanced Narrative Spotlight**:
  - Cinematic sequenced activation (zoom first, then card).
  - High-resolution actor portraits used instead of tokens.
  - Subtitle displaying both Role and Faction information.
  - Centered overlay design with optimized camera centering to keep the character visible.
  - Improved aesthetics: Golden divider, red-themed title text.
  - Manual close only (auto-hide removed for better storytelling pacing).
- **Spectator Camera Sync**: Real-time GM camera broadcasting to all connected players and the monitor.
- **UI & Controls**: New "Spectator Mode" toggle in the View tab and "Spotlight" context menu action.
- **Localization**: Full German and English support for all Storyteller features.

## [1.1.8] - 2026-03-01
### Added
- **Auto-Zoom to Fit**: The graph now automatically adjusts zoom on open to ensure all tokens are visible within the canvas.
- **Monitor-Exclusive Boss Pivot**: For the dedicated Monitor account (user name containing "monitor"), the view now centers strictly on "Center" (Boss) nodes.
- **Center Graph Button**: Added a manual button in the "View" tab to re-center and fit the graph to the current view.
- **Localization**: Added EN/DE strings for the new centering features.

### Fixed
- **Persistent Auto-Zoom**: Auto-zoom now triggers reliably every time the graph is closed and re-opened.
- **Constructor Stability**: Resolved a critical race condition where D3 was accessed before loading.
- **Manual Zoom Preservation**: Changing sidebar settings no longer resets your manually adjusted zoom level to 100%.
- **V13 Application Lifecycle**: Corrected `_onClose` and `render` calls for full Foundry V13 `ApplicationV2` compatibility.
- **Zero-Padding Monitor View**: Screen centering on the monitor is now mathematically perfect by removing viewport offsets.

## [1.1.5] - 2026-02-28
### Added
- **Context-Sensitive Sidebar**: The sidebar now adapts to your selection (Node vs Link).
- **Interactive Selection**: Clicking a token or link in the graph immediately selects it in the sidebar.
- **Singleton Guard**: Prevented multiple FANG windows from opening simultaneously.

## [1.1.4] - 2026-02-27
### Added
- **Visual Grouping (Factions)**: Group characters into factions with custom icons, colors, and visual hubs.
- **Sidebar Tab Redesign**: Reorganized the sidebar into Editor, View, and Advanced tabs.

## [1.1.3] - 2026-02-26
### Added
- **Context Menu**: Right-click tokens for quick access to role, lore, and deletion.
- **Hover Lore**: Hover over tokens to see their background story in a premium tooltip.

## [1.1.2] - 2026-02-25
### Added
- **Boss Nodes (Center Gravity)**: Mark important characters as "Centers" to have them gravitate to the middle with a golden aura.
- **Cosmic Wind**: Added a subtle ambient animation to the graph nodes.

## [1.1.1] - 2025-05-15
### Added
- **Directional Links**: Support for arrows on relationship lines.

## [1.0.7] - 2026-02-24
### Added
- **Drag & Drop**: Drag actors from the Foundry Sidebar directly onto the canvas.
