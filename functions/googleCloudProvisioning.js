"use strict";

const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");
const { GoogleAuth, Impersonated, OAuth2Client } = require("google-auth-library");

const GOOGLE_CLOUD_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const GOOGLE_ANALYTICS_READONLY_SCOPE =
  "https://www.googleapis.com/auth/analytics.readonly";
const GOOGLE_ANALYTICS_VIEWER_ROLE = "predefinedRoles/viewer";
const GOOGLE_ANALYTICS_READER_ROLES = new Set([
  GOOGLE_ANALYTICS_VIEWER_ROLE,
  "predefinedRoles/analyst",
  "predefinedRoles/editor",
  "predefinedRoles/admin",
]);
const DEFAULT_FIRESTORE_LOCATION = "nam5";
const DEFAULT_STORAGE_LOCATION = "US-CENTRAL1";
const CORE_SERVICE_ACCOUNT_ID = "labor-runtime";
const IAM_PROPAGATION_POLL_MS = 5000;
const IAM_PROPAGATION_MAX_WAIT_MS = 10 * 60 * 1000;
const IAM_PROPAGATION_ATTEMPTS = Math.ceil(
  IAM_PROPAGATION_MAX_WAIT_MS / IAM_PROPAGATION_POLL_MS
) + 1;
const SERVICE_ACCOUNT_READY_POLL_MS = 5000;
const SERVICE_ACCOUNT_READY_MAX_WAIT_MS = 5 * 60 * 1000;
const SERVICE_ACCOUNT_MINIMUM_AGE_MS = 65 * 1000;
const SERVICE_ACCOUNT_READY_ATTEMPTS = Math.ceil(
  SERVICE_ACCOUNT_READY_MAX_WAIT_MS / SERVICE_ACCOUNT_READY_POLL_MS
) + 1;
const CORE_SOURCE_FIREBASE_CONFIG_MARKER =
  /const GENERATED_FIREBASE_WEB_CONFIG =\s*\n\s*readGeneratedFirebaseWebConfig\(\);\nconst OPENAI_MODEL/;
const CORE_FUNCTION_NAMES = [
  "addCustomDomain",
  "appGenerationAgent",
  "applicationAnalytics",
  "configurationAgent",
  "dailyReleasedAppManagerAgent",
  "deployTheRelease",
  "forwardAgent",
  "generateLaborIdeas",
  "releaseMarketingAgent",
  "releaseTheApp",
  "releasedAppManagerAgent",
  "runAutonomousAgentGeneration",
  "runAutonomousAgentProduct",
  "runLaborEvolution",
  "startAutonomousAgent",
  "startLabor",
];
const CORE_FUNCTION_DEPLOY_BATCH_SIZE = 5;
const CORE_DEPLOYMENT_VERSION = "customer-data-plane-v1";
const CLOUD_BUILD_SERVICE_ACCOUNT_POLL_MS = 5000;
const CLOUD_BUILD_SERVICE_ACCOUNT_ATTEMPTS = 24;
const RUNTIME_PERMISSION_POLL_MS = 5000;
const RUNTIME_PERMISSION_ATTEMPTS = 60;
const ANALYTICS_ACCESS_POLL_MS = 4000;
const ANALYTICS_ACCESS_ATTEMPTS = 24;

const REQUIRED_CONNECTION_PERMISSIONS = [
  "cloudbuild.builds.get",
  "resourcemanager.projects.get",
  "resourcemanager.projects.getIamPolicy",
  "resourcemanager.projects.setIamPolicy",
  "serviceusage.services.enable",
  "firebase.projects.update",
  "firebaseauth.configs.create",
  "firebaseauth.configs.update",
  "iam.serviceAccounts.create",
  "iam.serviceAccounts.get",
  "iam.serviceAccounts.getIamPolicy",
  "iam.serviceAccounts.setIamPolicy",
];

const REQUIRED_APIS = [
  "cloudapis.googleapis.com",
  "firebase.googleapis.com",
  "firebasehosting.googleapis.com",
  "firebasestorage.googleapis.com",
  "firestore.googleapis.com",
  "identitytoolkit.googleapis.com",
  "cloudfunctions.googleapis.com",
  "run.googleapis.com",
  "cloudbuild.googleapis.com",
  "artifactregistry.googleapis.com",
  "cloudtasks.googleapis.com",
  "cloudscheduler.googleapis.com",
  "pubsub.googleapis.com",
  "eventarc.googleapis.com",
  "iam.googleapis.com",
  "iamcredentials.googleapis.com",
  "serviceusage.googleapis.com",
  "cloudresourcemanager.googleapis.com",
  "storage.googleapis.com",
  "firebaserules.googleapis.com",
  "logging.googleapis.com",
  "cloudbilling.googleapis.com",
  "analyticsadmin.googleapis.com",
  "analyticsdata.googleapis.com",
  "siteverification.googleapis.com",
  "searchconsole.googleapis.com",
];

const CORE_SERVICE_ACCOUNT_ROLES = [
  "roles/firebase.admin",
  "roles/firebase.analyticsAdmin",
  "roles/cloudfunctions.admin",
  "roles/run.admin",
  "roles/cloudbuild.builds.editor",
  "roles/storage.admin",
  "roles/datastore.owner",
  "roles/iam.serviceAccountUser",
  "roles/artifactregistry.admin",
  "roles/cloudtasks.admin",
  "roles/cloudscheduler.admin",
  "roles/pubsub.admin",
  "roles/eventarc.admin",
  "roles/logging.logWriter",
  "roles/logging.viewer",
  "roles/serviceusage.serviceUsageConsumer",
];

const RUNTIME_DEPLOYMENT_PERMISSIONS = [
  "cloudbuild.builds.create",
  "cloudbuild.builds.get",
  "serviceusage.services.use",
];

function cleanString(value) {
  return String(value || "").trim();
}

function normalizeAnalyticsPropertyName(value) {
  const propertyId = cleanString(value).replace(/^properties\//, "");
  return /^\d+$/.test(propertyId) ? `properties/${propertyId}` : "";
}

function buildAnalyticsViewerAccessBinding(serviceAccountEmail) {
  return {
    user: cleanString(serviceAccountEmail),
    roles: [GOOGLE_ANALYTICS_VIEWER_ROLE],
  };
}

function analyticsAccessBindingCanRead(binding = {}) {
  return (Array.isArray(binding.roles) ? binding.roles : []).some((role) =>
    GOOGLE_ANALYTICS_READER_ROLES.has(cleanString(role))
  );
}

function requiresCoreDeploymentRefresh(config = {}) {
  return Boolean(
    cleanString(config.coreBuildId) &&
      cleanString(config.coreDeploymentVersion) !== CORE_DEPLOYMENT_VERSION
  );
}

function safeDocumentId(value) {
  return cleanString(value).replace(/\//g, "_");
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error) {
  return cleanString(error?.message || error) || "Unknown Google Cloud error.";
}

function provisioningError(message, code, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.attentionCode = code;
  Object.assign(error, details);
  return error;
}

function specializeCoreSource({ source, projectId, firebaseWebConfig }) {
  const firebaseConfigDeclarationCount = (
    source.match(/const GENERATED_FIREBASE_WEB_CONFIG =/g) || []
  ).length;
  const firebaseConfigMatch = source.match(
    CORE_SOURCE_FIREBASE_CONFIG_MARKER
  );
  if (
    firebaseConfigDeclarationCount !== 1 ||
    !firebaseConfigMatch
  ) {
    throw provisioningError(
      "Labor could not find every project-specific marker in its core source.",
      "core_source_specialization_failed"
    );
  }

  if (cleanString(firebaseWebConfig?.projectId) !== cleanString(projectId)) {
    throw provisioningError(
      "Labor received a Firebase web configuration for a different project.",
      "core_source_specialization_failed"
    );
  }

  const targetFirebaseConfigDeclaration =
    `const GENERATED_FIREBASE_WEB_CONFIG = ${JSON.stringify(
      firebaseWebConfig,
      null,
      2
    )};`;
  const targetSource = source.replace(
    CORE_SOURCE_FIREBASE_CONFIG_MARKER,
    `${targetFirebaseConfigDeclaration}\nconst OPENAI_MODEL`
  );
  if (
    !targetSource.includes(targetFirebaseConfigDeclaration)
  ) {
    throw provisioningError(
      "Labor could not specialize its core source for the selected project.",
      "core_source_specialization_failed"
    );
  }

  return targetSource;
}

function buildStorageMediaUploadUrl(
  bucketName,
  objectName,
  { ifGenerationMatch = 0 } = {}
) {
  const generationPrecondition =
    ifGenerationMatch === null || ifGenerationMatch === undefined
      ? ""
      : `&ifGenerationMatch=${encodeURIComponent(ifGenerationMatch)}`;
  return `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(
    bucketName
  )}/o?uploadType=media&name=${encodeURIComponent(
    objectName
  )}${generationPrecondition}`;
}

function buildStorageMediaDownloadUrl(bucketName, objectName) {
  return `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(
    bucketName
  )}/o/${encodeURIComponent(objectName)}?alt=media`;
}

function extractCloudBuildId(operation) {
  return (
    cleanString(operation?.metadata?.build?.id) ||
    cleanString(operation?.response?.id) ||
    cleanString(operation?.name).split("/").filter(Boolean).pop() ||
    ""
  );
}

function normalizeServiceAccountEmail(value) {
  return cleanString(value).split("/").filter(Boolean).pop() || "";
}

function buildCoreDeploymentSteps(projectId) {
  const firebaseBin = "/workspace/.firebase-cli/node_modules/.bin/firebase";
  const functionBatches = chunk(
    CORE_FUNCTION_NAMES,
    CORE_FUNCTION_DEPLOY_BATCH_SIZE
  );
  const steps = [
    {
      id: "install_firebase_cli",
      name: "node:22",
      entrypoint: "npm",
      args: [
        "install",
        "--prefix",
        "/workspace/.firebase-cli",
        "--no-audit",
        "--no-fund",
        "firebase-tools@latest",
      ],
    },
    {
      id: "install_function_dependencies",
      name: "node:22",
      entrypoint: "npm",
      args: [
        "install",
        "--prefix",
        "/workspace/functions",
        "--omit=dev",
        "--no-audit",
        "--no-fund",
        "--package-lock=false",
      ],
      waitFor: ["-"],
    },
  ];

  functionBatches.forEach((names, index) => {
    const id = `deploy_functions_${index + 1}`;
    steps.push({
      id,
      name: "node:22",
      entrypoint: firebaseBin,
      args: [
        "deploy",
        "--only",
        names.map((name) => `functions:${name}`).join(","),
        "--project",
        projectId,
        "--non-interactive",
        "--force",
      ],
      waitFor:
        index === 0
          ? ["install_firebase_cli", "install_function_dependencies"]
          : [`deploy_functions_${index}`],
    });
  });

  steps.push({
    id: "deploy_firebase_configuration",
    name: "node:22",
    entrypoint: firebaseBin,
    args: [
      "deploy",
      "--only",
      "firestore:rules,storage",
      "--project",
      projectId,
      "--non-interactive",
      "--force",
    ],
    waitFor: [`deploy_functions_${functionBatches.length}`],
  });
  return steps;
}

function cloudBuildLogLine(entry) {
  return cleanString(
    entry?.textPayload ||
      entry?.jsonPayload?.message ||
      entry?.protoPayload?.status?.message
  )
    .replace(/\u001b\[[0-9;]*m/g, "")
    .slice(0, 900);
}

function buildCloudBuildFailureMessage(build, logTail = "") {
  const status = cleanString(build?.status) || "FAILURE";
  const failedSteps = (Array.isArray(build?.steps) ? build.steps : [])
    .filter(
      (step) =>
        cleanString(step?.status) === "FAILURE" ||
        Number(step?.exitCode || 0) !== 0
    )
    .map((step, index) => {
      const label = cleanString(step?.id) || `step ${index + 1}`;
      const exitCode = Number(step?.exitCode || 0);
      return exitCode ? `${label} (exit ${exitCode})` : label;
    });
  const details = [
    cleanString(build?.statusDetail),
    cleanString(build?.failureInfo?.detail),
    failedSteps.length ? `Failed step: ${failedSteps.join(", ")}.` : "",
  ].filter(Boolean);
  const conciseLogTail = cleanString(logTail).slice(-5000);
  const logUrl = cleanString(build?.logUrl);
  return [
    `Labor core deployment ended with ${status}.`,
    ...details,
    conciseLogTail ? `Build log:\n${conciseLogTail}` : "",
    logUrl ? `Cloud Build logs: ${logUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function cloudBuildFailureAttentionCode(logTail = "") {
  return /permission denied to enable service|serviceusage\.services\.enable[^\n]*denied/i.test(
    String(logTail || "")
  )
    ? "core_functions_service_enable_required"
    : "core_functions_deployment_failed";
}

function normalizeProject(project) {
  return {
    projectId: cleanString(project?.projectId),
    projectNumber: cleanString(project?.name).replace(/^projects\//, ""),
    displayName: cleanString(project?.displayName),
    state: cleanString(project?.state),
    parent: cleanString(project?.parent),
  };
}

function normalizeFirebaseWebConfig(value, projectId, storageBucket) {
  const config = value && typeof value === "object" ? value : {};
  return {
    apiKey: cleanString(config.apiKey),
    authDomain:
      cleanString(config.authDomain) || `${cleanString(projectId)}.firebaseapp.com`,
    projectId: cleanString(config.projectId) || cleanString(projectId),
    storageBucket: cleanString(config.storageBucket) || cleanString(storageBucket),
    messagingSenderId: cleanString(config.messagingSenderId),
    appId: cleanString(config.appId),
    ...(cleanString(config.measurementId)
      ? { measurementId: cleanString(config.measurementId) }
      : {}),
  };
}

function buildFunctionUrls(projectId, region) {
  return Object.fromEntries(
    CORE_FUNCTION_NAMES.filter(
      (name) =>
        !name.startsWith("run") &&
        name !== "deployTheRelease" &&
        name !== "dailyReleasedAppManagerAgent"
    ).map((name) => [
      name,
      `https://${region}-${projectId}.cloudfunctions.net/${name}`,
    ])
  );
}

function encodeFirestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (value && typeof value.toDate === "function") {
    return { timestampValue: value.toDate().toISOString() };
  }
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value
          .filter((item) => item !== undefined)
          .map((item) => encodeFirestoreValue(item)),
      },
    };
  }
  if (value && typeof value === "object") {
    return {
      mapValue: {
        fields: encodeFirestoreFields(value),
      },
    };
  }
  return { stringValue: String(value) };
}

function encodeFirestoreFields(value) {
  return Object.fromEntries(
    Object.entries(value || {})
      .filter(([, fieldValue]) => fieldValue !== undefined)
      .map(([key, fieldValue]) => [key, encodeFirestoreValue(fieldValue)])
  );
}

function serializeEnvValue(value) {
  return `'${String(value ?? "").replace(/'/g, "\\'")}'`;
}

function buildCoreFirestoreRules(rootCollection) {
  return `rules_version = '2';
service cloud.firestore {
  function isLaborOwner(userEmail) {
    return request.auth != null
      && ((request.auth.token.email != null
          && request.auth.token.email.lower() == userEmail.lower())
        || (request.auth.token.labor_email != null
          && request.auth.token.labor_email.lower() == userEmail.lower()));
  }
  match /databases/{database}/documents {
    match /${rootCollection}/{userEmail}/{document=**} {
      allow read, write: if isLaborOwner(userEmail);
    }
    match /generatedapplication/{appId}/users/{userEmail}/{document=**} {
      allow read, write: if request.auth != null
        && request.auth.token.email != null
        && request.auth.token.email.lower() == userEmail;
    }
    match /generatedapplication/{appId}/{userEmail}/{document=**} {
      allow read, write: if userEmail != "users"
        && request.auth != null
        && request.auth.token.email != null
        && request.auth.token.email.lower() == userEmail;
    }
  }
}
`;
}

function buildCoreStorageRules(rootCollection) {
  return `rules_version = '2';
service firebase.storage {
  function isLaborOwner(userEmail) {
    return request.auth != null
      && ((request.auth.token.email != null
          && request.auth.token.email.lower() == userEmail.lower())
        || (request.auth.token.labor_email != null
          && request.auth.token.labor_email.lower() == userEmail.lower()));
  }
  match /b/{bucket}/o {
    match /${rootCollection}/{userEmail}/{allPaths=**} {
      allow read, write: if isLaborOwner(userEmail);
    }
    match /Configurations/{userEmail}/{allPaths=**} {
      allow read, write: if isLaborOwner(userEmail);
    }
    match /generatedapplication/{appId}/users/{userEmail}/{allPaths=**} {
      allow read, write: if request.auth != null
        && request.auth.token.email != null
        && request.auth.token.email.lower() == userEmail;
    }
    match /generatedapplication/{appId}/{userEmail}/{allPaths=**} {
      allow read, write: if userEmail != "users"
        && request.auth != null
        && request.auth.token.email != null
        && request.auth.token.email.lower() == userEmail;
    }
  }
}
`;
}

function buildCoreFirebaseJson() {
  return JSON.stringify(
    {
      functions: {
        source: "functions",
        runtime: "nodejs22",
      },
      firestore: {
        rules: "firestore.rules",
      },
      storage: {
        rules: "storage.rules",
      },
    },
    null,
    2
  );
}

function buildFirebaseAuthProvisionRequest({ projectId, appId, userEmail }) {
  return {
    parent: `projects/${cleanString(projectId)}`,
    appNamespace: cleanString(appId),
    webInput: {},
    firebaseAuthInput: {
      anonymousAuthProviderMode: "PROVIDER_ENABLED",
      emailAuthProviderMode: "PROVIDER_ENABLED",
      googleSigninProviderMode: "PROVIDER_ENABLED",
      googleSigninProviderConfig: {
        publicDisplayName: "Labor",
        customerSupportEmail: cleanString(userEmail),
      },
    },
  };
}

function createGoogleCloudProvisioner({
  admin,
  db,
  logger,
  // Existing control-plane data lives at this pre-release physical path.
  rootCollection = "testkitchen",
  configCollection = "Configurations",
  secretCollection = "ConfigurationSecrets",
  region = "us-central1",
  controlProjectId = "",
  googleAuth = new GoogleAuth({ scopes: [GOOGLE_CLOUD_SCOPE] }),
}) {
  const runtimeProjectId =
    cleanString(
      process.env.LABOR_TARGET_PROJECT_ID ||
        process.env.GCLOUD_PROJECT ||
        process.env.GCP_PROJECT
    ) ||
    controlProjectId;
  let sourceAuthClientPromise = null;
  let platformServiceAccountEmailPromise = null;

  function refs(userDocId) {
    const userRef = db.collection(rootCollection).doc(userDocId);
    return {
      userRef,
      configRef: userRef.collection(configCollection).doc("googleCloud"),
      secretRef: userRef.collection(secretCollection).doc("googleCloud"),
      deploymentRef: userRef.collection(configCollection).doc("deployment"),
    };
  }

  async function sourceAuthClient() {
    if (!sourceAuthClientPromise) sourceAuthClientPromise = googleAuth.getClient();
    return sourceAuthClientPromise;
  }

  async function getAccessToken(authClient) {
    const client = authClient || (await sourceAuthClient());
    const tokenResult = await client.getAccessToken();
    const token =
      typeof tokenResult === "string"
        ? tokenResult
        : cleanString(tokenResult?.token);
    if (!token) {
      throw provisioningError(
        "Google Cloud did not issue a deployment access token.",
        "cloud_access_token_missing"
      );
    }
    return token;
  }

  async function googleRequest({
    url,
    accessToken = "",
    authClient = null,
    method = "GET",
    body,
    rawBody,
    headers = {},
    allowStatuses = [],
    timeoutMs = 45000,
  }) {
    const token = cleanString(accessToken) || (await getAccessToken(authClient));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body === undefined && rawBody === undefined
            ? {}
            : { "Content-Type": rawBody === undefined ? "application/json" : "application/octet-stream" }),
          ...headers,
        },
        ...(body === undefined && rawBody === undefined
          ? {}
          : { body: rawBody === undefined ? JSON.stringify(body) : rawBody }),
        signal: controller.signal,
      });
      const text = await response.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = text || {};
      }
      if (response.ok || allowStatuses.includes(response.status)) {
        return { status: response.status, data, headers: response.headers };
      }
      const message = cleanString(
        data?.error?.message || data?.error_description || data?.message || text
      );
      throw provisioningError(
        message || `Google returned HTTP ${response.status}.`,
        `google_api_${response.status}`,
        { googleStatus: response.status, googleData: data, googleUrl: url }
      );
    } catch (error) {
      if (error?.attentionCode) throw error;
      throw provisioningError(
        error?.name === "AbortError"
          ? "Google Cloud did not finish the request in time."
          : "Google Cloud could not be reached.",
        error?.name === "AbortError" ? "google_api_timeout" : "google_api_unreachable",
        { cause: error }
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async function pollOperation({
    operation,
    baseUrl,
    accessToken = "",
    authClient = null,
    attempts = 120,
    waitMs = 2000,
  }) {
    let current = operation && typeof operation === "object" ? operation : {};
    const name = cleanString(current.name);
    if (!name || current.done) {
      if (current.error) {
        throw provisioningError(
          cleanString(current.error.message) || "Google Cloud provisioning failed.",
          "google_operation_failed",
          { googleData: current.error }
        );
      }
      return current;
    }

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (attempt > 0) await delay(waitMs);
      const result = await googleRequest({
        url: `${baseUrl.replace(/\/+$/g, "")}/${name}`,
        accessToken,
        authClient,
      });
      current = result.data || {};
      if (!current.done) continue;
      if (current.error) {
        throw provisioningError(
          cleanString(current.error.message) || "Google Cloud provisioning failed.",
          "google_operation_failed",
          { googleData: current.error }
        );
      }
      return current;
    }
    throw provisioningError(
      "Google Cloud provisioning is taking longer than expected. Try again after a few minutes.",
      "google_operation_timeout"
    );
  }

  async function getPlatformServiceAccountEmail() {
    if (!platformServiceAccountEmailPromise) {
      platformServiceAccountEmailPromise = (async () => {
        const configured = cleanString(process.env.LABOR_PLATFORM_SERVICE_ACCOUNT);
        if (configured) return configured;
        const credentials = await googleAuth.getCredentials();
        const email = cleanString(credentials?.client_email);
        if (email.endsWith(".gserviceaccount.com")) return email;
        throw provisioningError(
          "Labor's deployed runtime service account could not be identified. Set LABOR_PLATFORM_SERVICE_ACCOUNT and reconnect.",
          "platform_service_account_missing"
        );
      })();
    }
    return platformServiceAccountEmailPromise;
  }

  function impersonatedAuthClient(
    serviceAccountEmail,
    targetScopes = [GOOGLE_CLOUD_SCOPE]
  ) {
    return sourceAuthClient().then(
      (client) =>
        new Impersonated({
          sourceClient: client,
          targetPrincipal: serviceAccountEmail,
          targetScopes,
          lifetime: 3600,
        })
    );
  }

  function delegatedUserAuthClient(accessToken, estimatedExpiresAtMs = 0) {
    const client = new OAuth2Client();
    client.setCredentials({
      access_token: cleanString(accessToken),
      token_type: "Bearer",
      expiry_date:
        Number(estimatedExpiresAtMs || 0) || Date.now() + 50 * 60 * 1000,
    });
    return client;
  }

  async function listProjects(accessToken) {
    const projects = [];
    let pageToken = "";
    for (let page = 0; page < 5; page += 1) {
      const result = await googleRequest({
        url: `https://cloudresourcemanager.googleapis.com/v3/projects:search?pageSize=100${
          pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""
        }`,
        accessToken,
      });
      projects.push(
        ...(Array.isArray(result.data?.projects) ? result.data.projects : [])
          .map(normalizeProject)
          .filter((project) => project.projectId)
      );
      pageToken = cleanString(result.data?.nextPageToken);
      if (!pageToken) break;
    }
    return projects;
  }

  async function checkProjectPermissions(project, accessToken) {
    try {
      const result = await googleRequest({
        url: `https://cloudresourcemanager.googleapis.com/v3/projects/${encodeURIComponent(
          project.projectId
        )}:testIamPermissions`,
        accessToken,
        method: "POST",
        body: { permissions: REQUIRED_CONNECTION_PERMISSIONS },
      });
      const granted = new Set(
        (Array.isArray(result.data?.permissions) ? result.data.permissions : []).map(
          cleanString
        )
      );
      const missing = REQUIRED_CONNECTION_PERMISSIONS.filter(
        (permission) => !granted.has(permission)
      );
      return {
        ...project,
        deploymentReady: missing.length === 0,
        grantedDeploymentPermissions: [...granted],
        missingDeploymentPermissions: missing,
        permissionCheckError: "",
      };
    } catch (error) {
      return {
        ...project,
        deploymentReady: false,
        grantedDeploymentPermissions: [],
        missingDeploymentPermissions: REQUIRED_CONNECTION_PERMISSIONS,
        permissionCheckError: errorMessage(error),
      };
    }
  }

  async function saveAttention({
    identity,
    userDocId,
    connection = {},
    error,
    stage = "connection",
    preserveAccessToken = false,
  }) {
    const nowMs = Date.now();
    const attentionCode =
      cleanString(error?.attentionCode || error?.code) || "cloud_setup_failed";
    const message = errorMessage(error);
    const { configRef, secretRef, deploymentRef } = refs(userDocId);
    const batch = db.batch();
    batch.set(
      configRef,
      {
        kind: "google_cloud_connection",
        provider: "google_cloud",
        status: "needs_attention",
        provisioningStatus: "needs_attention",
        provisioningStage: stage,
        requestedScope: cleanString(connection?.requestedScope),
        connectedEmail: cleanString(connection?.connectedEmail || identity?.email),
        validationStatus: "failed",
        attentionCode,
        attentionProjectId: cleanString(error?.attentionProjectId),
        missingDeploymentPermissions: Array.isArray(
          error?.missingDeploymentPermissions
        )
          ? error.missingDeploymentPermissions.map(cleanString).filter(Boolean)
          : [],
        accessTokenStored: Boolean(preserveAccessToken),
        ...(preserveAccessToken
          ? {}
          : {
              estimatedExpiresAtMs:
                admin.firestore.FieldValue.delete(),
            }),
        ...(cleanString(error?.buildStatus)
          ? { coreBuildStatus: cleanString(error.buildStatus) }
          : {}),
        ...(cleanString(error?.buildLogUrl)
          ? { coreBuildLogUrl: cleanString(error.buildLogUrl) }
          : {}),
        lastValidationError: message,
        lastValidatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastValidatedAtMs: nowMs,
        userEmail: identity?.email || "",
        userId: identity?.uid || "",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    batch.set(
      secretRef,
      {
        provider: "google_cloud",
        status: "needs_attention",
        ...(preserveAccessToken
          ? {}
          : {
              accessToken: admin.firestore.FieldValue.delete(),
              estimatedExpiresAtMs:
                admin.firestore.FieldValue.delete(),
            }),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    batch.set(
      deploymentRef,
      {
        kind: "deployment",
        provider: "google_cloud",
        title: "Google Cloud",
        status: "needs_attention",
        attentionCode,
        provisioningStage: stage,
        ...(cleanString(error?.buildStatus)
          ? { coreBuildStatus: cleanString(error.buildStatus) }
          : {}),
        ...(cleanString(error?.buildLogUrl)
          ? { coreBuildLogUrl: cleanString(error.buildLogUrl) }
          : {}),
        lastValidationError: message,
        userEmail: identity?.email || "",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    await batch.commit();
    return {
      connected: false,
      ready: false,
      status: "needs_attention",
      attentionCode,
      stage,
      error: message,
    };
  }

  async function saveConnection({ identity, userDocId, connection }) {
    const normalizedUserDocId = safeDocumentId(userDocId || identity?.email);
    const accessToken = cleanString(connection?.accessToken);
    if (!accessToken) {
      return saveAttention({
        identity,
        userDocId: normalizedUserDocId,
        connection,
        error: provisioningError(
          "Google did not return a Cloud access token.",
          "missing_access_token"
        ),
      });
    }

    try {
      const [identityResult, projects] = await Promise.all([
        googleRequest({
          url: "https://openidconnect.googleapis.com/v1/userinfo",
          accessToken,
        }),
        listProjects(accessToken),
      ]);
      const googleEmail = cleanString(identityResult.data?.email).toLowerCase();
      if (!googleEmail || googleEmail !== cleanString(identity?.email).toLowerCase()) {
        throw provisioningError(
          "Connect the same Google account you use to sign in to Labor.",
          "google_account_mismatch"
        );
      }
      if (!projects.length) {
        throw provisioningError(
          "Google Cloud connected, but this account has no accessible projects.",
          "no_accessible_projects"
        );
      }

      const activeProjects = projects.filter(
        (project) => !project.state || project.state === "ACTIVE"
      );
      const checkedProjects = [];
      for (let index = 0; index < activeProjects.length; index += 5) {
        checkedProjects.push(
          ...(await Promise.all(
            activeProjects
              .slice(index, index + 5)
              .map((project) => checkProjectPermissions(project, accessToken))
          ))
        );
      }
      const readyProjects = checkedProjects.filter(
        (project) => project.deploymentReady
      );
      if (!readyProjects.length) {
        const example = checkedProjects[0];
        const missing = (example?.missingDeploymentPermissions || []).slice(0, 5);
        throw provisioningError(
          `No accessible project grants the setup permissions Labor needs.${
            missing.length
              ? ` Missing on ${example.projectId}: ${missing.join(", ")}.`
              : ""
          }`,
          "insufficient_deployment_permissions",
          {
            attentionProjectId: example?.projectId || "",
            missingDeploymentPermissions:
              example?.missingDeploymentPermissions || [],
          }
        );
      }

      const nowMs = Date.now();
      const estimatedExpiresAtMs = nowMs + 55 * 60 * 1000;
      const { configRef, secretRef, deploymentRef } = refs(normalizedUserDocId);
      const previousSnapshot = await configRef.get();
      const previous = previousSnapshot.exists ? previousSnapshot.data() || {} : {};
      const previousProjectId = cleanString(
        previous.selectedProjectId || previous.defaultProjectId
      );
      const suggestedProject =
        readyProjects.find((project) => project.projectId === previousProjectId) ||
        (readyProjects.length === 1 ? readyProjects[0] : null);
      const connectedAccount = {
        subject: cleanString(identityResult.data?.sub),
        email: googleEmail,
        emailVerified: Boolean(identityResult.data?.email_verified),
        name: cleanString(identityResult.data?.name || connection?.displayName),
        picture: cleanString(identityResult.data?.picture || connection?.photoURL),
      };
      const batch = db.batch();
      batch.set(
        configRef,
        {
          kind: "google_cloud_connection",
          provider: "google_cloud",
          status: "project_selection",
          provisioningStatus: "awaiting_project",
          provisioningStage: "select_project",
          validationStatus: "valid",
          requestedScope: cleanString(connection?.requestedScope),
          connectedAccount,
          connectedEmail: connectedAccount.email,
          connectedUserId: cleanString(connection?.connectedUserId),
          providerId: cleanString(connection?.providerId || "google.com"),
          projects: checkedProjects,
          projectCount: checkedProjects.length,
          readyProjectCount: readyProjects.length,
          selectedProjectId: suggestedProject?.projectId || "",
          defaultProjectId: suggestedProject?.projectId || "",
          requiredDeploymentPermissions: REQUIRED_CONNECTION_PERMISSIONS,
          verifiedCapabilities: [
            "google_identity",
            "cloud_resource_manager_projects_search",
            "deployment_iam_permissions",
          ],
          accessTokenStored: true,
          coreBuildId: admin.firestore.FieldValue.delete(),
          coreBuildStatus: admin.firestore.FieldValue.delete(),
          coreBuildStatusDetail: admin.firestore.FieldValue.delete(),
          coreBuildLogUrl: admin.firestore.FieldValue.delete(),
          coreBuildSourceObject: admin.firestore.FieldValue.delete(),
          coreDeploymentVersion: admin.firestore.FieldValue.delete(),
          provisioningSubmittedAtMs: admin.firestore.FieldValue.delete(),
          connectedAt: admin.firestore.FieldValue.serverTimestamp(),
          connectedAtMs: nowMs,
          estimatedExpiresAtMs,
          attentionCode: admin.firestore.FieldValue.delete(),
          attentionProjectId: admin.firestore.FieldValue.delete(),
          missingDeploymentPermissions: admin.firestore.FieldValue.delete(),
          lastValidationError: admin.firestore.FieldValue.delete(),
          lastValidatedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastValidatedAtMs: nowMs,
          userEmail: identity.email,
          userId: identity.uid,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      batch.set(
        secretRef,
        {
          provider: "google_cloud",
          status: "connected",
          accessToken,
          tokenType: "Bearer",
          requestedScope: cleanString(connection?.requestedScope),
          connectedAccountEmail: connectedAccount.email,
          obtainedAtMs: nowMs,
          estimatedExpiresAtMs,
          userEmail: identity.email,
          userId: identity.uid,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      batch.set(
        deploymentRef,
        {
          kind: "deployment",
          provider: "google_cloud",
          title: "Google Cloud",
          status: "project_selection",
          selectedProjectId: suggestedProject?.projectId || "",
          projectCount: checkedProjects.length,
          coreBuildId: admin.firestore.FieldValue.delete(),
          coreBuildStatus: admin.firestore.FieldValue.delete(),
          coreBuildLogUrl: admin.firestore.FieldValue.delete(),
          coreDeploymentVersion: admin.firestore.FieldValue.delete(),
          userEmail: identity.email,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      await batch.commit();

      return {
        connected: true,
        ready: false,
        status: "project_selection",
        connectedEmail: connectedAccount.email,
        projects: checkedProjects.map((project) => ({
          projectId: project.projectId,
          projectNumber: project.projectNumber,
          displayName: project.displayName,
          deploymentReady: project.deploymentReady,
          missingDeploymentPermissions: project.missingDeploymentPermissions,
        })),
        readyProjectCount: readyProjects.length,
        selectedProjectId: suggestedProject?.projectId || "",
        requiresProjectSelection: readyProjects.length > 1,
        estimatedExpiresAtMs,
      };
    } catch (error) {
      return saveAttention({
        identity,
        userDocId: normalizedUserDocId,
        connection,
        error,
      });
    }
  }

  async function updateStage({
    identity,
    userDocId,
    projectId,
    stage,
    status = "provisioning",
    extra = {},
  }) {
    const { configRef, deploymentRef } = refs(userDocId);
    const nowMs = Date.now();
    await Promise.all([
      configRef.set(
        {
          status,
          provisioningStatus: status,
          provisioningStage: stage,
          selectedProjectId: projectId,
          defaultProjectId: projectId,
          provisioningUpdatedAtMs: nowMs,
          userEmail: identity.email,
          userId: identity.uid,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          ...extra,
        },
        { merge: true }
      ),
      deploymentRef.set(
        {
          status,
          provisioningStage: stage,
          selectedProjectId: projectId,
          defaultProjectId: projectId,
          userEmail: identity.email,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          ...extra,
        },
        { merge: true }
      ),
    ]);
  }

  async function enableRequiredApis({ projectNumber, accessToken }) {
    for (const serviceIds of chunk(REQUIRED_APIS, 20)) {
      const result = await googleRequest({
        url: `https://serviceusage.googleapis.com/v1/projects/${encodeURIComponent(
          projectNumber
        )}/services:batchEnable`,
        accessToken,
        method: "POST",
        body: { serviceIds },
        timeoutMs: 90000,
      });
      await pollOperation({
        operation: result.data,
        baseUrl: "https://serviceusage.googleapis.com/v1",
        accessToken,
        attempts: 120,
        waitMs: 2000,
      });
    }
  }

  async function assertBillingEnabled({ projectId, accessToken }) {
    const result = await googleRequest({
      url: `https://cloudbilling.googleapis.com/v1/projects/${encodeURIComponent(
        projectId
      )}/billingInfo`,
      accessToken,
    });
    if (!result.data?.billingEnabled) {
      throw provisioningError(
        "Enable billing on this Google Cloud project before connecting it. Firebase Storage, Cloud Functions, and Cloud Build require a billing account.",
        "billing_not_enabled",
        { attentionProjectId: projectId }
      );
    }
  }

  async function ensureFirebaseProject({ projectId, accessToken }) {
    const getUrl = `https://firebase.googleapis.com/v1beta1/projects/${encodeURIComponent(
      projectId
    )}`;
    const existing = await googleRequest({
      url: getUrl,
      accessToken,
      allowStatuses: [404],
    });
    if (existing.status !== 404) return existing.data;
    const created = await googleRequest({
      url: `${getUrl}:addFirebase`,
      accessToken,
      method: "POST",
      body: {},
      timeoutMs: 90000,
    });
    const completed = await pollOperation({
      operation: created.data,
      baseUrl: "https://firebase.googleapis.com/v1beta1",
      accessToken,
      attempts: 180,
      waitMs: 2000,
    });
    return completed.response || {};
  }

  async function ensureServiceAccount({ projectId, accessToken }) {
    const serviceAccountEmail = `${CORE_SERVICE_ACCOUNT_ID}@${projectId}.iam.gserviceaccount.com`;
    const resource = `projects/${projectId}/serviceAccounts/${serviceAccountEmail}`;
    const getResult = await googleRequest({
      url: `https://iam.googleapis.com/v1/${resource}`,
      accessToken,
      allowStatuses: [404],
    });
    if (getResult.status === 404) {
      const creationStartedAtMs = Date.now();
      await googleRequest({
        url: `https://iam.googleapis.com/v1/projects/${encodeURIComponent(
          projectId
        )}/serviceAccounts`,
        accessToken,
        method: "POST",
        body: {
          accountId: CORE_SERVICE_ACCOUNT_ID,
          serviceAccount: {
            displayName: "Labor runtime",
            description:
              "Keyless runtime and deployment identity created by Labor.",
          },
        },
        allowStatuses: [409],
      });

      for (
        let attempt = 0;
        attempt < SERVICE_ACCOUNT_READY_ATTEMPTS;
        attempt += 1
      ) {
        const [accountResult, policyResult] = await Promise.all([
          googleRequest({
            url: `https://iam.googleapis.com/v1/${resource}`,
            accessToken,
            allowStatuses: [404],
          }),
          googleRequest({
            url: `https://iam.googleapis.com/v1/${resource}:getIamPolicy`,
            accessToken,
            method: "POST",
            body: {},
            allowStatuses: [404],
          }),
        ]);
        const oldEnoughToUse =
          Date.now() - creationStartedAtMs >= SERVICE_ACCOUNT_MINIMUM_AGE_MS;
        if (
          accountResult.status !== 404 &&
          policyResult.status !== 404 &&
          oldEnoughToUse
        ) {
          return { serviceAccountEmail, resource };
        }
        if (attempt < SERVICE_ACCOUNT_READY_ATTEMPTS - 1) {
          await delay(SERVICE_ACCOUNT_READY_POLL_MS);
        }
      }

      throw provisioningError(
        `Google accepted creation of ${serviceAccountEmail}, but the service account is still becoming available. Labor will retry automatically.`,
        "service_account_not_ready"
      );
    }
    return { serviceAccountEmail, resource };
  }

  async function getDefaultCloudBuildServiceAccount({
    projectId,
    accessToken,
  }) {
    const locations = [...new Set([region, "global"].filter(Boolean))];
    let lastError = null;
    for (
      let attempt = 0;
      attempt < CLOUD_BUILD_SERVICE_ACCOUNT_ATTEMPTS;
      attempt += 1
    ) {
      let sawSuccessfulResponse = false;
      for (const location of locations) {
        try {
          const result = await googleRequest({
            url: `https://cloudbuild.googleapis.com/v1/projects/${encodeURIComponent(
              projectId
            )}/locations/${encodeURIComponent(
              location
            )}/defaultServiceAccount`,
            accessToken,
            allowStatuses: [404],
          });
          const serviceAccountEmail = normalizeServiceAccountEmail(
            result.data?.serviceAccountEmail
          );
          if (result.status !== 404) {
            sawSuccessfulResponse = true;
            if (serviceAccountEmail) return serviceAccountEmail;
          }
        } catch (error) {
          lastError = error;
        }
      }
      if (sawSuccessfulResponse) return "";
      if (attempt < CLOUD_BUILD_SERVICE_ACCOUNT_ATTEMPTS - 1) {
        await delay(CLOUD_BUILD_SERVICE_ACCOUNT_POLL_MS);
      }
    }
    throw provisioningError(
      "Google Cloud Build is enabled, but its default build identity is still initializing. Labor will retry automatically.",
      "cloud_build_service_account_not_ready",
      { cause: lastError, attentionProjectId: projectId }
    );
  }

  async function waitForServiceAccountAvailability({
    projectId,
    serviceAccountEmail,
    accessToken,
  }) {
    if (!serviceAccountEmail) return;
    const resource = `projects/${projectId}/serviceAccounts/${serviceAccountEmail}`;
    for (
      let attempt = 0;
      attempt < CLOUD_BUILD_SERVICE_ACCOUNT_ATTEMPTS;
      attempt += 1
    ) {
      const result = await googleRequest({
        url: `https://iam.googleapis.com/v1/${resource}`,
        accessToken,
        allowStatuses: [404],
      });
      if (result.status !== 404) return;
      if (attempt < CLOUD_BUILD_SERVICE_ACCOUNT_ATTEMPTS - 1) {
        await delay(CLOUD_BUILD_SERVICE_ACCOUNT_POLL_MS);
      }
    }
    throw provisioningError(
      `Google selected ${serviceAccountEmail} for Cloud Build, but that identity is still initializing. Labor will retry automatically.`,
      "cloud_build_service_account_not_ready",
      { attentionProjectId: projectId }
    );
  }

  async function grantProjectRoles({
    projectId,
    serviceAccountEmail,
    defaultCloudBuildServiceAccountEmail,
    accessToken,
  }) {
    const getResult = await googleRequest({
      url: `https://cloudresourcemanager.googleapis.com/v1/projects/${encodeURIComponent(
        projectId
      )}:getIamPolicy`,
      accessToken,
      method: "POST",
      body: { options: { requestedPolicyVersion: 3 } },
    });
    const policy = getResult.data || {};
    const bindings = Array.isArray(policy.bindings) ? policy.bindings.slice() : [];
    function addRoles(member, roles) {
      roles.forEach((role) => {
        const binding = bindings.find(
          (candidate) => candidate.role === role && !candidate.condition
        );
        if (binding) {
          binding.members = [...new Set([...(binding.members || []), member])];
        } else {
          bindings.push({ role, members: [member] });
        }
      });
    }

    addRoles(
      `serviceAccount:${serviceAccountEmail}`,
      CORE_SERVICE_ACCOUNT_ROLES
    );
    if (defaultCloudBuildServiceAccountEmail) {
      addRoles(
        `serviceAccount:${defaultCloudBuildServiceAccountEmail}`,
        ["roles/cloudbuild.builds.builder"]
      );
    }
    await googleRequest({
      url: `https://cloudresourcemanager.googleapis.com/v1/projects/${encodeURIComponent(
        projectId
      )}:setIamPolicy`,
      accessToken,
      method: "POST",
      body: {
        policy: {
          ...policy,
          version: Math.max(Number(policy.version || 1), 3),
          bindings,
        },
        updateMask: "bindings,etag,version",
      },
    });
  }

  async function grantPlatformImpersonation({
    serviceAccountResource,
    platformServiceAccountEmail,
    accessToken,
  }) {
    const getResult = await googleRequest({
      url: `https://iam.googleapis.com/v1/${serviceAccountResource}:getIamPolicy`,
      accessToken,
      method: "POST",
      body: {},
    });
    const policy = getResult.data || {};
    const bindings = Array.isArray(policy.bindings) ? policy.bindings.slice() : [];
    const role = "roles/iam.serviceAccountTokenCreator";
    const member = `serviceAccount:${platformServiceAccountEmail}`;
    const binding = bindings.find(
      (candidate) => candidate.role === role && !candidate.condition
    );
    if (binding) {
      binding.members = [...new Set([...(binding.members || []), member])];
    } else {
      bindings.push({ role, members: [member] });
    }
    const saved = await googleRequest({
      url: `https://iam.googleapis.com/v1/${serviceAccountResource}:setIamPolicy`,
      accessToken,
      method: "POST",
      body: {
        policy: {
          ...policy,
          version: Math.max(Number(policy.version || 1), 3),
          bindings,
        },
        updateMask: "bindings,etag,version",
      },
    });
    const savedBinding = (Array.isArray(saved.data?.bindings)
      ? saved.data.bindings
      : []
    ).find((candidate) => candidate.role === role && !candidate.condition);
    if (!savedBinding?.members?.includes(member)) {
      throw provisioningError(
        `Google IAM did not retain the Token Creator grant for ${platformServiceAccountEmail}.`,
        "service_account_impersonation_grant_missing"
      );
    }
  }

  async function waitForImpersonation(
    serviceAccountEmail,
    { attempts = 18, waitMs = 5000 } = {}
  ) {
    let lastError = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const client = await impersonatedAuthClient(serviceAccountEmail);
        await getAccessToken(client);
        return client;
      } catch (error) {
        lastError = error;
        if (attempt < attempts - 1) await delay(waitMs);
      }
    }
    throw provisioningError(
      `Labor created ${serviceAccountEmail}, but Google IAM has not enabled keyless access yet. ${errorMessage(
        lastError
      )}`,
      "service_account_impersonation_not_ready"
    );
  }

  async function waitForRuntimeDeploymentPermissions({
    projectId,
    authClient,
    attempts = RUNTIME_PERMISSION_ATTEMPTS,
    waitMs = RUNTIME_PERMISSION_POLL_MS,
  }) {
    let missingPermissions = RUNTIME_DEPLOYMENT_PERMISSIONS.slice();
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const result = await googleRequest({
        url: `https://cloudresourcemanager.googleapis.com/v3/projects/${encodeURIComponent(
          projectId
        )}:testIamPermissions`,
        authClient,
        method: "POST",
        body: { permissions: RUNTIME_DEPLOYMENT_PERMISSIONS },
      });
      const granted = new Set(
        (Array.isArray(result.data?.permissions)
          ? result.data.permissions
          : []
        ).map(cleanString)
      );
      missingPermissions = RUNTIME_DEPLOYMENT_PERMISSIONS.filter(
        (permission) => !granted.has(permission)
      );
      if (!missingPermissions.length) return authClient;
      if (attempt < attempts - 1) await delay(waitMs);
    }
    throw provisioningError(
      `Google IAM is still applying Labor's runtime permissions: ${missingPermissions.join(
        ", "
      )}. Labor will retry automatically.`,
      "runtime_permissions_not_ready",
      { missingDeploymentPermissions: missingPermissions }
    );
  }

  async function ensureFirestore({ projectId, authClient }) {
    const databaseUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      projectId
    )}/databases/(default)`;
    const existing = await googleRequest({
      url: databaseUrl,
      authClient,
      allowStatuses: [404],
    });
    if (existing.status !== 404) return existing.data;
    const created = await googleRequest({
      url: `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
        projectId
      )}/databases?databaseId=${encodeURIComponent("(default)")}`,
      authClient,
      method: "POST",
      body: {
        locationId: DEFAULT_FIRESTORE_LOCATION,
        type: "FIRESTORE_NATIVE",
        deleteProtectionState: "DELETE_PROTECTION_ENABLED",
      },
      timeoutMs: 90000,
    });
    const completed = await pollOperation({
      operation: created.data,
      baseUrl: "https://firestore.googleapis.com/v1",
      authClient,
      attempts: 180,
      waitMs: 2000,
    });
    return completed.response || {};
  }

  async function ensureAuthentication({ projectId, authClient }) {
    const configUrl = `https://identitytoolkit.googleapis.com/admin/v2/projects/${encodeURIComponent(
      projectId
    )}/config`;
    const existing = await googleRequest({
      url: configUrl,
      authClient,
      allowStatuses: [404],
    });
    if (existing.status === 404) {
      await googleRequest({
        url: `https://identitytoolkit.googleapis.com/v2/projects/${encodeURIComponent(
          projectId
        )}/identityPlatform:initializeAuth`,
        authClient,
        method: "POST",
        body: {},
        allowStatuses: [409],
      });
    }
    return { initialized: true };
  }

  async function configureAuthenticationProviders({
    projectId,
    appId,
    userEmail,
    authClient,
  }) {
    const created = await googleRequest({
      url: "https://firebase.googleapis.com/v1alpha/firebase:provisionFirebaseApp",
      authClient,
      method: "POST",
      body: buildFirebaseAuthProvisionRequest({ projectId, appId, userEmail }),
      timeoutMs: 120000,
    });
    const completed = await pollOperation({
      operation: created.data,
      baseUrl: "https://firebase.googleapis.com/v1beta1",
      authClient,
      attempts: 120,
      waitMs: 1500,
    });
    return {
      initialized: true,
      emailPasswordEnabled: true,
      anonymousEnabled: true,
      googleSignInEnabled: true,
      appResource: cleanString(completed.response?.appResource),
    };
  }

  async function ensureDefaultStorageBucket({ projectId, authClient }) {
    const result = await googleRequest({
      url: `https://firebasestorage.googleapis.com/v1alpha/projects/${encodeURIComponent(
        projectId
      )}/defaultBucket`,
      authClient,
      method: "POST",
      body: { location: DEFAULT_STORAGE_LOCATION },
      allowStatuses: [409],
      timeoutMs: 90000,
    });
    let bucketName = cleanString(
      result.data?.bucket?.name || result.data?.bucketName
    );
    if (!bucketName) {
      const firebaseProject = await googleRequest({
        url: `https://firebase.googleapis.com/v1beta1/projects/${encodeURIComponent(
          projectId
        )}`,
        authClient,
      });
      bucketName = cleanString(firebaseProject.data?.resources?.storageBucket);
    }
    if (!bucketName) {
      const buckets = await googleRequest({
        url: `https://storage.googleapis.com/storage/v1/b?project=${encodeURIComponent(
          projectId
        )}&maxResults=100`,
        authClient,
      });
      const names = (Array.isArray(buckets.data?.items)
        ? buckets.data.items
        : []
      )
        .map((item) => cleanString(item?.name))
        .filter(Boolean);
      bucketName =
        names.find((name) => name === `${projectId}.firebasestorage.app`) ||
        names.find((name) => name === `${projectId}.appspot.com`) ||
        "";
    }
    if (!bucketName) {
      throw provisioningError(
        "Firebase Storage was initialized, but its default bucket could not be found.",
        "default_storage_bucket_missing",
        { attentionProjectId: projectId }
      );
    }
    return { bucketName, resource: result.data || {} };
  }

  async function ensureBuildBucket({ projectId, authClient }) {
    const bucketName = `${projectId}-labor-builds`.slice(0, 63);
    const existing = await googleRequest({
      url: `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(
        bucketName
      )}`,
      authClient,
      allowStatuses: [404],
    });
    if (existing.status === 404) {
      await googleRequest({
        url: `https://storage.googleapis.com/storage/v1/b?project=${encodeURIComponent(
          projectId
        )}`,
        authClient,
        method: "POST",
        body: {
          name: bucketName,
          location: "US",
          storageClass: "STANDARD",
          iamConfiguration: {
            uniformBucketLevelAccess: { enabled: true },
          },
          labels: { managed_by: "labor", purpose: "builds" },
        },
      });
    }
    return bucketName;
  }

  async function ensureHostingSite({ projectId, authClient }) {
    const listResult = await googleRequest({
      url: `https://firebasehosting.googleapis.com/v1beta1/projects/${encodeURIComponent(
        projectId
      )}/sites?pageSize=100`,
      authClient,
    });
    const sites = Array.isArray(listResult.data?.sites) ? listResult.data.sites : [];
    const existing =
      sites.find((site) => cleanString(site.type) === "DEFAULT_SITE") || sites[0];
    if (existing) return existing;

    const candidates = [
      projectId.slice(0, 30),
      `${projectId.slice(0, 21)}-${projectId.length}`.slice(0, 30),
    ];
    let lastError = null;
    for (const siteId of candidates) {
      try {
        const created = await googleRequest({
          url: `https://firebasehosting.googleapis.com/v1beta1/projects/${encodeURIComponent(
            projectId
          )}/sites?siteId=${encodeURIComponent(siteId)}`,
          authClient,
          method: "POST",
          body: {},
        });
        return created.data;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || provisioningError("Could not create Firebase Hosting.", "hosting_failed");
  }

  async function ensureFirebaseWebApp({ projectId, authClient }) {
    const listResult = await googleRequest({
      url: `https://firebase.googleapis.com/v1beta1/projects/${encodeURIComponent(
        projectId
      )}/webApps?pageSize=100`,
      authClient,
    });
    const apps = Array.isArray(listResult.data?.apps) ? listResult.data.apps : [];
    let app =
      apps.find((candidate) => cleanString(candidate.displayName) === "Labor Workspace") ||
      apps[0] ||
      null;
    if (!app) {
      const created = await googleRequest({
        url: `https://firebase.googleapis.com/v1beta1/projects/${encodeURIComponent(
          projectId
        )}/webApps`,
        authClient,
        method: "POST",
        body: { displayName: "Labor Workspace" },
      });
      const completed = await pollOperation({
        operation: created.data,
        baseUrl: "https://firebase.googleapis.com/v1beta1",
        authClient,
        attempts: 120,
        waitMs: 2000,
      });
      app = completed.response || {};
    }
    const appId = cleanString(app.appId || app.name?.split("/").pop());
    if (!appId) {
      throw provisioningError(
        "Firebase created the project but did not return a web application ID.",
        "firebase_web_app_missing"
      );
    }
    const configResult = await googleRequest({
      url: `https://firebase.googleapis.com/v1beta1/projects/${encodeURIComponent(
        projectId
      )}/webApps/${encodeURIComponent(appId)}/config`,
      authClient,
    });
    return { appId, app, config: configResult.data || {} };
  }

  async function getAnalyticsDetails({ projectId, authClient }) {
    const result = await googleRequest({
      url: `https://firebase.googleapis.com/v1beta1/projects/${encodeURIComponent(
        projectId
      )}/analyticsDetails`,
      authClient,
      allowStatuses: [404],
    });
    return result.status === 404 ? null : result.data;
  }

  async function ensureFirebaseAnalytics({ projectId, authClient }) {
    const existing = await getAnalyticsDetails({ projectId, authClient });
    if (cleanString(existing?.analyticsProperty?.id)) {
      return {
        status: "connected",
        details: existing,
        error: "",
      };
    }

    const accountsResult = await googleRequest({
      url: "https://analyticsadmin.googleapis.com/v1beta/accounts?pageSize=200",
      authClient,
      allowStatuses: [403],
    });
    if (accountsResult.status === 403) {
      return {
        status: "permission_required",
        details: null,
        error:
          "Google Analytics access was not granted. Reconnect Google Cloud to enable Analytics automatically.",
      };
    }

    const account = (Array.isArray(accountsResult.data?.accounts)
      ? accountsResult.data.accounts
      : []
    ).find((candidate) => !candidate?.deleted && cleanString(candidate?.name));
    const analyticsAccountId = cleanString(account?.name).replace(
      /^accounts\//,
      ""
    );
    if (!analyticsAccountId) {
      return {
        status: "account_required",
        details: null,
        error:
          "This Google account does not have an Analytics account with accepted terms yet.",
      };
    }

    const linked = await googleRequest({
      url: `https://firebase.googleapis.com/v1beta1/projects/${encodeURIComponent(
        projectId
      )}:addGoogleAnalytics`,
      authClient,
      method: "POST",
      body: { analyticsAccountId },
      allowStatuses: [409],
      timeoutMs: 120000,
    });
    let details = null;
    if (linked.status !== 409) {
      const completed = await pollOperation({
        operation: linked.data,
        baseUrl: "https://firebase.googleapis.com/v1beta1",
        authClient,
        attempts: 180,
        waitMs: 2000,
      });
      details = completed.response || null;
    }
    if (!cleanString(details?.analyticsProperty?.id)) {
      for (let attempt = 0; attempt < 12; attempt += 1) {
        if (attempt > 0) await delay(2500);
        details = await getAnalyticsDetails({ projectId, authClient });
        if (cleanString(details?.analyticsProperty?.id)) break;
      }
    }
    if (!cleanString(details?.analyticsProperty?.id)) {
      return {
        status: "not_linked",
        details: null,
        error:
          "Google accepted the Analytics setup, but the Firebase link is still propagating.",
      };
    }
    return {
      status: "connected",
      details,
      analyticsAccountId,
      error: "",
    };
  }

  async function listAnalyticsPropertyAccessBindings({
    propertyName,
    authClient,
  }) {
    const accessBindings = [];
    let pageToken = "";
    for (let page = 0; page < 10; page += 1) {
      const result = await googleRequest({
        url: `https://analyticsadmin.googleapis.com/v1alpha/${propertyName}/accessBindings?pageSize=500${
          pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""
        }`,
        authClient,
      });
      accessBindings.push(
        ...(Array.isArray(result.data?.accessBindings)
          ? result.data.accessBindings
          : [])
      );
      pageToken = cleanString(result.data?.nextPageToken);
      if (!pageToken) break;
    }
    return accessBindings;
  }

  async function ensureAnalyticsPropertyViewerAccess({
    propertyId,
    serviceAccountEmail,
    authClient,
  }) {
    const propertyName = normalizeAnalyticsPropertyName(propertyId);
    const viewer = buildAnalyticsViewerAccessBinding(serviceAccountEmail);
    if (!propertyName) {
      throw provisioningError(
        "Firebase returned an invalid Google Analytics property ID.",
        "analytics_property_invalid"
      );
    }
    if (!viewer.user.endsWith(".gserviceaccount.com")) {
      throw provisioningError(
        "Labor could not identify the runtime service account for Google Analytics.",
        "analytics_runtime_identity_missing"
      );
    }

    const findRuntimeBinding = (bindings) =>
      bindings.find(
        (binding) =>
          cleanString(binding?.user).toLowerCase() === viewer.user.toLowerCase()
      );
    let existing = findRuntimeBinding(
      await listAnalyticsPropertyAccessBindings({ propertyName, authClient })
    );
    if (existing && analyticsAccessBindingCanRead(existing)) {
      return {
        status: "ready",
        action: "existing",
        propertyName,
        accessBindingName: cleanString(existing.name),
        roles: existing.roles,
      };
    }

    if (existing) {
      const accessBindingName = cleanString(existing.name);
      if (
        !new RegExp(
          `^${propertyName.replace("/", "\\/")}\\/accessBindings\\/[^/]+$`
        ).test(accessBindingName)
      ) {
        throw provisioningError(
          "Google Analytics returned an invalid access binding.",
          "analytics_access_binding_invalid"
        );
      }
      const roles = [
        ...new Set([
          ...(Array.isArray(existing.roles) ? existing.roles : []),
          GOOGLE_ANALYTICS_VIEWER_ROLE,
        ]),
      ];
      const updated = await googleRequest({
        url: `https://analyticsadmin.googleapis.com/v1alpha/${accessBindingName}`,
        authClient,
        method: "PATCH",
        body: {
          name: accessBindingName,
          user: viewer.user,
          roles,
        },
      });
      return {
        status: "ready",
        action: "updated",
        propertyName,
        accessBindingName: cleanString(updated.data?.name) || accessBindingName,
        roles,
      };
    }

    const created = await googleRequest({
      url: `https://analyticsadmin.googleapis.com/v1alpha/${propertyName}/accessBindings`,
      authClient,
      method: "POST",
      body: viewer,
      allowStatuses: [409],
    });
    if (created.status === 409) {
      existing = findRuntimeBinding(
        await listAnalyticsPropertyAccessBindings({ propertyName, authClient })
      );
      if (!existing || !analyticsAccessBindingCanRead(existing)) {
        throw provisioningError(
          "Google Analytics already has a conflicting runtime access binding.",
          "analytics_access_binding_conflict"
        );
      }
      return {
        status: "ready",
        action: "existing",
        propertyName,
        accessBindingName: cleanString(existing.name),
        roles: existing.roles,
      };
    }
    return {
      status: "ready",
      action: "created",
      propertyName,
      accessBindingName: cleanString(created.data?.name),
      roles: Array.isArray(created.data?.roles)
        ? created.data.roles
        : viewer.roles,
    };
  }

  function analyticsAccessErrorIsRetryable(error) {
    const message = errorMessage(error);
    if (
      /insufficient authentication scopes|access_token_scope_insufficient/i.test(
        message
      )
    ) {
      return false;
    }
    const status = Number(error?.googleStatus || 0);
    return (
      [403, 404, 409, 429, 500, 502, 503, 504].includes(status) ||
      /permission|not found|not ready|propagat|temporar/i.test(message)
    );
  }

  async function verifyAnalyticsPropertyViewerAccess({
    propertyId,
    serviceAccountEmail,
  }) {
    const propertyName = normalizeAnalyticsPropertyName(propertyId);
    const runtimeAuthClient = await impersonatedAuthClient(serviceAccountEmail, [
      GOOGLE_CLOUD_SCOPE,
      GOOGLE_ANALYTICS_READONLY_SCOPE,
    ]);
    await googleRequest({
      url: `https://analyticsdata.googleapis.com/v1beta/${propertyName}:runReport`,
      authClient: runtimeAuthClient,
      method: "POST",
      body: {
        dateRanges: [{ startDate: "today", endDate: "today" }],
        metrics: [{ name: "activeUsers" }],
        limit: 1,
      },
      timeoutMs: 60000,
    });
  }

  async function ensureVerifiedAnalyticsPropertyViewerAccess({
    propertyId,
    serviceAccountEmail,
    authClient,
  }) {
    let access = null;
    let lastError = null;

    for (let attempt = 0; attempt < ANALYTICS_ACCESS_ATTEMPTS; attempt += 1) {
      if (attempt > 0) await delay(ANALYTICS_ACCESS_POLL_MS);
      try {
        access = await ensureAnalyticsPropertyViewerAccess({
          propertyId,
          serviceAccountEmail,
          authClient,
        });
        await verifyAnalyticsPropertyViewerAccess({
          propertyId,
          serviceAccountEmail,
        });
        return {
          ...access,
          verified: true,
          verifiedAtMs: Date.now(),
        };
      } catch (error) {
        lastError = error;
        if (!analyticsAccessErrorIsRetryable(error)) break;
      }
    }

    const scopeMissing =
      /insufficient authentication scopes|access_token_scope_insufficient/i.test(
        errorMessage(lastError)
      );
    throw provisioningError(
      scopeMissing
        ? "Google did not grant Analytics user management. Connect again and allow the requested Analytics permission."
        : `Labor could not verify GA4 Viewer access for ${serviceAccountEmail}. ${errorMessage(
            lastError
          )}`,
      scopeMissing
        ? "analytics_manage_users_scope_required"
        : "analytics_runtime_access_not_ready",
      {
        googleStatus: Number(lastError?.googleStatus || 0),
        googleData: lastError?.googleData,
      }
    );
  }

  async function writeFirestoreDocuments({ projectId, authClient, documents }) {
    const writes = documents.map(({ path: documentPath, data }) => ({
      update: {
        name: `projects/${projectId}/databases/(default)/documents/${documentPath}`,
        fields: encodeFirestoreFields(data),
      },
    }));
    if (!writes.length) return;
    await googleRequest({
      url: `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
        projectId
      )}/databases/(default)/documents:commit`,
      authClient,
      method: "POST",
      body: { writes },
      timeoutMs: 90000,
    });
  }

  async function loadPortableConfigurations(userDocId) {
    const userRef = db.collection(rootCollection).doc(userDocId);
    const ids = ["llmModels", "stylePreset", "style", "api", "onboarding"];
    const snapshots = await Promise.all(
      ids.map((id) => userRef.collection(configCollection).doc(id).get())
    );
    return snapshots.flatMap((snapshot, index) =>
      snapshot.exists ? [{ id: ids[index], data: snapshot.data() || {} }] : []
    );
  }

  async function seedTenantConfiguration({
    identity,
    userDocId,
    projectId,
    serviceAccountEmail,
    defaultBucket,
    buildBucket,
    firebaseWebConfig,
    hostingSite,
    functionUrls,
    coreBuildId = "",
    status = "provisioning",
    authClient,
  }) {
    const nowMs = Date.now();
    const portable = await loadPortableConfigurations(userDocId);
    const basePath = `${rootCollection}/${safeDocumentId(userDocId)}`;
    const cloudConfig = {
      kind: "google_cloud_connection",
      provider: "google_cloud",
      status,
      provisioningStatus: status,
      provisioningStage:
        status === "ready" ? "ready" : "deploying_core_functions",
      selectedProjectId: projectId,
      defaultProjectId: projectId,
      serviceAccountEmail,
      defaultBucket,
      buildBucket,
      firebaseWebConfig,
      hostingSiteId: cleanString(hostingSite?.name).split("/").pop(),
      hostingUrl: cleanString(hostingSite?.defaultUrl),
      functionUrls,
      coreFunctionNames: CORE_FUNCTION_NAMES,
      coreBuildId,
      coreDeploymentVersion: CORE_DEPLOYMENT_VERSION,
      connectedEmail: identity.email,
      userEmail: identity.email,
      userId: identity.uid,
      accessMode: "keyless_service_account_impersonation",
      updatedAtMs: nowMs,
    };
    const documents = [
      {
        path: basePath,
        data: {
          userEmail: identity.email,
          userId: identity.uid,
          cloudProjectId: projectId,
          updatedAtMs: nowMs,
        },
      },
      ...portable.map((record) => ({
        path: `${basePath}/${configCollection}/${record.id}`,
        data: record.data,
      })),
      {
        path: `${basePath}/${configCollection}/googleCloud`,
        data: cloudConfig,
      },
      {
        path: `${basePath}/${configCollection}/deployment`,
        data: {
          kind: "deployment",
          provider: "google_cloud",
          title: "Google Cloud",
          status,
          selectedProjectId: projectId,
          defaultProjectId: projectId,
          services: [
            "Firebase Hosting",
            "Cloud Firestore",
            "Firebase Authentication",
            "Cloud Storage for Firebase",
            "Cloud Run functions",
            "Cloud Build",
          ],
          updatedAtMs: nowMs,
        },
      },
      {
        path: `${basePath}/${secretCollection}/googleCloud`,
        data: {
          provider: "google_cloud",
          status: "delegated",
          serviceAccountEmail,
          accessMode: "keyless_service_account_impersonation",
          updatedAtMs: nowMs,
        },
      },
    ];
    await writeFirestoreDocuments({ projectId, authClient, documents });
  }

  function buildCoreSourceZip({
    projectId,
    userEmail,
    serviceAccountEmail,
    firebaseWebConfig,
    analyticsPropertyId,
  }) {
    const zip = new AdmZip();
    const sourceFiles = [
      "index.js",
      "laborEvolution.js",
      "laborAdHoc.js",
      "googleCloudProvisioning.js",
      "package.json",
    ];
    sourceFiles.forEach((fileName) => {
      const filePath = path.join(__dirname, fileName);
      if (!fs.existsSync(filePath)) {
        throw provisioningError(
          `The deployed Labor source is missing functions/${fileName}.`,
          "core_source_incomplete"
        );
      }
      let content = fs.readFileSync(filePath);
      if (fileName === "index.js") {
        content = Buffer.from(
          specializeCoreSource({
            source: content.toString("utf8"),
            projectId,
            firebaseWebConfig,
          }),
          "utf8"
        );
      }
      if (fileName === "package.json") {
        const packageJson = JSON.parse(content.toString("utf8"));
        packageJson.main = "bootstrap.js";
        packageJson.dependencies = {
          ...(packageJson.dependencies || {}),
          "@google-cloud/storage":
            packageJson.dependencies?.["@google-cloud/storage"] || "^7.17.3",
        };
        content = Buffer.from(JSON.stringify(packageJson, null, 2), "utf8");
      }
      zip.addFile(`functions/${fileName}`, content);
    });
    zip.addFile(
      "functions/bootstrap.js",
      Buffer.from(
        [
          '"use strict";',
          'const { setGlobalOptions } = require("firebase-functions/v2");',
          `setGlobalOptions({ serviceAccount: ${JSON.stringify(
            serviceAccountEmail
          )} });`,
          'module.exports = require("./index");',
          "",
        ].join("\n"),
        "utf8"
      )
    );
    zip.addFile(
      "firebase.json",
      Buffer.from(buildCoreFirebaseJson(), "utf8")
    );
    zip.addFile(
      ".firebaserc",
      Buffer.from(
        JSON.stringify({ projects: { default: projectId } }, null, 2),
        "utf8"
      )
    );
    zip.addFile(
      "firestore.rules",
      Buffer.from(buildCoreFirestoreRules(rootCollection), "utf8")
    );
    zip.addFile(
      "storage.rules",
      Buffer.from(buildCoreStorageRules(rootCollection), "utf8")
    );
    const env = [
      `LABOR_CONTROL_PROJECT_ID=${serializeEnvValue(controlProjectId)}`,
      `LABOR_TARGET_PROJECT_ID=${serializeEnvValue(projectId)}`,
      `LABOR_RUNTIME_SERVICE_ACCOUNT=${serializeEnvValue(serviceAccountEmail)}`,
      `LABOR_OWNER_EMAIL=${serializeEnvValue(userEmail)}`,
      `LABOR_FIREBASE_WEB_CONFIG=${serializeEnvValue(
        JSON.stringify(firebaseWebConfig)
      )}`,
      ...(analyticsPropertyId
        ? [`GA4_PROPERTY_ID=${serializeEnvValue(analyticsPropertyId)}`]
        : []),
      "",
    ].join("\n");
    zip.addFile(`functions/.env.${projectId}`, Buffer.from(env, "utf8"));
    return zip.toBuffer();
  }

  async function readCloudBuildLogTail({ projectId, buildId, authClient }) {
    const escapedBuildId = cleanString(buildId).replace(/[\\"]/g, "\\$&");
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (attempt > 0) await delay(2000);
      const result = await googleRequest({
        url: "https://logging.googleapis.com/v2/entries:list",
        authClient,
        method: "POST",
        body: {
          resourceNames: [`projects/${projectId}`],
          filter:
            `resource.type=\"build\" AND ` +
            `resource.labels.build_id=\"${escapedBuildId}\"`,
          orderBy: "timestamp desc",
          pageSize: 100,
        },
      });
      const lines = (Array.isArray(result.data?.entries)
        ? result.data.entries
        : []
      )
        .map(cloudBuildLogLine)
        .filter(Boolean)
        .reverse();
      if (lines.length) return lines.slice(-30).join("\n");
    }
    return "";
  }

  async function submitCoreBuild({
    projectId,
    buildBucket,
    serviceAccountEmail,
    sourceBuffer,
    authClient,
  }) {
    const sourceObject = `labor/core/${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}.zip`;
    await googleRequest({
      url: buildStorageMediaUploadUrl(buildBucket, sourceObject),
      authClient,
      method: "POST",
      rawBody: sourceBuffer,
      headers: {
        "Content-Type": "application/zip",
        "Content-Length": String(sourceBuffer.length),
      },
      timeoutMs: 120000,
    });
    const build = {
      source: {
        storageSource: { bucket: buildBucket, object: sourceObject },
      },
      steps: buildCoreDeploymentSteps(projectId),
      timeout: "3600s",
      serviceAccount: `projects/${projectId}/serviceAccounts/${serviceAccountEmail}`,
      options: { logging: "CLOUD_LOGGING_ONLY" },
      tags: ["labor", "core-functions"],
    };
    const created = await googleRequest({
      url: `https://cloudbuild.googleapis.com/v1/projects/${encodeURIComponent(
        projectId
      )}/builds`,
      authClient,
      method: "POST",
      body: build,
      timeoutMs: 120000,
    });
    const buildId = extractCloudBuildId(created.data);
    if (!buildId) {
      throw provisioningError(
        "Cloud Build accepted Labor's deployment but did not return a build ID.",
        "core_build_id_missing"
      );
    }
    return { buildId, sourceObject };
  }

  async function resubmitStoredCoreBuild({
    identity,
    userDocId,
    projectId,
    config,
    authClient,
  }) {
    const serviceAccountEmail = cleanString(config.serviceAccountEmail);
    const buildBucket = cleanString(config.buildBucket);
    const firebaseWebConfig = normalizeFirebaseWebConfig(
      config.firebaseWebConfig,
      projectId,
      config.defaultBucket
    );
    if (!serviceAccountEmail || !buildBucket || !firebaseWebConfig.appId) {
      throw provisioningError(
        "Labor cannot retry this deployment from the saved cloud configuration. Connect Google Cloud again.",
        "core_build_retry_configuration_missing",
        { attentionProjectId: projectId }
      );
    }
    const sourceBuffer = buildCoreSourceZip({
      projectId,
      userEmail: identity.email,
      serviceAccountEmail,
      firebaseWebConfig,
      analyticsPropertyId: cleanString(
        config.resources?.analytics?.propertyId
      ),
    });
    const buildResult = await submitCoreBuild({
      projectId,
      buildBucket,
      serviceAccountEmail,
      sourceBuffer,
      authClient,
    });
    const nowMs = Date.now();
    const retryPatch = {
      status: "provisioning",
      provisioningStatus: "deploying",
      provisioningStage: "deploying_core_functions",
      coreBuildId: buildResult.buildId,
      coreBuildSourceObject: buildResult.sourceObject,
      coreDeploymentVersion: CORE_DEPLOYMENT_VERSION,
      coreFunctionNames: CORE_FUNCTION_NAMES,
      functionUrls: buildFunctionUrls(projectId, region),
      coreBuildStatus: "QUEUED",
      provisioningSubmittedAtMs: nowMs,
      keylessAccessStatus: "ready",
      lastValidationError: admin.firestore.FieldValue.delete(),
      attentionCode: admin.firestore.FieldValue.delete(),
      coreBuildLogUrl: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const { configRef, deploymentRef } = refs(userDocId);
    await Promise.all([
      configRef.set(retryPatch, { merge: true }),
      deploymentRef.set(retryPatch, { merge: true }),
    ]);
    return {
      connected: true,
      ready: false,
      status: "provisioning",
      provisioningStage: "deploying_core_functions",
      selectedProjectId: projectId,
      coreBuildId: buildResult.buildId,
      firebaseWebConfig,
      functionUrls: config.functionUrls || buildFunctionUrls(projectId, region),
      resources: config.resources || {},
    };
  }

  async function provisionProject({ identity, userDocId, projectId: requestedProjectId }) {
    const normalizedUserDocId = safeDocumentId(userDocId || identity?.email);
    const selectedProjectId = cleanString(requestedProjectId);
    const { configRef, secretRef, deploymentRef } = refs(normalizedUserDocId);
    let stage = "select_project";
    let accessToken = "";

    try {
      const [configSnapshot, secretSnapshot] = await Promise.all([
        configRef.get(),
        secretRef.get(),
      ]);
      const config = configSnapshot.exists ? configSnapshot.data() || {} : {};
      const secret = secretSnapshot.exists ? secretSnapshot.data() || {} : {};
      accessToken = cleanString(secret.accessToken);
      if (!selectedProjectId) {
        throw provisioningError("Choose a Google Cloud project.", "project_required");
      }
      const selectedProject = (Array.isArray(config.projects) ? config.projects : []).find(
        (project) => cleanString(project.projectId) === selectedProjectId
      );
      if (!selectedProject) {
        throw provisioningError(
          "Reconnect Google Cloud and choose one of the projects returned by Google.",
          "project_not_in_connection"
        );
      }
      if (!selectedProject.deploymentReady) {
        throw provisioningError(
          "This project does not grant all permissions required for autonomous setup.",
          "insufficient_deployment_permissions",
          {
            attentionProjectId: selectedProjectId,
            missingDeploymentPermissions:
              selectedProject.missingDeploymentPermissions || [],
          }
        );
      }
      const delegatedTokenUsable = Boolean(
        accessToken && Number(secret.estimatedExpiresAtMs || 0) > Date.now()
      );
      const canRetryCoreBuildKeylessly = Boolean(
        config.attentionCode === "core_functions_deployment_failed" &&
          cloudBuildFailureAttentionCode(config.lastValidationError) !==
            "core_functions_service_enable_required" &&
          cleanString(config.selectedProjectId || config.defaultProjectId) ===
            selectedProjectId &&
          cleanString(config.serviceAccountEmail) &&
          cleanString(config.buildBucket) &&
          config.firebaseWebConfig
      );
      if (!delegatedTokenUsable && canRetryCoreBuildKeylessly) {
        stage = "deploying_core_functions";
        const retryAuthClient =
          runtimeProjectId === selectedProjectId
            ? await sourceAuthClient()
            : await waitForImpersonation(config.serviceAccountEmail, {
                attempts: 12,
                waitMs: IAM_PROPAGATION_POLL_MS,
              });
        return resubmitStoredCoreBuild({
          identity,
          userDocId: normalizedUserDocId,
          projectId: selectedProjectId,
          config,
          authClient: retryAuthClient,
        });
      }
      if (!delegatedTokenUsable) {
        throw provisioningError(
          "Google Cloud access expired before setup began. Connect again.",
          "cloud_access_expired"
        );
      }

      stage = "enabling_apis";
      await updateStage({
        identity,
        userDocId: normalizedUserDocId,
        projectId: selectedProjectId,
        stage,
        extra: { provisioningStartedAtMs: Date.now() },
      });
      await enableRequiredApis({
        projectNumber: selectedProject.projectNumber || selectedProjectId,
        accessToken,
      });

      stage = "checking_billing";
      await updateStage({
        identity,
        userDocId: normalizedUserDocId,
        projectId: selectedProjectId,
        stage,
      });
      await assertBillingEnabled({ projectId: selectedProjectId, accessToken });

      stage = "initializing_firebase";
      await updateStage({
        identity,
        userDocId: normalizedUserDocId,
        projectId: selectedProjectId,
        stage,
      });
      await ensureFirebaseProject({ projectId: selectedProjectId, accessToken });

      stage = "configuring_iam";
      await updateStage({
        identity,
        userDocId: normalizedUserDocId,
        projectId: selectedProjectId,
        stage,
      });
      const { serviceAccountEmail, resource: serviceAccountResource } =
        await ensureServiceAccount({
          projectId: selectedProjectId,
          accessToken,
        });
      const defaultCloudBuildServiceAccountEmail =
        await getDefaultCloudBuildServiceAccount({
          projectId: selectedProjectId,
          accessToken,
        });
      await waitForServiceAccountAvailability({
        projectId: selectedProjectId,
        serviceAccountEmail: defaultCloudBuildServiceAccountEmail,
        accessToken,
      });
      await grantProjectRoles({
        projectId: selectedProjectId,
        serviceAccountEmail,
        defaultCloudBuildServiceAccountEmail,
        accessToken,
      });
      const platformServiceAccountEmail = await getPlatformServiceAccountEmail();
      await grantPlatformImpersonation({
        serviceAccountResource,
        platformServiceAccountEmail,
        accessToken,
      });
      let keylessAccessReady = true;
      let keylessAccessError = "";
      let authClient = null;
      try {
        authClient = await waitForImpersonation(serviceAccountEmail, {
          attempts: IAM_PROPAGATION_ATTEMPTS,
          waitMs: IAM_PROPAGATION_POLL_MS,
        });
        await waitForRuntimeDeploymentPermissions({
          projectId: selectedProjectId,
          authClient,
        });
      } catch (error) {
        keylessAccessReady = false;
        keylessAccessError = errorMessage(error);
        authClient = delegatedUserAuthClient(
          accessToken,
          secret.estimatedExpiresAtMs
        );
        logger.warn(
          "Google IAM is still propagating keyless customer-cloud access; continuing with the user's delegated setup token",
          {
            projectId: selectedProjectId,
            platformServiceAccountEmail,
            serviceAccountEmail,
            error: keylessAccessError,
          }
        );
      }

      stage = "initializing_data_services";
      await updateStage({
        identity,
        userDocId: normalizedUserDocId,
        projectId: selectedProjectId,
        stage,
        extra: {
          serviceAccountEmail,
          defaultCloudBuildServiceAccountEmail,
          platformServiceAccountEmail,
          accessMode: "keyless_service_account_impersonation",
          keylessAccessStatus: keylessAccessReady ? "ready" : "propagating",
          keylessAccessLastGrantAtMs: Date.now(),
          keylessAccessLastError: keylessAccessError ||
            admin.firestore.FieldValue.delete(),
        },
      });
      const delegatedSetupAuthClient = delegatedUserAuthClient(
        accessToken,
        secret.estimatedExpiresAtMs
      );
      const [firestoreResource] = await Promise.all([
        ensureFirestore({ projectId: selectedProjectId, authClient }),
        ensureAuthentication({
          projectId: selectedProjectId,
          authClient: delegatedSetupAuthClient,
        }),
      ]);
      const storageResource = await ensureDefaultStorageBucket({
        projectId: selectedProjectId,
        authClient,
      });
      const buildBucket = await ensureBuildBucket({
        projectId: selectedProjectId,
        authClient,
      });

      stage = "initializing_firebase_apps";
      await updateStage({
        identity,
        userDocId: normalizedUserDocId,
        projectId: selectedProjectId,
        stage,
      });
      const [hostingSite, webApp] = await Promise.all([
        ensureHostingSite({ projectId: selectedProjectId, authClient }),
        ensureFirebaseWebApp({ projectId: selectedProjectId, authClient }),
      ]);
      const analyticsSetup = await ensureFirebaseAnalytics({
        projectId: selectedProjectId,
        authClient: delegatedSetupAuthClient,
      }).catch((error) => ({
        status: "not_linked",
        details: null,
        error: errorMessage(error),
      }));
      const analyticsDetails = analyticsSetup.details;
      const authenticationResource = await configureAuthenticationProviders({
        projectId: selectedProjectId,
        appId: webApp.appId,
        userEmail: identity.email,
        authClient: delegatedSetupAuthClient,
      });
      const firebaseWebConfig = normalizeFirebaseWebConfig(
        webApp.config,
        selectedProjectId,
        storageResource.bucketName
      );
      const analyticsStream = (Array.isArray(analyticsDetails?.streamMappings)
        ? analyticsDetails.streamMappings
        : []
      ).find((mapping) =>
        cleanString(mapping?.app).endsWith(`/webApps/${webApp.appId}`)
      );
      if (cleanString(analyticsStream?.measurementId)) {
        firebaseWebConfig.measurementId = cleanString(
          analyticsStream.measurementId
        );
      }
      const analyticsPropertyId = cleanString(
        analyticsDetails?.analyticsProperty?.id
      );
      let analyticsRuntimeAccess = {
        status: "not_configured",
        error: cleanString(analyticsSetup.error),
      };
      if (analyticsPropertyId) {
        try {
          analyticsRuntimeAccess =
            await ensureVerifiedAnalyticsPropertyViewerAccess({
              propertyId: analyticsPropertyId,
              serviceAccountEmail,
              authClient: delegatedSetupAuthClient,
            });
        } catch (error) {
          const permissionRequired = Number(error?.googleStatus) === 403;
          analyticsRuntimeAccess = {
            status: permissionRequired
              ? "permission_required"
              : "needs_attention",
            error: permissionRequired
              ? "Reconnect Google Cloud and allow Analytics user management. The connected account must be an Administrator of this GA4 property."
              : errorMessage(error),
          };
          logger.warn(
            "Google Analytics is linked, but Labor could not grant its runtime Viewer access",
            {
              projectId: selectedProjectId,
              analyticsPropertyId,
              serviceAccountEmail,
              error: errorMessage(error),
            }
          );
        }
      }
      const functionUrls = buildFunctionUrls(selectedProjectId, region);

      stage = "seeding_workspace";
      await updateStage({
        identity,
        userDocId: normalizedUserDocId,
        projectId: selectedProjectId,
        stage,
      });
      await seedTenantConfiguration({
        identity,
        userDocId: normalizedUserDocId,
        projectId: selectedProjectId,
        serviceAccountEmail,
        defaultBucket: storageResource.bucketName,
        buildBucket,
        firebaseWebConfig,
        hostingSite,
        functionUrls,
        authClient,
      });

      stage = "deploying_core_functions";
      await updateStage({
        identity,
        userDocId: normalizedUserDocId,
        projectId: selectedProjectId,
        stage,
      });
      if (!keylessAccessReady) {
        authClient = await waitForImpersonation(serviceAccountEmail, {
          attempts: RUNTIME_PERMISSION_ATTEMPTS,
          waitMs: RUNTIME_PERMISSION_POLL_MS,
        });
        await waitForRuntimeDeploymentPermissions({
          projectId: selectedProjectId,
          authClient,
        });
        keylessAccessReady = true;
        keylessAccessError = "";
      }
      const sourceBuffer = buildCoreSourceZip({
        projectId: selectedProjectId,
        userEmail: identity.email,
        serviceAccountEmail,
        firebaseWebConfig,
        analyticsPropertyId,
      });
      const buildResult = await submitCoreBuild({
        projectId: selectedProjectId,
        buildBucket,
        serviceAccountEmail,
        sourceBuffer,
        authClient,
      });
      const resources = {
        authentication: authenticationResource,
        firestore: {
          name: cleanString(firestoreResource?.name) ||
            `projects/${selectedProjectId}/databases/(default)`,
          locationId:
            cleanString(firestoreResource?.locationId) || DEFAULT_FIRESTORE_LOCATION,
        },
        storage: { defaultBucket: storageResource.bucketName },
        hosting: {
          siteId: cleanString(hostingSite?.name).split("/").pop(),
          defaultUrl: cleanString(hostingSite?.defaultUrl),
        },
        firebaseWebApp: { appId: webApp.appId },
        analytics: analyticsPropertyId
          ? {
              status:
                analyticsRuntimeAccess.status === "ready"
                  ? "connected"
                  : "needs_attention",
              propertyId: analyticsPropertyId,
              measurementId: cleanString(firebaseWebConfig.measurementId),
              runtimeAccess: analyticsRuntimeAccess,
              ...(cleanString(analyticsRuntimeAccess.error)
                ? { error: cleanString(analyticsRuntimeAccess.error) }
                : {}),
            }
          : {
              status: cleanString(analyticsSetup.status) || "not_linked",
              error: cleanString(analyticsSetup.error),
            },
      };
      const nowMs = Date.now();
      const sharedPatch = {
        status: "provisioning",
        provisioningStatus: "deploying",
        provisioningStage: stage,
        selectedProjectId,
        defaultProjectId: selectedProjectId,
        projectNumber: selectedProject.projectNumber || "",
        serviceAccountEmail,
        defaultCloudBuildServiceAccountEmail,
        platformServiceAccountEmail,
        accessMode: "keyless_service_account_impersonation",
        keylessAccessStatus: keylessAccessReady ? "ready" : "propagating",
        keylessAccessLastGrantAtMs: Date.now(),
        keylessAccessLastError: keylessAccessError ||
          admin.firestore.FieldValue.delete(),
        defaultBucket: storageResource.bucketName,
        buildBucket,
        firebaseWebConfig,
        functionUrls,
        coreFunctionNames: CORE_FUNCTION_NAMES,
        coreBuildId: buildResult.buildId,
        coreBuildSourceObject: buildResult.sourceObject,
        coreDeploymentVersion: CORE_DEPLOYMENT_VERSION,
        resources,
        accessTokenStored: true,
        provisioningSubmittedAtMs: nowMs,
        lastValidationError: admin.firestore.FieldValue.delete(),
        attentionCode: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      await Promise.all([
        configRef.set(sharedPatch, { merge: true }),
        deploymentRef.set(
          {
            ...sharedPatch,
            services: [
              "Firebase Hosting",
              "Cloud Firestore",
              "Firebase Authentication",
              "Cloud Storage for Firebase",
              "Cloud Run functions",
              "Cloud Build",
            ],
          },
          { merge: true }
        ),
        secretRef.set(
          {
            status: "delegated",
            serviceAccountEmail,
            platformServiceAccountEmail,
            accessMode: "keyless_service_account_impersonation",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        ),
      ]);

      return {
        connected: true,
        ready: false,
        status: "provisioning",
        provisioningStage: stage,
        selectedProjectId,
        coreBuildId: buildResult.buildId,
        firebaseWebConfig,
        functionUrls,
        resources,
      };
    } catch (error) {
      logger.error("Google Cloud provisioning failed", {
        userDocId: normalizedUserDocId,
        projectId: selectedProjectId,
        stage,
        error: errorMessage(error),
      });
      return saveAttention({
        identity,
        userDocId: normalizedUserDocId,
        connection: {},
        error: Object.assign(error, { attentionProjectId: selectedProjectId }),
        stage,
        preserveAccessToken: Boolean(accessToken),
      });
    }
  }

  async function repairAnalyticsAccess({ identity, userDocId, connection }) {
    const normalizedUserDocId = safeDocumentId(userDocId || identity?.email);
    const accessToken = cleanString(connection?.accessToken);
    if (!accessToken) {
      throw provisioningError(
        "Google did not return an Analytics authorization token. Connect again.",
        "analytics_access_token_missing"
      );
    }

    const { configRef, deploymentRef } = refs(normalizedUserDocId);
    const [configSnapshot, identityResult] = await Promise.all([
      configRef.get(),
      googleRequest({
        url: "https://openidconnect.googleapis.com/v1/userinfo",
        accessToken,
      }),
    ]);
    const config = configSnapshot.exists ? configSnapshot.data() || {} : {};
    const googleEmail = cleanString(identityResult.data?.email).toLowerCase();
    if (
      !googleEmail ||
      googleEmail !== cleanString(identity?.email).toLowerCase()
    ) {
      throw provisioningError(
        "Connect the same Google account you use to sign in to Labor.",
        "google_account_mismatch"
      );
    }

    const projectId = cleanString(
      config.selectedProjectId || config.defaultProjectId
    );
    const serviceAccountEmail = cleanString(config.serviceAccountEmail);
    if (!projectId || !serviceAccountEmail) {
      throw provisioningError(
        "Connect Google Cloud before restoring Analytics.",
        "customer_cloud_not_ready"
      );
    }

    const delegatedAuthClient = delegatedUserAuthClient(
      accessToken,
      Date.now() + 55 * 60 * 1000
    );
    const analyticsDetails = await getAnalyticsDetails({
      projectId,
      authClient: delegatedAuthClient,
    });
    const propertyId = cleanString(
      analyticsDetails?.analyticsProperty?.id ||
        config.resources?.analytics?.propertyId
    );
    if (!normalizeAnalyticsPropertyName(propertyId)) {
      throw provisioningError(
        "This Firebase project is not linked to a GA4 property yet.",
        "analytics_property_not_linked"
      );
    }

    const runtimeAccess = await ensureVerifiedAnalyticsPropertyViewerAccess({
      propertyId,
      serviceAccountEmail,
      authClient: delegatedAuthClient,
    });
    const resources = {
      ...(config.resources || {}),
      analytics: {
        ...(config.resources?.analytics || {}),
        status: "connected",
        propertyId: cleanString(propertyId).replace(/^properties\//, ""),
        runtimeAccess,
        error: "",
      },
    };
    const repairedAtMs = Date.now();
    const patch = {
      resources,
      analyticsRuntimeAccessStatus: "ready",
      analyticsRuntimeAccessRepairedAtMs: repairedAtMs,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await Promise.all([
      configRef.set(patch, { merge: true }),
      deploymentRef.set(patch, { merge: true }),
    ]);

    logger.info("Restored GA4 access for the customer runtime", {
      projectId,
      propertyId: cleanString(propertyId).replace(/^properties\//, ""),
      serviceAccountEmail,
    });
    return {
      connected: true,
      ready: true,
      status: "ready",
      projectId,
      propertyId: cleanString(propertyId).replace(/^properties\//, ""),
      serviceAccountEmail,
      runtimeAccess,
      repairedAtMs,
    };
  }

  async function loadDeploymentTarget(userDocId, { requireReady = true } = {}) {
    const normalizedUserDocId = safeDocumentId(userDocId);
    const { configRef } = refs(normalizedUserDocId);
    const snapshot = await configRef.get();
    const config = snapshot.exists ? snapshot.data() || {} : {};
    const projectId = cleanString(config.selectedProjectId || config.defaultProjectId);
    const serviceAccountEmail = cleanString(config.serviceAccountEmail);
    const ready = config.status === "ready" && projectId && serviceAccountEmail;
    if (!ready) {
      if (requireReady) {
        throw provisioningError(
          "Connect and finish provisioning Google Cloud before building.",
          "customer_cloud_not_ready"
        );
      }
      return null;
    }
    const authClient =
      runtimeProjectId === projectId
        ? await sourceAuthClient()
        : await impersonatedAuthClient(serviceAccountEmail);
    return {
      projectId,
      projectNumber: cleanString(config.projectNumber),
      serviceAccountEmail,
      defaultBucket: cleanString(config.defaultBucket),
      buildBucket: cleanString(config.buildBucket),
      firebaseWebConfig: normalizeFirebaseWebConfig(
        config.firebaseWebConfig,
        projectId,
        config.defaultBucket
      ),
      functionUrls: config.functionUrls || buildFunctionUrls(projectId, region),
      authClient,
    };
  }

  async function refreshProvisioningStatus({ identity, userDocId }) {
    const normalizedUserDocId = safeDocumentId(userDocId || identity?.email);
    const { configRef, secretRef, deploymentRef } = refs(normalizedUserDocId);
    const [snapshot, secretSnapshot] = await Promise.all([
      configRef.get(),
      secretRef.get(),
    ]);
    const config = snapshot.exists ? snapshot.data() || {} : {};
    const secret = secretSnapshot.exists ? secretSnapshot.data() || {} : {};
    const storedAccessToken = cleanString(secret.accessToken);
    const storedTokenExpiresAtMs = Number(secret.estimatedExpiresAtMs || 0);
    const storedTokenUsable = Boolean(
      storedAccessToken && storedTokenExpiresAtMs > Date.now()
    );
    const deploymentRefreshRequired = requiresCoreDeploymentRefresh(config);
    if (config.status === "ready" && !deploymentRefreshRequired) {
      return {
        connected: true,
        ready: true,
        status: "ready",
        selectedProjectId: cleanString(config.selectedProjectId),
        firebaseWebConfig: config.firebaseWebConfig || {},
        functionUrls: config.functionUrls || {},
        resources: config.resources || {},
      };
    }
    const projectId = cleanString(config.selectedProjectId || config.defaultProjectId);
    const serviceAccountEmail = cleanString(config.serviceAccountEmail);
    const coreBuildId = cleanString(config.coreBuildId);
    if (projectId && deploymentRefreshRequired) {
      logger.info("Replacing a customer Cloud Build created by an older Labor recipe", {
        projectId,
        previousBuildId: coreBuildId,
        previousDeploymentVersion: cleanString(config.coreDeploymentVersion),
        coreDeploymentVersion: CORE_DEPLOYMENT_VERSION,
      });
      try {
        const refreshAuthClient =
          runtimeProjectId === projectId
            ? await sourceAuthClient()
            : await waitForImpersonation(serviceAccountEmail, {
                attempts: 12,
                waitMs: IAM_PROPAGATION_POLL_MS,
              });
        return await resubmitStoredCoreBuild({
          identity,
          userDocId: normalizedUserDocId,
          projectId,
          config,
          authClient: refreshAuthClient,
        });
      } catch (refreshError) {
        if (storedTokenUsable) {
          return provisionProject({
            identity,
            userDocId: normalizedUserDocId,
            projectId,
          });
        }
        return saveAttention({
          identity,
          userDocId: normalizedUserDocId,
          error: provisioningError(
            `Labor could not update the customer runtime automatically. ${errorMessage(
              refreshError
            )}`,
            "core_deployment_refresh_required",
            { attentionProjectId: projectId }
          ),
          stage: "deploying_core_functions",
        });
      }
    }
    if (!projectId || !serviceAccountEmail || !coreBuildId) {
      return {
        connected: config.status !== "needs_attention",
        ready: false,
        status: cleanString(config.status) || "required",
        provisioningStage: cleanString(config.provisioningStage),
        selectedProjectId: projectId,
        error: cleanString(config.lastValidationError),
      };
    }

    try {
      let keylessAccessReady = runtimeProjectId === projectId;
      let keylessAccessError = "";
      let authClient = null;
      if (keylessAccessReady) {
        authClient = await sourceAuthClient();
      } else {
        try {
          authClient = await waitForImpersonation(serviceAccountEmail, {
            attempts: 1,
          });
          keylessAccessReady = true;
        } catch (error) {
          keylessAccessError = errorMessage(error);
          if (!storedTokenUsable) {
            const waitingSinceMs = Number(
              config.provisioningSubmittedAtMs ||
                config.provisioningStartedAtMs ||
                Date.now()
            );
            if (Date.now() - waitingSinceMs < 15 * 60 * 1000) {
              await updateStage({
                identity,
                userDocId: normalizedUserDocId,
                projectId,
                stage: "finalizing_keyless_access",
                status: "provisioning",
                extra: {
                  keylessAccessStatus: "propagating",
                  keylessAccessLastError: keylessAccessError,
                },
              });
              return {
                connected: true,
                ready: false,
                status: "provisioning",
                provisioningStage: "finalizing_keyless_access",
                selectedProjectId: projectId,
                coreBuildId,
                keylessAccessStatus: "propagating",
              };
            }
            throw error;
          }

          const lastGrantAtMs = Number(
            config.keylessAccessLastGrantAtMs || 0
          );
          if (Date.now() - lastGrantAtMs >= 60 * 1000) {
            const platformServiceAccountEmail =
              cleanString(config.platformServiceAccountEmail) ||
              (await getPlatformServiceAccountEmail());
            try {
              await grantPlatformImpersonation({
                serviceAccountResource: `projects/${projectId}/serviceAccounts/${serviceAccountEmail}`,
                platformServiceAccountEmail,
                accessToken: storedAccessToken,
              });
              await updateStage({
                identity,
                userDocId: normalizedUserDocId,
                projectId,
                stage: cleanString(config.provisioningStage) ||
                  "deploying_core_functions",
                status: "provisioning",
                extra: {
                  keylessAccessStatus: "propagating",
                  keylessAccessLastGrantAtMs: Date.now(),
                  keylessAccessLastError: keylessAccessError,
                },
              });
            } catch (grantError) {
              logger.warn("Could not refresh the keyless IAM grant yet", {
                projectId,
                serviceAccountEmail,
                platformServiceAccountEmail,
                error: errorMessage(grantError),
              });
            }
          }
          authClient = delegatedUserAuthClient(
            storedAccessToken,
            storedTokenExpiresAtMs
          );
        }
      }
      const buildResult = await googleRequest({
        url: `https://cloudbuild.googleapis.com/v1/projects/${encodeURIComponent(
          projectId
        )}/builds/${encodeURIComponent(coreBuildId)}`,
        authClient,
      });
      const build = buildResult.data || {};
      const buildStatus = cleanString(build?.status) || "UNKNOWN";
      const terminalFailures = new Set([
        "FAILURE",
        "INTERNAL_ERROR",
        "TIMEOUT",
        "CANCELLED",
        "EXPIRED",
      ]);
      if (terminalFailures.has(buildStatus)) {
        let logTail = "";
        try {
          logTail = await readCloudBuildLogTail({
            projectId,
            buildId: coreBuildId,
            authClient,
          });
        } catch (logError) {
          logger.warn("Could not read the failed customer Cloud Build log", {
            projectId,
            coreBuildId,
            error: errorMessage(logError),
          });
        }
        throw provisioningError(
          buildCloudBuildFailureMessage(build, logTail),
          cloudBuildFailureAttentionCode(logTail),
          {
            buildStatus,
            buildLogUrl: cleanString(build?.logUrl),
            attentionProjectId: projectId,
          }
        );
      }
      if (buildStatus !== "SUCCESS") {
        await updateStage({
          identity,
          userDocId: normalizedUserDocId,
          projectId,
          stage: "deploying_core_functions",
          status: "provisioning",
          extra: {
            coreBuildStatus: buildStatus,
            coreBuildStatusDetail: cleanString(build?.statusDetail),
            keylessAccessStatus: keylessAccessReady ? "ready" : "propagating",
            keylessAccessLastError: keylessAccessError ||
              admin.firestore.FieldValue.delete(),
          },
        });
        return {
          connected: true,
          ready: false,
          status: "provisioning",
          provisioningStage: "deploying_core_functions",
          selectedProjectId: projectId,
          coreBuildId,
          coreBuildStatus: buildStatus,
          keylessAccessStatus: keylessAccessReady ? "ready" : "propagating",
          firebaseWebConfig: config.firebaseWebConfig || {},
          functionUrls: config.functionUrls || {},
          resources: config.resources || {},
        };
      }

      if (!keylessAccessReady) {
        await updateStage({
          identity,
          userDocId: normalizedUserDocId,
          projectId,
          stage: "finalizing_keyless_access",
          status: "provisioning",
          extra: {
            coreBuildStatus: "SUCCESS",
            keylessAccessStatus: "propagating",
            keylessAccessLastError: keylessAccessError,
          },
        });
        return {
          connected: true,
          ready: false,
          status: "provisioning",
          provisioningStage: "finalizing_keyless_access",
          selectedProjectId: projectId,
          coreBuildId,
          coreBuildStatus: "SUCCESS",
          keylessAccessStatus: "propagating",
          firebaseWebConfig: config.firebaseWebConfig || {},
          functionUrls: config.functionUrls || {},
          resources: config.resources || {},
        };
      }

      const readyPatch = {
        status: "ready",
        provisioningStatus: "ready",
        provisioningStage: "ready",
        validationStatus: "valid",
        coreBuildStatus: "SUCCESS",
        keylessAccessStatus: "ready",
        keylessAccessLastError: admin.firestore.FieldValue.delete(),
        accessTokenStored: false,
        readyAt: admin.firestore.FieldValue.serverTimestamp(),
        readyAtMs: Date.now(),
        estimatedExpiresAtMs: admin.firestore.FieldValue.delete(),
        attentionCode: admin.firestore.FieldValue.delete(),
        lastValidationError: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      await Promise.all([
        configRef.set(readyPatch, { merge: true }),
        deploymentRef.set(readyPatch, { merge: true }),
        secretRef.set(
          {
            status: "delegated",
            accessToken: admin.firestore.FieldValue.delete(),
            estimatedExpiresAtMs: admin.firestore.FieldValue.delete(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        ),
      ]);
      await seedTenantConfiguration({
        identity,
        userDocId: normalizedUserDocId,
        projectId,
        serviceAccountEmail,
        defaultBucket: cleanString(config.defaultBucket),
        buildBucket: cleanString(config.buildBucket),
        firebaseWebConfig: config.firebaseWebConfig || {},
        hostingSite: {
          name: `projects/${projectId}/sites/${cleanString(
            config.resources?.hosting?.siteId
          )}`,
          defaultUrl: cleanString(config.resources?.hosting?.defaultUrl),
        },
        functionUrls: config.functionUrls || buildFunctionUrls(projectId, region),
        coreBuildId,
        status: "ready",
        authClient,
      });
      return {
        connected: true,
        ready: true,
        status: "ready",
        provisioningStage: "ready",
        selectedProjectId: projectId,
        coreBuildId,
        coreBuildStatus: "SUCCESS",
        firebaseWebConfig: config.firebaseWebConfig || {},
        functionUrls: config.functionUrls || {},
        resources: config.resources || {},
      };
    } catch (error) {
      return saveAttention({
        identity,
        userDocId: normalizedUserDocId,
        error,
        stage: "deploying_core_functions",
        preserveAccessToken: storedTokenUsable,
      });
    }
  }

  return {
    coreFunctionNames: CORE_FUNCTION_NAMES,
    requiredConnectionPermissions: REQUIRED_CONNECTION_PERMISSIONS,
    repairAnalyticsAccess,
    saveConnection,
    provisionProject,
    refreshProvisioningStatus,
    loadDeploymentTarget,
  };
}

module.exports = {
  CORE_DEPLOYMENT_VERSION,
  CORE_FUNCTION_DEPLOY_BATCH_SIZE,
  CORE_FUNCTION_NAMES,
  CORE_SERVICE_ACCOUNT_ROLES,
  IAM_PROPAGATION_ATTEMPTS,
  IAM_PROPAGATION_MAX_WAIT_MS,
  IAM_PROPAGATION_POLL_MS,
  REQUIRED_APIS,
  REQUIRED_CONNECTION_PERMISSIONS,
  SERVICE_ACCOUNT_MINIMUM_AGE_MS,
  SERVICE_ACCOUNT_READY_ATTEMPTS,
  SERVICE_ACCOUNT_READY_MAX_WAIT_MS,
  SERVICE_ACCOUNT_READY_POLL_MS,
  buildCloudBuildFailureMessage,
  buildAnalyticsViewerAccessBinding,
  buildCoreDeploymentSteps,
  buildCoreFirestoreRules,
  buildCoreStorageRules,
  buildFirebaseAuthProvisionRequest,
  buildFunctionUrls,
  buildStorageMediaDownloadUrl,
  buildStorageMediaUploadUrl,
  cloudBuildFailureAttentionCode,
  createGoogleCloudProvisioner,
  extractCloudBuildId,
  analyticsAccessBindingCanRead,
  normalizeAnalyticsPropertyName,
  requiresCoreDeploymentRefresh,
  specializeCoreSource,
};
