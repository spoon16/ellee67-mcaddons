// A polyfill is a small piece of code that adds a newer JavaScript feature to an engine that lacks it.
// The bundle targets ES2020 because Bedrock's script engine lags current JavaScript. Feature code calls
// Object.hasOwn (ES2022): the declaration below lets TypeScript accept it at ES2020, and the guard adds it when the
// engine lacks it (a no-op otherwise). Import this module first so it runs before any feature code.
declare global {
  interface ObjectConstructor {
    hasOwn(target: object, key: PropertyKey): boolean;
  }
}

const objectConstructor = Object as unknown as Record<string, unknown>;
const ownProperty = Object.prototype.hasOwnProperty;
if (typeof objectConstructor.hasOwn !== "function") {
  Object.defineProperty(Object, "hasOwn", {
    value: (target: object, key: PropertyKey) => ownProperty.call(target, key),
    configurable: true,
    writable: true,
  });
}

// An empty export makes this file a module, which is what `declare global` above requires.
export {};
