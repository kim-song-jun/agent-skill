// plugins/harness-floor/skills/harness/lib/routing-map.mjs
// Front-door routing data + deterministic scorer for /harness.
// rankRoutes is a SEED for the model; the skill refines with judgment and always confirms via AskUserQuestion.

export const ROUTING_TABLE = [
  { target: "/agent-init",    kind: "skill", when: "start a new project / adopt the harness on a repo",        signals: ["init", "scaffold", "set up", "new project", "adopt", "onboard", "bootstrap"] },
  { target: "/agent-all",     kind: "skill", when: "ship a feature or bugfix as a gated PR",                   signals: ["feature", "implement", "build the", "ship", " pr", "add ", "bugfix"] },
  { target: "/debug",         kind: "skill", when: "investigate a failing command / flaky test / regression",  signals: ["debug", "failing", "flaky", "regression", "crash", "stack trace", "why does"] },
  { target: "/explore",       kind: "skill", when: "map / understand the codebase",                            signals: ["explore", "map the", "understand", "where is", "architecture", "overview", "codebase"] },
  { target: "/thrift",        kind: "skill", when: "control cost / manage a long session's context",           signals: ["cost", "budget", "token", "long session", "context window", "expensive", "summarize session"] },
  { target: "/wiki",          kind: "skill", when: "read/write/compile durable project knowledge",             signals: ["wiki", "knowledge base", "document this", "decision log", "project notes"] },
  { target: "/visual-qa",     kind: "skill", when: "capture screenshots / visual regression of a UI",          signals: ["screenshot", "visual", " ui", "browser", "playwright", "design review"] },
  { target: "/data-runner",   kind: "skill", when: "verify notebooks / SQL / ETL / dataset artifacts",         signals: ["notebook", "sql", "etl", "csv", "parquet", "dataset", "data pipeline", "metrics"] },
  { target: "/agent-handoff", kind: "skill", when: "hand off an in-progress /agent-all task to a new session", signals: ["handoff", "hand off", "new session", "resume the task", "dispatch task"] },
  { target: "Workflow",       kind: "tool",  when: "breadth-first evidence: audit/fact-check/research report",  signals: ["audit", "research", "fact-check", "review many", "map-reduce", "report", "findings", "investigate across"] },
];

export function rankRoutes(intent) {
  const text = String(intent ?? "").toLowerCase();
  return ROUTING_TABLE
    .map((route) => ({
      target: route.target,
      kind: route.kind,
      when: route.when,
      score: route.signals.reduce((n, sig) => n + (text.includes(sig) ? 1 : 0), 0),
    }))
    .sort((a, b) => b.score - a.score); // Array.prototype.sort is stable in Node → ties keep ROUTING_TABLE order
}
