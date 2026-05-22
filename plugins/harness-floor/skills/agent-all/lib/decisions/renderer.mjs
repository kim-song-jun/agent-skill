export function renderToAskUserQuestion(decision, { taskTitle }) {
  const recIdx = decision.recommended_index;
  const reordered = [
    decision.options[recIdx],
    ...decision.options.filter((_, i) => i !== recIdx),
  ];
  const options = reordered.map((opt, i) => ({
    label: i === 0 ? `(Recommended) ${opt.label}` : opt.label,
    description: opt.description,
  }));
  return {
    questions: [{
      question: `[${taskTitle}] ${decision.title}\n\nContext: ${decision.context}\n\nReasoning for recommendation: ${decision.reasoning}`,
      header: decision.title,
      multiSelect: false,
      options,
    }],
  };
}
