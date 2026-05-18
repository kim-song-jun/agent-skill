// Verdict computer for comprehensive-mode visual-qa.
//
// Compares the issue set produced by the current run against the
// baseline (prior accepted run) and decides whether the loop should
// break.
//
// Pure function — no I/O. The baseline issue list and current run's
// issue list are produced by Phase 4's aggregator from
// `<image>.analysis.json` files.
//
// Issue key = (page, component, category, message-hash). We bucket
// issues by that key so a moved button that produces the same issue
// in a new location is still treated as a regression.
//
// Output:
//   {
//     pass: bool,
//     newCritical: Issue[],
//     newMajor: Issue[],
//     newMinor: Issue[],
//     regressed: Issue[],    // present in baseline AND current with worse severity
//     fixed: Issue[],        // present in baseline, gone in current
//     reason: string,        // human-readable summary
//   }

import { createHash } from "node:crypto";

const SEVERITY_RANK = { critical: 3, major: 2, minor: 1 };

function issueKey(issue) {
  if (!issue) return null;
  const msgHash = createHash("sha256")
    .update(String(issue.message ?? ""))
    .digest("hex")
    .slice(0, 8);
  return [
    issue.page ?? "",
    issue.component ?? "",
    issue.category ?? "",
    msgHash,
  ].join("|");
}

function indexIssues(issues) {
  const map = new Map();
  if (!Array.isArray(issues)) return map;
  for (const i of issues) {
    const k = issueKey(i);
    if (k) map.set(k, i);
  }
  return map;
}

function severityRank(s) {
  return SEVERITY_RANK[s] ?? 0;
}

export function computeVerdict({ thisRun, baseline, failOn }) {
  const thisRunIssues = Array.isArray(thisRun?.issues) ? thisRun.issues : [];
  const baselineIssues = Array.isArray(baseline?.issues) ? baseline.issues : [];
  const failSet = new Set(Array.isArray(failOn) ? failOn : ["critical", "major"]);

  const thisIdx = indexIssues(thisRunIssues);
  const baseIdx = indexIssues(baselineIssues);

  const newCritical = [];
  const newMajor = [];
  const newMinor = [];
  const regressed = [];
  const fixed = [];

  for (const [k, issue] of thisIdx.entries()) {
    if (!baseIdx.has(k)) {
      // New issue
      if (issue.severity === "critical") newCritical.push(issue);
      else if (issue.severity === "major") newMajor.push(issue);
      else newMinor.push(issue);
    } else {
      const prev = baseIdx.get(k);
      if (severityRank(issue.severity) > severityRank(prev.severity)) {
        regressed.push({ ...issue, previousSeverity: prev.severity });
      }
    }
  }
  for (const [k, issue] of baseIdx.entries()) {
    if (!thisIdx.has(k)) fixed.push(issue);
  }

  const failingBuckets = [];
  if (failSet.has("critical") && newCritical.length) failingBuckets.push(`${newCritical.length} new critical`);
  if (failSet.has("major") && newMajor.length) failingBuckets.push(`${newMajor.length} new major`);
  if (failSet.has("minor") && newMinor.length) failingBuckets.push(`${newMinor.length} new minor`);
  // Regressions are always failing — they're a worsening of a known issue.
  if (regressed.length) failingBuckets.push(`${regressed.length} regressed`);

  const pass = failingBuckets.length === 0;
  return {
    pass,
    newCritical,
    newMajor,
    newMinor,
    regressed,
    fixed,
    reason: pass
      ? "no new critical/major issues vs baseline"
      : `fail: ${failingBuckets.join(", ")}`,
  };
}

// First-run path: when there is no baseline yet, this function returns
// the verdict that the loop should treat as "pass" while the calling
// phase writes the current run as the new baseline. firstRun policy
// values from .visual-qa.json.comprehensive.verdict.firstRun:
//   "auto-pass"  — pass (default). Write baseline. Loop breaks.
//   "report"     — pass but flag report-only mode.
//   "block"      — fail with reason "baseline not yet established".
export function firstRunVerdict({ thisRun, firstRun }) {
  const policy = firstRun ?? "auto-pass";
  const thisRunIssues = Array.isArray(thisRun?.issues) ? thisRun.issues : [];
  const buckets = thisRunIssues.reduce(
    (acc, i) => {
      const k = i.severity === "critical" ? "critical" : i.severity === "major" ? "major" : "minor";
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    },
    { critical: 0, major: 0, minor: 0 },
  );
  if (policy === "block") {
    return {
      pass: false,
      newCritical: thisRunIssues.filter((i) => i.severity === "critical"),
      newMajor:    thisRunIssues.filter((i) => i.severity === "major"),
      newMinor:    thisRunIssues.filter((i) => i.severity === "minor"),
      regressed: [],
      fixed: [],
      reason: "baseline not yet established (firstRun=block)",
      isFirstRun: true,
    };
  }
  if (policy === "report") {
    return {
      pass: true,
      newCritical: thisRunIssues.filter((i) => i.severity === "critical"),
      newMajor:    thisRunIssues.filter((i) => i.severity === "major"),
      newMinor:    thisRunIssues.filter((i) => i.severity === "minor"),
      regressed: [],
      fixed: [],
      reason: `report-only first run: ${buckets.critical}c ${buckets.major}m ${buckets.minor}n issues`,
      isFirstRun: true,
    };
  }
  // default: auto-pass
  return {
    pass: true,
    newCritical: [],
    newMajor: [],
    newMinor: [],
    regressed: [],
    fixed: [],
    reason: "first run — baseline written, loop free to break",
    isFirstRun: true,
  };
}

export const __test__ = { issueKey, indexIssues };
