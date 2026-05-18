import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parsePlan,
  parsePlanFile,
} from "../../plugins/harness-floor-cursor/skills/agent-all-cursor/lib/plan-parser.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name) => resolve(here, "..", "fixtures", "cursor-agent-all", name);

test("parses 3-task fixture: ids, titles, files, roles", () => {
  const { tasks, errors } = parsePlanFile(fx("plan-three-tasks.md"));
  assert.equal(tasks.length, 3);
  assert.deepEqual(
    tasks.map((t) => ({ id: t.id, title: t.title, role: t.role, files: t.files })),
    [
      { id: 1, title: "Add CHANGELOG entry", role: "doc-writer", files: ["CHANGELOG.md", "docs/index.md"] },
      { id: 2, title: "Implement loader", role: "backend-dev", files: ["src/loader.ts", "src/index.ts"] },
      { id: 3, title: "Frontend tweak", role: undefined, files: ["src/ui/button.tsx"] },
    ],
  );
  assert.deepEqual(errors, []);
});

test("malformed plan: bad task id surfaces error; tasks still extracted", () => {
  const { tasks, errors } = parsePlanFile(fx("plan-malformed.md"));
  // Task abc is rejected via NaN id but still emitted (per spec — we surface
  // the error so the coordinator can abort, but we don't drop tasks).
  // Task 2 has no files → warning. Task 3 is clean.
  assert.ok(errors.some((e) => /bad task id/i.test(e.message)));
  assert.ok(errors.some((e) => /no Create\/Modify file bullets/.test(e.message)));
  const ok = tasks.find((t) => t.title === "ok");
  assert.ok(ok);
  assert.deepEqual(ok.files, ["src/bar.ts"]);
});

test("empty plan: zero tasks, zero errors", () => {
  const { tasks, errors } = parsePlan("# Empty plan\n\nNothing here.\n");
  assert.equal(tasks.length, 0);
  assert.equal(errors.length, 0);
});

test("role detection requires `role:` on its own line", () => {
  const md = `### Task 1: t\nrole: frontend-dev\n- Create: \`a.ts\`\n`;
  const { tasks } = parsePlan(md);
  assert.equal(tasks[0].role, "frontend-dev");
});

test("Modify/Create are case-insensitive", () => {
  const md = `### Task 1: t\n- create: \`a.ts\`\n- MODIFY: \`b.ts\`\n`;
  const { tasks } = parsePlan(md);
  assert.deepEqual(tasks[0].files, ["a.ts", "b.ts"]);
});
