// tests/fixtures/evals/checkers/docs-only.check.mjs
import { existsSync, readFileSync } from "node:fs";
const ok = existsSync("README.md") && /GET \/widgets/.test(readFileSync("README.md", "utf-8"));
process.exit(ok ? 0 : 1);
