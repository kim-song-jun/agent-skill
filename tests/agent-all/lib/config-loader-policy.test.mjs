import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../../plugins/harness-floor/skills/agent-all/lib/config-loader.mjs";

test("defaults all policy flags to true when .agent-all.json has no policy key", () => {
  const dir = mkdtempSync(join(tmpdir(), "clp-"));
  const p = join(dir, ".agent-all.json");
  writeFileSync(p, JSON.stringify({ defaults: { maxIter: 5 } }));
  const r = loadConfig(p);
  assert.equal(r.ok, true);
  assert.equal(r.config.policy.decisionSurfacing, true);
  assert.equal(r.config.policy.verification, true);
  assert.equal(r.config.policy.reviewerAudit, true);
});

test("respects explicit policy flags via deep merge", () => {
  const dir = mkdtempSync(join(tmpdir(), "clp-"));
  const p = join(dir, ".agent-all.json");
  writeFileSync(p, JSON.stringify({
    policy: { decisionSurfacing: false, reviewerAudit: false },
  }));
  const r = loadConfig(p);
  assert.equal(r.ok, true);
  assert.equal(r.config.policy.decisionSurfacing, false);
  assert.equal(r.config.policy.verification, true); // default preserved
  assert.equal(r.config.policy.reviewerAudit, false);
});

test("policy defaults present when .agent-all.json is missing entirely", () => {
  const r = loadConfig("/nonexistent/.agent-all.json");
  assert.equal(r.ok, true);
  assert.equal(r.config.policy.decisionSurfacing, true);
  assert.equal(r.config.policy.verification, true);
  assert.equal(r.config.policy.reviewerAudit, true);
});
