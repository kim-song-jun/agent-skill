// BFS crawler for comprehensive-mode visual-qa.
//
// Pure orchestration: takes an async `fetchPageLinks(url)` callback so the
// shell (Playwright MCP, fetch, anything) can be plugged in at runtime
// while the algorithm stays deterministic and unit-testable.
//
// Behaviour:
//   - Visits each `scope.include` root in declared order.
//   - BFS within same origin as the resolved baseUrl. Cross-origin links
//     are discarded.
//   - Respects depth cap (root = depth 0) and maxPages cap.
//   - Deduplicates by canonical path (strips query string + fragment).
//   - Skips paths matching any glob-like pattern in `scope.exclude`.
//
// Returns `[{ path, title?, depth, source }]` in discovery order.

export function canonicalisePath(href, originPath) {
  if (typeof href !== "string" || !href) return null;
  const trimmed = href.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("#")) return null;
  if (trimmed.startsWith("mailto:") || trimmed.startsWith("tel:") || trimmed.startsWith("javascript:")) return null;
  let url;
  try {
    url = new URL(trimmed, `http://__crawler__${originPath || "/"}`);
  } catch {
    return null;
  }
  if (url.hostname !== "__crawler__") return null; // cross-origin
  const path = url.pathname || "/";
  // Strip trailing slash unless root.
  const normalised = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  return normalised;
}

function globMatches(pattern, path) {
  // Minimal glob: `*` matches a single path segment, `**` matches any
  // number of segments. No `?`, no character classes.
  if (typeof pattern !== "string") return false;
  const regexSrc = "^" + pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "::STAR2::")
    .replace(/\*/g, "[^/]*")
    .replace(/::STAR2::/g, ".*") + "$";
  try {
    return new RegExp(regexSrc).test(path);
  } catch {
    return false;
  }
}

export function isExcluded(path, excludePatterns) {
  if (!Array.isArray(excludePatterns) || excludePatterns.length === 0) return false;
  return excludePatterns.some((p) => globMatches(p, path));
}

export async function crawl({ scope, fetchPageLinks }) {
  if (!scope || !Array.isArray(scope.include) || scope.include.length === 0) {
    return [];
  }
  const maxPages = typeof scope.maxPages === "number" ? scope.maxPages : 100;
  const maxDepth = typeof scope.depth === "number" ? scope.depth : 3;
  const excludePatterns = Array.isArray(scope.exclude) ? scope.exclude : [];
  if (typeof fetchPageLinks !== "function") {
    throw new TypeError("crawl() requires a fetchPageLinks(url) callback");
  }

  const visited = new Map(); // path -> entry
  const queue = [];
  for (const start of scope.include) {
    const path = canonicalisePath(start, "/");
    if (!path || isExcluded(path, excludePatterns) || visited.has(path)) continue;
    const entry = { path, depth: 0, source: null };
    visited.set(path, entry);
    queue.push(entry);
  }

  let head = 0;
  while (head < queue.length && visited.size <= maxPages) {
    const current = queue[head++];
    if (current.depth >= maxDepth) continue;
    let result;
    try {
      result = await fetchPageLinks(current.path);
    } catch (err) {
      current.error = err?.message ?? String(err);
      continue;
    }
    if (result?.title && !current.title) current.title = result.title;
    const links = Array.isArray(result?.links) ? result.links : [];
    for (const href of links) {
      if (visited.size >= maxPages) break;
      const next = canonicalisePath(href, current.path);
      if (!next) continue;
      if (visited.has(next)) continue;
      if (isExcluded(next, excludePatterns)) continue;
      const entry = { path: next, depth: current.depth + 1, source: current.path };
      visited.set(next, entry);
      queue.push(entry);
    }
  }

  return [...visited.values()];
}
