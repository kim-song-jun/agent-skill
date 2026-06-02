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

function findMarkerLines(text) {
  const markers = {
    start: [],
    end: [],
  };
  let lineStart = 0;

  while (lineStart < text.length) {
    const newline = text.indexOf("\n", lineStart);
    const lineEnd = newline === -1 ? text.length : newline;
    const nextLineStart = newline === -1 ? text.length : newline + 1;
    const line = text.slice(lineStart, lineEnd);

    if (line.trim() === SENTINEL.start) {
      markers.start.push({ lineStart, nextLineStart });
    } else if (line.trim() === SENTINEL.end) {
      markers.end.push({ lineStart, nextLineStart });
    }

    lineStart = nextLineStart;
  }

  return markers;
}

export function mergeSentinelSection(existingText, generatedText) {
  const generated = ensureTrailingNewline(generatedText.trimEnd());
  if (!existingText || existingText.length === 0) {
    return { action: "create", content: generated };
  }

  const markers = findMarkerLines(existingText);
  if (markers.start.length > 1 || markers.end.length > 1) {
    throw new Error("duplicate sentinel section");
  }

  const start = markers.start[0];
  const end = markers.end[0];
  if (!start !== !end) {
    throw new Error("incomplete sentinel section");
  }
  if (end && end.lineStart < start.lineStart) {
    throw new Error("malformed sentinel section");
  }

  const section = buildSection(generated.trimEnd());
  if (!start) {
    return {
      action: "append",
      content: `${ensureTrailingNewline(existingText)}\n${section}`,
    };
  }

  const before = existingText.slice(0, start.lineStart);
  const remainder = existingText.slice(end.nextLineStart);
  return {
    action: "replace",
    content: `${before}${section}${remainder}`,
  };
}
