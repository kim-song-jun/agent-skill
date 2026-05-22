// Shallow-click expander: for each clickable on a page, click it,
// capture the resulting state, then revert to the pre-click state.
//
// Pure orchestration: the actual click / wait / screenshot / navigate
// happens through callbacks injected by the runtime layer. This module
// owns the *sequence* and the *error containment*.
//
// v0.5+ — optional pair-mode (capturePairs: true) takes a `before`
// screenshot BEFORE each click, alongside the existing post-click
// screenshot. Element identity uses the 3-tier matcher in
// `element-identity.mjs` when a `descriptorFor` hook is provided.
// Element-scope filtering goes through `targets-filter.mjs`.
//
// Inputs:
//   {
//     pagePath,
//     clickables: [{selector, kind, label, ...descriptorFields?}],
//     hooks: { click, waitStable, screenshot, revert, descriptorFor? },
//     options?: {
//       perClickTimeoutMs?: number,
//       skipKinds?: [string],
//       capturePairs?: boolean,     // v0.5+ — emit before+after pair
//       targets?: object,           // v0.5+ — comprehensive.targets config (include/exclude/actions)
//       isSelectorMatch?: (selector: string, candidate: string) => boolean,
//     }
//   }
//
// Hooks contract:
//   click({selector, action?})  -> { navigated?: bool, dialog?: string }
//   waitStable({timeoutMs})     -> resolves when network idle + animations done
//   screenshot({pagePath, selector, suffix}) -> path
//   revert({pagePath})          -> resolves when the page is back to pre-click state
//   descriptorFor({selector})?  -> v0.5+ element descriptor object for identity tiering
//
// Returns:
//   {
//     captures: [{
//       selector, kind, label, navigated, error?,
//       path,                                 // legacy single-screenshot mode
//       elementId?, confidence?, action?,     // v0.5+ when descriptorFor+capturePairs
//       screenshots?: { before?, after? },    // v0.5+ when capturePairs
//     }],
//     errors: [...]
//   }

import { computeElementIdentity } from "./element-identity.mjs";
import { resolveTarget, parseAction } from "./targets-filter.mjs";

const DEFAULT_SKIP_KINDS = ["input", "textarea", "select"];

export async function shallowClick({ pagePath, clickables, hooks, options }) {
  if (typeof pagePath !== "string" || !pagePath) {
    throw new TypeError("shallowClick requires a pagePath string");
  }
  if (!Array.isArray(clickables)) {
    throw new TypeError("shallowClick requires a clickables array");
  }
  if (!hooks || typeof hooks.click !== "function" || typeof hooks.waitStable !== "function"
      || typeof hooks.screenshot !== "function" || typeof hooks.revert !== "function") {
    throw new TypeError("shallowClick requires hooks {click, waitStable, screenshot, revert}");
  }

  const opts = options ?? {};
  const skip = new Set(opts.skipKinds ?? DEFAULT_SKIP_KINDS);
  const capturePairs = !!opts.capturePairs;
  const targets = opts.targets ?? null;
  const isSelectorMatch = opts.isSelectorMatch ?? ((sel, cand) => sel === cand);
  const captures = [];
  const errors = [];

  for (const cl of clickables) {
    if (!cl || typeof cl.selector !== "string") continue;
    if (skip.has(cl.kind)) continue;

    // v0.5+ — apply element-scope filter (targets.include/exclude + action lookup)
    let resolvedAction = null;
    if (targets) {
      const decision = resolveTarget(
        { selector: cl.selector, isMatch: (cand) => isSelectorMatch(cl.selector, cand) },
        targets,
      );
      if (!decision.capture) continue;
      resolvedAction = parseAction(decision.action).kind;
    }

    const capture = {
      selector: cl.selector,
      kind: cl.kind,
      label: cl.label,
      path: null,
      navigated: false,
    };

    // v0.5+ — compute element identity when a descriptorFor hook is available
    if (capturePairs && hooks.descriptorFor) {
      try {
        const desc = await hooks.descriptorFor({ selector: cl.selector });
        const ident = computeElementIdentity(desc ?? { selector: cl.selector });
        capture.elementId = ident.id;
        capture.confidence = ident.confidence;
      } catch (err) {
        // identity is non-fatal — fall back without tier metadata
        errors.push({ selector: cl.selector, error: `identity failed: ${err?.message ?? String(err)}` });
      }
    }
    if (resolvedAction) capture.action = resolvedAction;

    try {
      // v0.5+ — capture the BEFORE screenshot if pair mode is on
      if (capturePairs) {
        capture.screenshots = capture.screenshots ?? {};
        capture.screenshots.before = await hooks.screenshot({
          pagePath,
          selector: cl.selector,
          suffix: capture.elementId ? `__${capture.elementId}__before` : `__${stableLabel(cl.selector)}__before`,
        });
      }

      const clickResult = await hooks.click({ selector: cl.selector, action: resolvedAction ?? "click" });
      if (clickResult?.dialog) {
        // Click triggered a confirm/beforeunload dialog — don't proceed.
        capture.error = `dialog triggered: ${clickResult.dialog}`;
        errors.push({ selector: cl.selector, error: capture.error });
        captures.push(capture);
        await safeRevert(hooks, pagePath, errors, cl.selector);
        continue;
      }
      await hooks.waitStable({ timeoutMs: opts.perClickTimeoutMs ?? 3000 });
      capture.navigated = !!clickResult?.navigated;
      const safeLabel = stableLabel(cl.selector);
      const afterPath = await hooks.screenshot({
        pagePath,
        selector: cl.selector,
        suffix: capturePairs
          ? (capture.elementId ? `__${capture.elementId}__after` : `__${safeLabel}__after`)
          : `__clicked__${safeLabel}`,
      });
      if (capturePairs) {
        capture.screenshots = capture.screenshots ?? {};
        capture.screenshots.after = afterPath;
      } else {
        capture.path = afterPath;
      }
    } catch (err) {
      capture.error = err?.message ?? String(err);
      errors.push({ selector: cl.selector, error: capture.error });
    }

    captures.push(capture);
    await safeRevert(hooks, pagePath, errors, cl.selector);
  }

  return { captures, errors };
}

function stableLabel(selector) {
  return String(selector).replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 60);
}

async function safeRevert(hooks, pagePath, errors, selector) {
  try {
    await hooks.revert({ pagePath });
  } catch (err) {
    errors.push({
      selector,
      error: `revert failed: ${err?.message ?? String(err)}`,
      severity: "blocker",
    });
  }
}
