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
  }
});

test("readme files describe the current Codex config surface and current test count", () => {
  for (const path of ["README.md", "README.ko.md"]) {
    const body = read(path);
    assert.match(body, /1558\/1558/);
    assert.doesNotMatch(body, /1279\/1279|1279\+|1279%20passing/);
    assert.doesNotMatch(body, /1552\/1552|1552%20passing|1554\/1554|1554%20passing|1557\/1557|1557%20passing/);
    assert.doesNotMatch(body, /\[\[hooks\.agent\]\]/);
    assert.match(body, /\[\[hooks\.PreToolUse\]\]|\[mcp_servers\.playwright\]/);
    assert.match(body, /Codex CLI[\s\S]{0,320}(prompt-level|sequential|프롬프트|순차)/i);
  }
});

test("readme files describe release-safe update and per-platform install paths", () => {
  const english = read("README.md");
  assert.match(english, /scripts\/update\.sh[\s\S]{0,420}force-updates already-installed selected plugins/i);
  assert.match(english, /--cli=cursor\|copilot\|codex\|gemini/);
  assert.match(english, /install-platform\.sh[\s\S]{0,420}does not patch global CLI config files/i);
  assert.doesNotMatch(english, /target CLI installed.*config dir writable/i);

  const korean = read("README.ko.md");
  assert.match(korean, /scripts\/update\.sh[\s\S]{0,520}이미 설치된 선택 플러그인을 강제 업데이트/i);
  assert.match(korean, /--cli=cursor\|copilot\|codex\|gemini/);
  assert.match(korean, /install-platform\.sh[\s\S]{0,520}전역 CLI config 파일을 패치하지 않음/i);
  assert.doesNotMatch(korean, /config dir writable/i);
});

test("Codex plugin READMEs match the implemented operational and sequential floor ports", () => {
  const builder = read("plugins/harness-builder-codex/README.md");
  assert.match(builder, /operational/i);
  assert.match(builder, /--lite/);
  assert.match(builder, /AGENTS\.md/);
  assert.match(builder, /agent-policy-hook\.mjs/);
  assert.doesNotMatch(builder, /MVP|follow-ups|best-effort instruction/i);

  const floor = read("plugins/harness-floor-codex/README.md");
  assert.match(floor, /sequential/i);
  assert.match(floor, /agent-all-codex/);
  assert.match(floor, /visual-qa-codex/);
  assert.doesNotMatch(floor, /\[\[hooks\.agent\]\]|scaffold-only|future per-platform spec/i);

  const thrift = read("plugins/harness-thrift-codex/README.md");
  assert.match(thrift, /Codex CLI/i);
  assert.match(thrift, /~\/\.codex\/config\.toml/);
  assert.match(thrift, /--no-instrument/);
  assert.doesNotMatch(thrift, /MVP scope|follow-up plan|scaffold-only|TBD|placeholder/i);
});
