import { createHash } from "node:crypto";

export function issueKey(issue) {
  const sig = `${issue.page}|${issue.component}|${issue.state}|${issue.bp}|${issue.category}|${issue.description}`;
  const hash = createHash("sha1").update(sig).digest("hex").slice(0, 8);
  return `${issue.page}/${issue.component}/${issue.state}/${issue.bp}/${issue.category}/${hash}`;
}

export function diffRuns(currentIssues, priorRun) {
  const currentMap = new Map(currentIssues.map(i => [issueKey(i), i]));
  const priorIssues = priorRun?.issues ?? [];
  const priorMap = new Map(priorIssues.map(i => [issueKey(i), i]));

  const newIssues = [];
  const unchanged = [];
  for (const [k, issue] of currentMap) {
    if (priorMap.has(k)) unchanged.push(issue);
    else newIssues.push(issue);
  }
  const resolved = [];
  for (const [k, issue] of priorMap) {
    if (!currentMap.has(k)) resolved.push(issue);
  }
  return { new: newIssues, resolved, unchanged };
}
