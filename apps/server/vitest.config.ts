import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.spec.ts"],
    },
  },
  define: {
    "import.meta.env.CI": JSON.stringify(
      !!process.env.CI || !!process.env.GITHUB_ACTIONS || !!process.env.GITLAB_CI,
    ),
  },
});
