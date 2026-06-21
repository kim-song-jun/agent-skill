#!/usr/bin/env node
// wiki-session-digest.mjs — SessionStart hook: print a brief wiki status digest.
//
// Reads the project wiki (default: $CLAUDE_PROJECT_DIR/.wiki) and prints a
// one-line summary so the session's opening message surfaces the wiki state.
// Safe to run when no wiki exists — exits silently in that case.
//
// Attribution: Karpathy LLM-Wiki pattern (MIT) — adapted for CC native.

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { compileSelfAudit, INDEX_FILENAME, WIKI_DIR_DEFAULT } from "../lib/wiki-index.mjs";

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const wikiDir = resolve(projectDir, WIKI_DIR_DEFAULT);
const indexPath = join(wikiDir, INDEX_FILENAME);

if (!existsSync(indexPath)) {
  // No wiki — exit silently (hook must not fail when wiki is absent)
  process.exit(0);
}

try {
  const audit = compileSelfAudit(wikiDir);
  const statusIcon = audit.ok ? "✔" : "⚠";
  const driftNote = audit.ok
    ? ""
    : ` [drift: ${audit.indexOnly.length} missing page(s), ${audit.pagesOnly.length} unindexed page(s)]`;

  const digest = [
    `${statusIcon} wiki: ${audit.entryCount} page(s) indexed, ${audit.pageCount} on disk${driftNote}`,
    `  Run /wiki status for details, /wiki compile to audit, /wiki <query> to read or write.`,
  ].join("\n");

  process.stdout.write(`${digest}\n`);
  process.exit(0);
} catch (err) {
  // Hook errors must be non-fatal — print a warn line and exit 0
  process.stderr.write(`wiki-session-digest: ${err.message}\n`);
  process.exit(0);
}
