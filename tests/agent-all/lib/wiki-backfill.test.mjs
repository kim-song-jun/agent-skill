import { test } from "node:test";
import assert from "node:assert/strict";
import { planBackfill } from "../../../plugins/harness-floor/skills/wiki/lib/wiki-import.mjs";

const files = [
  "docs/superpowers/specs/2026-06-23-auth-design.md",
  "docs/superpowers/plans/2026-06-20-auth.md",
  "docs/tasks/meeting-0614/notes.md",
  "docs/superpowers/specs/2026-06-10-billing-design.md",
];

test("planBackfill excludes matched globs and collapses to topics", () => {
  const r = planBackfill(files, { exclude: ["**/meeting-*/**"] });
  assert.equal(r.excludedCount, 1, "meeting note excluded");
  assert.deepEqual([...new Set(r.topics)].sort(), ["auth", "billing"], "auth spec+plan collapse to one topic");
  assert.equal(r.ordered.length, 3);
});

test("planBackfill orders oldest-first by date prefix", () => {
  const r = planBackfill(files, { exclude: ["**/meeting-*/**"] });
  const dates = r.ordered.map((x) => x.date);
  assert.deepEqual(dates, [...dates].sort(), "ascending date order");
  assert.equal(r.ordered[0].path, "docs/superpowers/specs/2026-06-10-billing-design.md");
});
