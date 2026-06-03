function lookup(ctx, path) {
  if (path === "this") return ctx.__this__ ?? "";
  if (path === "@index") return ctx.__index__ ?? "";
  const parts = path.split(".");
  let v = ctx;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (v == null) return "";
    // Special case: "this" at the start refers to __this__ in the context
    if (p === "this" && i === 0) {
      v = ctx.__this__;
    } else {
      v = v[p];
    }
  }
  return v ?? "";
}

function renderEach(body, list, ctx) {
  if (!Array.isArray(list)) return "";
  return list.map((item, i) => {
    const sub = (item && typeof item === "object" && !Array.isArray(item))
      ? { ...ctx, ...item, __this__: item, __index__: i }
      : { ...ctx, __this__: item, __index__: i };
    return render(body, sub);
  }).join("");
}

// Find the index of the matching {{/<kind>}} for an opening {{#<kind> ...}} at openEnd.
// Returns the index of the start of the matching {{/<kind>}} (or -1 if not found).
function findMatchingClose(tpl, openEnd, kind) {
  const openRe = new RegExp(`\\{\\{#${kind}\\s+[\\w.]+\\}\\}`, "g");
  const closeStr = `{{/${kind}}}`;
  let depth = 1;
  let i = openEnd;
  while (i < tpl.length) {
    openRe.lastIndex = i;
    const openMatch = openRe.exec(tpl);
    const closeIdx = tpl.indexOf(closeStr, i);
    if (closeIdx === -1) return -1;
    if (openMatch && openMatch.index < closeIdx) {
      depth++;
      i = openMatch.index + openMatch[0].length;
    } else {
      depth--;
      if (depth === 0) return closeIdx;
      i = closeIdx + closeStr.length;
    }
  }
  return -1;
}

function processBlocks(tpl, kind, handler) {
  const openRe = new RegExp(`\\{\\{#${kind}\\s+([\\w.]+)\\}\\}`);
  let out = "";
  let pos = 0;
  while (pos < tpl.length) {
    openRe.lastIndex = 0;
    const slice = tpl.slice(pos);
    const m = openRe.exec(slice);
    if (!m) {
      out += tpl.slice(pos);
      break;
    }
    const openAbs = pos + m.index;
    const openEnd = openAbs + m[0].length;
    const closeAbs = findMatchingClose(tpl, openEnd, kind);
    if (closeAbs === -1) {
      // Unbalanced — leave the rest alone
      out += tpl.slice(pos);
      break;
    }
    const body = tpl.slice(openEnd, closeAbs);
    const replacement = handler(m[1], body);
    out += tpl.slice(pos, openAbs) + replacement;
    pos = closeAbs + `{{/${kind}}}`.length;
  }
  return out;
}

export function render(tpl, ctx = {}) {
  // #each first (handler may recursively call render for body)
  tpl = processBlocks(tpl, "each", (path, body) => renderEach(body, lookup(ctx, path), ctx));
  // #if
  tpl = processBlocks(tpl, "if", (path, body) => lookup(ctx, path) ? render(body, ctx) : "");
  // {{var}}
  tpl = tpl.replace(/\{\{\s*([\w.@]+)\s*\}\}/g,
    (_, path) => String(lookup(ctx, path) ?? ""));
  return tpl;
}
