import { normalizeInteraction, validateInteraction } from "./schema.mjs";

export function resolveNonTtyInteraction(input, { now = new Date() } = {}) {
  const validation = validateInteraction(input);
  if (!validation.ok) {
    return {
      action: "fail",
      selectedOptionId: null,
      reason: `invalid interaction: ${validation.errors.map((error) => `${error.path} ${error.message}`).join("; ")}`,
      timestamp: now instanceof Date ? now.toISOString() : String(now),
      interaction: normalizeInteraction(input),
    };
  }

  const interaction = validation.interaction;
  const timestamp = now instanceof Date ? now.toISOString() : String(now);
  const selected = interaction.options.find((option) => option.id === interaction.defaultOptionId)
    ?? interaction.options.find((option) => option.recommended)
    ?? null;

  if (interaction.nonTtyPolicy === "pause") {
    return { action: "pause", selectedOptionId: null, reason: "non-TTY policy requires pause", timestamp, interaction };
  }
  if (interaction.nonTtyPolicy === "fail") {
    return { action: "fail", selectedOptionId: null, reason: "non-TTY policy requires failure", timestamp, interaction };
  }
  if (interaction.nonTtyPolicy === "continue_with_warning") {
    return {
      action: "continue_with_warning",
      selectedOptionId: selected?.risk === "high" ? null : selected?.id ?? null,
      reason: selected?.risk === "high"
        ? "high-risk option cannot be auto-selected in non-TTY mode"
        : "continued with warning per non-TTY policy",
      timestamp,
      interaction,
    };
  }

  if (!selected) {
    return { action: "pause", selectedOptionId: null, reason: "no recommended option for non-TTY auto-selection", timestamp, interaction };
  }
  if (selected.risk === "high") {
    return {
      action: "blocked",
      selectedOptionId: null,
      reason: `high-risk option cannot be auto-selected in non-TTY mode: ${selected.label}`,
      timestamp,
      interaction,
    };
  }
  return {
    action: "selected",
    selectedOptionId: selected.id,
    reason: selected.recommended ? "recommended option auto-selected" : "default option auto-selected",
    timestamp,
    interaction,
  };
}

