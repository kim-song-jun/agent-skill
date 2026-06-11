#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluatePolicyEvent } from "../skills/agent-all/lib/policy/policy-engine.mjs";
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

const QA_DIRECTIVES = {
  en: `\n\n---\nYou are the **QA team** — your audit is the **user-side** flow, NOT technical correctness. Walk the change through the persona's perspective: are scenarios complete, do edge cases land well, would the user understand what happened?\n\nAt the END of your review, output one literal line:\n\`QA_AUDIT: passed\` if the user-facing flow holds up,\n\`QA_AUDIT: failed\` if it does not,\n\`QA_AUDIT: skipped\` only if no user-visible change exists (e.g. internal refactor).\n\nTech-level verification is a separate Verification-team concern (\`VERIFICATION_AUDIT\`). Do not duplicate it here.\n`,
  ko: `\n\n---\n당신은 **QA 팀**입니다 — audit은 **사용자 측면** 흐름이지 기술적 정확성이 아닙니다. persona의 관점으로 변경을 따라가세요: 시나리오가 완결인가, 엣지 케이스가 잘 처리되는가, 사용자가 무슨 일이 일어났는지 이해할까?\n\n리뷰 마지막에 다음 중 한 줄을 정확히 출력하세요 (토큰은 머신 파싱이므로 영문 그대로):\n\`QA_AUDIT: passed\` — 사용자 측면 흐름 OK\n\`QA_AUDIT: failed\` — 사용자 측면 흐름 깨짐\n\`QA_AUDIT: skipped\` — 사용자에게 보이는 변경 없음 (내부 리팩터 등)\n\n기술 verification은 별도 Verification 팀의 \`VERIFICATION_AUDIT\` 책임 — 여기서 중복하지 마세요.\n`,
};

const COORDINATOR_DIRECTIVES = {
  en: `\n\n---\nYou are the **orchestration gate**. Inspect shared files, HOT-file ownership, retry sequencing, and pathspec commit risk before reviewer dispatch.\n\nAt the END of your review, output one literal line:\n\`ORCHESTRATION_AUDIT: passed\` if ownership and sequencing are safe,\n\`ORCHESTRATION_AUDIT: failed\` if there is a blocking coordination risk,\n\`ORCHESTRATION_AUDIT: skipped\` only if orchestration review is not applicable.\n`,
  ko: `\n\n---\n당신은 **orchestration gate**입니다. reviewer dispatch 전에 shared file, HOT-file ownership, retry sequencing, pathspec commit risk를 점검하세요.\n\n리뷰 마지막에 다음 중 한 줄을 정확히 출력하세요 (토큰은 머신 파싱이므로 영문 그대로):\n\`ORCHESTRATION_AUDIT: passed\` — ownership/sequencing 안전\n\`ORCHESTRATION_AUDIT: failed\` — 차단해야 할 coordination risk 있음\n\`ORCHESTRATION_AUDIT: skipped\` — orchestration review 적용 불가\n`,
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
function isQaReviewerDispatch(params) {
  return typeof params?.description === "string" && /^qa review task/i.test(params.description);
}
function isCoordinatorDispatch(params) {
  return typeof params?.description === "string" && /^orchestration gate task\b/i.test(params.description);
}
function isReviewerDispatch(params) {
  // Technical (spec/quality) reviewer. Exclude QA-prefixed ones so the
  // hook routes them to QA-only handling. Phase 4 may prefix review tasks
  // with persona names such as "Verification" or "Security".
  if (typeof params?.description !== "string") return false;
  if (/^qa review task\b/i.test(params.description)) return false;
  return /^(?:review task|.+\sreview task)\b/i.test(params.description);
}

function projectCwd() {
  return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

function runId() {
  return process.env.AGENT_SKILL_RUN_ID || process.env.AGENT_ALL_RUN_ID || "default";
}

function agentRole(params) {
  if (isImplementerDispatch(params)) return "implementer";
  if (isQaReviewerDispatch(params)) return "qa";
  if (isCoordinatorDispatch(params)) return "coordinator";
  if (isReviewerDispatch(params)) return "reviewer";
  return null;
}

function resultText(payload) {
  const value = payload?.result ?? payload?.tool_response ?? payload?.toolResponse ?? payload?.response ?? "";
  return typeof value === "string" ? value : JSON.stringify(value ?? "");
}

function evaluateTaskPolicy({ event, payload, params }) {
  return evaluatePolicyEvent({
    event,
    platform: "claude",
    runId: runId(),
    phase: event === "BeforeAgentSpawn" ? "dispatch" : "gate",
    toolName: "Task",
    taskId: params?.taskId,
    displayId: params?.description,
    agent: {
      role: agentRole(params),
      reason: params?.description || params?.prompt || "Task dispatch",
      // Claude's Task API does not expose an up-front dollar estimate. Zero is
      // the explicit "no known additional budget declared by hook" sentinel.
      budgetImpactUSD: 0,
    },
    payload: {
      description: params?.description,
      resultText: resultText(payload),
      waveSpawnCount: payload?.waveSpawnCount,
    },
  }, {
    cwd: projectCwd(),
    writeAudit: process.env.AGENT_POLICY_AUDIT !== "0",
  });
}

function firstBlockingReason(policyVerdict) {
  return policyVerdict.results.find((result) => (
    result.action === "deny"
      || result.action === "stop_loop"
      || result.action === "requires_justification"
      || result.action === "ask_user"
  ))?.reason;
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
  const isQa = isQaReviewerDispatch(params);
  const isCoord = isCoordinatorDispatch(params);
  if (!isImpl && !isRev && !isQa && !isCoord) {
    process.stdout.write(JSON.stringify(payload));
    process.exit(0);
  }

  if (event === "PreToolUse") {
    const policyVerdict = evaluateTaskPolicy({ event: "BeforeAgentSpawn", payload, params });
    if (!policyVerdict.ok) {
      process.stderr.write(firstBlockingReason(policyVerdict) || "policy denied Task dispatch");
      process.exit(2);
    }
    const lang = pickLanguage();
    const addendum = ADDENDA[lang] || ADDENDA.en;
    const verifDir = VERIFICATION_DIRECTIVES[lang] || VERIFICATION_DIRECTIVES.en;
    const reviewerDir = REVIEWER_DIRECTIVES[lang] || REVIEWER_DIRECTIVES.en;
    const qaDir = QA_DIRECTIVES[lang] || QA_DIRECTIVES.en;
    const coordinatorDir = COORDINATOR_DIRECTIVES[lang] || COORDINATOR_DIRECTIVES.en;
    if (isImpl) {
      params.prompt = `${params.prompt || ""}\n\n${addendum}${verifDir}`;
    } else if (isCoord) {
      params.prompt = `${params.prompt || ""}${coordinatorDir}`;
    } else if (isQa) {
      // QA reviewer: user-side audit only; verification is a separate role.
      params.prompt = `${params.prompt || ""}${qaDir}`;
    } else if (isRev) {
      params.prompt = `${params.prompt || ""}${reviewerDir}`;
    }
    process.stdout.write(JSON.stringify({ ...payload, parameters: params }));
    process.exit(0);
  }

  if (event === "PostToolUse") {
    const policyVerdict = evaluateTaskPolicy({ event: "AfterAgentReturn", payload, params });
    if (!policyVerdict.ok) {
      process.stderr.write(firstBlockingReason(policyVerdict) || "policy denied Task result");
      process.exit(2);
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
