import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = () => readFileSync(resolve("plugins/harness-floor/skills/agent-all/phases/2-plan.md"), "utf-8");

test("Phase 2 persists state.wikiPage from the wiki page slug for compaction recovery", () => {
  const body = read();
  assert.match(body, /state\.wikiPage\s*=/, "Phase 2 must persist state.wikiPage");
  assert.match(body, /state\.wikiPage[\s\S]{0,60}\.wiki\/\$\{target\.slug\}\.md/,
    "wikiPage must be derived from the wiki target slug (.wiki/<slug>.md)");
  assert.match(body, /session-resume[\s\S]{0,120}(pointer|wiki)/i,
    "must note the session-resume hook consumes it for the post-compaction directive");
});
