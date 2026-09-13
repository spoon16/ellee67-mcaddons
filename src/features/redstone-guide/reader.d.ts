// Types for reader.js, which ships verbatim from Redstone Guide 1.0.3 and is not type-checked itself.

export type Section = "basics" | "components" | "recipes" | "builds";

export interface CraftingMatrix {
  shapeless: boolean;
  /** Shaped recipes list one string per row; shapeless recipes list `[count, ingredient]` pairs. */
  rows: Array<string | [number, string]>;
  key: Record<string, string>;
  output: number;
}

export interface GuideEntry {
  id: string;
  title: string;
  section: Section;
  group: string;
  pages: string[];
  /** Id of the recipes entry a component page links to. */
  recipe?: string;
  crafting?: CraftingMatrix;
}

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
  origin?: Route;
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

export const BOOK_ICON: string;
export const PAGE_SIZE: number;
export const BY_ID: Map<string, GuideEntry>;
export const SECTION_TITLES: Record<Section, string>;
export const HOME: Route;
export const TOTAL_PAGES: number;
export const GROUPS: string[];

export function normalizeBookmark(value: unknown): Bookmark | null;
export function readingRoute(id: string, page?: number, origin?: Route | null): Route;
export function matchingEntries(route: Route): GuideEntry[];
/** Untrusted routes and bookmarks are validated and fall back to the home screen. */
export function screenFor(route?: unknown, bookmark?: unknown): Screen;
