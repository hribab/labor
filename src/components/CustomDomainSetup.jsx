import {
  ChevronDown,
  ExternalLink,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";

function statusPresentation(status) {
  if (status === "connected") {
    return {
      label: "Connected",
      className:
        "border-emerald-300/15 bg-emerald-300/[0.07] text-emerald-200",
    };
  }
  if (status === "pending") {
    return {
      label: "Pending",
      className: "border-amber-300/15 bg-amber-300/[0.07] text-amber-200",
    };
  }
  return {
    label: "Needs setup",
    className: "border-red-300/15 bg-red-300/[0.07] text-red-200",
  };
}

function DnsRecords({ records }) {
  const rows = Array.isArray(records) ? records : [];
  if (!rows.length) return null;

  return (
    <div className="mt-4 grid gap-2">
      <div className="text-[10px] uppercase text-slate-600">
        Add these records with your DNS provider
      </div>
      <div className="hidden grid-cols-[52px_44px_minmax(0,0.8fr)_minmax(0,1.2fr)] gap-1 px-3 text-[9px] uppercase text-slate-700 sm:grid">
        <span>Action</span>
        <span>Type</span>
        <span>Domain</span>
        <span>Value</span>
      </div>
      {rows.map((record, index) => (
        <div
          key={`${record.type}-${record.domainName}-${record.value}-${index}`}
          className="grid gap-1.5 rounded-lg border border-white/[0.07] bg-black/20 px-3 py-2.5 text-[11px] sm:grid-cols-[52px_44px_minmax(0,0.8fr)_minmax(0,1.2fr)] sm:gap-1"
        >
          <span className="font-medium text-amber-200/80">
            {record.requiredAction || "ADD"}
          </span>
          <span className="font-mono text-emerald-200">{record.type}</span>
          <span className="break-all font-mono text-slate-400">
            {record.domainName}
          </span>
          <span className="break-all font-mono text-slate-300">
            {record.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function CustomDomainSetup({
  domain,
  expanded = false,
  busyAction = "",
  deleteConfirm = false,
  onToggle,
  onVerify,
  onDeleteIntent,
  onDelete,
  onCancelDelete,
}) {
  const domainName = String(domain?.customDomain || "");
  const domainUrl = String(domain?.url || `https://${domainName}/`);
  const status = String(domain?.status || "needs_setup");
  const connected = status === "connected";
  const presentation = statusPresentation(status);
  const refreshing = ["details", "check", "verify"].includes(busyAction);
  const deleting = busyAction === "delete";
  const records = Array.isArray(domain?.records) ? domain.records : [];
  const actionError = String(
    domain?.lastCheckError ||
      domain?.provisioningError ||
      domain?.authWarning ||
      ""
  );
  const stateParts = [
    String(domain?.ownershipState || "").replace(/^OWNERSHIP_/, ""),
    String(domain?.hostState || "").replace(/^HOST_/, ""),
    String(domain?.certState || "").replace(/^CERT_/, ""),
  ].filter(Boolean);

  return (
    <div className="tk-glass-input overflow-hidden rounded-lg border border-white/[0.07] bg-black/20">
      <div className="flex min-w-0 items-center gap-1 px-3 py-3">
        <button
          type="button"
          onClick={() => onToggle?.(domainName)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={expanded}
        >
          <span className="min-w-0 flex-1 truncate text-xs text-slate-300">
            {domainName}
          </span>
          <span
            className={`rounded-md border px-1.5 py-0.5 text-[9px] font-medium ${presentation.className}`}
          >
            {presentation.label}
          </span>
          {refreshing ? (
            <Loader2 size={12} className="shrink-0 animate-spin text-slate-500" />
          ) : (
            <ChevronDown
              size={13}
              className={`shrink-0 text-slate-600 transition-transform ${
                expanded ? "rotate-180" : ""
              }`}
            />
          )}
        </button>
        <a
          href={domainUrl}
          target="_blank"
          rel="noreferrer"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-slate-700 transition hover:bg-white/[0.06] hover:text-white"
          aria-label={`Open ${domainName}`}
          title={`Open ${domainName}`}
        >
          <ExternalLink size={11} />
        </a>
      </div>

      <p className="px-3 pb-3 text-[11px] font-light leading-4 text-slate-500">
        {domain?.message || "Domain saved. Open it to load DNS instructions."}
      </p>

      {expanded ? (
        <div className="border-t border-white/[0.06] px-3 pb-3 pt-3">
          {stateParts.length ? (
            <p className="font-mono text-[9px] uppercase text-slate-700">
              {stateParts.join(" / ")}
            </p>
          ) : null}

          {actionError ? (
            <p className="mt-2 rounded-lg border border-red-300/10 bg-red-300/[0.04] px-3 py-2 text-[10px] leading-4 text-red-200/80">
              {actionError}
            </p>
          ) : null}

          {!connected && !records.length ? (
            <p className="mt-2 text-[11px] font-light leading-5 text-slate-500">
              Firebase has not returned DNS instructions yet. Select Verify to
              check again.
            </p>
          ) : null}

          {!connected ? <DnsRecords records={records} /> : null}

          {!connected ? (
            <p className="mt-3 text-[10px] font-light leading-4 text-slate-600">
              {domain?.propagationMessage ||
                "DNS changes can take up to 48 hours. You can continue with the release while Firebase verifies them."}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-white/[0.05] pt-3">
            <button
              type="button"
              onClick={() => onToggle?.(domainName)}
              disabled={Boolean(busyAction)}
              className="h-8 px-2 text-[11px] text-slate-500 transition hover:text-white disabled:opacity-50"
            >
              Close for now
            </button>

            {!connected ? (
              <button
                type="button"
                onClick={() => onVerify?.(domainName)}
                disabled={Boolean(busyAction)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 text-[11px] text-slate-300 transition hover:bg-white/[0.08] hover:text-white disabled:opacity-50"
              >
                {refreshing ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <RefreshCw size={12} />
                )}
                Verify
              </button>
            ) : null}

            {deleteConfirm ? (
              <>
                <button
                  type="button"
                  onClick={onCancelDelete}
                  disabled={deleting}
                  className="h-8 px-2 text-[11px] text-slate-500 transition hover:text-white disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => onDelete?.(domainName)}
                  disabled={deleting}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-300/15 bg-red-300/[0.07] px-2.5 text-[11px] text-red-200 transition hover:bg-red-300/10 disabled:opacity-50"
                >
                  {deleting ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Trash2 size={12} />
                  )}
                  Confirm delete
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => onDeleteIntent?.(domainName)}
                disabled={Boolean(busyAction)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] text-slate-600 transition hover:bg-red-300/[0.06] hover:text-red-200 disabled:opacity-50"
              >
                <Trash2 size={12} />
                Delete
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
