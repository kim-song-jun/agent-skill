// tests/fixtures/evals/checkers/backend-api.check.mjs
import { existsSync } from "node:fs";
const ok = existsSync("tests/contracts/backend-api.contract.json");
process.exit(ok ? 0 : 1);
