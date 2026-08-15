import { useEffect, useRef } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Code2,
  Loader2,
  Wrench,
  X,
} from "lucide-react";

const FAILED_BUILD_STATUSES = new Set([
  "FAILURE",
  "INTERNAL_ERROR",
  "TIMEOUT",
  "CANCELLED",
  "EXPIRED",
]);

function CloudBuildLogPanel({
  reply,
  className = "",
  terminalClassName = "h-36",
  forceTerminal = false,
  title = "",
  onClose,
  onViewCode,
  onFixAndRedeploy,
  fixing = false,
  repairError = "",
}) {
  const logRef = useRef(null);
  const jsonData = reply?.jsonData || {};
  const buildId = String(jsonData.buildId || "");
  const buildStatus = String(jsonData.buildStatus || "").toUpperCase();
  const buildLogTail = String(jsonData.buildLogTail || "");
  const buildLogReadError = String(jsonData.buildLogReadError || "");
  const failureKind = String(jsonData.failureKind || "");
  const repairingGenerationCompleteness =
    reply?.phase === "repairing_generation_completeness";
  const generationValidationFailure =
    failureKind === "generation_validation";
  const failed = reply?.status === "failed" || FAILED_BUILD_STATUSES.has(buildStatus);
  const completed = reply?.status === "completed" || buildStatus === "SUCCESS";
  let resolvedTitle = title;
  if (!resolvedTitle) {
    if (repairingGenerationCompleteness) {
      resolvedTitle = "Repairing generated source...";
    } else if (generationValidationFailure) {
      resolvedTitle = jsonData.generationBlocked
        ? "Session generation blocked"
        : "Generation stopped";
    } else if (failed) {
      resolvedTitle = buildId ? "Deployment failed" : "Generation failed";
    } else if (completed) {
      resolvedTitle = "Deployment complete";
    } else {
      resolvedTitle = buildId
        ? "Deploying application..."
        : "Preparing deployment...";
    }
  }
  const statusTone = failed
    ? "border-red-300/20 bg-red-300/10 text-red-200"
    : completed
      ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-200"
      : "border-white/10 bg-white/5 text-slate-400";
  const terminalText =
    buildLogTail ||
    (failed && reply?.error
      ? String(reply.error)
      : null) ||
    (!buildId
      ? String(reply?.finalTextMd || "Preparing source files for Cloud Build...")
      : "Starting Cloud Build...");

  useEffect(() => {
    const element = logRef.current;
    if (!element || !terminalText) return;
    element.scrollTop = element.scrollHeight;
  }, [terminalText]);

  return (
    <div
      className={[
        "tk-glass-panel grid min-w-0 gap-3 rounded-xl border border-white/10 bg-[#101010]/95 p-4 text-sm font-light text-slate-300",
        className,
      ].join(" ")}
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex min-w-0 items-center gap-3 font-medium text-white">
            {failed ? (
              <AlertTriangle
                className="shrink-0 text-red-300"
                size={15}
                strokeWidth={2}
              />
            ) : completed ? (
              <CheckCircle2
                className="shrink-0 text-emerald-300"
                size={15}
                strokeWidth={2}
              />
            ) : (
              <Loader2
                className="shrink-0 animate-spin text-slate-400"
                size={15}
              />
            )}
            <span className="truncate">{resolvedTitle}</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {buildStatus ? (
            <span
              className={`rounded-md border px-2 py-1 font-mono text-[10px] ${statusTone}`}
            >
              {buildStatus}
            </span>
          ) : null}
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="grid h-7 w-7 place-items-center rounded-md text-slate-500 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Hide deployment logs"
              title="Hide deployment logs"
            >
              <X size={14} />
            </button>
          ) : null}
          {onViewCode ? (
            <button
              type="button"
              onClick={onViewCode}
              className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.06] px-2.5 text-[11px] font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="View generated code"
              title="View generated code"
            >
              <Code2 size={13} strokeWidth={1.7} />
              Code
            </button>
          ) : null}
        </div>
      </div>

      {buildId ? (
        <div className="truncate font-mono text-[11px] tracking-tight text-slate-600">
          Build {buildId}
        </div>
      ) : null}

      {buildId || forceTerminal || failed ? (
        <pre
          ref={logRef}
          role="log"
          aria-live="polite"
          aria-label="Live Cloud Build logs"
          className={`${terminalClassName} tk-scrollbar min-w-0 max-w-full overflow-auto whitespace-pre-wrap break-all rounded-lg border border-white/[0.07] bg-black/50 p-3 font-mono text-[10px] font-normal leading-4 text-slate-400`}
        >
          {terminalText}
        </pre>
      ) : null}

      {buildLogReadError ? (
        <div className="break-words text-[11px] text-amber-200/70">
          Live log read failed: {buildLogReadError}
        </div>
      ) : null}

      {failed && onFixAndRedeploy ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-white/[0.07] pt-3">
          <button
            type="button"
            onClick={onFixAndRedeploy}
            disabled={fixing}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-white px-3.5 text-xs font-medium text-black transition-colors hover:bg-slate-200 disabled:bg-white/10 disabled:text-slate-500"
          >
            {fixing ? (
              <Loader2 className="animate-spin" size={14} />
            ) : (
              <Wrench size={14} strokeWidth={1.8} />
            )}
            {fixing ? "Analyzing failure..." : "Fix and redeploy"}
          </button>
          {repairError ? (
            <span className="min-w-0 break-words text-xs text-red-200">
              {repairError}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default CloudBuildLogPanel;
