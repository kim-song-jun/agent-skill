// Drift guard for the visual-qa ports' shared leaf libs.
//
// Each port's shallow-clicker.mjs imports `./element-identity.mjs`
// (computeElementIdentity) and `./targets-filter.mjs` (resolveTarget,
// parseAction), but those leaf libs were never vendored into the ports —
// a dangling import / ERR_MODULE_NOT_FOUND in all four visual-qa ports until
// they were added as sync-lib targets. This test fails CI if a port loses them
// again (or if shallow-clicker's import graph drifts).

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const PORTS = ["codex", "copilot", "cursor", "gemini"];
const libDir = (p) => resolve("plugins", `harness-floor-${p}`, "skills", `visual-qa-${p}`, "lib");

for (const p of PORTS) {
  test(`visual-qa port libs [${p}]: element-identity + targets-filter are vendored`, () => {
    assert.ok(existsSync(resolve(libDir(p), "element-identity.mjs")), `${p} must vendor element-identity.mjs`);
    assert.ok(existsSync(resolve(libDir(p), "targets-filter.mjs")), `${p} must vendor targets-filter.mjs`);
  });

  test(`visual-qa port libs [${p}]: shallow-clicker resolves its ./lib imports`, async () => {
    const mod = await import(resolve(libDir(p), "shallow-clicker.mjs"));
    assert.ok(Object.keys(mod).length > 0, `${p} shallow-clicker must export something (import must resolve)`);
  });
}
