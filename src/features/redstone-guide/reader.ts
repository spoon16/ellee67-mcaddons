// Pure screen/route model. No Minecraft dependency; covered by Node tests.
//
// Think of the book as a tiny website. A Route is an address ("the recipes list, second page" or "entry X, page 3")
// and a Screen is the page rendered for that address: a title, body text and buttons, each button carrying the
// Route it leads to (or null for Close). `screenFor(route)` is the only entry point; index.ts calls it in a loop,
// showing each Screen and following whichever button the player taps.
import { ENTRIES, type GuideEntry, type Section } from "./content.ts";

export type { CraftingMatrix, GuideEntry, Section } from "./content.ts";

export interface Bookmark {
  id: string;
  page: number;
}

/** A destination the reader produces; the feature only hands routes back to `screenFor`. */
export interface Route {
  kind: "home" | "groups" | "list" | "read" | "about";
  id?: string;
  page?: number;
  section?: string;
  group?: string;
  offset?: number;
  /** For a reading page: the list it was opened from, so "Chapter index" and next/previous topic stay in it. */
  origin?: Route;
  /** For a recipe opened from a component page: the page to return to. */
  back?: Route;
}

export interface Button {
  label: string;
  route: Route | null;
  icon?: string;
}

/** Everything one ActionForm shows; `bookmark` is present only on reading pages. */
export interface Screen {
  title: string;
  body: string;
  buttons: Button[];
  bookmark?: Bookmark;
}

export const BOOK_ICON = "textures/items/elleedog_redstone_guide_book";
/** Topics per list screen; a form with too many buttons needs scrolling on a phone. */
export const PAGE_SIZE = 10;
export const BY_ID = new Map<string, GuideEntry>(ENTRIES.map((e) => [e.id, e]));
export const SECTION_TITLES: Record<Section, string> = {
  basics: "Getting started",
  components: "Components",
  recipes: "Crafting recipes",
  builds: "Three builds",
};
export const HOME: Route = Object.freeze({ kind: "home" });
// Each entry's first page number counted across the whole book, for the "Guide page 12/57" line.
const GLOBAL_PAGES = new Map<string, number>();
let total = 0;
for (const entry of ENTRIES) {
  GLOBAL_PAGES.set(entry.id, total);
  total += entry.pages.length;
}
export const TOTAL_PAGES = total;
/** The component categories, in the order they first appear in the content file. */
export const GROUPS = [...new Set(ENTRIES.filter((e) => e.section === "components").map((e) => e.group))];
const counts = (section: Section) => ENTRIES.filter((e) => e.section === section).length;
const action = (label: string, route: Route | null, icon?: string): Button => ({
  label,
  route,
  ...(icon ? { icon } : {}),
});
const close = () => action("Close book", null);
// Clamps anything (a saved bookmark, a stale route) to a whole number between 0 and `max`.
const integer = (value: unknown, max: number) =>
  Math.max(0, Math.min(max, typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 0));
// Untrusted ids may be missing or not strings; those never match an entry.
const entryFor = (id: unknown): GuideEntry | undefined => (typeof id === "string" ? BY_ID.get(id) : undefined);
// The list an entry naturally belongs to: its chapter, narrowed to its category for components.
const listOrigin = (entry: GuideEntry): Route => ({
  kind: "list",
  section: entry.section,
  ...(entry.section === "components" ? { group: entry.group } : {}),
  offset: 0,
});

/** Turns whatever was saved into a usable bookmark, or null when it points at an entry that no longer exists. */
export function normalizeBookmark(value: unknown): Bookmark | null {
  if (!value || typeof value !== "object") return null;
  const { id, page } = value as { id?: unknown; page?: unknown };
  const entry = entryFor(id);
  return entry ? { id: entry.id, page: integer(page, entry.pages.length - 1) } : null;
}
export function readingRoute(id: string, page = 0, origin: Route | null = null): Route {
  const entry = BY_ID.get(id);
  if (!entry) return HOME;
  return { kind: "read", id, page: integer(page, entry.pages.length - 1), origin: origin ?? listOrigin(entry) };
}
export function matchingEntries(route: Route): GuideEntry[] {
  return ENTRIES.filter((e) => e.section === route.section && (!route.group || e.group === route.group));
}

function homeScreen(bookmark: unknown): Screen {
  const saved = normalizeBookmark(bookmark);
  const resume = saved ? BY_ID.get(saved.id) : undefined;
  const buttons: Button[] = [];
  // "Resume reading" comes first, and only once there is something to resume.
  if (saved && resume)
    buttons.push(action(`Resume reading\n${resume.title}`, readingRoute(saved.id, saved.page), BOOK_ICON));
  buttons.push(
    action(`Components\n${counts("components")} reference entries`, { kind: "groups" }),
    action(`Crafting recipes\n${counts("recipes")} recipes`, { kind: "list", section: "recipes", offset: 0 }),
    action("Three step-by-step builds", { kind: "list", section: "builds", offset: 0 }),
    action("Getting started & troubleshooting", { kind: "list", section: "basics", offset: 0 }),
    action("About this guide", { kind: "about" }),
    close(),
  );
  return {
    title: "§4Redstone Guide§r",
    body: `§6LEARN  |  BUILD  |  CREATE§r\n\n${TOTAL_PAGES} reading pages for Minecraft Bedrock.\n\nCraft: 1 redstone dust + 1 leather, in any order.\nChoose a chapter below. The book is reusable.`,
    buttons,
  };
}

function groupsScreen(): Screen {
  return {
    title: "Redstone components",
    body: "Choose a category. Every component entry has its own explanation and uses.",
    buttons: [
      ...GROUPS.map((group) =>
        action(`${group}\n${ENTRIES.filter((e) => e.group === group && e.section === "components").length} entries`, {
          kind: "list",
          section: "components",
          group,
          offset: 0,
        }),
      ),
      action("Contents", HOME),
      close(),
    ],
  };
}

/** One page of a chapter's topics, or null when the route names a section the guide does not have. */
function listScreen(route: Route): Screen | null {
  const section = route.section as Section;
  if (!SECTION_TITLES[section]) return null;
  const all = matchingEntries(route);
  // Snap the offset to a page boundary so a stale or odd offset still shows a whole page.
  const offset = Math.floor(integer(route.offset, Math.max(0, all.length - 1)) / PAGE_SIZE) * PAGE_SIZE;
  const normalized = { ...route, offset };
  const buttons = all.slice(offset, offset + PAGE_SIZE).map((e) => action(e.title, readingRoute(e.id, 0, normalized)));
  if (offset + PAGE_SIZE < all.length)
    buttons.push(action("Next topics >", { ...normalized, offset: offset + PAGE_SIZE }));
  if (offset > 0) buttons.push(action("< Previous topics", { ...normalized, offset: offset - PAGE_SIZE }));
  buttons.push(
    action(
      route.section === "components" ? "Component categories" : "Contents",
      route.section === "components" ? { kind: "groups" } : HOME,
    ),
  );
  if (route.section === "components") buttons.push(action("Contents", HOME));
  buttons.push(close());
  return {
    title: route.group ?? SECTION_TITLES[section],
    body: all.length
      ? `Topics ${offset + 1}-${Math.min(offset + PAGE_SIZE, all.length)} of ${all.length}.\nTap a topic to read its page.`
      : "No topics in this category.",
    buttons,
  };
}

/** One reading page with its in-chapter navigation, or null when the entry does not exist. */
function readScreen(route: Route): Screen | null {
  const entry = entryFor(route.id);
  if (!entry) return null;
  const p = integer(route.page, entry.pages.length - 1);
  const origin = route.origin?.kind === "list" ? route.origin : listOrigin(entry);
  const list = matchingEntries(origin);
  const i = list.findIndex((e) => e.id === entry.id);
  const next = list[i + 1];
  const prev = list[i - 1];
  const buttons: Button[] = [];
  // Cross-entry navigation remains within the current chapter/category.
  // "Next" turns the page while the entry has more, then moves on to the next topic in the same list.
  if (p + 1 < entry.pages.length) buttons.push(action("Next page >", readingRoute(entry.id, p + 1, origin)));
  else if (i >= 0 && next) buttons.push(action("Next topic >", readingRoute(next.id, 0, origin)));
  if (p > 0) buttons.push(action("< Previous page", readingRoute(entry.id, p - 1, origin)));
  else if (i > 0 && prev)
    buttons.push(action("< Previous topic", readingRoute(prev.id, prev.pages.length - 1, origin)));
  if (entry.recipe && BY_ID.has(entry.recipe)) {
    // The recipe page gets a `back` route so "Back to component" returns to exactly this page.
    const destination = readingRoute(entry.recipe);
    destination.back = { ...route, page: p };
    buttons.push(action("Show crafting recipe", destination));
  }
  if (route.back && entryFor(route.back.id)) buttons.push(action("Back to component", route.back));
  buttons.push(action("Chapter index", origin), action("Contents", HOME), close());
  return {
    title: entry.title,
    // Every entry has a global page; the fallback only satisfies the Map type.
    body: `§7${SECTION_TITLES[entry.section]} | Page ${p + 1}/${entry.pages.length}\nGuide page ${(GLOBAL_PAGES.get(entry.id) ?? 0) + p + 1}/${TOTAL_PAGES}§r\n\n${entry.pages[p]}`,
    buttons,
    bookmark: { id: entry.id, page: p },
  };
}

function aboutScreen(): Screen {
  return {
    title: "About Redstone Guide",
    body: "§6REDSTONE GUIDE 1.0.3§r\n\nMade for ElleeDog. The pack icon and inventory texture use the selected add-on icon and closed-book item artwork.\n\nDesigned for current Bedrock on iPhone and iPad, using stable Script API 2.0 and native touch-friendly reading menus. No experimental APIs, commands, or internet services are required by this pack.\n\nThis is a custom guide item, not a vanilla written book. It cannot be placed on a lectern. The reading screens are native menus, not the earlier promotional book-spread illustrations.\n\nCode and package were checked outside Minecraft. Device import, touch behavior, and in-game rendering still require an actual Bedrock play-test.\n\nNot an official Minecraft product. Not approved by or associated with Mojang or Microsoft.",
    buttons: [action("Contents", HOME), close()],
  };
}

/**
 * One builder per route kind; a builder answers null when its route points at nothing, and home takes over.
 * A lookup table like this replaces a chain of if/else and makes adding a screen a one-line change.
 */
const SCREENS: Record<Route["kind"], (route: Route, bookmark: unknown) => Screen | null> = {
  home: (_route, bookmark) => homeScreen(bookmark),
  groups: () => groupsScreen(),
  list: (route) => listScreen(route),
  read: (route) => readScreen(route),
  about: () => aboutScreen(),
};

/** Return all text and button destinations for a single native ActionForm. */
export function screenFor(untrusted: unknown = HOME, bookmark: unknown = null): Screen {
  // Any object is read as a route; unknown kinds, ids and sections fall back to the home screen.
  const route = (untrusted && typeof untrusted === "object" ? untrusted : HOME) as Route;
  // Object.hasOwn, not `in`: a kind such as "constructor" must not reach a builtin on Object's prototype.
  const build = Object.hasOwn(SCREENS, route.kind) ? SCREENS[route.kind] : undefined;
  return build?.(route, bookmark) ?? homeScreen(bookmark);
}
