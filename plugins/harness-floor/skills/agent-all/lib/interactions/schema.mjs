export const INTERACTION_SCHEMA_VERSION = "agent-interaction/v1";

export const INTERACTION_KINDS = [
  "decision",
  "confirmation",
  "resume",
  "budget_warning",
  "blocked",
  "handoff",
];

export const NON_TTY_POLICIES = [
  "choose_recommended",
  "pause",
  "fail",
  "continue_with_warning",
];

export const RISKS = ["low", "medium", "high"];

function stringOrNull(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function booleanOrDefault(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeRisk(value) {
  return RISKS.includes(value) ? value : "low";
}

function normalizeOption(option, index) {
  const raw = option && typeof option === "object" ? option : {};
  const label = stringOrNull(raw.label) ?? `Option ${index + 1}`;
  return {
    id: stringOrNull(raw.id) ?? `option-${index}`,
    label,
    description: stringOrNull(raw.description) ?? "",
    recommended: Boolean(raw.recommended),
    risk: normalizeRisk(raw.risk),
    metadata: raw.metadata && typeof raw.metadata === "object" ? raw.metadata : {},
  };
}

function defaultOptionId(options, explicit) {
  if (explicit && options.some((option) => option.id === explicit)) return explicit;
  return options.find((option) => option.recommended)?.id ?? options[0]?.id ?? null;
}

export function normalizeInteraction(input = {}) {
  const raw = input && typeof input === "object" ? input : {};
  const kind = INTERACTION_KINDS.includes(raw.kind) ? raw.kind : "decision";
  const options = Array.isArray(raw.options) ? raw.options.map(normalizeOption) : [];
  const resolvedDefaultOptionId = defaultOptionId(options, raw.defaultOptionId);

  return {
    schemaVersion: raw.schemaVersion || INTERACTION_SCHEMA_VERSION,
    id: stringOrNull(raw.id) ?? `${kind}-${Date.now()}`,
    kind,
    title: stringOrNull(raw.title) ?? "Decision",
    context: stringOrNull(raw.context) ?? "",
    options,
    defaultOptionId: resolvedDefaultOptionId,
    requireUserInput: booleanOrDefault(raw.requireUserInput, false),
    nonTtyPolicy: NON_TTY_POLICIES.includes(raw.nonTtyPolicy)
      ? raw.nonTtyPolicy
      : "choose_recommended",
    metadata: raw.metadata && typeof raw.metadata === "object" ? raw.metadata : {},
  };
}

export function validateInteraction(input = {}) {
  const interaction = normalizeInteraction(input);
  const errors = [];
  if (interaction.schemaVersion !== INTERACTION_SCHEMA_VERSION) {
    errors.push({ path: "schemaVersion", message: `must be ${INTERACTION_SCHEMA_VERSION}` });
  }
  if (!INTERACTION_KINDS.includes(interaction.kind)) {
    errors.push({ path: "kind", message: `must be one of ${INTERACTION_KINDS.join("|")}` });
  }
  if (!interaction.id) errors.push({ path: "id", message: "required" });
  if (!interaction.title) errors.push({ path: "title", message: "required" });
  if (!Array.isArray(interaction.options) || interaction.options.length === 0) {
    errors.push({ path: "options", message: "must be a non-empty array" });
  }
  const optionIds = new Set();
  for (const [index, option] of interaction.options.entries()) {
    if (!option.id) errors.push({ path: `options[${index}].id`, message: "required" });
    if (optionIds.has(option.id)) errors.push({ path: `options[${index}].id`, message: "must be unique" });
    optionIds.add(option.id);
    if (!option.label) errors.push({ path: `options[${index}].label`, message: "required" });
    if (!RISKS.includes(option.risk)) errors.push({ path: `options[${index}].risk`, message: `must be one of ${RISKS.join("|")}` });
  }
  if (interaction.defaultOptionId && !optionIds.has(interaction.defaultOptionId)) {
    errors.push({ path: "defaultOptionId", message: "must match an option id" });
  }
  if (!NON_TTY_POLICIES.includes(interaction.nonTtyPolicy)) {
    errors.push({ path: "nonTtyPolicy", message: `must be one of ${NON_TTY_POLICIES.join("|")}` });
  }
  return { ok: errors.length === 0, interaction, errors };
}

export function decisionToInteraction(decision, {
  taskId,
  taskTitle = taskId,
  nonTtyPolicy = "choose_recommended",
} = {}) {
  const options = (decision.options ?? []).map((option, index) => ({
    id: `option-${index}`,
    label: option.label,
    description: option.description,
    recommended: index === decision.recommended_index,
    risk: option.risk ?? "low",
    metadata: { originalIndex: index },
  }));
  return normalizeInteraction({
    id: `${taskId ?? "task"}:${decision.id}`,
    kind: "decision",
    title: decision.title,
    context: [
      decision.context ? `Context: ${decision.context}` : "",
      decision.reasoning ? `Reasoning: ${decision.reasoning}` : "",
    ].filter(Boolean).join("\n\n"),
    options,
    defaultOptionId: `option-${decision.recommended_index}`,
    requireUserInput: false,
    nonTtyPolicy,
    metadata: {
      taskId,
      taskTitle,
      decisionId: decision.id,
      reasoning: decision.reasoning ?? "",
    },
  });
}

