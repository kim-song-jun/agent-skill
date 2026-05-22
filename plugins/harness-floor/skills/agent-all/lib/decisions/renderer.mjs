const LABELS = {
  en: { context: "Context", reasoning: "Reasoning for recommendation", recommended: "(Recommended)" },
  ko: { context: "맥락", reasoning: "추천 사유", recommended: "(추천)" },
};

export function renderToAskUserQuestion(decision, { taskTitle, language = "en" } = {}) {
  const t = LABELS[language] || LABELS.en;
  const recIdx = decision.recommended_index;
  const reordered = [
    decision.options[recIdx],
    ...decision.options.filter((_, i) => i !== recIdx),
  ];
  const options = reordered.map((opt, i) => ({
    label: i === 0 ? `${t.recommended} ${opt.label}` : opt.label,
    description: opt.description,
  }));
  return {
    questions: [{
      question: `[${taskTitle}] ${decision.title}\n\n${t.context}: ${decision.context}\n\n${t.reasoning}: ${decision.reasoning}`,
      header: decision.title.slice(0, 12),
      multiSelect: false,
      options,
    }],
  };
}
