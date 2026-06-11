import { normalizeInteraction } from "./schema.mjs";

export function renderCodexInteraction(input) {
  const interaction = normalizeInteraction(input);
  return {
    prompt: [
      `[${interaction.kind}] ${interaction.title}`,
      interaction.context,
      `Non-TTY policy: ${interaction.nonTtyPolicy}`,
    ].filter(Boolean).join("\n\n"),
    choices: interaction.options.map((option) => option.label),
    optionIdOrder: interaction.options.map((option) => option.id),
    defaultOptionId: interaction.defaultOptionId,
  };
}

