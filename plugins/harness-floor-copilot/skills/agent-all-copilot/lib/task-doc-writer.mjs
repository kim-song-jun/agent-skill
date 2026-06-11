import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  assertRedactionAllowed,
  redactArtifactContent,
} from "./security/artifact-redactor.mjs";
import { writeRedactionAudit } from "./security/redact-report-writer.mjs";

export function writeTaskDocArtifact({
  path,
  content,
  cwd = process.cwd(),
  config = {},
  runId = "task-doc",
  now = new Date().toISOString(),
} = {}) {
  if (!path) throw new Error("writeTaskDocArtifact requires path");
  const checked = redactArtifactContent({
    artifactPath: path,
    content: String(content ?? ""),
    config,
    now,
  });
  const redactionAudit = writeRedactionAudit({
    cwd,
    runId,
    artifactPath: path,
    findings: checked.findings,
    config,
    now,
  });
  assertRedactionAllowed(checked);

  const outputPath = resolve(cwd, path);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, checked.content, "utf-8");
  return {
    path,
    content: checked.content,
    redactionAudit,
  };
}
