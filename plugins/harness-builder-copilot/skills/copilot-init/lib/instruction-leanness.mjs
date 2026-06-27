// Advisory leanness check for layered instruction files (global ~/.claude/CLAUDE.md
// → project CLAUDE.md/AGENTS.md → per-folder guides). Pure + side-effect-free so
// doctor can fold the warnings into its advisory `warnings[]` channel. Three signals:
//   1. budget    — an instruction file over its line/char budget
//   2. duplicate — a rule restated across two layers (lower should not repeat higher)
//   3. orphan    — a harness-managed folder guide whose dir is no longer a guide target
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { detectGuideDirs } from "./folder-guides.mjs";
import { SENTINEL } from "./sentinel-merge.mjs";

export const DEFAULT_LEANNESS = {
  rootMaxLines: 400,
  rootMaxChars: 16000,
  guideMaxLines: 150,
  guideMaxChars: 6000,
  minRuleChars: 24,
};

const SKIP_DIRS = new Set([".git", ".claude", ".codex", "node_modules", "dist", "build", "coverage", ".agent-skill"]);
const WORKSPACE_CONTAINERS = new Set(["apps", "packages"]);
const GUIDE_FILES = ["CLAUDE.md", "AGENTS.md"];

function readIfExists(path) {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}

function isManaged(text) {
  return typeof text === "string" && text.includes(SENTINEL.start);
}

function countLines(text) {
  if (!text) return 0;
  const body = text.endsWith("\n") ? text.slice(0, -1) : text;
  return body.length === 0 ? 0 : body.split("\n").length;
}

// Normalize a line into a comparable "rule" key, or null if it is not rule-like.
function ruleKey(line, minRuleChars) {
  let s = line.trim();
  if (!s) return null;
  s = s.replace(/^([-*+]|\d+[.)]|>|#+)\s+/, "").trim();
  if (s.startsWith("```") || s.startsWith("|") || /^[-=|*_\s]+$/.test(s)) return null;
  const norm = s.toLowerCase().replace(/\s+/g, " ").trim();
  return norm.length < minRuleChars ? null : norm;
}

function ruleKeysOf(text, minRuleChars) {
  const keys = new Map();
  if (!text) return keys;
  for (const raw of text.split("\n")) {
    const key = ruleKey(raw, minRuleChars);
    if (key && !keys.has(key)) keys.set(key, raw.trim());
  }
  return keys;
}

function snippet(text, max = 60) {
  const s = text.replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

export function analyzeInstructionLeanness({ targetAbs, homeDir = null, config = {} } = {}) {
  const cfg = { ...DEFAULT_LEANNESS, ...(config?.leanness ?? {}) };
  const warnings = [];

  let guideDirs = [];
  try {
    guideDirs = detectGuideDirs(targetAbs);
  } catch {
    guideDirs = [];
  }
  const validGuideDirs = new Set(guideDirs.map((g) => g.path));

  // --- (1) budget ---
  const budgeted = [];
  for (const name of GUIDE_FILES) {
    const abs = join(targetAbs, name);
    if (existsSync(abs)) budgeted.push({ rel: name, abs, kind: "root" });
  }
  for (const g of guideDirs) {
    for (const name of GUIDE_FILES) {
      const abs = join(targetAbs, g.path, name);
      if (existsSync(abs)) budgeted.push({ rel: `${g.path}/${name}`, abs, kind: "guide" });
    }
  }
  for (const f of budgeted) {
    const text = readIfExists(f.abs);
    if (text == null) continue;
    const lines = countLines(text);
    const chars = text.length;
    const maxLines = f.kind === "root" ? cfg.rootMaxLines : cfg.guideMaxLines;
    const maxChars = f.kind === "root" ? cfg.rootMaxChars : cfg.guideMaxChars;
    if (lines > maxLines || chars > maxChars) {
      warnings.push({
        id: "leanness-budget",
        path: f.rel,
        message: `${f.rel} is ${lines} lines / ${chars} chars (budget ${maxLines} lines / ${maxChars} chars) — trim it or move detail into folder guides / the wiki`,
      });
    }
  }

  // --- (2) cross-layer duplicate rules ---
  const layers = [];
  if (homeDir) {
    const globalText = readIfExists(join(homeDir, ".claude", "CLAUDE.md"));
    if (globalText) layers.push({ name: "global ~/.claude/CLAUDE.md", keys: ruleKeysOf(globalText, cfg.minRuleChars) });
  }
  const projectText = readIfExists(join(targetAbs, "CLAUDE.md"));
  if (projectText) layers.push({ name: "project CLAUDE.md", keys: ruleKeysOf(projectText, cfg.minRuleChars) });
  for (const g of guideDirs) {
    const text = readIfExists(join(targetAbs, g.path, "CLAUDE.md"));
    if (text) layers.push({ name: `${g.path}/CLAUDE.md`, keys: ruleKeysOf(text, cfg.minRuleChars) });
  }
  const byKey = new Map();
  for (const layer of layers) {
    for (const [key, original] of layer.keys) {
      let rec = byKey.get(key);
      if (!rec) {
        rec = { layers: [], snippet: original };
        byKey.set(key, rec);
      }
      rec.layers.push(layer.name);
    }
  }
  for (const rec of byKey.values()) {
    if (rec.layers.length >= 2) {
      warnings.push({
        id: "leanness-duplicate",
        message: `rule duplicated across ${rec.layers.join(" and ")}: "${snippet(rec.snippet)}" — a lower layer should not restate a rule the higher layer already covers`,
      });
    }
  }

  // --- (3) orphaned folder guides ---
  const candidates = [];
  let entries = [];
  try {
    entries = readdirSync(targetAbs, { withFileTypes: true });
  } catch {
    entries = [];
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue;
    candidates.push(entry.name);
    if (WORKSPACE_CONTAINERS.has(entry.name)) {
      let children = [];
      try {
        children = readdirSync(join(targetAbs, entry.name), { withFileTypes: true });
      } catch {
        children = [];
      }
      for (const child of children) {
        if (child.isDirectory() && !SKIP_DIRS.has(child.name)) candidates.push(`${entry.name}/${child.name}`);
      }
    }
  }
  for (const relDir of candidates) {
    if (validGuideDirs.has(relDir)) continue;
    for (const name of GUIDE_FILES) {
      const text = readIfExists(join(targetAbs, relDir, name));
      if (isManaged(text)) {
        warnings.push({
          id: "leanness-orphan",
          path: `${relDir}/${name}`,
          message: `${relDir}/${name} is a harness-managed guide but '${relDir}' is no longer a detected code dir — remove it or re-run /agent-init`,
        });
      }
    }
  }

  return { warnings };
}
