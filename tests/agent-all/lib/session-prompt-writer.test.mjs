import { test } from "node:test";
import assert from "node:assert/strict";
import {
  renderSessionPrompt,
} from "../../../plugins/harness-floor/skills/agent-all/lib/session-prompt-writer.mjs";

test("renders resumable session prompt with metadata and dangerous-command approvals", () => {
  const out = renderSessionPrompt({
    title: "Fix flaky login",
    taskPath: "docs/tasks/12-fix-flaky-login.md",
    goal: "Stabilize login test.",
    currentStatus: "Implementation paused after verification failed.",
    validation: "npm test failed once",
    gitState: "main; 2 changed files",
    nextActions: [
      {
        id: "resume-agent-all",
        label: "Resume /agent-all",
        command: "/agent-all docs/tasks/12-fix-flaky-login.md --resume",
        reason: "continue safely",
        recommended: true,
      },
    ],
    selectedNextAction: {
      id: "resume-agent-all",
      label: "Resume /agent-all",
      command: "/agent-all docs/tasks/12-fix-flaky-login.md --resume",
    },
    metadata: { schema: "agent-skill/session-prompt@1" },
  });

  assert.match(out, /agent-session-metadata/);
  assert.match(out, /"schema": "agent-skill\/session-prompt@1"/);
  assert.match(out, /Recommended: Resume \/agent-all/);
  assert.match(out, /Non-TTY Selection/);
  assert.match(out, /User approval required \/ 사용자 승인 필요: git reset/);
  assert.match(out, /docker volume rm/);
  // Assert the rendered output includes --apply, not just the raw constant (behavior, not self-referential array check)
  assert.match(out, /--apply/);
});
