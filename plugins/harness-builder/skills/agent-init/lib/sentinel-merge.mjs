export const SENTINEL = {
  start: "<!-- agent-skill:operational:start -->",
  end: "<!-- agent-skill:operational:end -->",
};

function ensureTrailingNewline(text) {
  return text.endsWith("\n") ? text : `${text}\n`;
}

function buildSection(generated) {
  return `${SENTINEL.start}\n${ensureTrailingNewline(generated)}${SENTINEL.end}\n`;
}

export function mergeSentinelSection(existingText, generatedText) {
  const generated = ensureTrailingNewline(generatedText.trimEnd());
  if (!existingText || existingText.length === 0) {
    return { action: "create", content: generated };
  }

  const start = existingText.indexOf(SENTINEL.start);
  const end = existingText.indexOf(SENTINEL.end);
  if ((start === -1) !== (end === -1)) {
    throw new Error("incomplete sentinel section");
  }

  const section = buildSection(generated.trimEnd());
  if (start === -1) {
    return {
      action: "append",
      content: `${ensureTrailingNewline(existingText).trimEnd()}\n\n${section}`,
    };
  }

  const endAfter = end + SENTINEL.end.length;
  const before = existingText.slice(0, start);
  const after = existingText.slice(endAfter);
  const remainder = after.startsWith("\n") ? after.slice(1) : after;
  return {
    action: "replace",
    content: `${before}${section}${remainder}`,
  };
}
