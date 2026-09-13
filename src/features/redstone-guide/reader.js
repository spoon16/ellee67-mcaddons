/** Pure screen/route model. No Minecraft dependency; covered by Node tests. */
import { ENTRIES } from './content.js';
export const BOOK_ICON = 'textures/items/elleedog_redstone_guide_book';
export const PAGE_SIZE = 10;
export const BY_ID = new Map(ENTRIES.map(e => [e.id, e]));
export const SECTION_TITLES = {
  basics: 'Getting started', components: 'Components', recipes: 'Crafting recipes', builds: 'Three builds'
};
export const HOME = Object.freeze({ kind: 'home' });
const GLOBAL_PAGES = new Map();
let total = 0;
for (const entry of ENTRIES) { GLOBAL_PAGES.set(entry.id, total); total += entry.pages.length; }
export const TOTAL_PAGES = total;
export const GROUPS = [...new Set(ENTRIES.filter(e => e.section === 'components').map(e => e.group))];
const counts = section => ENTRIES.filter(e => e.section === section).length;
const action = (label, route, icon) => ({ label, route, ...(icon ? { icon } : {}) });
const close = () => action('Close book', null);
const integer = (value, max) => Math.max(0, Math.min(max, Number.isFinite(value) ? Math.trunc(value) : 0));

export function normalizeBookmark(value) {
  if (!value || typeof value !== 'object') return null;
  const entry = BY_ID.get(value.id);
  return entry ? { id: entry.id, page: integer(value.page, entry.pages.length - 1) } : null;
}
export function readingRoute(id, page = 0, origin = null) {
  const entry = BY_ID.get(id);
  if (!entry) return HOME;
  return { kind: 'read', id, page: integer(page, entry.pages.length - 1),
    origin: origin ?? { kind: 'list', section: entry.section,
      ...(entry.section === 'components' ? { group: entry.group } : {}), offset: 0 } };
}
export function matchingEntries(route) {
  return ENTRIES.filter(e => e.section === route.section && (!route.group || e.group === route.group));
}

/** Return all text and button destinations for a single native ActionForm. */
export function screenFor(route = HOME, bookmark = null) {
  if (!route || typeof route !== 'object') route = HOME;
  if (route.kind === 'home') {
    const saved = normalizeBookmark(bookmark);
    const buttons = [];
    if (saved) buttons.push(action(`Resume reading\n${BY_ID.get(saved.id).title}`, readingRoute(saved.id, saved.page), BOOK_ICON));
    buttons.push(
      action(`Components\n${counts('components')} reference entries`, { kind: 'groups' }),
      action(`Crafting recipes\n${counts('recipes')} recipes`, { kind: 'list', section: 'recipes', offset: 0 }),
      action('Three step-by-step builds', { kind: 'list', section: 'builds', offset: 0 }),
      action('Getting started & troubleshooting', { kind: 'list', section: 'basics', offset: 0 }),
      action('About this guide', { kind: 'about' }), close());
    return { title: '§4Redstone Guide§r',
      body: `§6LEARN  |  BUILD  |  CREATE§r\n\n${TOTAL_PAGES} reading pages for Minecraft Bedrock.\n\nCraft: 1 redstone dust + 1 leather, in any order.\nChoose a chapter below. The book is reusable.`, buttons };
  }
  if (route.kind === 'groups') {
    return { title: 'Redstone components', body: 'Choose a category. Every component entry has its own explanation and uses.',
      buttons: [...GROUPS.map(group => action(`${group}\n${ENTRIES.filter(e => e.group === group && e.section === 'components').length} entries`,
        { kind: 'list', section: 'components', group, offset: 0 })), action('Contents', HOME), close()] };
  }
  if (route.kind === 'list') {
    if (!SECTION_TITLES[route.section]) return screenFor(HOME, bookmark);
    const all = matchingEntries(route);
    const offset = Math.floor(integer(route.offset, Math.max(0, all.length - 1)) / PAGE_SIZE) * PAGE_SIZE;
    const normalized = { ...route, offset };
    const buttons = all.slice(offset, offset + PAGE_SIZE).map(e => action(e.title, readingRoute(e.id, 0, normalized)));
    if (offset + PAGE_SIZE < all.length) buttons.push(action('Next topics >', { ...normalized, offset: offset + PAGE_SIZE }));
    if (offset > 0) buttons.push(action('< Previous topics', { ...normalized, offset: offset - PAGE_SIZE }));
    buttons.push(action(route.section === 'components' ? 'Component categories' : 'Contents', route.section === 'components' ? { kind: 'groups' } : HOME));
    if (route.section === 'components') buttons.push(action('Contents', HOME));
    buttons.push(close());
    return { title: route.group ?? SECTION_TITLES[route.section],
      body: all.length ? `Topics ${offset + 1}-${Math.min(offset + PAGE_SIZE, all.length)} of ${all.length}.\nTap a topic to read its page.` : 'No topics in this category.', buttons };
  }
  if (route.kind === 'read') {
    const entry = BY_ID.get(route.id);
    if (!entry) return screenFor(HOME, bookmark);
    const p = integer(route.page, entry.pages.length - 1);
    const origin = route.origin?.kind === 'list' ? route.origin : readingRoute(entry.id).origin;
    const list = matchingEntries(origin);
    const i = list.findIndex(e => e.id === entry.id);
    const buttons = [];
    // Cross-entry navigation remains within the current chapter/category.
    if (p + 1 < entry.pages.length) buttons.push(action('Next page >', readingRoute(entry.id, p + 1, origin)));
    else if (i >= 0 && i + 1 < list.length) buttons.push(action('Next topic >', readingRoute(list[i + 1].id, 0, origin)));
    if (p > 0) buttons.push(action('< Previous page', readingRoute(entry.id, p - 1, origin)));
    else if (i > 0) { const prev = list[i - 1]; buttons.push(action('< Previous topic', readingRoute(prev.id, prev.pages.length - 1, origin))); }
    if (entry.recipe && BY_ID.has(entry.recipe)) {
      const destination = readingRoute(entry.recipe);
      destination.back = { ...route, page: p };
      buttons.push(action('Show crafting recipe', destination));
    }
    if (route.back && BY_ID.has(route.back.id)) buttons.push(action('Back to component', route.back));
    buttons.push(action('Chapter index', origin), action('Contents', HOME), close());
    return { title: entry.title,
      body: `§7${SECTION_TITLES[entry.section]} | Page ${p + 1}/${entry.pages.length}\nGuide page ${GLOBAL_PAGES.get(entry.id) + p + 1}/${TOTAL_PAGES}§r\n\n${entry.pages[p]}`,
      buttons, bookmark: { id: entry.id, page: p } };
  }
  if (route.kind === 'about') {
    return { title: 'About Redstone Guide',
      body: '§6REDSTONE GUIDE 1.0.3§r\n\nMade for ElleeDog. The pack icon and inventory texture use the selected add-on icon and closed-book item artwork.\n\nDesigned for current Bedrock on iPhone and iPad, using stable Script API 2.0 and native touch-friendly reading menus. No experimental APIs, commands, or internet services are required by this pack.\n\nThis is a custom guide item, not a vanilla written book. It cannot be placed on a lectern. The reading screens are native menus, not the earlier promotional book-spread illustrations.\n\nCode and package were checked outside Minecraft. Device import, touch behavior, and in-game rendering still require an actual Bedrock play-test.\n\nNot an official Minecraft product. Not approved by or associated with Mojang or Microsoft.',
      buttons: [action('Contents', HOME), close()] };
  }
  return screenFor(HOME, bookmark);
}
