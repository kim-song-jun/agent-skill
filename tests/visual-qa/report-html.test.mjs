import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  renderHtml,
  renderHtmlArtifact,
} from "../../plugins/harness-floor/skills/visual-qa/lib/report-html.mjs";

const sample = {
  slug: "loop-iter-3",
  generatedAt: "2026-05-22T08:35:00Z",
  baseUrl: "http://localhost:3000",
  captures: [
    {
      elementId: "x:abc12345abc12345",
      pageSlug: "dashboard",
      pageUrl: "/dashboard",
      selector: "[data-vqa-id=profile-toggle]",
      action: "click",
      verdict: "pass",
      confidence: "explicit",
      hasBaseline: true,
      screenshots: {
        before: "./captures/dashboard/x_abc/before.png",
        after: "./captures/dashboard/x_abc/after.png",
        baseline: "./captures/dashboard/x_abc/baseline.png",
      },
    },
    {
      elementId: "s:def67890def67890",
      pageSlug: "settings",
      pageUrl: "/settings",
      selector: "button.save",
      action: "click",
      verdict: "warn",
      confidence: "semantic",
      hasBaseline: false,
      screenshots: { before: "./b.png", after: "./a.png" },
      notes: "matched via semantic fingerprint",
    },
    {
      elementId: "p:000",
      pageSlug: "home",
      pageUrl: "/",
      selector: "div.cta",
      action: "click",
      verdict: "fail",
      confidence: "path",
      hasBaseline: false,
      screenshots: { before: "", after: "./a.png" },
    },
  ],
};

test("renderHtml produces a valid doctype document", () => {
  const html = renderHtml(sample);
  assert.ok(html.startsWith("<!doctype html>"));
  assert.match(html, /<title>Visual-QA report — loop-iter-3<\/title>/);
});

test("includes one card per capture", () => {
  const html = renderHtml(sample);
  const cards = html.match(/class="card v-/g) || [];
  assert.equal(cards.length, 3);
});

test("verdict counts in header reflect input", () => {
  const html = renderHtml(sample);
  assert.match(html, /pass: 1/);
  assert.match(html, /warn: 1/);
  assert.match(html, /fail: 1/);
});

test("confidence badge classes are present per tier", () => {
  const html = renderHtml(sample);
  assert.match(html, /c-explicit/);
  assert.match(html, /c-semantic/);
  assert.match(html, /c-path/);
});

test("baseline pair section renders only when hasBaseline=true", () => {
  const html = renderHtml(sample);
  const baselinePairCount = (html.match(/class="pair baseline-pair"/g) || []).length;
  assert.equal(baselinePairCount, 1); // only the first capture has hasBaseline
});

test("notes block appears when capture has notes", () => {
  const html = renderHtml(sample);
  assert.match(html, /matched via semantic fingerprint/);
});

test("missing screenshot renders a fallback div, not a broken img", () => {
  const html = renderHtml(sample);
  assert.match(html, /no screenshot/);
});

test("escapes HTML in user-supplied fields (selectors, notes)", () => {
  const evil = {
    slug: "<svg/onload=alert(1)>",
    generatedAt: "now",
    baseUrl: "http://x",
    captures: [{
      elementId: "x:1234567890abcdef",
      pageSlug: "p", pageUrl: "/", selector: "<button onclick=hack>", action: "click",
      verdict: "pass", confidence: "explicit", hasBaseline: false,
      screenshots: { before: "b", after: "a" },
      notes: "<img src=x onerror=alert(1)>",
    }],
  };
  const html = renderHtml(evil);
  // user-supplied HTML must be entity-encoded
  assert.doesNotMatch(html, /<button onclick=hack>/);
  assert.doesNotMatch(html, /<svg\/onload=/);
  assert.doesNotMatch(html, /<img src=x onerror=/);
  assert.match(html, /&lt;button onclick=hack&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test("self-contained — no external resource references", () => {
  const html = renderHtml(sample);
  assert.doesNotMatch(html, /<link[^>]*href=/i); // no stylesheets
  assert.doesNotMatch(html, /<script[^>]*src=/i); // no external js
});

test("empty captures array renders graceful empty state", () => {
  const html = renderHtml({ slug: "empty", generatedAt: "t", baseUrl: "x", captures: [] });
  assert.match(html, /No captures in this run/);
});

test("redaction masks medium privacy candidates in report HTML", () => {
  const html = renderHtml({
    ...sample,
    captures: [
      {
        ...sample.captures[0],
        notes: "Contact jane.doe@example.com before sharing externally.",
      },
    ],
  });

  assert.match(html, /\[REDACTED:email-address\]/);
  assert.doesNotMatch(html, /jane\.doe@example\.com/);
});

test("renderHtmlArtifact can write sanitized redaction audit metadata", () => {
  const cwd = mkdtempSync(join(tmpdir(), "visual-qa-report-redaction-"));
  try {
    const result = renderHtmlArtifact({
      ...sample,
      captures: [
        {
          ...sample.captures[0],
          notes: "Contact jane.doe@example.com before sharing externally.",
        },
      ],
    }, {
      cwd,
      runId: "vqa-run",
      artifactPath: ".agent-skill/reports/visual-qa/vqa-run/report.html",
      writeAudit: true,
      now: new Date("2026-06-11T00:00:00.000Z"),
    });

    assert.match(result.html, /\[REDACTED:email-address\]/);
    // assert structural shape: writeRedactionAudit must return {path, entry}, not just be truthy
    assert.ok(result.redactionAudit?.path, "redactionAudit.path must be set");
    assert.equal(result.redactionAudit?.entry?.schemaVersion, "agent-redaction-audit/v1");
    assert.equal(result.redactionAudit?.entry?.blocked, false);
    const audit = readFileSync(join(cwd, ".agent-skill/runs/vqa-run/redaction-audit.jsonl"), "utf-8");
    assert.match(audit, /"rule":"email-address"/);
    assert.match(audit, /"action":"mask"/);
    assert.doesNotMatch(audit, /jane\.doe@example\.com/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("redaction blocks high severity secrets in report HTML", () => {
  assert.throws(
    () => renderHtml({
      ...sample,
      captures: [
        {
          ...sample.captures[0],
          notes: "Authorization header: Bearer abcdefghijklmnopqrstuvwxyz123456",
        },
      ],
    }),
    /redaction gate blocked/,
  );
});

test("renderHtmlArtifact records sanitized audit metadata before blocking high severity report HTML", () => {
  const cwd = mkdtempSync(join(tmpdir(), "visual-qa-report-redaction-block-"));
  try {
    assert.throws(
      () => renderHtmlArtifact({
        ...sample,
        captures: [
          {
            ...sample.captures[0],
            notes: "Authorization header: Bearer abcdefghijklmnopqrstuvwxyz123456",
          },
        ],
      }, {
        cwd,
        runId: "vqa-secret",
        artifactPath: ".agent-skill/reports/visual-qa/vqa-secret/report.html",
        writeAudit: true,
        now: new Date("2026-06-11T00:00:00.000Z"),
      }),
      /redaction gate blocked/,
    );
    const audit = readFileSync(join(cwd, ".agent-skill/runs/vqa-secret/redaction-audit.jsonl"), "utf-8");
    assert.match(audit, /"rule":"bearer-token"/);
    assert.match(audit, /"blocked":true/);
    assert.doesNotMatch(audit, /abcdefghijklmnopqrstuvwxyz123456/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
