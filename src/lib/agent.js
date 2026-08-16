import {
  auth,
  CONTROL_CONFIGURATION_AGENT_URL,
  getRuntimeFunctionUrl,
} from "./firebase";

export const CONFIGURATION_AGENT_URL = CONTROL_CONFIGURATION_AGENT_URL;

async function postJson(url, payload, { authenticated = false } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (authenticated) {
    if (!auth.currentUser) throw new Error("Sign in before continuing.");
    headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  if (!response.ok) {
    const error = new Error(
      json?.error || `Request failed with ${response.status}`
    );
    error.code = json?.code || "";
    error.status = response.status;
    throw error;
  }

  return json;
}

export function callControlConfigurationAgent(payload) {
  return postJson(CONFIGURATION_AGENT_URL, payload, { authenticated: true });
}

function customerFunctionUrl(functionName) {
  const url = getRuntimeFunctionUrl(functionName);
  if (url) return url;
  throw new Error(
    "Your Google Cloud workspace is not ready. Finish Cloud setup in Settings before continuing."
  );
}

function configurationFunctionUrl() {
  return getRuntimeFunctionUrl("configurationAgent") || CONFIGURATION_AGENT_URL;
}

export function callLaborAgent(payload) {
  // The deployed endpoint keeps its pre-release ID for existing projects.
  return postJson(customerFunctionUrl("forwardAgent"), payload, {
    authenticated: true,
  });
}

export function callAppGenerationAgent(payload) {
  return postJson(customerFunctionUrl("appGenerationAgent"), payload, {
    authenticated: true,
  });
}

export function callConfigurationAgent(payload) {
  return postJson(configurationFunctionUrl(), payload, { authenticated: true });
}

export function callSaveOpenAiConfiguration(payload) {
  return postJson(
    configurationFunctionUrl(),
    { ...payload, action: "save_openai_key" },
    { authenticated: true }
  );
}

export function callSaveGoogleCloudConnection(payload) {
  return callControlConfigurationAgent({
    ...payload,
    action: "save_google_cloud_connection",
  });
}

export function callProvisionGoogleCloudProject(payload) {
  return callControlConfigurationAgent({
    ...payload,
    action: "provision_google_cloud_project",
  });
}

export function callGoogleCloudProvisioningStatus(payload) {
  return callControlConfigurationAgent({
    ...payload,
    action: "google_cloud_provisioning_status",
  });
}

export function callRepairGoogleAnalyticsAccess(payload) {
  return callControlConfigurationAgent({
    ...payload,
    action: "repair_google_analytics_access",
  });
}

export function callCompleteOnboarding(payload) {
  return callControlConfigurationAgent({
    ...payload,
    action: "complete_onboarding",
  });
}

export function callAddCustomDomain(payload) {
  return postJson(customerFunctionUrl("addCustomDomain"), payload, {
    authenticated: true,
  });
}

export function callReleaseTheApp(payload) {
  return postJson(customerFunctionUrl("releaseTheApp"), payload, {
    authenticated: true,
  });
}

export function callApplicationAnalytics(payload) {
  return postJson(customerFunctionUrl("applicationAnalytics"), payload, {
    authenticated: true,
  });
}

export function callReleasedAppManagerAgent(payload) {
  return postJson(customerFunctionUrl("releasedAppManagerAgent"), payload, {
    authenticated: true,
  });
}

export function callReleaseMarketingAgent(payload) {
  return postJson(customerFunctionUrl("releaseMarketingAgent"), payload, {
    authenticated: true,
  });
}

export function callStartLabor(payload) {
  return postJson(customerFunctionUrl("startLabor"), payload, {
    authenticated: true,
  });
}

export function callGenerateLaborIdeas(payload) {
  return postJson(customerFunctionUrl("generateLaborIdeas"), payload, {
    authenticated: true,
  });
}

export function callStartAutonomousAgent(payload) {
  return postJson(customerFunctionUrl("startAutonomousAgent"), payload, {
    authenticated: true,
  });
}
