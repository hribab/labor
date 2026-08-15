import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  arrayUnion,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Code2,
  Download,
  Eye,
  FileCode2,
  Folder,
  FolderSearch,
  FolderOpen,
  Maximize2,
  Minimize2,
  Loader2,
  Rocket,
  Save,
  Search,
  X,
} from "lucide-react";

import { db, userFacingFirebaseError } from "../lib/firebase";
import { callAppGenerationAgent } from "../lib/agent";
import { LABOR_DATA_ROOT_COLLECTION as ROOT_COLLECTION } from "../lib/laborBrand";
import CloudBuildLogPanel from "./CloudBuildLogPanel";

const RUN_COLLECTION = "runs";

function sourceFileDocId(path) {
  return encodeURIComponent(String(path || ""));
}

function fileLanguage(path) {
  if (path.endsWith(".ts")) return "TypeScript";
  if (path.endsWith(".tsx")) return "React TSX";
  if (path.endsWith(".json")) return "JSON";
  if (path.endsWith(".css")) return "CSS";
  if (path.endsWith(".html")) return "HTML";
  if (path.endsWith(".js")) return "JavaScript";
  if (path.endsWith(".jsx")) return "React JSX";
  if (path.endsWith(".md")) return "Markdown";
  return "Text";
}

function languageKey(path) {
  if (/\.(jsx|tsx)$/.test(path)) return "jsx";
  if (/\.(js|ts)$/.test(path)) return "js";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".css")) return "css";
  if (path.endsWith(".html")) return "html";
  if (path.endsWith(".md")) return "markdown";
  return "text";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const TOKEN_CLASSES = {
  attribute: "text-[#9cdcfe]",
  comment: "text-[#6a9955]",
  function: "text-[#dcdcaa]",
  keyword: "text-[#569cd6]",
  number: "text-[#b5cea8]",
  property: "text-[#9cdcfe]",
  string: "text-[#ce9178]",
  tag: "text-[#569cd6]",
};

const JS_KEYWORDS =
  /\b(?:as|async|await|break|case|catch|class|const|continue|default|do|else|export|extends|false|finally|for|from|function|if|import|in|instanceof|let|new|null|of|return|switch|throw|true|try|typeof|undefined|var|void|while|yield)\b/;

const CSS_KEYWORDS =
  /\b(?:absolute|auto|block|border-box|center|flex|fixed|grid|hidden|inline|inherit|initial|none|relative|solid|sticky|transparent|unset)\b/;

const CODE_TOKEN_PATTERN =
  /(\/\*[\s\S]*?\*\/|\/\/[^\n]*|`(?:\\[\s\S]|[^`\\])*`|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|#[\da-fA-F]{3,8}\b|<\/?[A-Za-z][\w:-]*|[A-Za-z_$][\w$-]*(?=\s*\()|[A-Za-z_$][\w$-]*(?=\s*=)|[A-Za-z_$][\w$-]*(?=\s*:)|\b\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw)?\b|\b[A-Za-z_$][\w$-]*\b)/g;

function highlightToken(token, language, nextChar) {
  let type = "";

  if (token.startsWith("//") || token.startsWith("/*")) {
    type = "comment";
  } else if (
    token.startsWith("\"") ||
    token.startsWith("'") ||
    token.startsWith("`") ||
    token.startsWith("#")
  ) {
    type = "string";
  } else if (/^<\/?[A-Za-z]/.test(token)) {
    type = "tag";
  } else if (/^\d/.test(token)) {
    type = "number";
  } else if (JS_KEYWORDS.test(token) || (language === "css" && CSS_KEYWORDS.test(token))) {
    type = "keyword";
  } else if (nextChar === "=") {
    type = "attribute";
  } else if (nextChar === ":") {
    type = "property";
  } else if (nextChar === "(") {
    type = "function";
  } else if (/^[A-Za-z_$][\w$-]*(?=\s*$)/.test(token)) {
    if (language === "json") type = "property";
  }

  const escaped = escapeHtml(token);
  return type ? `<span class="${TOKEN_CLASSES[type]}">${escaped}</span>` : escaped;
}

function highlightCode(code, path) {
  const language = languageKey(path);
  const source = String(code || "");
  let highlighted = "";
  let lastIndex = 0;

  source.replace(CODE_TOKEN_PATTERN, (match, _token, offset) => {
    const nextChar = source.slice(offset + match.length).match(/^\s*([:=\(])/)?.[1] || "";
    highlighted += escapeHtml(source.slice(lastIndex, offset));
    highlighted += highlightToken(match, language, nextChar);
    lastIndex = offset + match.length;
    return match;
  });

  highlighted += escapeHtml(source.slice(lastIndex));
  return highlighted || " ";
}

function getLineStartOffsets(code) {
  const starts = [0];
  String(code || "").replace(/\n/g, (_match, offset) => {
    starts.push(offset + 1);
    return "\n";
  });
  return starts;
}

function lineForOffset(lineStarts, offset) {
  let low = 0;
  let high = lineStarts.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lineStarts[mid] <= offset) {
      if (mid === lineStarts.length - 1 || lineStarts[mid + 1] > offset) {
        return mid;
      }
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return 0;
}

function findTextMatches(code, query) {
  const source = String(code || "");
  const needle = String(query || "");
  if (!needle) return [];

  const lineStarts = getLineStartOffsets(source);
  const lowerSource = source.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  const matches = [];
  let index = lowerSource.indexOf(lowerNeedle);

  while (index !== -1 && matches.length < 1000) {
    const line = lineForOffset(lineStarts, index);
    matches.push({
      index: matches.length,
      start: index,
      end: index + needle.length,
      line,
      column: index - lineStarts[line],
      length: needle.length,
    });
    index = lowerSource.indexOf(lowerNeedle, index + Math.max(needle.length, 1));
  }

  return matches;
}

function highlightLineWithSearch(line, path, matches = [], activeMatchIndex = -1) {
  if (!matches.length) return highlightCode(line, path);

  const sortedMatches = [...matches]
    .filter((match) => match.column >= 0 && match.length > 0)
    .sort((left, right) => left.column - right.column);
  let cursor = 0;
  let html = "";

  sortedMatches.forEach((match) => {
    if (match.column < cursor) return;
    html += highlightCode(line.slice(cursor, match.column), path);
    const matchText = line.slice(match.column, match.column + match.length);
    const isActive = match.index === activeMatchIndex;
    html += `<span class="${
      isActive
        ? "rounded bg-[#f8c555] text-black"
        : "rounded bg-[#5f4b19] text-[#ffe8a3]"
    }">${highlightCode(matchText, path)}</span>`;
    cursor = match.column + match.length;
  });

  html += highlightCode(line.slice(cursor), path);
  return html || " ";
}

function findFoldRanges(code) {
  const source = String(code || "");
  const lines = source.split("\n");
  const stack = [];
  const ranges = new Map();
  const matchingOpen = {
    "}": "{",
    ")": "(",
    "]": "[",
  };
  const opening = new Set(["{", "(", "["]);
  const closing = new Set(["}", ")", "]"]);
  let line = 0;
  let quote = "";
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1] || "";

    if (char === "\n") {
      line += 1;
      lineComment = false;
      escaped = false;
      continue;
    }

    if (lineComment) continue;

    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = "";
      }
      continue;
    }

    if (char === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }

    if (char === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }

    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }

    if (opening.has(char)) {
      stack.push({ char, line });
      continue;
    }

    if (!closing.has(char)) continue;

    for (let stackIndex = stack.length - 1; stackIndex >= 0; stackIndex -= 1) {
      const open = stack[stackIndex];
      if (open.char !== matchingOpen[char]) continue;
      stack.splice(stackIndex);
      if (line - open.line > 1) {
        const existing = ranges.get(open.line);
        if (!existing || line > existing.endLine) {
          ranges.set(open.line, {
            startLine: open.line,
            endLine: line,
          });
        }
      }
      break;
    }
  }

  lines.forEach((text, index) => {
    if (ranges.has(index)) return;
    if (!/^\s*(?:function|async function|class|if|for|while|switch|try|catch|const\s+\w+\s*=\s*(?:async\s*)?\(|[A-Za-z_$][\w$]*\s*[:=]\s*(?:async\s*)?\()/.test(text)) {
      return;
    }

    const indent = text.match(/^\s*/)?.[0].length || 0;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const candidate = lines[cursor];
      if (!candidate.trim()) continue;
      const candidateIndent = candidate.match(/^\s*/)?.[0].length || 0;
      if (candidateIndent <= indent) {
        if (cursor - index > 2) {
          ranges.set(index, { startLine: index, endLine: cursor - 1 });
        }
        break;
      }
    }
  });

  return ranges;
}

function buildVisibleLineRecords(code, foldRanges, foldedStarts) {
  const lines = String(code || "").split("\n");
  const records = [];

  for (let line = 0; line < lines.length; line += 1) {
    const range = foldRanges.get(line);
    if (range && foldedStarts.has(line)) {
      records.push({
        sourceLine: line,
        endLine: range.endLine,
        text: `${lines[line].replace(/\s*$/, "")}  ...`,
        folded: true,
      });
      line = range.endLine;
      continue;
    }

    records.push({
      sourceLine: line,
      endLine: line,
      text: lines[line],
      folded: false,
    });
  }

  return records.length
    ? records
    : [{ sourceLine: 0, endLine: 0, text: "", folded: false }];
}

function findVisibleIndexForSourceLine(records, sourceLine) {
  const exact = records.findIndex((record) => record.sourceLine === sourceLine);
  if (exact !== -1) return exact;

  const containing = records.findIndex(
    (record) => record.sourceLine <= sourceLine && record.endLine >= sourceLine
  );
  if (containing !== -1) return containing;

  return Math.max(
    0,
    records.findIndex((record) => record.sourceLine > sourceLine) - 1
  );
}

function buildProjectSearchResults(files, query) {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return [];

  const results = [];

  files.forEach((file) => {
    const path = String(file.path || "");
    const content = String(file.content || "");
    if (path.toLowerCase().includes(needle)) {
      results.push({
        type: "file",
        path,
        label: path,
        detail: "File name",
        line: 0,
      });
    }

    const lines = content.split("\n");
    lines.forEach((lineText, lineIndex) => {
      if (results.length >= 80) return;
      if (!lineText.toLowerCase().includes(needle)) return;
      results.push({
        type: "content",
        path,
        label: path,
        detail: `${lineIndex + 1}: ${lineText.trim().slice(0, 120) || "(blank line)"}`,
        line: lineIndex,
      });
    });
  });

  return results.slice(0, 80);
}

function buildFileTree(files) {
  const root = {
    children: new Map(),
    name: "",
    path: "",
    type: "folder",
  };

  files.forEach((file) => {
    const parts = String(file.path || "")
      .split("/")
      .filter(Boolean);
    let current = root;

    parts.forEach((part, index) => {
      const isFile = index === parts.length - 1;
      const nodePath = parts.slice(0, index + 1).join("/");

      if (isFile) {
        current.children.set(part, {
          ...file,
          name: part,
          path: file.path,
          type: "file",
        });
        return;
      }

      if (!current.children.has(part)) {
        current.children.set(part, {
          children: new Map(),
          name: part,
          path: nodePath,
          type: "folder",
        });
      }

      current = current.children.get(part);
    });
  });

  function finalize(node) {
    if (node.type === "file") return node;

    return {
      ...node,
      children: Array.from(node.children.values())
        .map(finalize)
        .sort((left, right) => {
          if (left.type !== right.type) return left.type === "folder" ? -1 : 1;
          return left.name.localeCompare(right.name);
        }),
    };
  }

  return finalize(root).children;
}

function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

function dosDateTime(date) {
  const year = Math.max(date.getFullYear(), 1980);
  const dosTime =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2);
  const dosDate =
    ((year - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate();
  return { dosTime, dosDate };
}

function pushUint16(bytes, value) {
  bytes.push(value & 0xff, (value >>> 8) & 0xff);
}

function pushUint32(bytes, value) {
  bytes.push(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff
  );
}

function createZipBlob(files) {
  const encoder = new TextEncoder();
  const now = dosDateTime(new Date());
  const output = [];
  const central = [];
  let offset = 0;

  files.forEach((file) => {
    const nameBytes = encoder.encode(file.path);
    const data = encoder.encode(file.content || "");
    const checksum = crc32(data);

    const local = [];
    pushUint32(local, 0x04034b50);
    pushUint16(local, 20);
    pushUint16(local, 0);
    pushUint16(local, 0);
    pushUint16(local, now.dosTime);
    pushUint16(local, now.dosDate);
    pushUint32(local, checksum);
    pushUint32(local, data.length);
    pushUint32(local, data.length);
    pushUint16(local, nameBytes.length);
    pushUint16(local, 0);
    local.push(...nameBytes, ...data);
    output.push(...local);

    const directory = [];
    pushUint32(directory, 0x02014b50);
    pushUint16(directory, 20);
    pushUint16(directory, 20);
    pushUint16(directory, 0);
    pushUint16(directory, 0);
    pushUint16(directory, now.dosTime);
    pushUint16(directory, now.dosDate);
    pushUint32(directory, checksum);
    pushUint32(directory, data.length);
    pushUint32(directory, data.length);
    pushUint16(directory, nameBytes.length);
    pushUint16(directory, 0);
    pushUint16(directory, 0);
    pushUint16(directory, 0);
    pushUint16(directory, 0);
    pushUint32(directory, 0);
    pushUint32(directory, offset);
    directory.push(...nameBytes);
    central.push(...directory);

    offset += local.length;
  });

  const centralOffset = output.length;
  output.push(...central);
  pushUint32(output, 0x06054b50);
  pushUint16(output, 0);
  pushUint16(output, 0);
  pushUint16(output, files.length);
  pushUint16(output, files.length);
  pushUint32(output, central.length);
  pushUint32(output, centralOffset);
  pushUint16(output, 0);

  return new Blob([new Uint8Array(output)], { type: "application/zip" });
}

function FileTreeItem({
  node,
  level,
  expandedFolders,
  onToggleFolder,
  onSelectPath,
  selectedPath,
}) {
  const isFolder = node.type === "folder";
  const isExpanded = expandedFolders.has(node.path);
  const isSelected = node.path === selectedPath;
  const paddingLeft = 8 + level * 14;

  if (isFolder) {
    return (
      <div>
        <button
          type="button"
          onClick={() => onToggleFolder(node.path)}
          style={{ paddingLeft }}
          className="group mb-0.5 flex h-7 w-full items-center gap-1.5 rounded-md pr-2 text-left text-xs text-[#cccccc] transition-colors hover:bg-[#2a2d2e]"
          title={node.path}
        >
          {isExpanded ? (
            <ChevronDown size={14} className="shrink-0 text-[#858585]" strokeWidth={1.7} />
          ) : (
            <ChevronRight size={14} className="shrink-0 text-[#858585]" strokeWidth={1.7} />
          )}
          {isExpanded ? (
            <FolderOpen size={14} className="shrink-0 text-[#dcb67a]" strokeWidth={1.6} />
          ) : (
            <Folder size={14} className="shrink-0 text-[#dcb67a]" strokeWidth={1.6} />
          )}
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
        </button>
        {isExpanded && (
          <div>
            {node.children.map((child) => (
              <FileTreeItem
                key={`${child.type}:${child.path}`}
                node={child}
                level={level + 1}
                expandedFolders={expandedFolders}
                onToggleFolder={onToggleFolder}
                onSelectPath={onSelectPath}
                selectedPath={selectedPath}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelectPath(node.path)}
      style={{ paddingLeft: paddingLeft + 20 }}
      className={[
        "mb-0.5 flex h-7 w-full items-center gap-1.5 rounded-md pr-2 text-left text-xs transition-colors",
        isSelected
          ? "bg-[#37373d] text-white"
          : "text-[#cccccc] hover:bg-[#2a2d2e] hover:text-white",
      ].join(" ")}
      title={node.path}
    >
      <FileCode2
        size={13}
        strokeWidth={1.6}
        className={isSelected ? "shrink-0 text-[#8ab4f8]" : "shrink-0 text-[#858585]"}
      />
      <span className="min-w-0 flex-1 truncate">{node.name}</span>
    </button>
  );
}

function GeneratedCodeWorkspace({
  userDocId,
  runId,
  reply,
  previewUrl,
  onPreview,
  onDeployed,
  previewControlLabel = "Preview",
  isFullscreen = false,
  onToggleFullscreen,
}) {
  const [files, setFiles] = useState([]);
  const [selectedPath, setSelectedPath] = useState("");
  const [draft, setDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState("saved");
  const [recentlySaved, setRecentlySaved] = useState(false);
  const [deployState, setDeployState] = useState("");
  const [deployMessageId, setDeployMessageId] = useState("");
  const [deployProgress, setDeployProgress] = useState(null);
  const [deployPanelOpen, setDeployPanelOpen] = useState(false);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [sourceFilesReady, setSourceFilesReady] = useState(false);
  const [runSourceState, setRunSourceState] = useState({
    ready: false,
    latestSourceZip: "",
    latestReleaseStatus: "",
  });
  const [expandedFolders, setExpandedFolders] = useState(() => new Set());
  const [foldedStarts, setFoldedStarts] = useState(() => new Set());
  const [showFileSearch, setShowFileSearch] = useState(false);
  const [fileSearchQuery, setFileSearchQuery] = useState("");
  const [activeFileSearchIndex, setActiveFileSearchIndex] = useState(0);
  const [showProjectSearch, setShowProjectSearch] = useState(false);
  const [projectSearchQuery, setProjectSearchQuery] = useState("");
  const [projectActiveIndex, setProjectActiveIndex] = useState(0);
  const editorRef = useRef(null);
  const highlightRef = useRef(null);
  const lineNumbersRef = useRef(null);
  const fileSearchInputRef = useRef(null);
  const projectSearchInputRef = useRef(null);
  const draftRef = useRef("");
  const syncAttemptedSourceRef = useRef("");
  const pendingRevealRef = useRef(null);

  const replySourceZip = reply?.jsonData?.sourceZip || "";
  const sourceZip = runSourceState.latestSourceZip || replySourceZip;
  const hasActiveFolds = foldedStarts.size > 0;
  const parentDeploymentRunning = [
    "processing",
    "thinking",
    "queued",
    "running",
  ].includes(String(reply?.status || "").toLowerCase());

  useEffect(() => {
    setExpandedFolders(new Set());
    setFoldedStarts(new Set());
    setDeployMessageId("");
    setDeployProgress(null);
    setDeployPanelOpen(false);
    setFiles([]);
    setSourceFilesReady(false);
    setRunSourceState({
      ready: false,
      latestSourceZip: "",
      latestReleaseStatus: "",
    });
    syncAttemptedSourceRef.current = "";
  }, [runId]);

  useEffect(() => {
    if (!userDocId || !runId) {
      setRunSourceState({
        ready: true,
        latestSourceZip: "",
        latestReleaseStatus: "",
      });
      return undefined;
    }

    return onSnapshot(
      doc(db, ROOT_COLLECTION, userDocId, RUN_COLLECTION, runId),
      (snapshot) => {
        const data = snapshot.exists() ? snapshot.data() || {} : {};
        setRunSourceState({
          ready: true,
          latestSourceZip: String(data.latestSourceZip || ""),
          latestReleaseStatus: String(data.latestReleaseStatus || "").toLowerCase(),
        });
      },
      (snapshotError) => {
        setError(userFacingFirebaseError(snapshotError));
        setRunSourceState((current) => ({ ...current, ready: true }));
      }
    );
  }, [runId, userDocId]);

  useEffect(() => {
    if (!userDocId || !runId || !deployMessageId) return undefined;

    const deployReplyRef = doc(
      db,
      ROOT_COLLECTION,
      userDocId,
      RUN_COLLECTION,
      runId,
      "messages",
      deployMessageId,
      "agentreply",
      "current"
    );

    return onSnapshot(
      deployReplyRef,
      (snapshot) => {
        if (!snapshot.exists()) return;
        setDeployProgress({ id: snapshot.id, ...snapshot.data() });
      },
      (snapshotError) => {
        setError(userFacingFirebaseError(snapshotError));
        setDeployProgress((current) => ({
          ...current,
          status: "failed",
          finalTextMd: snapshotError.message,
        }));
      }
    );
  }, [deployMessageId, runId, userDocId]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    if (!userDocId || !runId) return undefined;

    const filesRef = collection(
      db,
      ROOT_COLLECTION,
      userDocId,
      RUN_COLLECTION,
      runId,
      "sourceFiles"
    );
    const qRef = query(filesRef, orderBy("path", "asc"));

    return onSnapshot(
      qRef,
      (snapshot) => {
        const next = snapshot.docs.map((fileDoc) => {
          const data = fileDoc.data() || {};
          return {
            id: fileDoc.id,
            path: String(data.path || decodeURIComponent(fileDoc.id)),
            content: String(data.content || ""),
            size: Number(data.size || 0),
            sourceZip: String(data.sourceZip || ""),
          };
        });
        setFiles(next);
        setSourceFilesReady(true);
        setSelectedPath((current) =>
          next.some((file) => file.path === current) ? current : next[0]?.path || ""
        );
      },
      (err) => {
        setError(userFacingFirebaseError(err));
        setSourceFilesReady(true);
      }
    );
  }, [runId, userDocId]);

  useEffect(() => {
    const releaseSourceReplacementActive = ["queued", "processing"].includes(
      runSourceState.latestReleaseStatus
    );
    const sourceFilesMatchLatest =
      files.length > 0 &&
      files.every((file) => file.sourceZip && file.sourceZip === sourceZip);
    const sourceFilesNeedRecovery =
      files.length === 0 ||
      (Boolean(runSourceState.latestSourceZip) && !sourceFilesMatchLatest);

    if (
      !runSourceState.ready ||
      !sourceFilesReady ||
      !sourceFilesNeedRecovery ||
      !sourceZip ||
      !userDocId ||
      !runId ||
      parentDeploymentRunning ||
      releaseSourceReplacementActive ||
      syncing ||
      syncAttemptedSourceRef.current === sourceZip
    ) {
      return;
    }

    syncAttemptedSourceRef.current = sourceZip;
    setSyncing(true);
    callAppGenerationAgent({
      action: "sync_source_files",
      email: userDocId,
      runid: runId,
      messageid: `sync_source_${Date.now()}`,
      sourceZip,
    })
      .catch((err) => setError(err.message))
      .finally(() => setSyncing(false));
  }, [
    files,
    parentDeploymentRunning,
    runId,
    runSourceState.latestReleaseStatus,
    runSourceState.latestSourceZip,
    runSourceState.ready,
    sourceFilesReady,
    sourceZip,
    syncing,
    userDocId,
  ]);

  const selectedFile = useMemo(
    () => files.find((file) => file.path === selectedPath) || files[0] || null,
    [files, selectedPath]
  );

  const fileTree = useMemo(() => buildFileTree(files), [files]);
  const foldRanges = useMemo(() => findFoldRanges(draft), [draft]);
  const visibleLineRecords = useMemo(
    () => buildVisibleLineRecords(draft, foldRanges, foldedStarts),
    [draft, foldRanges, foldedStarts]
  );
  const editorText = useMemo(
    () => visibleLineRecords.map((record) => record.text).join("\n"),
    [visibleLineRecords]
  );
  const fileSearchMatches = useMemo(
    () => findTextMatches(draft, fileSearchQuery),
    [draft, fileSearchQuery]
  );
  const fileSearchMatchesByLine = useMemo(() => {
    const grouped = new Map();
    fileSearchMatches.forEach((match) => {
      const current = grouped.get(match.line) || [];
      current.push(match);
      grouped.set(match.line, current);
    });
    return grouped;
  }, [fileSearchMatches]);
  const projectSearchResults = useMemo(
    () => buildProjectSearchResults(files, projectSearchQuery),
    [files, projectSearchQuery]
  );

  const toggleFolder = useCallback((path) => {
    setExpandedFolders((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  useEffect(() => {
    setFoldedStarts((current) => {
      const next = new Set(
        [...current].filter((line) => foldRanges.has(line))
      );
      return next.size === current.size ? current : next;
    });
  }, [foldRanges]);

  useEffect(() => {
    setActiveFileSearchIndex(0);
  }, [fileSearchQuery, selectedFile?.path]);

  useEffect(() => {
    if (!fileSearchMatches.length) {
      setActiveFileSearchIndex(0);
      return;
    }

    setActiveFileSearchIndex((current) =>
      Math.min(current, fileSearchMatches.length - 1)
    );
  }, [fileSearchMatches.length]);

  useEffect(() => {
    setProjectActiveIndex(0);
  }, [projectSearchQuery]);

  useEffect(() => {
    if (!showFileSearch) return;
    window.requestAnimationFrame(() => fileSearchInputRef.current?.focus());
  }, [showFileSearch]);

  useEffect(() => {
    if (!showProjectSearch) return;
    window.requestAnimationFrame(() => projectSearchInputRef.current?.focus());
  }, [showProjectSearch]);

  const syncEditorScroll = useCallback((event) => {
    const { scrollLeft, scrollTop } = event.currentTarget;
    if (highlightRef.current) {
      highlightRef.current.style.transform = `translate(${-scrollLeft}px, ${-scrollTop}px)`;
    }
    if (lineNumbersRef.current) {
      lineNumbersRef.current.style.transform = `translateY(${-scrollTop}px)`;
    }
  }, []);

  const scrollToSourceLine = useCallback(
    (sourceLine) => {
      const visibleIndex = findVisibleIndexForSourceLine(
        visibleLineRecords,
        sourceLine
      );
      const top = Math.max(0, visibleIndex * 24 - 96);

      window.requestAnimationFrame(() => {
        if (!editorRef.current) return;
        editorRef.current.scrollTop = top;
        const scrollLeft = editorRef.current.scrollLeft;
        if (highlightRef.current) {
          highlightRef.current.style.transform = `translate(${-scrollLeft}px, ${-top}px)`;
        }
        if (lineNumbersRef.current) {
          lineNumbersRef.current.style.transform = `translateY(${-top}px)`;
        }
      });
    },
    [visibleLineRecords]
  );

  const unfoldSourceLine = useCallback((sourceLine) => {
    setFoldedStarts((current) => {
      const next = new Set(current);
      let changed = false;
      for (const startLine of current) {
        const range = foldRanges.get(startLine);
        if (!range) continue;
        if (range.startLine <= sourceLine && range.endLine >= sourceLine) {
          next.delete(startLine);
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [foldRanges]);

  const revealSourceLine = useCallback(
    (sourceLine) => {
      unfoldSourceLine(sourceLine);
      window.setTimeout(() => scrollToSourceLine(sourceLine), 0);
    },
    [scrollToSourceLine, unfoldSourceLine]
  );

  const toggleFold = useCallback((sourceLine) => {
    setFoldedStarts((current) => {
      const next = new Set(current);
      if (next.has(sourceLine)) next.delete(sourceLine);
      else next.add(sourceLine);
      return next;
    });
  }, []);

  const goToFileSearchMatch = useCallback(
    (direction = 1) => {
      if (!fileSearchMatches.length) return;
      const nextIndex =
        (activeFileSearchIndex + direction + fileSearchMatches.length) %
        fileSearchMatches.length;
      setActiveFileSearchIndex(nextIndex);
      revealSourceLine(fileSearchMatches[nextIndex].line);
    },
    [activeFileSearchIndex, fileSearchMatches, revealSourceLine]
  );

  useEffect(() => {
    if (!showFileSearch || !fileSearchQuery || !fileSearchMatches.length) return;
    const activeMatch =
      fileSearchMatches[
        Math.min(activeFileSearchIndex, fileSearchMatches.length - 1)
      ];
    if (activeMatch) revealSourceLine(activeMatch.line);
  }, [
    activeFileSearchIndex,
    fileSearchMatches,
    fileSearchQuery,
    revealSourceLine,
    showFileSearch,
  ]);

  const openProjectSearch = useCallback(() => {
    setShowProjectSearch(true);
    setProjectSearchQuery("");
  }, []);

  const selectProjectSearchResult = useCallback(
    (result) => {
      if (!result) return;
      setSelectedPath(result.path);
      setShowProjectSearch(false);
      pendingRevealRef.current = {
        path: result.path,
        line: result.line || 0,
      };
      if (result.type === "content") {
        setFileSearchQuery(projectSearchQuery);
      }
    },
    [projectSearchQuery]
  );

  useEffect(() => {
    setDraft(selectedFile?.content || "");
    setDirty(false);
    setSaveState("saved");
    setRecentlySaved(false);
    setFoldedStarts(new Set());
    window.requestAnimationFrame(() => {
      if (editorRef.current) {
        editorRef.current.scrollTop = 0;
        editorRef.current.scrollLeft = 0;
      }
      if (highlightRef.current) {
        highlightRef.current.style.transform = "translate(0px, 0px)";
      }
      if (lineNumbersRef.current) {
        lineNumbersRef.current.style.transform = "translateY(0px)";
      }
    });
  }, [selectedFile?.path, selectedFile?.sourceZip]);

  useEffect(() => {
    const pending = pendingRevealRef.current;
    if (!pending || pending.path !== selectedFile?.path) return;

    pendingRevealRef.current = null;
    revealSourceLine(pending.line || 0);
  }, [revealSourceLine, selectedFile?.path, draft]);

  const saveSelectedDraftNow = useCallback(async () => {
    if (!selectedFile || !userDocId || !runId) return;

    const contentToSave = draft;
    setSaveState("saving");
    await setDoc(
      doc(
        db,
        ROOT_COLLECTION,
        userDocId,
        RUN_COLLECTION,
        runId,
        "sourceFiles",
        sourceFileDocId(selectedFile.path)
      ),
      {
        path: selectedFile.path,
        content: contentToSave,
        size: new TextEncoder().encode(contentToSave).length,
        editedInBrowser: true,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    await setDoc(
      doc(db, ROOT_COLLECTION, userDocId, RUN_COLLECTION, runId),
      {
        sourceHasManualEdits: true,
        manualSourceChangedFiles: arrayUnion(selectedFile.path),
        lastSourceChangeType: "manual_edit",
        sourceFilesUpdatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    const latestMatchesSavedContent = draftRef.current === contentToSave;
    setSaveState(latestMatchesSavedContent ? "saved" : "saving");
    setRecentlySaved(latestMatchesSavedContent);
    setDirty(!latestMatchesSavedContent);
  }, [draft, runId, selectedFile, userDocId]);

  useEffect(() => {
    if (!recentlySaved) return undefined;
    const timeout = window.setTimeout(() => setRecentlySaved(false), 1300);
    return () => window.clearTimeout(timeout);
  }, [recentlySaved]);

  useEffect(() => {
    const handleShortcut = async (event) => {
      const isCommand = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (isCommand && key === "s") {
        event.preventDefault();
        try {
          await saveSelectedDraftNow();
        } catch (err) {
          setSaveState("error");
          setError(err.message);
        }
        return;
      }

      if (isCommand && key === "f") {
        event.preventDefault();
        setShowFileSearch(true);
        return;
      }

      if (isCommand && key === "p") {
        event.preventDefault();
        openProjectSearch();
        return;
      }

      if (event.key === "Escape") {
        if (showProjectSearch) {
          event.preventDefault();
          setShowProjectSearch(false);
          return;
        }
        if (showFileSearch) {
          event.preventDefault();
          setShowFileSearch(false);
        }
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [openProjectSearch, saveSelectedDraftNow, showFileSearch, showProjectSearch]);

  useEffect(() => {
    if (!selectedFile || !dirty || !userDocId || !runId) return undefined;

    setSaveState("saving");
    const timeout = window.setTimeout(async () => {
      try {
        await saveSelectedDraftNow();
      } catch (err) {
        setSaveState("error");
        setError(err.message);
      }
    }, 650);

    return () => window.clearTimeout(timeout);
  }, [dirty, runId, saveSelectedDraftNow, selectedFile, userDocId]);

  const downloadZip = useCallback(() => {
    if (!files.length) return;
    const blob = createZipBlob(
      files.map((file) => ({
        path: file.path,
        content: file.path === selectedFile?.path ? draft : file.content,
      }))
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "labor-source.zip";
    anchor.click();
    URL.revokeObjectURL(url);
  }, [draft, files, selectedFile?.path]);

  const deployChanges = useCallback(async () => {
    if (!files.length || deployState || parentDeploymentRunning) return;

    const messageId = `code_deploy_${Date.now()}`;
    setDeployState("deploying");
    setDeployMessageId(messageId);
    setDeployProgress({
      status: "processing",
      phase: "saving_manual_source",
      finalTextMd: dirty
        ? "Saving edited source files before deployment."
        : "Preparing edited source files for deployment.",
      jsonData: {
        actionType: "app_generation",
        generationMode: "manual_edit",
      },
    });
    setDeployPanelOpen(true);
    setError("");
    try {
      if (dirty) {
        await saveSelectedDraftNow();
      }
      const result = await callAppGenerationAgent({
        action: "deploy_source_files",
        email: userDocId,
        runid: runId,
        messageid: messageId,
      });
      setDeployProgress((current) => ({
        ...current,
        status: "completed",
        phase: "completed",
        finalTextMd: "Edited source files are deployed and ready to preview.",
        jsonData: {
          ...(current?.jsonData || {}),
          buildId: result.buildId || current?.jsonData?.buildId || "",
          buildStatus: result.buildStatus || "SUCCESS",
        },
      }));
      onDeployed?.(result);
      onPreview?.();
    } catch (err) {
      setError(err.message);
      setDeployProgress((current) => ({
        ...current,
        status: "failed",
        phase: "failed",
        finalTextMd: err.message,
      }));
      setDeployPanelOpen(true);
    } finally {
      setDeployState("");
    }
  }, [
    deployState,
    dirty,
    files.length,
    onDeployed,
    onPreview,
    parentDeploymentRunning,
    runId,
    saveSelectedDraftNow,
    userDocId,
  ]);

  const repairFailedDeployment = useCallback(async () => {
    if (!deployMessageId || deployState) return;

    setDeployState("repairing");
    setDeployPanelOpen(true);
    setError("");

    try {
      const result = await callAppGenerationAgent({
        action: "fix_failed_deployment",
        email: userDocId,
        runid: runId,
        messageid: deployMessageId,
        buildId: deployProgress?.jsonData?.buildId || "",
        sourceZip: deployProgress?.jsonData?.sourceZip || "",
      });
      onDeployed?.(result);
      onPreview?.();
    } catch (err) {
      setError(err.message || "Could not repair this deployment.");
      setDeployPanelOpen(true);
    } finally {
      setDeployState("");
    }
  }, [
    deployMessageId,
    deployProgress?.jsonData?.buildId,
    deployProgress?.jsonData?.sourceZip,
    deployState,
    onDeployed,
    onPreview,
    runId,
    userDocId,
  ]);

  const handleEditorKeyDown = useCallback(
    (event) => {
      if (event.key !== "Tab") return;
      if (hasActiveFolds) return;

      event.preventDefault();
      const textarea = event.currentTarget;
      const { selectionEnd, selectionStart } = textarea;
      const indent = "  ";
      const nextDraft =
        draft.slice(0, selectionStart) + indent + draft.slice(selectionEnd);

      setDraft(nextDraft);
      setDirty(true);
      window.requestAnimationFrame(() => {
        textarea.selectionStart = selectionStart + indent.length;
        textarea.selectionEnd = selectionStart + indent.length;
      });
    },
    [draft, hasActiveFolds]
  );

  return (
    <div className="tk-glass-editor relative flex h-full min-h-0 flex-col bg-[#080808] text-slate-300">
      <div className="tk-glass-toolbar flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-[#0A0A0A] px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-8 w-8 place-items-center rounded-xl bg-white/10 text-white">
            <Code2 size={16} strokeWidth={1.5} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-white">Source Code</div>
            <div
              className={[
                "truncate text-xs transition-colors duration-300",
                saveState === "saving"
                  ? "text-orange-300"
                  : saveState === "error"
                    ? "text-red-300"
                    : dirty
                      ? "text-orange-200"
                      : recentlySaved
                        ? "text-emerald-300"
                        : "text-slate-500",
              ].join(" ")}
            >
              {hasActiveFolds
                ? "Folded view"
                : saveState === "saving"
                  ? "Saving..."
                : saveState === "error"
                  ? "Save failed"
                  : dirty
                    ? "Unsaved"
                    : recentlySaved
                      ? "Saved"
                      : "Autosaved"}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={async () => {
              try {
                await saveSelectedDraftNow();
              } catch (err) {
                setSaveState("error");
                setError(err.message);
              }
            }}
            disabled={!selectedFile || saveState === "saving"}
            className="grid h-9 w-9 place-items-center rounded-xl bg-black/40 text-slate-300 backdrop-blur-md border border-white/5 transition-all hover:bg-white/20 hover:text-white disabled:opacity-40"
            title="Save (Cmd/Ctrl+S)"
            aria-label="Save"
          >
            {saveState === "saving" ? (
              <Loader2 className="animate-spin" size={15} />
            ) : (
              <Save size={15} strokeWidth={1.5} />
            )}
          </button>
          <button
            type="button"
            onClick={downloadZip}
            disabled={!files.length}
            className="grid h-9 w-9 place-items-center rounded-xl bg-black/40 text-slate-300 backdrop-blur-md border border-white/5 transition-all hover:bg-white/20 hover:text-white disabled:opacity-40"
            title="Download source"
            aria-label="Download source"
          >
            <Download size={15} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={() => {
              if (deployState) {
                setDeployPanelOpen(true);
                return;
              }
              deployChanges();
            }}
            disabled={!files.length || parentDeploymentRunning}
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-white px-3 text-xs font-medium text-black transition-all hover:bg-slate-200 disabled:bg-white/10 disabled:text-slate-500"
            title={
              parentDeploymentRunning
                ? "Current deployment is still running"
                : deployState
                  ? "Show deployment logs"
                  : "Deploy changes"
            }
            aria-expanded={deployState ? deployPanelOpen : undefined}
          >
            {deployState ? (
              <Loader2 className="animate-spin" size={14} />
            ) : (
              <Rocket size={14} strokeWidth={1.7} />
            )}
            {deployState ? "Build Logs" : "Deploy Changes"}
          </button>
          <button
            type="button"
            onClick={onPreview}
            className="grid h-9 w-9 place-items-center rounded-xl bg-black/40 text-slate-300 backdrop-blur-md border border-white/5 transition-all hover:bg-white/20 hover:text-white"
            title={previewControlLabel}
            aria-label={previewControlLabel}
          >
            <Eye size={15} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={onToggleFullscreen}
            className="grid h-9 w-9 place-items-center rounded-xl bg-black/40 text-slate-300 backdrop-blur-md border border-white/5 transition-all hover:bg-white/20 hover:text-white"
            title={isFullscreen ? "Restore" : "Fullscreen"}
            aria-label={isFullscreen ? "Restore editor" : "Fullscreen editor"}
          >
            {isFullscreen ? (
              <Minimize2 size={15} strokeWidth={1.5} />
            ) : (
              <Maximize2 size={15} strokeWidth={1.5} />
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-200">
          {error}
        </div>
      )}

      {deployPanelOpen && deployProgress ? (
        <div className="pointer-events-none absolute left-1/2 top-[68px] z-50 w-[calc(100%-32px)] max-w-4xl -translate-x-1/2">
          <div className="pointer-events-none absolute -top-1.5 right-24 h-3 w-3 rotate-45 border-l border-t border-white/10 bg-[#101010]" />
          <CloudBuildLogPanel
            reply={deployProgress}
            forceTerminal
            terminalClassName="h-56"
            className="pointer-events-auto w-full"
            title={
              deployState === "repairing"
                ? "Repairing deployment..."
                : deployState
                  ? "Deploying code changes..."
                  : ""
            }
            onFixAndRedeploy={
              deployProgress.status === "failed"
                ? repairFailedDeployment
                : undefined
            }
            fixing={deployState === "repairing"}
            repairError={deployProgress.status === "failed" ? error : ""}
            onClose={() => setDeployPanelOpen(false)}
          />
        </div>
      ) : null}

      {showProjectSearch && (
        <div className="absolute inset-0 z-40 bg-black/40 px-4 pt-16 backdrop-blur-sm">
          <div className="tk-glass-float mx-auto flex max-h-[70vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#1e1e1e] shadow-2xl">
            <div className="flex h-12 shrink-0 items-center gap-3 border-b border-[#2b2b2b] px-4">
              <FolderSearch size={16} strokeWidth={1.7} className="text-[#858585]" />
              <input
                ref={projectSearchInputRef}
                value={projectSearchQuery}
                onChange={(event) => setProjectSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setProjectActiveIndex((current) =>
                      projectSearchResults.length
                        ? (current + 1) % projectSearchResults.length
                        : 0
                    );
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setProjectActiveIndex((current) =>
                      projectSearchResults.length
                        ? (current - 1 + projectSearchResults.length) %
                          projectSearchResults.length
                        : 0
                    );
                  }
                  if (event.key === "Enter") {
                    event.preventDefault();
                    selectProjectSearchResult(projectSearchResults[projectActiveIndex]);
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setShowProjectSearch(false);
                  }
                }}
                className="min-w-0 flex-1 bg-transparent text-sm text-[#f1f1f1] outline-none placeholder:text-[#6f6f6f]"
                placeholder="Search files and code"
              />
              <span className="rounded bg-[#2a2d2e] px-2 py-1 text-[10px] text-[#858585]">
                ⌘P
              </span>
              <button
                type="button"
                onClick={() => setShowProjectSearch(false)}
                className="grid h-7 w-7 place-items-center rounded-md text-[#858585] hover:bg-[#2a2d2e] hover:text-white"
                aria-label="Close project search"
              >
                <X size={14} />
              </button>
            </div>
            <div className="tk-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
              {!projectSearchQuery.trim() && (
                <div className="px-3 py-8 text-center text-sm text-[#858585]">
                  Type a file name, symbol, or text from the project.
                </div>
              )}
              {projectSearchQuery.trim() && !projectSearchResults.length && (
                <div className="px-3 py-8 text-center text-sm text-[#858585]">
                  No local matches.
                </div>
              )}
              {projectSearchResults.map((result, index) => (
                <button
                  key={`${result.type}:${result.path}:${result.line}:${index}`}
                  type="button"
                  onMouseEnter={() => setProjectActiveIndex(index)}
                  onClick={() => selectProjectSearchResult(result)}
                  className={[
                    "flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                    index === projectActiveIndex
                      ? "bg-[#37373d] text-white"
                      : "text-[#cccccc] hover:bg-[#2a2d2e]",
                  ].join(" ")}
                >
                  <FileCode2
                    size={15}
                    strokeWidth={1.6}
                    className="mt-0.5 shrink-0 text-[#8ab4f8]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">
                      {result.label}
                    </span>
                    <span className="mt-1 block truncate text-xs text-[#858585]">
                      {result.detail}
                    </span>
                  </span>
                  <span className="rounded bg-[#252526] px-1.5 py-0.5 text-[10px] uppercase text-[#858585]">
                    {result.type === "file" ? "file" : "text"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[280px] shrink-0 flex-col border-r border-[#2b2b2b] bg-[#181818]">
          <div className="flex h-9 shrink-0 items-center border-b border-[#2b2b2b] px-3 text-[11px] font-medium uppercase tracking-[0.08em] text-[#cccccc]">
            Explorer
          </div>
          <div className="tk-scrollbar min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {!files.length && (
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-slate-500">
              {syncing ? "Loading source files..." : "No source files are saved for this run yet."}
            </div>
          )}
          {fileTree.map((node) => (
            <FileTreeItem
              key={`${node.type}:${node.path}`}
              node={node}
              level={0}
              expandedFolders={expandedFolders}
              onToggleFolder={toggleFolder}
              onSelectPath={setSelectedPath}
              selectedPath={selectedFile?.path || ""}
            />
          ))}
          </div>
          <div className="flex h-10 shrink-0 items-center border-t border-[#2b2b2b] px-2">
            <button
              type="button"
              onClick={openProjectSearch}
              className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-[#cccccc] transition-colors hover:bg-[#2a2d2e] hover:text-white"
              title="Search project (Cmd/Ctrl+P)"
            >
              <FolderSearch size={14} strokeWidth={1.6} className="text-[#858585]" />
              <span className="min-w-0 flex-1 truncate">Search project</span>
              <span className="rounded bg-[#2a2d2e] px-1.5 py-0.5 text-[10px] text-[#858585]">
                ⌘P
              </span>
            </button>
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col bg-[#1e1e1e]">
          <div className="flex h-9 shrink-0 items-center justify-between border-b border-[#2b2b2b] bg-[#181818]">
            <div className="flex h-full min-w-0 items-center border-r border-[#2b2b2b] bg-[#1e1e1e] px-4 text-xs text-[#d4d4d4]">
              <FileCode2 size={13} strokeWidth={1.6} className="mr-2 shrink-0 text-[#858585]" />
              <span className="min-w-0 truncate">
              {selectedFile?.path || "No file selected"}
              </span>
            </div>
            <div className="flex min-w-0 items-center gap-2 px-3">
              {showFileSearch && (
                <div className="flex h-7 min-w-[260px] items-center gap-1 rounded-md border border-[#3c3c3c] bg-[#252526] px-2 text-xs text-[#cccccc]">
                  <Search size={13} strokeWidth={1.7} className="shrink-0 text-[#858585]" />
                  <input
                    ref={fileSearchInputRef}
                    value={fileSearchQuery}
                    onChange={(event) => setFileSearchQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        goToFileSearchMatch(event.shiftKey ? -1 : 1);
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setShowFileSearch(false);
                      }
                    }}
                    className="min-w-0 flex-1 bg-transparent text-xs text-[#d4d4d4] outline-none placeholder:text-[#6f6f6f]"
                    placeholder="Find in file"
                  />
                  <span className="shrink-0 tabular-nums text-[11px] text-[#858585]">
                    {fileSearchMatches.length
                      ? `${Math.min(activeFileSearchIndex + 1, fileSearchMatches.length)}/${fileSearchMatches.length}`
                      : "0/0"}
                  </span>
                  <button
                    type="button"
                    onClick={() => goToFileSearchMatch(-1)}
                    className="grid h-5 w-5 place-items-center rounded text-[#858585] hover:bg-[#3a3d41] hover:text-white"
                    title="Previous match"
                    aria-label="Previous match"
                  >
                    <ChevronUp size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => goToFileSearchMatch(1)}
                    className="grid h-5 w-5 place-items-center rounded text-[#858585] hover:bg-[#3a3d41] hover:text-white"
                    title="Next match"
                    aria-label="Next match"
                  >
                    <ChevronDown size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowFileSearch(false)}
                    className="grid h-5 w-5 place-items-center rounded text-[#858585] hover:bg-[#3a3d41] hover:text-white"
                    title="Close search"
                    aria-label="Close search"
                  >
                    <X size={13} />
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={() => setShowFileSearch(true)}
                className="grid h-7 w-7 place-items-center rounded-md text-[#858585] transition-colors hover:bg-[#2a2d2e] hover:text-white"
                title="Find in current file (Cmd/Ctrl+F)"
                aria-label="Find in current file"
              >
                <Search size={14} strokeWidth={1.7} />
              </button>
              <div className="hidden shrink-0 text-[11px] uppercase tracking-[0.12em] text-[#858585] md:block">
                {selectedFile ? fileLanguage(selectedFile.path) : ""}
              </div>
            </div>
          </div>
          <div className="relative min-h-0 flex-1 overflow-hidden bg-[#1e1e1e]">
            <div className="absolute inset-y-0 left-0 z-20 w-20 overflow-hidden border-r border-[#252526] bg-[#1e1e1e] py-4">
              <div
                ref={lineNumbersRef}
                className="font-mono text-[13px] leading-6 text-[#858585]"
              >
                {visibleLineRecords.map((record) => {
                  const range = foldRanges.get(record.sourceLine);
                  const canFold = Boolean(range);
                  const isFolded = foldedStarts.has(record.sourceLine);

                  return (
                    <div
                      key={`${record.sourceLine}:${record.endLine}`}
                      className="group flex h-6 items-center px-1"
                    >
                      <span className="w-12 shrink-0 pr-2 text-right tabular-nums">
                        {record.sourceLine + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => canFold && toggleFold(record.sourceLine)}
                        disabled={!canFold}
                        className={[
                          "grid h-5 w-5 shrink-0 place-items-center rounded text-[#858585] transition-colors",
                          canFold
                            ? "opacity-60 hover:bg-[#2a2d2e] hover:text-white group-hover:opacity-100"
                            : "opacity-0",
                        ].join(" ")}
                        title={
                          canFold
                            ? isFolded
                              ? "Expand block"
                              : "Collapse block"
                            : ""
                        }
                        aria-label={
                          canFold
                            ? isFolded
                              ? "Expand block"
                              : "Collapse block"
                            : "No fold"
                        }
                      >
                        {isFolded ? (
                          <ChevronRight size={13} strokeWidth={1.7} />
                        ) : (
                          <ChevronDown size={13} strokeWidth={1.7} />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="absolute inset-y-0 left-20 right-0 overflow-hidden">
              <div
                ref={highlightRef}
                aria-hidden="true"
                className="pointer-events-none absolute left-0 top-0 min-h-full min-w-full whitespace-pre px-4 py-4 font-mono text-[13px] leading-6 text-[#d4d4d4]"
                style={{ tabSize: 2 }}
              >
                {visibleLineRecords.map((record) => {
                  const lineMatches = fileSearchMatchesByLine.get(record.sourceLine) || [];
                  const isActiveSearchLine = lineMatches.some(
                    (match) => match.index === activeFileSearchIndex
                  );

                  return (
                    <div
                      key={`${record.sourceLine}:${record.endLine}:code`}
                      className={[
                        "h-6 min-w-max",
                        record.folded ? "text-[#9cdcfe]" : "",
                        isActiveSearchLine ? "bg-[#36321f]" : "",
                      ].join(" ")}
                      dangerouslySetInnerHTML={{
                        __html: highlightLineWithSearch(
                          record.text,
                          selectedFile?.path || "",
                          lineMatches,
                          activeFileSearchIndex
                        ),
                      }}
                    />
                  );
                })}
              </div>
              <textarea
                ref={editorRef}
                value={editorText}
                onChange={(event) => {
                  if (hasActiveFolds) return;
                  setDraft(event.target.value);
                  setDirty(true);
                }}
                onKeyDown={handleEditorKeyDown}
                onScroll={syncEditorScroll}
                spellCheck={false}
                wrap="off"
                disabled={!selectedFile}
                readOnly={hasActiveFolds}
                className="tk-code-input tk-scrollbar absolute inset-0 z-10 min-h-full w-full resize-none overflow-auto bg-transparent px-4 py-4 font-mono text-[13px] leading-6 text-transparent caret-[#d4d4d4] outline-none placeholder:text-[#858585] disabled:opacity-50"
                style={{ tabSize: 2 }}
                placeholder={
                  hasActiveFolds
                    ? "Expand folded blocks to edit."
                    : "Select a source file to edit."
                }
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default GeneratedCodeWorkspace;
