import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const mock = (name: string) => fileURLToPath(new URL(`./test/mocks/${name}.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@minecraft/server": mock("minecraft-server"),
      "@minecraft/server-ui": mock("minecraft-server-ui"),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    pool: "forks",
  },
});
