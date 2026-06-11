// CLI (Story 83 / ADR 0080 §2): load Appendix M from the style guide, expand
// the content globs from the repo root, scan, print hits, exit non-zero only
// on error-severity hits. An absent or empty content directory is the clean
// zero-hit baseline.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { loadRules } from "./rules";
import { exitCodeFor, scan, type ScanFile } from "./scan";

const REPO_ROOT = resolve(import.meta.dirname, "../../..");
const STYLE_GUIDE = join(
  REPO_ROOT,
  "product-team/guides/reader-guide-style-guide.md",
);

/** Minimal glob support for the appendix's `<dir>/**\/*.md` shape. */
function expandGlob(glob: string): string[] {
  const starsAt = glob.indexOf("**");
  const baseDir = join(REPO_ROOT, starsAt === -1 ? glob : glob.slice(0, starsAt));
  const suffix = glob.endsWith(".md") ? ".md" : "";
  if (!existsSync(baseDir)) return [];
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (!suffix || full.endsWith(suffix)) out.push(full);
    }
  };
  walk(baseDir);
  return out;
}

const list = loadRules(readFileSync(STYLE_GUIDE, "utf8"));
const files: ScanFile[] = list.contentGlobs
  .flatMap(expandGlob)
  .map((path) => ({
    path: relative(REPO_ROOT, path),
    text: readFileSync(path, "utf8"),
  }));

const hits = scan(list, files);
for (const h of hits) {
  const tag = h.severity === "error" ? "error" : "flag ";
  console.log(`${tag} ${h.file}:${h.line}:${h.column} [${h.ruleId}] ${h.ruleName}: "${h.matched}"`);
}
const errors = hits.filter((h) => h.severity === "error").length;
const flags = hits.length - errors;
console.log(
  `guide-lint: ${files.length} file(s) scanned, ${errors} error(s), ${flags} flag(s).`,
);
process.exit(exitCodeFor(hits));
