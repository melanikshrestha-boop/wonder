/**
 * One-off build config for the self-contained single-file bundle
 * (claude.ai artifact / offline copy). Everything in one JS chunk so
 * it can be inlined into a single HTML file.
 */
import baseConfig from "./vite.config";
import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig(async (env) => {
  const base =
    typeof baseConfig === "function" ? await (baseConfig as any)(env) : baseConfig;
  return {
    ...base,
    base: "./",
    build: {
      outDir: "dist-single",
      rollupOptions: {
        input: resolve(process.cwd(), "index.html"),
        output: { inlineDynamicImports: true },
      },
    },
  };
});
