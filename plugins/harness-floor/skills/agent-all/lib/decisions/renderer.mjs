import { decisionToInteraction } from "../interactions/schema.mjs";

const LABELS = {
  en: { context: "Context", reasoning: "Reasoning for recommendation", recommended: "(Recommended)" },
  ko: { context: "맥락", reasoning: "추천 사유", recommended: "(추천)" },
};

export function renderToAskUserQuestion(decision, { taskTitle, language = "en" } = {}) {
  const t = LABELS[language] || LABELS.en;
  const interaction = decisionToInteraction(decision, {
    taskId: taskTitle,
    taskTitle,
  });
  const recId = interaction.defaultOptionId;
  const reordered = [
    interaction.options.find((option) => option.id === recId),
    ...interaction.options.filter((option) => option.id !== recId),
  ].filter(Boolean);
  const options = reordered.map((opt, i) => ({
    label: i === 0 ? `${t.recommended} ${opt.label}` : opt.label,
    description: opt.description,
  }));
  return {
    optionIdOrder: reordered.map((option) => option.id),
    questions: [{
      question: `[${taskTitle}] ${decision.title}\n\n${t.context}: ${decision.context}\n\n${t.reasoning}: ${decision.reasoning}`,
      header: decision.title.slice(0, 12),
      multiSelect: false,
      options,
    }],
  };
}
