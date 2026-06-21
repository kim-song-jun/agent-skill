/**
 * DEFECT E — Per-port install-coverage test (G13 class).
 *
 * For each port (codex, copilot, cursor):
 * 1. Statically extract every relative lib import from that port's phases/*.md.
 * 2. Run the port's init.mjs into a fresh temp dir.
 * 3. Assert every extracted lib path exists in the installed tree.
 * 4. Dynamically import the key entry-point modules (transitive-closure check)
 *    to catch ERR_MODULE_NOT_FOUND on data/, policy/, verification-adapters/* deps.
 *
 * This test FAILED before the E fixes:
 *   - cursor: only 3 files installed, memory-bridge.mjs was missing.
 *   - copilot: NO libs installed at all.
 *
 * After E fixes all three pass.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  readdirSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");

function extractImportSpecs(text) {
  const specs = new Set();
  // static import: import ... from "spec"
  for (const m of text.matchAll(/\bimport\s+[^'"]*from\s+['"]([^'"]+)['"]/g)) {
    specs.add(m[1]);
  }
  // dynamic import: import('spec') or import("spec")
  for (const m of text.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    specs.add(m[1]);
  }
  return [...specs];
}

function isNodeBuiltinOrExternal(spec) {
  if (spec.startsWith("node:")) return true;
  if (spec.startsWith("http://") || spec.startsWith("https://")) return true;
  // bare specifiers (no leading . or /)
  if (!spec.startsWith(".") && !spec.startsWith("/")) return true;
  return false;
}

/**
 * @param {object} portConfig
 * @param {string} portConfig.name
 * @param {string} portConfig.initMjs  - absolute path to the port's bin/init.mjs
 * @param {string} portConfig.phasesDir - absolute path to that port's phases/
 * @param {function(string): string|null} portConfig.resolveInstalledPath
 *   - Maps a lib import spec to the expected installed absolute path.
 *     Returns null to skip a spec (e.g. node:path builtins already filtered,
 *     but leave caller full control for port-specific anchoring).
 * @param {string[]} portConfig.entryPointsRelToInstall
 *   - Sub-paths under the installed lib dir to dynamically import for
 *     transitive-closure check.
 */
async function runPortCoverage(portConfig) {
  const { name, initMjs, phasesDir, resolveInstalledPath, entryPointsRelToInstall } = portConfig;

  // 1. Extract all lib import specs from phase docs
  const phaseFiles = readdirSync(phasesDir).filter((f) => f.endsWith(".md"));
  assert.ok(phaseFiles.length > 0, `${name}: must find phase .md files in ${phasesDir}`);

  const libSpecs = [];
  for (const file of phaseFiles) {
    const text = readFileSync(join(phasesDir, file), "utf-8");
    for (const spec of extractImportSpecs(text)) {
      if (isNodeBuiltinOrExternal(spec)) continue;
      libSpecs.push({ file, spec });
    }
  }

  // 2. Run the installer into a fresh temp dir
  const tmp = mkdtempSync(`/tmp/port-cov-${name}-`);
  try {
    execFileSync("node", [initMjs, tmp, "--force", "--only=agent-all"], {
      stdio: "pipe",
    });

    // 3. Assert every extracted lib path exists after install
    const missing = [];
    for (const { file, spec } of libSpecs) {
      const installedPath = resolveInstalledPath(tmp, spec);
      if (installedPath === null) continue; // skip non-lib specs
      if (!existsSync(installedPath)) {
        missing.push(`${file}: "${spec}" -> expected at ${installedPath}`);
      }
    }
    assert.deepEqual(
      missing,
      [],
      `${name} install-coverage failures (missing files):\n${missing.join("\n")}`,
    );

    // 4. Transitive-closure: dynamically import entry-point modules
    for (const rel of entryPointsRelToInstall) {
      const absPath = join(tmp, rel);
      if (!existsSync(absPath)) {
        assert.fail(`${name}: entry point not installed: ${absPath}`);
      }
      // Dynamic import will throw ERR_MODULE_NOT_FOUND if any transitive dep is missing
      await import(pathToFileURL(absPath).href);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// --- CODEX ---
test("codex agent-all: every phase lib import exists after init.mjs installs", async () => {
  await runPortCoverage({
    name: "codex",
    initMjs: resolve(REPO_ROOT, "plugins/harness-floor-codex/bin/init.mjs"),
    phasesDir: resolve(
      REPO_ROOT,
      "plugins/harness-floor-codex/skills/agent-all-codex/phases",
    ),
    resolveInstalledPath(tmp, spec) {
      // Codex phase docs use ./lib/... (skill-local, resolved by cpSync to .codex/skills/agent-all/lib/)
      // Codex 4-gate.md D-fix uses ./.codex/skills/agent-all/lib/...
      if (spec.startsWith("./.codex/skills/agent-all/lib/")) {
        const rel = spec.slice("./.codex/skills/agent-all/lib/".length);
        return join(tmp, ".codex/skills/agent-all/lib", rel);
      }
      if (spec.startsWith("./lib/")) {
        const rel = spec.slice("./lib/".length);
        return join(tmp, ".codex/skills/agent-all/lib", rel);
      }
      return null; // skip node: builtins + anything else
    },
    entryPointsRelToInstall: [
      ".codex/skills/agent-all/lib/memory-bridge.mjs",
      ".codex/skills/agent-all/lib/memory-agent.mjs",
      ".codex/skills/agent-all/lib/gate-plan.mjs",
      ".codex/skills/agent-all/lib/verification-adapters/adversarial-verifier.mjs",
      ".codex/skills/agent-all/lib/break-resolver.mjs",
    ],
  });
});

// --- COPILOT ---
test("copilot agent-all: every phase lib import exists after init.mjs installs", async () => {
  await runPortCoverage({
    name: "copilot",
    initMjs: resolve(REPO_ROOT, "plugins/harness-floor-copilot/bin/init.mjs"),
    phasesDir: resolve(
      REPO_ROOT,
      "plugins/harness-floor-copilot/skills/agent-all-copilot/phases",
    ),
    resolveInstalledPath(tmp, spec) {
      // Copilot phase docs use ./lib/... (skill-local).
      // Copilot 4-gate.md D-fix uses ./.copilot/agent-all/lib/...
      if (spec.startsWith("./.copilot/agent-all/lib/")) {
        const rel = spec.slice("./.copilot/agent-all/lib/".length);
        return join(tmp, ".copilot/agent-all/lib", rel);
      }
      if (spec.startsWith("./lib/")) {
        const rel = spec.slice("./lib/".length);
        return join(tmp, ".copilot/agent-all/lib", rel);
      }
      return null;
    },
    entryPointsRelToInstall: [
      ".copilot/agent-all/lib/memory-bridge.mjs",
      ".copilot/agent-all/lib/memory-agent.mjs",
      ".copilot/agent-all/lib/gate-plan.mjs",
      ".copilot/agent-all/lib/verification-adapters/adversarial-verifier.mjs",
      ".copilot/agent-all/lib/break-resolver.mjs",
    ],
  });
});

// --- CURSOR ---
test("cursor agent-all: every phase lib import exists after init.mjs installs", async () => {
  await runPortCoverage({
    name: "cursor",
    initMjs: resolve(REPO_ROOT, "plugins/harness-floor-cursor/bin/init.mjs"),
    phasesDir: resolve(
      REPO_ROOT,
      "plugins/harness-floor-cursor/skills/agent-all-cursor/phases",
    ),
    resolveInstalledPath(tmp, spec) {
      // Cursor phase docs use ./.cursor/agent-all/lib/... (repo-root-relative, correct idiom).
      if (spec.startsWith("./.cursor/agent-all/lib/")) {
        const rel = spec.slice("./.cursor/agent-all/lib/".length);
        return join(tmp, ".cursor/agent-all/lib", rel);
      }
      return null; // skip ./lib/ (cursor doesn't use that form) + builtins
    },
    entryPointsRelToInstall: [
      ".cursor/agent-all/lib/memory-bridge.mjs",
      ".cursor/agent-all/lib/memory-agent.mjs",
      ".cursor/agent-all/lib/gate-plan.mjs",
      ".cursor/agent-all/lib/verification-adapters/adversarial-verifier.mjs",
      ".cursor/agent-all/lib/break-resolver.mjs",
    ],
  });
});
