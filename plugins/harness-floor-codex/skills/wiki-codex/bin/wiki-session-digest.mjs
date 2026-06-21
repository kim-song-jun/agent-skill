#!/usr/bin/env node
// wiki-session-digest.mjs — In-skill manual invocation: print a brief wiki status digest.
//
// Reads the project wiki (default: $CODEX_PROJECT_DIR/.wiki) and prints a
// one-line summary of the wiki state. Designed for manual invocation within
// the skill directory (e.g., as part of a `run /wiki status` command).
//
// For the Codex hook that fires automatically on the first tool call of each
// session, see ../templates/hooks/wiki-pretool-first-call-digest.mjs.hbs
// (rendered into .codex/hooks/ by the installer).
//
// This file CAN import ../lib/wiki-index.mjs because it lives inside the
// skill directory alongside its lib. The hook .mjs in .codex/hooks/ cannot
// do so (different directory), hence that hook is self-contained.
//
// Attribution: Karpathy LLM-Wiki pattern (MIT) — adapted for Codex near-native.

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { compileSelfAudit, INDEX_FILENAME, WIKI_DIR_DEFAULT } from "../lib/wiki-index.mjs";

const projectDir = process.env.CODEX_PROJECT_DIR || process.cwd();
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
  // Non-fatal — print a warn line and exit 0
  process.stderr.write(`wiki-session-digest: ${err.message}\n`);
  process.exit(0);
}
