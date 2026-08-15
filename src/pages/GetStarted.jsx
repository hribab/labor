import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Cloud,
  Github,
  KeyRound,
  Loader2,
  X,
} from "lucide-react";
import {
  doc,
  onSnapshot,
} from "firebase/firestore";

import {
  callGoogleCloudProvisioningStatus,
  callCompleteOnboarding,
  callProvisionGoogleCloudProject,
  callSaveGoogleCloudConnection,
  callSaveOpenAiConfiguration,
} from "../lib/agent";
import { controlDb as db } from "../lib/firebase";
import {
  isGoogleCloudServiceEnableFailure,
  isRecoverableGoogleCloudProvisioningFailure,
  requestGoogleCloudAccess,
} from "../lib/googleCloud";
import {
  LABOR_DATA_ROOT_COLLECTION as ROOT_COLLECTION,
  LABOR_GITHUB_URL,
} from "../lib/laborBrand";
import LaborLogo from "../components/LaborLogo";
import "../styles/get-started.css";

const CONFIG_COLLECTION = "Configurations";

function isPermissionMessage(value) {
  return /missing or insufficient permissions|permission[_ -]denied/i.test(
    String(value || "")
  );
}

function setupErrorMessage(value, fallback) {
  if (isPermissionMessage(value)) {
    return "Labor temporarily lost access to your cloud workspace. Restore access to continue; your existing apps, data, and releases will be kept.";
  }
  if (/EMAIL_EXISTS/i.test(String(value || ""))) {
    return "Labor found your existing account in this cloud project but could not reopen its session. Try Start building again; nothing will be recreated.";
  }
  return String(value || fallback);
}

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

function GetStarted({ identity, userDocId, onComplete }) {
  const [activeCard, setActiveCard] = useState("");
  const [keyEntryOpen, setKeyEntryOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [modelReady, setModelReady] = useState(false);
  const [cloudReady, setCloudReady] = useState(false);
  const [cloudStatus, setCloudStatus] = useState("required");
  const [cloudAttention, setCloudAttention] = useState("");
  const [cloudProjects, setCloudProjects] = useState([]);
  const [selectedCloudProject, setSelectedCloudProject] = useState("");
  const [cloudProvisioningStage, setCloudProvisioningStage] = useState("");
  const [cloudAttentionCode, setCloudAttentionCode] = useState("");
  const [cloudAccessTokenStored, setCloudAccessTokenStored] = useState(false);
  const [cloudTokenExpiresAtMs, setCloudTokenExpiresAtMs] = useState(0);
  const [cloudServiceAccountEmail, setCloudServiceAccountEmail] = useState("");
  const [maskedKey, setMaskedKey] = useState("");
  const [checking, setChecking] = useState(false);
  const [cloudConnecting, setCloudConnecting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [workspaceRecoveryNeeded, setWorkspaceRecoveryNeeded] = useState(false);
  const inputRef = useRef(null);
  const cloudAutoResumeRef = useRef("");

  useEffect(() => {
    if (!identity.email || !userDocId) return undefined;

    return onSnapshot(
      doc(db, ROOT_COLLECTION, userDocId, CONFIG_COLLECTION, "llmModels"),
      (snapshot) => {
        const openAi = snapshot.data()?.models?.openai || {};
        const validated = Boolean(
          openAi.enabled &&
            openAi.apiKey &&
            openAi.validationStatus === "valid" &&
            openAi.validatedAtMs
        );
        setModelReady(validated);
        setMaskedKey(validated ? String(openAi.maskedKey || "") : "");
      },
      (snapshotError) => {
        setWorkspaceRecoveryNeeded(isPermissionMessage(snapshotError?.message));
        setError(
          setupErrorMessage(snapshotError?.message, "Could not read model setup.")
        );
      }
    );
  }, [identity.email, userDocId]);

  useEffect(() => {
    if (!identity.email || !userDocId) return undefined;

    return onSnapshot(
      doc(db, ROOT_COLLECTION, userDocId, CONFIG_COLLECTION, "googleCloud"),
      (snapshot) => {
        const connection = snapshot.exists() ? snapshot.data() || {} : {};
        const expired =
          connection.status !== "ready" &&
          Number(connection.estimatedExpiresAtMs || 0) > 0 &&
          Number(connection.estimatedExpiresAtMs) <= Date.now();
        const ready = connection.status === "ready";
        setCloudReady(ready);
        setCloudStatus(expired ? "needs_attention" : connection.status || "required");
        setCloudProjects(
          Array.isArray(connection.projects) ? connection.projects : []
        );
        setSelectedCloudProject(
          String(
            connection.selectedProjectId || connection.defaultProjectId || ""
          )
        );
        setCloudProvisioningStage(
          String(connection.provisioningStage || "")
        );
        setCloudAttentionCode(String(connection.attentionCode || ""));
        setCloudAccessTokenStored(Boolean(connection.accessTokenStored));
        setCloudTokenExpiresAtMs(
          Number(connection.estimatedExpiresAtMs || 0)
        );
        setCloudServiceAccountEmail(
          String(connection.serviceAccountEmail || "")
        );
        setCloudAttention(
          expired
            ? "Google Cloud access expired. Connect again to continue."
            : String(connection.lastValidationError || "")
        );
      },
      (snapshotError) => {
        setWorkspaceRecoveryNeeded(isPermissionMessage(snapshotError?.message));
        setError(
          setupErrorMessage(snapshotError?.message, "Could not read cloud setup.")
        );
      }
    );
  }, [identity.email, userDocId]);

  useEffect(() => {
    if (cloudStatus !== "provisioning" || !identity.email || !userDocId) {
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
        setCloudStatus(result.status || "provisioning");
        setCloudProvisioningStage(result.provisioningStage || "");
        if (result.ready) {
          setCloudReady(true);
          setCloudAttention("");
          setActiveCard("");
          setNotice(
            `Google Cloud is ready${
              result.selectedProjectId ? ` in ${result.selectedProjectId}` : ""
            }.`
          );
        } else if (result.status === "needs_attention") {
          setCloudReady(false);
          setCloudAttention(result.error || "Google Cloud needs attention.");
          setError(result.error || "Google Cloud needs attention.");
        }
      } catch (statusError) {
        if (active) {
          setCloudAttention(
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
  }, [cloudStatus, identity.email, userDocId]);

  useEffect(() => {
    if (!keyEntryOpen) return;
    inputRef.current?.focus();
  }, [keyEntryOpen]);

  const openModelCard = useCallback(() => {
    setActiveCard("model");
    setKeyEntryOpen(false);
    setApiKey("");
    setError("");
    setNotice("");
  }, []);

  const openCloudCard = useCallback(() => {
    setActiveCard("cloud");
    setKeyEntryOpen(false);
    setApiKey("");
    setError("");
    setNotice("");
  }, []);

  const closeActiveCard = useCallback(() => {
    if (checking || cloudConnecting) return;
    setActiveCard("");
    setKeyEntryOpen(false);
    setApiKey("");
    setError("");
  }, [checking, cloudConnecting]);

  const checkOpenAiKey = useCallback(
    async (event) => {
      event.preventDefault();
      const key = apiKey.trim();
      if (!key || checking) return;

      setChecking(true);
      setError("");
      setNotice("");

      try {
        const result = await callSaveOpenAiConfiguration({
          email: identity.email,
          userDocId,
          apiKey: key,
        });

        setModelReady(true);
        setMaskedKey(result.maskedKey || "");
        setApiKey("");
        setKeyEntryOpen(false);
        setActiveCard("");
        setNotice("Success. OpenAI is connected.");
      } catch (validationError) {
        setError(
          validationError.message || "OpenAI could not validate this API key."
        );
      } finally {
        setChecking(false);
      }
    },
    [apiKey, checking, identity.email, userDocId]
  );

  const connectGoogleCloud = useCallback(async () => {
    if (cloudConnecting) return;

    setCloudConnecting(true);
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
        setCloudReady(false);
        setCloudStatus("needs_attention");
        setCloudAttention(result.error || "Google Cloud needs attention.");
        setError(result.error || "Google Cloud needs attention.");
        return;
      }

      const projects = Array.isArray(result.projects) ? result.projects : [];
      setCloudProjects(projects);
      setSelectedCloudProject(
        result.selectedProjectId ||
          projects.find((project) => project.deploymentReady)?.projectId ||
          ""
      );
      setCloudReady(false);
      setCloudStatus(result.status || "project_selection");
      setCloudProvisioningStage("select_project");
      setCloudAttention("");
      setNotice(
        projects.length > 1
          ? "Google Cloud connected. Choose the project Labor should prepare."
          : "Google Cloud connected. Confirm the project to begin setup."
      );
    } catch (connectionError) {
      setError(
        connectionError.message ||
          "Google Cloud permission was not granted. Try again."
      );
    } finally {
      setCloudConnecting(false);
    }
  }, [cloudConnecting, identity.email, userDocId]);

  const provisionGoogleCloud = useCallback(async () => {
    if (cloudConnecting || !selectedCloudProject) return;

    setCloudConnecting(true);
    setError("");
    setCloudAttention("");
    setNotice("");
    setCloudStatus("provisioning");
    setCloudProvisioningStage("enabling_apis");

    try {
      const result = await callProvisionGoogleCloudProject({
        email: identity.email,
        userDocId,
        projectId: selectedCloudProject,
      });
      setCloudStatus(result.status || "provisioning");
      setCloudProvisioningStage(result.provisioningStage || "");
      if (!result.connected || result.status === "needs_attention") {
        setCloudReady(false);
        setCloudAttention(result.error || "Google Cloud needs attention.");
        setError(result.error || "Google Cloud needs attention.");
        return;
      }
      if (result.ready) {
        setCloudReady(true);
        setActiveCard("");
        setNotice(`Google Cloud is ready in ${selectedCloudProject}.`);
        return;
      }
      setNotice(
        `Google Cloud is preparing ${selectedCloudProject}. Core functions are deploying now.`
      );
    } catch (provisionError) {
      setCloudStatus("needs_attention");
      setCloudAttention(
        provisionError.message || "Google Cloud setup could not start."
      );
      setError(provisionError.message || "Google Cloud setup could not start.");
    } finally {
      setCloudConnecting(false);
    }
  }, [
    cloudConnecting,
    identity.email,
    selectedCloudProject,
    userDocId,
  ]);

  useEffect(() => {
    const recoverable =
      cloudStatus === "needs_attention" &&
      isRecoverableGoogleCloudProvisioningFailure(
        cloudAttentionCode,
        cloudAttention
      ) &&
      ((cloudAccessTokenStored && cloudTokenExpiresAtMs > Date.now()) ||
        (cloudAttentionCode === "core_functions_deployment_failed" &&
          cloudServiceAccountEmail &&
          !isGoogleCloudServiceEnableFailure(cloudAttention))) &&
      selectedCloudProject;
    const resumeKey = recoverable
      ? `${selectedCloudProject}:${cloudAttentionCode}:${cloudTokenExpiresAtMs}`
      : "";
    if (!resumeKey || cloudAutoResumeRef.current === resumeKey) return;
    cloudAutoResumeRef.current = resumeKey;
    void provisionGoogleCloud();
  }, [
    cloudAccessTokenStored,
    cloudAttention,
    cloudAttentionCode,
    cloudStatus,
    cloudTokenExpiresAtMs,
    cloudServiceAccountEmail,
    provisionGoogleCloud,
    selectedCloudProject,
  ]);

  const finishOnboarding = useCallback(async () => {
    if (!modelReady || !cloudReady || finishing) return;

    setFinishing(true);
    setError("");
    setWorkspaceRecoveryNeeded(false);

    try {
      await callCompleteOnboarding({
        email: identity.email,
        userDocId,
      });

      await onComplete?.();
    } catch (finishError) {
      const permissionFailure = isPermissionMessage(finishError?.message);
      setWorkspaceRecoveryNeeded(permissionFailure);
      setError(
        setupErrorMessage(finishError?.message, "Could not finish setup.")
      );
    } finally {
      setFinishing(false);
    }
  }, [
    cloudReady,
    finishing,
    identity.email,
    identity.uid,
    modelReady,
    onComplete,
    userDocId,
  ]);

  const modelExpanded = activeCard === "model";
  const cloudExpanded = activeCard === "cloud";
  const cloudNeedsAttention = cloudStatus === "needs_attention";
  const cloudProvisioning = cloudStatus === "provisioning";
  const selectableCloudProjects = cloudProjects.filter(
    (project) => project.deploymentReady
  );
  const cloudCanProvision =
    cloudStatus === "project_selection" && selectableCloudProjects.length > 0;

  return (
    <div className="tk-getstarted tk-page-surface tk-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-8 text-white sm:px-8 sm:py-10">
      <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col items-center justify-center py-8 sm:py-12">
        <header className="text-center">
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-xs text-slate-400">
            <span className="inline-flex items-center gap-1.5 font-semibold text-white">
              <LaborLogo
                decorative
                className="size-5 object-contain drop-shadow-[0_0_8px_rgba(255,38,54,0.25)]"
              />
              Labor
            </span>
            <a
              href={LABOR_GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 font-medium text-slate-300 transition hover:border-white/20 hover:text-white"
            >
              <Github size={12} strokeWidth={1.7} />
              Open source · Free forever
            </a>
            <span>Coding agent that builds, deploys, and manages releases.</span>
          </div>
          <h1 className="mt-7 max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">
            Bring your favorite model.
            <span className="mt-1 block text-slate-400">Connect your cloud.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-sm leading-6 text-slate-500 sm:text-base">
            Give Labor the intelligence and cloud access it needs to build.
          </p>
        </header>

        <section
          aria-label="Get started configuration"
          className={[
            "mt-10 w-full",
            modelExpanded || cloudExpanded ? "max-w-2xl" : "max-w-3xl",
          ].join(" ")}
        >
          {modelExpanded ? (
            <article className="tk-getstarted-card tk-getstarted-card--expanded px-5 py-6 sm:px-8 sm:py-7">
              <div className="relative z-10 flex h-full min-h-[360px] flex-col">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase text-slate-500">
                      Model
                    </p>
                    <h2 className="mt-1 text-lg font-semibold text-white">
                      Configure LLM Model
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={closeActiveCard}
                    disabled={checking}
                    aria-label="Close model configuration"
                    className="grid size-9 place-items-center rounded-full border border-white/10 bg-black/15 text-slate-400 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
                  <div className="tk-openai-mark grid size-20 place-items-center rounded-full bg-white shadow-[0_18px_45px_rgba(0,0,0,0.28)]">
                    <img
                      src="/assets/openai-blossom.svg"
                      alt="OpenAI"
                      className="size-11"
                    />
                  </div>
                  <div className="mt-4 text-base font-semibold">OpenAI</div>
                  <p className="mt-1 text-xs text-slate-500">
                    Your key is checked securely before it is saved.
                  </p>

                  {!keyEntryOpen ? (
                    <button
                      type="button"
                      onClick={() => {
                        setKeyEntryOpen(true);
                        setError("");
                      }}
                      className="mt-7 inline-flex h-10 items-center gap-2 rounded-full border border-white/15 bg-white/[0.07] px-4 text-sm font-semibold text-white transition hover:bg-white/[0.12]"
                    >
                      <KeyRound size={14} />
                      Enter API Key
                    </button>
                  ) : (
                    <form
                      onSubmit={checkOpenAiKey}
                      className="mt-7 w-full max-w-md"
                    >
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] overflow-hidden rounded-xl border border-white/15 bg-black/20 focus-within:border-violet-300/45 focus-within:ring-4 focus-within:ring-violet-300/10">
                        <label htmlFor="openai-api-key" className="sr-only">
                          OpenAI API key
                        </label>
                        <input
                          ref={inputRef}
                          id="openai-api-key"
                          type="password"
                          value={apiKey}
                          onChange={(event) => setApiKey(event.target.value)}
                          placeholder="Enter your API Key"
                          autoComplete="off"
                          spellCheck="false"
                          disabled={checking}
                          className="min-w-0 bg-transparent px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 disabled:opacity-50"
                        />
                        <button
                          type="submit"
                          disabled={!apiKey.trim() || checking}
                          className="inline-flex min-w-20 items-center justify-center gap-2 border-l border-white/10 bg-white px-4 text-sm font-semibold text-black transition hover:bg-slate-200 disabled:bg-white/10 disabled:text-slate-600"
                        >
                          {checking ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Check size={14} />
                          )}
                          Check
                        </button>
                      </div>
                    </form>
                  )}

                  {error ? (
                    <p role="alert" className="mt-4 max-w-md text-sm text-red-300">
                      {error}
                    </p>
                  ) : null}
                </div>
              </div>
            </article>
          ) : cloudExpanded ? (
            <article className="tk-getstarted-card tk-getstarted-card--expanded px-5 py-6 sm:px-8 sm:py-7">
              <div className="relative z-10 flex h-full min-h-[360px] flex-col">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase text-slate-500">
                      Cloud
                    </p>
                    <h2 className="mt-1 text-lg font-semibold text-white">
                      Connect to your cloud
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={closeActiveCard}
                    disabled={cloudConnecting}
                    aria-label="Close cloud configuration"
                    className="grid size-9 place-items-center rounded-full border border-white/10 bg-black/15 text-slate-400 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
                  <div className="tk-openai-mark grid size-20 place-items-center rounded-full bg-white shadow-[0_18px_45px_rgba(0,0,0,0.28)]">
                    <img
                      src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                      alt="Google"
                      className="size-10"
                    />
                  </div>
                  <div className="mt-4 text-base font-semibold">Google Cloud</div>
                  <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">
                    Labor creates the missing Firebase services and deploys its core functions into the project you choose.
                  </p>
                  <p className="mt-2 max-w-sm text-[11px] leading-5 text-slate-600">
                    Google approval is used during setup. Afterward, Labor uses
                    renewable keyless access. Reconnecting validates and repairs
                    the same project; it does not delete or recreate your apps.
                  </p>

                  {cloudCanProvision ? (
                    <label className="mt-6 block w-full max-w-sm text-left">
                      <span className="mb-2 block text-[10px] font-semibold uppercase text-slate-500">
                        Google Cloud project
                      </span>
                      <select
                        value={selectedCloudProject}
                        onChange={(event) =>
                          setSelectedCloudProject(event.target.value)
                        }
                        disabled={cloudConnecting || cloudProvisioning}
                        className="h-11 w-full rounded-xl border border-white/15 bg-black/30 px-3 text-sm text-white outline-none transition focus:border-violet-300/50 focus:ring-4 focus:ring-violet-300/10 disabled:opacity-50"
                      >
                        {selectableCloudProjects.map((project) => (
                          <option key={project.projectId} value={project.projectId}>
                            {project.displayName || project.projectId} ({project.projectId})
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  <button
                    type="button"
                    onClick={
                      cloudCanProvision ? provisionGoogleCloud : connectGoogleCloud
                    }
                    disabled={
                      cloudConnecting ||
                      cloudProvisioning ||
                      (cloudCanProvision && !selectedCloudProject)
                    }
                    className="mt-7 inline-flex h-10 items-center gap-2 rounded-full border border-white/15 bg-white px-5 text-sm font-semibold text-black transition hover:bg-slate-200 disabled:bg-white/10 disabled:text-slate-500"
                  >
                    {cloudConnecting || cloudProvisioning ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Cloud size={14} />
                    )}
                    {cloudConnecting || cloudProvisioning
                      ? cloudStageLabel(cloudProvisioningStage)
                      : cloudCanProvision
                        ? "Set up this project"
                      : cloudReady
                        ? "Connect another project"
                      : cloudNeedsAttention
                        ? "Connect again"
                        : "Connect"}
                  </button>

                  {cloudCanProvision && !cloudProvisioning ? (
                    <button
                      type="button"
                      onClick={connectGoogleCloud}
                      disabled={cloudConnecting}
                      className="mt-3 text-xs font-semibold text-slate-500 transition hover:text-white disabled:opacity-40"
                    >
                      Use another Google account
                    </button>
                  ) : null}

                  {cloudProvisioning ? (
                    <p role="status" className="mt-4 max-w-md text-sm text-violet-100">
                      {cloudStageLabel(cloudProvisioningStage)}. You can leave this page; setup continues in Google Cloud.
                    </p>
                  ) : null}

                  {!error && !cloudAttention && notice ? (
                    <p role="status" className="mt-4 max-w-md text-sm text-emerald-200">
                      {notice}
                    </p>
                  ) : null}

                  {error || cloudAttention ? (
                    <p role="alert" className="mt-4 max-w-md text-sm text-red-300">
                      {error || cloudAttention}
                    </p>
                  ) : null}
                </div>
              </div>
            </article>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={openModelCard}
                className={[
                  "tk-getstarted-card group min-h-[270px] p-6 text-left sm:p-7",
                  modelReady ? "tk-getstarted-card--ready" : "",
                ].join(" ")}
              >
                <span className="relative z-10 flex h-full min-h-[218px] flex-col">
                  <span className="flex items-start justify-between gap-4">
                    <span className="grid size-11 place-items-center rounded-full border border-white/10 bg-black/15 text-slate-200">
                      {modelReady ? <CheckCircle2 size={20} /> : <KeyRound size={20} />}
                    </span>
                    <span
                      className={[
                        "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase",
                        modelReady
                          ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-200"
                          : "border-white/10 bg-white/[0.04] text-slate-500",
                      ].join(" ")}
                    >
                      {modelReady ? "Connected" : "Required"}
                    </span>
                  </span>
                  <span className="mt-auto block">
                    <span className="block text-2xl font-semibold text-white">Model</span>
                    <span className="mt-2 block line-clamp-3 text-sm leading-6 text-slate-400">
                      {modelReady
                        ? `OpenAI ${maskedKey || "is ready"}`
                        : "Connect the model Labor will use to think and build."}
                    </span>
                    <span className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-slate-200">
                      {modelReady ? "Review" : "Configure"}
                      <ArrowRight
                        size={14}
                        className="transition-transform group-hover:translate-x-0.5"
                      />
                    </span>
                  </span>
                </span>
              </button>

              <button
                type="button"
                onClick={openCloudCard}
                className={[
                  "tk-getstarted-card group min-h-[270px] p-6 text-left sm:p-7",
                  cloudReady ? "tk-getstarted-card--ready" : "",
                  cloudNeedsAttention ? "tk-getstarted-card--attention" : "",
                ].join(" ")}
              >
                <span className="relative z-10 flex h-full min-h-[218px] flex-col">
                  <span className="flex items-start justify-between gap-4">
                    <span className="grid size-11 place-items-center rounded-full border border-white/10 bg-black/15 text-slate-200">
                      {cloudReady ? <CheckCircle2 size={20} /> : <Cloud size={20} />}
                    </span>
                    <span
                      className={[
                        "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase",
                        cloudReady
                          ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-200"
                          : cloudNeedsAttention
                            ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
                          : "border-white/10 bg-white/[0.04] text-slate-500",
                      ].join(" ")}
                    >
                      {cloudReady
                        ? "Connected"
                        : cloudNeedsAttention
                          ? "Needs attention"
                          : "Required"}
                    </span>
                  </span>
                  <span className="mt-auto block">
                    <span className="block text-2xl font-semibold text-white">Cloud</span>
                    <span className="mt-2 block line-clamp-3 text-sm leading-6 text-slate-400">
                      {cloudReady
                        ? `${selectedCloudProject || "Google Cloud"} is fully provisioned.`
                        : cloudProvisioning
                          ? cloudStageLabel(cloudProvisioningStage)
                        : cloudNeedsAttention
                          ? cloudAttention || "Reconnect Google Cloud to continue."
                        : cloudProjects.length
                          ? "Choose the project Labor should initialize."
                          : "Connect the Google Cloud account Labor can use."}
                    </span>
                    <span className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-slate-500">
                      {cloudReady
                        ? "Review"
                        : cloudProvisioning
                          ? "Setting up"
                        : cloudNeedsAttention
                          ? "Fix connection"
                          : "Connect"}
                      <ArrowRight
                        size={14}
                        className="transition-transform group-hover:translate-x-0.5"
                      />
                    </span>
                  </span>
                </span>
              </button>
            </div>
          )}

          <div className="mt-5 min-h-16 text-center">
            {modelExpanded ? (
              <p className="text-xs text-slate-500">
                Anthropic and Kimi V3 are coming soon.
              </p>
            ) : null}

            {cloudExpanded ? (
              <p className="text-xs text-slate-500">
                AWS and Microsoft Azure are coming soon.
              </p>
            ) : null}

            {!modelExpanded && !cloudExpanded && notice ? (
              <p role="status" className="text-sm font-medium text-emerald-200">
                {notice}
              </p>
            ) : null}

            {!modelExpanded && !cloudExpanded && error ? (
              <div role="alert" className="flex flex-col items-center gap-3">
                <p className="max-w-xl text-sm text-red-300">{error}</p>
                {workspaceRecoveryNeeded ? (
                  <button
                    type="button"
                    onClick={finishOnboarding}
                    disabled={finishing}
                    className="inline-flex h-9 items-center gap-2 rounded-full border border-white/15 bg-white/[0.08] px-4 text-xs font-semibold text-white transition hover:bg-white/[0.14] disabled:opacity-50"
                  >
                    {finishing ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Cloud size={14} />
                    )}
                    Restore access
                  </button>
                ) : null}
              </div>
            ) : null}

            {!modelExpanded && !cloudExpanded && modelReady && cloudReady ? (
              <button
                type="button"
                onClick={finishOnboarding}
                disabled={finishing}
                className="mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-black transition hover:bg-slate-200 disabled:bg-white/20 disabled:text-slate-500"
              >
                {finishing ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <ArrowRight size={15} />
                )}
                Start building
              </button>
            ) : null}

            {!modelExpanded &&
            !cloudExpanded &&
            (!modelReady || !cloudReady) ? (
              <p className="mt-4 text-xs text-slate-600">
                Connect your model and cloud to continue.
              </p>
            ) : null}
          </div>
        </section>

        <a
          href={LABOR_GITHUB_URL}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-slate-600 transition hover:text-white"
        >
          <Github size={13} strokeWidth={1.7} />
          View Labor on GitHub
        </a>
      </div>
    </div>
  );
}

export default GetStarted;
