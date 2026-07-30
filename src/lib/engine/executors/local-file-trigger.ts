import type { NodeExecutor, INodeExecutionData } from "@/sdk";

interface FsEvent {
  event?: string;
  path?: string;
  initial?: boolean;
}

interface WatchOptions {
  awaitWriteFinish?: boolean;
  followSymlinks?: boolean;
  ignored?: string;
  ignoreInitial?: boolean;
  depth?: number;
  usePolling?: boolean;
  ignoreMode?: string;
}

const FOLDER_EVENTS = new Set(["add", "change", "unlink", "addDir", "unlinkDir"]);

/**
 * Convert an Anymatch-style glob pattern into a RegExp. Supports `**`, `*`,
 * `?`, and literal characters. `**\/` matches zero or more leading path
 * segments; a bare `*` does not cross path separators.
 */
function globToRegex(pattern: string): RegExp {
  let re = "";
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        i += 2;
        if (pattern[i] === "/") {
          i++;
          re += "(?:.*/)?";
        } else {
          re += ".*";
        }
      } else {
        re += "[^/]*";
        i++;
      }
    } else if (c === "?") {
      re += "[^/]";
      i++;
    } else if (c === ".") {
      re += "\\.";
      i++;
    } else if ("+()|^$\\{}[]".includes(c)) {
      re += "\\" + c;
      i++;
    } else {
      re += c;
      i++;
    }
  }
  return new RegExp("^(?:" + re + ")$");
}

function isIgnored(eventPath: string, ignored: string, ignoreMode: string): boolean {
  if (!ignored) return false;
  if (ignoreMode === "contain") {
    return eventPath.includes(ignored);
  }
  try {
    return globToRegex(ignored).test(eventPath);
  } catch {
    return false;
  }
}

/** Number of directory separators below the watched root. */
function relativeDepth(watchedPath: string, eventPath: string): number {
  let rel = eventPath;
  if (rel.startsWith(watchedPath)) {
    rel = rel.slice(watchedPath.length);
  }
  rel = rel.replace(/^\/+/, "").replace(/\/+$/, "");
  if (rel === "") return 0;
  return rel.split("/").length - 1;
}

/**
 * Local File Trigger — emits one item per accepted filesystem event under the
 * watched file or folder.
 *
 * Input contract (host → executor): the host owns the long-lived FS watcher
 * and feeds each raw watcher event as an input item whose `json` carries:
 *   - `event`: watcher change kind (add | change | unlink | addDir | unlinkDir)
 *   - `path`:  absolute filesystem path of the affected entry
 *   - `initial`: optional, true for entries present when the watcher armed
 *
 * The executor validates configuration (arming errors), then applies the
 * documented filters: mode (file vs folder), selected `events`, ignore rules
 * (match/contain), depth, and ignoreInitial. Each accepted event is emitted
 * as `{ json: { event, path } }`.
 *
 * Gaps (documented TODOs):
 * - Host-side watcher lifecycle (arm/disarm, reconnect, watch-limit errors)
 * - Expression resolution on `path` / `ignored` (host resolves at arm time)
 * - awaitWriteFinish / usePolling / followSymlinks (host watcher tuning)
 * - Regex-as-string ignore patterns (macOS limitation noted in spec)
 */
export const localFileTriggerExecutor: NodeExecutor = async (ctx) => {
  const triggerOn = ctx.getParam<string>("triggerOn", "");
  const path = ctx.getParam<string>("path", "");
  const events = ctx.getParam<string[]>("events", []) ?? [];
  const options = ctx.getParam<WatchOptions>("options", {}) ?? {};
  const ignoreInitial = options.ignoreInitial !== false;
  const ignored = String(options.ignored ?? "");
  const ignoreMode = String(options.ignoreMode ?? "match");
  const depth = options.depth ?? -1;

  if (!triggerOn) {
    throw new Error("Local File Trigger: 'triggerOn' is required (file or folder)");
  }
  if (!path) {
    throw new Error("Local File Trigger: 'path' is required");
  }
  if (triggerOn === "folder" && events.length === 0) {
    throw new Error("Local File Trigger: 'events' is required in folder mode");
  }

  const inputItems = ctx.getInputItems(0);
  const out: INodeExecutionData[] = [];

  for (const item of inputItems) {
    const evt = (item.json ?? {}) as FsEvent;
    const eventPath = String(evt.path ?? "");
    const eventType = String(evt.event ?? "");

    if (!eventPath) continue;
    if (ignoreInitial && evt.initial === true) continue;

    if (triggerOn === "file") {
      if (eventPath !== path) continue;
      if (ignored && isIgnored(eventPath, ignored, ignoreMode)) continue;
      out.push({ json: { event: "change", path: eventPath } });
      continue;
    }

    if (!FOLDER_EVENTS.has(eventType)) continue;
    if (!events.includes(eventType)) continue;
    if (ignored && isIgnored(eventPath, ignored, ignoreMode)) continue;
    if (depth !== -1 && relativeDepth(path, eventPath) > depth) continue;

    out.push({ json: { event: eventType, path: eventPath } });
  }

  if (inputItems.length === 0) {
    return [[{ json: {} }]];
  }
  return [out];
};
