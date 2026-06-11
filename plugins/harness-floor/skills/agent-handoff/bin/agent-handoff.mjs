#!/usr/bin/env node
import { runAgentHandoff } from "../lib/agent-handoff-runner.mjs";

function parseArgs(argv) {
  const args = {
    taskPath: null,
    dryRun: false,
    strict: false,
    nonInteractive: !process.stdin.isTTY,
    artifactRoot: null,
  };
  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--strict") args.strict = true;
    else if (arg === "--yes") args.nonInteractive = true;
    else if (arg === "--interactive") args.nonInteractive = false;
    else if (arg.startsWith("--artifact-root=")) args.artifactRoot = arg.slice("--artifact-root=".length);
    else if (arg.startsWith("--task=")) args.taskPath = arg.slice("--task=".length);
    else if (!args.taskPath) args.taskPath = arg;
    else throw new Error(`unexpected argument: ${arg}`);
  }
  if (!args.taskPath) throw new Error("usage: agent-handoff.mjs <.agent-skill/tasks/NN-slug.md|docs/tasks/NN-slug.md> [--dry-run] [--strict] [--yes] [--artifact-root=.agent-skill]");
  return args;
}

try {
  const args = parseArgs(process.argv.slice(2));
  const result = runAgentHandoff(args);
  if (args.dryRun) {
    console.log(result.handoff);
    console.log(result.session);
  } else {
    console.log(`wrote ${result.handoffPath}`);
    console.log(`wrote ${result.sessionPath}`);
    if (result.audit) console.log(`appended ${result.auditPath}`);
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
