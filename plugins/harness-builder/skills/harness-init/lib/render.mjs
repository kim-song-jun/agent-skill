function lookup(ctx, path) {
  if (path === "this") return ctx.__this__ ?? "";
  if (path === "@index") return ctx.__index__ ?? "";
  const parts = path.split(".");
  let v = ctx;
  for (const p of parts) {
    if (v == null) return "";
    v = v[p];
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

export function render(tpl, ctx = {}) {
  // #each
  tpl = tpl.replace(/\{\{#each\s+([\w.]+)\}\}([\s\S]*?)\{\{\/each\}\}/g,
    (_, path, body) => renderEach(body, lookup(ctx, path), ctx));
  // #if
  tpl = tpl.replace(/\{\{#if\s+([\w.]+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_, path, body) => lookup(ctx, path) ? render(body, ctx) : "");
  // {{var}}
  tpl = tpl.replace(/\{\{\s*([\w.@]+)\s*\}\}/g,
    (_, path) => String(lookup(ctx, path) ?? ""));
  return tpl;
}
