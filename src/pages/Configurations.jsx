import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import {
  deleteObject,
  getDownloadURL,
  ref as storageRef,
  uploadBytesResumable,
} from "firebase/storage";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronLeft,
  Cloud,
  Code2,
  ExternalLink,
  Github,
  KeyRound,
  Loader2,
  Lock,
  MessageCircle,
  Save,
  ShieldCheck,
  PencilLine,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";

import {
  activateCustomerDataPlane,
  controlDb,
  db,
  userFacingFirebaseError,
  storage,
} from "../lib/firebase";
import {
  callConfigurationAgent,
  callGoogleCloudProvisioningStatus,
  callProvisionGoogleCloudProject,
  callSaveGoogleCloudConnection,
  callSaveOpenAiConfiguration,
} from "../lib/agent";
import {
  isGoogleCloudServiceEnableFailure,
  isRecoverableGoogleCloudProvisioningFailure,
  requestGoogleCloudAccess,
} from "../lib/googleCloud";
import {
  LABOR_DATA_ROOT_COLLECTION as ROOT_COLLECTION,
  LABOR_GITHUB_DISCUSSIONS_URL,
  LABOR_GITHUB_ISSUES_URL,
  LABOR_GITHUB_URL,
} from "../lib/laborBrand";
import "../styles/settings.css";

const CONFIG_COLLECTION = "Configurations";
const STORAGE_PREFIX = "Configurations";
const MAX_ANALYZE_CHARS = 650000;
const SHOW_CUSTOM_API_SETTINGS = false;

function cloudStageLabel(value) {
  const labels = {
    enabling_apis: "Enabling Google Cloud APIs",
    checking_billing: "Checking project billing",
    initializing_firebase: "Initializing Firebase",
    configuring_iam: "Creating keyless IAM access",
    initializing_data_services: "Creating Firestore, Auth, and Storage",
    initializing_firebase_apps: "Creating Hosting and the Firebase app",
    seeding_workspace: "Moving your Labor workspace",
    deploying_core_functions: "Deploying Labor's core functions",
    finalizing_keyless_access: "Finalizing secure cloud access",
    ready: "Google Cloud is ready",
  };
  return labels[value] || "Preparing Google Cloud";
}

const styleOptions = [
  {
    id: "tailwind",
    label: "Tailwind",
    description: "Default utility-first styling for generated apps.",
  },
  {
    id: "material",
    label: "Material",
    description: "Material-style components and interaction patterns.",
  },
  {
    id: "shadcn",
    label: "Shadcn/UI",
    description: "Clean component primitives with Tailwind-compatible styling.",
  },
];

const llmModelOptions = [
  {
    id: "openai",
    label: "OpenAI",
    description: "GPT models",
    available: true,
    logo: "/assets/openai-blossom.svg",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    description: "Claude models",
    available: false,
    mark: "A",
  },
  {
    id: "google",
    label: "Google",
    description: "Gemini models",
    available: false,
    mark: "G",
  },
  {
    id: "grok",
    label: "Grok",
    description: "xAI models",
    available: false,
    mark: "G",
  },
  {
    id: "kimi",
    label: "Kimi K3",
    description: "Moonshot models",
    available: false,
    mark: "K3",
  },
];

const sectionCopy = {
  style: {
    title: "Style",
    icon: Code2,
    helper: "Choose the default design system Labor should use for new builds.",
    placeholder:
      "Paste CSS, Tailwind classes, design tokens, brand guidelines, Storybook notes, or component style rules...",
    action: "Analyze style",
  },
  api: {
    title: "API",
    icon: KeyRound,
    helper:
      "Paste cURL, public API docs, Swagger/OpenAPI, Postman collections, GitHub links, code, or upload an API file. No API means generated apps stay frontend-only.",
    placeholder:
      "Paste cURL, links to API docs, Swagger/OpenAPI JSON/YAML, Postman collections, auth notes, endpoint docs, GitHub code, or examples...",
    action: "Analyze API",
  },
};

const deployTargets = [
  {
    id: "google_cloud",
    label: "Google Cloud",
    active: true,
    description: "Use your own Google Cloud and Firebase resources.",
  },
  {
    id: "azure",
    label: "Azure",
    active: false,
    description: "Coming later.",
  },
  {
    id: "aws",
    label: "AWS",
    active: false,
    description: "Coming later.",
  },
  {
    id: "client",
    label: "Client's Cloud",
    active: false,
    description: "Coming later.",
  },
];

function createId(prefix = "id") {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function formatTime(value) {
  if (!value) return "";
  const ms =
    typeof value?.toMillis === "function"
      ? value.toMillis()
      : typeof value?.seconds === "number"
        ? value.seconds * 1000
        : Number(value || 0);

  if (!ms) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

function sanitizeFieldKey(value) {
  return String(value || "field")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function truncateForAnalyze(value) {
  const text = String(value || "");
  if (text.length <= MAX_ANALYZE_CHARS) return text;
  return [
    text.slice(0, Math.floor(MAX_ANALYZE_CHARS * 0.72)),
    "\n\n[...middle content omitted for analysis; full original is stored...]\n\n",
    text.slice(-Math.floor(MAX_ANALYZE_CHARS * 0.28)),
  ].join("");
}

async function readFileText(file) {
  if (!file) return "";
  return file.text();
}

function uploadBlobWithProgress(path, blob, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef(storage, path), blob, {
      contentType,
    });

    task.on(
      "state_changed",
      (snapshot) => {
        const progress = Math.round(
          (snapshot.bytesTransferred / Math.max(snapshot.totalBytes, 1)) * 100
        );
        onProgress?.(progress);
      },
      reject,
      async () => {
        const downloadURL = await getDownloadURL(task.snapshot.ref);
        resolve({ storagePath: path, downloadURL });
      }
    );
  });
}

async function loadOriginalTextFromRecord(record) {
  const fallback = String(record?.original?.preview || "");
  const downloadURL = record?.original?.downloadURL;
  if (!downloadURL) return fallback;

  try {
    const response = await fetch(downloadURL);
    if (!response.ok) return fallback;
    const payload = await response.json();
    return String(payload?.text || fallback);
  } catch {
    return fallback;
  }
}

function Configurations({ identity, userDocId, onBack, required = false, onComplete }) {
  const [records, setRecords] = useState({});
  const [formState, setFormState] = useState({
    style: { text: "", file: null },
    api: { text: "", file: null },
  });
  const [drafts, setDrafts] = useState({});
  const [progress, setProgress] = useState({});
  const [busy, setBusy] = useState("");
  const [deleting, setDeleting] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [apiCredentials, setApiCredentials] = useState({});
  const [apiValidation, setApiValidation] = useState({
    validated: false,
    message: "",
  });
  const [customOpen, setCustomOpen] = useState({
    style: false,
    api: false,
  });
  const [llmDrafts, setLlmDrafts] = useState({});
  const [editingLlmId, setEditingLlmId] = useState("");
  const [modelModalOpen, setModelModalOpen] = useState(false);
  const [cloudModalOpen, setCloudModalOpen] = useState(false);
  const [selectedCloudProject, setSelectedCloudProject] = useState("");
  const cloudAutoResumeRef = useRef("");
  const modelInputRef = useRef(null);
  const styleInputRef = useRef(null);
  const apiInputRef = useRef(null);

  useEffect(() => {
    if (!identity.email || !userDocId) return undefined;

    const unsubscribers = [
      "style",
      "api",
      "stylePreset",
      "llmModels",
      "onboarding",
    ].map((id) =>
      onSnapshot(
        doc(db, ROOT_COLLECTION, userDocId, CONFIG_COLLECTION, id),
        (snapshot) => {
          setRecords((current) => ({
            ...current,
            [id]: snapshot.exists() ? { id, ...snapshot.data() } : null,
          }));
        },
        (err) => setError(userFacingFirebaseError(err))
      )
    );

    unsubscribers.push(
      onSnapshot(
        doc(
          controlDb,
          ROOT_COLLECTION,
          userDocId,
          CONFIG_COLLECTION,
          "googleCloud"
        ),
        (snapshot) => {
          setRecords((current) => ({
            ...current,
            googleCloud: snapshot.exists()
              ? { id: "googleCloud", ...snapshot.data() }
              : null,
          }));
        },
        (err) => setError(userFacingFirebaseError(err))
      )
    );

    return () => unsubscribers.forEach((unsub) => unsub());
  }, [identity.email, userDocId]);

  useEffect(() => {
    const cloud = records.googleCloud || {};
    const projects = Array.isArray(cloud.projects) ? cloud.projects : [];
    const suggested =
      cloud.selectedProjectId ||
      cloud.defaultProjectId ||
      projects.find((project) => project.deploymentReady)?.projectId ||
      "";
    setSelectedCloudProject((current) =>
      projects.some((project) => project.projectId === current)
        ? current
        : suggested
    );
  }, [records.googleCloud]);

  useEffect(() => {
    if (!modelModalOpen || editingLlmId !== "openai") return;
    modelInputRef.current?.focus();
  }, [editingLlmId, modelModalOpen]);

  useEffect(() => {
    if (
      records.googleCloud?.status !== "provisioning" ||
      !identity.email ||
      !userDocId
    ) {
      return undefined;
    }

    let active = true;
    let polling = false;
    const refresh = async () => {
      if (polling) return;
      polling = true;
      try {
        const result = await callGoogleCloudProvisioningStatus({
          email: identity.email,
          userDocId,
        });
        if (!active) return;
        if (result.ready) {
          setError("");
          setNotice(
            `Google Cloud is ready${
              result.selectedProjectId ? ` in ${result.selectedProjectId}` : ""
            }.`
          );
          setCloudModalOpen(false);
          await activateCustomerDataPlane({
            email: identity.email,
            userDocId,
            force: true,
          });
          window.location.reload();
        } else if (result.status === "needs_attention") {
          setError(result.error || "Google Cloud needs attention.");
        }
      } catch (statusError) {
        if (active) {
          setError(
            statusError.message || "Could not check Google Cloud setup."
          );
        }
      } finally {
        polling = false;
      }
    };

    refresh();
    const timer = window.setInterval(refresh, 7000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [identity.email, records.googleCloud?.status, userDocId]);

  const selectedStyleId = records.stylePreset?.selectedStyle || "tailwind";
  const llmModels = records.llmModels?.models || {};
  const hasEnabledLlmModel = useMemo(
    () => Boolean(
      llmModels.openai?.enabled &&
        llmModels.openai?.apiKey &&
        llmModels.openai?.validationStatus === "valid"
    ),
    [llmModels]
  );

  const updateText = useCallback((kind, text) => {
    setFormState((current) => ({
      ...current,
      [kind]: { ...current[kind], text },
    }));
    setDrafts((current) => ({ ...current, [kind]: null }));
    if (kind === "api") {
      setApiValidation({ validated: false, message: "" });
    }
  }, []);

  const updateFile = useCallback((kind, file) => {
    setFormState((current) => ({
      ...current,
      [kind]: { ...current[kind], file },
    }));
    setDrafts((current) => ({ ...current, [kind]: null }));
    if (kind === "api") {
      setApiValidation({ validated: false, message: "" });
    }
  }, []);

  const saveStylePreset = useCallback(
    async (styleId) => {
      const option =
        styleOptions.find((style) => style.id === styleId) || styleOptions[0];
      setBusy("stylePreset");
      setError("");
      setNotice("");

      try {
        await setDoc(
          doc(db, ROOT_COLLECTION, userDocId, CONFIG_COLLECTION, "stylePreset"),
          {
            kind: "style_preset",
            selectedStyle: option.id,
            title: option.label,
            description: option.description,
            userEmail: identity.email,
            userId: identity.uid,
            status: "confirmed",
            updatedAt: serverTimestamp(),
            createdAt: records.stylePreset?.createdAt || serverTimestamp(),
          },
          { merge: true }
        );
        setNotice(`${option.label} enabled for new prototypes.`);
      } catch (err) {
        setError(err.message || "Could not save style preference.");
      } finally {
        setBusy("");
      }
    },
    [identity.email, identity.uid, records.stylePreset?.createdAt, userDocId]
  );

  const saveLlmModel = useCallback(
    async (modelId) => {
      const option = llmModelOptions.find((model) => model.id === modelId);
      const apiKey = String(llmDrafts[modelId] || "").trim();
      if (!option?.available || modelId !== "openai" || !apiKey) return;

      setBusy(`llm_${modelId}`);
      setError("");
      setNotice("");

      try {
        await callSaveOpenAiConfiguration({
          email: identity.email,
          userDocId,
          apiKey,
        });

        setLlmDrafts((current) => ({ ...current, [modelId]: "" }));
        setEditingLlmId("");
        setModelModalOpen(false);
        setNotice(`${option.label} is connected and validated.`);
      } catch (err) {
        setError(err.message || "Could not save model key.");
      } finally {
        setBusy("");
      }
    },
    [
      identity.email,
      llmDrafts,
      userDocId,
    ]
  );

  const clearLlmModel = useCallback(
    async (modelId) => {
      const option = llmModelOptions.find((model) => model.id === modelId);
      setBusy(`llm_${modelId}`);
      setError("");
      setNotice("");

      try {
        const nextModels = {
          ...llmModels,
          [modelId]: {
            id: modelId,
            label: option?.label || modelId,
            enabled: false,
            apiKey: "",
            maskedKey: "",
            validationStatus: "not_configured",
            validatedAtMs: 0,
            updatedAtMs: Date.now(),
          },
        };

        await setDoc(
          doc(db, ROOT_COLLECTION, userDocId, CONFIG_COLLECTION, "llmModels"),
          {
            kind: "llm_models",
            models: nextModels,
            userEmail: identity.email,
            userId: identity.uid,
            status: "confirmed",
            updatedAt: serverTimestamp(),
            createdAt: records.llmModels?.createdAt || serverTimestamp(),
          },
          { merge: true }
        );

        setLlmDrafts((current) => ({ ...current, [modelId]: "" }));
        setEditingLlmId("");
        setModelModalOpen(false);
        setNotice(`${option?.label || "Model"} cleared.`);
      } catch (err) {
        setError(err.message || "Could not clear model key.");
      } finally {
        setBusy("");
      }
    },
    [
      identity.email,
      identity.uid,
      llmModels,
      records.llmModels?.createdAt,
      userDocId,
    ]
  );

  const editConfiguration = useCallback(
    async (kind) => {
      const record = records[kind];
      if (!record) return;

      setBusy(`${kind}_edit`);
      setError("");
      setNotice("");

      try {
        const originalText = await loadOriginalTextFromRecord(record);
        setFormState((current) => ({
          ...current,
          [kind]: {
            text: originalText,
            file: null,
          },
        }));
        setCustomOpen((current) => ({ ...current, [kind]: true }));
        setDrafts((current) => ({ ...current, [kind]: null }));
        if (kind === "api") {
          setApiCredentials({});
          setApiValidation({
            validated: false,
            message: "Re-analyze and validate authentication after editing.",
          });
        }
      } catch (err) {
        setError(err.message || "Could not load saved configuration.");
      } finally {
        setBusy("");
      }
    },
    [records]
  );

  const uploadOriginalSubmission = useCallback(
    async ({ kind, originalText, file }) => {
      const submissionId = createId(kind);
      const originalPayload = {
        kind,
        userEmail: identity.email,
        userDocId,
        file: file
          ? {
              name: file.name,
              size: file.size,
              type: file.type || "text/plain",
            }
          : null,
        text: originalText,
        createdAtMs: Date.now(),
      };
      const path = `${STORAGE_PREFIX}/${userDocId}/${kind}/${submissionId}-original.json`;
      const blob = new Blob([JSON.stringify(originalPayload, null, 2)], {
        type: "application/json",
      });

      return uploadBlobWithProgress(path, blob, "application/json", (value) =>
        setProgress((current) => ({ ...current, [kind]: value }))
      );
    },
    [identity.email, userDocId]
  );

  const analyze = useCallback(
    async (kind) => {
      const section = formState[kind];
      const fileText = section.file ? await readFileText(section.file) : "";
      const originalText = [section.text.trim(), fileText.trim()]
        .filter(Boolean)
        .join("\n\n");

      if (!originalText) {
        setError(`Paste ${kind === "style" ? "style" : "API"} text or upload a file first.`);
        return;
      }

      setBusy(kind);
      setError("");
      setNotice("");
      setProgress((current) => ({ ...current, [kind]: 0 }));

      try {
        const original = await uploadOriginalSubmission({
          kind,
          originalText,
          file: section.file,
        });
        const result = await callConfigurationAgent({
          action: "analyze_config",
          email: identity.email,
          userDocId,
          kind,
          fileName: section.file?.name || "",
          originalText: truncateForAnalyze(originalText),
          originalStoragePath: original.storagePath,
        });

        setDrafts((current) => ({
          ...current,
          [kind]: {
            structured: result.structured,
            original,
            originalPreview: originalText.slice(0, 8000),
            file: section.file
              ? {
                  name: section.file.name,
                  size: section.file.size,
                  type: section.file.type || "text/plain",
                }
              : null,
            analyzedAtMs: Date.now(),
          },
        }));

        if (kind === "api") {
          const authType = result.structured?.api?.authentication?.type || "unknown";
          setApiCredentials({});
          setApiValidation({
            validated: authType === "none",
            message:
              authType === "none"
                ? "No authentication appears to be required."
                : "Authentication must be validated before saving.",
          });
        }
      } catch (err) {
        setError(err.message || "Could not analyze configuration.");
      } finally {
        setBusy("");
      }
    },
    [formState, identity.email, uploadOriginalSubmission, userDocId]
  );

  const validateApiAuth = useCallback(async () => {
    const draft = drafts.api;
    if (!draft?.structured) return;

    setBusy("api_auth");
    setError("");
    setApiValidation({ validated: false, message: "Checking authentication..." });

    try {
      const result = await callConfigurationAgent({
        action: "validate_api_auth",
        email: identity.email,
        userDocId,
        structured: draft.structured,
        credentials: apiCredentials,
      });

      setApiValidation({
        validated: Boolean(result.validated),
        message: result.message || "",
      });
    } catch (err) {
      setApiValidation({
        validated: false,
        message: err.message || "Authentication check failed.",
      });
    } finally {
      setBusy("");
    }
  }, [apiCredentials, drafts.api, identity.email, userDocId]);

  const saveConfiguration = useCallback(
    async (kind) => {
      const draft = drafts[kind];
      if (!draft?.structured) return;

      if (kind === "api") {
        const authType = draft.structured?.api?.authentication?.type || "unknown";
        if (authType !== "none" && !apiValidation.validated) {
          setError("Validate API authentication before saving.");
          return;
        }
      }

      setBusy(`${kind}_save`);
      setError("");

      try {
        await setDoc(
          doc(db, ROOT_COLLECTION, userDocId, CONFIG_COLLECTION, kind),
          {
            kind,
            title: draft.structured.title,
            summary: draft.structured.summary,
            original: {
              storagePath: draft.original.storagePath,
              downloadURL: draft.original.downloadURL,
              preview: draft.originalPreview,
              file: draft.file,
            },
            structured: draft.structured,
            authenticationValidation:
              kind === "api"
                ? {
                    validated: apiValidation.validated,
                    message: apiValidation.message,
                    validatedAtMs: apiValidation.validated ? Date.now() : 0,
                  }
                : null,
            userEmail: identity.email,
            userId: identity.uid,
            status: "confirmed",
            updatedAt: serverTimestamp(),
            createdAt: records[kind]?.createdAt || serverTimestamp(),
          },
          { merge: true }
        );

        setNotice(`${sectionCopy[kind].title} configuration saved.`);
        setDrafts((current) => ({ ...current, [kind]: null }));
        setFormState((current) => ({
          ...current,
          [kind]: { text: "", file: null },
        }));
        setCustomOpen((current) => ({ ...current, [kind]: false }));
      } catch (err) {
        setError(err.message || "Could not save configuration.");
      } finally {
        setBusy("");
      }
    },
    [apiValidation, drafts, identity.email, identity.uid, records, userDocId]
  );

  const deleteConfiguration = useCallback(
    async (kind) => {
      const record = records[kind];
      setDeleting(kind);
      setError("");

      try {
        await deleteDoc(doc(db, ROOT_COLLECTION, userDocId, CONFIG_COLLECTION, kind));
        const storagePath = record?.original?.storagePath;
        if (storagePath) {
          try {
            await deleteObject(storageRef(storage, storagePath));
          } catch {
            // The Firestore record is the source of truth for the UI.
          }
        }
        setDrafts((current) => ({ ...current, [kind]: null }));
        setFormState((current) => ({
          ...current,
          [kind]: { text: "", file: null },
        }));
        setCustomOpen((current) => ({ ...current, [kind]: false }));
        if (kind === "api") {
          setApiCredentials({});
          setApiValidation({ validated: false, message: "" });
        }
      } catch (err) {
        setError(err.message || "Could not delete configuration.");
      } finally {
        setDeleting("");
      }
    },
    [records, userDocId]
  );

  const connectGoogleCloud = useCallback(async () => {
    if (busy) return;

    setBusy("googleCloud");
    setError("");
    setNotice("");

    try {
      const connection = await requestGoogleCloudAccess(identity.email);
      const result = await callSaveGoogleCloudConnection({
        email: identity.email,
        userDocId,
        connection,
      });

      if (!result.connected) {
        setError(result.error || "Google Cloud needs attention.");
        return;
      }

      const projects = Array.isArray(result.projects) ? result.projects : [];
      setSelectedCloudProject(
        result.selectedProjectId ||
          projects.find((project) => project.deploymentReady)?.projectId ||
          ""
      );
      setNotice(
        projects.length > 1
          ? "Google Cloud connected. Choose the project Labor should prepare."
          : "Google Cloud connected. Confirm the project to begin setup."
      );
    } catch (err) {
      setError(err.message || "Could not connect Google Cloud.");
    } finally {
      setBusy("");
    }
  }, [busy, identity.email, userDocId]);

  const provisionGoogleCloud = useCallback(async () => {
    if (busy || !selectedCloudProject) return;

    setBusy("googleCloud");
    setError("");
    setNotice("");

    try {
      const result = await callProvisionGoogleCloudProject({
        email: identity.email,
        userDocId,
        projectId: selectedCloudProject,
      });
      if (!result.connected || result.status === "needs_attention") {
        setError(result.error || "Google Cloud needs attention.");
        return;
      }
      if (result.ready) {
        setCloudModalOpen(false);
        setNotice(`Google Cloud is ready in ${selectedCloudProject}.`);
        await activateCustomerDataPlane({
          email: identity.email,
          userDocId,
          force: true,
        });
        window.location.reload();
        return;
      }
      setNotice(
        `Google Cloud is preparing ${selectedCloudProject}. Core functions are deploying now.`
      );
    } catch (err) {
      setError(err.message || "Google Cloud setup could not start.");
    } finally {
      setBusy("");
    }
  }, [busy, identity.email, selectedCloudProject, userDocId]);

  useEffect(() => {
    const cloud = records.googleCloud || {};
    const recoverable =
      cloud.status === "needs_attention" &&
      isRecoverableGoogleCloudProvisioningFailure(
        cloud.attentionCode,
        cloud.lastValidationError
      ) &&
      ((cloud.accessTokenStored &&
        Number(cloud.estimatedExpiresAtMs || 0) > Date.now()) ||
        (cloud.attentionCode === "core_functions_deployment_failed" &&
          cloud.serviceAccountEmail &&
          !isGoogleCloudServiceEnableFailure(cloud.lastValidationError))) &&
      selectedCloudProject;
    const resumeKey = recoverable
      ? `${selectedCloudProject}:${cloud.attentionCode}:${cloud.estimatedExpiresAtMs}`
      : "";
    if (!resumeKey || cloudAutoResumeRef.current === resumeKey) return;
    cloudAutoResumeRef.current = resumeKey;
    setCloudModalOpen(true);
    void provisionGoogleCloud();
  }, [provisionGoogleCloud, records.googleCloud, selectedCloudProject]);

  const finishConfiguration = useCallback(async () => {
    if (!hasEnabledLlmModel) {
      setError("Connect and validate an OpenAI API key before continuing.");
      setNotice("");
      return;
    }

    if (!required) {
      onBack?.();
      return;
    }

    const option =
      styleOptions.find((style) => style.id === selectedStyleId) || styleOptions[0];
    setBusy("configurationComplete");
    setError("");
    setNotice("");

    try {
      await Promise.all([
        setDoc(
          doc(db, ROOT_COLLECTION, userDocId, CONFIG_COLLECTION, "stylePreset"),
          {
            kind: "style_preset",
            selectedStyle: option.id,
            title: option.label,
            description: option.description,
            userEmail: identity.email,
            userId: identity.uid,
            status: "confirmed",
            updatedAt: serverTimestamp(),
            createdAt: records.stylePreset?.createdAt || serverTimestamp(),
          },
          { merge: true }
        ),
        setDoc(
          doc(db, ROOT_COLLECTION, userDocId, CONFIG_COLLECTION, "onboarding"),
          {
            status: "completed",
            completedAt: serverTimestamp(),
            completedAtMs: Date.now(),
            userEmail: identity.email,
            userId: identity.uid,
            updatedAt: serverTimestamp(),
            createdAt: records.onboarding?.createdAt || serverTimestamp(),
          },
          { merge: true }
        ),
      ]);

      onComplete?.();
    } catch (err) {
      setError(err.message || "Could not finish configuration.");
    } finally {
      setBusy("");
    }
  }, [
    identity.email,
    identity.uid,
    hasEnabledLlmModel,
    onBack,
    onComplete,
    records.onboarding?.createdAt,
    records.stylePreset?.createdAt,
    required,
    selectedStyleId,
    userDocId,
  ]);

  const apiAuth = drafts.api?.structured?.api?.authentication || null;

  return (
    <div className="tk-settings tk-page-surface tk-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-8 text-slate-300 sm:px-8">
      <div className="mx-auto w-full max-w-5xl">
        {!required && onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mb-8 inline-flex h-9 items-center gap-2 rounded-xl px-2 text-sm text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-200"
          >
            <ChevronLeft size={16} strokeWidth={1.5} />
            Back
          </button>
        )}

        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-light tracking-tight text-white">
              Settings
            </h1>
            <p className="mt-2 max-w-2xl text-sm font-light leading-6 text-slate-500">
              Connect the model and cloud Labor uses, then choose the defaults that guide new builds.
            </p>
          </div>
          <button
            type="button"
            onClick={finishConfiguration}
            disabled={Boolean(busy)}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-2xl bg-white px-4 text-sm font-medium text-black transition-colors hover:bg-slate-200 disabled:bg-white/10 disabled:text-slate-500"
          >
            {busy === "configurationComplete" ? (
              <Loader2 className="animate-spin" size={15} />
            ) : (
              <CheckCircle2 size={15} strokeWidth={1.7} />
            )}
            {required ? "Save and continue" : "Done"}
          </button>
        </header>

        {(error || notice) && (
          <div
            className={[
              "mb-5 rounded-2xl border px-4 py-3 text-sm font-light",
              error
                ? "border-red-500/20 bg-red-500/10 text-red-200"
                : "border-emerald-500/20 bg-emerald-500/10 text-emerald-200",
            ].join(" ")}
          >
            {error || notice}
          </div>
        )}

        <div className="grid gap-5">
          <LlmModelsPanel
            models={llmModels}
            busy={busy}
            onOpen={() => {
              setError("");
              setNotice("");
              setEditingLlmId("");
              setLlmDrafts((current) => ({ ...current, openai: "" }));
              setModelModalOpen(true);
            }}
          />

          <DeploymentSection
            record={records.googleCloud}
            busy={busy === "googleCloud"}
            onConnect={() => {
              setError("");
              setCloudModalOpen(true);
            }}
          />

          {SHOW_CUSTOM_API_SETTINGS ? (
            <ConfigurationSection
              kind="api"
              form={formState.api}
              draft={drafts.api}
              record={records.api}
              busy={busy}
              deleting={deleting}
              progress={progress.api}
              fileInputRef={apiInputRef}
              onTextChange={updateText}
              onFileChange={updateFile}
              onAnalyze={analyze}
              onSave={saveConfiguration}
              onEdit={editConfiguration}
              onDelete={deleteConfiguration}
              addLabel="Add Custom API"
              customOpen={customOpen.api}
              onOpenCustom={() =>
                setCustomOpen((current) => ({ ...current, api: true }))
              }
              authPanel={
                apiAuth ? (
                  <AuthenticationPanel
                    auth={apiAuth}
                    credentials={apiCredentials}
                    validation={apiValidation}
                    busy={busy === "api_auth"}
                    onCredentialsChange={setApiCredentials}
                    onValidate={validateApiAuth}
                  />
                ) : null
              }
              saveDisabled={
                Boolean(drafts.api?.structured) &&
                apiAuth?.type !== "none" &&
                !apiValidation.validated
              }
            />
          ) : null}

          <ConfigurationSection
            kind="style"
            form={formState.style}
            draft={drafts.style}
            record={records.style}
            busy={busy}
            deleting={deleting}
            progress={progress.style}
            fileInputRef={styleInputRef}
            onTextChange={updateText}
            onFileChange={updateFile}
            onAnalyze={analyze}
            onSave={saveConfiguration}
            onEdit={editConfiguration}
            onDelete={deleteConfiguration}
            addLabel="Add custom"
            showAddButton={false}
            customOpen={customOpen.style}
            onOpenCustom={() =>
              setCustomOpen((current) => ({ ...current, style: true }))
            }
            topContent={
              <StylePresetSelector
                selectedStyleId={selectedStyleId}
                busy={busy === "stylePreset"}
                onSelect={saveStylePreset}
              />
            }
          />

          <section className="tk-settings-panel rounded-3xl p-5 sm:p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 gap-3">
                <div className="tk-settings-icon grid size-10 shrink-0 place-items-center rounded-2xl text-white">
                  <Github size={18} strokeWidth={1.5} />
                </div>
                <div>
                  <h2 className="text-base font-medium text-white">
                    Built in public. Free forever.
                  </h2>
                  <p className="mt-1 max-w-xl text-sm font-light leading-6 text-slate-500">
                    Found a problem or have an idea? Help shape Labor with the
                    people building and using it.
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <a
                  href={LABOR_GITHUB_ISSUES_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 text-xs font-semibold text-slate-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
                >
                  <AlertCircle size={14} strokeWidth={1.7} />
                  Report an issue
                </a>
                <a
                  href={LABOR_GITHUB_DISCUSSIONS_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center gap-2 rounded-full bg-white px-3.5 text-xs font-semibold text-black transition hover:bg-slate-200"
                >
                  <MessageCircle size={14} strokeWidth={1.7} />
                  Join the discussion
                </a>
              </div>
            </div>
            <a
              href={LABOR_GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600 transition hover:text-slate-300"
            >
              github.com/hribab/labor
              <ExternalLink size={11} strokeWidth={1.6} />
            </a>
          </section>
        </div>

        <OpenAiModelModal
          open={modelModalOpen}
          saved={llmModels.openai || null}
          draft={llmDrafts.openai || ""}
          editing={editingLlmId === "openai"}
          busy={busy === "llm_openai"}
          error={error}
          inputRef={modelInputRef}
          onClose={() => {
            if (busy) return;
            setModelModalOpen(false);
            setEditingLlmId("");
            setLlmDrafts((current) => ({ ...current, openai: "" }));
            setError("");
          }}
          onEdit={() => {
            setError("");
            setEditingLlmId("openai");
          }}
          onDraftChange={(value) =>
            setLlmDrafts((current) => ({ ...current, openai: value }))
          }
          onSave={() => saveLlmModel("openai")}
          onClear={() => clearLlmModel("openai")}
        />

        <GoogleCloudConnectModal
          open={cloudModalOpen}
          record={records.googleCloud}
          busy={busy === "googleCloud"}
          error={error}
          selectedProject={selectedCloudProject}
          onClose={() => {
            if (!busy) setCloudModalOpen(false);
          }}
          onConnect={connectGoogleCloud}
          onProjectChange={setSelectedCloudProject}
          onProvision={provisionGoogleCloud}
        />
      </div>
    </div>
  );
}

function StylePresetSelector({ selectedStyleId, busy, onSelect }) {
  return (
    <div
      role="radiogroup"
      aria-label="Default application style"
      className="mt-5 grid gap-3 sm:grid-cols-3"
    >
      {styleOptions.map((option) => {
        const enabled = selectedStyleId === option.id;

        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={enabled}
            onClick={() => {
              if (!enabled) onSelect(option.id);
            }}
            disabled={busy}
            className={[
              "tk-settings-provider-card tk-settings-style-card flex min-h-36 flex-col rounded-2xl p-4 text-left transition",
              enabled ? "tk-settings-provider-card--connected" : "",
            ].join(" ")}
          >
            <span className="flex items-start justify-between gap-3">
              <span className="tk-settings-provider-mark grid size-9 place-items-center rounded-full text-slate-300">
                <Code2 size={15} strokeWidth={1.5} />
              </span>
              <span
                aria-hidden="true"
                className={[
                  "relative h-6 w-11 shrink-0 rounded-full border transition-colors",
                  enabled
                    ? "border-emerald-300/35 bg-emerald-300/20"
                    : "border-white/10 bg-white/[0.04]",
                ].join(" ")}
              >
                <span
                  className={[
                    "absolute top-1 size-4 rounded-full transition-all",
                    enabled
                      ? "left-6 bg-emerald-200"
                      : "left-1 bg-slate-600",
                  ].join(" ")}
                />
              </span>
            </span>
            <span className="mt-auto block pt-5">
              <span className="block text-sm font-medium text-white">
                {option.label}
              </span>
              <span className="mt-1 block text-xs font-light leading-5 text-slate-500">
                {option.description}
              </span>
              <span
                className={[
                  "mt-3 block text-[10px] font-semibold uppercase",
                  enabled ? "text-emerald-200" : "text-slate-600",
                ].join(" ")}
              >
                {enabled ? "Active" : "Use this style"}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function LlmModelsPanel({
  models,
  busy,
  onOpen,
}) {
  return (
    <section className="tk-settings-panel rounded-3xl p-5 sm:p-6">
      <div className="flex min-w-0 gap-3">
        <div className="tk-settings-icon grid size-10 shrink-0 place-items-center rounded-2xl text-white">
          <KeyRound size={18} strokeWidth={1.5} />
        </div>
        <div>
          <h2 className="text-base font-medium text-white">Model</h2>
          <p className="mt-1 max-w-2xl text-sm font-light leading-6 text-slate-500">
            Connect the model Labor uses to reason and build. Every OpenAI key is validated before it is saved.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {llmModelOptions.map((option) => {
          const saved = models[option.id] || null;
          const connected = Boolean(
            option.id === "openai" &&
              saved?.enabled &&
              saved?.validationStatus === "valid"
          );

          return (
            <button
              key={option.id}
              type="button"
              disabled={!option.available || Boolean(busy)}
              onClick={option.available ? onOpen : undefined}
              className={[
                "tk-settings-provider-card flex min-h-36 flex-col rounded-2xl p-4 text-left transition",
                connected ? "tk-settings-provider-card--connected" : "",
                option.available
                  ? "text-white"
                  : "cursor-not-allowed text-slate-600 opacity-55",
              ].join(" ")}
            >
              <span className="flex items-start justify-between gap-2">
                <span
                  className={[
                    "tk-settings-provider-mark grid size-9 place-items-center rounded-full",
                    option.available
                      ? "tk-settings-provider-mark--brand text-black"
                      : "text-slate-500",
                  ].join(" ")}
                >
                  {option.logo ? (
                    <img src={option.logo} alt="" className="size-5" />
                  ) : (
                    <span className="text-[11px] font-semibold">
                      {option.mark}
                    </span>
                  )}
                </span>
                <span
                  className={[
                    "rounded-full border px-2 py-1 text-[9px] font-semibold uppercase",
                    connected
                      ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-200"
                      : option.available
                        ? "border-white/[0.08] text-slate-500"
                        : "border-white/[0.06] text-slate-600",
                  ].join(" ")}
                >
                  {connected
                    ? "Ready"
                    : option.available
                      ? "Connect"
                      : "Coming soon"}
                </span>
              </span>
              <span className="mt-auto block pt-5 text-sm font-medium">
                {option.label}
              </span>
              <span className="mt-1 block text-xs font-light leading-5 text-slate-500">
                {connected
                  ? saved.maskedKey || "Validated API key"
                  : option.description}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function OpenAiModelModal({
  open,
  saved,
  draft,
  editing,
  busy,
  error,
  inputRef,
  onClose,
  onEdit,
  onDraftChange,
  onSave,
  onClear,
}) {
  const connected = Boolean(
    saved?.enabled && saved?.validationStatus === "valid"
  );

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [busy, onClose, open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-[#03050a]/80 p-4 backdrop-blur-md"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="openai-model-title"
        className="tk-settings-modal relative w-full max-w-2xl overflow-hidden rounded-[30px] p-6 text-center text-white sm:p-8"
      >
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label="Close model configuration"
          className="absolute right-4 top-4 grid size-9 place-items-center rounded-full border border-white/[0.09] bg-black/20 text-slate-400 transition hover:bg-white/[0.08] hover:text-white disabled:opacity-40"
        >
          <X size={15} />
        </button>

        <p className="text-[10px] font-semibold uppercase text-slate-500">
          Model
        </p>
        <h2 id="openai-model-title" className="mt-2 text-2xl font-semibold">
          Configure LLM model
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
          Connect the OpenAI key Labor will use to reason, generate, and build.
        </p>

        <div className="mx-auto mt-8 grid size-20 place-items-center rounded-full bg-white shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
          <img
            src="/assets/openai-blossom.svg"
            alt="OpenAI"
            className="size-10"
          />
        </div>
        <div className="mt-4 text-base font-semibold">OpenAI</div>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-slate-500">
          The key is validated before it replaces your current model connection.
        </p>

        {connected && !editing ? (
          <div className="mx-auto mt-6 max-w-sm rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.06] px-4 py-3 text-sm text-emerald-100">
            Connected {saved.maskedKey ? `as ${saved.maskedKey}` : "and validated"}
          </div>
        ) : null}

        {editing ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onSave();
            }}
            className="mx-auto mt-7 w-full max-w-md"
          >
            <div className="tk-settings-key-shell grid grid-cols-[minmax(0,1fr)_auto] overflow-hidden rounded-2xl">
              <label htmlFor="settings-openai-api-key" className="sr-only">
                OpenAI API key
              </label>
              <input
                ref={inputRef}
                id="settings-openai-api-key"
                type="password"
                value={draft}
                onChange={(event) => onDraftChange(event.target.value)}
                placeholder="Enter your API Key"
                autoComplete="off"
                spellCheck="false"
                disabled={busy}
                className="min-w-0 bg-transparent px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!draft.trim() || busy}
                className="inline-flex min-w-20 items-center justify-center gap-2 border-l border-white/10 bg-white px-4 text-sm font-semibold text-black transition hover:bg-slate-200 disabled:bg-white/10 disabled:text-slate-600"
              >
                {busy ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Check size={14} />
                )}
                Check
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onEdit}
              disabled={busy}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-black transition hover:bg-slate-200 disabled:bg-white/10 disabled:text-slate-500"
            >
              <KeyRound size={14} />
              {connected ? "Replace API key" : "Enter API key"}
            </button>
            {connected ? (
              <button
                type="button"
                onClick={onClear}
                disabled={busy}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 text-sm text-slate-400 transition hover:bg-white/[0.08] hover:text-red-200 disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Trash2 size={14} />
                )}
                Disconnect
              </button>
            ) : null}
          </div>
        )}

        {error ? (
          <div className="mx-auto mt-5 flex max-w-md items-start gap-2 rounded-2xl border border-red-300/15 bg-red-300/[0.07] px-3 py-2.5 text-left text-xs leading-5 text-red-200">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <p className="mt-7 text-xs text-slate-600">
          Anthropic, Google, Grok, and Kimi K3 are coming soon.
        </p>
      </section>
    </div>,
    document.body
  );
}

function ConfigurationSection({
  kind,
  form,
  draft,
  record,
  busy,
  deleting,
  progress,
  fileInputRef,
  onTextChange,
  onFileChange,
  onAnalyze,
  onSave,
  onEdit,
  onDelete,
  addLabel,
  showAddButton = true,
  customOpen,
  onOpenCustom,
  topContent,
  authPanel = null,
  saveDisabled = false,
}) {
  const copy = sectionCopy[kind];
  const Icon = copy.icon;
  const isBusy = busy === kind;
  const isSaving = busy === `${kind}_save`;
  const canAnalyze = Boolean(form.text.trim() || form.file) && !busy;

  return (
    <section className="tk-settings-panel rounded-3xl p-5 sm:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className="tk-settings-icon grid size-10 shrink-0 place-items-center rounded-2xl text-white">
            <Icon size={18} strokeWidth={1.5} />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-medium text-white">{copy.title}</h2>
            <p className="mt-1 max-w-2xl text-sm font-light leading-6 text-slate-500">
              {copy.helper}
            </p>
            {record && (
              <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-200">
                <CheckCircle2 size={13} />
                Saved {formatTime(record.updatedAt)}
              </div>
            )}
          </div>
        </div>
      </div>

      {topContent}

      {record && (
        <SavedConfigurationsList
          kind={kind}
          record={record}
          busy={busy}
          deleting={deleting}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )}

      {showAddButton && !customOpen && !draft?.structured && (
        <button
          type="button"
          onClick={onOpenCustom}
          className="mt-5 inline-flex h-10 w-fit items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 text-sm text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
        >
          <UploadCloud size={15} strokeWidth={1.5} />
          {addLabel}
        </button>
      )}

      {(customOpen || draft?.structured) && (
      <div className="mt-5 grid gap-3">
        <textarea
          value={form.text}
          onChange={(event) => onTextChange(kind, event.target.value)}
          rows={kind === "api" ? 8 : 6}
          placeholder={copy.placeholder}
          className="tk-glass-input min-h-36 resize-y rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-6 text-slate-200 outline-none placeholder:text-slate-600 focus:border-white/20"
        />

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(event) => {
            onFileChange(kind, event.target.files?.[0] || null);
            event.target.value = "";
          }}
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="tk-glass-card flex min-h-20 items-center justify-center gap-3 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-4 text-sm text-slate-500 transition-colors hover:border-white/25 hover:bg-white/[0.04] hover:text-slate-200"
        >
          <UploadCloud size={18} strokeWidth={1.5} />
          {form.file ? form.file.name : "Upload file"}
        </button>

        {typeof progress === "number" && progress > 0 && progress < 100 && (
          <div className="h-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-white transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onAnalyze(kind)}
            disabled={!canAnalyze}
            className="inline-flex h-10 items-center gap-2 rounded-2xl bg-white px-4 text-sm font-medium text-black transition-colors hover:bg-slate-200 disabled:bg-white/10 disabled:text-slate-500"
          >
            {isBusy ? (
              <Loader2 className="animate-spin" size={15} />
            ) : (
              <ShieldCheck size={15} strokeWidth={1.5} />
            )}
            {copy.action}
          </button>
        </div>
      </div>
      )}

      {draft?.structured && (
        <div className="tk-glass-card mt-5 rounded-2xl border border-white/10 bg-[#0D0D0D] p-4">
          <StructuredPreview structured={draft.structured} />
          {authPanel}
          <button
            type="button"
            onClick={() => onSave(kind)}
            disabled={isSaving || saveDisabled}
            className="mt-4 inline-flex h-10 items-center gap-2 rounded-2xl bg-white px-4 text-sm font-medium text-black transition-colors hover:bg-slate-200 disabled:bg-white/10 disabled:text-slate-500"
          >
            {isSaving ? (
              <Loader2 className="animate-spin" size={15} />
            ) : (
              <Save size={15} strokeWidth={1.5} />
            )}
            Confirm and save
          </button>
        </div>
      )}
    </section>
  );
}

function SavedConfigurationsList({
  kind,
  record,
  busy,
  deleting,
  onEdit,
  onDelete,
}) {
  const title = record.title || sectionCopy[kind]?.title || "Configuration";
  const summary = record.summary || record.structured?.summary || "Saved configuration";
  const fileName = record.original?.file?.name || "";
  const isEditing = busy === `${kind}_edit`;
  const isDeleting = deleting === kind;

  return (
    <div className="tk-glass-card mt-5 rounded-2xl border border-white/10 bg-[#0D0D0D] p-3">
      <div className="mb-2 px-1 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">
        Saved configuration
      </div>
      <div className="flex items-start gap-3 rounded-xl bg-white/[0.025] p-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <div className="truncate text-sm font-medium text-white">{title}</div>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-slate-500">
              {kind}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-sm font-light leading-5 text-slate-500">
            {summary}
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
            {fileName && <span>{fileName}</span>}
            {record.updatedAt && <span>Updated {formatTime(record.updatedAt)}</span>}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onEdit(kind)}
            disabled={Boolean(busy)}
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-200 disabled:opacity-50"
            aria-label={`Edit ${title}`}
            title="Edit"
          >
            {isEditing ? (
              <Loader2 className="animate-spin" size={14} />
            ) : (
              <PencilLine size={14} strokeWidth={1.5} />
            )}
          </button>
          <button
            type="button"
            onClick={() => onDelete(kind)}
            disabled={isDeleting}
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-white/10 hover:text-red-200 disabled:opacity-50"
            aria-label={`Delete ${title}`}
            title="Delete"
          >
            {isDeleting ? (
              <Loader2 className="animate-spin" size={14} />
            ) : (
              <Trash2 size={14} strokeWidth={1.5} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function StructuredPreview({ structured }) {
  const isStyle = structured.kind === "style";
  const auth = structured.api?.authentication || {};

  return (
    <div>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-sm font-medium text-white">
            {structured.title || "Structured configuration"}
          </div>
          <p className="mt-1 max-w-2xl text-sm font-light leading-6 text-slate-400">
            {structured.summary}
          </p>
        </div>
        <div className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-slate-500">
          {Math.round(Number(structured.confidence || 0) * 100)}% confidence
        </div>
      </div>

      {safeArray(structured.warnings).length > 0 && (
        <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-100">
          {structured.warnings[0]}
        </div>
      )}

      {isStyle ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <PreviewList title="Colors" items={safeArray(structured.style?.colors).map((item) => `${item.name}: ${item.value} ${item.usage ? `- ${item.usage}` : ""}`)} />
          <PreviewList title="Layout" items={safeArray(structured.style?.layoutRules)} />
          <PreviewList title="Components" items={safeArray(structured.style?.componentRules)} />
          <PreviewList title="Implementation" items={safeArray(structured.style?.implementationNotes)} />
        </div>
      ) : (
        <div className="mt-4 grid gap-3">
          <div className="tk-glass-card rounded-2xl border border-white/5 bg-white/[0.025] p-3">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
              <Lock size={13} />
              Authentication
            </div>
            <div className="mt-2 text-sm text-slate-300">
              {auth.type || "unknown"} {auth.location && auth.location !== "unknown" ? `via ${auth.location}` : ""}
            </div>
            {auth.instructions && (
              <p className="mt-1 text-xs leading-5 text-slate-500">{auth.instructions}</p>
            )}
          </div>
          <PreviewList title="Base URLs" items={safeArray(structured.api?.baseUrls)} />
          <PreviewList
            title="Major APIs"
            items={safeArray(structured.api?.endpoints)
              .slice(0, 6)
              .map((item) => `${item.method} ${item.path} - ${item.purpose}`)}
          />
        </div>
      )}
    </div>
  );
}

function PreviewList({ title, items }) {
  return (
    <div className="tk-glass-card rounded-2xl border border-white/5 bg-white/[0.025] p-3">
      <div className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
        {title}
      </div>
      {items.length ? (
        <ul className="mt-2 grid gap-1.5 text-sm leading-5 text-slate-300">
          {items.slice(0, 5).map((item, index) => (
            <li key={`${title}_${index}`} className="line-clamp-2">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-2 text-sm text-slate-600">No strong signal found.</div>
      )}
    </div>
  );
}

function AuthenticationPanel({
  auth,
  credentials,
  validation,
  busy,
  onCredentialsChange,
  onValidate,
}) {
  const type = auth.type || "unknown";
  const requiredFields = useMemo(() => {
    if (type === "api_key") return ["API key"];
    if (type === "bearer") return ["Bearer token"];
    if (type === "basic") return ["Username", "Password"];
    if (type === "none") return [];
    return safeArray(auth.requiredFields).length
      ? safeArray(auth.requiredFields)
      : ["Authentication details"];
  }, [auth.requiredFields, type]);

  if (type === "none") {
    return (
      <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
        No authentication required.
      </div>
    );
  }

  const updateCredential = (key, value) => {
    onCredentialsChange((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="tk-glass-card mt-4 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-white">
        <KeyRound size={15} strokeWidth={1.5} />
        Validate authentication
      </div>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        Credentials are used only for this validation request. Saved configuration stores validation status, not the secret value.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {requiredFields.map((field) => {
          const key =
            type === "api_key"
              ? "apiKey"
              : type === "bearer"
                ? "token"
                : type === "basic" && field.toLowerCase() === "username"
                  ? "username"
                  : type === "basic" && field.toLowerCase() === "password"
                    ? "password"
                    : sanitizeFieldKey(field);

          return (
            <input
              key={field}
              type={field.toLowerCase().includes("password") ? "password" : "text"}
              value={credentials[key] || ""}
              onChange={(event) => updateCredential(key, event.target.value)}
              placeholder={field}
              className="tk-glass-input h-10 rounded-2xl border border-white/10 bg-white/[0.03] px-3 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-white/20"
            />
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onValidate}
          disabled={busy}
          className="inline-flex h-10 items-center gap-2 rounded-2xl bg-white px-4 text-sm font-medium text-black transition-colors hover:bg-slate-200 disabled:bg-white/10 disabled:text-slate-500"
        >
          {busy ? (
            <Loader2 className="animate-spin" size={15} />
          ) : (
            <ShieldCheck size={15} strokeWidth={1.5} />
          )}
          Validate
        </button>

        {validation.message && (
          <span
            className={[
              "text-sm",
              validation.validated ? "text-emerald-300" : "text-slate-500",
            ].join(" ")}
          >
            {validation.message}
          </span>
        )}
      </div>
    </div>
  );
}

function DeploymentSection({ record, busy, onConnect }) {
  const connected = record?.status === "ready";
  const provisioning = record?.status === "provisioning";
  const choosingProject = record?.status === "project_selection";
  const needsAttention = record?.status === "needs_attention";
  const rawConnectionMessage = String(record?.lastValidationError || "");
  const connectionMessage =
    /missing or insufficient permissions|permission[_ -]denied/i.test(
      rawConnectionMessage
    )
      ? "Labor temporarily lost access to this cloud workspace. Reconnect to repair access; existing apps and data will be kept."
      : rawConnectionMessage;

  return (
    <section className="tk-settings-panel rounded-3xl p-5 sm:p-6">
      <div className="flex min-w-0 gap-3">
        <div className="tk-settings-icon grid size-10 shrink-0 place-items-center rounded-2xl text-white">
          <Cloud size={18} strokeWidth={1.5} />
        </div>
        <div>
          <h2 className="text-base font-medium text-white">Cloud</h2>
          <p className="mt-1 max-w-2xl text-sm font-light leading-6 text-slate-500">
            Connect the cloud account Labor can use for hosting, data, authentication, storage, and releases.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        {deployTargets.map((target) => {
          const isGoogle = target.id === "google_cloud";
          return (
            <button
              key={target.id}
              type="button"
              disabled={!target.active || busy}
              onClick={isGoogle ? onConnect : undefined}
              className={[
                "tk-settings-cloud-card min-h-32 rounded-2xl p-4 text-left transition",
                target.active
                  ? "text-white hover:-translate-y-0.5"
                  : "cursor-not-allowed text-slate-600 opacity-55",
                isGoogle && connected ? "tk-settings-cloud-card--connected" : "",
                isGoogle && needsAttention ? "tk-settings-cloud-card--attention" : "",
              ].join(" ")}
            >
              <span className="flex items-start justify-between gap-2">
                <span className="grid size-8 place-items-center rounded-full bg-white">
                  {isGoogle ? (
                    <img
                      src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                      alt=""
                      className="size-4"
                    />
                  ) : (
                    <Lock size={13} className="text-slate-600" />
                  )}
                </span>
                {isGoogle ? (
                  <span
                    className={[
                      "rounded-full border px-2 py-1 text-[9px] font-semibold uppercase",
                      connected
                        ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-200"
                        : needsAttention
                          ? "border-amber-300/20 bg-amber-300/10 text-amber-100"
                          : "border-white/[0.08] text-slate-500",
                    ].join(" ")}
                  >
                    {connected
                      ? "Ready"
                      : provisioning
                        ? "Setting up"
                        : choosingProject
                          ? "Choose project"
                      : needsAttention
                        ? "Needs attention"
                        : "Connect"}
                  </span>
                ) : null}
              </span>
              <span className="mt-4 block text-sm font-medium">{target.label}</span>
              <span className="mt-1 block line-clamp-3 text-xs font-light leading-5 text-slate-500">
                {isGoogle && connected
                  ? `${record.selectedProjectId || record.defaultProjectId || "Cloud"} | ${
                      record.connectedEmail || "Connected account"
                    }`
                  : isGoogle && provisioning
                    ? `${cloudStageLabel(record.provisioningStage)} in ${
                        record.selectedProjectId || "your project"
                      }`
                    : isGoogle && choosingProject
                      ? "Google Cloud is connected. Choose where Labor should run."
                  : isGoogle && needsAttention
                    ? connectionMessage
                    : target.description}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function GoogleCloudConnectModal({
  open,
  record,
  busy,
  error,
  selectedProject,
  onClose,
  onConnect,
  onProjectChange,
  onProvision,
}) {
  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [busy, onClose, open]);

  if (!open || typeof document === "undefined") return null;

  const needsAttention = record?.status === "needs_attention";
  const ready = record?.status === "ready";
  const provisioning = record?.status === "provisioning";
  const projects = (Array.isArray(record?.projects) ? record.projects : []).filter(
    (project) => project.deploymentReady
  );
  const canChooseProject =
    Boolean(record?.accessTokenStored) && projects.length > 0 && !provisioning;
  const message = error || record?.lastValidationError || "";

  return createPortal(
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-[#03050a]/80 p-4 backdrop-blur-md"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="google-cloud-connect-title"
        className="tk-settings-modal relative w-full max-w-lg overflow-hidden rounded-[30px] p-6 text-center text-white sm:p-8"
      >
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label="Close Google Cloud connection"
          className="absolute right-4 top-4 grid size-9 place-items-center rounded-full border border-white/[0.09] bg-black/20 text-slate-400 transition hover:bg-white/[0.08] hover:text-white disabled:opacity-40"
        >
          <X size={15} />
        </button>

        <p className="text-[10px] font-semibold uppercase text-slate-500">
          Cloud
        </p>
        <h2 id="google-cloud-connect-title" className="mt-2 text-2xl font-semibold">
          Connect to your cloud
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
          Choose the Google Cloud project where Labor should build, deploy, and manage your software.
        </p>

        <div className="mx-auto mt-8 grid size-20 place-items-center rounded-full bg-white shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
          <img
            src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
            alt="Google"
            className="size-10"
          />
        </div>
        <div className="mt-4 text-base font-semibold">Google Cloud</div>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-slate-500">
          Labor creates or validates Firebase, storage, IAM, Hosting, and its core functions in that project.
        </p>

        {canChooseProject ? (
          <label className="mx-auto mt-6 block max-w-sm text-left">
            <span className="mb-2 block text-[10px] font-semibold uppercase text-slate-500">
              Google Cloud project
            </span>
            <select
              value={selectedProject}
              onChange={(event) => onProjectChange(event.target.value)}
              disabled={busy}
              className="tk-glass-input h-11 w-full appearance-none rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-sm text-slate-200 outline-none transition focus:border-violet-300/35 disabled:opacity-50"
            >
              <option value="">Choose a project</option>
              {projects.map((project) => (
                <option key={project.projectId} value={project.projectId}>
                  {project.displayName
                    ? `${project.displayName} (${project.projectId})`
                    : project.projectId}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {provisioning ? (
          <div className="mx-auto mt-6 max-w-sm rounded-2xl border border-violet-300/15 bg-violet-300/[0.06] px-4 py-3 text-left">
            <div className="flex items-center gap-2 text-sm font-medium text-violet-100">
              <Loader2 size={14} className="animate-spin" />
              {cloudStageLabel(record?.provisioningStage)}
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Setup continues in Google Cloud. You can close this window.
            </p>
          </div>
        ) : null}

        {ready && !canChooseProject ? (
          <div className="mx-auto mt-6 max-w-sm rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.06] px-4 py-3 text-sm text-emerald-100">
            {record.selectedProjectId || record.defaultProjectId} is ready.
          </div>
        ) : null}

        {message ? (
          <div className="mx-auto mt-5 flex max-w-sm items-start gap-2 rounded-2xl border border-amber-300/15 bg-amber-300/[0.07] px-3 py-2.5 text-left text-xs leading-5 text-amber-100">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>{message}</span>
          </div>
        ) : null}

        <button
          type="button"
          onClick={canChooseProject ? onProvision : onConnect}
          disabled={busy || provisioning || (canChooseProject && !selectedProject)}
          className="mt-7 inline-flex h-11 min-w-32 items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-black transition hover:bg-slate-200 disabled:bg-white/10 disabled:text-slate-500"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Cloud size={15} />}
          {busy
            ? canChooseProject
              ? "Starting setup..."
              : "Checking..."
            : provisioning
              ? "Setting up..."
              : canChooseProject
                ? "Set up this project"
                : ready || needsAttention
                  ? "Connect again"
                  : "Connect"}
        </button>

        {canChooseProject ? (
          <button
            type="button"
            onClick={onConnect}
            disabled={busy}
            className="mt-3 block w-full text-xs font-semibold text-slate-500 transition hover:text-white disabled:opacity-40"
          >
            Use another Google account
          </button>
        ) : null}

        <p className="mt-7 text-xs text-slate-600">
          AWS and Microsoft Azure are coming soon.
        </p>
      </section>
    </div>,
    document.body
  );
}

export default Configurations;
