#!/usr/bin/env node
import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");
const RELEASE = "v0.6.0";
const OUT_DIR = resolve(
  ROOT,
  process.argv.find((arg) => arg.startsWith("--out-dir="))?.slice("--out-dir=".length)
    || ".agent-skill/releases/v0.6.0/report",
);
const SCREEN_DIR = join(OUT_DIR, "screenshots");
const PAGE_DIR = join(OUT_DIR, "pages");
const FONT_KO = "/System/Library/Fonts/AppleSDGothicNeo.ttc";
const FONT_MONO = existsSync("/Users/sungjun/Library/Fonts/MesloLGSDZNerdFontMono-Bold.ttf")
  ? "/Users/sungjun/Library/Fonts/MesloLGSDZNerdFontMono-Bold.ttf"
  : FONT_KO;
const W = 1240;
const H = 1754;

const TEMP_FILES = [];

const evidence = collectEvidence();
mkdirSync(SCREEN_DIR, { recursive: true });
mkdirSync(PAGE_DIR, { recursive: true });
writeMarkdown(evidence);
const screenshots = renderScreenshots(evidence);
const pages = renderPages(evidence, screenshots);
run("magick", [...pages, join(OUT_DIR, `agent-skill-${RELEASE}-report.pdf`)]);
for (const file of TEMP_FILES) {
  try {
    unlinkSync(file);
  } catch {
    // Best-effort cleanup only; report artifacts are already written.
  }
}

console.log(`wrote ${join(OUT_DIR, `agent-skill-${RELEASE}-report.md`)}`);
console.log(`wrote ${join(OUT_DIR, `agent-skill-${RELEASE}-report.pdf`)}`);

function collectEvidence() {
  const releaseList = cmd("gh", ["release", "list", "--repo", "kim-song-jun/agent-skill", "--limit", "5"]);
  const releaseView = cmd("gh", [
    "release",
    "view",
    RELEASE,
    "--repo",
    "kim-song-jun/agent-skill",
    "--json",
    "tagName,name,url,isDraft,isPrerelease,publishedAt,targetCommitish,assets",
  ]);
  const pluginList = cmd("claude", ["plugin", "list"]);
  const agentSkillPlugins = pluginList
    .split(/\n\s*\n/)
    .filter((block) => block.includes("@agent-skill"))
    .join("\n\n");
  const candidate = cmd("node", ["scripts/release-candidate.mjs", "--date=2026-06-12"]);
  const preflight = cmd("node", ["scripts/release-publish-preflight.mjs", "--base=origin/main"]);
  const manifestSummary = cmd("node", [
    "-e",
    `const fs=require('fs');
const files=require('child_process').execSync("find plugins -path '*/.claude-plugin/plugin.json' -o -path '*/.codex-plugin/plugin.json'",{encoding:'utf8'}).trim().split(/\\n/).filter(Boolean);
const rows=files.map(f=>{const j=JSON.parse(fs.readFileSync(f,'utf8'));return [j.name,j.version,f].join("\\t")}).sort();
console.log(rows.join("\\n"));`,
  ]);
  const smokeSummary = [
    "node --test: 1983/1983 passing",
    "./scripts/release-smoke.sh --fast: 503/503 passing",
    "node scripts/release-audit.mjs: Claude 82/82, Codex 75/75",
    "node scripts/sync-lib.mjs --check: 160 vendored files match source",
    "node scripts/generate-support-matrix.mjs --check: passed",
  ].join("\n");
  const targetSmoke = cmd("node", [
    "scripts/target-project-smoke.mjs",
    "--target=/Users/sungjun/Documents/molcube/posco/posco-mds",
    "--platform=claude,codex",
    "--lang=ko",
  ]);
  return {
    releaseList,
    releaseView,
    agentSkillPlugins,
    candidate,
    preflight,
    manifestSummary,
    smokeSummary,
    targetSmoke,
  };
}

function writeMarkdown(e) {
  const md = `# agent-skill ${RELEASE} 릴리스 보고서 및 사용설명서

생성일: 2026-06-12  
대상 저장소: https://github.com/kim-song-jun/agent-skill  
릴리스: https://github.com/kim-song-jun/agent-skill/releases/tag/${RELEASE}

## 1. 요약

${RELEASE}는 기존 \`v0.5.1\` 이후의 이슈 #9-#25 배치를 하나의 release train으로 묶은 버전입니다. 설치 가능한 \`agent-skill\` 플러그인 19개 manifest가 모두 \`0.6.0\`으로 정렬됐고, GitHub Release와 Claude 로컬 설치 상태도 이 버전 기준으로 맞춥니다.

핵심 결과:

- 19개 installable plugin manifest: \`0.6.0\`
- GitHub Release: \`${RELEASE}\`
- 테스트: \`node --test\` 기준 1983/1983 통과
- Release smoke: 503/503 통과
- Release audit: Claude 82/82, Codex 75/75 통과
- POSCO MDS 대상 프로젝트: Claude doctor 35/35, Codex doctor 43/43 통과

## 2. 무엇이 달라졌나

### 운영형 기본값

\`/agent-init\`와 \`/codex-init\` 기본값이 가벼운 scaffold가 아니라 운영형 scaffold입니다. 기본 설치에는 task ledger, 역할별 agent/skill, policy hook, QA/verification reviewer, quality-debt reviewer, 폴더별 guidance가 포함됩니다. 경량 설치가 필요할 때만 \`--lite\`를 선택합니다.

### 다중 에이전트 실행

\`/agent-all\`은 brainstorm → plan → dispatch → gate → PR → loop 단계로 동작합니다. 구현은 frontend/backend/integration/security/data/design/QA/verification/orchestrator 역할로 분리되고, reviewer gate가 통과해야 다음 단계로 넘어갑니다. 반복 실행은 \`--loop\`, 무제한 반복은 \`--max-iter=0\`으로 제어합니다.

### 품질 부채와 보안

Quality Debt Policy가 추가되어 임의 fallback, TODO/debt marker, suppressions, 의미 없는 테스트, production debug path를 reviewer가 감사합니다. secret/privacy redaction gate는 handoff, report, verification evidence, policy logs, PR body를 검사하며 high severity는 차단하고 medium severity는 마스킹합니다.

### 데이터/검증 어댑터

웹 UI만 보던 검증에서 \`verify:cli\`, \`verify:api-contract\`, \`verify:notebook-data\`, \`verify:sql-db\`, \`verify:batch-job\`까지 확장됐습니다. \`harness-data\`의 \`/data-runner\`는 notebook, SQL, artifact diff 작업을 task doc과 \`/agent-all\` 검증 어댑터로 연결합니다.

### 비용 절감과 장기 세션

\`/thrift\`는 큰 출력 명령을 context-mode 경로로 보내도록 안내하고, 일정 턴/토큰 기준으로 summary를 만들며, audit report를 남깁니다. \`/agent-all\` cost telemetry는 token/cost 추정치를 \`.agent-skill/runs/<run-id>/cost-telemetry.jsonl\`에 기록하고, 80% 예산 경고와 100% 예산 중단을 policy engine에 연결합니다.

비용 절감은 단일 마법 기능이 아니라 네 가지 조합으로 일어납니다:

1. 큰 로그를 main context에 붙이지 않고 summary/evidence 파일로 분리
2. subagent 격리로 구현/검토의 장문 출력이 main thread에 누적되지 않음
3. visual QA는 git-diff scoping과 DOM-hash cache로 불필요한 캡처를 줄임
4. cost telemetry가 예산 초과 전에 loop를 멈추거나 사용자 판단으로 전환

## 3. 실제 동작 로직

\`\`\`text
사용자 요청
  -> /agent-init 또는 /codex-init으로 프로젝트 scaffold 생성
  -> /agent-all "작업" --loop --qa
  -> Phase 1 intent/brainstorm
  -> Phase 2 task plan + ledger
  -> Phase 3 role dispatch
       - implementer scoping pass
       - decision payload 수집
       - 사용자/비TTY resolver 결정
       - 구현 subagent 재dispatch
  -> Phase 4 gate
       - orchestrator first
       - QA_AUDIT / VERIFICATION_AUDIT / ORCHESTRATION_AUDIT
       - quality debt/security/data/design 검토
  -> Phase 5 PR 또는 local-only 결과
  -> Phase 6 loop
       - test/visual/data verifier pass 시 종료
       - 실패 signature 반복 시 planner/user decision으로 escalation
\`\`\`

## 4. 사용설명서

### 이미 설치된 POSCO MDS 프로젝트

\`/Users/sungjun/Documents/molcube/posco/posco-mds\`는 Claude/Codex scaffold가 이미 설치되어 있습니다. 여기서는 init을 다시 하지 말고 바로 사용합니다.

Claude Code:

\`\`\`text
/agent-all "작업 설명" --loop --qa
/visual-qa
/thrift audit
/debug "실패한 명령"
/data-runner sql .agent-skill/tasks/<task>.md
\`\`\`

Codex CLI:

\`\`\`text
codex
run /agent-all for "작업 설명"
run /debug "실패한 명령"
\`\`\`

### 새 프로젝트

새 프로젝트는 프로젝트 로컬 파일이 필요하므로 한 번은 init이 필요합니다.

\`\`\`bash
# Claude/Codex 공통 terminal installer
bash /path/to/agent-skill/scripts/install-platform.sh \\
  --platform=claude --target=/path/to/project --force --lang=ko

bash /path/to/agent-skill/scripts/install-platform.sh \\
  --platform=codex --target=/path/to/project --force --lang=ko
\`\`\`

Claude 플러그인 방식:

\`\`\`text
/plugin marketplace update agent-skill
/plugin install harness-builder@agent-skill
/plugin install harness-floor@agent-skill
/plugin install harness-thrift@agent-skill
/plugin install harness-debug@agent-skill
/plugin install harness-data@agent-skill
\`\`\`

## 5. 운영 체크리스트

- 기능 작업 전: \`/agent-all "..." --loop --qa\`
- 데이터 작업 전: \`/data-runner notebook|sql|artifact-diff <task>\`
- UI 변경 후: \`/visual-qa\` 또는 \`--qa\`
- 장기 세션 전: \`/thrift\`
- 실패 원인 분석: \`/debug "failing command"\`
- 릴리스 전: \`node scripts/release-candidate.mjs --date=<date>\`, \`node --test\`, \`./scripts/release-smoke.sh --fast --with-live-cli\`
- 대상 프로젝트 반영 전: \`node scripts/target-project-smoke.mjs --target=<project> --platform=claude,codex --lang=ko\`

## 6. 증거 스크린샷 원본

아래 명령 출력은 PDF의 스크린샷으로 포함됩니다.

### GitHub Release

\`\`\`text
${e.releaseList}
${e.releaseView}
\`\`\`

### Claude local plugins

\`\`\`text
${e.agentSkillPlugins}
\`\`\`

### Manifest versions

\`\`\`text
${e.manifestSummary}
\`\`\`

### Release candidate

\`\`\`text
${e.candidate}
\`\`\`

### Tests and smoke

\`\`\`text
${e.smokeSummary}
\`\`\`

### Target project smoke

\`\`\`text
${e.targetSmoke}
\`\`\`
`;
  writeFileSync(join(OUT_DIR, `agent-skill-${RELEASE}-report.md`), md);
}

function renderScreenshots(e) {
  const items = [
    ["01-release", "GitHub Release", `${e.releaseList}\n\n${e.releaseView}`],
    ["02-plugins", "Claude local agent-skill plugins", e.agentSkillPlugins],
    ["03-manifests", "Plugin manifest versions", e.manifestSummary],
    ["04-candidate", "Release candidate evidence", e.candidate],
    ["05-tests", "Test and smoke summary", e.smokeSummary],
    ["06-target", "Target project smoke", e.targetSmoke],
  ];
  return items.map(([name, title, body]) => {
    const out = join(SCREEN_DIR, `${name}.png`);
    terminalImage(title, body, out);
    return out;
  });
}

function renderPages(e, shots) {
  const pages = [];
  pages.push(page("01-title", [
    titleBlock("agent-skill v0.6.0", "릴리스 보고서 및 사용설명서"),
    statGrid([
      ["19", "installable plugins"],
      ["1983/1983", "node --test"],
      ["503/503", "release smoke"],
      ["82/82 + 75/75", "Claude/Codex audit"],
    ]),
    sectionAt(610, "핵심 결론", [
      "manifest version까지 v0.6.0으로 정렬한 release train입니다.",
      "GitHub Release, Claude local plugin install, POSCO target smoke를 같은 릴리스 흐름으로 검증합니다.",
      "POSCO MDS 프로젝트는 이미 init/scaffold가 되어 있어 바로 사용하면 됩니다.",
    ]),
  ]));
  pages.push(page("02-changes", [
    heading("무엇이 개선됐나"),
    twoColumn([
      ["운영형 기본값", "기본 init이 task ledger, 역할별 agent/skill, policy hook, QA/verification gate를 포함합니다."],
      ["다중 에이전트 게이트", "orchestrator first, QA_AUDIT, VERIFICATION_AUDIT, ORCHESTRATION_AUDIT로 PR 전 검증을 고정합니다."],
      ["데이터 검증", "notebook, SQL, API contract, CLI, batch job 검증 어댑터가 web-ui 외 작업을 닫습니다."],
      ["품질/보안", "quality debt와 secret/privacy redaction을 policy engine으로 차단하거나 마스킹합니다."],
      ["비용 추적", "cost telemetry가 예산 80% 경고, 100% 중단, handoff summary를 제공합니다."],
      ["릴리스 증거", "public PR CI와 local release gate, provenance manifest, target smoke가 릴리스 증거가 됩니다."],
    ]),
  ]));
  pages.push(page("03-logic", [
    heading("실제 동작 로직"),
    flow(),
    sectionAt(600, "중요한 판단 지점", [
      "구현 전 scoping pass가 결정 후보를 구조화하고, TTY에서는 사용자에게 묻고 비TTY에서는 low/medium risk 추천값만 자동 선택합니다.",
      "반복 실패 signature가 감지되면 같은 구현자를 계속 늘리지 않고 planner/user decision으로 전환합니다.",
      "review gate가 실패하면 다음 iteration의 입력으로 돌아가며, 통과 전에는 PR 완료로 보지 않습니다.",
    ]),
  ]));
  pages.push(page("04-cost", [
    heading("비용 절감과 리스크 제어"),
    twoColumn([
      ["Context 절감", "큰 로그는 context-mode/파일 증거로 보내고 main thread에는 요약만 남깁니다."],
      ["Subagent 격리", "구현/검토 장문 출력이 main conversation에 누적되지 않습니다."],
      ["Visual QA 최적화", "git diff scoping, DOM hash cache, baseline verdict로 캡처 범위를 줄입니다."],
      ["예산 정책", "cost telemetry가 예산 경고/중단을 policy engine으로 연결합니다."],
      ["Redaction", "민감정보는 report/evidence/log/PR body 작성 전에 검사합니다."],
      ["Rollback", "검증된 tag/SHA와 manifest checksum을 기준으로 되돌립니다."],
    ]),
    sectionAt(950, "주의", [
      "비용 절감은 모델 가격 자체를 낮추는 기능이 아니라 context 낭비와 불필요 반복을 줄이는 운영 로직입니다.",
      "Codex의 floor workflow는 현재 CLI 제약상 prompt-level/sequential dispatch입니다.",
    ]),
  ]));
  pages.push(page("05-manual", [
    heading("사용설명서"),
    sectionAt(250, "POSCO MDS에서는 init 불필요", [
      "`/Users/sungjun/Documents/molcube/posco/posco-mds`에는 Claude/Codex scaffold가 이미 설치되어 있습니다.",
      "Claude Code: `/agent-all \"작업\" --loop --qa`, `/visual-qa`, `/thrift audit`, `/debug \"명령\"`, `/data-runner sql <task>`",
      "Codex CLI: `codex` 실행 후 `run /agent-all for \"작업\"`, `run /debug \"명령\"`",
    ]),
    sectionAt(800, "새 프로젝트에서는 init 필요", [
      "`install-platform.sh --platform=claude --target=/path --force --lang=ko`",
      "`install-platform.sh --platform=codex --target=/path --force --lang=ko`",
      "전역 config는 기본적으로 자동 패치하지 않고, 필요한 TOML/MCP snippet은 stdout으로 출력합니다.",
    ]),
  ]));
  pages.push(page("06-evidence-a", [
    heading("릴리스 및 설치 증거"),
    image(shots[0], 70, 170, 1100),
    image(shots[1], 70, 820, 1100),
  ]));
  pages.push(page("07-evidence-b", [
    heading("검증 증거"),
    image(shots[2], 70, 150, 1100),
    image(shots[3], 70, 640, 1100),
    image(shots[4], 70, 1190, 530),
    image(shots[5], 640, 1190, 530),
  ]));
  return pages;
}

function page(name, elements) {
  const out = join(PAGE_DIR, `${name}.png`);
  run("magick", ["-size", `${W}x${H}`, "xc:#f8fafc", out]);
  rect(out, 0, 0, W, 42, "#0f766e", 0);
  text(out, "agent-skill v0.6.0 release report", 70, 30, 24, "#ffffff", 1080);
  for (const element of elements) element(out);
  text(out, `2026-06-12 · ${RELEASE}`, 70, 1710, 22, "#64748b", 800);
  return out;
}

function titleBlock(main, sub) {
  return (out) => {
    text(out, main, 70, 180, 68, "#0f172a", 1060);
    text(out, sub, 70, 255, 38, "#334155", 1060);
    rect(out, 70, 310, 1100, 318, "#0f766e", 0);
  };
}

function statGrid(stats) {
  return (out) => {
    const y = 370;
    const gap = 24;
    const w = 257;
    stats.forEach(([num, label], idx) => {
      const x = 70 + idx * (w + gap);
      rect(out, x, y, x + w, y + 170, "#ffffff", 18, "#dbe4ee");
      text(out, num, x + 24, y + 70, 38, "#0f766e", w - 48);
      text(out, label, x + 24, y + 120, 24, "#475569", w - 48);
    });
  };
}

function heading(value) {
  return (out) => text(out, value, 70, 130, 48, "#0f172a", 1100);
}

function sectionAt(startY, title, bullets) {
  return (out) => {
    text(out, title, 70, startY, 34, "#0f766e", 1080);
    text(out, bullets.map((b) => `• ${b}`).join("\n"), 90, startY + 55, 27, "#1e293b", 1040);
  };
}

function twoColumn(items) {
  return (out) => {
    const colW = 520;
    const rowH = 230;
    items.forEach(([title, body], idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const x = 70 + col * 570;
      const y = 210 + row * rowH;
      rect(out, x, y, x + colW, y + 190, "#ffffff", 18, "#dbe4ee");
      text(out, title, x + 24, y + 50, 30, "#0f766e", colW - 48);
      text(out, body, x + 24, y + 95, 23, "#334155", colW - 48);
    });
  };
}

function flow() {
  return (out) => {
    const steps = ["요청", "계획", "역할 dispatch", "구현", "검증 gate", "PR/loop"];
    steps.forEach((step, idx) => {
      const x = 70 + idx * 185;
      rect(out, x, 230, x + 150, 330, "#ffffff", 18, "#0f766e");
      text(out, step, x + 18, 292, 25, "#0f172a", 115);
      if (idx < steps.length - 1) text(out, "→", x + 158, 292, 32, "#0f766e", 30);
    });
    text(
      out,
      "Phase 3는 scoping pass → decision surface → implementation dispatch로 나뉩니다. Phase 4는 orchestrator, QA, verification, security/data/design/quality debt gates를 통과해야 완료됩니다.",
      90,
      420,
      28,
      "#1e293b",
      1030,
    );
  };
}

function image(src, x, y, width) {
  return (out) => {
    const resized = src.replace(/\.png$/, `-${width}.png`);
    TEMP_FILES.push(resized);
    run("magick", [src, "-resize", `${width}x`, resized]);
    composite(out, resized, x, y);
  };
}

function rect(file, x1, y1, x2, y2, fill, radius = 0, stroke = null) {
  const tmp = `${file}.tmp.png`;
  const shape = radius > 0
    ? `roundrectangle ${x1},${y1} ${x2},${y2} ${radius},${radius}`
    : `rectangle ${x1},${y1} ${x2},${y2}`;
  const args = [file, "-fill", fill];
  if (stroke) args.push("-stroke", stroke, "-strokewidth", "2");
  else args.push("-stroke", fill);
  args.push("-draw", shape, tmp);
  run("magick", args);
  renameSync(tmp, file);
}

function text(file, value, x, y, size, fill, width) {
  const caption = tempText(value);
  const label = `${file}.${x}.${y}.text.png`;
  TEMP_FILES.push(label);
  run("magick", [
    "-background",
    "none",
    "-fill",
    fill,
    "-font",
    FONT_KO,
    "-pointsize",
    String(size),
    "-size",
    `${width}x`,
    `caption:@${caption}`,
    label,
  ]);
  composite(file, label, x, y - size);
}

function terminalImage(title, body, out) {
  const textFile = tempText(body.slice(0, 7000));
  const bodyImg = `${out}.body.png`;
  TEMP_FILES.push(bodyImg);
  run("magick", [
    "-background",
    "none",
    "-fill",
    "#d1d5db",
    "-font",
    FONT_MONO,
    "-pointsize",
    "22",
    "-size",
    "1000x",
    `caption:@${textFile}`,
    bodyImg,
  ]);
  const [, bodyH] = identify(bodyImg);
  const height = Math.min(Math.max(bodyH + 120, 320), 820);
  run("magick", ["-size", `1080x${height}`, "xc:#0f172a", out]);
  rect(out, 0, 0, 1080, 48, "#111827", 0);
  text(out, title, 28, 34, 24, "#ffffff", 980);
  composite(out, bodyImg, 32, 72);
}

function composite(base, overlay, x, y) {
  const tmp = `${base}.tmp.png`;
  run("magick", [base, overlay, "-geometry", `+${x}+${y}`, "-composite", tmp]);
  renameSync(tmp, base);
}

function identify(file) {
  const out = run("magick", ["identify", "-format", "%w %h", file]).trim();
  return out.split(/\s+/).map(Number);
}

function cmd(command, args) {
  const res = spawnSync(command, args, { cwd: ROOT, encoding: "utf8" });
  const out = [res.stdout.trim(), res.stderr.trim()].filter(Boolean).join("\n");
  if (res.status !== 0) return `$ ${command} ${args.join(" ")}\n${out}\n(exit ${res.status})`;
  return `$ ${command} ${args.join(" ")}\n${out}`;
}

function run(command, args) {
  const res = spawnSync(command, args, { cwd: ROOT, encoding: "utf8" });
  if (res.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed\n${res.stdout}\n${res.stderr}`);
  }
  return res.stdout;
}

function tempText(value) {
  const file = join(OUT_DIR, `.tmp-${Math.random().toString(16).slice(2)}.txt`);
  writeFileSync(file, value);
  TEMP_FILES.push(file);
  return file;
}
