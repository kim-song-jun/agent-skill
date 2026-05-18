// report-renderer — turn a structured `report.json` into a markdown report.
//
// Input shape (subset enforced):
//   {
//     summary: {totalCaptures, totalIssues, critical, major, minor, costUSD},
//     diff: {new: [...], resolved: [...], unchanged: [...]},
//     pages: [{name, status, captures, issues: [...]}],
//     run: {slug, finishedAt, model},
//   }

function fmtIssue(issue) {
  const sev = issue.severity ?? "(unspecified)";
  const cat = issue.category ?? "(uncategorized)";
  const where = [issue.page, issue.component, issue.state, issue.bp].filter(Boolean).join(" / ");
  return `- [${sev}] ${cat} — ${where}\n  ${issue.description ?? ""}`;
}

function fmtSection(title, items, formatter) {
  if (!items || items.length === 0) {
    return `### ${title}\n\n_None._\n`;
  }
  return `### ${title}\n\n${items.map(formatter).join("\n")}\n`;
}

export function renderReport(report) {
  if (!report || typeof report !== "object") {
    throw new Error("renderReport: report must be an object");
  }
  const sum = report.summary ?? {};
  const diff = report.diff ?? { new: [], resolved: [], unchanged: [] };
  const run = report.run ?? {};
  const pages = report.pages ?? [];

  const lines = [];
  lines.push(`# Visual QA Report — ${run.slug ?? "(unnamed)"}\n`);
  lines.push(`_Finished: ${run.finishedAt ?? "n/a"} — Model: ${run.model ?? "n/a"}_\n`);
  lines.push("## Summary\n");
  lines.push(`- Captures: **${sum.totalCaptures ?? 0}**`);
  lines.push(`- Issues: **${sum.totalIssues ?? 0}** (critical: ${sum.critical ?? 0}, major: ${sum.major ?? 0}, minor: ${sum.minor ?? 0})`);
  lines.push(`- Cost: **$${(sum.costUSD ?? 0).toFixed(4)}**`);
  lines.push("");
  lines.push("## Diff vs prior run\n");
  lines.push(fmtSection("New", diff.new, fmtIssue));
  lines.push(fmtSection("Resolved", diff.resolved, fmtIssue));
  lines.push(fmtSection("Unchanged", diff.unchanged, fmtIssue));
  lines.push("## Pages\n");
  for (const page of pages) {
    lines.push(`### ${page.name} — _${page.status ?? "unknown"}_`);
    lines.push(`Captures: ${page.captures ?? 0}`);
    if (page.issues && page.issues.length) {
      lines.push("");
      for (const issue of page.issues) {
        lines.push(fmtIssue(issue));
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

export const __internal = { fmtIssue, fmtSection };
