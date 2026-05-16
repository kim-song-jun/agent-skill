import { existsSync } from "node:fs";
import { join } from "node:path";

const RULES = [
  { stack: "typescript", check: (d) => existsSync(join(d, "package.json")) && existsSync(join(d, "tsconfig.json")) },
  { stack: "javascript", check: (d) => existsSync(join(d, "package.json")) },
  { stack: "python",     check: (d) => existsSync(join(d, "pyproject.toml")) || existsSync(join(d, "requirements.txt")) || existsSync(join(d, "setup.py")) },
  { stack: "rust",       check: (d) => existsSync(join(d, "Cargo.toml")) },
  { stack: "go",         check: (d) => existsSync(join(d, "go.mod")) },
];

export function detectStack(projectDir) {
  if (!existsSync(projectDir)) return "unknown";
  for (const r of RULES) {
    if (r.check(projectDir)) return r.stack;
  }
  return "unknown";
}
