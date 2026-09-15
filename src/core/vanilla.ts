// Vanilla identifiers as string literals that the compiler checks against @minecraft/vanilla-data. The package's
// enums are runtime objects that esbuild cannot tree-shake (about 250 KB per bundle), so only its types are used:
// `entityId("minecraft:creeper")` is the literal at runtime and a compile error for a misspelt id.
import type { MinecraftBlockTypes, MinecraftEntityTypes, MinecraftItemTypes } from "@minecraft/vanilla-data";

// `${Enum}` turns an enum into the union of its string values, so a plain string literal can be checked against it.
export type VanillaEntityId = `${MinecraftEntityTypes}`;
export type VanillaBlockId = `${MinecraftBlockTypes}`;
export type VanillaItemId = `${MinecraftItemTypes}`;

// Each helper just returns its argument. The generic `<T extends ...>` is the point: TypeScript rejects an id that is
// not in the list, and the result keeps the exact literal type, so it still works in `===` comparisons and `Set`s.
export const entityId = <T extends VanillaEntityId>(id: T): T => id;
export const blockId = <T extends VanillaBlockId>(id: T): T => id;
export const itemId = <T extends VanillaItemId>(id: T): T => id;
