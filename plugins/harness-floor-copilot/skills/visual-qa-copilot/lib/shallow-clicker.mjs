// Shallow-click expander: for each clickable on a page, click it,
// capture the resulting state, then revert to the pre-click state.
//
// Pure orchestration: the actual click / wait / screenshot / navigate
// happens through callbacks injected by the runtime layer. This module
// owns the *sequence* and the *error containment*.
//
// Inputs:
//   {
//     pagePath,
//     clickables: [{selector, kind, label}],  // from dom-walker
//     hooks: { click, waitStable, screenshot, revert },
//     options?: { perClickTimeoutMs?: number, skipKinds?: [string] }
//   }
//
// Hooks contract:
//   click({selector})           -> { navigated?: bool, dialog?: string }
//   waitStable({timeoutMs})     -> resolves when network idle + animations done
//   screenshot({pagePath, selector, suffix}) -> path
//   revert({pagePath})          -> resolves when the page is back to pre-click state
//
// Returns:
//   { captures: [{selector, kind, label, path, navigated, error?}], errors: [...] }

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
  const captures = [];
  const errors = [];

  for (const cl of clickables) {
    if (!cl || typeof cl.selector !== "string") continue;
    if (skip.has(cl.kind)) continue;

    const capture = {
      selector: cl.selector,
      kind: cl.kind,
      label: cl.label,
      path: null,
      navigated: false,
    };

    try {
      const clickResult = await hooks.click({ selector: cl.selector });
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
      const safeLabel = String(cl.selector).replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 60);
      capture.path = await hooks.screenshot({
        pagePath,
        selector: cl.selector,
        suffix: `__clicked__${safeLabel}`,
      });
    } catch (err) {
      capture.error = err?.message ?? String(err);
      errors.push({ selector: cl.selector, error: capture.error });
    }

    captures.push(capture);
    await safeRevert(hooks, pagePath, errors, cl.selector);
  }

  return { captures, errors };
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
