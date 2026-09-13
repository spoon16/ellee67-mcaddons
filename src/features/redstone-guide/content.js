// Guide data for reader.js, read straight from guide_content.json; esbuild inlines the JSON into the bundle.
import guide from './guide_content.json';

export const ENTRIES = guide.entries;
