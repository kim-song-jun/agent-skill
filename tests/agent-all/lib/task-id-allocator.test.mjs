import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allocateDisplayId,
  allocateTaskId,
  allocateTaskIdentity,
  displayIdFromFilename,
  generateCanonicalTaskId,
  isCanonicalTaskId,
  taskFilenameForIdentity,
  taskFrontmatter,
} from "../../../plugins/harness-floor/skills/agent-all/lib/task-id-allocator.mjs";

test("allocates next integer from index and filenames", () => {
  const result = allocateTaskId({
    indexText: "- [ ] 7-old: docs/tasks/7-old.md\n- [ ] 12-new: docs/tasks/12-new.md\n",
    filenames: ["001-first.md", "09-nine.md"],
  });
  assert.equal(result, 13);
});

test("rejects explicit collision", () => {
  assert.throws(() => allocateTaskId({ indexText: "", filenames: ["3-x.md"], requestedId: 3 }), /collides/);
});

test("rejects invalid explicit task ids", () => {
  assert.throws(() => allocateTaskId({ requestedId: 0 }), /positive integer/);
  assert.throws(() => allocateTaskId({ requestedId: "4.5" }), /positive integer/);
});

test("generates AS-TASK canonical ids with ULID shape", () => {
  const id = generateCanonicalTaskId({
    now: "2026-06-11T00:00:00.000Z",
    randomBytes: () => Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
  });

  assert.equal(isCanonicalTaskId(id), true);
  assert.match(id, /^AS-TASK-[0-9A-HJKMNP-TV-Z]{26}$/);
});

test("canonical ids do not collide for parallel same-timestamp tasks", () => {
  const now = "2026-06-11T00:00:00.000Z";
  const first = generateCanonicalTaskId({
    now,
    randomBytes: () => Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 1]),
  });
  const second = generateCanonicalTaskId({
    now,
    randomBytes: () => Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 2]),
  });

  assert.notEqual(first, second);
  assert.equal(isCanonicalTaskId(first), true);
  assert.equal(isCanonicalTaskId(second), true);
});

test("allocates display ids from registry, index, and filenames", () => {
  const displayId = allocateDisplayId({
    now: "2026-06-11T00:00:00.000Z",
    registry: { tasks: [{ display_id: "T-20260611-001" }] },
    indexText: "- [Task](.agent-skill/tasks/T-20260611-002-alpha.md)",
    filenames: ["T-20260611-003-beta.md"],
  });

  assert.equal(displayId, "T-20260611-004");
});

test("requested display id collision receives a suffix", () => {
  const displayId = allocateDisplayId({
    requestedDisplayId: "T-20260611-001",
    registry: { tasks: [{ display_id: "T-20260611-001" }, { display_id: "T-20260611-001-2" }] },
  });

  assert.equal(displayId, "T-20260611-001-3");
});

test("allocates full task identity with separated canonical and display ids", () => {
  const identity = allocateTaskIdentity({
    now: "2026-06-11T00:00:00.000Z",
    randomBytes: () => Uint8Array.from([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]),
    slug: "Fix login timeout",
    githubIssue: 18,
  });

  assert.equal(isCanonicalTaskId(identity.id), true);
  assert.equal(identity.display_id, "T-20260611-001");
  assert.equal(identity.github_issue, 18);
  assert.equal(identity.path, ".agent-skill/tasks/T-20260611-001-fix-login-timeout.md");
  assert.equal(displayIdFromFilename(identity.filename), "T-20260611-001");
  assert.equal(taskFilenameForIdentity(identity), "T-20260611-001-fix-login-timeout.md");
});

test("renders task identity frontmatter", () => {
  const identity = {
    id: "AS-TASK-01K7P8J7G00000000000000000",
    display_id: "T-20260611-001",
    github_issue: 18,
    status: "doing",
    artifact_root: ".agent-skill/",
  };

  assert.equal(taskFrontmatter(identity), [
    "---",
    "id: AS-TASK-01K7P8J7G00000000000000000",
    "display_id: T-20260611-001",
    "github_issue: 18",
    "status: doing",
    "artifact_root: .agent-skill/",
    "---",
    "",
  ].join("\n"));
});
