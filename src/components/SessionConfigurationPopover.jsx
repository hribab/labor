import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, onSnapshot } from "firebase/firestore";
import {
  CheckCircle2,
  ChevronRight,
  Cloud,
  Cpu,
  KeyRound,
  Loader2,
  Maximize2,
  Minimize2,
  Palette,
  PencilLine,
  Save,
  SlidersHorizontal,
  X,
} from "lucide-react";

import { db, userFacingFirebaseError } from "../lib/firebase";
import { callLaborAgent } from "../lib/agent";
import { LABOR_DATA_ROOT_COLLECTION as ROOT_COLLECTION } from "../lib/laborBrand";

const RUN_COLLECTION = "runs";
const CONFIG_COLLECTION = "Configurations";
const MODEL_ORDER = ["openai", "anthropic", "gemini", "x", "deepseek"];

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function readContractText(api) {
  return String(
    api?.record?.rawApiContractText ||
      api?.record?.apiContract?.sampleCurl ||
      api?.providerRecommendation?.sampleCurl ||
      api?.examples?.[0] ||
      ""
  );
}

function fieldPreview(api, field) {
  const metadataFields = Array.isArray(api?.metadata?.credentialFields)
    ? api.metadata.credentialFields
    : [];
  const savedFields = Array.isArray(api?.record?.credentialFields)
    ? api.record.credentialFields
    : [];
  const metadata = metadataFields.find(
    (item) => item?.fieldName === field?.fieldName
  );
  const saved = savedFields.find(
    (item) => item?.fieldName === field?.fieldName
  );

  return {
    saved: Boolean(
      metadata?.saved ||
        saved?.saved ||
        api?.record?.credentials?.[field?.fieldName]
    ),
    valuePreview: String(metadata?.valuePreview || ""),
  };
}

function mergeSessionApis(runData, serviceRecords) {
  const required = Array.isArray(runData?.requiredThirdPartyApis)
    ? runData.requiredThirdPartyApis
    : [];
  const metadataByService = asObject(runData?.thirdPartyApiCredentialMetadata);
  const statusByService = new Map(
    (Array.isArray(runData?.thirdPartyCredentialStatus?.services)
      ? runData.thirdPartyCredentialStatus.services
      : []
    ).map((service) => [service?.serviceId, service])
  );
  const fallbackByService = asObject(runData?.thirdPartyLlmFallbacks);
  const apiById = new Map();

  required.forEach((api) => {
    const serviceId = String(api?.serviceId || "").trim();
    if (serviceId) apiById.set(serviceId, { ...api, serviceId });
  });

  Object.entries(serviceRecords).forEach(([serviceId, record]) => {
    apiById.set(serviceId, {
      ...record,
      ...(apiById.get(serviceId) || {}),
      serviceId,
    });
  });

  return Array.from(apiById.values()).map((api) => {
    const serviceId = api.serviceId;
    const record = serviceRecords[serviceId] || {};
    const metadata = metadataByService[serviceId] || {};
    const status = statusByService.get(serviceId) || {};
    const fallback = Boolean(
      fallbackByService[serviceId]?.enabled ||
        record?.useLlmFallback ||
        record?.llmFallback?.enabled ||
        status?.llmFallback
    );
    const credentialFields = Array.isArray(api?.credentialFields)
      ? api.credentialFields
      : Array.isArray(record?.credentialFields)
        ? record.credentialFields
        : [];
    const credentialsSaved = credentialFields.length
      ? credentialFields
          .filter((field) => field?.required !== false)
          .every((field) => fieldPreview({ record, metadata }, field).saved)
      : Boolean(record?.validation?.validated);

    return {
      ...api,
      serviceName: String(api?.serviceName || record?.serviceName || serviceId),
      credentialFields,
      providerRecommendation:
        api?.providerRecommendation || record?.providerRecommendation || {},
      record,
      metadata,
      fallback,
      configured: fallback || Boolean(status?.saved) || credentialsSaved,
    };
  });
}

function SessionConfigurationPopover({
  activeRunId,
  messageId,
  sidebarOpen,
  userDocId,
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [profileConfig, setProfileConfig] = useState({});
  const [runData, setRunData] = useState({});
  const [serviceRecords, setServiceRecords] = useState({});
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [drafts, setDrafts] = useState({});
  const [savingServiceId, setSavingServiceId] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const containerRef = useRef(null);

  useEffect(() => {
    if (!userDocId) {
      setProfileConfig({});
      return undefined;
    }

    setProfileConfig({});

    const unsubscribers = ["llmModels", "deployment", "stylePreset"].map(
      (configurationId) =>
        onSnapshot(
          doc(
            db,
            ROOT_COLLECTION,
            userDocId,
            CONFIG_COLLECTION,
            configurationId
          ),
          (snapshot) => {
            setProfileConfig((current) => ({
              ...current,
              [configurationId]: snapshot.exists()
                ? snapshot.data() || {}
                : null,
            }));
          },
          (snapshotError) => setError(userFacingFirebaseError(snapshotError))
        )
    );

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [userDocId]);

  useEffect(() => {
    setSelectedServiceId("");
    setDrafts({});
    setNotice("");
    setError("");

    if (!userDocId || !activeRunId) {
      setRunData({});
      setServiceRecords({});
      return undefined;
    }

    const runRef = doc(
      db,
      ROOT_COLLECTION,
      userDocId,
      RUN_COLLECTION,
      activeRunId
    );
    const unsubscribeRun = onSnapshot(
      runRef,
      (snapshot) => setRunData(snapshot.exists() ? snapshot.data() || {} : {}),
      (snapshotError) => setError(userFacingFirebaseError(snapshotError))
    );
    const unsubscribeApis = onSnapshot(
      collection(runRef, "thirdPartyApiCredentials"),
      (snapshot) => {
        const records = {};
        snapshot.docs.forEach((serviceDoc) => {
          records[serviceDoc.id] = {
            id: serviceDoc.id,
            ...(serviceDoc.data() || {}),
          };
        });
        setServiceRecords(records);
      },
      (snapshotError) => setError(userFacingFirebaseError(snapshotError))
    );

    return () => {
      unsubscribeRun();
      unsubscribeApis();
    };
  }, [activeRunId, userDocId]);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const sessionApis = useMemo(
    () => mergeSessionApis(runData, serviceRecords),
    [runData, serviceRecords]
  );
  const selectedApi =
    sessionApis.find((api) => api.serviceId === selectedServiceId) || null;

  const activeModel = useMemo(() => {
    const models = asObject(profileConfig?.llmModels?.models);
    return Object.entries(models)
      .filter(([, model]) => model?.enabled)
      .sort(([firstId], [secondId]) => {
        const firstIndex = MODEL_ORDER.indexOf(firstId);
        const secondIndex = MODEL_ORDER.indexOf(secondId);
        return (firstIndex < 0 ? 99 : firstIndex) -
          (secondIndex < 0 ? 99 : secondIndex);
      })
      .map(([id, model]) => ({ id, ...model }))[0];
  }, [profileConfig?.llmModels?.models]);

  const cloudName = useMemo(() => {
    const deployment = profileConfig?.deployment || {};
    const services = Array.isArray(deployment.services)
      ? deployment.services
      : [];
    return (
      services.find((service) => /cloud/i.test(String(service))) ||
      deployment.title ||
      deployment.provider ||
      "Not configured"
    );
  }, [profileConfig?.deployment]);

  const basics = [
    {
      label: "Model",
      value:
        activeModel?.modelId || activeModel?.label || activeModel?.id || "Not configured",
      icon: Cpu,
    },
    {
      label: "Cloud",
      value: cloudName,
      icon: Cloud,
    },
    {
      label: "Design",
      value:
        profileConfig?.stylePreset?.title ||
        profileConfig?.stylePreset?.selectedStyle ||
        "Not configured",
      icon: Palette,
    },
  ];

  const updateDraft = useCallback((serviceId, patch) => {
    setDrafts((current) => ({
      ...current,
      [serviceId]: {
        ...(current[serviceId] || {}),
        ...patch,
      },
    }));
  }, []);

  const updateCredentialDraft = useCallback((serviceId, fieldName, value) => {
    setDrafts((current) => ({
      ...current,
      [serviceId]: {
        ...(current[serviceId] || {}),
        credentials: {
          ...(current[serviceId]?.credentials || {}),
          [fieldName]: value,
        },
      },
    }));
  }, []);

  const saveApi = useCallback(
    async (api) => {
      if (!activeRunId || !messageId) {
        setError("The conversation is still loading. Try saving again in a moment.");
        return;
      }

      setSavingServiceId(api.serviceId);
      setNotice("");
      setError("");

      const apiContracts = {};
      sessionApis.forEach((sessionApi) => {
        const draft = drafts[sessionApi.serviceId] || {};
        apiContracts[sessionApi.serviceId] = {
          rawText:
            draft.rawText !== undefined
              ? draft.rawText
              : readContractText(sessionApi),
        };
      });

      try {
        const result = await callLaborAgent({
          email: userDocId,
          runid: activeRunId,
          messageid: messageId,
          action: "save_third_party_credentials",
          requiredApis: sessionApis,
          credentials: {
            [api.serviceId]: drafts[api.serviceId]?.credentials || {},
          },
          apiContracts,
          clearLlmFallbackServiceIds: [api.serviceId],
        });

        setNotice(
          result?.message || `${api.serviceName} configuration saved.`
        );
        setDrafts((current) => ({
          ...current,
          [api.serviceId]: {
            ...(current[api.serviceId] || {}),
            credentials: {},
          },
        }));
      } catch (saveError) {
        setError(saveError.message || "Could not save this API configuration.");
      } finally {
        setSavingServiceId("");
      }
    },
    [activeRunId, drafts, messageId, sessionApis, userDocId]
  );

  const iconOnly = sidebarOpen;
  const panelWidth = expanded
    ? "sm:w-[640px]"
    : "sm:w-[340px]";

  return (
    <div
      ref={containerRef}
      className="fixed right-3 top-3 z-[70] flex flex-col items-end sm:right-4 sm:top-4"
    >
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={[
          "tk-glass-control relative flex h-9 items-center justify-center gap-2 rounded-full border border-white/10 bg-[#111111]/70 text-xs font-medium text-slate-300 transition hover:border-white/20 hover:bg-white/10 hover:text-white",
          iconOnly ? "w-9" : "w-9 sm:w-auto sm:px-3",
        ].join(" ")}
        aria-expanded={open}
        aria-label="Session configurations"
        title="Session configurations"
      >
        <SlidersHorizontal
          size={15}
          strokeWidth={1.6}
          className={iconOnly ? "" : "sm:hidden"}
        />
        {!iconOnly ? (
          <span className="hidden sm:inline">Configurations</span>
        ) : null}
        {sessionApis.length ? (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-sky-300 px-1 text-[9px] font-semibold text-black ring-2 ring-[#0A0A0A]">
            {sessionApis.length > 9 ? "9+" : sessionApis.length}
          </span>
        ) : null}
      </button>

      {open ? (
        <section
          className={[
            "tk-glass-float relative mt-2 max-h-[calc(100vh-4.5rem)] w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-white/15 bg-[#111111]/80 text-slate-300 transition-[width] duration-200 sm:max-w-[calc(100vw-2rem)]",
            panelWidth,
          ].join(" ")}
          aria-label="Session configuration details"
        >
          <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-white/35" />
          <header className="flex h-12 items-center justify-between border-b border-white/10 px-4">
            <div className="flex min-w-0 items-center gap-2">
              <SlidersHorizontal size={15} strokeWidth={1.6} />
              <span className="truncate text-xs font-medium text-white">
                Session configuration
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setExpanded((current) => !current)}
                className="grid h-8 w-8 place-items-center rounded-full text-slate-500 transition hover:bg-white/10 hover:text-white"
                aria-label={expanded ? "Use compact view" : "Expand configurations"}
                title={expanded ? "Compact view" : "Expand"}
              >
                {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-full text-slate-500 transition hover:bg-white/10 hover:text-white"
                aria-label="Close configurations"
                title="Close"
              >
                <X size={15} />
              </button>
            </div>
          </header>

          <div className="tk-scrollbar max-h-[calc(100vh-7.5rem)] overflow-y-auto">
            <div
              className={[
                "border-b border-white/10",
                expanded
                  ? "grid grid-cols-3 divide-x divide-white/10"
                  : "divide-y divide-white/10",
              ].join(" ")}
            >
              {basics.map(({ label, value, icon: Icon }) => (
                <div key={label} className="flex min-w-0 items-center gap-3 px-4 py-2.5">
                  <Icon
                    size={13}
                    strokeWidth={1.5}
                    className="shrink-0 text-slate-600"
                  />
                  <span className="w-12 shrink-0 text-[10px] text-slate-600">
                    {label}
                  </span>
                  <span className="min-w-0 truncate text-xs text-slate-300">
                    {value}
                  </span>
                </div>
              ))}
            </div>

            <div className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <KeyRound size={13} strokeWidth={1.5} className="text-slate-600" />
                  <span className="text-[10px] font-medium text-slate-500">
                    Third-party APIs
                  </span>
                </div>
                {sessionApis.length ? (
                  <span className="text-[10px] text-slate-600">
                    {sessionApis.length} required
                  </span>
                ) : null}
              </div>

              {!sessionApis.length ? (
                <p className="py-4 text-xs font-light text-slate-600">
                  None required for this session.
                </p>
              ) : (
                <div
                  className={[
                    "mt-2 min-w-0",
                    expanded && selectedApi
                      ? "grid grid-cols-[190px_minmax(0,1fr)] gap-4"
                      : "",
                  ].join(" ")}
                >
                  <div className="min-w-0 divide-y divide-white/[0.07]">
                    {sessionApis.map((api) => (
                      <button
                        key={api.serviceId}
                        type="button"
                        onClick={() => {
                          setSelectedServiceId((current) =>
                            current === api.serviceId ? "" : api.serviceId
                          );
                          setNotice("");
                          setError("");
                        }}
                        className={[
                          "group flex w-full min-w-0 items-center gap-2 py-2.5 text-left transition",
                          selectedServiceId === api.serviceId
                            ? "text-white"
                            : "text-slate-400 hover:text-white",
                        ].join(" ")}
                      >
                        <span
                          className={[
                            "h-1.5 w-1.5 shrink-0 rounded-full",
                            api.configured ? "bg-emerald-400" : "bg-amber-300",
                          ].join(" ")}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs">
                            {api.serviceName}
                          </span>
                          <span className="mt-0.5 block truncate text-[10px] text-slate-600">
                            {api.fallback
                              ? "LLM fallback"
                              : api.configured
                                ? "Configured"
                                : "Needs setup"}
                          </span>
                        </span>
                        {selectedServiceId === api.serviceId ? (
                          <PencilLine size={12} className="shrink-0 text-slate-500" />
                        ) : (
                          <ChevronRight
                            size={12}
                            className="shrink-0 text-slate-700 transition group-hover:text-slate-500"
                          />
                        )}
                      </button>
                    ))}
                  </div>

                  {selectedApi ? (
                    <ApiEditor
                      api={selectedApi}
                      draft={drafts[selectedApi.serviceId] || {}}
                      expanded={expanded}
                      saving={savingServiceId === selectedApi.serviceId}
                      onContractChange={(value) =>
                        updateDraft(selectedApi.serviceId, { rawText: value })
                      }
                      onCredentialChange={(fieldName, value) =>
                        updateCredentialDraft(
                          selectedApi.serviceId,
                          fieldName,
                          value
                        )
                      }
                      onSave={() => saveApi(selectedApi)}
                    />
                  ) : null}
                </div>
              )}

              {notice ? (
                <div className="mt-3 flex items-start gap-2 text-[11px] leading-5 text-emerald-300">
                  <CheckCircle2 size={12} className="mt-1 shrink-0" />
                  <span>{notice}</span>
                </div>
              ) : null}
              {error ? (
                <div className="mt-3 text-[11px] leading-5 text-red-300" role="alert">
                  {error}
                </div>
              ) : null}
            </div>

            <footer className="border-t border-white/10 px-4 py-3 text-[10px] font-light leading-4 text-slate-600">
              Changes apply to future generations in this session. Existing
              generated code must be updated manually.
            </footer>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ApiEditor({
  api,
  draft,
  expanded,
  saving,
  onContractChange,
  onCredentialChange,
  onSave,
}) {
  const contractText =
    draft.rawText !== undefined ? draft.rawText : readContractText(api);
  const hasSavedContract = Boolean(api?.record?.rawApiContractText);

  return (
    <div
      className={[
        "min-w-0 border-t border-white/10 pt-3",
        expanded ? "border-t-0 pt-0" : "mt-2",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-xs font-medium text-white">
            {api.serviceName}
          </div>
          <div className="mt-0.5 text-[10px] text-slate-600">
            {api.fallback
              ? "Add a real API request to replace the LLM fallback."
              : "Edit the request or replace a saved credential."}
          </div>
        </div>
        <span className="shrink-0 text-[9px] text-slate-600">
          {hasSavedContract ? "Saved request" : "Suggested request"}
        </span>
      </div>

      <textarea
        value={contractText}
        onChange={(event) => onContractChange(event.target.value)}
        placeholder="Paste a production cURL request or API documentation snippet..."
        className={[
          "tk-glass-input tk-scrollbar mt-3 w-full resize-y rounded-xl border border-white/10 bg-black/25 px-3 py-2 font-mono text-[10px] leading-4 text-slate-300 outline-none transition placeholder:text-slate-700 focus:border-sky-300/40",
          expanded ? "min-h-40" : "min-h-28",
        ].join(" ")}
      />

      {api.credentialFields.length ? (
        <div className="mt-2 grid gap-2">
          {api.credentialFields.map((field) => {
            const preview = fieldPreview(api, field);
            const placeholder = preview.saved
              ? preview.valuePreview
                ? `Saved ${preview.valuePreview}. Enter a replacement`
                : "Saved. Enter a replacement"
              : field?.placeholder || `Enter ${field?.label || field?.fieldName}`;

            return (
              <label key={field.fieldName} className="grid gap-1">
                <span className="text-[10px] text-slate-600">
                  {field.label || field.fieldName}
                </span>
                <input
                  type={field.secret === false ? "text" : "password"}
                  value={draft?.credentials?.[field.fieldName] || ""}
                  onChange={(event) =>
                    onCredentialChange(field.fieldName, event.target.value)
                  }
                  placeholder={placeholder}
                  className="tk-glass-input h-9 min-w-0 rounded-xl border border-white/10 bg-black/25 px-3 text-xs text-white outline-none transition placeholder:text-slate-700 focus:border-sky-300/40"
                />
              </label>
            );
          })}
        </div>
      ) : null}

      {api?.record?.validation?.message ? (
        <p className="mt-2 text-[10px] leading-4 text-slate-600">
          {api.record.validation.message}
        </p>
      ) : null}

      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="mt-3 inline-flex h-8 items-center gap-2 rounded-full bg-white px-3 text-[11px] font-medium text-black transition hover:bg-slate-200 disabled:bg-white/10 disabled:text-slate-500"
      >
        {saving ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          <Save size={13} />
        )}
        Save changes
      </button>
    </div>
  );
}

export default SessionConfigurationPopover;
