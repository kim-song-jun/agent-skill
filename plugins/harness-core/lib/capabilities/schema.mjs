export const SUPPORT_LEVELS = ["native", "partial", "soft", "unsupported"];

export const PLATFORMS = [
  "claude",
  "codex",
  "copilot",
  "cursor",
  "gemini",
  "vscode-copilot",
];

export function normalizeCapability(input = {}) {
  const platformSupport = {};
  for (const platform of PLATFORMS) {
    platformSupport[platform] = input.platformSupport?.[platform] ?? "unsupported";
  }
  return {
    id: input.id ?? "",
    name: input.name ?? input.id ?? "",
    command: input.command ?? "",
    description: input.description ?? "",
    inputs: input.inputs ?? {},
    outputs: input.outputs ?? {},
    requiredHooks: Array.isArray(input.requiredHooks) ? input.requiredHooks : [],
    requiredArtifacts: Array.isArray(input.requiredArtifacts) ? input.requiredArtifacts : [],
    platformSupport,
  };
}

export function validateCapability(input = {}) {
  const capability = normalizeCapability(input);
  const errors = [];
  if (!capability.id) errors.push("id is required");
  if (!/^[a-z][a-z0-9-]*$/.test(capability.id)) errors.push(`id must be kebab-case: ${capability.id}`);
  if (!capability.name) errors.push(`${capability.id || "capability"} name is required`);
  if (!capability.command) errors.push(`${capability.id || "capability"} command is required`);
  if (!capability.description) errors.push(`${capability.id || "capability"} description is required`);
  if (!isPlainObject(capability.inputs)) errors.push(`${capability.id} inputs must be an object`);
  if (!isPlainObject(capability.outputs)) errors.push(`${capability.id} outputs must be an object`);
  for (const platform of PLATFORMS) {
    const support = capability.platformSupport[platform];
    if (!SUPPORT_LEVELS.includes(support)) {
      errors.push(`${capability.id} platformSupport.${platform} must be one of ${SUPPORT_LEVELS.join(", ")}`);
    }
  }
  return { ok: errors.length === 0, capability, errors };
}

export function assertValidCapabilities(capabilities = []) {
  const errors = [];
  const seen = new Set();
  for (const [index, capability] of capabilities.entries()) {
    const result = validateCapability(capability);
    if (!result.ok) errors.push(...result.errors.map((error) => `capabilities[${index}]: ${error}`));
    if (seen.has(result.capability.id)) errors.push(`duplicate capability id: ${result.capability.id}`);
    seen.add(result.capability.id);
  }
  if (errors.length) {
    const error = new Error(`invalid capability catalog: ${errors.join("; ")}`);
    error.errors = errors;
    throw error;
  }
  return true;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
