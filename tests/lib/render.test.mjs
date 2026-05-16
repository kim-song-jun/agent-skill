import { test } from "node:test";
import assert from "node:assert/strict";
import { render } from "../../skills/harness-init/lib/render.mjs";

test("substitutes simple variables", () => {
  assert.equal(render("hello {{name}}", { name: "world" }), "hello world");
});

test("supports dotted paths", () => {
  assert.equal(render("{{user.email}}", { user: { email: "a@b" } }), "a@b");
});

test("renders #if block when truthy", () => {
  assert.equal(render("{{#if show}}yes{{/if}}", { show: true }), "yes");
});

test("skips #if block when falsy", () => {
  assert.equal(render("a{{#if show}}yes{{/if}}b", { show: false }), "ab");
});

test("renders #each block over arrays", () => {
  const out = render("{{#each items}}- {{this}}\n{{/each}}", { items: ["a", "b"] });
  assert.equal(out, "- a\n- b\n");
});

test("#each exposes @index", () => {
  const out = render("{{#each items}}{{@index}}:{{this}} {{/each}}", { items: ["x", "y"] });
  assert.equal(out, "0:x 1:y ");
});

test("missing variable renders as empty string", () => {
  assert.equal(render("hello {{name}}!", {}), "hello !");
});

test("ignores unknown helpers gracefully (passes through)", () => {
  assert.equal(render("{{#unknown}}x{{/unknown}}", {}), "{{#unknown}}x{{/unknown}}");
});

test("#each over objects exposes properties as variables", () => {
  const out = render(
    "{{#each agents}}- {{name}} ({{role}})\n{{/each}}",
    { agents: [{ name: "planner", role: "plan" }, { name: "dev", role: "code" }] }
  );
  assert.equal(out, "- planner (plan)\n- dev (code)\n");
});

test("#each primitives still work via {{this}}", () => {
  const out = render("{{#each items}}{{this}} {{/each}}", { items: ["a", "b"] });
  assert.equal(out, "a b ");
});
