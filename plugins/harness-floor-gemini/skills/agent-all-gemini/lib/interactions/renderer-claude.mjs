import { normalizeInteraction } from "./schema.mjs";

const LABELS = {
  en: { context: "Context", recommended: "(Recommended)", risk: "Risk" },
  ko: { context: "맥락", recommended: "(추천)", risk: "위험도" },
};

function labels(language) {
  return LABELS[language] ?? LABELS.en;
}

function orderedOptions(interaction) {
  const defaultIndex = interaction.options.findIndex((option) => option.id === interaction.defaultOptionId);
  if (defaultIndex < 0) return interaction.options;
  return [
    interaction.options[defaultIndex],
    ...interaction.options.filter((_, index) => index !== defaultIndex),
  ];
}

export function renderClaudeInteraction(input, { language = "en" } = {}) {
  const interaction = normalizeInteraction(input);
  const t = labels(language);
  const ordered = orderedOptions(interaction);
  const optionIdOrder = ordered.map((option) => option.id);
  return {
    optionIdOrder,
    questions: [{
      question: `[${interaction.kind}] ${interaction.title}\n\n${t.context}: ${interaction.context}`,
      header: interaction.title.slice(0, 12),
      multiSelect: false,
      options: ordered.map((option, index) => ({
        label: index === 0 ? `${t.recommended} ${option.label}` : option.label,
        description: [
          option.description,
          option.risk && option.risk !== "low" ? `${t.risk}: ${option.risk}` : "",
        ].filter(Boolean).join(" "),
      })),
    }],
  };
}

export function selectedClaudeOptionId(rendered, chosen) {
  if (typeof chosen === "number") return rendered.optionIdOrder[chosen] ?? rendered.optionIdOrder[0] ?? null;
  return rendered.optionIdOrder[0] ?? null;
}

