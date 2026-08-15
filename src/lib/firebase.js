import { initializeApp, getApps } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
  signInWithCustomToken,
  signOut,
} from "firebase/auth";
import { doc, getDoc, getFirestore, setDoc } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { LABOR_DATA_ROOT_COLLECTION as ROOT_COLLECTION } from "./laborBrand";

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
  ...(import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
    ? { measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID }
    : {}),
};

const missingFirebaseValues = Object.entries(firebaseConfig)
  .filter(([key, value]) => key !== "measurementId" && !value)
  .map(([key]) => key);

if (missingFirebaseValues.length) {
  throw new Error(
    `Labor Firebase configuration is incomplete (${missingFirebaseValues.join(
      ", "
    )}). Copy .env.example to .env.local and add your Firebase web app values.`
  );
}

export const controlFirebaseApp = getApps().length
  ? getApps()[0]
  : initializeApp(firebaseConfig);

export const auth = getAuth(controlFirebaseApp);
export const controlDb = getFirestore(controlFirebaseApp);
export const controlStorage = getStorage(controlFirebaseApp);

const CONFIG_COLLECTION = "Configurations";
export const CONTROL_CONFIGURATION_AGENT_URL =
  import.meta.env.VITE_CONFIGURATION_AGENT_URL ||
  `https://us-central1-${firebaseConfig.projectId}.cloudfunctions.net/configurationAgent`;
const PORTABLE_CONFIGURATION_IDS = [
  "llmModels",
  "stylePreset",
  "style",
  "api",
  "onboarding",
];

export let firebaseApp = controlFirebaseApp;
export let db = controlDb;
export let storage = controlStorage;

let customerAuth = null;
let runtimeFunctionUrls = {};
let dataPlaneState = {
  active: false,
  projectId: firebaseConfig.projectId,
  reason: "control_plane",
};
let activationPromise = null;
let activationKey = "";

function safeDocId(value) {
  return String(value || "guest").replace(/\//g, "_");
}

function cleanFirebaseConfig(value) {
  const config = value && typeof value === "object" ? value : {};
  return {
    apiKey: String(config.apiKey || "").trim(),
    authDomain: String(config.authDomain || "").trim(),
    projectId: String(config.projectId || "").trim(),
    storageBucket: String(config.storageBucket || "").trim(),
    messagingSenderId: String(config.messagingSenderId || "").trim(),
    appId: String(config.appId || "").trim(),
    ...(config.measurementId
      ? { measurementId: String(config.measurementId).trim() }
      : {}),
  };
}

function customerAppName(projectId) {
  return `labor-customer-${String(projectId || "project").replace(
    /[^a-z0-9-]/gi,
    "-"
  )}`;
}

async function requestCustomerSession({ email, userDocId }) {
  if (!auth.currentUser) throw new Error("Sign in before opening your cloud.");
  const response = await fetch(CONTROL_CONFIGURATION_AGENT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await auth.currentUser.getIdToken()}`,
    },
    body: JSON.stringify({
      action: "create_customer_session",
      email,
      userDocId,
    }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.customToken) {
    const error = new Error(
      result?.error || `Customer cloud session failed with ${response.status}.`
    );
    error.code = result?.code || "customer_session_failed";
    error.provisioning = Boolean(result?.provisioning);
    throw error;
  }
  return result;
}

async function synchronizeCustomerIdentity({ email, userDocId }) {
  const response = await fetch(CONTROL_CONFIGURATION_AGENT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await auth.currentUser.getIdToken()}`,
    },
    body: JSON.stringify({
      action: "sync_customer_identity",
      email,
      userDocId,
    }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.ok === false) {
    const error = new Error(
      result?.error || `Customer identity repair failed with ${response.status}.`
    );
    error.code = result?.code || "customer_identity_sync_failed";
    throw error;
  }
  return result;
}

async function migrateMissingPortableConfiguration(userDocId, customerDb) {
  await Promise.all(
    PORTABLE_CONFIGURATION_IDS.map(async (id) => {
      const sourceRef = doc(
        controlDb,
        ROOT_COLLECTION,
        userDocId,
        CONFIG_COLLECTION,
        id
      );
      const targetRef = doc(
        customerDb,
        ROOT_COLLECTION,
        userDocId,
        CONFIG_COLLECTION,
        id
      );
      const [source, target] = await Promise.all([
        getDoc(sourceRef),
        getDoc(targetRef),
      ]);
      if (source.exists() && !target.exists()) {
        await setDoc(targetRef, source.data(), { merge: true });
      }
    })
  );
}

export function getDataPlaneState() {
  return { ...dataPlaneState, functionUrls: { ...runtimeFunctionUrls } };
}

export function getRuntimeFunctionUrl(functionName) {
  return String(runtimeFunctionUrls?.[functionName] || "").trim();
}

export async function activateCustomerDataPlane({
  email = auth.currentUser?.email || "",
  userDocId = safeDocId(email),
  force = false,
} = {}) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedUserDocId = safeDocId(userDocId || normalizedEmail);
  if (!auth.currentUser || !normalizedEmail) {
    return { active: false, reason: "signed_out" };
  }

  const cloudSnapshot = await getDoc(
    doc(
      controlDb,
      ROOT_COLLECTION,
      normalizedUserDocId,
      CONFIG_COLLECTION,
      "googleCloud"
    )
  );
  const cloud = cloudSnapshot.exists() ? cloudSnapshot.data() || {} : {};
  const config = cleanFirebaseConfig(cloud.firebaseWebConfig);
  const projectId =
    config.projectId ||
    String(cloud.selectedProjectId || cloud.defaultProjectId || "").trim();

  if (cloud.status !== "ready" || !projectId || !config.apiKey || !config.appId) {
    dataPlaneState = {
      active: false,
      projectId: projectId || firebaseConfig.projectId,
      reason: cloud.status || "customer_cloud_not_ready",
    };
    return getDataPlaneState();
  }

  const nextActivationKey = `${normalizedEmail}:${projectId}`;
  if (!force && dataPlaneState.active && activationKey === nextActivationKey) {
    return getDataPlaneState();
  }
  if (!force && activationPromise && activationKey === nextActivationKey) {
    return activationPromise;
  }

  activationKey = nextActivationKey;
  activationPromise = (async () => {
    const session = await requestCustomerSession({
      email: normalizedEmail,
      userDocId: normalizedUserDocId,
    });
    const sessionConfig = cleanFirebaseConfig(
      session.firebaseWebConfig || config
    );
    const appName = customerAppName(projectId);
    const existing = getApps().find((app) => app.name === appName);
    const nextApp = existing || initializeApp(sessionConfig, appName);
    const nextAuth = getAuth(nextApp);
    await setPersistence(nextAuth, browserLocalPersistence);
    await signInWithCustomToken(nextAuth, session.customToken);
    await nextAuth.currentUser?.getIdToken(true);

    const nextDb = getFirestore(nextApp);
    const nextStorage = getStorage(nextApp);
    await migrateMissingPortableConfiguration(normalizedUserDocId, nextDb);

    firebaseApp = nextApp;
    customerAuth = nextAuth;
    db = nextDb;
    storage = nextStorage;
    runtimeFunctionUrls = {
      ...(cloud.functionUrls || {}),
      ...(session.functionUrls || {}),
    };
    dataPlaneState = {
      active: true,
      projectId,
      reason: "customer_cloud",
      sessionVersion: Date.now(),
    };
    return getDataPlaneState();
  })();

  try {
    return await activationPromise;
  } catch (error) {
    dataPlaneState = {
      active: false,
      projectId,
      reason: error.code || "customer_session_failed",
      error: error.message,
    };
    throw error;
  } finally {
    activationPromise = null;
  }
}

export async function repairCustomerDataPlaneSession({
  email = auth.currentUser?.email || "",
  userDocId = safeDocId(email),
} = {}) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedUserDocId = safeDocId(userDocId || normalizedEmail);
  if (!auth.currentUser || !normalizedEmail) {
    throw new Error("Sign in to reconnect your Labor workspace.");
  }

  await synchronizeCustomerIdentity({
    email: normalizedEmail,
    userDocId: normalizedUserDocId,
  });
  if (customerAuth?.currentUser) {
    await customerAuth.currentUser.getIdToken(true);
  }
  return activateCustomerDataPlane({
    email: normalizedEmail,
    userDocId: normalizedUserDocId,
    force: true,
  });
}

export async function signOutCustomerDataPlane() {
  if (customerAuth?.currentUser) await signOut(customerAuth).catch(() => {});
  customerAuth = null;
  firebaseApp = controlFirebaseApp;
  db = controlDb;
  storage = controlStorage;
  runtimeFunctionUrls = {};
  activationKey = "";
  activationPromise = null;
  dataPlaneState = {
    active: false,
    projectId: firebaseConfig.projectId,
    reason: "signed_out",
    sessionVersion: 0,
  };
}

export function isFirebasePermissionError(value) {
  const code = String(value?.code || "").toLowerCase();
  const message = String(value?.message || value || "");
  return (
    code === "permission-denied" ||
    code.endsWith("/permission-denied") ||
    /missing or insufficient permissions|permission[_ -]denied/i.test(message)
  );
}

export function userFacingFirebaseError(value, fallback = "Something went wrong.") {
  if (isFirebasePermissionError(value)) {
    return "Labor temporarily lost access to your cloud workspace. It can usually restore access without rebuilding or deleting anything.";
  }
  return String(value?.message || value || fallback);
}

export async function initializeAnalytics() {
  if (typeof window === "undefined") return null;

  try {
    const { getAnalytics, isSupported } = await import("firebase/analytics");
    if (!(await isSupported())) return null;
    return getAnalytics(firebaseApp);
  } catch {
    return null;
  }
}
