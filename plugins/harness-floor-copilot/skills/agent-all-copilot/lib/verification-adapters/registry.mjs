import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, relative } from "node:path";
import { spawnSync } from "node:child_process";

import { artifactPaths } from "../artifact-paths.mjs";
import {
  normalizeAdapterId,
  normalizeEvidence,
  summarizeEvidence,
  VERIFICATION_ADAPTER_IDS,
} from "./schema.mjs";
import { appendVerificationEvidence } from "./evidence-writer.mjs";
import { compareArtifacts } from "../data/artifact-diff.mjs";
import {
  environmentSummary,
  inspectNotebooks,
  parseNotebookRunnerResult,
} from "../data/notebook-runner.mjs";
import {
  parseSqlRunnerResult,
  validateSqlPlan,
} from "../data/sql-validator.mjs";

const MAX_DISCOVERY_FILES = 250;
const OPENAPI_NAMES = new Set([
  "openapi.json",
  "openapi.yaml",
  "openapi.yml",
  "swagger.json",
  "swagger.yaml",
  "swagger.yml",
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [String(value)].filter(Boolean);
}

function objectArray(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.filter(isPlainObject);
  return isPlainObject(value) ? [value] : [];
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

function fileExists(cwd, file) {
  return typeof file === "string" && file.trim() && existsSync(resolve(cwd, file));
}

function discoverFiles(cwd, predicate, { maxFiles = MAX_DISCOVERY_FILES, start = "." } = {}) {
  const out = [];
  const walk = (relDir) => {
    if (out.length >= maxFiles) return;
    const absDir = resolve(cwd, relDir);
    let entries = [];
    try {
      entries = readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= maxFiles) return;
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".agent-skill") continue;
      const rel = relDir === "." ? entry.name : `${relDir}/${entry.name}`;
      const abs = resolve(cwd, rel);
      if (entry.isDirectory()) {
        walk(rel);
      } else if (entry.isFile() && predicate(rel, abs)) {
        out.push(rel);
      }
    }
  };
  walk(start);
  return out;
}

function detectPackage(cwd) {
  const pkgPath = resolve(cwd, "package.json");
  return existsSync(pkgPath) ? readJson(pkgPath) : null;
}

function packageHasUi(pkg) {
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  return ["@vitejs/plugin-react", "vite", "next", "react", "vue", "svelte", "@angular/core", "remix"].some((name) => deps[name]);
}

function packageHasCli(pkg) {
  return Boolean(pkg?.bin) || Boolean(pkg?.scripts?.start && /cli|bin|node\s+\S+\.m?js/.test(pkg.scripts.start));
}

function resultToEvidence({ adapter, status, summary, command, artifacts = [], failures = [], metadata, reproducibility }) {
  return normalizeEvidence({
    adapter,
    status,
    summary,
    command,
    artifacts,
    failures,
    metadata,
    reproducibility,
  });
}

function commandFailure(command, result) {
  const exitCode = result.exitCode ?? result.status ?? 1;
  const stderr = (result.stderr ?? "").toString().trim();
  const stdout = (result.stdout ?? "").toString().trim();
  return {
    id: "command-exit",
    severity: "major",
    message: `${command} exited ${exitCode}${stderr ? `: ${stderr}` : stdout ? `: ${stdout}` : ""}`,
  };
}

async function evaluateDataPolicyEvent(event, options) {
  try {
    const mod = await import("../policy/policy-engine.mjs");
    return mod.evaluatePolicyEvent(event, options);
  } catch {
    return null;
  }
}

function policyAuditEnabled(ctx = {}) {
  if (ctx.writePolicyAudit === false || ctx.writePolicyLog === false) return false;
  return ctx.writePolicyAudit === true || ctx.writePolicyLog === true || ctx.writeEvidence === true;
}

async function evaluateVerificationPolicyEvent({ event, plan, evidence = null, ctx = {} }) {
  return evaluateDataPolicyEvent({
    event,
    platform: ctx.platform ?? "unknown",
    runId: ctx.runId ?? "default",
    taskId: ctx.taskId,
    displayId: ctx.displayId,
    iteration: typeof ctx.iter === "number" ? ctx.iter : ctx.iteration,
    phase: ctx.phase ?? "verification",
    toolName: plan.adapter,
    changedFiles: Array.isArray(ctx.changedFiles) ? ctx.changedFiles : [],
    costUSD: ctx.costUSD,
    payload: {
      adapter: plan.adapter,
      plan,
      costTelemetry: ctx.costTelemetry,
      maxCostUSD: ctx.maxCostUSD,
      verificationEvidence: evidence,
    },
  }, {
    cwd: ctx.cwd ?? ".",
    policy: ctx.policy ?? null,
    writeAudit: policyAuditEnabled(ctx),
  });
}

function policyFailures(verdict) {
  if (!verdict || verdict.ok) return [];
  return verdict.results
    .filter((result) => (
      result.action === "deny"
        || result.action === "stop_loop"
        || result.action === "ask_user"
        || result.action === "requires_justification"
    ))
    .map((result) => ({
      id: result.policyId,
      message: result.reason,
      severity: result.severity === "critical" ? "critical" : "major",
    }));
}

function policyBlockedEvidence({ adapter, verdict, summary }) {
  return resultToEvidence({
    adapter,
    status: "blocked",
    summary,
    failures: policyFailures(verdict),
    metadata: {
      policy: verdict ? {
        ok: verdict.ok,
        action: verdict.action,
        severity: verdict.severity,
        results: verdict.results,
      } : null,
    },
  });
}

function validateArtifacts(cwd, artifacts) {
  return artifacts.filter((artifact) => !fileExists(cwd, artifact));
}

function looksLikeOpenApiFile(path, body) {
  if (path.endsWith(".json")) {
    const parsed = readJson(path);
    return Boolean(parsed?.openapi || parsed?.swagger || parsed?.paths);
  }
  return /^\s*(openapi|swagger)\s*:/m.test(body) && /^\s*paths\s*:/m.test(body);
}

export async function defaultCommandRunner(command, { cwd = ".", maxRuntimeSec = 300 } = {}) {
  const result = spawnSync("sh", ["-c", command], {
    cwd,
    encoding: "utf-8",
    timeout: Math.max(1, Number(maxRuntimeSec) || 300) * 1000,
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error?.message,
  };
}

function basePlan(adapter, config = {}, extras = {}) {
  return {
    schemaVersion: "verification-plan/v1",
    adapter,
    config: isPlainObject(config) ? JSON.parse(JSON.stringify(config)) : {},
    ...extras,
  };
}

const webUiAdapter = {
  id: "verify:web-ui",
  label: "Web UI / visual QA",
  async detect(ctx = {}) {
    const cwd = ctx.cwd ?? ".";
    const pkg = detectPackage(cwd);
    const matched = existsSync(resolve(cwd, ".visual-qa.json")) || packageHasUi(pkg);
    return {
      adapter: this.id,
      matched,
      confidence: matched ? 0.9 : 0,
      reasons: matched ? [".visual-qa.json or UI package dependencies detected"] : [],
    };
  },
  async plan(task = {}, ctx = {}) {
    const config = { ...(ctx.config ?? {}), ...(task.config ?? {}) };
    const slug = config.slug ?? `loop-iter-${ctx.iter ?? 1}`;
    return basePlan(this.id, {
      slug,
      mode: config.mode ?? "comprehensive",
      spec: config.spec,
      command: config.command,
    });
  },
  async run(plan, ctx = {}, runner = defaultCommandRunner) {
    if (ctx.visualQaResult) {
      const passed = ctx.visualQaResult.status === "passed" || ctx.visualQaResult.exitCode === 0;
      return resultToEvidence({
        adapter: this.id,
        status: passed ? "passed" : "failed",
        summary: ctx.visualQaResult.summary ?? (passed ? "visual-qa passed" : "visual-qa failed"),
        artifacts: asArray(ctx.visualQaResult.artifacts),
        failures: passed ? [] : [{ id: "visual-qa", message: ctx.visualQaResult.reason ?? "visual-qa reported failures", severity: "major" }],
      });
    }
    if (plan.config.command) {
      const result = await runner(plan.config.command, ctx);
      const passed = (result.exitCode ?? 1) === 0;
      return resultToEvidence({
        adapter: this.id,
        status: passed ? "passed" : "failed",
        command: plan.config.command,
        summary: passed ? "visual-qa command passed" : "visual-qa command failed",
        failures: passed ? [] : [commandFailure(plan.config.command, result)],
      });
    }
    const artifactConfig = ctx.artifactConfig ?? ctx.config ?? {};
    return resultToEvidence({
      adapter: this.id,
      status: "blocked",
      summary: "verify:web-ui requires the visual-qa skill runner or an explicit command",
      artifacts: [`${artifactPaths(artifactConfig).visualQaDir}/${plan.config.slug}/report.md`],
      failures: [{ id: "visual-qa-runner", message: "visual-qa runner not available in this context", severity: "major" }],
    });
  },
  summarize: summarizeEvidence,
};

const cliAdapter = {
  id: "verify:cli",
  label: "CLI",
  async detect(ctx = {}) {
    const cwd = ctx.cwd ?? ".";
    const pkg = detectPackage(cwd);
    const matched = packageHasCli(pkg)
      || existsSync(resolve(cwd, "src/main.rs"))
      || existsSync(resolve(cwd, "cmd"))
      || (ctx.changedFiles ?? []).some((file) => /(^bin\/|cli|cmd\/|src\/main\.)/.test(file));
    return {
      adapter: this.id,
      matched,
      confidence: matched ? 0.8 : 0,
      reasons: matched ? ["CLI entrypoint detected"] : [],
    };
  },
  async plan(task = {}, ctx = {}) {
    const config = { ...(ctx.config ?? {}), ...(task.config ?? {}) };
    return basePlan(this.id, config, { command: config.command });
  },
  async run(plan, ctx = {}, runner = defaultCommandRunner) {
    const cwd = ctx.cwd ?? ".";
    const command = plan.command ?? plan.config.command;
    if (!command) {
      return resultToEvidence({
        adapter: this.id,
        status: "blocked",
        summary: "verify:cli requires config.command",
        failures: [{ id: "missing-command", message: "No CLI command configured", severity: "major" }],
      });
    }
    const result = await runner(command, ctx);
    if ((result.exitCode ?? 1) !== 0) {
      return resultToEvidence({
        adapter: this.id,
        status: "failed",
        command,
        summary: "CLI command failed",
        failures: [commandFailure(command, result)],
      });
    }
    const goldenPath = plan.config.goldenStdoutPath ?? plan.config.golden;
    if (goldenPath) {
      if (!fileExists(cwd, goldenPath)) {
        return resultToEvidence({
          adapter: this.id,
          status: "failed",
          command,
          artifacts: [goldenPath],
          summary: "CLI golden stdout file is missing",
          failures: [{ id: "golden-missing", message: `Missing golden stdout: ${goldenPath}`, severity: "major" }],
        });
      }
      const expected = readFileSync(resolve(cwd, goldenPath), "utf-8").trimEnd();
      const actual = String(result.stdout ?? "").trimEnd();
      if (actual !== expected) {
        return resultToEvidence({
          adapter: this.id,
          status: "failed",
          command,
          artifacts: [goldenPath],
          summary: "CLI stdout did not match golden output",
          failures: [{ id: "golden-diff", message: "stdout differs from golden file", severity: "major" }],
        });
      }
    }
    return resultToEvidence({
      adapter: this.id,
      status: "passed",
      command,
      artifacts: goldenPath ? [goldenPath] : [],
      summary: goldenPath ? "CLI exit code and golden stdout passed" : "CLI exit code passed",
    });
  },
  summarize: summarizeEvidence,
};

const apiContractAdapter = {
  id: "verify:api-contract",
  label: "API contract",
  async detect(ctx = {}) {
    const cwd = ctx.cwd ?? ".";
    const specs = discoverFiles(cwd, (rel) => OPENAPI_NAMES.has(rel.split("/").pop().toLowerCase()));
    const matched = specs.length > 0 || (ctx.changedFiles ?? []).some((file) => /openapi|swagger|api[-_]?contract/i.test(file));
    return {
      adapter: this.id,
      matched,
      confidence: matched ? 0.85 : 0,
      reasons: matched ? [`OpenAPI/spec files: ${specs.slice(0, 3).join(", ") || "changed files"}`] : [],
      artifacts: specs,
    };
  },
  async plan(task = {}, ctx = {}) {
    const cwd = ctx.cwd ?? ".";
    const config = { ...(ctx.config ?? {}), ...(task.config ?? {}) };
    const discovered = discoverFiles(cwd, (rel) => OPENAPI_NAMES.has(rel.split("/").pop().toLowerCase()));
    return basePlan(this.id, {
      spec: config.spec ?? config.openApiSpec ?? discovered[0],
      smokeCommand: config.smokeCommand ?? config.command,
    });
  },
  async run(plan, ctx = {}, runner = defaultCommandRunner) {
    const cwd = ctx.cwd ?? ".";
    const command = plan.config.smokeCommand;
    if (command) {
      const result = await runner(command, ctx);
      const passed = (result.exitCode ?? 1) === 0;
      return resultToEvidence({
        adapter: this.id,
        status: passed ? "passed" : "failed",
        command,
        summary: passed ? "API contract smoke command passed" : "API contract smoke command failed",
        failures: passed ? [] : [commandFailure(command, result)],
      });
    }
    const spec = plan.config.spec;
    if (!spec || !fileExists(cwd, spec)) {
      return resultToEvidence({
        adapter: this.id,
        status: "failed",
        artifacts: spec ? [spec] : [],
        summary: "OpenAPI spec file is missing",
        failures: [{ id: "openapi-missing", message: "No OpenAPI spec file found or configured", severity: "major" }],
      });
    }
    const abs = resolve(cwd, spec);
    const body = readFileSync(abs, "utf-8");
    const passed = looksLikeOpenApiFile(abs, body);
    return resultToEvidence({
      adapter: this.id,
      status: passed ? "passed" : "failed",
      artifacts: [spec],
      summary: passed ? "OpenAPI schema smoke validation passed" : "OpenAPI schema smoke validation failed",
      failures: passed ? [] : [{ id: "openapi-invalid", message: `${spec} does not look like an OpenAPI document`, severity: "major" }],
    });
  },
  summarize: summarizeEvidence,
};

const notebookDataAdapter = {
  id: "verify:notebook-data",
  label: "Notebook/data artifacts",
  async detect(ctx = {}) {
    const cwd = ctx.cwd ?? ".";
    const notebooks = discoverFiles(cwd, (rel) => rel.endsWith(".ipynb"), { maxFiles: 50 });
    const matched = notebooks.length > 0 || (ctx.changedFiles ?? []).some((file) => /\.ipynb$|analysis|notebook|data\//i.test(file));
    return {
      adapter: this.id,
      matched,
      confidence: matched ? 0.75 : 0,
      reasons: matched ? [`Notebook/data files: ${notebooks.slice(0, 3).join(", ") || "changed files"}`] : [],
      artifacts: notebooks,
    };
  },
  async plan(task = {}, ctx = {}) {
    const cwd = ctx.cwd ?? ".";
    const config = { ...(ctx.config ?? {}), ...(task.config ?? {}) };
    const notebooks = asArray(config.notebooks);
    return basePlan(this.id, {
      notebooks: notebooks.length ? notebooks : discoverFiles(cwd, (rel) => rel.endsWith(".ipynb"), { maxFiles: 50 }),
      requiredArtifacts: asArray(config.requiredArtifacts),
      command: config.command ?? config.executionCommand,
      dataSnapshot: config.dataSnapshot,
      seed: config.seed,
      artifactDiff: config.artifactDiff,
    }, { command: config.command ?? config.executionCommand });
  },
  async run(plan, ctx = {}, runner = defaultCommandRunner) {
    const cwd = ctx.cwd ?? ".";
    const command = plan.command ?? plan.config.command;
    let runnerResult = null;
    if (command) {
      const result = await runner(command, ctx);
      if ((result.exitCode ?? 1) !== 0) {
        return resultToEvidence({
          adapter: this.id,
          status: "failed",
          command,
          summary: "Notebook/data execution command failed",
          failures: [commandFailure(command, result)],
        });
      }
      runnerResult = parseNotebookRunnerResult(result.stdout);
    }
    const inspection = inspectNotebooks({ cwd, notebooks: asArray(plan.config.notebooks) });
    const runnerFailures = objectArray(runnerResult?.failures).map((failure, index) => ({
      id: failure.id ?? `notebook-runner-failure-${index + 1}`,
      message: failure.message ?? "Notebook runner reported a failure",
      severity: failure.severity ?? "major",
    }));
    const assertionFailures = objectArray(runnerResult?.assertions)
      .filter((assertion) => assertion.passed === false)
      .map((assertion, index) => ({
        id: assertion.id ?? `notebook-assertion-${index + 1}`,
        message: assertion.message ?? "Notebook runner assertion failed",
        severity: assertion.severity ?? "major",
      }));
    const requiredArtifacts = [
      ...asArray(plan.config.requiredArtifacts),
      ...asArray(runnerResult?.artifacts),
    ];
    const artifactCheck = compareArtifacts({
      cwd,
      requiredArtifacts,
      artifactDiff: plan.config.artifactDiff,
    });
    const failures = [
      ...inspection.failures,
      ...runnerFailures,
      ...assertionFailures,
      ...artifactCheck.failures,
    ];
    const artifacts = [
      ...asArray(plan.config.notebooks),
      ...artifactCheck.artifacts,
    ];
    if (failures.length) {
      return resultToEvidence({
        adapter: this.id,
        status: "failed",
        command,
        artifacts,
        summary: "Notebook/data verification found failures",
        failures,
        reproducibility: {
          seed: runnerResult?.seed ?? plan.config.seed,
          dataSnapshot: runnerResult?.dataSnapshot ?? plan.config.dataSnapshot,
          environment: runnerResult?.environment ?? environmentSummary(),
        },
        metadata: {
          notebooks: inspection.notebooks,
          artifactDiff: artifactCheck.metadata,
          runner: runnerResult?.metadata ?? null,
        },
      });
    }
    if (!command && !asArray(plan.config.requiredArtifacts).length && !plan.config.artifactDiff && !asArray(plan.config.notebooks).length) {
      return resultToEvidence({
        adapter: this.id,
        status: "skipped",
        summary: "No notebook/data command or required artifacts configured",
      });
    }
    return resultToEvidence({
      adapter: this.id,
      status: "passed",
      command,
      artifacts,
      summary: runnerResult?.summary ?? "Notebook/data verification passed",
      reproducibility: {
        seed: runnerResult?.seed ?? plan.config.seed,
        dataSnapshot: runnerResult?.dataSnapshot ?? plan.config.dataSnapshot,
        environment: runnerResult?.environment ?? environmentSummary(),
      },
      metadata: {
        notebooks: inspection.notebooks,
        artifactDiff: artifactCheck.metadata,
        runner: runnerResult?.metadata ?? null,
      },
    });
  },
  summarize: summarizeEvidence,
};

const sqlDbAdapter = {
  id: "verify:sql-db",
  label: "SQL/database validation",
  async detect(ctx = {}) {
    const cwd = ctx.cwd ?? ".";
    const sqlFiles = discoverFiles(cwd, (rel) => rel.endsWith(".sql"), { maxFiles: 100 });
    const matched = sqlFiles.length > 0 || (ctx.changedFiles ?? []).some((file) => /\.sql$|migrations|db\//i.test(file));
    return {
      adapter: this.id,
      matched,
      confidence: matched ? 0.75 : 0,
      reasons: matched ? [`SQL files: ${sqlFiles.slice(0, 3).join(", ") || "changed files"}`] : [],
      artifacts: sqlFiles,
    };
  },
  async plan(task = {}, ctx = {}) {
    const config = { ...(ctx.config ?? {}), ...(task.config ?? {}) };
    return basePlan(this.id, {
      files: asArray(config.files ?? config.sqlFiles),
      queries: asArray(config.queries ?? config.query),
      validationCommand: config.validationCommand ?? config.command,
      allowDestructive: config.allowDestructive === true,
      requiredArtifacts: asArray(config.requiredArtifacts),
      assertions: objectArray(config.assertions),
      artifactDiff: config.artifactDiff,
    }, { command: config.validationCommand ?? config.command });
  },
  async run(plan, ctx = {}, runner = defaultCommandRunner) {
    const cwd = ctx.cwd ?? ".";
    const files = asArray(plan.config.files ?? plan.config.sqlFiles);
    const queries = asArray(plan.config.queries ?? plan.config.query);
    const initialValidation = validateSqlPlan({
      cwd,
      files,
      queries,
      assertions: [],
      allowDestructive: plan.config.allowDestructive,
    });
    const sqlText = initialValidation.safety.entries.map((entry) => entry.sql).join("\n");
    const policyVerdict = initialValidation.destructiveSources.length
      ? await evaluateDataPolicyEvent({
        event: "BeforeToolUse",
        platform: ctx.platform ?? "unknown",
        runId: ctx.runId ?? "default",
        toolName: "SQL",
        payload: {
          sql: sqlText,
          allowDestructive: plan.config.allowDestructive,
          destructiveSources: initialValidation.destructiveSources,
        },
      }, { cwd, policy: ctx.policy ?? null })
      : null;
    const policyFailures = policyVerdict && !policyVerdict.ok
      ? policyVerdict.results
        .filter((result) => result.action === "deny" || result.action === "stop_loop")
        .map((result) => ({
          id: result.policyId,
          message: result.reason,
          severity: result.severity === "critical" ? "critical" : "major",
        }))
      : [];
    const blockingFailures = [
      ...initialValidation.failures.filter((failure) => failure.id === "destructive-sql"),
      ...policyFailures,
    ];
    if (blockingFailures.length) {
      return resultToEvidence({
        adapter: this.id,
        status: "blocked",
        artifacts: files,
        summary: "SQL validation blocked because destructive statements were detected",
        failures: blockingFailures,
        metadata: {
          destructiveSources: initialValidation.destructiveSources,
          policy: policyVerdict ? {
            ok: policyVerdict.ok,
            action: policyVerdict.action,
            results: policyVerdict.results,
          } : null,
        },
      });
    }
    const command = plan.command ?? plan.config.validationCommand;
    let runnerResult = null;
    if (command) {
      const result = await runner(command, ctx);
      if ((result.exitCode ?? 1) !== 0) {
        return resultToEvidence({
          adapter: this.id,
          status: "failed",
          command,
          artifacts: files,
          summary: "SQL validation command failed",
          failures: [commandFailure(command, result)],
        });
      }
      runnerResult = parseSqlRunnerResult(result.stdout);
    }
    const validation = validateSqlPlan({
      cwd,
      files,
      queries,
      assertions: objectArray(plan.config.assertions),
      allowDestructive: plan.config.allowDestructive,
      runnerResult,
    });
    const requiredArtifacts = [
      ...asArray(plan.config.requiredArtifacts),
      ...asArray(runnerResult?.artifacts),
      ...asArray(runnerResult?.explainPlanPath),
    ];
    const artifactCheck = compareArtifacts({
      cwd,
      requiredArtifacts,
      artifactDiff: plan.config.artifactDiff,
    });
    const failures = [
      ...validation.failures,
      ...artifactCheck.failures,
    ];
    const artifacts = [
      ...files,
      ...artifactCheck.artifacts,
    ];
    if (failures.length) {
      return resultToEvidence({
        adapter: this.id,
        status: "failed",
        command,
        artifacts,
        summary: "SQL validation found failures",
        failures,
        metadata: {
          assertions: validation.assertions,
          destructiveSources: validation.destructiveSources,
          artifactDiff: artifactCheck.metadata,
          runner: runnerResult?.metadata ?? null,
          explainPlan: runnerResult?.explainPlan ?? null,
        },
      });
    }
    if (!command && queries.length === 0 && files.length === 0) {
      return resultToEvidence({
        adapter: this.id,
        status: "skipped",
        summary: "No SQL validation command, query, or file configured",
      });
    }
    return resultToEvidence({
      adapter: this.id,
      status: "passed",
      command,
      artifacts,
      summary: runnerResult?.summary ?? (command ? "SQL validation command passed" : "SQL validation inputs passed static safety checks"),
      metadata: {
        assertions: validation.assertions,
        destructiveSources: validation.destructiveSources,
        artifactDiff: artifactCheck.metadata,
        runner: runnerResult?.metadata ?? null,
        explainPlan: runnerResult?.explainPlan ?? null,
      },
    });
  },
  summarize: summarizeEvidence,
};

const batchJobAdapter = {
  id: "verify:batch-job",
  label: "Batch job",
  async detect(ctx = {}) {
    const cwd = ctx.cwd ?? ".";
    const matched = existsSync(resolve(cwd, "Makefile"))
      || existsSync(resolve(cwd, ".github/workflows"))
      || (ctx.changedFiles ?? []).some((file) => /jobs?|batch|scripts\//i.test(file));
    return {
      adapter: this.id,
      matched,
      confidence: matched ? 0.55 : 0,
      reasons: matched ? ["Batch/job runner hints detected"] : [],
    };
  },
  async plan(task = {}, ctx = {}) {
    const config = { ...(ctx.config ?? {}), ...(task.config ?? {}) };
    return basePlan(this.id, {
      command: config.command,
      requiredArtifacts: asArray(config.requiredArtifacts),
      maxRuntimeSec: config.maxRuntimeSec ?? 600,
    }, { command: config.command });
  },
  async run(plan, ctx = {}, runner = defaultCommandRunner) {
    const cwd = ctx.cwd ?? ".";
    const command = plan.command ?? plan.config.command;
    if (!command) {
      return resultToEvidence({
        adapter: this.id,
        status: "blocked",
        summary: "verify:batch-job requires config.command",
        failures: [{ id: "missing-command", message: "No batch command configured", severity: "major" }],
      });
    }
    const result = await runner(command, { ...ctx, maxRuntimeSec: plan.config.maxRuntimeSec });
    if ((result.exitCode ?? 1) !== 0) {
      return resultToEvidence({
        adapter: this.id,
        status: "failed",
        command,
        summary: "Batch job command failed",
        failures: [commandFailure(command, result)],
      });
    }
    const missingArtifacts = validateArtifacts(cwd, asArray(plan.config.requiredArtifacts));
    if (missingArtifacts.length) {
      return resultToEvidence({
        adapter: this.id,
        status: "failed",
        command,
        artifacts: asArray(plan.config.requiredArtifacts),
        summary: "Batch job required artifacts are missing",
        failures: missingArtifacts.map((file) => ({ id: "artifact-missing", message: `Missing required artifact: ${file}`, severity: "major" })),
      });
    }
    return resultToEvidence({
      adapter: this.id,
      status: "passed",
      command,
      artifacts: asArray(plan.config.requiredArtifacts),
      summary: "Batch job command and artifacts passed",
    });
  },
  summarize: summarizeEvidence,
};

export const VERIFICATION_ADAPTERS = [
  webUiAdapter,
  cliAdapter,
  apiContractAdapter,
  notebookDataAdapter,
  sqlDbAdapter,
  batchJobAdapter,
];

const ADAPTER_MAP = new Map(VERIFICATION_ADAPTERS.map((adapter) => [adapter.id, adapter]));

export function getVerificationAdapter(id) {
  const normalized = normalizeAdapterId(id);
  return normalized ? ADAPTER_MAP.get(normalized) ?? null : null;
}

export async function detectVerificationAdapters(ctx = {}) {
  const results = [];
  for (const adapter of VERIFICATION_ADAPTERS) {
    results.push(await adapter.detect(ctx));
  }
  return results
    .filter((result) => result.matched)
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
}

export async function planVerificationAdapter(spec, ctx = {}) {
  const adapterId = normalizeAdapterId(spec?.adapter ?? spec?.id);
  const adapter = getVerificationAdapter(adapterId);
  if (!adapter) throw new Error(`unknown verification adapter: ${spec?.adapter ?? spec?.id ?? "<missing>"}`);
  return adapter.plan({ config: spec?.config ?? {} }, ctx);
}

export async function runVerificationAdapterSpec(spec, ctx = {}, runner = defaultCommandRunner) {
  const adapterId = normalizeAdapterId(spec?.adapter ?? spec?.id);
  const adapter = getVerificationAdapter(adapterId);
  if (!adapter) throw new Error(`unknown verification adapter: ${spec?.adapter ?? spec?.id ?? "<missing>"}`);
  const plan = spec?.schemaVersion === "verification-plan/v1" ? spec : await adapter.plan({ config: spec?.config ?? {} }, ctx);
  const beforePolicy = await evaluateVerificationPolicyEvent({ event: "BeforeVerification", plan, ctx });
  let evidence = policyFailures(beforePolicy).length > 0
    ? policyBlockedEvidence({
      adapter: adapter.id,
      verdict: beforePolicy,
      summary: "Verification blocked by policy before adapter execution",
    })
    : await adapter.run(plan, ctx, runner);
  const afterPolicy = await evaluateVerificationPolicyEvent({
    event: "AfterVerification",
    plan,
    evidence,
    ctx,
  });
  if (policyFailures(afterPolicy).length > 0) {
    evidence = policyBlockedEvidence({
      adapter: adapter.id,
      verdict: afterPolicy,
      summary: "Verification evidence blocked by policy after adapter execution",
    });
  }
  const exitCode = evidence?.status === "passed" ? 0 : 1;
  const verifierSummary = adapter.summarize(evidence);
  const result = { adapter: adapter.id, plan, evidence, exitCode, verifierSummary };
  if (ctx.writeEvidence) {
    result.evidenceLog = appendVerificationEvidence(evidence, { cwd: ctx.cwd ?? ".", runId: ctx.runId ?? "default" });
  }
  return result;
}

export function supportedVerificationAdapterIds() {
  return [...VERIFICATION_ADAPTER_IDS];
}

export function describeVerificationAdapter(id) {
  const adapter = getVerificationAdapter(id);
  return adapter ? { id: adapter.id, label: adapter.label } : null;
}

export function relativeArtifact(cwd, path) {
  return relative(cwd, resolve(cwd, path));
}
