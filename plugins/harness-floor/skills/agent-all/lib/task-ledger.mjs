export const REQUIRED_SECTIONS = [
  "Goal",
  "Acceptance",
  "Phases",
  "Decision Matrix",
  "Ambiguity Log",
  "Progress Snapshot",
  "Verification",
];

const EXCLUDED_CHECKBOX_SECTIONS = new Set(["Backlog", "Follow-up"]);

function sectionRanges(text) {
  const headings = [...String(text || "").matchAll(/^##\s+(.+)$/gm)];
  return headings.map((heading, index) => {
    const title = heading[1].trim();
    const next = headings[index + 1]?.index ?? text.length;
    return { title, body: text.slice(heading.index, next) };
  });
}

export function validateTaskDoc(text) {
  const errors = [];
  const sections = sectionRanges(text);
  const names = new Set(sections.map((section) => section.title));
  for (const required of REQUIRED_SECTIONS) {
    if (!names.has(required)) errors.push(`missing section: ${required}`);
  }
  for (const section of sections) {
    if (EXCLUDED_CHECKBOX_SECTIONS.has(section.title)) continue;
    const unchecked = section.body.match(/^- \[ \]\s+.+$/gm) || [];
    for (const item of unchecked) errors.push(`unchecked item in ${section.title}: ${item.replace(/^- \[ \]\s+/, "")}`);
  }
  return { ok: errors.length === 0, errors };
}
