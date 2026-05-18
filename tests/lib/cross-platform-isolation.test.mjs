import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.name.endsWith(".mjs")) out.push(p);
  }
  return out;
}

const PLUGINS = [
  "harness-builder-codex",
  "harness-builder-copilot",
  "harness-builder-gemini",
  "harness-builder-cursor",
];

for (const p of PLUGINS) {
  test(`${p}: no cross-plugin imports`, () => {
    const root = resolve("plugins", p);
    for (const file of walk(root)) {
      const src = readFileSync(file, "utf-8");
      const matches = src.match(/from\s+["']([^"']+)["']/g) || [];
      for (const m of matches) {
        const path = m.match(/["']([^"']+)["']/)[1];
        if (path.startsWith(".")) {
          const resolved = resolve(file, "..", path);
          assert.ok(
            resolved.startsWith(root),
            `${file} imports outside its plugin: ${path} → ${resolved}`,
          );
        }
      }
    }
  });
}
