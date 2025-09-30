import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

const plugin = tsconfigPaths();

export default defineConfig({
  plugins: [plugin as never],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
  },
});
