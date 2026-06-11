# Agent Skill Support Matrix

Generated from `plugins/harness-core/capabilities/catalog.mjs`.
Run `node scripts/generate-support-matrix.mjs --check` to detect drift.

| Capability | Claude Code | Codex CLI | GitHub Copilot CLI | Cursor | Gemini CLI | VS Code Copilot |
|---|---|---|---|---|---|---|
| Agent Init | native | native | partial | partial | partial | soft |
| Agent All | native | partial | partial | soft | soft | soft |
| Visual QA | native | partial | partial | partial | partial | unsupported |
| Thrift | native | partial | partial | soft | soft | soft |
| Explore | native | unsupported | unsupported | unsupported | unsupported | unsupported |
| Debug | native | partial | unsupported | unsupported | unsupported | unsupported |
| Agent Handoff | native | partial | soft | soft | soft | soft |
| Interaction | native | partial | partial | soft | soft | soft |
| Policy Hook | native | partial | partial | soft | soft | soft |
| Cost Telemetry | partial | partial | partial | soft | soft | soft |
| Verification Adapter | partial | partial | soft | soft | soft | soft |
| Security Redaction | partial | partial | soft | soft | soft | soft |
| Data Runner | native | soft | soft | soft | soft | soft |

Legend: `native` = host-native command/UX, `partial` = runnable with platform limitations, `soft` = prompt/instruction-level guidance, `unsupported` = not shipped.

