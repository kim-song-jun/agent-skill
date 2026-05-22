#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateVerification } from "../skills/agent-all/lib/policy/verification-validator.mjs";
import { validateReviewerAudit } from "../skills/agent-all/lib/policy/reviewer-audit-validator.mjs";
import { resolveLanguage } from "../skills/agent-all/lib/config-loader.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const ADDENDA = {
  en: readFileSync(resolve(here, "../skills/agent-all/lib/decisions/addendum.md"), "utf-8"),
  ko: readFileSync(resolve(here, "../skills/agent-all/lib/decisions/addendum.ko.md"), "utf-8"),
};

const REVIEWER_DIRECTIVES = {
  en: `\n\n---\nAt the END of your review, output one literal line:\n\`VERIFICATION_AUDIT: passed\` if the implementer's report contained a verification log,\n\`VERIFICATION_AUDIT: failed\` if it did not,\n\`VERIFICATION_AUDIT: skipped\` only if verification was not applicable.\n`,
  ko: `\n\n---\n리뷰 마지막에 다음 중 한 줄을 정확히 출력하세요 (토큰은 머신 파싱이므로 영문 그대로):\n\`VERIFICATION_AUDIT: passed\` — implementer 보고에 verification 로그가 있었음\n\`VERIFICATION_AUDIT: failed\` — 없었음\n\`VERIFICATION_AUDIT: skipped\` — verification 적용 불가\n`,
};

const VERIFICATION_DIRECTIVES = {
  en: `\n\n---\nBefore reporting \`STATUS: DONE\`, you MUST run the project's tests (via superpowers:verification-before-completion) and include a literal \`verification_passed\` line in your report. Without it, the post-tool-use hook will reject the report and re-dispatch.\n`,
  ko: `\n\n---\n\`STATUS: DONE\` 보고 전에 반드시 프로젝트 테스트를 실행하고 (superpowers:verification-before-completion 사용) 보고에 \`verification_passed\` 라인을 정확히 포함시키세요. 없으면 post-tool-use hook이 거부하고 재-dispatch 합니다. (STATUS 및 토큰은 머신 파싱이라 영문 그대로.)\n`,
};

function pickLanguage() {
  if (process.env.AGENT_ALL_LANGUAGE) return process.env.AGENT_ALL_LANGUAGE;
  const cfgPath = join(process.cwd(), ".agent-all.json");
  if (existsSync(cfgPath)) {
    try {
      const cfg = JSON.parse(readFileSync(cfgPath, "utf-8"));
      if (cfg.language) return resolveLanguage(cfg.language);
    } catch { /* fall through */ }
  }
  return resolveLanguage("auto");
}

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
    const lang = pickLanguage();
    const addendum = ADDENDA[lang] || ADDENDA.en;
    const verifDir = VERIFICATION_DIRECTIVES[lang] || VERIFICATION_DIRECTIVES.en;
    const reviewerDir = REVIEWER_DIRECTIVES[lang] || REVIEWER_DIRECTIVES.en;
    if (isImpl) {
      params.prompt = `${params.prompt || ""}\n\n${addendum}${verifDir}`;
    } else if (isRev) {
      params.prompt = `${params.prompt || ""}${reviewerDir}`;
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
