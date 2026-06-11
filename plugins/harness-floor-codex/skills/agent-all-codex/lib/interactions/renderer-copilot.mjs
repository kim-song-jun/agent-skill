import { normalizeInteraction } from "./schema.mjs";

export function renderCopilotInteraction(input) {
  const interaction = normalizeInteraction(input);
  return [
    `## ${interaction.title}`,
    "",
    interaction.context,
    "",
    ...interaction.options.map((option) => (
      `- [${option.recommended ? "recommended" : "option"}] ${option.id}: ${option.label}`
      + (option.description ? ` — ${option.description}` : "")
      + (option.risk !== "low" ? ` (risk: ${option.risk})` : "")
    )),
    "",
    `Non-TTY policy: ${interaction.nonTtyPolicy}`,
  ].join("\n");
}

