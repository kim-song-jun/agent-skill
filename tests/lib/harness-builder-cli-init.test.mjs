// Integration tests for the shell-callable installers shipped under
//   plugins/harness-builder-{codex,copilot,gemini}/bin/init.mjs
//
// Each plugin's installer mirrors the harness-builder-cursor pattern but
// writes platform-specific paths and emits per-user config snippets
// (config.toml / mcp-config.json / settings.json) to stdout for manual
// merging.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO = resolve(".");

const PLUGINS = {
  codex: {
    bin:   resolve(REPO, "plugins/harness-builder-codex/bin/init.mjs"),
    files: [
      "AGENTS.md",
      ".codex/skills/planner/SKILL.md",
      ".codex/skills/dev/SKILL.md",
      ".codex/skills/reviewer/SKILL.md",
    ],
    stdoutContains: /\[hooks\]/,            // TOML snippet for ~/.codex/config.toml
    stdoutHeader:   /codex-config\.toml/,
    purposeFile:    "AGENTS.md",
  },
  copilot: {
    bin:   resolve(REPO, "plugins/harness-builder-copilot/bin/init.mjs"),
    files: [
      "AGENTS.md",
      ".github/copilot-instructions.md",
      ".github/instructions/planner.instructions.md",
      ".github/instructions/dev.instructions.md",
      ".github/instructions/reviewer.instructions.md",
      ".github/hooks/preToolUse.json",
      ".github/hooks/postToolUse.json",
      ".github/hooks/agentStop.json",
    ],
    stdoutContains: /"mcpServers"/,         // JSON snippet for ~/.copilot/mcp-config.json
    stdoutHeader:   /mcp-config\.json/,
    purposeFile:    ".github/copilot-instructions.md",
  },
  gemini: {
    bin:   resolve(REPO, "plugins/harness-builder-gemini/bin/init.mjs"),
    files: [
      "GEMINI.md",
      ".gemini/skills/planner/SKILL.md",
      ".gemini/skills/dev/SKILL.md",
      ".gemini/skills/reviewer/SKILL.md",
    ],
    stdoutContains: /"mcpServers"/,         // JSON snippet for ~/.gemini/settings.json
    stdoutHeader:   /gemini-settings\.json/,
    purposeFile:    "GEMINI.md",
  },
};

function runInit(binPath, args, opts = {}) {
  return spawnSync("node", [binPath, ...args], {
    encoding: "utf-8",
    env: { ...process.env, ...(opts.env ?? {}) },
  });
}

function mkTarget(slug) {
  return mkdtempSync(join(tmpdir(), `hb-${slug}-init-`));
}

for (const [name, spec] of Object.entries(PLUGINS)) {
  test(`harness-builder-${name}: usage error when target missing`, () => {
    const res = runInit(spec.bin, []);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Usage:/);
  });

  test(`harness-builder-${name}: errors on non-existent target dir`, () => {
    const missing = join(tmpdir(), `hb-${name}-does-not-exist-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const res = runInit(spec.bin, [missing]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /does not exist/);
  });

  test(`harness-builder-${name}: writes all expected files and prints config snippet`, () => {
    const target = mkTarget(name);
    try {
      const res = runInit(spec.bin, [target]);
      assert.equal(res.status, 0, res.stderr);
      for (const rel of spec.files) {
        assert.ok(
          existsSync(resolve(target, rel)),
          `missing ${rel}\nstdout:\n${res.stdout}\nstderr:\n${res.stderr}`,
        );
      }
      // Stdout MUST carry the platform-specific config snippet header + body.
      assert.match(res.stdout, spec.stdoutHeader);
      assert.match(res.stdout, spec.stdoutContains);
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  test(`harness-builder-${name}: --ctx flag overrides defaults`, () => {
    const target = mkTarget(name);
    try {
      const ctxPath = join(target, "_ctx.json");
      const purpose = `CTX_PURPOSE_${name.toUpperCase()}_${Date.now()}`;
      writeFileSync(ctxPath, JSON.stringify({
        purpose,
        size: "small",
        qa_personas: ["auth"],
        deploy_targets: "fly.io",
        constraints: "GDPR",
      }));
      const res = runInit(spec.bin, [target, "--ctx", ctxPath]);
      assert.equal(res.status, 0, res.stderr);
      const body = readFileSync(resolve(target, spec.purposeFile), "utf-8");
      assert.ok(
        body.includes(purpose),
        `expected purpose '${purpose}' in ${spec.purposeFile}:\n${body}`,
      );
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  test(`harness-builder-${name}: refuses overwrite without --force; succeeds with --force`, () => {
    const target = mkTarget(name);
    try {
      let res = runInit(spec.bin, [target]);
      assert.equal(res.status, 0, res.stderr);

      // Second run without --force must bail with exit 2.
      res = runInit(spec.bin, [target]);
      assert.equal(res.status, 2);
      assert.match(res.stderr, /Refusing to overwrite/);

      // With --force, succeeds again.
      res = runInit(spec.bin, [target, "--force"]);
      assert.equal(res.status, 0, res.stderr);
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  test(`harness-builder-${name}: env PURPOSE flows into the rendered memory file`, () => {
    const target = mkTarget(name);
    try {
      const purpose = `ENV_PURPOSE_${name.toUpperCase()}_${Date.now()}`;
      const res = runInit(spec.bin, [target], { env: { PURPOSE: purpose } });
      assert.equal(res.status, 0, res.stderr);
      const body = readFileSync(resolve(target, spec.purposeFile), "utf-8");
      assert.ok(
        body.includes(purpose),
        `expected env PURPOSE '${purpose}' in ${spec.purposeFile}:\n${body}`,
      );
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });
}
