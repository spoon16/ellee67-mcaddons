// Guide data for reader.ts, read straight from guide_content.json; esbuild inlines the JSON into the bundle.
import guide from "./guide_content.json";

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

// The file is authored to this schema; JSON inference only sees plain strings for sections and shapeless rows.
export const ENTRIES: GuideEntry[] = guide.entries as GuideEntry[];
