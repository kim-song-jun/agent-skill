#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateVerification } from "../skills/agent-all/lib/policy/verification-validator.mjs";
import { validateReviewerAudit } from "../skills/agent-all/lib/policy/reviewer-audit-validator.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const ADDENDUM = readFileSync(
  resolve(here, "../skills/agent-all/lib/decisions/addendum.md"),
  "utf-8",
);

const REVIEWER_DIRECTIVE = `\n\n---\nAt the END of your review, output one literal line:\n\`VERIFICATION_AUDIT: passed\` if the implementer's report contained a verification log,\n\`VERIFICATION_AUDIT: failed\` if it did not,\n\`VERIFICATION_AUDIT: skipped\` only if verification was not applicable.\n`;

const VERIFICATION_DIRECTIVE = `\n\n---\nBefore reporting \`STATUS: DONE\`, you MUST run the project's tests (via superpowers:verification-before-completion) and include a literal \`verification_passed\` line in your report. Without it, the post-tool-use hook will reject the report and re-dispatch.\n`;

function isImplementerDispatch(params) {
  return typeof params?.description === "string" && /^implement task/i.test(params.description);
}
function isReviewerDispatch(params) {
  return typeof params?.description === "string" && /^review task/i.test(params.description);
}

async function readStdin() {
  return new Promise((res) => {
    let buf = "";
    process.stdin.on("data", (c) => (buf += c));
    process.stdin.on("end", () => res(buf));
  });
}

async function main() {
  const event = process.argv[2];
  const raw = await readStdin();
  const payload = JSON.parse(raw);

  if (payload.tool !== "Task") {
    process.stdout.write(JSON.stringify(payload));
    process.exit(0);
  }

  const params = payload.parameters || {};
  const isImpl = isImplementerDispatch(params);
  const isRev = isReviewerDispatch(params);
  if (!isImpl && !isRev) {
    process.stdout.write(JSON.stringify(payload));
    process.exit(0);
  }

  if (event === "PreToolUse") {
    if (isImpl) {
      params.prompt = `${params.prompt || ""}\n\n${ADDENDUM}${VERIFICATION_DIRECTIVE}`;
    } else if (isRev) {
      params.prompt = `${params.prompt || ""}${REVIEWER_DIRECTIVE}`;
    }
    process.stdout.write(JSON.stringify({ ...payload, parameters: params }));
    process.exit(0);
  }

  if (event === "PostToolUse") {
    const text = payload.result || "";
    if (isImpl) {
      const v = validateVerification(text);
      if (!v.ok) {
        process.stderr.write(v.reason);
        process.exit(2);
      }
    }
    if (isRev) {
      const v = validateReviewerAudit(text);
      if (!v.ok) {
        process.stderr.write(v.reason);
        process.exit(2);
      }
    }
    process.stdout.write(JSON.stringify(payload));
    process.exit(0);
  }

  process.stdout.write(JSON.stringify(payload));
  process.exit(0);
}

main().catch((e) => {
  process.stderr.write(`floor-policy-hook error: ${e.message}`);
  process.exit(1);
});
