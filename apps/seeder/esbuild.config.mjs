// Production bundle for the seeder (ADR 0008). Same approach as the API:
// inline @unbnd/schemas TS + npm deps into one ESM file.
import { build } from "esbuild";

await build({
  // One-off entrypoints ride the same image: the catalog seed (index), the
  // genre recast (Story 75 / ADR 0073; `run seeder node recast.js`), the
  // header-only publish (Story 97 / ADR 0087; `run seeder node headers.js`) and
  // the catalog year correction (Story 104 / ADR 0093; `run seeder node years.js`).
  entryPoints: ["src/index.ts", "src/recast.ts", "src/publish-headers.ts", "src/correct-years.ts"],
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
