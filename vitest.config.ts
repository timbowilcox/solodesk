import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: false,
    clearMocks: true,
    restoreMocks: true,
  },
  resolve: {
    alias: {
      "@": dirname,
      // Next.js provides `server-only` as a build-time guard. In tests we
      // bypass it by aliasing to an empty module so server modules import
      // cleanly under Vitest.
      "server-only": path.resolve(dirname, "tests/_helpers/empty.ts"),
    },
  },
});
