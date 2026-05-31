const BASE_REVIEWERS = ["reviewer", "verification-reviewer"];

const FRONTEND_PATH_RE = /(^|\/)(app|components|frontend|pages|public|src\/components|src\/pages|ui)(\/|$)/;
const FRONTEND_EXT_RE = /\.(css|scss|sass|less|jsx|tsx|vue|svelte)$/;
const BACKEND_PATH_RE = /(^|\/)(api|backend|server|services|workers|jobs)(\/|$)/;
const DOCS_PATH_RE = /(^|\/)(docs?|documentation|notes)(\/|$)/;
const SECURITY_PATH_RE =
  /(^|\/)(auth|authentication|authorization|login|middleware|oauth|permissions?|security|sessions?)(\/|[-_.])/;
const SECURITY_NAME_RE = /(csrf|csp|destructive|jwt|oauth|password|permission|secret|session|token)/;
const API_ROUTE_RE = /(^|\/)api\/(routes?|v\d+)\//;
const API_VIEW_RE = /(^|\/)api\/(?:.*\/)?views?\.[^.]+$/;
const SERIALIZER_RE = /(^|\/)serializers?([-.].*)?\.[^.]+$/;
const DATA_PATH_RE = /(^|\/)(backfills?|db|database|fixtures?|migrations?|models?|prisma|schema|seeds?)(\/|[-_.])/;
const DATA_NAME_RE = /(^|\/)seed[-_.]/;
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
  if (isDocumentationFile(file)) return false;
  return (
    SECURITY_PATH_RE.test(file) ||
    SECURITY_NAME_RE.test(file) ||
    API_ROUTE_RE.test(file) ||
    API_VIEW_RE.test(file) ||
    SERIALIZER_RE.test(file)
  );
}

function isDataFile(file) {
  if (isDocumentationFile(file)) return false;
  return DATA_PATH_RE.test(file) || DATA_NAME_RE.test(file) || DATA_EXT_RE.test(file);
}

function isDocumentationFile(file) {
  return DOCS_PATH_RE.test(file);
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
