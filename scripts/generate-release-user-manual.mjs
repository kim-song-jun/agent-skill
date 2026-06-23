#!/usr/bin/env node
import { existsSync, mkdirSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");
const RELEASE = "v0.7.8";
const RELEASE_URL = "https://github.com/kim-song-jun/agent-skill/releases/tag/v0.7.8";
const OUT_DIR = resolve(
  ROOT,
  process.argv.find((arg) => arg.startsWith("--out-dir="))?.slice("--out-dir=".length)
    || ".agent-skill/releases/v0.7.8/user-manual",
);
const CARD_DIR = join(OUT_DIR, "cards");
const PAGE_DIR = join(OUT_DIR, "pages");
const FONT_KO = "/System/Library/Fonts/AppleSDGothicNeo.ttc";
const FONT_MONO = existsSync("/System/Library/Fonts/SFNSMono.ttf")
  ? "/System/Library/Fonts/SFNSMono.ttf"
  : FONT_KO;
const W = 1240;
const H = 1754;

const TEMP_FILES = [];
const manual = buildManual();

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(CARD_DIR, { recursive: true });
mkdirSync(PAGE_DIR, { recursive: true });

writeMarkdown(manual);
const cards = renderCards(manual);
const pages = renderPages(manual, cards);
run("magick", [...pages, join(OUT_DIR, `agent-skill-${RELEASE}-user-manual.pdf`)]);

for (const file of TEMP_FILES) {
  try {
    unlinkSync(file);
  } catch {
    // Temporary render files are best-effort cleanup only.
  }
}

console.log(`wrote ${join(OUT_DIR, `agent-skill-${RELEASE}-user-manual.md`)}`);
console.log(`wrote ${join(OUT_DIR, `agent-skill-${RELEASE}-user-manual.pdf`)}`);

function buildManual() {
  const claudeStatus = summariseClaudePlugins();
  return {
    claudeStatus,
    quickStart: [
      ["1", "Claude Code를 재시작", "플러그인 업데이트는 재시작 후 적용됩니다."],
      ["2", "프로젝트 열기", "이미 scaffold가 설치된 프로젝트에서는 init을 다시 하지 않습니다."],
      ["3", "작업 요청", '/agent-all "원하는 작업" --loop --qa 로 시작합니다.'],
      ["4", "결과 확인", "테스트, QA, 리뷰 gate가 통과할 때까지 반복됩니다."],
    ],
    commands: [
      ["/agent-all", "기능 개발/수정", '/agent-all "결제 오류 고쳐줘" --loop --qa'],
      ["/visual-qa", "UI 변경 확인", "화면 깨짐, hover/focus, 반응형 문제 확인"],
      ["/debug", "실패 원인 분석", '/debug "npm test 실패 원인 찾아줘"'],
      ["/thrift", "긴 세션/비용 관리", "큰 로그는 파일로 빼고 요약만 남김"],
      ["/data-runner", "SQL/노트북/데이터 검증", "/data-runner sql .agent-skill/tasks/<task>.md"],
      ["/wiki", "프로젝트 지식 베이스 조회·기록", "/wiki <질의> | /wiki write <제목> | /wiki compile"],
    ],
    recipes: [
      ["UI 작업", '/agent-all "모바일 상품 카드 정리" --loop --qa', "완료 후 /visual-qa 로 주요 화면만 다시 확인합니다."],
      ["버그 수정", '/debug "재현 명령 또는 에러 메시지"', "원인을 좁힌 뒤 /agent-all 로 수정과 검증을 맡깁니다."],
      ["데이터 검증", "/data-runner sql <task-doc>", "쿼리, notebook, artifact diff를 작업 증거로 남깁니다."],
      ["긴 작업", "/thrift", "세션이 길어지면 자동 추천을 따르거나 직접 켜서 맥락과 비용 낭비를 줄입니다."],
    ],
  };
}

function summariseClaudePlugins() {
  const res = spawnSync("claude", ["plugin", "list"], { cwd: ROOT, encoding: "utf8" });
  if (res.status !== 0) {
    return "Claude plugin list 확인 실패: 수동으로 `claude plugin list`를 실행하세요.";
  }
  const blocks = res.stdout.split(/\n\s*\n/).filter((block) => block.includes("@agent-skill"));
  const bad = blocks.filter((block) => !block.includes("Version: 0.7.8") || !block.includes("Status: ✔ enabled"));
  if (blocks.length === 19 && bad.length === 0) {
    return "로컬 Claude user scope에 agent-skill 플러그인 19개가 모두 v0.7.8으로 설치되어 있습니다.";
  }
  return `Claude plugin list에서 agent-skill ${blocks.length}/19개가 보입니다. 빠진 항목은 marketplace update 후 plugin update/install이 필요합니다.`;
}

function writeMarkdown(data) {
  const md = `# agent-skill ${RELEASE} 사용설명서

이 문서는 릴리즈 검증 자료가 아니라, 실제 사용자가 바로 쓰기 위한 설명서입니다.  
릴리즈: ${RELEASE_URL}

## 지금 바로 써도 되나요?

현재 확인 상태: ${data.claudeStatus}

단, Claude Code 플러그인 업데이트는 재시작 후 적용되므로 **Claude Code를 한 번 재시작**하세요.

이미 Claude/Codex scaffold가 설치된 프로젝트는 **init을 다시 하지 않습니다.**

## 3분 시작

1. Claude Code를 재시작합니다.
2. 이미 scaffold가 설치된 프로젝트를 엽니다.
3. 아래처럼 작업을 요청합니다.

\`\`\`text
/agent-all "원하는 작업을 구체적으로 적기" --loop --qa
\`\`\`

예시:

\`\`\`text
/agent-all "대시보드 필터가 초기화되는 문제를 고치고 테스트까지 돌려줘" --loop --qa
\`\`\`

## init은 언제 필요한가요?

| 상황 | init 필요 여부 | 무엇을 하면 되나 |
|---|---:|---|
| 이미 scaffold가 설치된 프로젝트 | 아니오 | Claude Code 재시작 후 바로 \`/agent-all\` 사용 |
| 새 프로젝트 | 예 | \`install-platform.sh --platform=claude --target=/path --lang=ko\` 1회 실행 |
| Claude 플러그인만 업데이트한 경우 | 아니오 | 기존 프로젝트 파일은 그대로 두고 Claude Code만 재시작 |
| 프로젝트 scaffold가 깨졌거나 삭제된 경우 | 예 | 같은 installer를 \`--force\`로 다시 실행 |

## 자주 쓰는 명령

| 명령 | 쓰는 때 | 예시 |
|---|---|---|
${data.commands.map(([command, use, example]) => `| \`${command}\` | ${use} | \`${example}\` |`).join("\n")}

## 작업별 추천 흐름

### 기능 개발 또는 버그 수정

\`\`\`text
/agent-all "작업 설명" --loop --qa
\`\`\`

작업 설명에는 원하는 결과, 사용자가 겪는 문제, 확인해야 할 화면이나 API를 같이 적습니다.  
\`--loop\`는 실패한 테스트나 리뷰 지적을 다시 반영하게 하고, \`--qa\`는 사용자 관점 확인을 강화합니다.

### UI 변경

\`\`\`text
/agent-all "화면 수정 내용" --loop --qa
/visual-qa
\`\`\`

\`/visual-qa\`는 화면 캡처와 비교를 통해 모바일/태블릿/데스크톱 깨짐을 찾는 용도입니다.

### 테스트 실패 분석

\`\`\`text
/debug "실패한 명령이나 에러 메시지"
\`\`\`

원인을 좁힌 뒤 수정은 \`/agent-all\`로 넘기면 됩니다.

### 비용과 긴 세션 관리

\`\`\`text
/thrift
/thrift audit
\`\`\`

긴 로그를 그대로 대화에 붙이지 말고 파일이나 명령으로 넘기세요. \`/thrift\`는 큰 출력과 오래된 맥락을 요약해 다음 작업에 필요한 정보만 남기는 데 도움이 됩니다.

기본 scaffold는 세션이 길어졌는데 아직 \`/thrift\`가 켜져 있지 않으면 \`/thrift\` 실행을 추천합니다. 이미 \`.thrift.json\`이 있는 프로젝트에서는 \`/thrift summarise\`와 \`/compact\` 안내가 임계값에 맞춰 동작합니다.

## 새 프로젝트 설치

Claude 프로젝트:

\`\`\`bash
bash /path/to/agent-skill/scripts/install-platform.sh \\
  --platform=claude --target=/path/to/project --force --lang=ko
\`\`\`

Codex 프로젝트:

\`\`\`bash
bash /path/to/agent-skill/scripts/install-platform.sh \\
  --platform=codex --target=/path/to/project --force --lang=ko
\`\`\`

## 비용을 줄이는 사용 습관

- 큰 로그를 대화에 붙이지 말고 파일 경로나 실패 명령만 전달합니다.
- 작업 요청에 성공 조건을 같이 적어 반복 횟수를 줄입니다.
- UI 검증은 관련 화면 중심으로 요청합니다.
- 긴 작업 전후에 \`/thrift\`를 사용해 맥락을 정리합니다. 추천 알림이 뜨면 그 시점에 켜면 됩니다.
- 같은 실패가 반복되면 \`/debug\`로 원인을 먼저 좁힙니다.

## 문제가 생기면

\`\`\`bash
claude plugin list
claude plugin marketplace update agent-skill
claude plugin update harness-builder@agent-skill
claude plugin update harness-floor@agent-skill
claude plugin update harness-thrift@agent-skill
claude plugin update harness-debug@agent-skill
claude plugin update harness-data@agent-skill
\`\`\`

현재 확인 상태: ${data.claudeStatus}
`;
  writeFileSync(join(OUT_DIR, `agent-skill-${RELEASE}-user-manual.md`), md);
}

function renderCards(data) {
  const cards = [
    ["01-quick-start", "바로 시작", data.quickStart.map(([, title, body]) => `${title}\n${body}`).join("\n\n")],
    ["02-command-map", "명령 지도", data.commands.map(([command, use, example]) => `${command} — ${use}\n${example}`).join("\n\n")],
    ["03-init-decision", "init 판단표", "이미 설치된 프로젝트: init 불필요\n새 프로젝트: init 1회 필요\n플러그인 업데이트만 한 경우: Claude Code 재시작\nscaffold가 깨진 경우: --force로 재설치"],
  ];
  return cards.map(([name, title, body]) => {
    const out = join(CARD_DIR, `${name}.png`);
    guideCard(title, body, out);
    return out;
  });
}

function renderPages(data, cards) {
  const pages = [];
  pages.push(page("01-start", [
    bigTitle("agent-skill v0.6.1", "사용설명서"),
    callout(70, 360, 1100, 230, "결론", "이미 scaffold가 설치된 프로젝트는 init을 다시 하지 않습니다. Claude Code를 재시작한 뒤 바로 /agent-all을 쓰면 됩니다."),
    stepList(660, data.quickStart),
  ]));
  pages.push(page("02-quick", [
    heading("3분 시작"),
    commandBox(90, 230, '/agent-all "원하는 작업을 구체적으로 적기" --loop --qa'),
    sectionAt(470, "좋은 요청 예시", [
      '"대시보드 필터가 초기화되는 문제를 고치고 테스트까지 돌려줘"',
      '"모바일 상품 카드 간격을 정리하고 visual QA까지 확인해줘"',
      '"SQL 검증 실패 원인을 찾고 재발 방지 테스트를 추가해줘"',
    ]),
    image(cards[0], 90, 980, 1060),
  ]));
  pages.push(page("03-init", [
    heading("init이 필요한 경우"),
    decisionTable(),
    callout(90, 1190, 1060, 210, "기억할 점", "전역 Claude 플러그인 업데이트와 프로젝트 init은 다릅니다. 이미 scaffold가 있는 프로젝트는 플러그인 업데이트 후 재시작만 하면 됩니다."),
  ]));
  pages.push(page("04-commands", [
    heading("자주 쓰는 명령"),
    commandCards(data.commands),
  ]));
  pages.push(page("05-recipes", [
    heading("작업별 추천 흐름"),
    recipeCards(data.recipes),
  ]));
  pages.push(page("06-cost", [
    heading("비용을 줄이는 방법"),
    twoColumn([
      ["로그 붙여넣기 줄이기", "큰 로그는 파일 경로나 실패 명령으로 전달합니다. 필요한 요약만 대화에 남깁니다."],
      ["성공 조건 같이 쓰기", "요청에 원하는 결과와 확인 기준을 같이 적으면 반복 횟수가 줄어듭니다."],
      ["UI 검증 범위 좁히기", "관련 화면, 주요 breakpoint, 핵심 interaction을 먼저 검증합니다."],
      ["/thrift 추천", "세션이 길어지고 아직 켜져 있지 않으면 기본 hook이 /thrift 실행을 추천합니다."],
      ["/debug 먼저 사용", "같은 실패가 반복되면 구현을 계속 밀지 말고 원인을 좁힙니다."],
      ["새 init 남발 금지", "이미 설치된 프로젝트에 init을 반복하지 않아도 됩니다."],
    ]),
  ]));
  pages.push(page("07-help", [
    heading("문제가 생기면"),
    commandBox(90, 230, "claude plugin list\nclaude plugin marketplace update agent-skill\nclaude plugin update harness-builder@agent-skill"),
    sectionAt(650, "확인할 것", [
      "agent-skill 플러그인이 Version: 0.6.1인지 확인합니다.",
      "Status가 enabled인지 확인합니다.",
      "업데이트 후 Claude Code를 재시작합니다.",
      "프로젝트 파일이 없어졌을 때만 install-platform.sh를 다시 실행합니다.",
    ]),
    callout(90, 1260, 1060, 230, "현재 상태", data.claudeStatus),
  ]));
  return pages;
}

function page(name, elements) {
  const out = join(PAGE_DIR, `${name}.png`);
  run("magick", ["-size", `${W}x${H}`, "xc:#f8fafc", out]);
  rect(out, 0, 0, W, 42, "#2563eb", 0);
  text(out, "agent-skill v0.6.1 user manual", 70, 30, 24, "#ffffff", 1080);
  for (const element of elements) element(out);
  text(out, `2026-06-12 · ${RELEASE}`, 70, 1710, 22, "#64748b", 800);
  return out;
}

function bigTitle(main, sub) {
  return (out) => {
    text(out, main, 70, 180, 68, "#0f172a", 1060);
    text(out, sub, 70, 255, 40, "#334155", 1060);
    text(out, "복잡한 릴리즈 증거 대신, 실제 작업자가 바로 따라 하는 순서만 정리했습니다.", 70, 320, 28, "#475569", 1060);
  };
}

function heading(value) {
  return (out) => text(out, value, 70, 135, 50, "#0f172a", 1100);
}

function stepList(startY, steps) {
  return (out) => {
    steps.forEach(([num, title, body], idx) => {
      const y = startY + idx * 220;
      circle(out, 110, y + 45, 38, "#2563eb");
      text(out, num, 98, y + 55, 28, "#ffffff", 40);
      text(out, title, 170, y + 40, 34, "#0f172a", 900);
      text(out, body, 170, y + 90, 27, "#475569", 900);
    });
  };
}

function sectionAt(startY, title, bullets) {
  return (out) => {
    text(out, title, 90, startY, 34, "#2563eb", 1040);
    text(out, bullets.map((b) => `• ${b}`).join("\n"), 110, startY + 58, 27, "#1e293b", 1000);
  };
}

function commandBox(x, y, value) {
  return (out) => {
    rect(out, x, y, x + 1060, y + 190, "#0f172a", 18);
    text(out, value, x + 34, y + 70, 28, "#e2e8f0", 990, FONT_MONO);
  };
}

function callout(x, y, width, height, title, body) {
  return (out) => {
    rect(out, x, y, x + width, y + height, "#eff6ff", 18, "#bfdbfe");
    text(out, title, x + 28, y + 55, 30, "#1d4ed8", width - 56);
    text(out, body, x + 28, y + 108, 28, "#1e293b", width - 56);
  };
}

function decisionTable() {
  return (out) => {
    const rows = [
      ["이미 scaffold가 설치됨", "아니오", "Claude Code 재시작 후 바로 사용"],
      ["새 프로젝트", "예", "install-platform.sh 1회 실행"],
      ["플러그인만 업데이트", "아니오", "프로젝트 파일은 그대로 둠"],
      ["scaffold 파일 삭제/손상", "예", "--force로 재설치"],
    ];
    const x = 90;
    const y = 250;
    const widths = [450, 170, 440];
    const headers = ["상황", "init?", "할 일"];
    table(out, x, y, widths, headers, rows);
  };
}

function commandCards(commands) {
  return (out) => {
    commands.forEach(([command, use, example], idx) => {
      const y = 240 + idx * 245;
      rect(out, 90, y, 1150, y + 190, "#ffffff", 18, "#dbe4ee");
      text(out, command, 120, y + 55, 31, "#2563eb", 300, FONT_MONO);
      text(out, use, 455, y + 55, 30, "#0f172a", 635);
      text(out, example, 455, y + 112, 24, "#475569", 635);
    });
  };
}

function recipeCards(recipes) {
  return (out) => {
    recipes.forEach(([title, command, tip], idx) => {
      const y = 245 + idx * 295;
      rect(out, 90, y, 1150, y + 235, "#ffffff", 18, "#dbe4ee");
      text(out, title, 125, y + 55, 33, "#2563eb", 940);
      text(out, command, 125, y + 112, 25, "#0f172a", 950, FONT_MONO);
      text(out, tip, 125, y + 170, 26, "#475569", 950);
    });
  };
}

function twoColumn(items) {
  return (out) => {
    const colW = 520;
    const rowH = 240;
    items.forEach(([title, body], idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const x = 90 + col * 570;
      const y = 230 + row * rowH;
      rect(out, x, y, x + colW, y + 200, "#ffffff", 18, "#dbe4ee");
      text(out, title, x + 25, y + 58, 30, "#2563eb", colW - 50);
      text(out, body, x + 25, y + 112, 24, "#334155", colW - 50);
    });
  };
}

function guideCard(title, body, out) {
  run("magick", ["-size", "1120x760", "xc:#f8fafc", out]);
  rect(out, 0, 0, 1120, 92, "#2563eb", 0);
  text(out, title, 40, 62, 36, "#ffffff", 1040);
  rect(out, 40, 135, 1080, 700, "#ffffff", 20, "#dbe4ee");
  text(out, body, 75, 190, 28, "#1e293b", 970);
}

function table(file, x, y, widths, headers, rows) {
  const rowH = 140;
  const totalW = widths.reduce((sum, value) => sum + value, 0);
  rect(file, x, y, x + totalW, y + 90, "#2563eb", 14);
  let offset = x;
  headers.forEach((header, idx) => {
    text(file, header, offset + 22, y + 58, 26, "#ffffff", widths[idx] - 44);
    offset += widths[idx];
  });
  rows.forEach((row, rowIdx) => {
    const top = y + 90 + rowIdx * rowH;
    rect(file, x, top, x + totalW, top + rowH, rowIdx % 2 === 0 ? "#ffffff" : "#f1f5f9", 0, "#e2e8f0");
    let cellX = x;
    row.forEach((cell, idx) => {
      text(file, cell, cellX + 22, top + 58, 25, idx === 1 ? "#2563eb" : "#1e293b", widths[idx] - 44);
      cellX += widths[idx];
    });
  });
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

function circle(file, x, y, radius, fill) {
  const tmp = `${file}.tmp.png`;
  run("magick", [
    file,
    "-fill",
    fill,
    "-stroke",
    fill,
    "-draw",
    `circle ${x},${y} ${x + radius},${y}`,
    tmp,
  ]);
  renameSync(tmp, file);
}

function text(file, value, x, y, size, fill, width, font = FONT_KO) {
  const caption = tempText(value);
  const label = `${file}.${x}.${y}.text.png`;
  TEMP_FILES.push(label);
  run("magick", [
    "-background",
    "none",
    "-fill",
    fill,
    "-font",
    font,
    "-pointsize",
    String(size),
    "-size",
    `${width}x`,
    `caption:@${caption}`,
    label,
  ]);
  composite(file, label, x, y - size);
}

function composite(base, overlay, x, y) {
  const tmp = `${base}.tmp.png`;
  run("magick", [base, overlay, "-geometry", `+${x}+${y}`, "-composite", tmp]);
  renameSync(tmp, base);
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
