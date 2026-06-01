import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(path) {
  return readFileSync(resolve(path), "utf-8");
}

test("usage docs present --lite as canonical and retire Codex agent-hook hard-enforcement claims", () => {
  for (const path of ["docs/USAGE.md", "docs/USAGE.ko.md"]) {
    const body = read(path);
    assert.match(body, /agent-init --lite/);
    assert.doesNotMatch(body, /agent-init --theme=lite/);
    assert.doesNotMatch(body, /\[\[hooks\.agent\]\]/);
    assert.match(body, /Codex CLI[\s\S]{0,240}(Prompt-level|프롬프트)/);
    assert.doesNotMatch(body, /3 to 9 role files|3개에서 9개 역할 파일/);
    assert.match(body, /\.claude\/agents\/\*\.md[\s\S]{0,300}(orchestrator|오케스트레이터)/i);
    assert.match(body, /\.claude\/agents\/\*\.md[\s\S]{0,420}(security-reviewer|보안)/i);
    assert.match(body, /\.claude\/agents\/\*\.md[\s\S]{0,420}(data-reviewer|데이터)/i);
  }

  const usageEn = read("docs/USAGE.md");
  assert.match(usageEn, /\| Copilot CLI \|[^|]*(prompt-level|optional hook helper|manual hook review)[^|]*\| 🟡/i);
  assert.doesNotMatch(usageEn, /\| Copilot CLI \|[^|]*\| 🟢 Hard \|/);

  const usageKo = read("docs/USAGE.ko.md");
  assert.match(usageKo, /\| Copilot CLI \|[^|]*(프롬프트|선택적 hook helper|수동 hook 검토)[^|]*\| 🟡/i);
  assert.doesNotMatch(usageKo, /\| Copilot CLI \|[^|]*\| 🟢 Hard \|/);
});

test("usage docs describe Codex lite setup paths", () => {
  for (const path of ["docs/USAGE.md", "docs/USAGE.ko.md"]) {
    const body = read(path);
    assert.match(body, /codex-init --lite/);
    assert.match(body, /install-platform\.sh[\s\S]{0,360}--platform=codex[\s\S]{0,180}--lite/);
    assert.match(body, /Codex[\s\S]{0,420}(lite|경량|가벼운)/i);
    assert.doesNotMatch(body, /codex-init --theme=lite/);
  }
});

test("usage docs describe agent-init language persistence", () => {
  for (const path of ["README.md", "README.ko.md", "docs/USAGE.md", "docs/USAGE.ko.md"]) {
    const body = read(path);
    assert.match(body, /agent-init --lang=ko/);
    assert.match(body, /agent-init --lang=auto/);
    assert.match(body, /--lang=ko\|en\|auto/);
    assert.match(body, /auto[\s\S]{0,320}(locale|로케일|`LANG`|`LC_ALL`|`LC_MESSAGES`)/i);
    assert.match(body, /install-platform\.sh[\s\S]{0,420}--lang=ko/);
    assert.match(body, /\.agent-all\.json[\s\S]{0,180}language/);
  }

  for (const path of ["docs/USAGE.md", "docs/USAGE.ko.md", "plugins/harness-builder-codex/README.md"]) {
    const body = read(path);
    assert.match(body, /codex-init --lang=ko/);
  }
});

test("readme files describe the current Codex config surface and current test count", () => {
  for (const path of ["README.md", "README.ko.md"]) {
    const body = read(path);
    assert.match(body, /1688\/1688/);
    assert.doesNotMatch(body, /1279\/1279|1279\+|1279%20passing|1547\+/);
    assert.doesNotMatch(
      body,
      /1552\/1552|1552%20passing|1554\/1554|1554%20passing|1557\/1557|1557%20passing|1558\/1558|1558%20passing|1559\/1559|1559%20passing|1560\/1560|1560%20passing|1561\/1561|1561%20passing|1564\/1564|1564%20passing|1565\/1565|1565%20passing|1566\/1566|1566%20passing|1567\/1567|1567%20passing|1568\/1568|1568%20passing|1569\/1569|1569%20passing|1572\/1572|1577\/1577|1579\/1579|1580\/1580|1581\/1581|1581%20passing|1581 tests|1591\/1591|1591%20passing|1591 tests|1600\/1600|1600%20passing|1600 tests|1602\/1602|1602%20passing|1602 tests|1604\/1604|1604%20passing|1604 tests|1605\/1605|1605%20passing|1605 tests|1606\/1606|1606%20passing|1606 tests|1611\/1611|1611%20passing|1611 tests|1612\/1612|1612%20passing|1612 tests|1613\/1613|1613%20passing|1613 tests|1614\/1614|1614%20passing|1614 tests|1615\/1615|1615%20passing|1615 tests|1616\/1616|1616%20passing|1616 tests|1623\/1623|1623%20passing|1623 tests|1625\/1625|1625%20passing|1625 tests|1627\/1627|1627%20passing|1627 tests|1629\/1629|1629%20passing|1629 tests|1630\/1630|1630%20passing|1630 tests|1632\/1632|1632%20passing|1632 tests|1633\/1633|1633%20passing|1633 tests|1634\/1634|1634%20passing|1634 tests|1637\/1637|1637%20passing|1637 tests|1638\/1638|1638%20passing|1638 tests|1639\/1639|1639%20passing|1639 tests|1642\/1642|1642%20passing|1642 tests|1645\/1645|1645%20passing|1645 tests|1646\/1646|1646%20passing|1646 tests|1647\/1647|1647%20passing|1647 tests|1648\/1648|1648%20passing|1648 tests|1649\/1649|1649%20passing|1649 tests|1650\/1650|1650%20passing|1650 tests|1651\/1651|1651%20passing|1651 tests|1652\/1652|1652%20passing|1652 tests|1654\/1654|1654%20passing|1654 tests|1656\/1656|1656%20passing|1656 tests|1657\/1657|1657%20passing|1657 tests|1659\/1659|1659%20passing|1659 tests|1660\/1660|1660%20passing|1660 tests|1661\/1661|1661%20passing|1661 tests|1662\/1662|1662%20passing|1662 tests|1663\/1663|1663%20passing|1663 tests|1664\/1664|1664%20passing|1664 tests|1665\/1665|1665%20passing|1665 tests|1666\/1666|1666%20passing|1666 tests|1667\/1667|1667%20passing|1667 tests|1668\/1668|1668%20passing|1668 tests|1669\/1669|1669%20passing|1669 tests|1670\/1670|1670%20passing|1670 tests|1671\/1671|1671%20passing|1671 tests|1672\/1672|1672%20passing|1672 tests|1673\/1673|1673%20passing|1673 tests|1674\/1674|1674%20passing|1674 tests|1675\/1675|1675%20passing|1675 tests|1676\/1676|1676%20passing|1676 tests|1681\/1681|1681%20passing|1681 tests|1684\/1684|1684%20passing|1684 tests|1685\/1685|1685%20passing|1685 tests|1687\/1687|1687%20passing|1687 tests/,
    );
    assert.doesNotMatch(body, /\[\[hooks\.agent\]\]/);
    assert.match(body, /\[\[hooks\.PreToolUse\]\]|\[mcp_servers\.playwright\]/);
    assert.match(body, /Codex CLI[\s\S]{0,320}(prompt-level|sequential|프롬프트|순차)/i);
    assert.match(body, /scripts\/release-smoke\.sh --fast/);
    assert.match(body, /scripts\/release-smoke\.sh --fast --with-live-cli/);
    assert.match(body, /scripts\/release-audit\.mjs/);
    assert.match(body, /scripts\/release-fixture-smoke\.mjs/);
    assert.match(body, /install-platform\.sh[\s\S]{0,360}--platform=codex[\s\S]{0,180}--lite/);
    assert.doesNotMatch(body, /stable--cli--verification--pending|CLI verification pending|CLI 검증 대기|Sandbox lacks Codex|Sandbox에 Codex/);
  }
});

test("readme files describe release-safe update and per-platform install paths", () => {
  const english = read("README.md");
  assert.match(english, /scripts\/update\.sh[\s\S]{0,420}force-updates already-installed selected plugins/i);
  assert.match(english, /scripts\/update\.sh --foundations[\s\S]{0,360}superpowers[\s\S]{0,180}context-mode/i);
  assert.match(english, /scripts\/update\.sh --foundations-only[\s\S]{0,260}approved foundation plugins/i);
  assert.match(english, /--cli=cursor\|copilot\|codex\|gemini/);
  assert.match(english, /--update-foundations[\s\S]{0,520}approved foundation plugins/i);
  assert.match(english, /install-platform\.sh[\s\S]{0,420}does not patch global CLI config files/i);
  assert.match(english, /Copilot CLI[\s\S]{0,360}(prompt-level|optional hook helper|manual hook review)/i);
  assert.doesNotMatch(english, /target CLI installed.*config dir writable/i);
  assert.doesNotMatch(english, /Hooks integrate with `gh copilot`|Copilot CLI get Task-level hard enforcement/i);

  const korean = read("README.ko.md");
  assert.match(korean, /scripts\/update\.sh[\s\S]{0,520}이미 설치된 선택 플러그인을 강제 업데이트/i);
  assert.match(korean, /scripts\/update\.sh --foundations[\s\S]{0,460}superpowers[\s\S]{0,220}context-mode/i);
  assert.match(korean, /scripts\/update\.sh --foundations-only[\s\S]{0,320}approved foundation plugins|승인된 foundation 플러그인/i);
  assert.match(korean, /--cli=cursor\|copilot\|codex\|gemini/);
  assert.match(korean, /--update-foundations[\s\S]{0,640}승인된 foundation 플러그인/i);
  assert.match(korean, /install-platform\.sh[\s\S]{0,520}전역 CLI config 파일을 패치하지 않음/i);
  assert.match(korean, /Copilot CLI[\s\S]{0,420}(프롬프트|선택적 hook helper|수동 hook 검토)/i);
  assert.doesNotMatch(korean, /config dir writable/i);
  assert.doesNotMatch(korean, /Copilot CLI는 Task-level hard enforcement/i);
});

test("readme files describe VS Code Copilot as instructions-only", () => {
  for (const path of ["README.md", "README.ko.md"]) {
    const body = read(path);
    assert.match(body, /--platform=vscode-copilot[\s\S]{0,220}(instructions-only|instructions only|지침 전용)/i);
    assert.doesNotMatch(body, /VS Code[^\n]*(same emitter as Copilot CLI|Copilot CLI와 동일한 emitter)/i);

    const row = body.match(/\| \*\*VS Code Copilot\*\* \|[^\n]+/);
    assert.ok(row, `${path} must have a VS Code Copilot platform row`);
    assert.match(row[0], /\.github\/copilot-instructions\.md/);
    assert.doesNotMatch(row[0], /\.visual-qa\.json|\.agent-all\.json|\.thrift\.json|hooks?/i);

    const uninstallBlock = body.match(/Uninstall per platform[\s\S]{0,760}|플랫폼별 제거[\s\S]{0,760}/);
    assert.ok(uninstallBlock, `${path} must document per-platform uninstall`);
    assert.doesNotMatch(uninstallBlock[0], /\.visual-qa\.json \+ \.agent-all\.json \+ \.thrift\.json \(all platforms\)|\(모든 플랫폼\)/);
  }
});

test("platform plugin READMEs match implemented builder and floor ports", () => {
  const builder = read("plugins/harness-builder-codex/README.md");
  assert.match(builder, /operational/i);
  assert.match(builder, /--lite/);
  assert.match(builder, /AGENTS\.md/);
  assert.match(builder, /agent-policy-hook\.mjs/);
  assert.doesNotMatch(builder, /MVP|follow-ups|best-effort instruction/i);

  const nonCodexBuilders = [
    {
      path: "plugins/harness-builder-copilot/README.md",
      platform: "copilot",
      required: [
        /install-platform\.sh --platform=copilot --theme=builder --target=\/path\/to\/project/,
        /\.github\/copilot-instructions\.md/,
        /\.github\/instructions\//,
        /\.github\/hooks\//,
        /AGENTS\.md/,
        /~\/\.copilot\/mcp-config\.json/,
      ],
    },
    {
      path: "plugins/harness-builder-cursor/README.md",
      platform: "cursor",
      required: [
        /install-platform\.sh --platform=cursor --theme=builder --target=\/path\/to\/project/,
        /\.cursor\/rules\/agent-init\.mdc/,
        /\.cursor\/agents\//,
      ],
      forbidden: /AGENTS\.md/,
    },
    {
      path: "plugins/harness-builder-gemini/README.md",
      platform: "gemini",
      required: [
        /install-platform\.sh --platform=gemini --theme=builder --target=\/path\/to\/project/,
        /GEMINI\.md/,
        /\.gemini\/skills\//,
        /~\/\.gemini\/settings\.json/,
      ],
      forbidden: /AGENTS\.md/,
    },
  ];

  for (const { path, platform, required, forbidden } of nonCodexBuilders) {
    const body = read(path);
    assert.doesNotMatch(body, /copilot plugin install|gemini extensions install|MVP|follow-ups|scaffold-only/i);
    if (forbidden) assert.doesNotMatch(body, forbidden, `${platform} builder README documents artifacts it does not emit`);
    for (const pattern of required) {
      assert.match(body, pattern, `${platform} builder README missing ${pattern}`);
    }
  }

  const floor = read("plugins/harness-floor-codex/README.md");
  assert.match(floor, /sequential/i);
  assert.match(floor, /agent-all-codex/);
  assert.match(floor, /visual-qa-codex/);
  assert.match(floor, /\.codex\/skills\/agent-all-codex/);
  assert.match(floor, /\.codex\/skills\/visual-qa-codex/);
  assert.doesNotMatch(floor, /\[\[hooks\.agent\]\]|scaffold-only|future per-platform spec/i);

  const thrift = read("plugins/harness-thrift-codex/README.md");
  assert.match(thrift, /Codex CLI/i);
  assert.match(thrift, /~\/\.codex\/config\.toml/);
  assert.match(thrift, /--no-instrument/);
  assert.match(thrift, /run \/thrift\s+# one-time setup/);
  assert.match(thrift, /run \/thrift summarise/);
  assert.match(thrift, /run \/thrift audit/);
  assert.doesNotMatch(thrift, /^\/thrift-codex\s+#/m);
  assert.doesNotMatch(thrift, /MVP scope|follow-up plan|scaffold-only|TBD|placeholder/i);
});

test("non-Claude floor plugin READMEs match the implemented install and workflow surfaces", () => {
  const staleFloorClaims =
    /Scaffold-level|MVP scope|scaffold-only|future per-platform spec|future spec|copilot plugin install|gemini extensions install|Run \/visual-qa/i;

  const cases = [
    {
      path: "plugins/harness-floor-copilot/README.md",
      platform: "copilot",
      required: [
        /Operational floor support/i,
        /install-platform\.sh --platform=copilot --theme=floor --target=\/path\/to\/project/,
        /agent-all-copilot/,
        /visual-qa-copilot/,
        /\.visual-qa\.json/,
        /\.agent-all\.json/,
        /\.github\/agent-all\/decision-protocol\.md/,
        /~\/\.copilot\/mcp-config\.json/,
      ],
    },
    {
      path: "plugins/harness-floor-cursor/README.md",
      platform: "cursor",
      required: [
        /Operational floor support/i,
        /install-platform\.sh --platform=cursor --theme=floor --target=\/path\/to\/project/,
        /agent-all-cursor/,
        /visual-qa-cursor/,
        /\.cursor\/agents\//,
        /\.cursor\/rules\/agent-all\.mdc/,
        /\.cursor\/visual-qa\/lib\//,
        /\.cursor\/agent-all\/lib\//,
      ],
    },
    {
      path: "plugins/harness-floor-gemini/README.md",
      platform: "gemini",
      required: [
        /Operational floor support/i,
        /install-platform\.sh --platform=gemini --theme=floor --target=\/path\/to\/project/,
        /agent-all-gemini/,
        /visual-qa-gemini/,
        /\.visual-qa\.json/,
        /\.agent-all\.json/,
        /\.gemini\/agent-all-decision-protocol\.md/,
        /~\/\.gemini\/settings\.json/,
      ],
    },
  ];

  for (const { path, platform, required } of cases) {
    const body = read(path);
    assert.doesNotMatch(body, staleFloorClaims, `${platform} README still has stale floor claims`);
    for (const pattern of required) {
      assert.match(body, pattern, `${platform} README missing ${pattern}`);
    }
  }

  const copilotDecisionProtocol = read(
    "plugins/harness-floor-copilot/skills/agent-all-copilot/templates/decision-protocol.md.hbs",
  );
  assert.match(copilotDecisionProtocol, /prompt-level/i);
  assert.doesNotMatch(copilotDecisionProtocol, /hard-enforced via hook|also installed|blocks PostToolUse/i);
});

test("Codex floor runtime comments reflect the verified CLI surface", () => {
  const files = [
    "plugins/harness-floor-codex/skills/agent-all-codex/lib/sequential-dispatch.mjs",
    "plugins/harness-floor-codex/skills/agent-all-codex/lib/codex-agent-dispatch.mjs",
    "plugins/harness-floor-codex/skills/agent-all-codex/lib/codex-agent-wait.mjs",
    "plugins/harness-floor-codex/skills/visual-qa-codex/lib/sequential-dispatch.mjs",
    "plugins/harness-floor-codex/skills/visual-qa-codex/lib/codex-agent-dispatch.mjs",
    "plugins/harness-floor-codex/skills/visual-qa-codex/lib/codex-agent-wait.mjs",
  ];
  const bodies = files.map((path) => read(path));

  for (const body of bodies) {
    assert.doesNotMatch(body, /TODO: requires live Codex CLI|TODO verify on live CLI/i);
  }
  assert.match(bodies[0], /Codex CLI 0\.135\.0[\s\S]{0,240}positional prompt/);
  assert.match(bodies[3], /Codex CLI 0\.135\.0[\s\S]{0,240}positional prompt/);
  assert.match(bodies[1], /not exposed by Codex CLI 0\.135\.0/);
  assert.match(bodies[2], /not exposed by Codex CLI 0\.135\.0/);
  assert.match(bodies[4], /not exposed by Codex CLI 0\.135\.0/);
  assert.match(bodies[5], /not exposed by Codex CLI 0\.135\.0/);
});

test("Codex runtime specs describe the current sequential surface instead of stale agent hooks", () => {
  const runtimeChecklist = read("docs/superpowers/specs/2026-05-18-cli-runtime-verification-checklist.md");
  assert.match(runtimeChecklist, /release-smoke\.sh --fast --with-live-cli/);
  assert.match(runtimeChecklist, /release fixture smoke[\s\S]{0,260}installed fixture[\s\S]{0,260}sequential agent-all-codex prompt helper/i);
  assert.match(runtimeChecklist, /release fixture smoke[\s\S]{0,360}installed fixture[\s\S]{0,360}sequential visual-qa-codex page helper/i);
  assert.match(runtimeChecklist, /codex exec[\s\S]{0,180}\[PROMPT\]/);
  assert.match(runtimeChecklist, /Manual Host UX Observation/i);
  assert.match(runtimeChecklist, /prompt-level|sequential/i);
  assert.doesNotMatch(runtimeChecklist, /codex skill run codex-init/i);
  assert.doesNotMatch(runtimeChecklist, /install-platform\.sh --platform=codex --target="\$PWD"/);
  assert.doesNotMatch(runtimeChecklist, /cat \.codex\/config\.toml/i);
  assert.doesNotMatch(runtimeChecklist, /\[\[hooks\.agent\]\]|codex agent (?:wait|dispatch)/i);

  for (const path of [
    "docs/superpowers/specs/2026-05-18-agent-all-codex-impl-spec.md",
    "docs/superpowers/specs/2026-05-18-visual-qa-codex-impl-spec.md",
  ]) {
    const body = read(path);
    assert.match(body, /Codex CLI 0\.135\.0/);
    assert.match(body, /positional \[PROMPT\]/);
    assert.match(body, /sequential/i);
    assert.doesNotMatch(body, /## Manual Runtime Observation/i);
    assert.doesNotMatch(body, /\[\[hooks\.agent\]\]|codex agent (?:wait|dispatch)|agent-hook E2E|pending spike|post-spike/i);
  }

  const agentAllSpec = read("docs/superpowers/specs/2026-05-18-agent-all-codex-impl-spec.md");
  assert.match(agentAllSpec, /release fixture smoke[\s\S]{0,260}installed fixture[\s\S]{0,260}sequential agent-all-codex prompt helper/i);

  const visualQaSpec = read("docs/superpowers/specs/2026-05-18-visual-qa-codex-impl-spec.md");
  assert.match(visualQaSpec, /release fixture smoke[\s\S]{0,360}installed fixture[\s\S]{0,360}sequential visual-qa-codex page helper/i);

  for (const path of [
    "docs/superpowers/specs/2026-05-21-decision-surfacing-and-policy-hooks-design.md",
    "docs/superpowers/specs/2026-05-21-decision-surfacing-and-policy-hooks-design.ko.md",
  ]) {
    const body = read(path);
    assert.doesNotMatch(body, /\[\[hooks\.agent\]\]/);
    assert.doesNotMatch(body, /1246\/1246|1279\/1279|1645\/1645|1646\/1646|1647\/1647|1648\/1648|1649\/1649|1650\/1650|1651\/1651|1652\/1652|1654\/1654|1656\/1656|1657\/1657|1659\/1659|1660\/1660|1661\/1661|1662\/1662|1663\/1663|1664\/1664|1665\/1665|1666\/1666|1667\/1667|1668\/1668|1669\/1669|1670\/1670|1671\/1671|1672\/1672|1673\/1673|1674\/1674|1675\/1675|1676\/1676|1681\/1681|1684\/1684|1685\/1685|1687\/1687/);
    assert.match(body, /1688\/1688/);
    assert.match(body, /Codex CLI[\s\S]{0,260}(PreToolUse|prompt-level|sequential|프롬프트|순차)/i);
  }
});

test("operational hardening docs record implemented release-audited status", () => {
  const plan = read("docs/superpowers/plans/2026-06-01-operational-agent-init-agent-all-hardening.md");
  assert.match(plan, /## Implementation Status/i);
  assert.match(plan, /Implemented through Task 12/i);
  assert.match(plan, /root role routing/i);
  assert.match(plan, /node --test[\s\S]{0,120}1688\/1688/);
  assert.match(plan, /release-smoke\.sh --fast --with-live-cli[\s\S]{0,120}318\/318/);
  assert.match(plan, /release-audit\.mjs/);
  assert.match(plan, /release-fixture-smoke\.mjs/);
  assert.match(plan, /historical TDD checklist/i);

  const spec = read("docs/superpowers/specs/2026-06-01-operational-agent-init-agent-all-design.md");
  assert.match(spec, /\*\*Status:\*\* Implemented and release-audited/i);
  assert.doesNotMatch(spec, /pending written-spec review/i);
});

test("plugin release docs describe release surfaces without MVP/deferred wording", () => {
  const checks = [
    {
      path: "plugins/harness-thrift/README.md",
      required: [/harness-thrift/, /Release surface/, /Runtime validation/],
    },
    {
      path: "plugins/harness-thrift-cursor/README.md",
      required: [/harness-thrift-cursor/, /Release surface/, /advisory-only/i],
    },
    {
      path: "plugins/harness-thrift-copilot/README.md",
      required: [/harness-thrift-copilot/, /Release surface/, /Cross-plugin isolation/],
    },
    {
      path: "plugins/harness-thrift-gemini/README.md",
      required: [/harness-thrift-gemini/, /Release surface/, /Settings/],
    },
    {
      path: "plugins/harness-debug/README.md",
      required: [/harness-debug/, /Release surface/, /structured debugging/i],
    },
  ];

  for (const { path, required } of checks) {
    const body = read(path);
    for (const pattern of required) {
      assert.match(body, pattern, `${path} missing ${pattern}`);
    }
    assert.doesNotMatch(
      body,
      /MVP scope|this iteration|Live .*verification deferred|decomposition spec deferred|scaffolded per|TODO verify|scaffold-only|TBD|placeholder/i,
      `${path} has stale release wording`,
    );
  }

  for (const path of [
    "plugins/harness-thrift-gemini/skills/thrift-gemini/lib/cost-estimator.mjs",
    "plugins/harness-thrift-gemini/skills/thrift-gemini/phases/3-summariser.md",
    "plugins/harness-thrift-gemini/skills/thrift-gemini/phases/4-cache-prime.md",
    "plugins/harness-thrift-gemini/skills/thrift-gemini/references/porting-notes.md",
  ]) {
    const body = read(path);
    assert.doesNotMatch(
      body,
      /TODO verify|currently marked/i,
      `${path} must use release-audit provenance wording instead of TODO markers`,
    );
  }
});

test("manual release checklist is mapped to automated gates and Claude/Codex live probes", () => {
  const body = read("tests/manual-checklist.md");

  assert.match(body, /Automated release gate/i);
  assert.match(body, /release-audit\.mjs/);
  assert.match(body, /release-fixture-smoke\.mjs/);
  assert.match(body, /release-command-surface\.test\.mjs/);
  assert.match(body, /release-smoke\.sh --fast --with-live-cli/);
  assert.match(body, /Claude slash-command metadata, headings, flags, and summary contracts/i);
  assert.match(body, /Codex slash-command metadata, headings, flags, and summary contracts/i);
  assert.match(body, /node --test[\s\S]{0,480}claude-native-release-contract\.test\.mjs/);
  assert.match(body, /node --test[\s\S]{0,480}release-install-scripts\.test\.mjs/);
  assert.match(body, /Claude Code live session/i);
  assert.match(body, /Codex CLI live session/i);
  assert.match(body, /\/agent-init --lite/);
  assert.match(body, /\/codex-init --lite/);
  assert.match(body, /run \/agent-all for "smoke task"/);
  assert.match(body, /run \/visual-qa for the configured project/);
  assert.match(body, /^run \/thrift$/m);
  assert.match(body, /run \/thrift summarise/);
  assert.match(body, /run \/thrift audit/);
  assert.doesNotMatch(body, /\/agent-all-codex "smoke task"|codex exec "smoke task"|codex skill run/i);
  assert.match(body, /codex exec[\s\S]{0,240}positional/i);
  assert.doesNotMatch(body, /^- \[ \]/m);
  assert.doesNotMatch(body, /Confirm that the slash command is discoverable/);
  assert.doesNotMatch(body, /Phase 3 launches|parallel subagents|final summary names/i);
  assert.doesNotMatch(body, /operational run prints|lite run skips hook\/config|routes through sequential skill prompts/i);
});

test("CLI runtime checklist points at the release readiness audit gate", () => {
  const body = read("docs/superpowers/specs/2026-05-18-cli-runtime-verification-checklist.md");

  assert.match(body, /Automated Gate First/i);
  assert.match(body, /release-audit\.mjs/);
  assert.match(body, /release-fixture-smoke\.mjs/);
  assert.match(body, /release readiness audit/i);
  assert.match(body, /release-smoke\.sh --fast --with-live-cli/);
  assert.match(body, /run \/agent-all for "smoke task"/);
  assert.match(body, /run \/visual-qa for the configured project/);
  assert.match(body, /Run `run \/thrift`, `run \/thrift summarise`, and `run \/thrift audit`/);
  assert.match(body, /run \/thrift summarise/);
  assert.match(body, /run \/thrift audit/);
  assert.doesNotMatch(body, /\/agent-all-codex "smoke task"|\/visual-qa-codex|\/thrift-codex|codex skill run/i);
});
