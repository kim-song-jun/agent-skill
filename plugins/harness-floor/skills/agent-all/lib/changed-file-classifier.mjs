const BASE_REVIEWERS = ["reviewer", "verification-reviewer"];

const FRONTEND_PATH_RE = /(^|\/)(app|components|frontend|pages|public|src\/components|src\/pages|ui)(\/|$)/;
const FRONTEND_EXT_RE = /\.(css|scss|sass|less|jsx|tsx|vue|svelte)$/;
const BACKEND_PATH_RE = /(^|\/)(api|backend|server|services|workers|jobs)(\/|$)/;
const SECURITY_PATH_RE =
  /(^|\/)(auth|authentication|authorization|login|oauth|permissions?|security|sessions?)(\/|[-_.])/;
const SECURITY_NAME_RE = /(csrf|csp|jwt|oauth|password|permission|session|token)/;
const API_ROUTE_RE = /(^|\/)api\/(routes?|v\d+)\//;
const DATA_PATH_RE = /(^|\/)(db|database|migrations?|models?|prisma|schema)(\/|[-_.])/;
const DATA_EXT_RE = /\.(sql|prisma)$/;

function normalizedPath(file) {
  return String(file ?? "").replaceAll("\\", "/").toLowerCase();
}

function isFrontendFile(file) {
  return FRONTEND_PATH_RE.test(file) || FRONTEND_EXT_RE.test(file);
}

function isBackendFile(file) {
  return BACKEND_PATH_RE.test(file) || DATA_PATH_RE.test(file) || DATA_EXT_RE.test(file);
}

function isSecurityFile(file) {
  return SECURITY_PATH_RE.test(file) || SECURITY_NAME_RE.test(file) || API_ROUTE_RE.test(file) || isDataFile(file);
}

function isDataFile(file) {
  return DATA_PATH_RE.test(file) || DATA_EXT_RE.test(file);
}

export function classifyChangedFiles(files = []) {
  const reviewers = new Set(BASE_REVIEWERS);
  const normalizedFiles = files.map(normalizedPath).filter(Boolean);

  const hasFrontend = normalizedFiles.some(isFrontendFile);
  const hasBackend = normalizedFiles.some(isBackendFile);

  if (hasFrontend) {
    reviewers.add("design-reviewer");
    reviewers.add("qa-reviewer");
  }

  if (normalizedFiles.some(isSecurityFile)) reviewers.add("security-reviewer");
  if (normalizedFiles.some(isDataFile)) reviewers.add("data-reviewer");
  if (hasFrontend && hasBackend) reviewers.add("integration-dev");

  return [...reviewers].sort();
}
