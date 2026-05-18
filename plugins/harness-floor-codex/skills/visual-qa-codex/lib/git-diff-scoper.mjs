// Git-diff scoper: given a diff range, decide which pages are affected.
// Framework-aware (Next.js / Vite / CRA / Remix), with a conservative
// `src/`-anything → "rebuild everything" fallback so we never silently
// skip a relevant page.
//
// Pure: takes a list of changed file paths + a project structure
// fingerprint, returns a scoping verdict. The shell of `git diff
// --name-only` is the responsibility of the caller.
//
// Output shapes:
//   { scope: "none" }                  // nothing visual touched (docs/tests/CI only)
//   { scope: "all" }                   // unknown impact — run the full crawl
//   { scope: "some", paths: [...] }    // a specific set of pages

import { existsSync } from "node:fs";
import { resolve } from "node:path";

const NON_VISUAL_PREFIXES = [
  "docs/",
  "test/",
  "tests/",
  "spec/",
  ".github/",
  "CHANGELOG",
  "README",
  ".vscode/",
  ".idea/",
];

const NON_VISUAL_SUFFIXES = [".md", ".test.js", ".test.ts", ".test.mjs", ".spec.js", ".spec.ts"];

const FRAMEWORK_DETECTORS = [
  {
    name: "nextjs-app",
    detect: (cwd) => existsSync(resolve(cwd, "app/layout.tsx")) || existsSync(resolve(cwd, "app/layout.js")),
    routeDirs: ["app/"],
    fileToRoute: (file) => {
      // app/foo/page.tsx → /foo
      // app/foo/[id]/page.tsx → /foo/[id]
      const m = file.match(/^app\/(.+?)\/page\.(tsx|jsx|ts|js)$/);
      if (!m) return null;
      const seg = m[1] === "" ? "/" : "/" + m[1];
      return seg.replace(/\(.*?\)\//g, "");
    },
  },
  {
    name: "nextjs-pages",
    detect: (cwd) => existsSync(resolve(cwd, "pages")) || existsSync(resolve(cwd, "src/pages")),
    routeDirs: ["pages/", "src/pages/"],
    fileToRoute: (file) => {
      const m = file.match(/^(?:src\/)?pages\/(.+?)\.(tsx|jsx|ts|js)$/);
      if (!m) return null;
      let p = m[1];
      if (p === "index") return "/";
      if (p.endsWith("/index")) return "/" + p.slice(0, -"/index".length);
      return "/" + p;
    },
  },
  {
    name: "remix",
    detect: (cwd) => existsSync(resolve(cwd, "app/routes")) && existsSync(resolve(cwd, "remix.config.js")),
    routeDirs: ["app/routes/"],
    fileToRoute: (file) => {
      const m = file.match(/^app\/routes\/(.+?)\.(tsx|jsx|ts|js)$/);
      if (!m) return null;
      return "/" + m[1].replace(/\$/g, ":").replace(/\.index$/, "");
    },
  },
];

function isNonVisualPath(path) {
  if (NON_VISUAL_PREFIXES.some((p) => path.startsWith(p))) return true;
  if (NON_VISUAL_SUFFIXES.some((s) => path.endsWith(s))) return true;
  return false;
}

export function detectFramework(cwd = ".") {
  for (const det of FRAMEWORK_DETECTORS) {
    if (det.detect(cwd)) return det;
  }
  return null;
}

export function scopeDiff({ changedFiles, cwd }) {
  if (!Array.isArray(changedFiles)) {
    throw new TypeError("scopeDiff requires changedFiles array");
  }
  if (changedFiles.length === 0) return { scope: "none" };

  // If every changed file is in the non-visual set: scope "none".
  const visualChanges = changedFiles.filter((f) => !isNonVisualPath(f));
  if (visualChanges.length === 0) return { scope: "none" };

  const framework = detectFramework(cwd ?? ".");
  if (!framework) {
    // Unknown framework: conservative — run everything if anything under src/.
    const anySrc = visualChanges.some((f) => f.startsWith("src/") || f.startsWith("app/") || f.startsWith("pages/"));
    return anySrc ? { scope: "all" } : { scope: "none" };
  }

  const inRouteDirs = visualChanges.filter((f) =>
    framework.routeDirs.some((d) => f.startsWith(d)),
  );
  // Anything visual outside the route dirs (shared component, global CSS,
  // tailwind config, layout) → run everything. Safer than guessing.
  const hasGlobalImpact = visualChanges.some(
    (f) => !framework.routeDirs.some((d) => f.startsWith(d)),
  );
  if (hasGlobalImpact) return { scope: "all" };

  const paths = new Set();
  for (const f of inRouteDirs) {
    const route = framework.fileToRoute(f);
    if (route) paths.add(route);
  }
  if (paths.size === 0) return { scope: "all" };
  return { scope: "some", paths: [...paths] };
}

export const __test__ = { isNonVisualPath };
