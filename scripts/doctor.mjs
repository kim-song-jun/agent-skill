#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runDoctorCli } from "../plugins/harness-builder/skills/agent-init/lib/doctor-core.mjs";

export {
  CONTRACTS,
  USAGE,
  parseArgs,
  printHuman,
  runDoctor,
  runDoctorCli,
} from "../plugins/harness-builder/skills/agent-init/lib/doctor-core.mjs";

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runDoctorCli();
}
