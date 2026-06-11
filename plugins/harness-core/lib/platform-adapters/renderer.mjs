import { CAPABILITIES } from "../../capabilities/catalog.mjs";
import { PLATFORMS, SUPPORT_LEVELS, normalizeCapability } from "../capabilities/schema.mjs";

export const PLATFORM_LABELS = {
  claude: "Claude Code",
  codex: "Codex CLI",
  copilot: "GitHub Copilot CLI",
  cursor: "Cursor",
  gemini: "Gemini CLI",
  "vscode-copilot": "VS Code Copilot",
};

export function renderPlatformCapabilities({
  platform,
  capabilities = CAPABILITIES,
  includeUnsupported = false,
} = {}) {
  if (!PLATFORMS.includes(platform)) {
    throw new Error(`unknown platform: ${platform}`);
  }
  const label = PLATFORM_LABELS[platform] ?? platform;
  const rows = capabilities
    .map(normalizeCapability)
    .filter((capability) => includeUnsupported || capability.platformSupport[platform] !== "unsupported");

  const lines = [
    `# ${label} Capability Adapter`,
    "",
    "This file is rendered from `plugins/harness-core/capabilities/catalog.mjs`.",
    "Platform adapters should translate these core capabilities to host-native files without redefining capability semantics.",
    "",
    "| Capability | Command | Support | Required artifacts |",
    "|---|---|---|---|",
  ];

  for (const capability of rows) {
    lines.push([
      capability.name,
      code(capability.command),
      supportLabel(capability.platformSupport[platform]),
      capability.requiredArtifacts.length ? capability.requiredArtifacts.map(code).join(", ") : "none",
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

export function renderSupportMatrix({
  capabilities = CAPABILITIES,
  platforms = PLATFORMS,
} = {}) {
  const normalized = capabilities.map(normalizeCapability);
  const lines = [
    "# Agent Skill Support Matrix",
    "",
    "Generated from `plugins/harness-core/capabilities/catalog.mjs`.",
    "Run `node scripts/generate-support-matrix.mjs --check` to detect drift.",
    "",
    `| Capability | ${platforms.map((platform) => PLATFORM_LABELS[platform] ?? platform).join(" | ")} |`,
    `|---|${platforms.map(() => "---").join("|")}|`,
  ];
  for (const capability of normalized) {
    lines.push(`| ${capability.name} | ${platforms.map((platform) => supportLabel(capability.platformSupport[platform])).join(" | ")} |`);
  }
  lines.push("");
  lines.push("Legend: `native` = host-native command/UX, `partial` = runnable with platform limitations, `soft` = prompt/instruction-level guidance, `unsupported` = not shipped.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

export function supportLabel(value) {
  if (!SUPPORT_LEVELS.includes(value)) return "unsupported";
  return value;
}

function code(value) {
  return `\`${String(value).replaceAll("|", "\\|")}\``;
}
