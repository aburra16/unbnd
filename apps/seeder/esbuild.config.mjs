// Production bundle for the seeder (ADR 0008). Same approach as the API:
// inline @unbnd/schemas TS + npm deps into one ESM file.
import { build } from "esbuild";

await build({
  // Two one-off entrypoints ride the same image: the catalog seed (index) and
  // the genre recast (Story 75 / ADR 0073; `run seeder node recast.js`).
  entryPoints: ["src/index.ts", "src/recast.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outdir: "dist",
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
