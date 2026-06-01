// Production bundle for the promoter (ADR 0031). Same approach as the seeder:
// inline @unbnd/schemas TS + npm deps into one ESM file. Entry is `main.ts` (the
// runtime wiring); the testable loop lives in `index.ts` and is imported by it.
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
