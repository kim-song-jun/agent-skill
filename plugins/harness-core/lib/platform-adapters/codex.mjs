import { renderPlatformCapabilities } from "./renderer.mjs";

export function renderCodexCapabilityAdapter(options = {}) {
  return renderPlatformCapabilities({ ...options, platform: "codex" });
}
