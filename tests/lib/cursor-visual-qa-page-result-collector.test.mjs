import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  awaitAllPages,
  readPageResult,
} from "../../plugins/harness-floor-cursor/skills/visual-qa-cursor/lib/page-result-collector.mjs";

function mktemp() {
  return mkdtempSync(join(tmpdir(), "cursor-vqa-collector-"));
}

function plantResult(slugDir, page, payload) {
  const dir = resolve(slugDir, page);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, "_result.json"), JSON.stringify(payload));
}

test("readPageResult: missing → {ok:false, missing:true}", () => {
  const dir = mktemp();
  try {
    const r = readPageResult(dir, "home");
    assert.equal(r.ok, false);
    assert.equal(r.missing, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("readPageResult: present → ok with parsed payload", () => {
  const dir = mktemp();
  try {
    plantResult(dir, "home", { page: "home", status: "completed" });
    const r = readPageResult(dir, "home");
    assert.equal(r.ok, true);
    assert.deepEqual(r.result, { page: "home", status: "completed" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("awaitAllPages: pre-populated results settle immediately", async () => {
  const dir = mktemp();
  try {
    plantResult(dir, "home", { page: "home", status: "completed" });
    plantResult(dir, "about", { page: "about", status: "incomplete" });
    const { settled, pending } = await awaitAllPages({
      slugDir: dir,
      pageNames: ["home", "about"],
      timeoutMs: 1000,
      intervalMs: 50,
    });
    assert.equal(pending.length, 0);
    assert.equal(settled.length, 2);
    assert.ok(settled.some((s) => s.page === "home" && s.result.status === "completed"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("awaitAllPages: timeout returns pending list", async () => {
  const dir = mktemp();
  try {
    plantResult(dir, "home", { page: "home", status: "completed" });
    // 'about' never lands.
    const { settled, pending } = await awaitAllPages({
      slugDir: dir,
      pageNames: ["home", "about"],
      timeoutMs: 150,
      intervalMs: 50,
    });
    assert.deepEqual(pending, ["about"]);
    assert.equal(settled.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("awaitAllPages: late-arriving result before timeout settles correctly", async () => {
  const dir = mktemp();
  try {
    setTimeout(() => plantResult(dir, "settings", { page: "settings", status: "completed" }), 100);
    const { settled, pending } = await awaitAllPages({
      slugDir: dir,
      pageNames: ["settings"],
      timeoutMs: 1000,
      intervalMs: 50,
    });
    assert.equal(pending.length, 0);
    assert.equal(settled[0].page, "settings");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("awaitAllPages: rejects bad input shape", async () => {
  await assert.rejects(awaitAllPages({ slugDir: "/tmp", pageNames: "not-array" }), /pageNames/);
  await assert.rejects(awaitAllPages({ pageNames: [] }), /slugDir/);
});
