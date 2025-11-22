import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  splitting: false,
  sourcemap: true,
  clean: true,
  format: ["esm"],
  platform: "node",
  target: "node20",
  skipNodeModulesBundle: true,
  external: ["dotenv"],
});
