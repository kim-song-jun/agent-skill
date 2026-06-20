// Real-install integration test for /agent-init's cross-plugin template
// resolution.
//
// The dev machine runs from a SOURCE checkout, where `plugins/harness-floor/`
// is a sibling of `plugins/harness-builder/`. A real plugin install is NOT a
// source checkout — each plugin lives at its own
// ~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/ path with no
// sibling `plugins/` dir. That layout difference masked a class of
// source-relative-path bugs (e.g. /agent-init's floor wiring silently wrote an
// empty .visual-qa.json / .agent-all.json on a real install).
//
// This test reproduces the cache layout: it copies harness-builder and
// harness-floor into <cache>/agent-skill/<plugin>/<ver>/ and runs the COPIED
// init.mjs with $HOME pointed at a temp installed_plugins.json. From there
// init.mjs's repoRoot has no sibling plugins/harness-floor, so it MUST resolve
// harness-floor via the install path — exercising the install-aware resolver.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO = resolve(".");
const VER = "0.6.15";

function tmp(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

// Cache layout: <cache>/agent-skill/<plugin>/<ver>/ — NOT a source checkout.
function buildCache() {
  const cache = tmp("real-install-cache-");
  const builderDst = join(cache, "agent-skill", "harness-builder", VER);
  const floorDst = join(cache, "agent-skill", "harness-floor", VER);
  cpSync(join(REPO, "plugins/harness-builder"), builderDst, { recursive: true });
  cpSync(join(REPO, "plugins/harness-floor"), floorDst, { recursive: true });
  return { cache, initBin: join(builderDst, "bin", "init.mjs"), floorDst };
}

function writeHome(floorInstallPath, includeFloor) {
  const home = tmp("real-install-home-");
  const pluginsDir = join(home, ".claude", "plugins");
  mkdirSync(pluginsDir, { recursive: true });
  const plugins = {};
  if (includeFloor) {
    plugins["harness-floor@agent-skill"] = [{ scope: "user", installPath: floorInstallPath, version: VER }];
  }
  writeFileSync(join(pluginsDir, "installed_plugins.json"), JSON.stringify({ version: 2, plugins }));
  return home;
}

test("real-install: init.mjs renders floor config from the INSTALLED plugin path (no source sibling)", () => {
  const { cache, initBin, floorDst } = buildCache();
  const home = writeHome(floorDst, true);
  const target = tmp("real-install-target-");
  try {
    const res = spawnSync("node", [initBin, target, "--lang=en", "--no-doctor"], {
      encoding: "utf-8",
      env: { ...process.env, HOME: home },
    });
    assert.equal(res.status, 0, `init failed:\nSTDOUT:\n${res.stdout}\nSTDERR:\n${res.stderr}`);

    const vqaPath = join(target, ".visual-qa.json");
    const aaPath = join(target, ".agent-all.json");
    assert.ok(existsSync(vqaPath), ".visual-qa.json must be produced from the installed floor templates");
    assert.ok(existsSync(aaPath), ".agent-all.json must be produced from the installed floor templates");

    // Real rendered content — not an empty/garbage file (the masked bug).
    const vqa = JSON.parse(readFileSync(vqaPath, "utf-8"));
    const aa = JSON.parse(readFileSync(aaPath, "utf-8"));
    assert.equal(vqa.baseUrl, "http://localhost:3000", ".visual-qa.json must carry rendered content");
    assert.equal(aa.loop.breakCondition, "npm test", ".agent-all.json must carry rendered loop content");
    assert.equal(aa.defaults.maxIter, 10, ".agent-all.json must carry rendered defaults");
  } finally {
    rmSync(cache, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }
});

test("real-install: init.mjs fails loudly (no empty config) when harness-floor cannot be resolved", () => {
  // floor is on disk in the cache but registered NOWHERE the resolver looks
  // (no source sibling, absent from installed_plugins.json) → must abort, not
  // silently write an empty .agent-all.json.
  const { cache, initBin } = buildCache();
  const home = writeHome("/nonexistent", false);
  const target = tmp("real-install-target-nofloor-");
  try {
    const res = spawnSync("node", [initBin, target, "--lang=en", "--no-doctor"], {
      encoding: "utf-8",
      env: { ...process.env, HOME: home },
    });
    assert.notEqual(res.status, 0, "init must fail (non-zero) when floor templates are unresolvable");
    assert.match(`${res.stdout}\n${res.stderr}`, /harness-floor/i, "error must name harness-floor");
    assert.ok(
      !existsSync(join(target, ".agent-all.json")),
      "must NOT write an empty .agent-all.json when the floor template is missing",
    );
  } finally {
    rmSync(cache, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }
});
