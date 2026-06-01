const BASE_REVIEWERS = ["reviewer", "verification-reviewer"];
const BROAD_CHANGE_THRESHOLD = 8;

const FRONTEND_PATH_RE = /(^|\/)(app|components|frontend|pages|public|src\/components|src\/pages|ui)(\/|$)/;
const FRONTEND_APP_PATH_RE =
  /(^|\/)src\/(?:api|assets|composables|layouts|middleware|plugins|router|routes|services|stores?|views)(\/|$)/;
const FRONTEND_EXT_RE = /\.(css|scss|sass|less|jsx|tsx|vue|svelte)$/;
const BACKEND_PATH_RE = /(^|\/)(api|backend|server|services|workers|jobs)(\/|$)/;
const DJANGO_BACKEND_RE =
  /(^|\/)(?:apps|backend|server)\/[^/]+\/(?:(?:admin|celery|tasks|urls|views?|viewsets?)\.py|services\/[^/]+\.py)$/;
const DJANGO_SECURITY_RE = /(^|\/)(?:apps|backend|server)\/[^/]+\/(?:admin|urls|views?|viewsets?)\.py$/;
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
const DB_STRUCTURE_PATH_RE =
  /(^|\/)(migrations?|models?|prisma|schema)(\/|[-_.])|(^|\/)(db|database)\/(?:migrations?|models?|schema)(\/|[-_.])/;
const DB_STRUCTURE_NAME_RE = /(^|\/)schema\.(?:prisma|sql)$/;
const ORCHESTRATION_HOT_PATH_RE =
  /(^|\/)(?:package(?:-lock)?\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|pyproject\.toml|poetry\.lock|requirements(?:[-_\w]*)?\.txt|cargo\.toml|cargo\.lock|go\.mod|go\.sum|dockerfile|docker-compose\.ya?ml|compose\.ya?ml|makefile|tsconfig(?:\.[^.]+)?\.json|vite\.config\.[cm]?[jt]s|nuxt\.config\.[cm]?[jt]s|next\.config\.[cm]?[jt]s|eslint\.config\.[cm]?[jt]s)$/;
const ORCHESTRATION_HOT_DIR_RE = /(^|\/)(?:\.github\/workflows|\.circleci|\.buildkite|ci)(\/|$)/;

function normalizedPath(file) {
  return String(file ?? "").replaceAll("\\", "/").toLowerCase();
}

function isFrontendFile(file) {
  if (isDocumentationFile(file)) return false;
  return FRONTEND_PATH_RE.test(file) || FRONTEND_APP_PATH_RE.test(file) || FRONTEND_EXT_RE.test(file);
}

function isBackendFile(file) {
  if (isDocumentationFile(file)) return false;
  if (FRONTEND_APP_PATH_RE.test(file)) return false;
  return BACKEND_PATH_RE.test(file) || DJANGO_BACKEND_RE.test(file) || DATA_PATH_RE.test(file) || DATA_EXT_RE.test(file);
}

function isSecurityFile(file) {
  if (isDocumentationFile(file)) return false;
  return (
    SECURITY_PATH_RE.test(file) ||
    SECURITY_NAME_RE.test(file) ||
    API_ROUTE_RE.test(file) ||
    API_VIEW_RE.test(file) ||
    DJANGO_SECURITY_RE.test(file) ||
    SERIALIZER_RE.test(file) ||
    isDbStructureFile(file)
  );
}

function isDataFile(file) {
  if (isDocumentationFile(file)) return false;
  return DATA_PATH_RE.test(file) || DATA_NAME_RE.test(file) || DATA_EXT_RE.test(file);
}

function isDbStructureFile(file) {
  if (isDocumentationFile(file)) return false;
  return DB_STRUCTURE_PATH_RE.test(file) || DB_STRUCTURE_NAME_RE.test(file);
}

function isDocumentationFile(file) {
  return DOCS_PATH_RE.test(file);
}

function isOrchestrationHotFile(file) {
  if (isDocumentationFile(file)) return false;
  return ORCHESTRATION_HOT_PATH_RE.test(file) || ORCHESTRATION_HOT_DIR_RE.test(file);
}

export function classifyChangedFiles(files = []) {
  const reviewers = new Set(BASE_REVIEWERS);
  const coordinators = new Set();
  const normalizedFiles = files.map(normalizedPath).filter(Boolean);
  const nonDocFiles = normalizedFiles.filter((file) => !isDocumentationFile(file));

  const hasFrontend = normalizedFiles.some(isFrontendFile);
  const hasBackend = normalizedFiles.some(isBackendFile);

  if (hasFrontend) {
    reviewers.add("design-reviewer");
    reviewers.add("qa-reviewer");
  }

  if (normalizedFiles.some(isSecurityFile)) reviewers.add("security-reviewer");
  if (normalizedFiles.some(isDataFile)) reviewers.add("data-reviewer");
  if (hasFrontend && hasBackend) reviewers.add("integration-dev");
  if (nonDocFiles.some(isOrchestrationHotFile) || nonDocFiles.length >= BROAD_CHANGE_THRESHOLD) {
    coordinators.add("orchestrator");
  }

  return { reviewers: [...reviewers].sort(), coordinators: [...coordinators].sort() };
}
