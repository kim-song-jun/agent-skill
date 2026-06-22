import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(path) {
  return readFileSync(resolve(path), "utf-8");
}

test("usage docs present --lite as canonical and document uninstall cleanup symmetry", () => {
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
    assert.match(body, /^\.\/scripts\/install-platform\.sh --platform=claude --target=\/path\/to\/my-project --uninstall$/m);
    assert.match(body, /^\.\/scripts\/install-platform\.sh --platform=claude --target=\/path\/to\/my-project --uninstall --force-root-clean$/m);
    assert.match(body, /^\.\/scripts\/install-platform\.sh --platform=codex --target=\/path\/to\/my-project --uninstall$/m);
    assert.match(body, /^\.\/scripts\/install-platform\.sh --platform=codex --target=\/path\/to\/my-project --uninstall --force-root-clean$/m);
    assert.match(body, /release-provenance\.mjs --release=<rc-tag>/);
    assert.match(body, /--verify-checksums --manifest=/);
    assert.match(body, /--verify-provenance --manifest=/);
    assert.match(body, /--max-runtime-sec/);
    assert.match(body, /--max-iter=0[\s\S]{0,180}(unlimited|무제한)/i);
  }

  const usageEn = read("docs/USAGE.md");
  assert.match(usageEn, /\| Copilot CLI \|[^|]*(prompt-level|optional hook helper|manual hook review)[^|]*\| 🟡/i);
  assert.doesNotMatch(usageEn, /\| Copilot CLI \|[^|]*\| 🟢 Hard \|/);

  const usageKo = read("docs/USAGE.ko.md");
  assert.match(usageKo, /\| Copilot CLI \|[^|]*(프롬프트|선택적 hook helper|수동 hook 검토)[^|]*\| 🟡/i);
  assert.doesNotMatch(usageKo, /\| Copilot CLI \|[^|]*\| 🟢 Hard \|/);
});

test("positioning docs explain adjacent harnesses and general harness blueprint", () => {
  const english = read("docs/HARNESS_POSITIONING.md");
  assert.match(english, /Gajae-Code/);
  assert.match(english, /Oh My OpenAgent|OMO/);
  assert.match(english, /project-local harness generator/i);
  assert.match(english, /Command contract[\s\S]{0,260}Project scaffold[\s\S]{0,260}Host adapters/i);
  assert.match(english, /Verification layer[\s\S]{0,260}State layer[\s\S]{0,260}Release layer/i);
  assert.match(english, /https:\/\/github\.com\/Yeachan-Heo\/gajae-code/);
  assert.match(english, /https:\/\/github\.com\/code-yeongyu\/oh-my-openagent/);

  const korean = read("docs/HARNESS_POSITIONING.ko.md");
  assert.match(korean, /Gajae-Code/);
  assert.match(korean, /Oh My OpenAgent|OMO/);
  assert.match(korean, /project-local harness generator/i);
  assert.match(korean, /Command contract[\s\S]{0,260}Project scaffold[\s\S]{0,260}Host adapters/i);
  assert.match(korean, /Verification layer[\s\S]{0,260}State layer[\s\S]{0,260}Release layer/i);

  for (const path of ["README.md", "README.ko.md", "docs/USAGE.md", "docs/USAGE.ko.md", "docs/USER_MANUAL.md", "docs/USER_MANUAL.ko.md"]) {
    const body = read(path);
    assert.match(body, /HARNESS_POSITIONING/);
  }
});

test("platform quickstarts provide install and verify paths", () => {
  const platforms = [
    {
      slug: "claude",
      label: /Claude Code/i,
      ko: /Claude Code|클로드/i,
      install: /\/plugin install harness-builder@agent-skill/,
      verify: /installed_plugins\.json/,
    },
    {
      slug: "codex",
      label: /Codex CLI/i,
      ko: /Codex CLI|코덱스/i,
      install: /codex plugin add harness-builder-codex@agent-skill/,
      verify: /codex plugin list/,
    },
    {
      slug: "copilot",
      label: /Copilot CLI/i,
      ko: /Copilot CLI|코파일럿/i,
      install: /install-platform\.sh --platform=copilot/,
      verify: /\.github\/copilot-instructions\.md/,
    },
    {
      slug: "cursor",
      label: /Cursor/i,
      ko: /Cursor|커서/i,
      install: /install-platform\.sh --platform=cursor/,
      verify: /\.cursor\/rules/,
    },
    {
      slug: "gemini",
      label: /Gemini CLI/i,
      ko: /Gemini CLI|제미나이/i,
      install: /install-platform\.sh --platform=gemini/,
      verify: /GEMINI\.md/,
    },
    {
      slug: "vscode-copilot",
      label: /VS Code Copilot/i,
      ko: /VS Code Copilot|VS Code 코파일럿/i,
      install: /install-platform\.sh --platform=vscode-copilot/,
      verify: /\.github\/copilot-instructions\.md/,
    },
  ];

  const overview = read("docs/quickstart/README.md");
  assert.match(overview, /^# Platform Quickstart$/m);
  assert.match(overview, /Korean: \[README\.ko\.md\]/);
  assert.match(overview, /Install Decision Table/);
  assert.match(overview, /\/agent-init/);

  const overviewKo = read("docs/quickstart/README.ko.md");
  assert.match(overviewKo, /^# 플랫폼 Quickstart$/m);
  assert.match(overviewKo, /English: \[README\.md\]/);
  assert.match(overviewKo, /설치 결정표/);
  assert.match(overviewKo, /\/agent-init/);

  for (const platform of platforms) {
    assert.match(overview, new RegExp(`\\(${platform.slug}\\.md\\)`), `overview links ${platform.slug}.md`);
    assert.match(overviewKo, new RegExp(`\\(${platform.slug}\\.ko\\.md\\)`), `Korean overview links ${platform.slug}.ko.md`);

    const english = read(`docs/quickstart/${platform.slug}.md`);
    assert.match(english, platform.label);
    assert.match(english, /^## Install$/m);
    assert.match(english, /^## Verify$/m);
    assert.match(english, /^## Installed Means$/m);
    assert.match(english, /^## Next Step$/m);
    assert.match(english, platform.install);
    assert.match(english, platform.verify);
    assert.match(english, /\/agent-init/);
    if (platform.slug === "codex") {
      assert.match(english, /update-codex-plugins\.sh/);
    }
    assert.match(english, /\.ko\.md\)/);
    assert.doesNotMatch(english, /\/(?:agent-init|agent-all|visual-qa|thrift|debug)-(?:codex|copilot|cursor|gemini)\b/);

    const korean = read(`docs/quickstart/${platform.slug}.ko.md`);
    assert.match(korean, platform.ko);
    assert.match(korean, /^## 설치$/m);
    assert.match(korean, /^## 확인$/m);
    assert.match(korean, /^## 설치 완료의 의미$/m);
    assert.match(korean, /^## 다음 단계$/m);
    assert.match(korean, platform.install);
    assert.match(korean, platform.verify);
    assert.match(korean, /\/agent-init/);
    if (platform.slug === "codex") {
      assert.match(korean, /update-codex-plugins\.sh/);
    }
    assert.match(korean, /\.md\)/);
    assert.doesNotMatch(korean, /\/(?:agent-init|agent-all|visual-qa|thrift|debug)-(?:codex|copilot|cursor|gemini)\b/);
  }

  for (const path of ["README.md", "README.ko.md"]) {
    assert.match(read(path), /docs\/quickstart\/README/);
  }
});

test("usage docs describe Codex lite setup paths", () => {
  for (const path of ["docs/USAGE.md", "docs/USAGE.ko.md"]) {
    const body = read(path);
    assert.match(body, /agent-init --lite/);
    assert.match(body, /install-platform\.sh[\s\S]{0,360}--platform=codex[\s\S]{0,180}--lite/);
    assert.match(body, /Codex[\s\S]{0,420}(lite|경량|가벼운)/i);
    assert.match(body, /lite[\s\S]{0,420}(automatic foundation update|자동 foundation 갱신)[\s\S]{0,420}--update-foundations/i);
    assert.match(body, /post-install doctor[\s\S]{0,260}(--no-doctor|검증을 의도적으로 미룰)/i);
    assert.match(body, /--profile=builder/);
    assert.doesNotMatch(body, /agent-init --theme=lite/);
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
    assert.match(body, /agent-init --lang=ko/);
    assert.match(body, /agent-init --update-foundations/);
  }
});

test("user manuals are image-backed and explain install versus init", () => {
  const manuals = [
    {
      path: "docs/USER_MANUAL.md",
      lang: "en",
      patterns: [
        /global plugin install/i,
        /project init/i,
        /If the plugins are installed globally but the project is new[\s\S]{0,160}\/agent-init/i,
        /automatic `\/thrift` recommendations/i,
        /Platform Support/i,
      ],
    },
    {
      path: "docs/USER_MANUAL.ko.md",
      lang: "ko",
      patterns: [
        /전역 플러그인 설치/,
        /프로젝트 init/,
        /전역 플러그인이 설치되어 있어도 새 프로젝트[\s\S]{0,160}\/agent-init/,
        /`\/thrift` 자동 추천/,
        /플랫폼별 실제 지원 범위/,
      ],
    },
  ];

  for (const manual of manuals) {
    const body = read(manual.path);
    assert.match(body, /assets\/user-manual\/cards\/01-quick-start\.png/);
    assert.match(body, /assets\/user-manual\/cards\/02-command-map\.png/);
    assert.match(body, /assets\/user-manual\/cards\/03-init-decision\.png/);
    for (const page of ["01-start", "02-quick", "03-init", "04-commands", "05-recipes", "06-cost", "07-help"]) {
      assert.match(body, new RegExp(`assets/user-manual/pages/${page}\\.png`), `${manual.lang} manual links ${page}`);
    }
    for (const pattern of manual.patterns) assert.match(body, pattern);
    assert.doesNotMatch(body, /POSCO|MDS|\/Users\/sungjun|molcube/i);
  }
});

test("readme files describe the current Codex config surface and current test count", () => {
  for (const path of ["README.md", "README.ko.md"]) {
    const body = read(path);
    assert.match(body, /2278\/2278/);
    assert.doesNotMatch(body, /2258\/2258|2258%20passing|2258 tests|2246\/2246|2246%20passing|2246 tests|2205\/2205|2205%20passing|2205 tests|2202\/2202|2202%20passing|2202 tests|2151\/2151|2151%20passing|2151 tests|2150\/2150|2150%20passing|2150 tests|2037\/2037|2037%20passing|2037 tests|2026\/2026|2026%20passing|2026 tests|2011\/2011|2011%20passing|2011 tests|1991\/1991|1991%20passing|1991 tests/);
    assert.doesNotMatch(body, /1871\/1871|1871%20passing|1871 tests|1872\/1872|1872%20passing|1872 tests|1927\/1927|1927%20passing|1927 tests|1932\/1932|1932%20passing|1932 tests|1962\/1962|1962%20passing|1962 tests|1972\/1972|1972%20passing|1972 tests|1974\/1974|1974%20passing|1974 tests|1977\/1977|1977%20passing|1977 tests/);
    assert.doesNotMatch(body, /1721\/1721|1721%20passing|1721 tests|1726\/1726|1726%20passing|1726 tests|1729\/1729|1729%20passing|1729 tests|1741\/1741|1741%20passing|1741 tests|1742\/1742|1742%20passing|1742 tests|1746\/1746|1746%20passing|1746 tests|1749\/1749|1749%20passing|1749 tests|1752\/1752|1752%20passing|1752 tests|1755\/1755|1755%20passing|1755 tests|1756\/1756|1756%20passing|1756 tests|1758\/1758|1758%20passing|1758 tests|1759\/1759|1759%20passing|1759 tests|1760\/1760|1760%20passing|1760 tests|1761\/1761|1761%20passing|1761 tests|1762\/1762|1762%20passing|1762 tests|1763\/1763|1763%20passing|1763 tests|1764\/1764|1764%20passing|1764 tests|1766\/1766|1766%20passing|1766 tests|1769\/1769|1769%20passing|1769 tests|1772\/1772|1772%20passing|1772 tests|1775\/1775|1775%20passing|1775 tests|1788\/1788|1788%20passing|1788 tests|1797\/1797|1797%20passing|1797 tests/);
    assert.doesNotMatch(body, /1279\/1279|1279\+|1279%20passing|1547\+/);
    assert.doesNotMatch(body, /1719\/1719|1719%20passing|1719 tests/);
    assert.doesNotMatch(
      body,
      /1552\/1552|1552%20passing|1554\/1554|1554%20passing|1557\/1557|1557%20passing|1558\/1558|1558%20passing|1559\/1559|1559%20passing|1560\/1560|1560%20passing|1561\/1561|1561%20passing|1564\/1564|1564%20passing|1565\/1565|1565%20passing|1566\/1566|1566%20passing|1567\/1567|1567%20passing|1568\/1568|1568%20passing|1569\/1569|1569%20passing|1572\/1572|1577\/1577|1579\/1579|1580\/1580|1581\/1581|1581%20passing|1581 tests|1591\/1591|1591%20passing|1591 tests|1600\/1600|1600%20passing|1600 tests|1602\/1602|1602%20passing|1602 tests|1604\/1604|1604%20passing|1604 tests|1605\/1605|1605%20passing|1605 tests|1606\/1606|1606%20passing|1606 tests|1611\/1611|1611%20passing|1611 tests|1612\/1612|1612%20passing|1612 tests|1613\/1613|1613%20passing|1613 tests|1614\/1614|1614%20passing|1614 tests|1615\/1615|1615%20passing|1615 tests|1616\/1616|1616%20passing|1616 tests|1623\/1623|1623%20passing|1623 tests|1625\/1625|1625%20passing|1625 tests|1627\/1627|1627%20passing|1627 tests|1629\/1629|1629%20passing|1629 tests|1630\/1630|1630%20passing|1630 tests|1632\/1632|1632%20passing|1632 tests|1633\/1633|1633%20passing|1633 tests|1634\/1634|1634%20passing|1634 tests|1637\/1637|1637%20passing|1637 tests|1638\/1638|1638%20passing|1638 tests|1639\/1639|1639%20passing|1639 tests|1642\/1642|1642%20passing|1642 tests|1645\/1645|1645%20passing|1645 tests|1646\/1646|1646%20passing|1646 tests|1647\/1647|1647%20passing|1647 tests|1648\/1648|1648%20passing|1648 tests|1649\/1649|1649%20passing|1649 tests|1650\/1650|1650%20passing|1650 tests|1651\/1651|1651%20passing|1651 tests|1652\/1652|1652%20passing|1652 tests|1654\/1654|1654%20passing|1654 tests|1656\/1656|1656%20passing|1656 tests|1657\/1657|1657%20passing|1657 tests|1659\/1659|1659%20passing|1659 tests|1660\/1660|1660%20passing|1660 tests|1661\/1661|1661%20passing|1661 tests|1662\/1662|1662%20passing|1662 tests|1663\/1663|1663%20passing|1663 tests|1664\/1664|1664%20passing|1664 tests|1665\/1665|1665%20passing|1665 tests|1666\/1666|1666%20passing|1666 tests|1667\/1667|1667%20passing|1667 tests|1668\/1668|1668%20passing|1668 tests|1669\/1669|1669%20passing|1669 tests|1670\/1670|1670%20passing|1670 tests|1671\/1671|1671%20passing|1671 tests|1672\/1672|1672%20passing|1672 tests|1673\/1673|1673%20passing|1673 tests|1674\/1674|1674%20passing|1674 tests|1675\/1675|1675%20passing|1675 tests|1676\/1676|1676%20passing|1676 tests|1681\/1681|1681%20passing|1681 tests|1684\/1684|1684%20passing|1684 tests|1685\/1685|1685%20passing|1685 tests|1687\/1687|1687%20passing|1687 tests|1688\/1688|1688%20passing|1688 tests|1692\/1692|1692%20passing|1692 tests|1696\/1696|1696%20passing|1696 tests|1697\/1697|1697%20passing|1697 tests|1698\/1698|1698%20passing|1698 tests|1703\/1703|1703%20passing|1703 tests|1704\/1704|1704%20passing|1704 tests|1705\/1705|1705%20passing|1705 tests|1706\/1706|1706%20passing|1706 tests|1711\/1711|1711%20passing|1711 tests|1715\/1715|1715%20passing|1715 tests|1718\/1718|1718%20passing|1718 tests/,
    );
    assert.doesNotMatch(body, /\[\[hooks\.agent\]\]/);
    assert.match(body, /\[\[hooks\.PreToolUse\]\]|\[mcp_servers\.playwright\]/);
    assert.match(body, /Codex CLI[\s\S]{0,320}(prompt-level|sequential|프롬프트|순차)/i);
    assert.match(body, /--max-runtime-sec/);
    assert.match(body, /--max-iter=0[\s\S]{0,180}(unlimited|무제한)/i);
    assert.doesNotMatch(body, /server 50|서버 50|hard cap 50|clamped to 50/i);
    assert.match(body, /scripts\/release-smoke\.sh --fast/);
    assert.match(body, /scripts\/release-smoke\.sh --fast --with-live-cli/);
    assert.match(body, /with-live-cli[\s\S]{0,260}(Claude plugin marketplace\/install|Claude plugin marketplace\/install 명령 표면)/i);
    assert.match(body, /harness-builder[\s\S]{0,120}v0\.7\.4/i);
    assert.match(body, /harness-floor[\s\S]{0,120}v0\.7\.4/i);
    assert.match(body, /(other 17 installable|나머지 설치 가능한)[\s\S]{0,180}v0\.7\.4/i);
    assert.doesNotMatch(body, /other Claude Code core plugins at `v0\.2\.0`|나머지 Claude Code 코어 플러그인 `v0\.2\.0`/i);
    assert.match(body, /\/thrift` compact (delivery|전달)[\s\S]{0,220}API-gated advisory path/i);
    assert.match(body, /Provider-backed thrift summarizer/i);
    assert.match(body, /@anthropic-ai\/sdk[\s\S]{0,220}(implemented and tested|구현\/테스트 완료)/i);
    assert.match(body, /Codex[\s\S]{0,260}(dependency-free heuristic summarizer|dependency-free heuristic summarizer)/i);
    assert.doesNotMatch(body, /Anthropic\/OpenAI\/Vertex SDK (?:hookup|연결)[\s\S]{0,120}(?:deferred|연기)|Currently mock toolCallers|현재 mock toolCaller/i);
    assert.doesNotMatch(body, /Real Anthropic\/OpenAI\/Vertex SDK hookups \(replace mock toolCallers\)|실제 Anthropic\/OpenAI\/Vertex SDK 연결 \(mock toolCaller 대체\)/i);
    assert.match(body, /(Release Candidate Lifecycle|릴리즈 후보 라이프사이클)/i);
    assert.match(body, /clean worktree[\s\S]{0,220}git rev-parse HEAD/i);
    assert.match(body, /README\/README\.ko Versioning[\s\S]{0,220}CHANGELOG\.md\/CHANGELOG\.ko\.md/i);
    assert.match(body, /release-smoke\.sh --fast --with-live-cli[\s\S]{0,240}(claude`\/`codex` versions|`claude`\/`codex` 버전)/i);
    assert.match(body, /date-stamped[\s\S]{0,160}verified SHA/i);
    assert.match(body, /(Rollback|rollback)[\s\S]{0,220}(previous verified tag\/SHA|이전 verified tag\/SHA)[\s\S]{0,220}doctor/i);
    assert.match(body, /scripts\/release-audit\.mjs/);
    assert.match(body, /scripts\/github-governance-check\.mjs/);
    assert.match(body, /scripts\/docs-structure-check\.mjs/);
    assert.match(body, /scripts\/release-provenance\.mjs --release=/);
    assert.match(body, /scripts\/release-fixture-smoke\.mjs/);
    assert.match(body, /scripts\/generate-support-matrix\.mjs --check/);
    assert.match(
      body,
      /(?:harness-builder\/bin\/doctor\.mjs[\s\S]{0,360}--platform=claude[\s\S]{0,520}harness-builder-codex\/bin\/doctor\.mjs[\s\S]{0,360}--platform=codex|scripts\/doctor\.mjs[\s\S]{0,360}--platform=claude\|codex|doctor[\s\S]{0,360}(Claude\/Codex|project-local) scaffold)/i,
    );
    assert.match(body, /doctor[\s\S]{0,320}(operational, builder, lite, or Codex debug|operational\/builder\/lite 또는 Codex debug)/i);
    assert.match(body, /install-platform\.sh[\s\S]{0,360}--platform=claude[\s\S]{0,180}--theme=builder/);
    assert.match(body, /install-platform\.sh[\s\S]{0,360}--platform=codex[\s\S]{0,180}--lite/);
    assert.doesNotMatch(body, /stable--cli--verification--pending|CLI verification pending|CLI 검증 대기|Sandbox lacks Codex|Sandbox에 Codex/);
  }
});

test("readme files describe release-safe update and per-platform install paths", () => {
  const english = read("README.md");
  assert.match(english, /scripts\/update\.sh[\s\S]{0,420}force-updates already-installed selected plugins/i);
  assert.match(english, /scripts\/update\.sh --foundations[\s\S]{0,360}superpowers[\s\S]{0,180}context-mode/i);
  assert.match(english, /scripts\/update\.sh --foundations-only[\s\S]{0,260}approved foundation plugins/i);
  assert.match(english, /install-all\.sh --foundations[\s\S]{0,320}superpowers[\s\S]{0,180}context-mode/i);
  assert.match(english, /--foundations-only[\s\S]{0,260}bootstrap just the foundations/i);
  assert.match(english, /--cli=cursor\|copilot\|codex\|gemini/);
  assert.match(english, /operational installs[\s\S]{0,520}auto-updates[\s\S]{0,360}approved foundation plugins/i);
  assert.match(english, /Lite installs skip[\s\S]{0,260}automatic foundation update[\s\S]{0,260}--update-foundations/i);
  assert.match(english, /degraded foundation warning/i);
  assert.match(english, /approved foundation update fails/i);
  assert.match(english, /--update-foundations[\s\S]{0,220}strict/i);
  assert.match(english, /--no-update-foundations[\s\S]{0,180}opt out/i);
  assert.match(english, /install-platform\.sh[\s\S]{0,520}--platform=codex[\s\S]{0,220}--theme=debug/i);
  assert.match(english, /\.codex\/skills\/debug[\s\S]{0,260}\.agent-skill\/reports\/debug/i);
  assert.match(english, /run \/debug[\s\S]{0,180}failing command/i);
  assert.match(english, /Codex `all`, `builder`, `--lite`, and Codex `--theme=debug` installs run the post-install doctor automatically/i);
  assert.match(english, /--no-doctor[\s\S]{0,120}deferring validation/i);
  assert.match(english, /doctor\.mjs[\s\S]{0,360}project-local(?: Claude\/Codex)? scaffold[\s\S]{0,260}non-zero exit/i);
  assert.match(english, /install-platform\.sh[\s\S]{0,420}does not patch global CLI config files/i);
  assert.match(english, /Copilot CLI[\s\S]{0,360}(prompt-level|optional hook helper|manual hook review)/i);
  assert.doesNotMatch(english, /target CLI installed.*config dir writable/i);
  assert.doesNotMatch(english, /Hooks integrate with `gh copilot`|Copilot CLI get Task-level hard enforcement/i);

  const korean = read("README.ko.md");
  assert.match(korean, /scripts\/update\.sh[\s\S]{0,520}이미 설치된 선택 플러그인을 강제 업데이트/i);
  assert.match(korean, /scripts\/update\.sh --foundations[\s\S]{0,460}superpowers[\s\S]{0,220}context-mode/i);
  assert.match(korean, /scripts\/update\.sh --foundations-only[\s\S]{0,320}approved foundation plugins|승인된 foundation 플러그인/i);
  assert.match(korean, /install-all\.sh --foundations[\s\S]{0,420}superpowers[\s\S]{0,220}context-mode/i);
  assert.match(korean, /--foundations-only[\s\S]{0,320}foundation만 부트스트랩/i);
  assert.match(korean, /--cli=cursor\|copilot\|codex\|gemini/);
  assert.match(korean, /operational 설치[\s\S]{0,620}자동 갱신[\s\S]{0,300}foundation/i);
  assert.match(korean, /Lite 설치[\s\S]{0,320}자동 foundation 갱신[\s\S]{0,320}--lite --update-foundations/i);
  assert.match(korean, /degraded foundation 경고/i);
  assert.match(korean, /foundation 갱신이 실패하면/i);
  assert.match(korean, /--update-foundations[\s\S]{0,260}strict/i);
  assert.match(korean, /--no-update-foundations[\s\S]{0,220}opt-out/i);
  assert.match(korean, /install-platform\.sh[\s\S]{0,620}--platform=codex[\s\S]{0,260}--theme=debug/i);
  assert.match(korean, /\.codex\/skills\/debug[\s\S]{0,300}\.agent-skill\/reports\/debug/i);
  assert.match(korean, /run \/debug[\s\S]{0,220}failing command/i);
  assert.match(korean, /Codex `all`, `builder`, `--lite`, 그리고 Codex `--theme=debug` 설치는 post-install doctor를 자동 실행/i);
  assert.match(korean, /검증을 의도적으로 미룰[\s\S]{0,160}--no-doctor/i);
  assert.match(korean, /doctor\.mjs[\s\S]{0,420}project-local(?: Claude\/Codex)? scaffold[\s\S]{0,320}non-zero exit/i);
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

    const uninstallBlock = body.match(/Uninstall per platform[\s\S]{0,1600}|플랫폼별 제거[\s\S]{0,1600}/);
    assert.ok(uninstallBlock, `${path} must document per-platform uninstall`);
    assert.match(uninstallBlock[0], /^\.\/scripts\/install-platform\.sh --platform=claude --target=\/path\/to\/project --uninstall$/m);
    assert.match(uninstallBlock[0], /^\.\/scripts\/install-platform\.sh --platform=claude --target=\/path\/to\/project --uninstall --force-root-clean$/m);
    assert.match(uninstallBlock[0], /^\.\/scripts\/install-platform\.sh --platform=codex --target=\/path\/to\/project --uninstall$/m);
    assert.match(uninstallBlock[0], /^\.\/scripts\/install-platform\.sh --platform=codex --target=\/path\/to\/project --uninstall --force-root-clean$/m);
    assert.match(uninstallBlock[0], /harness-builder(?:-codex)?\/bin\/clean\.mjs/);
    assert.doesNotMatch(uninstallBlock[0], /\.visual-qa\.json \+ \.agent-all\.json \+ \.thrift\.json \(all platforms\)|\(모든 플랫폼\)/);
    assert.doesNotMatch(uninstallBlock[0], /future `install-platform\.sh --uninstall`|향후 `install-platform\.sh --uninstall`/i);
  }
});

test("platform plugin READMEs match implemented builder and floor ports", () => {
  const builder = read("plugins/harness-builder-codex/README.md");
  assert.match(builder, /operational/i);
  assert.match(builder, /--lite/);
  assert.match(builder, /--theme=debug/);
  assert.match(builder, /AGENTS\.md/);
  assert.match(builder, /agent-policy-hook\.mjs/);
  assert.match(builder, /--theme=debug[\s\S]{0,160}post-install doctor/i);
  assert.match(builder, /--profile=debug/);
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
  assert.match(floor, /agent-all/);
  assert.match(floor, /visual-qa/);
  assert.match(floor, /\.codex\/skills\/agent-all/);
  assert.match(floor, /\.codex\/skills\/visual-qa/);
  assert.doesNotMatch(floor, /\[\[hooks\.agent\]\]|scaffold-only|future per-platform spec/i);

  const thrift = read("plugins/harness-thrift-codex/README.md");
  assert.match(thrift, /Codex CLI/i);
  assert.match(thrift, /~\/\.codex\/config\.toml/);
  assert.match(thrift, /--no-instrument/);
  assert.match(thrift, /run \/thrift\s+# one-time setup/);
  assert.match(thrift, /run \/thrift summarise/);
  assert.match(thrift, /run \/thrift audit/);
  assert.doesNotMatch(thrift, /^\/thrift\s+#/m);
  assert.doesNotMatch(thrift, /codex plugins install/i);
  assert.doesNotMatch(thrift, /MVP scope|follow-up plan|scaffold-only|TBD|placeholder/i);

  const debug = read("plugins/harness-debug-codex/README.md");
  assert.match(debug, /Codex CLI/i);
  assert.match(debug, /run \/debug/);
  assert.match(debug, /debug/);
  assert.match(debug, /install-platform\.sh --platform=codex --target=\/path\/to\/project --theme=debug/);
  assert.match(debug, /\.codex\/skills\/debug/);
  assert.match(debug, /\.debug-state\.json/);
  assert.match(debug, /structured error parsing/i);
  assert.doesNotMatch(debug, /codex plugins install/i);
  assert.doesNotMatch(debug, /Claude Code debug surface|scaffold-only|TBD|placeholder/i);
});

test("non-Claude floor plugin READMEs match the implemented install and workflow surfaces", () => {
  const staleFloorClaims =
    /Scaffold-level|MVP scope|scaffold-only|future per-platform spec|future spec|copilot plugin install|gemini extensions install/i;

  const cases = [
    {
      path: "plugins/harness-floor-copilot/README.md",
      platform: "copilot",
      required: [
        /Operational floor support/i,
        /install-platform\.sh --platform=copilot --theme=floor --target=\/path\/to\/project/,
        /\/agent-all/,
        /\/visual-qa/,
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
        /\/agent-all/,
        /\/visual-qa/,
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
        /\/agent-all/,
        /\/visual-qa/,
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
    "plugins/harness-floor-codex/skills/visual-qa-codex/lib/sequential-dispatch.mjs",
  ];
  const bodies = files.map((path) => read(path));

  for (const body of bodies) {
    assert.doesNotMatch(body, /TODO: requires live Codex CLI|TODO verify on live CLI/i);
  }
  assert.match(bodies[0], /Codex CLI 0\.135\.0[\s\S]{0,240}positional prompt/);
  assert.match(bodies[1], /Codex CLI 0\.135\.0[\s\S]{0,240}positional prompt/);
});

test("Codex runtime specs describe the current sequential surface instead of stale agent hooks", () => {
  const runtimeChecklist = read("docs/superpowers/specs/2026-05-18-cli-runtime-verification-checklist.md");
  assert.match(runtimeChecklist, /release-smoke\.sh --fast --with-live-cli/);
  assert.match(runtimeChecklist, /Claude plugin marketplace\/install/i);
  assert.match(runtimeChecklist, /release fixture smoke[\s\S]{0,260}installed fixture[\s\S]{0,260}sequential \/agent-all prompt helper/i);
  assert.match(runtimeChecklist, /stack-specific Codex sequential role dispatch proof/i);
  assert.match(runtimeChecklist, /frontend-dev\/backend-dev role-skill inlining/i);
  assert.match(runtimeChecklist, /release fixture smoke[\s\S]{0,360}installed fixture[\s\S]{0,360}sequential \/visual-qa page helper/i);
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
  assert.match(agentAllSpec, /release fixture smoke[\s\S]{0,260}installed fixture[\s\S]{0,260}sequential \/agent-all prompt helper/i);

  const visualQaSpec = read("docs/superpowers/specs/2026-05-18-visual-qa-codex-impl-spec.md");
  assert.match(visualQaSpec, /release fixture smoke[\s\S]{0,360}installed fixture[\s\S]{0,360}sequential \/visual-qa page helper/i);

  for (const path of [
    "docs/superpowers/specs/2026-05-21-decision-surfacing-and-policy-hooks-design.md",
    "docs/superpowers/specs/2026-05-21-decision-surfacing-and-policy-hooks-design.ko.md",
  ]) {
    const body = read(path);
    assert.doesNotMatch(body, /\[\[hooks\.agent\]\]/);
    assert.doesNotMatch(body, /1246\/1246|1279\/1279|1645\/1645|1646\/1646|1647\/1647|1648\/1648|1649\/1649|1650\/1650|1651\/1651|1652\/1652|1654\/1654|1656\/1656|1657\/1657|1659\/1659|1660\/1660|1661\/1661|1662\/1662|1663\/1663|1664\/1664|1665\/1665|1666\/1666|1667\/1667|1668\/1668|1669\/1669|1670\/1670|1671\/1671|1672\/1672|1673\/1673|1674\/1674|1675\/1675|1676\/1676|1681\/1681|1684\/1684|1685\/1685|1687\/1687|1688\/1688|1692\/1692|1696\/1696|1697\/1697|1698\/1698|1703\/1703|1704\/1704|1705\/1705|1706\/1706|1711\/1711|1715\/1715|1716\/1716|1718\/1718/);
    assert.doesNotMatch(body, /1719\/1719|1721\/1721/);
    assert.doesNotMatch(body, /1726\/1726|1729\/1729|1741\/1741|1742\/1742|1746\/1746|1749\/1749|1752\/1752|1755\/1755|1756\/1756|1758\/1758|1759\/1759|1760\/1760|1761\/1761|1762\/1762|1763\/1763|1764\/1764|1766\/1766|1769\/1769|1772\/1772|1775\/1775|1788\/1788|1797\/1797/);
    assert.match(body, /1999\/1999/);
    assert.doesNotMatch(body, /1991\/1991/);
    assert.doesNotMatch(body, /1871\/1871|1974\/1974|1977\/1977/);
    assert.match(body, /Codex CLI[\s\S]{0,260}(PreToolUse|prompt-level|sequential|프롬프트|순차)/i);
  }

  const policyHookEngine = read("docs/superpowers/specs/2026-06-11-policy-hook-engine.md");
  assert.match(policyHookEngine, /BeforeLoopIteration[\s\S]{0,120}AfterBreakCondition/);
  assert.match(policyHookEngine, /BeforeVerification[\s\S]{0,80}AfterVerification/);
  assert.match(policyHookEngine, /agent-policy-result\/v1[\s\S]{0,220}rewrite_prompt/);
  assert.match(policyHookEngine, /policy-log\.jsonl/);
  assert.match(policyHookEngine, /Cursor, Copilot, Gemini[\s\S]{0,120}soft warnings\/logs/);
});

test("operational hardening docs record implemented release-audited status", () => {
  const plan = read("docs/superpowers/plans/2026-06-01-operational-agent-init-agent-all-hardening.md");
  assert.match(plan, /## Implementation Status/i);
  assert.match(plan, /Implemented through Task 12/i);
  assert.match(plan, /root role routing/i);
  assert.match(plan, /release-smoke\.sh` gate contract/i);
  assert.match(plan, /public CLI script executable\/shebang packaging/i);
  assert.match(plan, /generated hook\/task-checker executable packaging/i);
  assert.match(plan, /Claude\/Codex QA and base\/specialized reviewer audit-token contracts/i);
  assert.match(plan, /Claude 83\/83 and Codex 76\/76 readiness checks passing/i);
  assert.match(plan, /public PR CI and local release gate/i);
  assert.match(plan, /release publish preflight/i);
  assert.match(plan, /target project smoke/i);
  assert.match(plan, /Claude companion root guidance/i);
  assert.match(plan, /Codex thrift advisory summariser contract/i);
  assert.match(plan, /doctor recovery guidance/i);
  assert.match(plan, /Codex floor-conditional language guidance/i);
  assert.match(plan, /Enterprise Django\/Vue monorepo routing/i);
  assert.match(plan, /release-fixture smoke proves/i);
  assert.match(plan, /complete persona foundation\/orchestration matrix/i);
  assert.match(plan, /every operational and builder-heavy Claude agent and Codex skill/i);
  assert.match(plan, /Claude\/Codex operational and builder-heavy complete persona foundation\/orchestration matrix checks/i);
  assert.match(plan, /release-fixture evidence[\s\S]{0,160}auto-update only approved `superpowers`\/`context-mode` foundations/i);
  assert.match(plan, /Claude\/Codex approved foundation auto-update fixtures/i);
  assert.match(plan, /release candidate lifecycle/i);
  assert.match(plan, /node --test[\s\S]{0,120}2026\/2026/);
  assert.match(plan, /release-smoke\.sh --fast --with-live-cli[\s\S]{0,120}498\/498/);
  assert.doesNotMatch(plan, /1746\/1746|1749\/1749|1752\/1752|1755\/1755|1756\/1756|1758\/1758|1759\/1759|1760\/1760|1761\/1761|1762\/1762|1763\/1763|1764\/1764|1766\/1766|1972\/1972|1974\/1974|1977\/1977|2011\/2011|2021\/2021|2025\/2025|412\/412|418\/418|421\/421|424\/424|425\/425|427\/427|428\/428|429\/429|430\/430|431\/431|432\/432|433\/433|435\/435|468\/468|480\/480|483\/483|493\/493|497\/497|500\/500/);
  assert.match(plan, /foundation auto-update/i);
  assert.match(plan, /install-platform\.sh --platform=codex --theme=all\|debug/);
  assert.match(plan, /Claude\/Codex `install-platform\.sh --uninstall` release-fixture roundtrips/i);
  assert.match(plan, /--force-root-clean[\s\S]{0,120}release-fixture coverage/i);
  assert.match(plan, /install-platform\.sh --platform=claude` operational\/builder\/lite project bootstrap release-fixture coverage/i);
  assert.match(plan, /Codex operational\/default-heavy, builder, and lite post-install doctor evidence/i);
  assert.match(plan, /Codex floor\/thrift single-theme release fixtures/i);
  assert.match(plan, /post-install doctor coverage/i);
  assert.match(plan, /release-audit\.mjs/);
  assert.match(plan, /release-fixture-smoke\.mjs/);
  assert.match(plan, /historical TDD checklist/i);

  const spec = read("docs/superpowers/specs/2026-06-01-operational-agent-init-agent-all-design.md");
  assert.match(spec, /\*\*Status:\*\* Implemented and release-audited/i);
  assert.doesNotMatch(spec, /pending written-spec review/i);

  const changelog = read("CHANGELOG.md");
  assert.equal((changelog.match(/^## Unreleased$/gm) || []).length, 1);
  assert.doesNotMatch(changelog, /^## \[Unreleased\]$/m);
  assert.match(changelog, /## Agent-skill v0\.6\.13[\s\S]{0,700}2011\/2011 passing/);
  assert.match(changelog, /## Agent-skill v0\.6\.13[\s\S]{0,700}483\/483 passing/);
  assert.match(changelog, /User Objective Release Matrix/);
  assert.match(changelog, /Release Candidate Lifecycle/);
  assert.match(changelog, /Agent-skill v0\.6\.8[\s\S]{0,900}2001\/2001 passing/);
  assert.match(changelog, /Agent-skill v0\.6\.8[\s\S]{0,900}473\/473 passing/);
  assert.doesNotMatch(changelog, /currently\s+mock toolCallers used in tests/i);

  const changelogKo = read("CHANGELOG.ko.md");
  assert.equal((changelogKo.match(/^## 미출시$/gm) || []).length, 1);
  assert.doesNotMatch(changelogKo, /^## \[미출시\]$/m);
  assert.match(changelogKo, /## Agent-skill v0\.6\.13[\s\S]{0,700}2011\/2011 통과/);
  assert.match(changelogKo, /## Agent-skill v0\.6\.13[\s\S]{0,700}483\/483 통과/);
  assert.match(changelogKo, /User Objective Release Matrix/);
  assert.match(changelogKo, /Release Candidate Lifecycle/);
  assert.match(changelogKo, /Agent-skill v0\.6\.8[\s\S]{0,900}2001\/2001 통과/);
  assert.match(changelogKo, /Agent-skill v0\.6\.8[\s\S]{0,900}473\/473 통과/);
  assert.doesNotMatch(changelogKo, /현재 mock[\s\S]{0,80}toolCaller/i);
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
  assert.match(body, /User Objective Release Matrix/i);
  assert.match(body, /Claude \+ Codex ship together/i);
  assert.match(body, /Heavy operational default, lite opt-out/i);
  assert.match(body, /Approved foundation auto-update[\s\S]{0,220}superpowers`\/`context-mode/i);
  assert.match(body, /Superpowers\/context-mode activation[\s\S]{0,260}superpowers:\*/i);
  assert.match(body, /Persona segmentation[\s\S]{0,260}orchestrator[\s\S]{0,180}frontend-dev[\s\S]{0,180}backend-dev/i);
  assert.match(body, /Orchestration gates[\s\S]{0,280}ORCHESTRATION_AUDIT[\s\S]{0,180}QA_AUDIT[\s\S]{0,180}VERIFICATION_AUDIT/i);
  assert.match(body, /Enterprise Django\/Vue routing[\s\S]{0,280}Django\/Vue monorepo routing/i);
  assert.match(body, /Codex current-CLI parity[\s\S]{0,280}prompt-level\/sequential floor/i);
  assert.match(body, /Doctor, recovery, and cleanup[\s\S]{0,280}install→uninstall roundtrips/i);
  assert.match(body, /No HOME\/global config mutation[\s\S]{0,280}do not patch HOME\/global CLI config files/i);
  assert.match(body, /Deployable release gate[\s\S]{0,520}github-governance-check\.mjs[\s\S]{0,520}release-smoke\.sh --fast --with-live-cli[\s\S]{0,520}node scripts\/sync-lib\.mjs --check[\s\S]{0,220}generate-support-matrix\.mjs --check/i);
  assert.match(body, /Release Candidate Lifecycle/i);
  assert.match(body, /clean worktree[\s\S]{0,220}git rev-parse HEAD/i);
  assert.match(body, /plugin[\s\S]{0,80}manifests[\s\S]{0,220}\.claude-plugin\/marketplace\.json/i);
  assert.match(body, /README\/README\.ko Versioning[\s\S]{0,180}CHANGELOG\.md\/CHANGELOG\.ko\.md/i);
  assert.match(body, /no stale deferred\/mock[\s\S]{0,120}release wording/i);
  assert.match(body, /release-smoke\.sh --fast --with-live-cli[\s\S]{0,260}`claude`\/`codex` versions/i);
  assert.match(body, /date-stamped release-candidate tag[\s\S]{0,180}verified SHA/i);
  assert.match(body, /Roll back only to a previous verified tag\/SHA[\s\S]{0,280}install-platform\.sh --uninstall[\s\S]{0,240}doctor after rollback/i);
  assert.match(body, /release-audit\.mjs/);
  assert.match(body, /github-governance-check\.mjs/);
  assert.match(body, /docs-structure-check\.mjs/);
  assert.match(body, /release-provenance\.mjs --release=/);
  assert.match(body, /Release provenance coverage[\s\S]{0,260}release-manifest\.json[\s\S]{0,220}plugin directory checksums/i);
  assert.match(body, /release-fixture-smoke\.mjs/);
  assert.match(body, /Release smoke gate coverage[\s\S]{0,220}live Claude plugin marketplace\/install and Codex exec probes[\s\S]{0,220}focused release contracts/i);
  assert.match(body, /Public CLI packaging coverage[\s\S]{0,160}shebangs[\s\S]{0,160}executable bits/i);
  assert.match(body, /release-command-surface\.test\.mjs/);
  assert.match(body, /agent-init-dry-run-contract\.test\.mjs/);
  assert.match(body, /doctor-script\.test\.mjs/);
  assert.match(body, /release-smoke\.sh --fast --with-live-cli/);
  assert.match(body, /Claude slash-command metadata, headings, flags, and summary contracts/i);
  assert.match(body, /Codex slash-command metadata, headings, flags, and summary contracts[\s\S]{0,160}\/debug/i);
  assert.match(body, /node --test[\s\S]{0,480}claude-native-release-contract\.test\.mjs/);
  assert.match(body, /node --test[\s\S]{0,480}release-install-scripts\.test\.mjs/);
  assert.match(body, /Codex install renderers[\s\S]{0,180}builder, floor, thrift/i);
  assert.match(body, /Fresh release fixture coverage[\s\S]{0,240}Claude terminal `install-platform\.sh --platform=claude` operational\/builder\/lite installs/i);
  assert.match(body, /Fresh release fixture coverage[\s\S]{0,320}Codex operational\/lite\/builder\/floor\/thrift\/debug installs/i);
  assert.match(body, /Fresh release fixture coverage[\s\S]{0,360}Claude\/Codex install→uninstall roundtrips/i);
  assert.match(body, /Doctor coverage[\s\S]{0,260}Codex debug-only scaffolds/i);
  assert.match(body, /Phase 5 post-install doctor ordering[\s\S]{0,160}bootstrap commit/i);
  assert.match(body, /Claude Code live session/i);
  assert.match(body, /Codex CLI live session/i);
  assert.match(body, /\/agent-init --lite/);
  assert.match(body, /\/agent-init --lite/);
  assert.match(body, /run \/agent-all for "smoke task"/);
  assert.match(body, /run \/visual-qa for the configured project/);
  assert.match(body, /run \/debug "failing command"/);
  assert.match(body, /^run \/thrift$/m);
  assert.match(body, /run \/thrift summarise/);
  assert.match(body, /run \/thrift audit/);
  assert.doesNotMatch(body, /\/agent-all "smoke task"|codex exec "smoke task"|codex skill run/i);
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
  assert.match(body, /Claude\/Codex install→uninstall roundtrips/i);
  assert.match(body, /Codex builder\/floor\/thrift\/debug git fixtures/i);
  assert.match(body, /operational, lite, builder, floor, thrift, and debug profiles/i);
  assert.match(body, /release-smoke\.sh --fast --with-live-cli/);
  assert.match(body, /Claude CLI live probe[\s\S]{0,160}plugin marketplace\/install command surfaces/i);
  assert.match(body, /Codex CLI live probe[\s\S]{0,160}codex exec \[OPTIONS\] \[PROMPT\]/i);
  assert.match(body, /run \/agent-all for "smoke task"/);
  assert.match(body, /run \/visual-qa for the configured project/);
  assert.match(body, /Run `run \/thrift`, `run \/thrift summarise`, and `run \/thrift audit`/);
  assert.match(body, /run \/thrift summarise/);
  assert.match(body, /run \/thrift audit/);
  assert.doesNotMatch(body, /\/agent-all "smoke task"|\/visual-qa-codex|\/thrift-codex|codex skill run/i);
});
