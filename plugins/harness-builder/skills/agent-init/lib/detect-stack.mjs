import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const RULES = [
  { stack: "typescript", check: (d) => existsSync(join(d, "package.json")) && existsSync(join(d, "tsconfig.json")) },
  { stack: "javascript", check: (d) => existsSync(join(d, "package.json")) },
  { stack: "python",     check: (d) => existsSync(join(d, "pyproject.toml")) || existsSync(join(d, "requirements.txt")) || existsSync(join(d, "setup.py")) },
  { stack: "rust",       check: (d) => existsSync(join(d, "Cargo.toml")) },
  { stack: "go",         check: (d) => existsSync(join(d, "go.mod")) },
];

const COMPOSE_CANDIDATES = [
  "docker-compose.yml",
  "docker-compose.yaml",
  "compose.yml",
  "compose.yaml",
];

function detectStackInner(projectDir) {
  for (const r of RULES) {
    if (r.check(projectDir)) return r.stack;
  }
  return "unknown";
}

function findComposeFile(projectDir) {
  for (const name of COMPOSE_CANDIDATES) {
    const p = join(projectDir, name);
    if (existsSync(p)) return p;
  }
  return null;
}

export function parseComposeServices(text) {
  if (typeof text !== "string" || text.length === 0) return [];
  const lines = text.split(/\r?\n/);
  let i = 0;
  // Find top-level `services:` line (column 0).
  while (i < lines.length && !/^services\s*:\s*$/.test(lines[i])) i++;
  if (i >= lines.length) return [];
  i++; // move past the `services:` line itself
  const out = [];
  for (; i < lines.length; i++) {
    const raw = lines[i];
    if (raw === "" || /^\s*#/.test(raw)) continue;
    // A new top-level key at column 0 ends the services section.
    if (/^\S/.test(raw)) break;
    // Exactly two-space indent followed by a service name.
    const m = /^ {2}([A-Za-z0-9_.-]+)\s*:\s*$/.exec(raw);
    if (m) out.push(m[1]);
    // Lines deeper than 2 spaces (service body) are ignored.
  }
  return out.sort();
}

export function detectProject(projectDir) {
  if (!existsSync(projectDir)) {
    return { stack: "unknown", runtime: null, services: [] };
  }
  const stack = detectStackInner(projectDir);
  const composePath = findComposeFile(projectDir);
  const hasDockerfile = existsSync(join(projectDir, "Dockerfile"));
  const runtime = (hasDockerfile || composePath) ? "docker" : null;
  let services = [];
  if (composePath) {
    try {
      services = parseComposeServices(readFileSync(composePath, "utf-8"));
    } catch {
      services = [];
    }
  }
  return { stack, runtime, services };
}

export function detectStack(projectDir) {
  return detectProject(projectDir).stack;
}
