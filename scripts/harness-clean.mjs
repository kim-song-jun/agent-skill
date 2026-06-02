#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCleanupCli } from "../plugins/harness-builder/skills/agent-init/lib/harness-cleaner.mjs";

export {
  CLEANUP_USAGE,
  parseCleanupArgs,
  planHarnessCleanup,
  printCleanupHuman,
  runCleanupCli,
  runHarnessCleanup,
} from "../plugins/harness-builder/skills/agent-init/lib/harness-cleaner.mjs";

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCleanupCli();
}
