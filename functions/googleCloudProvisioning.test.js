"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
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
  analyticsAccessBindingCanRead,
  buildAnalyticsViewerAccessBinding,
  buildCloudBuildFailureMessage,
  buildCoreDeploymentSteps,
  buildCoreFirestoreRules,
  buildCoreStorageRules,
  buildFirebaseAuthProvisionRequest,
  buildFunctionUrls,
  buildStorageMediaDownloadUrl,
  buildStorageMediaUploadUrl,
  cloudBuildFailureAttentionCode,
  extractCloudBuildId,
  normalizeAnalyticsPropertyName,
  requiresCoreDeploymentRefresh,
  specializeCoreSource,
} = require("./googleCloudProvisioning");

test("customer-cloud setup tolerates Google's documented IAM propagation window", () => {
  assert.ok(IAM_PROPAGATION_MAX_WAIT_MS >= 7 * 60 * 1000);
  assert.ok(
    (IAM_PROPAGATION_ATTEMPTS - 1) * IAM_PROPAGATION_POLL_MS >=
      IAM_PROPAGATION_MAX_WAIT_MS
  );
});

test("customer-cloud deployment retains every required Labor function", () => {
  assert.deepEqual(CORE_FUNCTION_NAMES, [
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
  ]);
});

test("core functions deploy in quota-friendly batches", () => {
  const steps = buildCoreDeploymentSteps("labortest2");
  const dependencyStep = steps.find(
    (step) => step.id === "install_function_dependencies"
  );
  const functionSteps = steps.filter((step) =>
    String(step.id).startsWith("deploy_functions_")
  );
  const deployedFunctions = functionSteps.flatMap((step) => {
    const targets = step.args[step.args.indexOf("--only") + 1];
    return targets.split(",").map((target) => target.replace(/^functions:/, ""));
  });

  assert.ok(dependencyStep);
  assert.equal(
    dependencyStep.args[dependencyStep.args.indexOf("--prefix") + 1],
    "/workspace/functions"
  );
  assert.deepEqual(functionSteps[0].waitFor, [
    "install_firebase_cli",
    "install_function_dependencies",
  ]);
  assert.ok(functionSteps.length > 1);
  assert.ok(
    functionSteps.every((step) => step.args.includes("--force")),
    "function deploys must authorize Firebase's Artifact Registry cleanup policy"
  );
  assert.ok(
    functionSteps.every(
      (step) =>
        step.args[step.args.indexOf("--only") + 1].split(",").length <=
        CORE_FUNCTION_DEPLOY_BATCH_SIZE
    )
  );
  assert.deepEqual(deployedFunctions, CORE_FUNCTION_NAMES);
  assert.equal(steps.at(-1).id, "deploy_firebase_configuration");
  assert.ok(steps.at(-1).args.includes("--force"));
  assert.equal(
    steps.at(-1).args[steps.at(-1).args.indexOf("--only") + 1],
    "firestore:rules,storage"
  );
  assert.ok(
    !steps.at(-1).args.includes("auth,firestore:rules,storage"),
    "Auth is configured with the delegated setup credential before Cloud Build"
  );
});

test("customer Firebase rules accept Labor's short-lived owner session", () => {
  const firestoreRules = buildCoreFirestoreRules("testkitchen");
  const storageRules = buildCoreStorageRules("testkitchen");

  assert.match(firestoreRules, /request\.auth\.token\.labor_email/);
  assert.match(storageRules, /request\.auth\.token\.labor_email/);
  assert.match(firestoreRules, /isLaborOwner\(userEmail\)/);
  assert.match(storageRules, /isLaborOwner\(userEmail\)/);
});

test("generated app rules preserve Labor workspace access", () => {
  const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  const generatedRulesStart = source.indexOf(
    "function buildGeneratedFirestoreRules("
  );
  const generatedRulesEnd = source.indexOf(
    "function buildGeneratedCss(",
    generatedRulesStart
  );
  const generatedRules = source.slice(generatedRulesStart, generatedRulesEnd);

  assert.match(generatedRules, /function isLaborOwner\(userEmail\)/);
  assert.match(generatedRules, /request\.auth\.token\.labor_email/);
  assert.match(generatedRules, /allow read, write: if isLaborOwner\(userEmail\)/);
});

test("customer sessions reuse an existing Firebase user with the same email", () => {
  const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  const identitySyncStart = source.indexOf(
    "async function updateCustomerFirebaseIdentity("
  );
  const identitySyncEnd = source.indexOf(
    "async function synchronizeCustomerFirebaseIdentity(",
    identitySyncStart
  );
  const identitySync = source.slice(identitySyncStart, identitySyncEnd);
  const sessionStart = source.indexOf(
    "async function createCustomerFirebaseSession("
  );
  const sessionEnd = source.indexOf(
    "function resolveDesignSystem(",
    sessionStart
  );
  const session = source.slice(sessionStart, sessionEnd);

  assert.match(identitySync, /projectAccountsUrl}:lookup/);
  assert.match(identitySync, /EMAIL_EXISTS/);
  assert.match(identitySync, /matchedUser\?\.localId/);
  assert.match(session, /const customerUid =/);
  assert.match(session, /uid: customerUid/);
});

test("a live autonomous deployment is not counted as a total pipeline failure", () => {
  const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  const progressStart = source.indexOf(
    "async function refreshAutonomousGenerationProgress("
  );
  const progressEnd = source.indexOf(
    "async function acquireAutonomousProductLease(",
    progressStart
  );
  const progress = source.slice(progressStart, progressEnd);
  const releaseStart = source.indexOf("exports.deployTheRelease =");
  const releaseEnd = source.indexOf(
    "async function repairAndRedeployFailedApplication(",
    releaseStart
  );
  const release = source.slice(releaseStart, releaseEnd);
  const productStart = source.indexOf(
    "async function runAutonomousAgentProduct("
  );
  const productEnd = source.indexOf(
    "function autonomousAgentTaskId(",
    productStart
  );
  const product = source.slice(productStart, productEnd);

  assert.match(release, /hasLiveDeployment/);
  assert.match(release, /deployed_with_warning/);
  assert.match(product, /hasLiveDeployment/);
  assert.match(product, /deployed_with_warning/);
  assert.match(progress, /productsLiveWithWarnings/);
  assert.match(
    progress,
    /productsReleased \+ productsLiveWithWarnings === 0/
  );
});

test("only customer HTTP functions receive callable URLs", () => {
  const urls = buildFunctionUrls("customer-project", "us-central1");

  assert.equal(
    urls.startAutonomousAgent,
    "https://us-central1-customer-project.cloudfunctions.net/startAutonomousAgent"
  );
  assert.equal(urls.dailyReleasedAppManagerAgent, undefined);
  assert.equal(urls.runAutonomousAgentProduct, undefined);
  assert.equal(urls.deployTheRelease, undefined);
});

test("runtime identity can consume enabled services", () => {
  assert.ok(
    CORE_SERVICE_ACCOUNT_ROLES.includes(
      "roles/serviceusage.serviceUsageConsumer"
    )
  );
});

test("customer-cloud setup provisions Firebase Analytics dependencies", () => {
  assert.ok(REQUIRED_APIS.includes("analyticsadmin.googleapis.com"));
  assert.ok(REQUIRED_APIS.includes("analyticsdata.googleapis.com"));
  assert.ok(
    CORE_SERVICE_ACCOUNT_ROLES.includes("roles/firebase.analyticsAdmin")
  );
});

test("customer-cloud setup grants the runtime service account GA4 Viewer access", () => {
  assert.equal(normalizeAnalyticsPropertyName("123456789"), "properties/123456789");
  assert.equal(
    normalizeAnalyticsPropertyName("properties/123456789"),
    "properties/123456789"
  );
  assert.equal(normalizeAnalyticsPropertyName("not-a-property"), "");
  assert.deepEqual(
    buildAnalyticsViewerAccessBinding(
      "labor-runtime@customer-project.iam.gserviceaccount.com"
    ),
    {
      user: "labor-runtime@customer-project.iam.gserviceaccount.com",
      roles: ["predefinedRoles/viewer"],
    }
  );
  assert.equal(
    analyticsAccessBindingCanRead({ roles: ["predefinedRoles/viewer"] }),
    true
  );
  assert.equal(
    analyticsAccessBindingCanRead({ roles: ["predefinedRoles/admin"] }),
    true
  );
  assert.equal(
    analyticsAccessBindingCanRead({ roles: ["predefinedRoles/no-cost-data"] }),
    false
  );

  const cloudConnectionSource = fs.readFileSync(
    path.join(__dirname, "..", "src", "lib", "googleCloud.js"),
    "utf8"
  );
  assert.match(
    cloudConnectionSource,
    /https:\/\/www\.googleapis\.com\/auth\/analytics\.manage\.users/
  );
  assert.match(
    cloudConnectionSource,
    /provider\.addScope\(GOOGLE_ANALYTICS_MANAGE_USERS_SCOPE\)/
  );

  const provisioningSource = fs.readFileSync(
    path.join(__dirname, "googleCloudProvisioning.js"),
    "utf8"
  );
  assert.match(
    provisioningSource,
    /analyticsadmin\.googleapis\.com\/v1alpha\/\$\{propertyName\}\/accessBindings/
  );
  assert.match(provisioningSource, /ensureAnalyticsPropertyViewerAccess\(\{/);
  assert.match(provisioningSource, /runtimeAccess: analyticsRuntimeAccess/);
});

test("Google Search submission stays in the connected customer project", () => {
  const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  const searchStart = source.indexOf(
    "async function getGoogleSearchAccessToken("
  );
  const searchEnd = source.indexOf(
    "async function persistReleaseSearchIndexingState(",
    searchStart
  );
  const search = source.slice(searchStart, searchEnd);

  assert.ok(REQUIRED_APIS.includes("siteverification.googleapis.com"));
  assert.ok(REQUIRED_APIS.includes("searchconsole.googleapis.com"));
  assert.match(
    search,
    /FIREBASE_PROJECT_ID === CONTROL_FIREBASE_PROJECT_ID/
  );
  assert.match(search, /LABOR_RUNTIME_SERVICE_ACCOUNT/);
  assert.match(search, /"X-Goog-User-Project": FIREBASE_PROJECT_ID/);
  assert.doesNotMatch(search, /callLaborSearchBroker/);
  assert.doesNotMatch(search, /CONTROL_CONFIGURATION_AGENT_URL/);
});

test("release preparation keeps optional launch work from blocking deployment", () => {
  const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  const releaseStart = source.indexOf(
    "async function deployGeneratedApplicationRelease("
  );
  const releaseEnd = source.indexOf(
    "function getObjectNameFromGcsUri(",
    releaseStart
  );
  const release = source.slice(releaseStart, releaseEnd);
  const marketingContextStart = source.indexOf(
    "async function loadReleaseMarketingProductContext("
  );
  const marketingContextEnd = source.indexOf(
    "function buildReleaseMarketingSystemInstruction(",
    marketingContextStart
  );
  const marketingContext = source.slice(
    marketingContextStart,
    marketingContextEnd
  );

  assert.match(release, /buildFallbackReleaseLaunchContent/);
  assert.match(release, /releaseWarnings/);
  assert.match(
    release,
    /prepareGoogleSearchVerificationFiles\(\{\s*files:/
  );
  assert.match(
    release,
    /completeGoogleSearchSubmission\(searchIndexing\)/
  );
  assert.match(marketingContext, /downloadSourceStorageObject/);
  assert.doesNotMatch(marketingContext, /\.file\(location\.object\)\.download/);
});

test("delegated provisioning enables Firebase's Cloud APIs umbrella service", () => {
  assert.ok(REQUIRED_APIS.includes("cloudapis.googleapis.com"));
});

test("project eligibility includes delegated Firebase Auth setup", () => {
  assert.ok(REQUIRED_CONNECTION_PERMISSIONS.includes("firebaseauth.configs.create"));
  assert.ok(REQUIRED_CONNECTION_PERMISSIONS.includes("firebaseauth.configs.update"));
});

test("delegated Firebase provisioning preserves every generated-app sign-in method", () => {
  const request = buildFirebaseAuthProvisionRequest({
    projectId: "labortest2",
    appId: "1:123:web:abc",
    userEmail: "owner@example.com",
  });

  assert.equal(request.parent, "projects/labortest2");
  assert.equal(request.appNamespace, "1:123:web:abc");
  assert.equal(request.firebaseAuthInput.anonymousAuthProviderMode, "PROVIDER_ENABLED");
  assert.equal(request.firebaseAuthInput.emailAuthProviderMode, "PROVIDER_ENABLED");
  assert.equal(request.firebaseAuthInput.googleSigninProviderMode, "PROVIDER_ENABLED");
  assert.equal(
    request.firebaseAuthInput.googleSigninProviderConfig.customerSupportEmail,
    "owner@example.com"
  );
});

test("stale Cloud Build records are replaced after the deployment recipe changes", () => {
  assert.equal(
    requiresCoreDeploymentRefresh({ coreBuildId: "old-build" }),
    true
  );
  assert.equal(
    requiresCoreDeploymentRefresh({
      coreBuildId: "current-build",
      coreDeploymentVersion: CORE_DEPLOYMENT_VERSION,
    }),
    false
  );
  assert.equal(requiresCoreDeploymentRefresh({}), false);
});

test("Cloud Build failures name the failed step and retain useful logs", () => {
  const message = buildCloudBuildFailureMessage(
    {
      status: "FAILURE",
      failureInfo: { detail: "Build step failed" },
      steps: [
        {
          id: "deploy_functions_2",
          status: "FAILURE",
          exitCode: 1,
        },
      ],
      logUrl: "https://console.cloud.google.com/cloud-build/builds/example",
    },
    "Error: Permission denied while deploying functions"
  );

  assert.match(message, /deploy_functions_2 \(exit 1\)/);
  assert.match(message, /Permission denied while deploying functions/);
  assert.match(message, /console\.cloud\.google\.com/);
});

test("API-enable failures require delegated reprovisioning", () => {
  assert.equal(
    cloudBuildFailureAttentionCode(
      "Permission denied to enable service [firebase.googleapis.com]: serviceusage.services.enable denied"
    ),
    "core_functions_service_enable_required"
  );
  assert.equal(
    cloudBuildFailureAttentionCode("Function source failed to compile"),
    "core_functions_deployment_failed"
  );
});

test("new service accounts receive an automatic propagation window", () => {
  assert.ok(SERVICE_ACCOUNT_MINIMUM_AGE_MS >= 60 * 1000);
  assert.ok(SERVICE_ACCOUNT_READY_MAX_WAIT_MS >= 5 * 60 * 1000);
  assert.ok(
    (SERVICE_ACCOUNT_READY_ATTEMPTS - 1) *
      SERVICE_ACCOUNT_READY_POLL_MS >=
      SERVICE_ACCOUNT_READY_MAX_WAIT_MS
  );
});

test("core source specialization accepts its generated Firebase config", () => {
  const source = [
    "const FIREBASE_PROJECT_ID = process.env.LABOR_TARGET_PROJECT_ID;",
    "const GENERATED_FIREBASE_WEB_CONFIG =",
    "  readGeneratedFirebaseWebConfig();",
    'const OPENAI_MODEL = "gpt-test";',
  ].join("\n");
  const firebaseWebConfig = {
    apiKey: "new-key",
    authDomain: "labortest2.firebaseapp.com",
    projectId: "labortest2",
  };

  const specialized = specializeCoreSource({
    source,
    projectId: "labortest2",
    firebaseWebConfig,
  });

  assert.match(
    specialized,
    /const FIREBASE_PROJECT_ID = process\.env\.LABOR_TARGET_PROJECT_ID;/
  );
  assert.ok(
    specialized.includes(
      `const GENERATED_FIREBASE_WEB_CONFIG = ${JSON.stringify(
        firebaseWebConfig,
        null,
        2
      )};`
    )
  );
  assert.doesNotMatch(specialized, /readGeneratedFirebaseWebConfig\(\)/);
  assert.match(specialized, /const OPENAI_MODEL = "gpt-test";/);
});

test("core source upload URL preserves the bucket and encoded object name", () => {
  assert.equal(
    buildStorageMediaUploadUrl(
      "labortest2-labor-builds",
      "labor/core/source file.zip"
    ),
    "https://storage.googleapis.com/upload/storage/v1/b/labortest2-labor-builds/o?uploadType=media&name=labor%2Fcore%2Fsource%20file.zip&ifGenerationMatch=0"
  );
});

test("runtime source upload URL can omit the create-only precondition", () => {
  assert.equal(
    buildStorageMediaUploadUrl(
      "labortest2-labor-builds",
      "generated-apps/user/source.zip",
      { ifGenerationMatch: null }
    ),
    "https://storage.googleapis.com/upload/storage/v1/b/labortest2-labor-builds/o?uploadType=media&name=generated-apps%2Fuser%2Fsource.zip"
  );
});

test("runtime source downloads use the authenticated Storage JSON API", () => {
  assert.equal(
    buildStorageMediaDownloadUrl(
      "labortest3-labor-builds",
      "generated-apps/owner@example.com/run/message/source.zip"
    ),
    "https://storage.googleapis.com/storage/v1/b/labortest3-labor-builds/o/generated-apps%2Fowner%40example.com%2Frun%2Fmessage%2Fsource.zip?alt=media"
  );

  const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  const readerStart = source.indexOf(
    "async function downloadAuthenticatedStorageObject("
  );
  const readerEnd = source.indexOf("async function controlPlaneRequest(", readerStart);
  const reader = source.slice(readerStart, readerEnd);
  assert.match(reader, /const client = authClient \|\| \(await googleAuth\.getClient\(\)\)/);
  assert.match(reader, /await client\.request\(\{/);
  assert.match(reader, /buildStorageMediaDownloadUrl\(bucketName, objectName\)/);
  assert.match(reader, /responseType: "arraybuffer"/);
  assert.match(reader, /"x-goog-user-project"/);

  const generatedFilesStart = source.indexOf(
    "async function loadLatestGeneratedFiles("
  );
  const generatedFilesEnd = source.indexOf(
    "function normalizeGeneratedFunctionNames(",
    generatedFilesStart
  );
  const generatedFilesReader = source.slice(
    generatedFilesStart,
    generatedFilesEnd
  );
  assert.match(generatedFilesReader, /downloadSourceStorageObject/);
  assert.doesNotMatch(generatedFilesReader, /\.download\(\)/);
});

test("generated builds fetch private archives with their runtime identity", () => {
  const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  const helperStart = source.indexOf("function buildAuthenticatedSourceSteps(");
  const buildStart = source.indexOf("async function buildAndDeploy(");
  const buildEnd = source.indexOf(
    "function buildInitialCloudBuildLogTail(",
    buildStart
  );
  const helper = source.slice(helperStart, buildStart);
  const builder = source.slice(buildStart, buildEnd);

  assert.match(helper, /entrypoint: "gcloud"/);
  assert.match(helper, /"storage",\s*"cp"/);
  assert.match(helper, /entrypoint: "python3"/);
  assert.match(helper, /waitFor: \["fetch_generated_source"\]/);
  assert.match(builder, /buildAuthenticatedSourceSteps\(targetBuildBucket, zipObject\)/);
  assert.doesNotMatch(builder, /storageSource/);
  assert.doesNotMatch(builder, /source:\s*\{/);
});

test("updates and every redeploy path prefer saved source before Cloud Storage", () => {
  const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  const updateStart = source.indexOf("async function loadCurrentFilesForUpdate(");
  const updateEnd = source.indexOf("function createReleaseId(", updateStart);
  const updateLoader = source.slice(updateStart, updateEnd);
  const failedRepairStart = source.indexOf(
    "async function repairAndRedeployFailedApplication("
  );
  const failedRepairEnd = source.indexOf(
    "function normalizeRuntimeDiagnostics(",
    failedRepairStart
  );
  const failedRepair = source.slice(failedRepairStart, failedRepairEnd);
  const runtimeRepairStart = source.indexOf(
    "async function repairAndRedeployRuntimeErrors("
  );
  const runtimeRepairEnd = source.indexOf(
    "function handleCors(",
    runtimeRepairStart
  );
  const runtimeRepair = source.slice(runtimeRepairStart, runtimeRepairEnd);
  const manualDeployStart = source.indexOf('if (action === "deploy_source_files")');
  const manualDeployEnd = source.indexOf(
    "if (runState.generationValidationBlocked)",
    manualDeployStart
  );
  const manualDeploy = source.slice(manualDeployStart, manualDeployEnd);

  assert.ok(
    updateLoader.indexOf("loadGeneratedSourceFiles") <
      updateLoader.indexOf("loadLatestGeneratedFiles")
  );
  assert.ok(
    failedRepair.indexOf("loadGeneratedSourceFiles") <
      failedRepair.indexOf("loadLatestGeneratedFiles")
  );
  assert.ok(
    runtimeRepair.indexOf("loadGeneratedSourceFiles") <
      runtimeRepair.indexOf("loadLatestGeneratedFiles")
  );
  assert.match(manualDeploy, /fallbackFiles: deployFiles/);
  assert.match(manualDeploy, /fallbackSourceZip: runState\.latestSourceZip/);
});

test("Cloud Build IDs are read from REST operations", () => {
  assert.equal(
    extractCloudBuildId({ metadata: { build: { id: "build-from-metadata" } } }),
    "build-from-metadata"
  );
  assert.equal(
    extractCloudBuildId({
      name: "operations/build/labortest2/build-from-operation-name",
    }),
    "build-from-operation-name"
  );
});
