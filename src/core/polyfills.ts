// The bundle targets ES2020 because Bedrock's script engine lags current JavaScript. One vendored Pets module
// (property_health.js, byte-identical to the compiler's copy) calls Object.hasOwn (ES2022); this guard adds it when
// the engine lacks it and is a no-op otherwise. Import this module first so it runs before any feature code.
const objectConstructor = Object as unknown as Record<string, unknown>;
const hasOwnProperty = Object.prototype.hasOwnProperty;
if (typeof objectConstructor.hasOwn !== "function") {
  Object.defineProperty(Object, "hasOwn", {
    value: (target: object, key: PropertyKey) => hasOwnProperty.call(target, key),
    configurable: true,
    writable: true,
  });
}
