// tests/fixtures/evals/checkers/small-web-ui.check.mjs
import { existsSync } from "node:fs";
const ok = existsSync("src/components/widgets/empty-state.marker");
process.exit(ok ? 0 : 1);
