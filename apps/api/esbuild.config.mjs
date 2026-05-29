// Production bundle for the API (ADR 0007). Inlines the @unbnd/schemas TS
// workspace source + npm deps into one ESM file so the runtime image is just
// node:22-slim + dist/index.js (no node_modules, no TS at runtime).
import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outfile: "dist/index.js",
  // Some bundled CJS deps reach for `require`/`__dirname` under ESM; shim them.
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
