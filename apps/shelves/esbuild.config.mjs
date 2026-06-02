// Production bundle for the shelves worker (ADR 0036). Same approach as the
// indexer/promoter: inline @unbnd/schemas + @unbnd/trust TS + npm deps into one
// ESM file. Entry is the runtime main; output dist/index.js.
import { build } from "esbuild";

await build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outfile: "dist/index.js",
  banner: {
    js: [
      "import { createRequire as __cr } from 'module';",
      "import { fileURLToPath as __f } from 'url';",
      "import { dirname as __d } from 'path';",
      "const require = __cr(import.meta.url);",
      "const __filename = __f(import.meta.url);",
      "const __dirname = __d(__filename);",
    ].join(""),
  },
});
