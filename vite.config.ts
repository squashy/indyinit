import { cpSync, existsSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";

function copyMapData(): Plugin {
  return {
    name: "copy-map-data",
    apply: "build",
    closeBundle() {
      if (existsSync("data")) cpSync("data", "dist/data", { recursive: true });
    },
  };
}

const page = existsSync("index.html");

export default defineConfig({
  publicDir: existsSync("public") ? "public" : false,
  build: page
    ? { outDir: "dist", emptyOutDir: true }
    : {
        outDir: "dist",
        emptyOutDir: true,
        lib: {
          entry: "src/types.ts",
          formats: ["es"],
          fileName: "types",
        },
      },
  plugins: [copyMapData()],
});
