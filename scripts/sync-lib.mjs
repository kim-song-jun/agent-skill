#!/usr/bin/env node
// Sync vendored lib files from harness-builder/agent-init/lib/ to each
// cross-platform plugin's vendored lib directory. Run after touching any
// of the shared lib files.
//
// Usage:
//   node scripts/sync-lib.mjs           # copy + report
//   node scripts/sync-lib.mjs --check   # exit non-zero if any vendored copy diverges
//
// The shared lib lives in harness-builder by convention. If a future iteration
// promotes it to a top-level _core/ package, update SOURCE_LIB below.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

const SOURCE_LIB = resolve(
  repoRoot,
  "plugins/harness-builder/skills/agent-init/lib",
);

const VENDORED_LIBS = [
  "plugins/harness-builder-codex/skills/codex-init/lib",
  "plugins/harness-builder-copilot/skills/copilot-init/lib",
  "plugins/harness-builder-gemini/skills/gemini-init/lib",
  "plugins/harness-builder-cursor/skills/cursor-init/lib",
].map((p) => resolve(repoRoot, p));

// harness-floor-* and harness-thrift-* plugins keep render.mjs at bin/lib/
// (only used by bin/init.mjs install renderer; detect-stack not needed there).
const VENDORED_RENDER_ONLY = [
  "plugins/harness-floor-cursor/bin/lib",
  "plugins/harness-floor-copilot/bin/lib",
  "plugins/harness-floor-codex/bin/lib",
  "plugins/harness-floor-gemini/bin/lib",
  "plugins/harness-thrift/bin/lib",
  "plugins/harness-thrift-cursor/bin/lib",
  "plugins/harness-thrift-copilot/bin/lib",
  "plugins/harness-thrift-codex/bin/lib",
  "plugins/harness-thrift-gemini/bin/lib",
  "plugins/harness-explore/bin/lib",
  "plugins/harness-debug/bin/lib",
  "plugins/harness-debug-codex/bin/lib",
].map((p) => resolve(repoRoot, p));

const FILES = ["render.mjs", "detect-stack.mjs", "sentinel-merge.mjs", "folder-guides.mjs"];
const RENDER_ONLY_FILES = ["render.mjs"];

// Phase D config-loader.mjs propagation: canonical lives in harness-floor;
// vendored copies in agent-all-cursor and agent-all-copilot must match
// line-for-line per `tests/lib/cursor-agent-all-config-loader.test.mjs`.
const CONFIG_LOADER_SOURCE = resolve(
  repoRoot,
  "plugins/harness-floor/skills/agent-all/lib/config-loader.mjs",
);
const CONFIG_LOADER_TARGETS = [
  "plugins/harness-floor-cursor/skills/agent-all-cursor/lib/config-loader.mjs",
  "plugins/harness-floor-copilot/skills/agent-all-copilot/lib/config-loader.mjs",
].map((p) => resolve(repoRoot, p));

const BREAK_RESOLVER_SOURCE = resolve(
  repoRoot,
  "plugins/harness-floor/skills/agent-all/lib/break-resolver.mjs",
);
const BREAK_RESOLVER_TARGETS = [
  "plugins/harness-floor-cursor/skills/agent-all-cursor/lib/break-resolver.mjs",
  "plugins/harness-floor-copilot/skills/agent-all-copilot/lib/break-resolver.mjs",
  "plugins/harness-floor-codex/skills/agent-all-codex/lib/break-resolver.mjs",
  "plugins/harness-floor-gemini/skills/agent-all-gemini/lib/break-resolver.mjs",
].map((p) => resolve(repoRoot, p));

const ARTIFACT_PATHS_SOURCE = resolve(
  repoRoot,
  "plugins/harness-floor/skills/agent-all/lib/artifact-paths.mjs",
);
const ARTIFACT_PATHS_TARGETS = [
  "plugins/harness-core/lib/artifact-paths.mjs",
  "plugins/harness-floor-cursor/skills/agent-all-cursor/lib/artifact-paths.mjs",
  "plugins/harness-floor-copilot/skills/agent-all-copilot/lib/artifact-paths.mjs",
  "plugins/harness-floor-codex/skills/agent-all-codex/lib/artifact-paths.mjs",
  "plugins/harness-floor-gemini/skills/agent-all-gemini/lib/artifact-paths.mjs",
].map((p) => resolve(repoRoot, p));

const TASK_ID_SOURCE = resolve(
  repoRoot,
  "plugins/harness-floor/skills/agent-all/lib/task-id-allocator.mjs",
);
const TASK_REGISTRY_SOURCE = resolve(
  repoRoot,
  "plugins/harness-floor/skills/agent-all/lib/task-registry.mjs",
);
const TASK_ID_TARGETS = [
  "plugins/harness-floor-cursor/skills/agent-all-cursor/lib/task-id-allocator.mjs",
  "plugins/harness-floor-copilot/skills/agent-all-copilot/lib/task-id-allocator.mjs",
  "plugins/harness-floor-codex/skills/agent-all-codex/lib/task-id-allocator.mjs",
  "plugins/harness-floor-gemini/skills/agent-all-gemini/lib/task-id-allocator.mjs",
].map((p) => resolve(repoRoot, p));
const TASK_REGISTRY_TARGETS = [
  "plugins/harness-floor-cursor/skills/agent-all-cursor/lib/task-registry.mjs",
  "plugins/harness-floor-copilot/skills/agent-all-copilot/lib/task-registry.mjs",
  "plugins/harness-floor-codex/skills/agent-all-codex/lib/task-registry.mjs",
  "plugins/harness-floor-gemini/skills/agent-all-gemini/lib/task-registry.mjs",
].map((p) => resolve(repoRoot, p));

const TASK_DOC_WRITER_SOURCE = resolve(
  repoRoot,
  "plugins/harness-floor/skills/agent-all/lib/task-doc-writer.mjs",
);
const TASK_DOC_WRITER_TARGETS = [
  "plugins/harness-floor-cursor/skills/agent-all-cursor/lib/task-doc-writer.mjs",
  "plugins/harness-floor-copilot/skills/agent-all-copilot/lib/task-doc-writer.mjs",
  "plugins/harness-floor-codex/skills/agent-all-codex/lib/task-doc-writer.mjs",
  "plugins/harness-floor-gemini/skills/agent-all-gemini/lib/task-doc-writer.mjs",
].map((p) => resolve(repoRoot, p));

// task-ledger validator (REQUIRED_SECTIONS + validateTaskDoc/validateTaskLedger).
// Pure, platform-agnostic — vendored to every port so the Phase-5 acceptance
// gate (restored to the ports) can actually run it instead of being advisory.
const TASK_LEDGER_LIB_SOURCE = resolve(
  repoRoot,
  "plugins/harness-floor/skills/agent-all/lib/task-ledger.mjs",
);
const TASK_LEDGER_LIB_TARGETS = [
  "plugins/harness-floor-cursor/skills/agent-all-cursor/lib/task-ledger.mjs",
  "plugins/harness-floor-copilot/skills/agent-all-copilot/lib/task-ledger.mjs",
  "plugins/harness-floor-codex/skills/agent-all-codex/lib/task-ledger.mjs",
  "plugins/harness-floor-gemini/skills/agent-all-gemini/lib/task-ledger.mjs",
].map((p) => resolve(repoRoot, p));

const VERIFICATION_ADAPTER_SOURCE = resolve(
  repoRoot,
  "plugins/harness-floor/skills/agent-all/lib/verification-adapters",
);
const VERIFICATION_ADAPTER_TARGETS = [
  "plugins/harness-floor-cursor/skills/agent-all-cursor/lib/verification-adapters",
  "plugins/harness-floor-copilot/skills/agent-all-copilot/lib/verification-adapters",
  "plugins/harness-floor-codex/skills/agent-all-codex/lib/verification-adapters",
  "plugins/harness-floor-gemini/skills/agent-all-gemini/lib/verification-adapters",
].map((p) => resolve(repoRoot, p));
const VERIFICATION_ADAPTER_FILES = ["schema.mjs", "evidence-writer.mjs", "registry.mjs", "adversarial-verifier.mjs"];

// Leaf visual-qa libs each port's shallow-clicker imports (computeElementIdentity,
// resolveTarget/parseAction) but that were never vendored — a dangling
// import / ERR_MODULE_NOT_FOUND in all four visual-qa ports until now.
const VISUAL_QA_SHARED_SOURCE = resolve(
  repoRoot,
  "plugins/harness-floor/skills/visual-qa/lib",
);
const VISUAL_QA_SHARED_TARGETS = [
  "plugins/harness-floor-cursor/skills/visual-qa-cursor/lib",
  "plugins/harness-floor-copilot/skills/visual-qa-copilot/lib",
  "plugins/harness-floor-codex/skills/visual-qa-codex/lib",
  "plugins/harness-floor-gemini/skills/visual-qa-gemini/lib",
].map((p) => resolve(repoRoot, p));
const VISUAL_QA_SHARED_FILES = ["element-identity.mjs", "targets-filter.mjs"];

const DATA_HELPER_SOURCE = resolve(
  repoRoot,
  "plugins/harness-floor/skills/agent-all/lib/data",
);
const DATA_HELPER_TARGETS = [
  "plugins/harness-floor-cursor/skills/agent-all-cursor/lib/data",
  "plugins/harness-floor-copilot/skills/agent-all-copilot/lib/data",
  "plugins/harness-floor-codex/skills/agent-all-codex/lib/data",
  "plugins/harness-floor-gemini/skills/agent-all-gemini/lib/data",
].map((p) => resolve(repoRoot, p));
const DATA_HELPER_FILES = ["artifact-diff.mjs", "notebook-runner.mjs", "sql-validator.mjs"];

const SECURITY_HELPER_SOURCE = resolve(
  repoRoot,
  "plugins/harness-floor/skills/agent-all/lib/security",
);
const SECURITY_HELPER_TARGETS = [
  "plugins/harness-floor-cursor/skills/agent-all-cursor/lib/security",
  "plugins/harness-floor-copilot/skills/agent-all-copilot/lib/security",
  "plugins/harness-floor-codex/skills/agent-all-codex/lib/security",
  "plugins/harness-floor-gemini/skills/agent-all-gemini/lib/security",
  "plugins/harness-debug/skills/debug/lib/security",
  "plugins/harness-debug-codex/skills/debug-codex/lib/security",
  // harness-core consumes these at runtime: lib/interactions/interaction-log-writer.mjs
  // imports ../security/{artifact-redactor,redact-report-writer}.mjs. It was the
  // only consumer NOT guarded here, so security-lib drift went uncaught until runtime.
  "plugins/harness-core/lib/security",
].map((p) => resolve(repoRoot, p));
const SECURITY_HELPER_FILES = [
  "artifact-redactor.mjs",
  "redact-report-writer.mjs",
  "redaction-rules.mjs",
  "redaction-scanner.mjs",
];

const INTERACTION_HELPER_SOURCE = resolve(
  repoRoot,
  "plugins/harness-floor/skills/agent-all/lib/interactions",
);
const INTERACTION_HELPER_TARGETS = [
  "plugins/harness-core/lib/interactions",
  "plugins/harness-floor-cursor/skills/agent-all-cursor/lib/interactions",
  "plugins/harness-floor-copilot/skills/agent-all-copilot/lib/interactions",
  "plugins/harness-floor-codex/skills/agent-all-codex/lib/interactions",
  "plugins/harness-floor-gemini/skills/agent-all-gemini/lib/interactions",
].map((p) => resolve(repoRoot, p));
const INTERACTION_HELPER_FILES = [
  "interaction-log-writer.mjs",
  "non-tty-resolver.mjs",
  "renderer-claude.mjs",
  "renderer-codex.mjs",
  "renderer-copilot.mjs",
  "renderer-cursor.mjs",
  "renderer-gemini.mjs",
  "schema.mjs",
];

const LOOP_EVALUATOR_SOURCE = resolve(
  repoRoot,
  "plugins/harness-floor/skills/agent-all/lib/loop-evaluator.mjs",
);
const LOOP_EVALUATOR_TARGETS = [
  "plugins/harness-floor-copilot/skills/agent-all-copilot/lib/loop-evaluator.mjs",
].map((p) => resolve(repoRoot, p));

// memory-bridge.mjs — verbatim copy from the canonical copilot source.
// Self-contained (node:fs + node:path only); codex vendors it locally so
// memory-agent can import ./memory-bridge.mjs instead of the cross-plugin path.
const MEMORY_BRIDGE_SOURCE = resolve(
  repoRoot,
  "plugins/harness-floor-copilot/skills/agent-all-copilot/lib/memory-bridge.mjs",
);
const MEMORY_BRIDGE_TARGETS = [
  "plugins/harness-floor-codex/skills/agent-all-codex/lib/memory-bridge.mjs",
].map((p) => resolve(repoRoot, p));

// memory-agent.mjs — IMPORT-REWRITE: CC source imports the copilot bridge via
// a cross-plugin relative path; codex AND copilot copies MUST import the LOCAL
// ./memory-bridge.mjs instead (both vendor it locally). The transform is
// applied identically for both --check (compare) and --sync (write).
const MEMORY_AGENT_SOURCE = resolve(
  repoRoot,
  "plugins/harness-floor/skills/agent-all/lib/memory-agent.mjs",
);
const MEMORY_AGENT_TARGETS = [
  "plugins/harness-floor-codex/skills/agent-all-codex/lib/memory-agent.mjs",
  // copilot: same import-rewrite target — copilot vendors ./memory-bridge.mjs
  // locally (it is the canonical bridge SOURCE) and ./artifact-paths.mjs, so
  // the rewritten file is byte-identical to the codex copy. G7.
  "plugins/harness-floor-copilot/skills/agent-all-copilot/lib/memory-agent.mjs",
].map((p) => resolve(repoRoot, p));
// The CC import anchor string that must be replaced.
const MEMORY_AGENT_CC_IMPORT =
  '"../../../../harness-floor-copilot/skills/agent-all-copilot/lib/memory-bridge.mjs"';
const MEMORY_AGENT_LOCAL_IMPORT = '"./memory-bridge.mjs"';
function localMemoryAgentTransform(src) {
  return src.replace(MEMORY_AGENT_CC_IMPORT, MEMORY_AGENT_LOCAL_IMPORT);
}

const COST_TELEMETRY_SOURCE = resolve(
  repoRoot,
  "plugins/harness-floor/skills/agent-all/lib/cost-telemetry.mjs",
);
const COST_TELEMETRY_TARGETS = [
  "plugins/harness-floor-cursor/skills/agent-all-cursor/lib/cost-telemetry.mjs",
  "plugins/harness-floor-copilot/skills/agent-all-copilot/lib/cost-telemetry.mjs",
  "plugins/harness-floor-codex/skills/agent-all-codex/lib/cost-telemetry.mjs",
  "plugins/harness-floor-gemini/skills/agent-all-gemini/lib/cost-telemetry.mjs",
].map((p) => resolve(repoRoot, p));

// Codex keeps its own agent-all-codex skill path, but the changed-file
// classifier should remain line-for-line compatible with Claude agent-all.
const CHANGED_FILE_CLASSIFIER_SOURCE = resolve(
  repoRoot,
  "plugins/harness-floor/skills/agent-all/lib/changed-file-classifier.mjs",
);
const CHANGED_FILE_CLASSIFIER_TARGETS = [
  "plugins/harness-floor-codex/skills/agent-all-codex/lib/changed-file-classifier.mjs",
  // copilot + gemini ports import gate-plan.mjs (which depends on this) in their
  // restored Phase 4 audit-token gate — vendor it so the import resolves.
  "plugins/harness-floor-copilot/skills/agent-all-copilot/lib/changed-file-classifier.mjs",
  "plugins/harness-floor-gemini/skills/agent-all-gemini/lib/changed-file-classifier.mjs",
].map((p) => resolve(repoRoot, p));

const GATE_PLAN_SOURCE = resolve(
  repoRoot,
  "plugins/harness-floor/skills/agent-all/lib/gate-plan.mjs",
);
const GATE_PLAN_TARGETS = [
  "plugins/harness-floor-codex/skills/agent-all-codex/lib/gate-plan.mjs",
  // copilot + gemini restored Phase 4 imports buildGatePlan from ./lib/gate-plan.mjs.
  "plugins/harness-floor-copilot/skills/agent-all-copilot/lib/gate-plan.mjs",
  "plugins/harness-floor-gemini/skills/agent-all-gemini/lib/gate-plan.mjs",
].map((p) => resolve(repoRoot, p));

const COORDINATOR_AUDIT_VALIDATOR_SOURCE = resolve(
  repoRoot,
  "plugins/harness-floor/skills/agent-all/lib/policy/coordinator-audit-validator.mjs",
);
const COORDINATOR_AUDIT_VALIDATOR_TARGETS = [
  "plugins/harness-floor-codex/skills/agent-all-codex/lib/policy/coordinator-audit-validator.mjs",
].map((p) => resolve(repoRoot, p));

// Canonical audit-token grammar (the exit(2) governance contract). The Codex
// coordinator-audit-validator imports it, so the vendored copy must travel
// with it. Single source of truth for the token names + verdict grammar.
const AUDIT_TOKENS_SOURCE = resolve(
  repoRoot,
  "plugins/harness-floor/skills/agent-all/lib/policy/audit-tokens.mjs",
);
const AUDIT_TOKENS_TARGETS = [
  "plugins/harness-floor-codex/skills/agent-all-codex/lib/policy/audit-tokens.mjs",
].map((p) => resolve(repoRoot, p));

const FOUNDATION_CHECK_SOURCE = resolve(
  repoRoot,
  "plugins/harness-builder/skills/agent-init/lib/foundation-check.mjs",
);
const FOUNDATION_CHECK_TARGETS = [
  "plugins/harness-builder-codex/skills/codex-init/lib/foundation-check.mjs",
].map((p) => resolve(repoRoot, p));

const DOCTOR_CORE_SOURCE = resolve(
  repoRoot,
  "plugins/harness-builder/skills/agent-init/lib/doctor-core.mjs",
);
const DOCTOR_CORE_TARGETS = [
  "plugins/harness-builder-codex/skills/codex-init/lib/doctor-core.mjs",
].map((p) => resolve(repoRoot, p));

const HARNESS_CLEANER_SOURCE = resolve(
  repoRoot,
  "plugins/harness-builder/skills/agent-init/lib/harness-cleaner.mjs",
);
const HARNESS_CLEANER_TARGETS = [
  "plugins/harness-builder-codex/skills/codex-init/lib/harness-cleaner.mjs",
].map((p) => resolve(repoRoot, p));

const DEBUG_SKILL_LIB_SOURCE = resolve(
  repoRoot,
  "plugins/harness-debug/skills/debug/lib",
);
const DEBUG_SKILL_LIB_TARGETS = [
  "plugins/harness-debug-codex/skills/debug-codex/lib",
].map((p) => resolve(repoRoot, p));
const DEBUG_SKILL_LIB_FILES = [
  "bisector.mjs",
  "debug-artifacts.mjs",
  "error-parser.mjs",
  "hypothesis-tracker.mjs",
  "repro-suggester.mjs",
  "state-checkpoint.mjs",
];

// summariser.mjs (self-contained) — Claude thrift source → Codex thrift copy,
// so thrift-codex Phase 3 can call summarise()/heuristicSummariseFn() locally.
const SUMMARISER_SOURCE = resolve(
  repoRoot,
  "plugins/harness-thrift/skills/thrift/lib/summariser.mjs",
);
const SUMMARISER_TARGETS = [
  "plugins/harness-thrift-codex/skills/thrift-codex/lib/summariser.mjs",
].map((p) => resolve(repoRoot, p));

// render.mjs (self-contained handlebars renderer) — builder source → agent-all
// skill lib, so agent-all Phase 5 renders pr-body.md.hbs via ./lib/render.mjs
// instead of reaching into the (post-install unreachable) harness-builder dir.
const AGENT_ALL_RENDER_SOURCE = resolve(
  repoRoot,
  "plugins/harness-builder/skills/agent-init/lib/render.mjs",
);
const AGENT_ALL_RENDER_TARGETS = [
  "plugins/harness-floor/skills/agent-all/lib/render.mjs",
].map((p) => resolve(repoRoot, p));

// Task-ledger templates — builder source → agent-all skill templates, so
// agent-all Phase 1 seeds .agent-skill/tasks/ from bundled copies (the harness-builder
// plugin dir is not reachable from harness-floor on a real install).
const TASK_LEDGER_SOURCE = resolve(
  repoRoot,
  "plugins/harness-builder/skills/agent-init/templates/task-ledger",
);
const TASK_LEDGER_TARGETS = [
  "plugins/harness-floor/skills/agent-all/templates/task-ledger",
].map((p) => resolve(repoRoot, p));
const TASK_LEDGER_FILES = ["index.md.hbs", "_template.md.hbs"];

function readOrNull(path) {
  return existsSync(path) ? readFileSync(path, "utf-8") : null;
}

function collectDrift() {
  const drift = [];
  const all = [
    { files: FILES, dests: VENDORED_LIBS },
    { files: RENDER_ONLY_FILES, dests: VENDORED_RENDER_ONLY },
  ];
  for (const { files, dests } of all) {
    for (const file of files) {
      const sourcePath = resolve(SOURCE_LIB, file);
      const sourceContent = readOrNull(sourcePath);
      if (sourceContent == null) {
        console.error(`Source lib missing: ${sourcePath}`);
        process.exit(2);
      }
      for (const dest of dests) {
        const destPath = resolve(dest, file);
        const destContent = readOrNull(destPath);
        if (destContent == null) {
          drift.push({ file, dest: destPath, reason: "missing", sourceContent });
        } else if (destContent !== sourceContent) {
          drift.push({ file, dest: destPath, reason: "diverged", sourceContent });
        }
      }
    }
  }
  // agent-all config-loader.mjs (one source → two vendored copies).
  const cfgSrc = readOrNull(CONFIG_LOADER_SOURCE);
  if (cfgSrc == null) {
    console.error(`Source missing: ${CONFIG_LOADER_SOURCE}`);
    process.exit(2);
  }
  for (const destPath of CONFIG_LOADER_TARGETS) {
    const destContent = readOrNull(destPath);
    if (destContent == null) {
      drift.push({ file: "config-loader.mjs", dest: destPath, reason: "missing", sourceContent: cfgSrc });
    } else if (destContent !== cfgSrc) {
      drift.push({ file: "config-loader.mjs", dest: destPath, reason: "diverged", sourceContent: cfgSrc });
    }
  }
  // agent-all break-resolver.mjs (Claude source → all platform agent-all copies).
  const breakResolverSrc = readOrNull(BREAK_RESOLVER_SOURCE);
  if (breakResolverSrc == null) {
    console.error(`Source missing: ${BREAK_RESOLVER_SOURCE}`);
    process.exit(2);
  }
  for (const destPath of BREAK_RESOLVER_TARGETS) {
    const destContent = readOrNull(destPath);
    if (destContent == null) {
      drift.push({ file: "break-resolver.mjs", dest: destPath, reason: "missing", sourceContent: breakResolverSrc });
    } else if (destContent !== breakResolverSrc) {
      drift.push({ file: "break-resolver.mjs", dest: destPath, reason: "diverged", sourceContent: breakResolverSrc });
    }
  }
  // agent-all artifact path helper (Claude source → all platform agent-all copies).
  const artifactPathsSrc = readOrNull(ARTIFACT_PATHS_SOURCE);
  if (artifactPathsSrc == null) {
    console.error(`Source missing: ${ARTIFACT_PATHS_SOURCE}`);
    process.exit(2);
  }
  for (const destPath of ARTIFACT_PATHS_TARGETS) {
    const destContent = readOrNull(destPath);
    if (destContent == null) {
      drift.push({ file: "artifact-paths.mjs", dest: destPath, reason: "missing", sourceContent: artifactPathsSrc });
    } else if (destContent !== artifactPathsSrc) {
      drift.push({ file: "artifact-paths.mjs", dest: destPath, reason: "diverged", sourceContent: artifactPathsSrc });
    }
  }
  // task identity and registry helpers (Claude source → all platform agent-all copies).
  const taskIdSrc = readOrNull(TASK_ID_SOURCE);
  if (taskIdSrc == null) {
    console.error(`Source missing: ${TASK_ID_SOURCE}`);
    process.exit(2);
  }
  for (const destPath of TASK_ID_TARGETS) {
    const destContent = readOrNull(destPath);
    if (destContent == null) {
      drift.push({ file: "task-id-allocator.mjs", dest: destPath, reason: "missing", sourceContent: taskIdSrc });
    } else if (destContent !== taskIdSrc) {
      drift.push({ file: "task-id-allocator.mjs", dest: destPath, reason: "diverged", sourceContent: taskIdSrc });
    }
  }
  const taskRegistrySrc = readOrNull(TASK_REGISTRY_SOURCE);
  if (taskRegistrySrc == null) {
    console.error(`Source missing: ${TASK_REGISTRY_SOURCE}`);
    process.exit(2);
  }
  for (const destPath of TASK_REGISTRY_TARGETS) {
    const destContent = readOrNull(destPath);
    if (destContent == null) {
      drift.push({ file: "task-registry.mjs", dest: destPath, reason: "missing", sourceContent: taskRegistrySrc });
    } else if (destContent !== taskRegistrySrc) {
      drift.push({ file: "task-registry.mjs", dest: destPath, reason: "diverged", sourceContent: taskRegistrySrc });
    }
  }
  const taskDocWriterSrc = readOrNull(TASK_DOC_WRITER_SOURCE);
  if (taskDocWriterSrc == null) {
    console.error(`Source missing: ${TASK_DOC_WRITER_SOURCE}`);
    process.exit(2);
  }
  for (const destPath of TASK_DOC_WRITER_TARGETS) {
    const destContent = readOrNull(destPath);
    if (destContent == null) {
      drift.push({ file: "task-doc-writer.mjs", dest: destPath, reason: "missing", sourceContent: taskDocWriterSrc });
    } else if (destContent !== taskDocWriterSrc) {
      drift.push({ file: "task-doc-writer.mjs", dest: destPath, reason: "diverged", sourceContent: taskDocWriterSrc });
    }
  }
  const taskLedgerLibSrc = readOrNull(TASK_LEDGER_LIB_SOURCE);
  if (taskLedgerLibSrc == null) {
    console.error(`Source missing: ${TASK_LEDGER_LIB_SOURCE}`);
    process.exit(2);
  }
  for (const destPath of TASK_LEDGER_LIB_TARGETS) {
    const destContent = readOrNull(destPath);
    if (destContent == null) {
      drift.push({ file: "task-ledger.mjs", dest: destPath, reason: "missing", sourceContent: taskLedgerLibSrc });
    } else if (destContent !== taskLedgerLibSrc) {
      drift.push({ file: "task-ledger.mjs", dest: destPath, reason: "diverged", sourceContent: taskLedgerLibSrc });
    }
  }
  // verification adapter runtime libs (Claude source → all platform agent-all copies).
  for (const file of VERIFICATION_ADAPTER_FILES) {
    const sourcePath = resolve(VERIFICATION_ADAPTER_SOURCE, file);
    const sourceContent = readOrNull(sourcePath);
    if (sourceContent == null) {
      console.error(`Source missing: ${sourcePath}`);
      process.exit(2);
    }
    for (const dest of VERIFICATION_ADAPTER_TARGETS) {
      const destPath = resolve(dest, file);
      const destContent = readOrNull(destPath);
      if (destContent == null) {
        drift.push({ file, dest: destPath, reason: "missing", sourceContent });
      } else if (destContent !== sourceContent) {
        drift.push({ file, dest: destPath, reason: "diverged", sourceContent });
      }
    }
  }
  // shared visual-qa leaf libs (Claude source → all platform visual-qa copies).
  for (const file of VISUAL_QA_SHARED_FILES) {
    const sourcePath = resolve(VISUAL_QA_SHARED_SOURCE, file);
    const sourceContent = readOrNull(sourcePath);
    if (sourceContent == null) {
      console.error(`Source missing: ${sourcePath}`);
      process.exit(2);
    }
    for (const dest of VISUAL_QA_SHARED_TARGETS) {
      const destPath = resolve(dest, file);
      const destContent = readOrNull(destPath);
      if (destContent == null) {
        drift.push({ file, dest: destPath, reason: "missing", sourceContent });
      } else if (destContent !== sourceContent) {
        drift.push({ file, dest: destPath, reason: "diverged", sourceContent });
      }
    }
  }
  // data verification helper libs (Claude source → all platform agent-all copies).
  for (const file of DATA_HELPER_FILES) {
    const sourcePath = resolve(DATA_HELPER_SOURCE, file);
    const sourceContent = readOrNull(sourcePath);
    if (sourceContent == null) {
      console.error(`Source missing: ${sourcePath}`);
      process.exit(2);
    }
    for (const dest of DATA_HELPER_TARGETS) {
      const destPath = resolve(dest, file);
      const destContent = readOrNull(destPath);
      if (destContent == null) {
        drift.push({ file, dest: destPath, reason: "missing", sourceContent });
      } else if (destContent !== sourceContent) {
        drift.push({ file, dest: destPath, reason: "diverged", sourceContent });
      }
    }
  }
  // security redaction helper libs (Claude source → platform agent-all and debug copies).
  for (const file of SECURITY_HELPER_FILES) {
    const sourcePath = resolve(SECURITY_HELPER_SOURCE, file);
    const sourceContent = readOrNull(sourcePath);
    if (sourceContent == null) {
      console.error(`Source missing: ${sourcePath}`);
      process.exit(2);
    }
    for (const dest of SECURITY_HELPER_TARGETS) {
      const destPath = resolve(dest, file);
      const destContent = readOrNull(destPath);
      if (destContent == null) {
        drift.push({ file, dest: destPath, reason: "missing", sourceContent });
      } else if (destContent !== sourceContent) {
        drift.push({ file, dest: destPath, reason: "diverged", sourceContent });
      }
    }
  }
  // interaction helper libs (Claude source → core + all platform agent-all copies).
  for (const file of INTERACTION_HELPER_FILES) {
    const sourcePath = resolve(INTERACTION_HELPER_SOURCE, file);
    const sourceContent = readOrNull(sourcePath);
    if (sourceContent == null) {
      console.error(`Source missing: ${sourcePath}`);
      process.exit(2);
    }
    for (const dest of INTERACTION_HELPER_TARGETS) {
      const destPath = resolve(dest, file);
      const destContent = readOrNull(destPath);
      if (destContent == null) {
        drift.push({ file, dest: destPath, reason: "missing", sourceContent });
      } else if (destContent !== sourceContent) {
        drift.push({ file, dest: destPath, reason: "diverged", sourceContent });
      }
    }
  }
  // agent-all loop-evaluator.mjs (Claude source → Copilot vendored copy).
  const loopEvaluatorSrc = readOrNull(LOOP_EVALUATOR_SOURCE);
  if (loopEvaluatorSrc == null) {
    console.error(`Source missing: ${LOOP_EVALUATOR_SOURCE}`);
    process.exit(2);
  }
  for (const destPath of LOOP_EVALUATOR_TARGETS) {
    const destContent = readOrNull(destPath);
    if (destContent == null) {
      drift.push({ file: "loop-evaluator.mjs", dest: destPath, reason: "missing", sourceContent: loopEvaluatorSrc });
    } else if (destContent !== loopEvaluatorSrc) {
      drift.push({ file: "loop-evaluator.mjs", dest: destPath, reason: "diverged", sourceContent: loopEvaluatorSrc });
    }
  }
  // memory-bridge.mjs — verbatim copy from copilot canonical to codex.
  const memoryBridgeSrc = readOrNull(MEMORY_BRIDGE_SOURCE);
  if (memoryBridgeSrc == null) {
    console.error(`Source missing: ${MEMORY_BRIDGE_SOURCE}`);
    process.exit(2);
  }
  for (const destPath of MEMORY_BRIDGE_TARGETS) {
    const destContent = readOrNull(destPath);
    if (destContent == null) {
      drift.push({ file: "memory-bridge.mjs", dest: destPath, reason: "missing", sourceContent: memoryBridgeSrc });
    } else if (destContent !== memoryBridgeSrc) {
      drift.push({ file: "memory-bridge.mjs", dest: destPath, reason: "diverged", sourceContent: memoryBridgeSrc });
    }
  }
  // memory-agent.mjs — import-rewrite: CC cross-plugin import → codex-local ./memory-bridge.mjs.
  // The transform must be applied to BOTH compare and write; never compare raw src.
  const memoryAgentSrcRaw = readOrNull(MEMORY_AGENT_SOURCE);
  if (memoryAgentSrcRaw == null) {
    console.error(`Source missing: ${MEMORY_AGENT_SOURCE}`);
    process.exit(2);
  }
  // Anchor assertion: fail loudly if the CC import string we rewrite has changed.
  if (!memoryAgentSrcRaw.includes(MEMORY_AGENT_CC_IMPORT)) {
    console.error(
      `sync-lib: MEMORY_AGENT_SOURCE no longer contains the expected CC import anchor:\n` +
      `  expected: ${MEMORY_AGENT_CC_IMPORT}\n` +
      `  in: ${MEMORY_AGENT_SOURCE}\n` +
      `Update MEMORY_AGENT_CC_IMPORT in sync-lib.mjs to match the current CC import path.`,
    );
    process.exit(2);
  }
  const memoryAgentWant = localMemoryAgentTransform(memoryAgentSrcRaw);
  for (const destPath of MEMORY_AGENT_TARGETS) {
    const destContent = readOrNull(destPath);
    if (destContent == null) {
      drift.push({ file: "memory-agent.mjs", dest: destPath, reason: "missing", sourceContent: memoryAgentWant });
    } else if (destContent !== memoryAgentWant) {
      drift.push({ file: "memory-agent.mjs", dest: destPath, reason: "diverged", sourceContent: memoryAgentWant });
    }
  }
  // agent-all cost-telemetry.mjs (Claude source → all platform agent-all copies).
  const costTelemetrySrc = readOrNull(COST_TELEMETRY_SOURCE);
  if (costTelemetrySrc == null) {
    console.error(`Source missing: ${COST_TELEMETRY_SOURCE}`);
    process.exit(2);
  }
  for (const destPath of COST_TELEMETRY_TARGETS) {
    const destContent = readOrNull(destPath);
    if (destContent == null) {
      drift.push({ file: "cost-telemetry.mjs", dest: destPath, reason: "missing", sourceContent: costTelemetrySrc });
    } else if (destContent !== costTelemetrySrc) {
      drift.push({ file: "cost-telemetry.mjs", dest: destPath, reason: "diverged", sourceContent: costTelemetrySrc });
    }
  }
  // agent-all changed-file-classifier.mjs (Claude source → Codex vendored copy).
  const classifierSrc = readOrNull(CHANGED_FILE_CLASSIFIER_SOURCE);
  if (classifierSrc == null) {
    console.error(`Source missing: ${CHANGED_FILE_CLASSIFIER_SOURCE}`);
    process.exit(2);
  }
  for (const destPath of CHANGED_FILE_CLASSIFIER_TARGETS) {
    const destContent = readOrNull(destPath);
    if (destContent == null) {
      drift.push({ file: "changed-file-classifier.mjs", dest: destPath, reason: "missing", sourceContent: classifierSrc });
    } else if (destContent !== classifierSrc) {
      drift.push({ file: "changed-file-classifier.mjs", dest: destPath, reason: "diverged", sourceContent: classifierSrc });
    }
  }
  // agent-all gate-plan.mjs (Claude source → Codex vendored copy).
  const gatePlanSrc = readOrNull(GATE_PLAN_SOURCE);
  if (gatePlanSrc == null) {
    console.error(`Source missing: ${GATE_PLAN_SOURCE}`);
    process.exit(2);
  }
  for (const destPath of GATE_PLAN_TARGETS) {
    const destContent = readOrNull(destPath);
    if (destContent == null) {
      drift.push({ file: "gate-plan.mjs", dest: destPath, reason: "missing", sourceContent: gatePlanSrc });
    } else if (destContent !== gatePlanSrc) {
      drift.push({ file: "gate-plan.mjs", dest: destPath, reason: "diverged", sourceContent: gatePlanSrc });
    }
  }
  // agent-all coordinator audit validator (Claude source → Codex vendored copy).
  const coordinatorAuditSrc = readOrNull(COORDINATOR_AUDIT_VALIDATOR_SOURCE);
  if (coordinatorAuditSrc == null) {
    console.error(`Source missing: ${COORDINATOR_AUDIT_VALIDATOR_SOURCE}`);
    process.exit(2);
  }
  for (const destPath of COORDINATOR_AUDIT_VALIDATOR_TARGETS) {
    const destContent = readOrNull(destPath);
    if (destContent == null) {
      drift.push({ file: "coordinator-audit-validator.mjs", dest: destPath, reason: "missing", sourceContent: coordinatorAuditSrc });
    } else if (destContent !== coordinatorAuditSrc) {
      drift.push({ file: "coordinator-audit-validator.mjs", dest: destPath, reason: "diverged", sourceContent: coordinatorAuditSrc });
    }
  }
  // audit-tokens.mjs canonical governance grammar (Claude source → Codex copy).
  const auditTokensSrc = readOrNull(AUDIT_TOKENS_SOURCE);
  if (auditTokensSrc == null) {
    console.error(`Source missing: ${AUDIT_TOKENS_SOURCE}`);
    process.exit(2);
  }
  for (const destPath of AUDIT_TOKENS_TARGETS) {
    const destContent = readOrNull(destPath);
    if (destContent == null) {
      drift.push({ file: "audit-tokens.mjs", dest: destPath, reason: "missing", sourceContent: auditTokensSrc });
    } else if (destContent !== auditTokensSrc) {
      drift.push({ file: "audit-tokens.mjs", dest: destPath, reason: "diverged", sourceContent: auditTokensSrc });
    }
  }
  // foundation-check.mjs (Claude source → Codex init copy).
  const foundationSrc = readOrNull(FOUNDATION_CHECK_SOURCE);
  if (foundationSrc == null) {
    console.error(`Source missing: ${FOUNDATION_CHECK_SOURCE}`);
    process.exit(2);
  }
  for (const destPath of FOUNDATION_CHECK_TARGETS) {
    const destContent = readOrNull(destPath);
    if (destContent == null) {
      drift.push({ file: "foundation-check.mjs", dest: destPath, reason: "missing", sourceContent: foundationSrc });
    } else if (destContent !== foundationSrc) {
      drift.push({ file: "foundation-check.mjs", dest: destPath, reason: "diverged", sourceContent: foundationSrc });
    }
  }
  // doctor-core.mjs (Claude source → Codex init copy).
  const doctorCoreSrc = readOrNull(DOCTOR_CORE_SOURCE);
  if (doctorCoreSrc == null) {
    console.error(`Source missing: ${DOCTOR_CORE_SOURCE}`);
    process.exit(2);
  }
  for (const destPath of DOCTOR_CORE_TARGETS) {
    const destContent = readOrNull(destPath);
    if (destContent == null) {
      drift.push({ file: "doctor-core.mjs", dest: destPath, reason: "missing", sourceContent: doctorCoreSrc });
    } else if (destContent !== doctorCoreSrc) {
      drift.push({ file: "doctor-core.mjs", dest: destPath, reason: "diverged", sourceContent: doctorCoreSrc });
    }
  }
  // harness-cleaner.mjs (Claude source → Codex init copy).
  const cleanerSrc = readOrNull(HARNESS_CLEANER_SOURCE);
  if (cleanerSrc == null) {
    console.error(`Source missing: ${HARNESS_CLEANER_SOURCE}`);
    process.exit(2);
  }
  for (const destPath of HARNESS_CLEANER_TARGETS) {
    const destContent = readOrNull(destPath);
    if (destContent == null) {
      drift.push({ file: "harness-cleaner.mjs", dest: destPath, reason: "missing", sourceContent: cleanerSrc });
    } else if (destContent !== cleanerSrc) {
      drift.push({ file: "harness-cleaner.mjs", dest: destPath, reason: "diverged", sourceContent: cleanerSrc });
    }
  }
  // debug skill runtime libs (Claude source → Codex debug copy).
  for (const file of DEBUG_SKILL_LIB_FILES) {
    const sourcePath = resolve(DEBUG_SKILL_LIB_SOURCE, file);
    const sourceContent = readOrNull(sourcePath);
    if (sourceContent == null) {
      console.error(`Source missing: ${sourcePath}`);
      process.exit(2);
    }
    for (const dest of DEBUG_SKILL_LIB_TARGETS) {
      const destPath = resolve(dest, file);
      const destContent = readOrNull(destPath);
      if (destContent == null) {
        drift.push({ file, dest: destPath, reason: "missing", sourceContent });
      } else if (destContent !== sourceContent) {
        drift.push({ file, dest: destPath, reason: "diverged", sourceContent });
      }
    }
  }
  // summariser.mjs (Claude thrift source → Codex thrift copy).
  const summariserSrc = readOrNull(SUMMARISER_SOURCE);
  if (summariserSrc == null) {
    console.error(`Source missing: ${SUMMARISER_SOURCE}`);
    process.exit(2);
  }
  for (const destPath of SUMMARISER_TARGETS) {
    const destContent = readOrNull(destPath);
    if (destContent == null) {
      drift.push({ file: "summariser.mjs", dest: destPath, reason: "missing", sourceContent: summariserSrc });
    } else if (destContent !== summariserSrc) {
      drift.push({ file: "summariser.mjs", dest: destPath, reason: "diverged", sourceContent: summariserSrc });
    }
  }
  // render.mjs (builder source → agent-all skill lib copy).
  const agentAllRenderSrc = readOrNull(AGENT_ALL_RENDER_SOURCE);
  if (agentAllRenderSrc == null) {
    console.error(`Source missing: ${AGENT_ALL_RENDER_SOURCE}`);
    process.exit(2);
  }
  for (const destPath of AGENT_ALL_RENDER_TARGETS) {
    const destContent = readOrNull(destPath);
    if (destContent == null) {
      drift.push({ file: "render.mjs", dest: destPath, reason: "missing", sourceContent: agentAllRenderSrc });
    } else if (destContent !== agentAllRenderSrc) {
      drift.push({ file: "render.mjs", dest: destPath, reason: "diverged", sourceContent: agentAllRenderSrc });
    }
  }
  // task-ledger templates (builder source → agent-all skill templates copy).
  for (const file of TASK_LEDGER_FILES) {
    const sourcePath = resolve(TASK_LEDGER_SOURCE, file);
    const sourceContent = readOrNull(sourcePath);
    if (sourceContent == null) {
      console.error(`Source missing: ${sourcePath}`);
      process.exit(2);
    }
    for (const dest of TASK_LEDGER_TARGETS) {
      const destPath = resolve(dest, file);
      const destContent = readOrNull(destPath);
      if (destContent == null) {
        drift.push({ file, dest: destPath, reason: "missing", sourceContent });
      } else if (destContent !== sourceContent) {
        drift.push({ file, dest: destPath, reason: "diverged", sourceContent });
      }
    }
  }
  return drift;
}

function totalChecked() {
  return FILES.length * VENDORED_LIBS.length
    + RENDER_ONLY_FILES.length * VENDORED_RENDER_ONLY.length
    + CONFIG_LOADER_TARGETS.length
    + BREAK_RESOLVER_TARGETS.length
    + ARTIFACT_PATHS_TARGETS.length
    + TASK_ID_TARGETS.length
    + TASK_REGISTRY_TARGETS.length
    + TASK_DOC_WRITER_TARGETS.length
    + TASK_LEDGER_LIB_TARGETS.length
    + VERIFICATION_ADAPTER_FILES.length * VERIFICATION_ADAPTER_TARGETS.length
    + VISUAL_QA_SHARED_FILES.length * VISUAL_QA_SHARED_TARGETS.length
    + DATA_HELPER_FILES.length * DATA_HELPER_TARGETS.length
    + SECURITY_HELPER_FILES.length * SECURITY_HELPER_TARGETS.length
    + INTERACTION_HELPER_FILES.length * INTERACTION_HELPER_TARGETS.length
    + LOOP_EVALUATOR_TARGETS.length
    + MEMORY_BRIDGE_TARGETS.length
    + MEMORY_AGENT_TARGETS.length
    + COST_TELEMETRY_TARGETS.length
    + CHANGED_FILE_CLASSIFIER_TARGETS.length
    + GATE_PLAN_TARGETS.length
    + COORDINATOR_AUDIT_VALIDATOR_TARGETS.length
    + AUDIT_TOKENS_TARGETS.length
    + SUMMARISER_TARGETS.length
    + AGENT_ALL_RENDER_TARGETS.length
    + TASK_LEDGER_FILES.length * TASK_LEDGER_TARGETS.length
    + FOUNDATION_CHECK_TARGETS.length
    + DOCTOR_CORE_TARGETS.length
    + HARNESS_CLEANER_TARGETS.length
    + DEBUG_SKILL_LIB_FILES.length * DEBUG_SKILL_LIB_TARGETS.length;
}

function checkMode() {
  const drift = collectDrift();
  if (drift.length > 0) {
    console.error("Vendor drift detected:");
    for (const d of drift) {
      console.error(`  ${d.reason}: ${d.dest}`);
    }
    console.error("\nRun: node scripts/sync-lib.mjs");
    process.exit(1);
  }
  console.log(`OK — ${totalChecked()} vendored files match source.`);
}

function syncMode() {
  const drift = collectDrift();
  if (drift.length === 0) {
    console.log(`OK — already in sync (${totalChecked()} files checked).`);
    return;
  }
  for (const d of drift) {
    mkdirSync(dirname(d.dest), { recursive: true });
    writeFileSync(d.dest, d.sourceContent);
    console.log(`synced ${d.dest}`);
  }
  console.log(`Synced ${drift.length} file(s).`);
}

const args = process.argv.slice(2);
if (args.includes("--check")) checkMode();
else syncMode();
