import { getApps, initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  inMemoryPersistence,
  setPersistence,
  signInWithPopup,
  signOut,
} from "firebase/auth";

import { auth, firebaseConfig } from "./firebase";

export const GOOGLE_CLOUD_SCOPE =
  "https://www.googleapis.com/auth/cloud-platform";
export const GOOGLE_ANALYTICS_READONLY_SCOPE =
  "https://www.googleapis.com/auth/analytics.readonly";
export const GOOGLE_ANALYTICS_MANAGE_USERS_SCOPE =
  "https://www.googleapis.com/auth/analytics.manage.users";

const CLOUD_AUTH_APP_NAME = "labor-google-cloud-oauth";
const RECOVERABLE_PROVISIONING_CODES = new Set([
  "cloud_build_service_account_not_ready",
  "core_deployment_refresh_required",
  "core_functions_deployment_failed",
  "core_functions_service_enable_required",
  "core_source_specialization_failed",
  "runtime_permissions_not_ready",
  "service_account_impersonation_grant_missing",
  "service_account_impersonation_not_ready",
  "service_account_not_ready",
]);

export function isRecoverableGoogleCloudProvisioningFailure(
  attentionCode,
  message = ""
) {
  const code = String(attentionCode || "").trim();
  const normalizedMessage = String(message || "");
  if (RECOVERABLE_PROVISIONING_CODES.has(code)) return true;
  if (
    /anonymous caller.*storage\.objects\.create.*-labor-builds/i.test(
      normalizedMessage
    )
  ) {
    return true;
  }
  return (
    /^google_api_(?:400|404)$/.test(code) &&
    /service account\s+labor-runtime@[^\s]+\s+does not exist/i.test(
      normalizedMessage
    )
  );
}

export function isGoogleCloudServiceEnableFailure(message = "") {
  return /permission denied to enable service|serviceusage\.services\.enable[^\n]*denied/i.test(
    String(message || "")
  );
}

function getCloudAuthorizationAuth() {
  const existing = getApps().find((app) => app.name === CLOUD_AUTH_APP_NAME);
  const app =
    existing || initializeApp(firebaseConfig, CLOUD_AUTH_APP_NAME);
  return getAuth(app);
}

export async function requestGoogleCloudAccess(loginHint = "") {
  if (!auth.currentUser) {
    throw new Error("Sign in to Labor before connecting Google Cloud.");
  }

  const provider = new GoogleAuthProvider();
  provider.addScope(GOOGLE_CLOUD_SCOPE);
  provider.addScope(GOOGLE_ANALYTICS_READONLY_SCOPE);
  provider.addScope(GOOGLE_ANALYTICS_MANAGE_USERS_SCOPE);
  provider.setCustomParameters({
    prompt: "select_account consent",
    ...(loginHint ? { login_hint: loginHint } : {}),
  });

  const cloudAuth = getCloudAuthorizationAuth();
  await setPersistence(cloudAuth, inMemoryPersistence);
  if (cloudAuth.currentUser) await signOut(cloudAuth);

  try {
    const result = await signInWithPopup(cloudAuth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const accessToken = credential?.accessToken || "";

    if (!accessToken) {
      throw new Error(
        "Google signed in, but did not return a Cloud access token."
      );
    }

    return {
      accessToken,
      requestedScope: [
        GOOGLE_CLOUD_SCOPE,
        GOOGLE_ANALYTICS_READONLY_SCOPE,
        GOOGLE_ANALYTICS_MANAGE_USERS_SCOPE,
      ].join(" "),
      connectedEmail: result.user.email || "",
      connectedUserId: result.user.uid || "",
      displayName: result.user.displayName || "",
      photoURL: result.user.photoURL || "",
      providerId: credential?.providerId || "google.com",
    };
  } catch (error) {
    if (error?.code === "auth/popup-closed-by-user") {
      throw new Error("Google Cloud connection was cancelled.");
    }
    throw error;
  } finally {
    if (cloudAuth.currentUser) {
      await signOut(cloudAuth).catch(() => {});
    }
  }
}
