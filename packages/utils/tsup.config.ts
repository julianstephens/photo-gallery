import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/server.ts", "src/redis/index.ts"],
  splitting: false,
  sourcemap: true,
  clean: true,
  format: ["esm"],
  dts: true,
});
