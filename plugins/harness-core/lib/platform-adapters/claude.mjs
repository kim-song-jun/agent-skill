import { renderPlatformCapabilities } from "./renderer.mjs";

export function renderClaudeCapabilityAdapter(options = {}) {
  return renderPlatformCapabilities({ ...options, platform: "claude" });
}
