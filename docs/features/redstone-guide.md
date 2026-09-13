# Redstone Guide

Feature id `redstone-guide`, enabled by default. Ported from Redstone Guide 1.0.3; the item, recipe, texture,
reader and guide text are the 1.0.3 files.

## What it does

- Adds a craftable, reusable guide book. Craft it from 1 redstone dust and 1 leather. The recipe is shapeless,
  so ingredient order and slots do not matter and it fits the 2x2 inventory grid as well as a crafting table.
- Hold the book in the main hand, aim at empty space and use **Read Guide** (right-click on a computer). The book
  is not consumed.
- Reading uses native action forms, one page at a time: 134 topics on 137 pages, grouped as 72 component entries
  in seven categories, 54 crafting references with text grids and an ingredient key, 5 getting-started pages and
  3 two-page builds (automatic night lights, a button-operated iron door, an automatic sugar cane harvester).
- Every reading screen has next and previous controls, a chapter index and a Contents button. Component pages
  link to their crafting recipe and back.
- The last page shown is stored per player and world; the home screen offers **Resume reading** the next time
  the book is opened.

## Commands

None.

## Identifiers

| What | Identifier | Where |
| --- | --- | --- |
| Item | `elleedog_redstone:guide_book` | `behavior_packs/elleedog67/items/redstone-guide/guide_book.json` |
| Recipe | `elleedog_redstone:guide_book` (shapeless, `crafting_table`) | `behavior_packs/elleedog67/recipes/redstone-guide/guide_book.json` |
| Item component | `elleedog_redstone:open_guide` | registered by `register()`, gated by the core |
| Item texture | atlas key `elleedog_redstone_guide_book` | `resource_packs/elleedog67/textures/items/elleedog_redstone_guide_book.png` |
| Display name | `item.elleedog_redstone:guide_book.name` | `resource_packs/elleedog67/texts/en_US.lang`, `en_GB.lang` |
| Item cooldown | category `elleedog_redstone_guide`, 0.25 s | item JSON |
| Bookmark | player dynamic property `elleedog_redstone:bookmark_v1` | JSON `{ "id": "<entry>", "page": <n> }` |

## Scripts

`src/features/redstone-guide/`:

- `index.ts`: the feature definition. `register()` adds the item component; `onUse` and `onUseOn` both open the
  book. `start()` subscribes the plain `itemUse` after-event as a fallback for the same book and `playerLeave` to
  drop that player's session and cooldown. `stop()` clears every session and cooldown.
- `reader.js`: the pure screen and route model, verbatim from 1.0.3. `reader.d.ts` describes it for TypeScript.
- `content.js`: exposes `ENTRIES` from `guide_content.json`; esbuild inlines the JSON into the bundle.
- `guide_content.json`: the editable guide, verbatim from 1.0.3. Every entry needs a unique id and one or two
  pages; a `recipe` field must name another entry. `test/features/redstone-guide/content.test.ts` checks this.

Behaviour details:

- Item component callbacks can run in read-only mode, so a use only records the request; the first form opens on
  the next tick.
- One reading session per player. Use events within 6 ticks of an accepted one are ignored, which stops touch
  double-activation and the duplicate between the component callback and the fallback event.
- A `UserBusy` form result (another screen is open) is retried up to 10 times, 4 ticks apart, then the player is
  told to close the other screen. A deliberate close is never retried and does not reopen the book.
- A page is bookmarked only once it was actually shown; a page the player then closes is still remembered.
- A corrupt bookmark or failed persistence never blocks reading; a thrown form is logged, the player is told, and
  the next use works.

## What "disabled" means

The item and its recipe stay in the world: Bedrock cannot unregister them after startup. Using the book does
nothing. The component callbacks are gated by the core and the fallback subscription is gone. A reader that is
open when the feature is disabled closes at its next screen and sends no message. Bookmarks are kept and work
again after `/elleedog67:enable redstone-guide`.

## Known limits

From the 1.0.3 README and validation report:

- "This is not a vanilla written book and cannot be placed on a lectern." Recipes are text grids, not interactive
  crafting slots.
- "The three build guides explain constructions to make manually; the add-on does not place the structures for
  you or modify vanilla redstone behavior."
- "This package has not been imported or run in Minecraft or on an iOS device here." The port keeps that boundary:
  the tests cover navigation, content and the mocked event and session logic, not engine bindings, touch input or
  rendering.
- The reference text mentions components newer than the pack's minimum engine version, so use an up-to-date game.

## Manual in-game checks

1. Craft the book from 1 redstone dust and 1 leather in both ingredient orders, in the inventory grid and at a
   crafting table. Confirm it also appears in the Creative inventory with the closed-book icon and the name
   "Redstone Guide".
2. Hold the book, aim at empty space and use Read Guide. The home screen lists Components, Crafting recipes,
   Three step-by-step builds, Getting started and About.
3. Open every category. Long topic lists paginate with "Next topics >" and "< Previous topics"; long pages scroll
   on the device.
4. From a component page use "Show crafting recipe", then "Back to component".
5. Read to the second page of a build and close the book. Use it again: "Resume reading" is the first button and
   opens that page. Leave and rejoin the world and check Resume reading again.
6. Use the book with the ElleeDog 67 Book's menu still open. The guide should open once that menu is closed; if
   it reports "Close the other screen, then use Read Guide again.", close every menu and use it again.
7. Two players read at the same time. Each sees their own pages and their own bookmark.
8. Close the book deliberately. It must not reopen by itself.
9. Run `/elleedog67:disable redstone-guide`. The book does nothing when used; the recipe still crafts. Run
   `/elleedog67:enable redstone-guide`. Reading and the earlier bookmark work again.
