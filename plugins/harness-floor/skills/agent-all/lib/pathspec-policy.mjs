const BLOCK_RULES = [
  { name: "git add -A", pattern: /\bgit\s+add\s+(-A|--all)\b/ },
  { name: "git commit -a", pattern: /\bgit\s+commit\b(?=[^\n]*(?:\s-a[m\s]|\s--all\b))/ },
  { name: "git commit --amend", pattern: /\bgit\s+commit\b(?=[^\n]*--amend\b)/ },
  { name: "git push --force", pattern: /\bgit\s+push\b(?=[^\n]*--force(?:-with-lease)?\b)/ },
  { name: "git reset --hard", pattern: /\bgit\s+reset\s+--hard\b/ },
  { name: "git checkout --", pattern: /\bgit\s+checkout\s+--\s+/ },
  { name: "docker volume rm", pattern: /\bdocker\s+volume\s+rm\b/ },
];

function commitHasPathspec(command) {
  const sep = command.indexOf(" -- ");
  if (sep === -1) return false;
  return command.slice(sep + 4).trim().length > 0;
}

export function analyzeShellCommand(command) {
  const text = String(command || "");
  for (const rule of BLOCK_RULES) {
    if (rule.pattern.test(text)) {
      return { blocked: true, reason: rule.name };
    }
  }
  if (/\bgit\s+commit\b/.test(text) && !commitHasPathspec(text)) {
    return { blocked: true, reason: "git commit requires explicit pathspec after --" };
  }
  return { blocked: false, reason: null };
}
