import { createRequire } from "node:module";
import { delimiter, join, normalize, relative, resolve, sep } from "node:path";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import { readFile, readdir, stat } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { accessSync, constants, promises } from "node:fs";
import { tmpdir } from "node:os";
import { EventEmitter } from "node:events";
//#region \0rolldown/runtime.js
var __create = Object.create;
var __defProp$1 = Object.defineProperty;
var __getOwnPropDesc$1 = Object.getOwnPropertyDescriptor;
var __getOwnPropNames$1 = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp$1 = Object.prototype.hasOwnProperty;
var __esmMin = (fn, res, err) => () => {
	if (err) throw err[0];
	try {
		return fn && (res = fn(fn = 0)), res;
	} catch (e) {
		throw err = [e], e;
	}
};
var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp$1(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp$1(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
var __copyProps$1 = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames$1(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp$1.call(to, key) && key !== except) __defProp$1(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc$1(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps$1(isNodeMode || !mod || !mod.__esModule ? __defProp$1(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
var __require = /* #__PURE__ */ (() => createRequire(import.meta.url))();
function createDeltaThrottle(flush, opts) {
	const ms = opts?.ms ?? 300;
	const chars = opts?.chars ?? 80;
	let timer;
	let lastFlushedChars = 0;
	let queuedChars = 0;
	let pending = Promise.resolve();
	const runFlush = () => {
		if (timer) {
			clearTimeout(timer);
			timer = void 0;
		}
		lastFlushedChars = queuedChars;
		pending = pending.then(() => Promise.resolve(flush())).catch(() => void 0);
		return pending;
	};
	return {
		push(totalChars) {
			queuedChars = totalChars;
			if (totalChars - lastFlushedChars >= chars) {
				runFlush();
				return;
			}
			if (!timer) timer = setTimeout(() => {
				runFlush();
			}, ms);
		},
		async flush() {
			if (timer || queuedChars !== lastFlushedChars) {
				await runFlush();
				return;
			}
			await pending;
		}
	};
}
const TRACE_TEXT_CAP = 4e3;
const PROGRESS_TEXT_CAP = 2e3;
function capText(value, max = TRACE_TEXT_CAP) {
	if (value == null) return void 0;
	if (value.length <= max) return value;
	return `${value.slice(0, max)}…`;
}
function capTrace(trace) {
	return { turns: trace.turns.map((turn) => ({
		...turn,
		assistantText: capText(turn.assistantText),
		reasoning: capText(turn.reasoning),
		toolCalls: turn.toolCalls.map((call) => ({ ...call })),
		observations: turn.observations.map((obs) => ({
			tool: obs.tool,
			content: capText(obs.content) ?? ""
		}))
	})) };
}
function usageFromResult(result) {
	const u = result.usage;
	if (!u || typeof u !== "object") return void 0;
	const uu = u;
	if (typeof uu.promptTokens !== "number" && typeof uu.completionTokens !== "number") return;
	return {
		promptTokens: typeof uu.promptTokens === "number" ? uu.promptTokens : 0,
		completionTokens: typeof uu.completionTokens === "number" ? uu.completionTokens : 0,
		...typeof uu.totalTokens === "number" ? { totalTokens: uu.totalTokens } : {}
	};
}
function nowIso() {
	return (/* @__PURE__ */ new Date()).toISOString();
}
function spanMs(start, end) {
	if (!start || !end) return void 0;
	const a = Date.parse(start);
	const b = Date.parse(end);
	if (!Number.isFinite(a) || !Number.isFinite(b)) return void 0;
	return Math.max(0, b - a);
}
function closeOpenSpans(turns, status = "error") {
	const end = nowIso();
	for (const turn of turns) {
		if (turn.status === "running") {
			turn.status = status;
			turn.finishedAt = turn.finishedAt ?? end;
			turn.durationMs = spanMs(turn.startedAt, turn.finishedAt);
		}
		for (const call of turn.toolCalls) if (call.status === "running") {
			call.status = status;
			call.finishedAt = call.finishedAt ?? end;
			call.durationMs = spanMs(call.startedAt, call.finishedAt);
		}
	}
}
var NodeExecutionError = class extends Error {
	items;
	trace;
	constructor(message, extras) {
		super(message);
		this.name = "NodeExecutionError";
		this.items = extras?.items;
		this.trace = extras?.trace;
	}
};
//#endregion
//#region src/lib/nodes/type-ids.ts
/**
* OpenFlow canonical node type ids with n8n wire-string aliases for import/export.
*
* Canonical:
*   openflow-node-base.<short>
*   openflow-node-langchain.<short>
*   openflow.*  (native-only)
*
* Wire (n8n-compatible JSON):
*   n8n-nodes-base.<short>
*   @n8n/n8n-nodes-langchain.<short>
*/
const OPENFLOW_BASE_PREFIX = "openflow-node-base.";
const OPENFLOW_LANGCHAIN_PREFIX = "openflow-node-langchain.";
const OPENFLOW_MCP_PREFIX = "openflow-node-mcp.";
const WIRE_BASE_PREFIX = "n8n-nodes-base.";
const WIRE_LANGCHAIN_PREFIX = "@n8n/n8n-nodes-langchain.";
const WIRE_MCP_PREFIX = "n8n-nodes-mcp.";
const WIRE_LC = WIRE_LANGCHAIN_PREFIX;
const CANON_LC = OPENFLOW_LANGCHAIN_PREFIX;
/** Map any known form of a type id to the OpenFlow canonical form. */
function toCanonicalType(type) {
	if (!type) return type;
	if (type.startsWith("openflow-node-base.") || type.startsWith("openflow-node-langchain.") || type.startsWith("openflow-node-mcp.")) return type;
	if (type.startsWith("n8n-nodes-base.")) return OPENFLOW_BASE_PREFIX + type.slice(15);
	if (type.startsWith("nodes-base.")) return OPENFLOW_BASE_PREFIX + type.slice(11);
	if (type.startsWith(WIRE_LC)) return CANON_LC + type.slice(25);
	if (type.startsWith("n8n-nodes-langchain.")) return CANON_LC + type.slice(20);
	if (type.startsWith("n8n-nodes-mcp.")) return OPENFLOW_MCP_PREFIX + type.slice(14);
	return type;
}
/** Map to public n8n-compatible wire type for export. Native openflow.* unchanged. */
function toWireType(type) {
	if (!type) return type;
	if (type.startsWith("openflow-node-base.")) return WIRE_BASE_PREFIX + type.slice(19);
	if (type.startsWith("openflow-node-langchain.")) return WIRE_LC + type.slice(24);
	if (type.startsWith("openflow-node-mcp.")) return WIRE_MCP_PREFIX + type.slice(18);
	if (type.startsWith("nodes-base.")) return WIRE_BASE_PREFIX + type.slice(11);
	return type;
}
function typesEqual(a, b) {
	return toCanonicalType(a) === toCanonicalType(b);
}
//#endregion
//#region src/lib/engine/graph.ts
/** Known trigger type strings (fallback when description lookup is thin). */
const TRIGGER_TYPES = new Set([
	"n8n-nodes-base.manualTrigger",
	"n8n-nodes-base.manualWorkflowTrigger",
	"n8n-nodes-base.start",
	"n8n-nodes-base.webhook",
	"n8n-nodes-base.scheduleTrigger",
	"n8n-nodes-base.executeWorkflowTrigger",
	"n8n-nodes-base.errorTrigger",
	"n8n-nodes-base.formTrigger",
	"n8n-nodes-base.sseTrigger",
	"n8n-nodes-base.localFileTrigger",
	"n8n-nodes-base.workflowTrigger",
	"n8n-nodes-base.activationTrigger",
	"n8n-nodes-base.n8nTrigger",
	"@n8n/n8n-nodes-langchain.chatTrigger",
	"@n8n/n8n-nodes-langchain.manualChatTrigger",
	"@n8n/n8n-nodes-langchain.mcpTrigger"
].map(toCanonicalType));
function isTriggerNode(node) {
	if (node.disabled) return false;
	if (TRIGGER_TYPES.has(toCanonicalType(node.type))) return true;
	return false;
}
/** Enabled trigger nodes on the canvas (for Execute menu). */
function listTriggerNodes(workflow) {
	return workflow.nodes.filter((n) => isTriggerNode(n));
}
function buildAdjacency(connections) {
	const adj = /* @__PURE__ */ new Map();
	for (const [sourceName, channels] of Object.entries(connections)) for (const outputs of Object.values(channels)) for (const targets of outputs) {
		if (!targets) continue;
		for (const t of targets) {
			if (!t) continue;
			const list = adj.get(sourceName);
			if (list) {
				if (!list.includes(t.node)) list.push(t.node);
			} else adj.set(sourceName, [t.node]);
		}
	}
	return adj;
}
function buildIncoming(connections) {
	const incoming = /* @__PURE__ */ new Map();
	for (const [sourceName, channels] of Object.entries(connections)) for (const [sourceChannel, outputs] of Object.entries(channels)) outputs.forEach((targets, sourceOutput) => {
		if (!targets) return;
		for (const t of targets) {
			if (!t) continue;
			const list = incoming.get(t.node) ?? [];
			list.push({
				source: sourceName,
				sourceOutput,
				targetInput: t.index ?? 0,
				channel: t.type ?? sourceChannel ?? "main"
			});
			incoming.set(t.node, list);
		}
	});
	return incoming;
}
/**
* Resolve which node(s) start a run.
* @param preferredStart optional single trigger/node name from the editor
*/
function resolveStartNodes(workflow, preferredStart) {
	const known = new Set(workflow.nodes.map((n) => n.name));
	if (preferredStart && known.has(preferredStart)) {
		const node = workflow.nodes.find((n) => n.name === preferredStart);
		if (node && !node.disabled) return [preferredStart];
	}
	const triggers = listTriggerNodes(workflow);
	if (triggers.length > 0) return [triggers.find((n) => typesEqual(n.type, "n8n-nodes-base.manualTrigger") || typesEqual(n.type, "n8n-nodes-base.manualWorkflowTrigger") || typesEqual(n.type, "n8n-nodes-base.start"))?.name ?? triggers[0].name];
	if (workflow.nodes.length > 0) {
		const first = workflow.nodes.find((n) => !n.disabled);
		if (first) return [first.name];
	}
	return [];
}
/** All node names reachable from `starts` following outgoing edges (including starts). */
function nodesReachableFrom(adjacency, starts) {
	const visited = /* @__PURE__ */ new Set();
	const queue = [...starts];
	while (queue.length > 0) {
		const n = queue.shift();
		if (visited.has(n)) continue;
		visited.add(n);
		for (const t of adjacency.get(n) ?? []) if (!visited.has(t)) queue.push(t);
	}
	return visited;
}
/**
* All ancestors of `target` via main (and other) incoming edges, optionally
* including the target itself.
*/
function nodesLeadingTo(incoming, target, opts) {
	const visited = /* @__PURE__ */ new Set();
	const queue = [target];
	while (queue.length > 0) {
		const n = queue.shift();
		if (visited.has(n)) continue;
		visited.add(n);
		for (const edge of incoming.get(n) ?? []) if (!visited.has(edge.source)) queue.push(edge.source);
	}
	if (opts?.includeTarget === false) visited.delete(target);
	return visited;
}
/**
* Grow `reachable` to include the sub-nodes the reachable nodes depend on.
*
* Sub-nodes (a chat model, a tool, a memory) attach to their parent over a
* non-`main` channel and point *into* it, so a forward walk from the trigger
* never lands on them — an agent would run with no model attached. They are
* dependencies, not downstream steps, so pull them in from the other end.
*
* Transitive on purpose: a tool may have its own model hanging off it.
*/
function addSubNodeDependencies(incoming, reachable) {
	const queue = [...reachable];
	while (queue.length > 0) {
		const n = queue.shift();
		for (const edge of incoming.get(n) ?? []) {
			if (edge.channel === "main" || reachable.has(edge.source)) continue;
			reachable.add(edge.source);
			queue.push(edge.source);
		}
	}
	return reachable;
}
/** Restrict adjacency to a set of nodes (edges only when both ends are in the set). */
function filterAdjacency(adjacency, keep) {
	const next = /* @__PURE__ */ new Map();
	for (const name of keep) {
		const outs = (adjacency.get(name) ?? []).filter((t) => keep.has(t));
		next.set(name, outs);
	}
	return next;
}
function topologicalSort(adjacency) {
	const allNodes = /* @__PURE__ */ new Set();
	for (const [src, targets] of adjacency) {
		allNodes.add(src);
		for (const t of targets) allNodes.add(t);
	}
	const inDegree = /* @__PURE__ */ new Map();
	for (const n of allNodes) inDegree.set(n, 0);
	for (const targets of adjacency.values()) for (const t of targets) inDegree.set(t, (inDegree.get(t) ?? 0) + 1);
	const queue = [];
	for (const [n, deg] of inDegree) if (deg === 0) queue.push(n);
	const result = [];
	while (queue.length > 0) {
		const node = queue.shift();
		result.push(node);
		for (const t of adjacency.get(node) ?? []) {
			const deg = (inDegree.get(t) ?? 1) - 1;
			inDegree.set(t, deg);
			if (deg === 0) queue.push(t);
		}
	}
	for (const n of allNodes) if (!result.includes(n)) result.push(n);
	return result;
}
//#endregion
//#region src/lib/expressions/evaluate.ts
function isExpression(value) {
	if (typeof value !== "string") return false;
	return value.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(value);
}
/** Date subclass that adds a `.plus(amount, unit)` helper for $now. */
var FlowDate = class FlowDate extends Date {
	plus(amount, unit) {
		const d = new FlowDate(this.getTime());
		switch (unit) {
			case "second":
				d.setSeconds(d.getSeconds() + amount);
				break;
			case "minute":
				d.setMinutes(d.getMinutes() + amount);
				break;
			case "hour":
				d.setHours(d.getHours() + amount);
				break;
			case "day":
				d.setDate(d.getDate() + amount);
				break;
			case "month":
				d.setMonth(d.getMonth() + amount);
				break;
			case "year":
				d.setFullYear(d.getFullYear() + amount);
				break;
		}
		return d;
	}
};
/**
* Minimal JMESPath-like query engine.
* Supports: "key", "[*]", "items[*].field", "items[0].field", "a.b.c".
*/
function jmespath(query, data) {
	if (query == null || query === "") return data;
	let current = data;
	let mapMode = false;
	const getKey = (val, k) => {
		if (val == null || typeof val !== "object") return void 0;
		return val[k];
	};
	for (const seg of String(query).split(".")) {
		if (current == null) return null;
		const m = seg.match(/^([^[]*)?(\[(\*|\d+)\])?$/);
		if (!m) continue;
		const key = m[1] || "";
		const bracket = m[3];
		if (key) if (mapMode) {
			if (!Array.isArray(current)) return null;
			current = current.map((item) => getKey(item, key));
		} else current = getKey(current, key);
		if (bracket !== void 0) if (bracket === "*") {
			if (!Array.isArray(current)) return null;
			mapMode = true;
		} else {
			const idx = parseInt(bracket, 10);
			if (mapMode) {
				if (!Array.isArray(current)) return null;
				current = current.map((item) => Array.isArray(item) ? item[idx] : null);
			} else {
				if (!Array.isArray(current)) return null;
				current = current[idx];
			}
		}
	}
	return current;
}
function buildScope(ctx) {
	const items = ctx.allItems ?? [{ json: ctx.json }];
	const nodeAccessor = (name) => {
		const data = ctx.nodeData?.[name] ?? [];
		return {
			all: () => data,
			first: () => data[0] ?? { json: {} },
			last: () => data[data.length - 1] ?? { json: {} },
			item: data[ctx.itemIndex ?? 0] ?? { json: {} },
			isExecuted: data.length > 0
		};
	};
	const envRaw = ctx.env ?? {};
	const allow = ctx.envAllowlist;
	const $env = allow ? Object.fromEntries(allow.filter((k) => k in envRaw).map((k) => [k, envRaw[k]])) : envRaw;
	return {
		$json: ctx.json,
		$itemIndex: ctx.itemIndex ?? 0,
		$input: {
			all: () => items,
			first: () => items[0] ?? { json: {} },
			last: () => items[items.length - 1] ?? { json: {} },
			item: items[ctx.itemIndex ?? 0] ?? { json: {} }
		},
		$now: new FlowDate(),
		$today: new FlowDate((/* @__PURE__ */ new Date()).toDateString()),
		$vars: ctx.vars ?? {},
		$env,
		$execution: ctx.execution ?? {
			id: "preview",
			mode: "manual",
			resumeUrl: ""
		},
		$workflow: {
			id: "preview",
			active: false
		},
		$if: (cond, a, b) => cond ? a : b,
		$jmespath: (query, data) => jmespath(query, data ?? ctx.json),
		$isEmpty: (v) => v == null || v === "" || Array.isArray(v) && v.length === 0,
		$isNotEmpty: (v) => !(v == null || v === "" || Array.isArray(v) && v.length === 0),
		$max: (...n) => Math.max(...n),
		$min: (...n) => Math.min(...n),
		$node: nodeAccessor
	};
}
function runSnippet(expr, ctx) {
	const scope = buildScope(ctx);
	const keys = Object.keys(scope);
	const values = keys.map((k) => scope[k]);
	const body = `"use strict";\nreturn ( ${expr} );`;
	return new Function("$", ...keys, body)(scope.$node, ...values);
}
function evaluateExpression(input, ctx) {
	if (typeof input !== "string") return {
		ok: true,
		value: input,
		literal: true
	};
	let source = input;
	const hadEquals = source.startsWith("=");
	if (hadEquals) source = source.slice(1);
	if (!/\{\{[\s\S]*?\}\}/.test(source)) {
		if (!hadEquals) return {
			ok: true,
			value: input,
			literal: true
		};
		try {
			return {
				ok: true,
				value: runSnippet(source, ctx),
				literal: false
			};
		} catch {
			return {
				ok: true,
				value: source,
				literal: true
			};
		}
	}
	const matches = [...source.matchAll(/\{\{([\s\S]*?)\}\}/g)];
	if (matches.length === 1 && matches[0][0].trim() === source.trim()) try {
		return {
			ok: true,
			value: runSnippet(matches[0][1], ctx),
			literal: false
		};
	} catch (e) {
		return {
			ok: false,
			error: e.message,
			literal: false
		};
	}
	try {
		return {
			ok: true,
			value: source.replace(/\{\{([\s\S]*?)\}\}/g, (_m, expr) => {
				const v = runSnippet(expr, ctx);
				if (v == null) return "";
				return typeof v === "object" ? JSON.stringify(v) : String(v);
			}),
			literal: false
		};
	} catch (e) {
		return {
			ok: false,
			error: e.message,
			literal: false
		};
	}
}
//#endregion
//#region src/sdk/helpers/params.ts
function getParam(node, name, defaultValue) {
	const params = node.parameters ?? {};
	if (Object.prototype.hasOwnProperty.call(params, name)) return params[name];
	return defaultValue;
}
function getParams(node) {
	return { ...node.parameters ?? {} };
}
//#endregion
//#region src/sdk/helpers/expressions.ts
function evaluateOnItem(expression, itemJson = {}, extras) {
	const result = evaluateExpression(expression, {
		json: itemJson,
		nodeData: extras?.nodeData ? Object.fromEntries(Object.entries(extras.nodeData).map(([k, v]) => [k, v.map((i) => ({ json: i.json }))])) : void 0,
		env: extras?.env,
		envAllowlist: extras?.envAllowlist,
		vars: extras?.vars
	});
	if (result.ok) return result.value;
	return expression;
}
//#endregion
//#region src/sdk/context.ts
function createExecutionContext(options) {
	const { node, workflow, getNodeInputItems, continueOnFail, getCredential, nodeData } = options;
	const customData = options.customData ?? {};
	return {
		node,
		getInputItems(inputIndex = 0) {
			return getNodeInputItems(node.name, inputIndex);
		},
		getParam(name, defaultValue) {
			return getParam(node, name, defaultValue);
		},
		getParams() {
			return getParams(node);
		},
		getNode() {
			return node;
		},
		getWorkflow() {
			return workflow;
		},
		continueOnFail() {
			return continueOnFail;
		},
		async getCredential(name) {
			if (!getCredential) return null;
			return getCredential(name);
		},
		evaluate(expression, itemJson = {}) {
			return evaluateOnItem(expression, itemJson, {
				nodeData,
				env: options.env ?? (typeof process !== "undefined" ? process.env : void 0),
				envAllowlist: options.envAllowlist,
				vars: options.vars
			});
		},
		getNodeInputItems,
		runSubWorkflow: options.runSubWorkflow,
		setCustomData(key, value) {
			customData[key] = value;
		},
		getCustomData(key) {
			return customData[key];
		},
		getAllCustomData() {
			return { ...customData };
		},
		dataTables: options.dataTables,
		vars: options.vars,
		allowUrl: options.allowUrl,
		fsRoot: options.fsRoot,
		reportProgress: options.reportProgress
	};
}
//#endregion
//#region src/sdk/define-node.ts
/**
* Declare a builtin or plugin node.
* `type` is the workflow JSON wire identifier.
*/
function defineNode(definition) {
	if (!definition.type) throw new Error("defineNode: type is required");
	if (typeof definition.execute !== "function") throw new Error(`defineNode(${definition.type}): execute is required`);
	return definition;
}
/** Convert a NodeDefinition into the engine's (ctx, node) executor signature. */
function definitionToExecutor(definition) {
	return async (ctx) => definition.execute(ctx);
}
//#endregion
//#region src/sdk/helpers/items.ts
function ensureItems(items, fallback = { json: {} }) {
	return items.length > 0 ? items : [fallback];
}
function withPairedItem(item, index, input = 0) {
	if (item.pairedItem) return item;
	return {
		...item,
		pairedItem: {
			item: index,
			input
		}
	};
}
//#endregion
//#region src/sdk/helpers/http.ts
/**
* Minimal HTTP helper for node authors.
* Builtins may still use specialized logic in http-request executor.
*/
async function sdkHttpRequest(options) {
	const method = (options.method ?? "GET").toUpperCase();
	const init = {
		method,
		headers: options.headers
	};
	if (options.body !== void 0 && method !== "GET" && method !== "HEAD") if (typeof options.body === "string") init.body = options.body;
	else {
		init.headers = {
			"content-type": "application/json",
			...options.headers
		};
		init.body = JSON.stringify(options.body);
	}
	const controller = new AbortController();
	const timer = options.timeoutMs && options.timeoutMs > 0 ? setTimeout(() => controller.abort(), options.timeoutMs) : void 0;
	try {
		const res = await fetch(options.url, {
			...init,
			signal: controller.signal
		});
		const text = await res.text();
		let body = text;
		try {
			body = text ? JSON.parse(text) : null;
		} catch {}
		const headers = {};
		res.headers.forEach((v, k) => {
			headers[k] = v;
		});
		return {
			status: res.status,
			headers,
			body
		};
	} finally {
		if (timer) clearTimeout(timer);
	}
}
//#endregion
//#region src/sdk/helpers/credentials.ts
async function requireCredential(ctx, name) {
	const data = await ctx.getCredential(name);
	if (!data) throw new Error(`Credential "${name}" is not configured on this node`);
	return data;
}
//#endregion
//#region src/lib/engine/runner.ts
function createExecutionPlan(workflow, preferredStart, destinationNode, stopBefore = true) {
	const fullAdjacency = buildAdjacency(workflow.connections);
	const incoming = buildIncoming(workflow.connections);
	const startNodes = resolveStartNodes(workflow, preferredStart);
	let reachable = startNodes.length > 0 ? nodesReachableFrom(fullAdjacency, startNodes) : new Set(workflow.nodes.map((n) => n.name));
	for (const s of startNodes) reachable.add(s);
	if (destinationNode && workflow.nodes.some((n) => n.name === destinationNode)) {
		const leading = nodesLeadingTo(incoming, destinationNode, { includeTarget: !stopBefore });
		reachable = new Set([...reachable].filter((n) => leading.has(n)));
		for (const s of startNodes) if (leading.has(s) || s === destinationNode) reachable.add(s);
	}
	addSubNodeDependencies(incoming, reachable);
	const adjacency = filterAdjacency(fullAdjacency, reachable);
	for (const name of reachable) if (!adjacency.has(name)) adjacency.set(name, []);
	const runOrder = topologicalSort(adjacency);
	for (const s of startNodes) if (!runOrder.includes(s)) runOrder.unshift(s);
	return {
		workflow,
		adjacency,
		startNodes,
		runOrder
	};
}
/** Expressions that must be evaluated per input item inside the executor. */
function isItemScopedExpression(value) {
	return /\$json\b|\$item\b|\$input\b|\$itemIndex\b/.test(value);
}
function resolveParameters(params, nodeOutputs, _nodeName, extras) {
	const nodeData = {};
	for (const [name, outputs] of nodeOutputs) nodeData[name] = outputs.flat();
	const resolved = {};
	for (const [key, value] of Object.entries(params)) if (typeof value === "string" && isExpression(value)) {
		if (isItemScopedExpression(value)) {
			resolved[key] = value;
			continue;
		}
		const result = evaluateExpression(value, {
			json: {},
			nodeData,
			env: extras?.env ?? process.env,
			envAllowlist: extras?.envAllowlist,
			vars: extras?.vars ?? {}
		});
		resolved[key] = result.ok ? result.value : value;
	} else resolved[key] = value;
	return resolved;
}
function collectTerminalItems(workflow, runData, adjacency) {
	const terminals = workflow.nodes.filter((n) => {
		const outs = adjacency.get(n.name);
		return !outs || outs.length === 0;
	});
	const items = [];
	for (const n of terminals) {
		const rd = runData[n.name];
		if (rd?.status === "success" && rd.items) items.push(...rd.items.flat());
	}
	return items;
}
async function executeWorkflow(options) {
	const { workflow, nodeExecutors, pinData, onProgress } = options;
	const resolvedEnv = options.env ?? (typeof process !== "undefined" ? process.env : {});
	const depth = options._depth ?? 0;
	const maxDepth = options.maxSubWorkflowDepth ?? 5;
	const plan = createExecutionPlan(workflow, options.startNode, options.destinationNode, options.stopBeforeDestination !== false);
	const runData = {};
	const nodeOutputs = /* @__PURE__ */ new Map();
	const customData = {};
	const emitProgress = async () => {
		if (!onProgress) return;
		const snapshot = JSON.parse(JSON.stringify(runData));
		await onProgress(snapshot);
	};
	for (const name of plan.runOrder) runData[name] = { status: "pending" };
	await emitProgress();
	const executedNodes = /* @__PURE__ */ new Set();
	const incoming = buildIncoming(workflow.connections);
	const lookupInputItems = (nodeName, inputIndex) => {
		const edges = incoming.get(nodeName) ?? [];
		const items = [];
		for (const e of edges) {
			if (e.channel !== "main") continue;
			if (e.targetInput !== inputIndex) continue;
			const outs = nodeOutputs.get(e.source);
			if (outs) items.push(...outs[e.sourceOutput] ?? []);
		}
		return items;
	};
	for (const nodeName of plan.runOrder) {
		const node = workflow.nodes.find((n) => n.name === nodeName);
		if (!node) continue;
		if (node.disabled) {
			runData[nodeName].status = "skipped";
			await emitProgress();
			continue;
		}
		const executor = nodeExecutors[node.type];
		if (!executor) {
			runData[nodeName].status = "skipped";
			runData[nodeName].error = `No executor for node type: ${node.type}`;
			await emitProgress();
			continue;
		}
		if (node.executeOnce && executedNodes.has(nodeName)) {
			runData[nodeName].status = "skipped";
			await emitProgress();
			continue;
		}
		const pinned = pinData?.[nodeName];
		if (pinned && pinned.length > 0) {
			runData[nodeName].status = "success";
			runData[nodeName].items = [pinned];
			nodeOutputs.set(nodeName, [pinned]);
			executedNodes.add(nodeName);
			await emitProgress();
			continue;
		}
		const mainIncoming = (incoming.get(nodeName) ?? []).filter((e) => e.channel === "main");
		if (mainIncoming.length > 0 && !isTriggerNode(node)) {
			if (!mainIncoming.some((e) => {
				return (nodeOutputs.get(e.source)?.[e.sourceOutput]?.length ?? 0) > 0;
			})) {
				runData[nodeName].status = "skipped";
				runData[nodeName].items = [[]];
				nodeOutputs.set(nodeName, [[]]);
				executedNodes.add(nodeName);
				await emitProgress();
				continue;
			}
		}
		const nodeContinueOnFail = node.continueOnFail || node.onError === "continueRegularOutput";
		const getNodeInputItems = (sourceName, inputIndex) => {
			if (sourceName !== nodeName) {
				const outputs = nodeOutputs.get(sourceName);
				if (!outputs) return [];
				return outputs[inputIndex] ?? [];
			}
			return lookupInputItems(nodeName, inputIndex);
		};
		runData[nodeName].status = "running";
		runData[nodeName].startedAt = (/* @__PURE__ */ new Date()).toISOString();
		await emitProgress();
		const maxAttempts = node.retryOnFail ? node.maxTries ?? 3 : 1;
		let lastError = null;
		let outputs = null;
		const nodeData = {};
		for (const [name, outs] of nodeOutputs) nodeData[name] = outs.flat();
		for (let attempt = 1; attempt <= maxAttempts; attempt++) try {
			const resolvedNode = {
				...node,
				parameters: resolveParameters(node.parameters, nodeOutputs, nodeName, {
					vars: options.vars,
					env: resolvedEnv,
					envAllowlist: options.envAllowlist
				})
			};
			const runSubWorkflow = async (subOpts) => {
				if (depth >= maxDepth) throw new Error(`Sub-workflow depth limit exceeded (max ${maxDepth})`);
				let child = subOpts.workflowJson;
				const idOrName = subOpts.workflowId?.trim();
				if (!child && idOrName) {
					if (options.subWorkflows) child = options.subWorkflows[idOrName] ?? Object.values(options.subWorkflows).find((w) => w.id === idOrName || w.name === idOrName);
					if (!child && options.resolveSubWorkflow) child = await options.resolveSubWorkflow(idOrName) ?? void 0;
				}
				if (!child) {
					const hint = idOrName ? `Sub-workflow not found: "${idOrName}". Save the child workflow first, then select it from the Workflow dropdown (id must exist in the database).` : "Sub-workflow not found: set workflowId or inline workflow JSON.";
					throw new Error(hint);
				}
				const start = child.nodes.find((n) => {
					const t = n.type;
					return t === "openflow-node-base.executeWorkflowTrigger" || t === "openflow-node-base.manualTrigger" || t === "openflow-node-base.webhook" || t === "n8n-nodes-base.executeWorkflowTrigger" || t === "n8n-nodes-base.manualTrigger" || t === "n8n-nodes-base.webhook";
				}) ?? child.nodes[0];
				const childPin = start && subOpts.items.length > 0 ? { [start.name]: subOpts.items } : void 0;
				const childResult = await executeWorkflow({
					workflow: child,
					nodeExecutors,
					pinData: childPin,
					credentialResolver: options.credentialResolver,
					subWorkflows: options.subWorkflows,
					resolveSubWorkflow: options.resolveSubWorkflow,
					maxSubWorkflowDepth: maxDepth,
					_depth: depth + 1,
					dataTables: options.dataTables,
					vars: options.vars,
					env: resolvedEnv,
					envAllowlist: options.envAllowlist,
					allowUrl: options.allowUrl,
					fsRoot: options.fsRoot
				});
				if (!childResult.success) {
					const errNode = Object.entries(childResult.runData).find(([, v]) => v.status === "error");
					throw new Error(errNode ? `Sub-workflow error in "${errNode[0]}": ${errNode[1].error ?? "unknown"}` : "Sub-workflow failed");
				}
				const childPlan = createExecutionPlan(child);
				return collectTerminalItems(child, childResult.runData, childPlan.adjacency);
			};
			outputs = await executor(createExecutionContext({
				node: resolvedNode,
				workflow,
				getNodeInputItems,
				continueOnFail: nodeContinueOnFail,
				getCredential: options.credentialResolver ? async (name) => {
					const ref = node.credentials?.[name];
					if (!ref) return null;
					return options.credentialResolver({
						...ref,
						type: name
					});
				} : void 0,
				nodeData,
				runSubWorkflow,
				customData,
				dataTables: options.dataTables,
				vars: options.vars,
				env: resolvedEnv,
				envAllowlist: options.envAllowlist,
				allowUrl: options.allowUrl,
				fsRoot: options.fsRoot,
				reportProgress: async (update) => {
					const entry = runData[nodeName];
					if (!entry || entry.status !== "running") return;
					if (update.progress) entry.progress = update.progress;
					if (update.trace) entry.trace = update.trace;
					await emitProgress();
				}
			}), resolvedNode);
			lastError = null;
			break;
		} catch (err) {
			lastError = err instanceof Error ? err : new Error(String(err));
			if (attempt < maxAttempts && node.waitBetweenTries) await new Promise((r) => setTimeout(r, node.waitBetweenTries));
		}
		if (lastError) {
			if (lastError instanceof NodeExecutionError) {
				if (lastError.trace) runData[nodeName].trace = lastError.trace;
				if (lastError.items) runData[nodeName].items = lastError.items;
			}
			if (nodeContinueOnFail || node.onError === "continueErrorOutput") {
				runData[nodeName].status = "error";
				runData[nodeName].error = lastError.message;
				if (lastError instanceof NodeExecutionError && lastError.items) {
					outputs = lastError.items;
					nodeOutputs.set(nodeName, outputs);
				} else if (nodeContinueOnFail || node.alwaysOutputData) {
					const inputItems = lookupInputItems(nodeName, 0);
					outputs = inputItems.length > 0 ? [inputItems] : [[{ json: {} }]];
					nodeOutputs.set(nodeName, outputs);
					runData[nodeName].items = outputs;
				}
			} else {
				runData[nodeName].status = "error";
				runData[nodeName].error = lastError.message;
				runData[nodeName].finishedAt = (/* @__PURE__ */ new Date()).toISOString();
				executedNodes.add(nodeName);
				await emitProgress();
				continue;
			}
		} else if (outputs) {
			if (node.alwaysOutputData && (!outputs || outputs.length === 0 || outputs.every((o) => o.length === 0))) outputs = [[{ json: {} }]];
			const inputItems = getNodeInputItems(nodeName, 0);
			outputs = outputs.map((outputItems) => outputItems.map((item, idx) => {
				if (item.pairedItem) return item;
				if (inputItems.length === outputItems.length) return {
					...item,
					pairedItem: {
						item: idx,
						input: 0
					}
				};
				return {
					...item,
					pairedItem: {
						item: 0,
						input: 0
					}
				};
			}));
			nodeOutputs.set(nodeName, outputs);
			runData[nodeName].status = "success";
			runData[nodeName].items = outputs;
		}
		runData[nodeName].finishedAt = (/* @__PURE__ */ new Date()).toISOString();
		executedNodes.add(nodeName);
		await emitProgress();
	}
	return {
		runData,
		success: Object.values(runData).every((d) => d.status !== "error")
	};
}
//#endregion
//#region node_modules/zod/v3/helpers/util.js
var util$1;
(function(util) {
	util.assertEqual = (_) => {};
	function assertIs(_arg) {}
	util.assertIs = assertIs;
	function assertNever(_x) {
		throw new Error();
	}
	util.assertNever = assertNever;
	util.arrayToEnum = (items) => {
		const obj = {};
		for (const item of items) obj[item] = item;
		return obj;
	};
	util.getValidEnumValues = (obj) => {
		const validKeys = util.objectKeys(obj).filter((k) => typeof obj[obj[k]] !== "number");
		const filtered = {};
		for (const k of validKeys) filtered[k] = obj[k];
		return util.objectValues(filtered);
	};
	util.objectValues = (obj) => {
		return util.objectKeys(obj).map(function(e) {
			return obj[e];
		});
	};
	util.objectKeys = typeof Object.keys === "function" ? (obj) => Object.keys(obj) : (object) => {
		const keys = [];
		for (const key in object) if (Object.prototype.hasOwnProperty.call(object, key)) keys.push(key);
		return keys;
	};
	util.find = (arr, checker) => {
		for (const item of arr) if (checker(item)) return item;
	};
	util.isInteger = typeof Number.isInteger === "function" ? (val) => Number.isInteger(val) : (val) => typeof val === "number" && Number.isFinite(val) && Math.floor(val) === val;
	function joinValues(array, separator = " | ") {
		return array.map((val) => typeof val === "string" ? `'${val}'` : val).join(separator);
	}
	util.joinValues = joinValues;
	util.jsonStringifyReplacer = (_, value) => {
		if (typeof value === "bigint") return value.toString();
		return value;
	};
})(util$1 || (util$1 = {}));
var objectUtil;
(function(objectUtil) {
	objectUtil.mergeShapes = (first, second) => {
		return {
			...first,
			...second
		};
	};
})(objectUtil || (objectUtil = {}));
const ZodParsedType = util$1.arrayToEnum([
	"string",
	"nan",
	"number",
	"integer",
	"float",
	"boolean",
	"date",
	"bigint",
	"symbol",
	"function",
	"undefined",
	"null",
	"array",
	"object",
	"unknown",
	"promise",
	"void",
	"never",
	"map",
	"set"
]);
const getParsedType = (data) => {
	switch (typeof data) {
		case "undefined": return ZodParsedType.undefined;
		case "string": return ZodParsedType.string;
		case "number": return Number.isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
		case "boolean": return ZodParsedType.boolean;
		case "function": return ZodParsedType.function;
		case "bigint": return ZodParsedType.bigint;
		case "symbol": return ZodParsedType.symbol;
		case "object":
			if (Array.isArray(data)) return ZodParsedType.array;
			if (data === null) return ZodParsedType.null;
			if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") return ZodParsedType.promise;
			if (typeof Map !== "undefined" && data instanceof Map) return ZodParsedType.map;
			if (typeof Set !== "undefined" && data instanceof Set) return ZodParsedType.set;
			if (typeof Date !== "undefined" && data instanceof Date) return ZodParsedType.date;
			return ZodParsedType.object;
		default: return ZodParsedType.unknown;
	}
};
//#endregion
//#region node_modules/zod/v3/ZodError.js
const ZodIssueCode = util$1.arrayToEnum([
	"invalid_type",
	"invalid_literal",
	"custom",
	"invalid_union",
	"invalid_union_discriminator",
	"invalid_enum_value",
	"unrecognized_keys",
	"invalid_arguments",
	"invalid_return_type",
	"invalid_date",
	"invalid_string",
	"too_small",
	"too_big",
	"invalid_intersection_types",
	"not_multiple_of",
	"not_finite"
]);
var ZodError = class ZodError extends Error {
	get errors() {
		return this.issues;
	}
	constructor(issues) {
		super();
		this.issues = [];
		this.addIssue = (sub) => {
			this.issues = [...this.issues, sub];
		};
		this.addIssues = (subs = []) => {
			this.issues = [...this.issues, ...subs];
		};
		const actualProto = new.target.prototype;
		if (Object.setPrototypeOf) Object.setPrototypeOf(this, actualProto);
		else this.__proto__ = actualProto;
		this.name = "ZodError";
		this.issues = issues;
	}
	format(_mapper) {
		const mapper = _mapper || function(issue) {
			return issue.message;
		};
		const fieldErrors = { _errors: [] };
		const processError = (error) => {
			for (const issue of error.issues) if (issue.code === "invalid_union") issue.unionErrors.map(processError);
			else if (issue.code === "invalid_return_type") processError(issue.returnTypeError);
			else if (issue.code === "invalid_arguments") processError(issue.argumentsError);
			else if (issue.path.length === 0) fieldErrors._errors.push(mapper(issue));
			else {
				let curr = fieldErrors;
				let i = 0;
				while (i < issue.path.length) {
					const el = issue.path[i];
					if (!(i === issue.path.length - 1)) curr[el] = curr[el] || { _errors: [] };
					else {
						curr[el] = curr[el] || { _errors: [] };
						curr[el]._errors.push(mapper(issue));
					}
					curr = curr[el];
					i++;
				}
			}
		};
		processError(this);
		return fieldErrors;
	}
	static assert(value) {
		if (!(value instanceof ZodError)) throw new Error(`Not a ZodError: ${value}`);
	}
	toString() {
		return this.message;
	}
	get message() {
		return JSON.stringify(this.issues, util$1.jsonStringifyReplacer, 2);
	}
	get isEmpty() {
		return this.issues.length === 0;
	}
	flatten(mapper = (issue) => issue.message) {
		const fieldErrors = {};
		const formErrors = [];
		for (const sub of this.issues) if (sub.path.length > 0) {
			const firstEl = sub.path[0];
			fieldErrors[firstEl] = fieldErrors[firstEl] || [];
			fieldErrors[firstEl].push(mapper(sub));
		} else formErrors.push(mapper(sub));
		return {
			formErrors,
			fieldErrors
		};
	}
	get formErrors() {
		return this.flatten();
	}
};
ZodError.create = (issues) => {
	return new ZodError(issues);
};
//#endregion
//#region node_modules/zod/v3/locales/en.js
const errorMap = (issue, _ctx) => {
	let message;
	switch (issue.code) {
		case ZodIssueCode.invalid_type:
			if (issue.received === ZodParsedType.undefined) message = "Required";
			else message = `Expected ${issue.expected}, received ${issue.received}`;
			break;
		case ZodIssueCode.invalid_literal:
			message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util$1.jsonStringifyReplacer)}`;
			break;
		case ZodIssueCode.unrecognized_keys:
			message = `Unrecognized key(s) in object: ${util$1.joinValues(issue.keys, ", ")}`;
			break;
		case ZodIssueCode.invalid_union:
			message = `Invalid input`;
			break;
		case ZodIssueCode.invalid_union_discriminator:
			message = `Invalid discriminator value. Expected ${util$1.joinValues(issue.options)}`;
			break;
		case ZodIssueCode.invalid_enum_value:
			message = `Invalid enum value. Expected ${util$1.joinValues(issue.options)}, received '${issue.received}'`;
			break;
		case ZodIssueCode.invalid_arguments:
			message = `Invalid function arguments`;
			break;
		case ZodIssueCode.invalid_return_type:
			message = `Invalid function return type`;
			break;
		case ZodIssueCode.invalid_date:
			message = `Invalid date`;
			break;
		case ZodIssueCode.invalid_string:
			if (typeof issue.validation === "object") if ("includes" in issue.validation) {
				message = `Invalid input: must include "${issue.validation.includes}"`;
				if (typeof issue.validation.position === "number") message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
			} else if ("startsWith" in issue.validation) message = `Invalid input: must start with "${issue.validation.startsWith}"`;
			else if ("endsWith" in issue.validation) message = `Invalid input: must end with "${issue.validation.endsWith}"`;
			else util$1.assertNever(issue.validation);
			else if (issue.validation !== "regex") message = `Invalid ${issue.validation}`;
			else message = "Invalid";
			break;
		case ZodIssueCode.too_small:
			if (issue.type === "array") message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
			else if (issue.type === "string") message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
			else if (issue.type === "number") message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
			else if (issue.type === "bigint") message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
			else if (issue.type === "date") message = `Date must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue.minimum))}`;
			else message = "Invalid input";
			break;
		case ZodIssueCode.too_big:
			if (issue.type === "array") message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
			else if (issue.type === "string") message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
			else if (issue.type === "number") message = `Number must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
			else if (issue.type === "bigint") message = `BigInt must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
			else if (issue.type === "date") message = `Date must be ${issue.exact ? `exactly` : issue.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue.maximum))}`;
			else message = "Invalid input";
			break;
		case ZodIssueCode.custom:
			message = `Invalid input`;
			break;
		case ZodIssueCode.invalid_intersection_types:
			message = `Intersection results could not be merged`;
			break;
		case ZodIssueCode.not_multiple_of:
			message = `Number must be a multiple of ${issue.multipleOf}`;
			break;
		case ZodIssueCode.not_finite:
			message = "Number must be finite";
			break;
		default:
			message = _ctx.defaultError;
			util$1.assertNever(issue);
	}
	return { message };
};
//#endregion
//#region node_modules/zod/v3/errors.js
let overrideErrorMap = errorMap;
function getErrorMap() {
	return overrideErrorMap;
}
//#endregion
//#region node_modules/zod/v3/helpers/parseUtil.js
const makeIssue = (params) => {
	const { data, path, errorMaps, issueData } = params;
	const fullPath = [...path, ...issueData.path || []];
	const fullIssue = {
		...issueData,
		path: fullPath
	};
	if (issueData.message !== void 0) return {
		...issueData,
		path: fullPath,
		message: issueData.message
	};
	let errorMessage = "";
	const maps = errorMaps.filter((m) => !!m).slice().reverse();
	for (const map of maps) errorMessage = map(fullIssue, {
		data,
		defaultError: errorMessage
	}).message;
	return {
		...issueData,
		path: fullPath,
		message: errorMessage
	};
};
function addIssueToContext(ctx, issueData) {
	const overrideMap = getErrorMap();
	const issue = makeIssue({
		issueData,
		data: ctx.data,
		path: ctx.path,
		errorMaps: [
			ctx.common.contextualErrorMap,
			ctx.schemaErrorMap,
			overrideMap,
			overrideMap === errorMap ? void 0 : errorMap
		].filter((x) => !!x)
	});
	ctx.common.issues.push(issue);
}
var ParseStatus = class ParseStatus {
	constructor() {
		this.value = "valid";
	}
	dirty() {
		if (this.value === "valid") this.value = "dirty";
	}
	abort() {
		if (this.value !== "aborted") this.value = "aborted";
	}
	static mergeArray(status, results) {
		const arrayValue = [];
		for (const s of results) {
			if (s.status === "aborted") return INVALID;
			if (s.status === "dirty") status.dirty();
			arrayValue.push(s.value);
		}
		return {
			status: status.value,
			value: arrayValue
		};
	}
	static async mergeObjectAsync(status, pairs) {
		const syncPairs = [];
		for (const pair of pairs) {
			const key = await pair.key;
			const value = await pair.value;
			syncPairs.push({
				key,
				value
			});
		}
		return ParseStatus.mergeObjectSync(status, syncPairs);
	}
	static mergeObjectSync(status, pairs) {
		const finalObject = {};
		for (const pair of pairs) {
			const { key, value } = pair;
			if (key.status === "aborted") return INVALID;
			if (value.status === "aborted") return INVALID;
			if (key.status === "dirty") status.dirty();
			if (value.status === "dirty") status.dirty();
			if (key.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) finalObject[key.value] = value.value;
		}
		return {
			status: status.value,
			value: finalObject
		};
	}
};
const INVALID = Object.freeze({ status: "aborted" });
const DIRTY = (value) => ({
	status: "dirty",
	value
});
const OK = (value) => ({
	status: "valid",
	value
});
const isAborted = (x) => x.status === "aborted";
const isDirty = (x) => x.status === "dirty";
const isValid = (x) => x.status === "valid";
const isAsync = (x) => typeof Promise !== "undefined" && x instanceof Promise;
//#endregion
//#region node_modules/zod/v3/helpers/errorUtil.js
var errorUtil;
(function(errorUtil) {
	errorUtil.errToObj = (message) => typeof message === "string" ? { message } : message || {};
	errorUtil.toString = (message) => typeof message === "string" ? message : message?.message;
})(errorUtil || (errorUtil = {}));
//#endregion
//#region node_modules/zod/v3/types.js
var ParseInputLazyPath = class {
	constructor(parent, value, path, key) {
		this._cachedPath = [];
		this.parent = parent;
		this.data = value;
		this._path = path;
		this._key = key;
	}
	get path() {
		if (!this._cachedPath.length) if (Array.isArray(this._key)) this._cachedPath.push(...this._path, ...this._key);
		else this._cachedPath.push(...this._path, this._key);
		return this._cachedPath;
	}
};
const handleResult = (ctx, result) => {
	if (isValid(result)) return {
		success: true,
		data: result.value
	};
	else {
		if (!ctx.common.issues.length) throw new Error("Validation failed but no issues detected.");
		return {
			success: false,
			get error() {
				if (this._error) return this._error;
				const error = new ZodError(ctx.common.issues);
				this._error = error;
				return this._error;
			}
		};
	}
};
function processCreateParams(params) {
	if (!params) return {};
	const { errorMap, invalid_type_error, required_error, description } = params;
	if (errorMap && (invalid_type_error || required_error)) throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
	if (errorMap) return {
		errorMap,
		description
	};
	const customMap = (iss, ctx) => {
		const { message } = params;
		if (iss.code === "invalid_enum_value") return { message: message ?? ctx.defaultError };
		if (typeof ctx.data === "undefined") return { message: message ?? required_error ?? ctx.defaultError };
		if (iss.code !== "invalid_type") return { message: ctx.defaultError };
		return { message: message ?? invalid_type_error ?? ctx.defaultError };
	};
	return {
		errorMap: customMap,
		description
	};
}
var ZodType = class {
	get description() {
		return this._def.description;
	}
	_getType(input) {
		return getParsedType(input.data);
	}
	_getOrReturnCtx(input, ctx) {
		return ctx || {
			common: input.parent.common,
			data: input.data,
			parsedType: getParsedType(input.data),
			schemaErrorMap: this._def.errorMap,
			path: input.path,
			parent: input.parent
		};
	}
	_processInputParams(input) {
		return {
			status: new ParseStatus(),
			ctx: {
				common: input.parent.common,
				data: input.data,
				parsedType: getParsedType(input.data),
				schemaErrorMap: this._def.errorMap,
				path: input.path,
				parent: input.parent
			}
		};
	}
	_parseSync(input) {
		const result = this._parse(input);
		if (isAsync(result)) throw new Error("Synchronous parse encountered promise.");
		return result;
	}
	_parseAsync(input) {
		const result = this._parse(input);
		return Promise.resolve(result);
	}
	parse(data, params) {
		const result = this.safeParse(data, params);
		if (result.success) return result.data;
		throw result.error;
	}
	safeParse(data, params) {
		const ctx = {
			common: {
				issues: [],
				async: params?.async ?? false,
				contextualErrorMap: params?.errorMap
			},
			path: params?.path || [],
			schemaErrorMap: this._def.errorMap,
			parent: null,
			data,
			parsedType: getParsedType(data)
		};
		const result = this._parseSync({
			data,
			path: ctx.path,
			parent: ctx
		});
		return handleResult(ctx, result);
	}
	"~validate"(data) {
		const ctx = {
			common: {
				issues: [],
				async: !!this["~standard"].async
			},
			path: [],
			schemaErrorMap: this._def.errorMap,
			parent: null,
			data,
			parsedType: getParsedType(data)
		};
		if (!this["~standard"].async) try {
			const result = this._parseSync({
				data,
				path: [],
				parent: ctx
			});
			return isValid(result) ? { value: result.value } : { issues: ctx.common.issues };
		} catch (err) {
			if (err?.message?.toLowerCase()?.includes("encountered")) this["~standard"].async = true;
			ctx.common = {
				issues: [],
				async: true
			};
		}
		return this._parseAsync({
			data,
			path: [],
			parent: ctx
		}).then((result) => isValid(result) ? { value: result.value } : { issues: ctx.common.issues });
	}
	async parseAsync(data, params) {
		const result = await this.safeParseAsync(data, params);
		if (result.success) return result.data;
		throw result.error;
	}
	async safeParseAsync(data, params) {
		const ctx = {
			common: {
				issues: [],
				contextualErrorMap: params?.errorMap,
				async: true
			},
			path: params?.path || [],
			schemaErrorMap: this._def.errorMap,
			parent: null,
			data,
			parsedType: getParsedType(data)
		};
		const maybeAsyncResult = this._parse({
			data,
			path: ctx.path,
			parent: ctx
		});
		const result = await (isAsync(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult));
		return handleResult(ctx, result);
	}
	refine(check, message) {
		const getIssueProperties = (val) => {
			if (typeof message === "string" || typeof message === "undefined") return { message };
			else if (typeof message === "function") return message(val);
			else return message;
		};
		return this._refinement((val, ctx) => {
			const result = check(val);
			const setError = () => ctx.addIssue({
				code: ZodIssueCode.custom,
				...getIssueProperties(val)
			});
			if (typeof Promise !== "undefined" && result instanceof Promise) return result.then((data) => {
				if (!data) {
					setError();
					return false;
				} else return true;
			});
			if (!result) {
				setError();
				return false;
			} else return true;
		});
	}
	refinement(check, refinementData) {
		return this._refinement((val, ctx) => {
			if (!check(val)) {
				ctx.addIssue(typeof refinementData === "function" ? refinementData(val, ctx) : refinementData);
				return false;
			} else return true;
		});
	}
	_refinement(refinement) {
		return new ZodEffects({
			schema: this,
			typeName: ZodFirstPartyTypeKind.ZodEffects,
			effect: {
				type: "refinement",
				refinement
			}
		});
	}
	superRefine(refinement) {
		return this._refinement(refinement);
	}
	constructor(def) {
		/** Alias of safeParseAsync */
		this.spa = this.safeParseAsync;
		this._def = def;
		this.parse = this.parse.bind(this);
		this.safeParse = this.safeParse.bind(this);
		this.parseAsync = this.parseAsync.bind(this);
		this.safeParseAsync = this.safeParseAsync.bind(this);
		this.spa = this.spa.bind(this);
		this.refine = this.refine.bind(this);
		this.refinement = this.refinement.bind(this);
		this.superRefine = this.superRefine.bind(this);
		this.optional = this.optional.bind(this);
		this.nullable = this.nullable.bind(this);
		this.nullish = this.nullish.bind(this);
		this.array = this.array.bind(this);
		this.promise = this.promise.bind(this);
		this.or = this.or.bind(this);
		this.and = this.and.bind(this);
		this.transform = this.transform.bind(this);
		this.brand = this.brand.bind(this);
		this.default = this.default.bind(this);
		this.catch = this.catch.bind(this);
		this.describe = this.describe.bind(this);
		this.pipe = this.pipe.bind(this);
		this.readonly = this.readonly.bind(this);
		this.isNullable = this.isNullable.bind(this);
		this.isOptional = this.isOptional.bind(this);
		this["~standard"] = {
			version: 1,
			vendor: "zod",
			validate: (data) => this["~validate"](data)
		};
	}
	optional() {
		return ZodOptional.create(this, this._def);
	}
	nullable() {
		return ZodNullable.create(this, this._def);
	}
	nullish() {
		return this.nullable().optional();
	}
	array() {
		return ZodArray.create(this);
	}
	promise() {
		return ZodPromise.create(this, this._def);
	}
	or(option) {
		return ZodUnion.create([this, option], this._def);
	}
	and(incoming) {
		return ZodIntersection.create(this, incoming, this._def);
	}
	transform(transform) {
		return new ZodEffects({
			...processCreateParams(this._def),
			schema: this,
			typeName: ZodFirstPartyTypeKind.ZodEffects,
			effect: {
				type: "transform",
				transform
			}
		});
	}
	default(def) {
		const defaultValueFunc = typeof def === "function" ? def : () => def;
		return new ZodDefault({
			...processCreateParams(this._def),
			innerType: this,
			defaultValue: defaultValueFunc,
			typeName: ZodFirstPartyTypeKind.ZodDefault
		});
	}
	brand() {
		return new ZodBranded({
			typeName: ZodFirstPartyTypeKind.ZodBranded,
			type: this,
			...processCreateParams(this._def)
		});
	}
	catch(def) {
		const catchValueFunc = typeof def === "function" ? def : () => def;
		return new ZodCatch({
			...processCreateParams(this._def),
			innerType: this,
			catchValue: catchValueFunc,
			typeName: ZodFirstPartyTypeKind.ZodCatch
		});
	}
	describe(description) {
		const This = this.constructor;
		return new This({
			...this._def,
			description
		});
	}
	pipe(target) {
		return ZodPipeline.create(this, target);
	}
	readonly() {
		return ZodReadonly.create(this);
	}
	isOptional() {
		return this.safeParse(void 0).success;
	}
	isNullable() {
		return this.safeParse(null).success;
	}
};
const cuidRegex = /^c[^\s-]{8,}$/i;
const cuid2Regex = /^[0-9a-z]+$/;
const ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
const uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
const nanoidRegex = /^[a-z0-9_-]{21}$/i;
const jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
const durationRegex = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
const emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
const _emojiRegex = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
let emojiRegex;
const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
const ipv4CidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
const ipv6CidrRegex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
const base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
const base64urlRegex = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
const dateRegexSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
const dateRegex = new RegExp(`^${dateRegexSource}$`);
function timeRegexSource(args) {
	let secondsRegexSource = `[0-5]\\d`;
	if (args.precision) secondsRegexSource = `${secondsRegexSource}\\.\\d{${args.precision}}`;
	else if (args.precision == null) secondsRegexSource = `${secondsRegexSource}(\\.\\d+)?`;
	const secondsQuantifier = args.precision ? "+" : "?";
	return `([01]\\d|2[0-3]):[0-5]\\d(:${secondsRegexSource})${secondsQuantifier}`;
}
function timeRegex(args) {
	return new RegExp(`^${timeRegexSource(args)}$`);
}
function datetimeRegex(args) {
	let regex = `${dateRegexSource}T${timeRegexSource(args)}`;
	const opts = [];
	opts.push(args.local ? `Z?` : `Z`);
	if (args.offset) opts.push(`([+-]\\d{2}:?\\d{2})`);
	regex = `${regex}(${opts.join("|")})`;
	return new RegExp(`^${regex}$`);
}
function isValidIP(ip, version) {
	if ((version === "v4" || !version) && ipv4Regex.test(ip)) return true;
	if ((version === "v6" || !version) && ipv6Regex.test(ip)) return true;
	return false;
}
function isValidJWT(jwt, alg) {
	if (!jwtRegex.test(jwt)) return false;
	try {
		const [header] = jwt.split(".");
		if (!header) return false;
		const base64 = header.replace(/-/g, "+").replace(/_/g, "/").padEnd(header.length + (4 - header.length % 4) % 4, "=");
		const decoded = JSON.parse(atob(base64));
		if (typeof decoded !== "object" || decoded === null) return false;
		if ("typ" in decoded && decoded?.typ !== "JWT") return false;
		if (!decoded.alg) return false;
		if (alg && decoded.alg !== alg) return false;
		return true;
	} catch {
		return false;
	}
}
function isValidCidr(ip, version) {
	if ((version === "v4" || !version) && ipv4CidrRegex.test(ip)) return true;
	if ((version === "v6" || !version) && ipv6CidrRegex.test(ip)) return true;
	return false;
}
var ZodString = class ZodString extends ZodType {
	_parse(input) {
		if (this._def.coerce) input.data = String(input.data);
		if (this._getType(input) !== ZodParsedType.string) {
			const ctx = this._getOrReturnCtx(input);
			addIssueToContext(ctx, {
				code: ZodIssueCode.invalid_type,
				expected: ZodParsedType.string,
				received: ctx.parsedType
			});
			return INVALID;
		}
		const status = new ParseStatus();
		let ctx = void 0;
		for (const check of this._def.checks) if (check.kind === "min") {
			if (input.data.length < check.value) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					code: ZodIssueCode.too_small,
					minimum: check.value,
					type: "string",
					inclusive: true,
					exact: false,
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "max") {
			if (input.data.length > check.value) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					code: ZodIssueCode.too_big,
					maximum: check.value,
					type: "string",
					inclusive: true,
					exact: false,
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "length") {
			const tooBig = input.data.length > check.value;
			const tooSmall = input.data.length < check.value;
			if (tooBig || tooSmall) {
				ctx = this._getOrReturnCtx(input, ctx);
				if (tooBig) addIssueToContext(ctx, {
					code: ZodIssueCode.too_big,
					maximum: check.value,
					type: "string",
					inclusive: true,
					exact: true,
					message: check.message
				});
				else if (tooSmall) addIssueToContext(ctx, {
					code: ZodIssueCode.too_small,
					minimum: check.value,
					type: "string",
					inclusive: true,
					exact: true,
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "email") {
			if (!emailRegex.test(input.data)) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					validation: "email",
					code: ZodIssueCode.invalid_string,
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "emoji") {
			if (!emojiRegex) emojiRegex = new RegExp(_emojiRegex, "u");
			if (!emojiRegex.test(input.data)) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					validation: "emoji",
					code: ZodIssueCode.invalid_string,
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "uuid") {
			if (!uuidRegex.test(input.data)) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					validation: "uuid",
					code: ZodIssueCode.invalid_string,
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "nanoid") {
			if (!nanoidRegex.test(input.data)) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					validation: "nanoid",
					code: ZodIssueCode.invalid_string,
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "cuid") {
			if (!cuidRegex.test(input.data)) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					validation: "cuid",
					code: ZodIssueCode.invalid_string,
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "cuid2") {
			if (!cuid2Regex.test(input.data)) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					validation: "cuid2",
					code: ZodIssueCode.invalid_string,
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "ulid") {
			if (!ulidRegex.test(input.data)) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					validation: "ulid",
					code: ZodIssueCode.invalid_string,
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "url") try {
			new URL(input.data);
		} catch {
			ctx = this._getOrReturnCtx(input, ctx);
			addIssueToContext(ctx, {
				validation: "url",
				code: ZodIssueCode.invalid_string,
				message: check.message
			});
			status.dirty();
		}
		else if (check.kind === "regex") {
			check.regex.lastIndex = 0;
			if (!check.regex.test(input.data)) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					validation: "regex",
					code: ZodIssueCode.invalid_string,
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "trim") input.data = input.data.trim();
		else if (check.kind === "includes") {
			if (!input.data.includes(check.value, check.position)) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_string,
					validation: {
						includes: check.value,
						position: check.position
					},
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "toLowerCase") input.data = input.data.toLowerCase();
		else if (check.kind === "toUpperCase") input.data = input.data.toUpperCase();
		else if (check.kind === "startsWith") {
			if (!input.data.startsWith(check.value)) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_string,
					validation: { startsWith: check.value },
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "endsWith") {
			if (!input.data.endsWith(check.value)) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_string,
					validation: { endsWith: check.value },
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "datetime") {
			if (!datetimeRegex(check).test(input.data)) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_string,
					validation: "datetime",
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "date") {
			if (!dateRegex.test(input.data)) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_string,
					validation: "date",
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "time") {
			if (!timeRegex(check).test(input.data)) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_string,
					validation: "time",
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "duration") {
			if (!durationRegex.test(input.data)) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					validation: "duration",
					code: ZodIssueCode.invalid_string,
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "ip") {
			if (!isValidIP(input.data, check.version)) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					validation: "ip",
					code: ZodIssueCode.invalid_string,
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "jwt") {
			if (!isValidJWT(input.data, check.alg)) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					validation: "jwt",
					code: ZodIssueCode.invalid_string,
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "cidr") {
			if (!isValidCidr(input.data, check.version)) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					validation: "cidr",
					code: ZodIssueCode.invalid_string,
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "base64") {
			if (!base64Regex.test(input.data)) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					validation: "base64",
					code: ZodIssueCode.invalid_string,
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "base64url") {
			if (!base64urlRegex.test(input.data)) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					validation: "base64url",
					code: ZodIssueCode.invalid_string,
					message: check.message
				});
				status.dirty();
			}
		} else util$1.assertNever(check);
		return {
			status: status.value,
			value: input.data
		};
	}
	_regex(regex, validation, message) {
		return this.refinement((data) => regex.test(data), {
			validation,
			code: ZodIssueCode.invalid_string,
			...errorUtil.errToObj(message)
		});
	}
	_addCheck(check) {
		return new ZodString({
			...this._def,
			checks: [...this._def.checks, check]
		});
	}
	email(message) {
		return this._addCheck({
			kind: "email",
			...errorUtil.errToObj(message)
		});
	}
	url(message) {
		return this._addCheck({
			kind: "url",
			...errorUtil.errToObj(message)
		});
	}
	emoji(message) {
		return this._addCheck({
			kind: "emoji",
			...errorUtil.errToObj(message)
		});
	}
	uuid(message) {
		return this._addCheck({
			kind: "uuid",
			...errorUtil.errToObj(message)
		});
	}
	nanoid(message) {
		return this._addCheck({
			kind: "nanoid",
			...errorUtil.errToObj(message)
		});
	}
	cuid(message) {
		return this._addCheck({
			kind: "cuid",
			...errorUtil.errToObj(message)
		});
	}
	cuid2(message) {
		return this._addCheck({
			kind: "cuid2",
			...errorUtil.errToObj(message)
		});
	}
	ulid(message) {
		return this._addCheck({
			kind: "ulid",
			...errorUtil.errToObj(message)
		});
	}
	base64(message) {
		return this._addCheck({
			kind: "base64",
			...errorUtil.errToObj(message)
		});
	}
	base64url(message) {
		return this._addCheck({
			kind: "base64url",
			...errorUtil.errToObj(message)
		});
	}
	jwt(options) {
		return this._addCheck({
			kind: "jwt",
			...errorUtil.errToObj(options)
		});
	}
	ip(options) {
		return this._addCheck({
			kind: "ip",
			...errorUtil.errToObj(options)
		});
	}
	cidr(options) {
		return this._addCheck({
			kind: "cidr",
			...errorUtil.errToObj(options)
		});
	}
	datetime(options) {
		if (typeof options === "string") return this._addCheck({
			kind: "datetime",
			precision: null,
			offset: false,
			local: false,
			message: options
		});
		return this._addCheck({
			kind: "datetime",
			precision: typeof options?.precision === "undefined" ? null : options?.precision,
			offset: options?.offset ?? false,
			local: options?.local ?? false,
			...errorUtil.errToObj(options?.message)
		});
	}
	date(message) {
		return this._addCheck({
			kind: "date",
			message
		});
	}
	time(options) {
		if (typeof options === "string") return this._addCheck({
			kind: "time",
			precision: null,
			message: options
		});
		return this._addCheck({
			kind: "time",
			precision: typeof options?.precision === "undefined" ? null : options?.precision,
			...errorUtil.errToObj(options?.message)
		});
	}
	duration(message) {
		return this._addCheck({
			kind: "duration",
			...errorUtil.errToObj(message)
		});
	}
	regex(regex, message) {
		return this._addCheck({
			kind: "regex",
			regex,
			...errorUtil.errToObj(message)
		});
	}
	includes(value, options) {
		return this._addCheck({
			kind: "includes",
			value,
			position: options?.position,
			...errorUtil.errToObj(options?.message)
		});
	}
	startsWith(value, message) {
		return this._addCheck({
			kind: "startsWith",
			value,
			...errorUtil.errToObj(message)
		});
	}
	endsWith(value, message) {
		return this._addCheck({
			kind: "endsWith",
			value,
			...errorUtil.errToObj(message)
		});
	}
	min(minLength, message) {
		return this._addCheck({
			kind: "min",
			value: minLength,
			...errorUtil.errToObj(message)
		});
	}
	max(maxLength, message) {
		return this._addCheck({
			kind: "max",
			value: maxLength,
			...errorUtil.errToObj(message)
		});
	}
	length(len, message) {
		return this._addCheck({
			kind: "length",
			value: len,
			...errorUtil.errToObj(message)
		});
	}
	/**
	* Equivalent to `.min(1)`
	*/
	nonempty(message) {
		return this.min(1, errorUtil.errToObj(message));
	}
	trim() {
		return new ZodString({
			...this._def,
			checks: [...this._def.checks, { kind: "trim" }]
		});
	}
	toLowerCase() {
		return new ZodString({
			...this._def,
			checks: [...this._def.checks, { kind: "toLowerCase" }]
		});
	}
	toUpperCase() {
		return new ZodString({
			...this._def,
			checks: [...this._def.checks, { kind: "toUpperCase" }]
		});
	}
	get isDatetime() {
		return !!this._def.checks.find((ch) => ch.kind === "datetime");
	}
	get isDate() {
		return !!this._def.checks.find((ch) => ch.kind === "date");
	}
	get isTime() {
		return !!this._def.checks.find((ch) => ch.kind === "time");
	}
	get isDuration() {
		return !!this._def.checks.find((ch) => ch.kind === "duration");
	}
	get isEmail() {
		return !!this._def.checks.find((ch) => ch.kind === "email");
	}
	get isURL() {
		return !!this._def.checks.find((ch) => ch.kind === "url");
	}
	get isEmoji() {
		return !!this._def.checks.find((ch) => ch.kind === "emoji");
	}
	get isUUID() {
		return !!this._def.checks.find((ch) => ch.kind === "uuid");
	}
	get isNANOID() {
		return !!this._def.checks.find((ch) => ch.kind === "nanoid");
	}
	get isCUID() {
		return !!this._def.checks.find((ch) => ch.kind === "cuid");
	}
	get isCUID2() {
		return !!this._def.checks.find((ch) => ch.kind === "cuid2");
	}
	get isULID() {
		return !!this._def.checks.find((ch) => ch.kind === "ulid");
	}
	get isIP() {
		return !!this._def.checks.find((ch) => ch.kind === "ip");
	}
	get isCIDR() {
		return !!this._def.checks.find((ch) => ch.kind === "cidr");
	}
	get isBase64() {
		return !!this._def.checks.find((ch) => ch.kind === "base64");
	}
	get isBase64url() {
		return !!this._def.checks.find((ch) => ch.kind === "base64url");
	}
	get minLength() {
		let min = null;
		for (const ch of this._def.checks) if (ch.kind === "min") {
			if (min === null || ch.value > min) min = ch.value;
		}
		return min;
	}
	get maxLength() {
		let max = null;
		for (const ch of this._def.checks) if (ch.kind === "max") {
			if (max === null || ch.value < max) max = ch.value;
		}
		return max;
	}
};
ZodString.create = (params) => {
	return new ZodString({
		checks: [],
		typeName: ZodFirstPartyTypeKind.ZodString,
		coerce: params?.coerce ?? false,
		...processCreateParams(params)
	});
};
function floatSafeRemainder(val, step) {
	const valDecCount = (val.toString().split(".")[1] || "").length;
	const stepDecCount = (step.toString().split(".")[1] || "").length;
	const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
	return Number.parseInt(val.toFixed(decCount).replace(".", "")) % Number.parseInt(step.toFixed(decCount).replace(".", "")) / 10 ** decCount;
}
var ZodNumber = class ZodNumber extends ZodType {
	constructor() {
		super(...arguments);
		this.min = this.gte;
		this.max = this.lte;
		this.step = this.multipleOf;
	}
	_parse(input) {
		if (this._def.coerce) input.data = Number(input.data);
		if (this._getType(input) !== ZodParsedType.number) {
			const ctx = this._getOrReturnCtx(input);
			addIssueToContext(ctx, {
				code: ZodIssueCode.invalid_type,
				expected: ZodParsedType.number,
				received: ctx.parsedType
			});
			return INVALID;
		}
		let ctx = void 0;
		const status = new ParseStatus();
		for (const check of this._def.checks) if (check.kind === "int") {
			if (!util$1.isInteger(input.data)) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_type,
					expected: "integer",
					received: "float",
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "min") {
			if (check.inclusive ? input.data < check.value : input.data <= check.value) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					code: ZodIssueCode.too_small,
					minimum: check.value,
					type: "number",
					inclusive: check.inclusive,
					exact: false,
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "max") {
			if (check.inclusive ? input.data > check.value : input.data >= check.value) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					code: ZodIssueCode.too_big,
					maximum: check.value,
					type: "number",
					inclusive: check.inclusive,
					exact: false,
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "multipleOf") {
			if (floatSafeRemainder(input.data, check.value) !== 0) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					code: ZodIssueCode.not_multiple_of,
					multipleOf: check.value,
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "finite") {
			if (!Number.isFinite(input.data)) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					code: ZodIssueCode.not_finite,
					message: check.message
				});
				status.dirty();
			}
		} else util$1.assertNever(check);
		return {
			status: status.value,
			value: input.data
		};
	}
	gte(value, message) {
		return this.setLimit("min", value, true, errorUtil.toString(message));
	}
	gt(value, message) {
		return this.setLimit("min", value, false, errorUtil.toString(message));
	}
	lte(value, message) {
		return this.setLimit("max", value, true, errorUtil.toString(message));
	}
	lt(value, message) {
		return this.setLimit("max", value, false, errorUtil.toString(message));
	}
	setLimit(kind, value, inclusive, message) {
		return new ZodNumber({
			...this._def,
			checks: [...this._def.checks, {
				kind,
				value,
				inclusive,
				message: errorUtil.toString(message)
			}]
		});
	}
	_addCheck(check) {
		return new ZodNumber({
			...this._def,
			checks: [...this._def.checks, check]
		});
	}
	int(message) {
		return this._addCheck({
			kind: "int",
			message: errorUtil.toString(message)
		});
	}
	positive(message) {
		return this._addCheck({
			kind: "min",
			value: 0,
			inclusive: false,
			message: errorUtil.toString(message)
		});
	}
	negative(message) {
		return this._addCheck({
			kind: "max",
			value: 0,
			inclusive: false,
			message: errorUtil.toString(message)
		});
	}
	nonpositive(message) {
		return this._addCheck({
			kind: "max",
			value: 0,
			inclusive: true,
			message: errorUtil.toString(message)
		});
	}
	nonnegative(message) {
		return this._addCheck({
			kind: "min",
			value: 0,
			inclusive: true,
			message: errorUtil.toString(message)
		});
	}
	multipleOf(value, message) {
		return this._addCheck({
			kind: "multipleOf",
			value,
			message: errorUtil.toString(message)
		});
	}
	finite(message) {
		return this._addCheck({
			kind: "finite",
			message: errorUtil.toString(message)
		});
	}
	safe(message) {
		return this._addCheck({
			kind: "min",
			inclusive: true,
			value: Number.MIN_SAFE_INTEGER,
			message: errorUtil.toString(message)
		})._addCheck({
			kind: "max",
			inclusive: true,
			value: Number.MAX_SAFE_INTEGER,
			message: errorUtil.toString(message)
		});
	}
	get minValue() {
		let min = null;
		for (const ch of this._def.checks) if (ch.kind === "min") {
			if (min === null || ch.value > min) min = ch.value;
		}
		return min;
	}
	get maxValue() {
		let max = null;
		for (const ch of this._def.checks) if (ch.kind === "max") {
			if (max === null || ch.value < max) max = ch.value;
		}
		return max;
	}
	get isInt() {
		return !!this._def.checks.find((ch) => ch.kind === "int" || ch.kind === "multipleOf" && util$1.isInteger(ch.value));
	}
	get isFinite() {
		let max = null;
		let min = null;
		for (const ch of this._def.checks) if (ch.kind === "finite" || ch.kind === "int" || ch.kind === "multipleOf") return true;
		else if (ch.kind === "min") {
			if (min === null || ch.value > min) min = ch.value;
		} else if (ch.kind === "max") {
			if (max === null || ch.value < max) max = ch.value;
		}
		return Number.isFinite(min) && Number.isFinite(max);
	}
};
ZodNumber.create = (params) => {
	return new ZodNumber({
		checks: [],
		typeName: ZodFirstPartyTypeKind.ZodNumber,
		coerce: params?.coerce || false,
		...processCreateParams(params)
	});
};
var ZodBigInt = class ZodBigInt extends ZodType {
	constructor() {
		super(...arguments);
		this.min = this.gte;
		this.max = this.lte;
	}
	_parse(input) {
		if (this._def.coerce) try {
			input.data = BigInt(input.data);
		} catch {
			return this._getInvalidInput(input);
		}
		if (this._getType(input) !== ZodParsedType.bigint) return this._getInvalidInput(input);
		let ctx = void 0;
		const status = new ParseStatus();
		for (const check of this._def.checks) if (check.kind === "min") {
			if (check.inclusive ? input.data < check.value : input.data <= check.value) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					code: ZodIssueCode.too_small,
					type: "bigint",
					minimum: check.value,
					inclusive: check.inclusive,
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "max") {
			if (check.inclusive ? input.data > check.value : input.data >= check.value) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					code: ZodIssueCode.too_big,
					type: "bigint",
					maximum: check.value,
					inclusive: check.inclusive,
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "multipleOf") {
			if (input.data % check.value !== BigInt(0)) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					code: ZodIssueCode.not_multiple_of,
					multipleOf: check.value,
					message: check.message
				});
				status.dirty();
			}
		} else util$1.assertNever(check);
		return {
			status: status.value,
			value: input.data
		};
	}
	_getInvalidInput(input) {
		const ctx = this._getOrReturnCtx(input);
		addIssueToContext(ctx, {
			code: ZodIssueCode.invalid_type,
			expected: ZodParsedType.bigint,
			received: ctx.parsedType
		});
		return INVALID;
	}
	gte(value, message) {
		return this.setLimit("min", value, true, errorUtil.toString(message));
	}
	gt(value, message) {
		return this.setLimit("min", value, false, errorUtil.toString(message));
	}
	lte(value, message) {
		return this.setLimit("max", value, true, errorUtil.toString(message));
	}
	lt(value, message) {
		return this.setLimit("max", value, false, errorUtil.toString(message));
	}
	setLimit(kind, value, inclusive, message) {
		return new ZodBigInt({
			...this._def,
			checks: [...this._def.checks, {
				kind,
				value,
				inclusive,
				message: errorUtil.toString(message)
			}]
		});
	}
	_addCheck(check) {
		return new ZodBigInt({
			...this._def,
			checks: [...this._def.checks, check]
		});
	}
	positive(message) {
		return this._addCheck({
			kind: "min",
			value: BigInt(0),
			inclusive: false,
			message: errorUtil.toString(message)
		});
	}
	negative(message) {
		return this._addCheck({
			kind: "max",
			value: BigInt(0),
			inclusive: false,
			message: errorUtil.toString(message)
		});
	}
	nonpositive(message) {
		return this._addCheck({
			kind: "max",
			value: BigInt(0),
			inclusive: true,
			message: errorUtil.toString(message)
		});
	}
	nonnegative(message) {
		return this._addCheck({
			kind: "min",
			value: BigInt(0),
			inclusive: true,
			message: errorUtil.toString(message)
		});
	}
	multipleOf(value, message) {
		return this._addCheck({
			kind: "multipleOf",
			value,
			message: errorUtil.toString(message)
		});
	}
	get minValue() {
		let min = null;
		for (const ch of this._def.checks) if (ch.kind === "min") {
			if (min === null || ch.value > min) min = ch.value;
		}
		return min;
	}
	get maxValue() {
		let max = null;
		for (const ch of this._def.checks) if (ch.kind === "max") {
			if (max === null || ch.value < max) max = ch.value;
		}
		return max;
	}
};
ZodBigInt.create = (params) => {
	return new ZodBigInt({
		checks: [],
		typeName: ZodFirstPartyTypeKind.ZodBigInt,
		coerce: params?.coerce ?? false,
		...processCreateParams(params)
	});
};
var ZodBoolean = class extends ZodType {
	_parse(input) {
		if (this._def.coerce) input.data = Boolean(input.data);
		if (this._getType(input) !== ZodParsedType.boolean) {
			const ctx = this._getOrReturnCtx(input);
			addIssueToContext(ctx, {
				code: ZodIssueCode.invalid_type,
				expected: ZodParsedType.boolean,
				received: ctx.parsedType
			});
			return INVALID;
		}
		return OK(input.data);
	}
};
ZodBoolean.create = (params) => {
	return new ZodBoolean({
		typeName: ZodFirstPartyTypeKind.ZodBoolean,
		coerce: params?.coerce || false,
		...processCreateParams(params)
	});
};
var ZodDate = class ZodDate extends ZodType {
	_parse(input) {
		if (this._def.coerce) input.data = new Date(input.data);
		if (this._getType(input) !== ZodParsedType.date) {
			const ctx = this._getOrReturnCtx(input);
			addIssueToContext(ctx, {
				code: ZodIssueCode.invalid_type,
				expected: ZodParsedType.date,
				received: ctx.parsedType
			});
			return INVALID;
		}
		if (Number.isNaN(input.data.getTime())) {
			addIssueToContext(this._getOrReturnCtx(input), { code: ZodIssueCode.invalid_date });
			return INVALID;
		}
		const status = new ParseStatus();
		let ctx = void 0;
		for (const check of this._def.checks) if (check.kind === "min") {
			if (input.data.getTime() < check.value) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					code: ZodIssueCode.too_small,
					message: check.message,
					inclusive: true,
					exact: false,
					minimum: check.value,
					type: "date"
				});
				status.dirty();
			}
		} else if (check.kind === "max") {
			if (input.data.getTime() > check.value) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					code: ZodIssueCode.too_big,
					message: check.message,
					inclusive: true,
					exact: false,
					maximum: check.value,
					type: "date"
				});
				status.dirty();
			}
		} else util$1.assertNever(check);
		return {
			status: status.value,
			value: new Date(input.data.getTime())
		};
	}
	_addCheck(check) {
		return new ZodDate({
			...this._def,
			checks: [...this._def.checks, check]
		});
	}
	min(minDate, message) {
		return this._addCheck({
			kind: "min",
			value: minDate.getTime(),
			message: errorUtil.toString(message)
		});
	}
	max(maxDate, message) {
		return this._addCheck({
			kind: "max",
			value: maxDate.getTime(),
			message: errorUtil.toString(message)
		});
	}
	get minDate() {
		let min = null;
		for (const ch of this._def.checks) if (ch.kind === "min") {
			if (min === null || ch.value > min) min = ch.value;
		}
		return min != null ? new Date(min) : null;
	}
	get maxDate() {
		let max = null;
		for (const ch of this._def.checks) if (ch.kind === "max") {
			if (max === null || ch.value < max) max = ch.value;
		}
		return max != null ? new Date(max) : null;
	}
};
ZodDate.create = (params) => {
	return new ZodDate({
		checks: [],
		coerce: params?.coerce || false,
		typeName: ZodFirstPartyTypeKind.ZodDate,
		...processCreateParams(params)
	});
};
var ZodSymbol = class extends ZodType {
	_parse(input) {
		if (this._getType(input) !== ZodParsedType.symbol) {
			const ctx = this._getOrReturnCtx(input);
			addIssueToContext(ctx, {
				code: ZodIssueCode.invalid_type,
				expected: ZodParsedType.symbol,
				received: ctx.parsedType
			});
			return INVALID;
		}
		return OK(input.data);
	}
};
ZodSymbol.create = (params) => {
	return new ZodSymbol({
		typeName: ZodFirstPartyTypeKind.ZodSymbol,
		...processCreateParams(params)
	});
};
var ZodUndefined = class extends ZodType {
	_parse(input) {
		if (this._getType(input) !== ZodParsedType.undefined) {
			const ctx = this._getOrReturnCtx(input);
			addIssueToContext(ctx, {
				code: ZodIssueCode.invalid_type,
				expected: ZodParsedType.undefined,
				received: ctx.parsedType
			});
			return INVALID;
		}
		return OK(input.data);
	}
};
ZodUndefined.create = (params) => {
	return new ZodUndefined({
		typeName: ZodFirstPartyTypeKind.ZodUndefined,
		...processCreateParams(params)
	});
};
var ZodNull = class extends ZodType {
	_parse(input) {
		if (this._getType(input) !== ZodParsedType.null) {
			const ctx = this._getOrReturnCtx(input);
			addIssueToContext(ctx, {
				code: ZodIssueCode.invalid_type,
				expected: ZodParsedType.null,
				received: ctx.parsedType
			});
			return INVALID;
		}
		return OK(input.data);
	}
};
ZodNull.create = (params) => {
	return new ZodNull({
		typeName: ZodFirstPartyTypeKind.ZodNull,
		...processCreateParams(params)
	});
};
var ZodAny = class extends ZodType {
	constructor() {
		super(...arguments);
		this._any = true;
	}
	_parse(input) {
		return OK(input.data);
	}
};
ZodAny.create = (params) => {
	return new ZodAny({
		typeName: ZodFirstPartyTypeKind.ZodAny,
		...processCreateParams(params)
	});
};
var ZodUnknown = class extends ZodType {
	constructor() {
		super(...arguments);
		this._unknown = true;
	}
	_parse(input) {
		return OK(input.data);
	}
};
ZodUnknown.create = (params) => {
	return new ZodUnknown({
		typeName: ZodFirstPartyTypeKind.ZodUnknown,
		...processCreateParams(params)
	});
};
var ZodNever = class extends ZodType {
	_parse(input) {
		const ctx = this._getOrReturnCtx(input);
		addIssueToContext(ctx, {
			code: ZodIssueCode.invalid_type,
			expected: ZodParsedType.never,
			received: ctx.parsedType
		});
		return INVALID;
	}
};
ZodNever.create = (params) => {
	return new ZodNever({
		typeName: ZodFirstPartyTypeKind.ZodNever,
		...processCreateParams(params)
	});
};
var ZodVoid = class extends ZodType {
	_parse(input) {
		if (this._getType(input) !== ZodParsedType.undefined) {
			const ctx = this._getOrReturnCtx(input);
			addIssueToContext(ctx, {
				code: ZodIssueCode.invalid_type,
				expected: ZodParsedType.void,
				received: ctx.parsedType
			});
			return INVALID;
		}
		return OK(input.data);
	}
};
ZodVoid.create = (params) => {
	return new ZodVoid({
		typeName: ZodFirstPartyTypeKind.ZodVoid,
		...processCreateParams(params)
	});
};
var ZodArray = class ZodArray extends ZodType {
	_parse(input) {
		const { ctx, status } = this._processInputParams(input);
		const def = this._def;
		if (ctx.parsedType !== ZodParsedType.array) {
			addIssueToContext(ctx, {
				code: ZodIssueCode.invalid_type,
				expected: ZodParsedType.array,
				received: ctx.parsedType
			});
			return INVALID;
		}
		if (def.exactLength !== null) {
			const tooBig = ctx.data.length > def.exactLength.value;
			const tooSmall = ctx.data.length < def.exactLength.value;
			if (tooBig || tooSmall) {
				addIssueToContext(ctx, {
					code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
					minimum: tooSmall ? def.exactLength.value : void 0,
					maximum: tooBig ? def.exactLength.value : void 0,
					type: "array",
					inclusive: true,
					exact: true,
					message: def.exactLength.message
				});
				status.dirty();
			}
		}
		if (def.minLength !== null) {
			if (ctx.data.length < def.minLength.value) {
				addIssueToContext(ctx, {
					code: ZodIssueCode.too_small,
					minimum: def.minLength.value,
					type: "array",
					inclusive: true,
					exact: false,
					message: def.minLength.message
				});
				status.dirty();
			}
		}
		if (def.maxLength !== null) {
			if (ctx.data.length > def.maxLength.value) {
				addIssueToContext(ctx, {
					code: ZodIssueCode.too_big,
					maximum: def.maxLength.value,
					type: "array",
					inclusive: true,
					exact: false,
					message: def.maxLength.message
				});
				status.dirty();
			}
		}
		if (ctx.common.async) return Promise.all([...ctx.data].map((item, i) => {
			return def.type._parseAsync(new ParseInputLazyPath(ctx, item, ctx.path, i));
		})).then((result) => {
			return ParseStatus.mergeArray(status, result);
		});
		const result = [...ctx.data].map((item, i) => {
			return def.type._parseSync(new ParseInputLazyPath(ctx, item, ctx.path, i));
		});
		return ParseStatus.mergeArray(status, result);
	}
	get element() {
		return this._def.type;
	}
	min(minLength, message) {
		return new ZodArray({
			...this._def,
			minLength: {
				value: minLength,
				message: errorUtil.toString(message)
			}
		});
	}
	max(maxLength, message) {
		return new ZodArray({
			...this._def,
			maxLength: {
				value: maxLength,
				message: errorUtil.toString(message)
			}
		});
	}
	length(len, message) {
		return new ZodArray({
			...this._def,
			exactLength: {
				value: len,
				message: errorUtil.toString(message)
			}
		});
	}
	nonempty(message) {
		return this.min(1, message);
	}
};
ZodArray.create = (schema, params) => {
	return new ZodArray({
		type: schema,
		minLength: null,
		maxLength: null,
		exactLength: null,
		typeName: ZodFirstPartyTypeKind.ZodArray,
		...processCreateParams(params)
	});
};
function deepPartialify(schema) {
	if (schema instanceof ZodObject) {
		const newShape = {};
		for (const key in schema.shape) {
			const fieldSchema = schema.shape[key];
			newShape[key] = ZodOptional.create(deepPartialify(fieldSchema));
		}
		return new ZodObject({
			...schema._def,
			shape: () => newShape
		});
	} else if (schema instanceof ZodArray) return new ZodArray({
		...schema._def,
		type: deepPartialify(schema.element)
	});
	else if (schema instanceof ZodOptional) return ZodOptional.create(deepPartialify(schema.unwrap()));
	else if (schema instanceof ZodNullable) return ZodNullable.create(deepPartialify(schema.unwrap()));
	else if (schema instanceof ZodTuple) return ZodTuple.create(schema.items.map((item) => deepPartialify(item)));
	else return schema;
}
var ZodObject = class ZodObject extends ZodType {
	constructor() {
		super(...arguments);
		this._cached = null;
		/**
		* @deprecated In most cases, this is no longer needed - unknown properties are now silently stripped.
		* If you want to pass through unknown properties, use `.passthrough()` instead.
		*/
		this.nonstrict = this.passthrough;
		/**
		* @deprecated Use `.extend` instead
		*  */
		this.augment = this.extend;
	}
	_getCached() {
		if (this._cached !== null) return this._cached;
		const shape = this._def.shape();
		const keys = util$1.objectKeys(shape);
		this._cached = {
			shape,
			keys
		};
		return this._cached;
	}
	_parse(input) {
		if (this._getType(input) !== ZodParsedType.object) {
			const ctx = this._getOrReturnCtx(input);
			addIssueToContext(ctx, {
				code: ZodIssueCode.invalid_type,
				expected: ZodParsedType.object,
				received: ctx.parsedType
			});
			return INVALID;
		}
		const { status, ctx } = this._processInputParams(input);
		const { shape, keys: shapeKeys } = this._getCached();
		const extraKeys = [];
		if (!(this._def.catchall instanceof ZodNever && this._def.unknownKeys === "strip")) {
			for (const key in ctx.data) if (!shapeKeys.includes(key)) extraKeys.push(key);
		}
		const pairs = [];
		for (const key of shapeKeys) {
			const keyValidator = shape[key];
			const value = ctx.data[key];
			pairs.push({
				key: {
					status: "valid",
					value: key
				},
				value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
				alwaysSet: key in ctx.data
			});
		}
		if (this._def.catchall instanceof ZodNever) {
			const unknownKeys = this._def.unknownKeys;
			if (unknownKeys === "passthrough") for (const key of extraKeys) pairs.push({
				key: {
					status: "valid",
					value: key
				},
				value: {
					status: "valid",
					value: ctx.data[key]
				}
			});
			else if (unknownKeys === "strict") {
				if (extraKeys.length > 0) {
					addIssueToContext(ctx, {
						code: ZodIssueCode.unrecognized_keys,
						keys: extraKeys
					});
					status.dirty();
				}
			} else if (unknownKeys === "strip") {} else throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
		} else {
			const catchall = this._def.catchall;
			for (const key of extraKeys) {
				const value = ctx.data[key];
				pairs.push({
					key: {
						status: "valid",
						value: key
					},
					value: catchall._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
					alwaysSet: key in ctx.data
				});
			}
		}
		if (ctx.common.async) return Promise.resolve().then(async () => {
			const syncPairs = [];
			for (const pair of pairs) {
				const key = await pair.key;
				const value = await pair.value;
				syncPairs.push({
					key,
					value,
					alwaysSet: pair.alwaysSet
				});
			}
			return syncPairs;
		}).then((syncPairs) => {
			return ParseStatus.mergeObjectSync(status, syncPairs);
		});
		else return ParseStatus.mergeObjectSync(status, pairs);
	}
	get shape() {
		return this._def.shape();
	}
	strict(message) {
		errorUtil.errToObj;
		return new ZodObject({
			...this._def,
			unknownKeys: "strict",
			...message !== void 0 ? { errorMap: (issue, ctx) => {
				const defaultError = this._def.errorMap?.(issue, ctx).message ?? ctx.defaultError;
				if (issue.code === "unrecognized_keys") return { message: errorUtil.errToObj(message).message ?? defaultError };
				return { message: defaultError };
			} } : {}
		});
	}
	strip() {
		return new ZodObject({
			...this._def,
			unknownKeys: "strip"
		});
	}
	passthrough() {
		return new ZodObject({
			...this._def,
			unknownKeys: "passthrough"
		});
	}
	extend(augmentation) {
		return new ZodObject({
			...this._def,
			shape: () => ({
				...this._def.shape(),
				...augmentation
			})
		});
	}
	/**
	* Prior to zod@1.0.12 there was a bug in the
	* inferred type of merged objects. Please
	* upgrade if you are experiencing issues.
	*/
	merge(merging) {
		return new ZodObject({
			unknownKeys: merging._def.unknownKeys,
			catchall: merging._def.catchall,
			shape: () => ({
				...this._def.shape(),
				...merging._def.shape()
			}),
			typeName: ZodFirstPartyTypeKind.ZodObject
		});
	}
	setKey(key, schema) {
		return this.augment({ [key]: schema });
	}
	catchall(index) {
		return new ZodObject({
			...this._def,
			catchall: index
		});
	}
	pick(mask) {
		const shape = {};
		for (const key of util$1.objectKeys(mask)) if (mask[key] && this.shape[key]) shape[key] = this.shape[key];
		return new ZodObject({
			...this._def,
			shape: () => shape
		});
	}
	omit(mask) {
		const shape = {};
		for (const key of util$1.objectKeys(this.shape)) if (!mask[key]) shape[key] = this.shape[key];
		return new ZodObject({
			...this._def,
			shape: () => shape
		});
	}
	/**
	* @deprecated
	*/
	deepPartial() {
		return deepPartialify(this);
	}
	partial(mask) {
		const newShape = {};
		for (const key of util$1.objectKeys(this.shape)) {
			const fieldSchema = this.shape[key];
			if (mask && !mask[key]) newShape[key] = fieldSchema;
			else newShape[key] = fieldSchema.optional();
		}
		return new ZodObject({
			...this._def,
			shape: () => newShape
		});
	}
	required(mask) {
		const newShape = {};
		for (const key of util$1.objectKeys(this.shape)) if (mask && !mask[key]) newShape[key] = this.shape[key];
		else {
			let newField = this.shape[key];
			while (newField instanceof ZodOptional) newField = newField._def.innerType;
			newShape[key] = newField;
		}
		return new ZodObject({
			...this._def,
			shape: () => newShape
		});
	}
	keyof() {
		return createZodEnum(util$1.objectKeys(this.shape));
	}
};
ZodObject.create = (shape, params) => {
	return new ZodObject({
		shape: () => shape,
		unknownKeys: "strip",
		catchall: ZodNever.create(),
		typeName: ZodFirstPartyTypeKind.ZodObject,
		...processCreateParams(params)
	});
};
ZodObject.strictCreate = (shape, params) => {
	return new ZodObject({
		shape: () => shape,
		unknownKeys: "strict",
		catchall: ZodNever.create(),
		typeName: ZodFirstPartyTypeKind.ZodObject,
		...processCreateParams(params)
	});
};
ZodObject.lazycreate = (shape, params) => {
	return new ZodObject({
		shape,
		unknownKeys: "strip",
		catchall: ZodNever.create(),
		typeName: ZodFirstPartyTypeKind.ZodObject,
		...processCreateParams(params)
	});
};
var ZodUnion = class extends ZodType {
	_parse(input) {
		const { ctx } = this._processInputParams(input);
		const options = this._def.options;
		function handleResults(results) {
			for (const result of results) if (result.result.status === "valid") return result.result;
			for (const result of results) if (result.result.status === "dirty") {
				ctx.common.issues.push(...result.ctx.common.issues);
				return result.result;
			}
			const unionErrors = results.map((result) => new ZodError(result.ctx.common.issues));
			addIssueToContext(ctx, {
				code: ZodIssueCode.invalid_union,
				unionErrors
			});
			return INVALID;
		}
		if (ctx.common.async) return Promise.all(options.map(async (option) => {
			const childCtx = {
				...ctx,
				common: {
					...ctx.common,
					issues: []
				},
				parent: null
			};
			return {
				result: await option._parseAsync({
					data: ctx.data,
					path: ctx.path,
					parent: childCtx
				}),
				ctx: childCtx
			};
		})).then(handleResults);
		else {
			let dirty = void 0;
			const issues = [];
			for (const option of options) {
				const childCtx = {
					...ctx,
					common: {
						...ctx.common,
						issues: []
					},
					parent: null
				};
				const result = option._parseSync({
					data: ctx.data,
					path: ctx.path,
					parent: childCtx
				});
				if (result.status === "valid") return result;
				else if (result.status === "dirty" && !dirty) dirty = {
					result,
					ctx: childCtx
				};
				if (childCtx.common.issues.length) issues.push(childCtx.common.issues);
			}
			if (dirty) {
				ctx.common.issues.push(...dirty.ctx.common.issues);
				return dirty.result;
			}
			const unionErrors = issues.map((issues) => new ZodError(issues));
			addIssueToContext(ctx, {
				code: ZodIssueCode.invalid_union,
				unionErrors
			});
			return INVALID;
		}
	}
	get options() {
		return this._def.options;
	}
};
ZodUnion.create = (types, params) => {
	return new ZodUnion({
		options: types,
		typeName: ZodFirstPartyTypeKind.ZodUnion,
		...processCreateParams(params)
	});
};
const getDiscriminator = (type) => {
	if (type instanceof ZodLazy) return getDiscriminator(type.schema);
	else if (type instanceof ZodEffects) return getDiscriminator(type.innerType());
	else if (type instanceof ZodLiteral) return [type.value];
	else if (type instanceof ZodEnum) return type.options;
	else if (type instanceof ZodNativeEnum) return util$1.objectValues(type.enum);
	else if (type instanceof ZodDefault) return getDiscriminator(type._def.innerType);
	else if (type instanceof ZodUndefined) return [void 0];
	else if (type instanceof ZodNull) return [null];
	else if (type instanceof ZodOptional) return [void 0, ...getDiscriminator(type.unwrap())];
	else if (type instanceof ZodNullable) return [null, ...getDiscriminator(type.unwrap())];
	else if (type instanceof ZodBranded) return getDiscriminator(type.unwrap());
	else if (type instanceof ZodReadonly) return getDiscriminator(type.unwrap());
	else if (type instanceof ZodCatch) return getDiscriminator(type._def.innerType);
	else return [];
};
var ZodDiscriminatedUnion = class ZodDiscriminatedUnion extends ZodType {
	_parse(input) {
		const { ctx } = this._processInputParams(input);
		if (ctx.parsedType !== ZodParsedType.object) {
			addIssueToContext(ctx, {
				code: ZodIssueCode.invalid_type,
				expected: ZodParsedType.object,
				received: ctx.parsedType
			});
			return INVALID;
		}
		const discriminator = this.discriminator;
		const discriminatorValue = ctx.data[discriminator];
		const option = this.optionsMap.get(discriminatorValue);
		if (!option) {
			addIssueToContext(ctx, {
				code: ZodIssueCode.invalid_union_discriminator,
				options: Array.from(this.optionsMap.keys()),
				path: [discriminator]
			});
			return INVALID;
		}
		if (ctx.common.async) return option._parseAsync({
			data: ctx.data,
			path: ctx.path,
			parent: ctx
		});
		else return option._parseSync({
			data: ctx.data,
			path: ctx.path,
			parent: ctx
		});
	}
	get discriminator() {
		return this._def.discriminator;
	}
	get options() {
		return this._def.options;
	}
	get optionsMap() {
		return this._def.optionsMap;
	}
	/**
	* The constructor of the discriminated union schema. Its behaviour is very similar to that of the normal z.union() constructor.
	* However, it only allows a union of objects, all of which need to share a discriminator property. This property must
	* have a different value for each object in the union.
	* @param discriminator the name of the discriminator property
	* @param types an array of object schemas
	* @param params
	*/
	static create(discriminator, options, params) {
		const optionsMap = /* @__PURE__ */ new Map();
		for (const type of options) {
			const discriminatorValues = getDiscriminator(type.shape[discriminator]);
			if (!discriminatorValues.length) throw new Error(`A discriminator value for key \`${discriminator}\` could not be extracted from all schema options`);
			for (const value of discriminatorValues) {
				if (optionsMap.has(value)) throw new Error(`Discriminator property ${String(discriminator)} has duplicate value ${String(value)}`);
				optionsMap.set(value, type);
			}
		}
		return new ZodDiscriminatedUnion({
			typeName: ZodFirstPartyTypeKind.ZodDiscriminatedUnion,
			discriminator,
			options,
			optionsMap,
			...processCreateParams(params)
		});
	}
};
function mergeValues(a, b) {
	const aType = getParsedType(a);
	const bType = getParsedType(b);
	if (a === b) return {
		valid: true,
		data: a
	};
	else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
		const bKeys = util$1.objectKeys(b);
		const sharedKeys = util$1.objectKeys(a).filter((key) => bKeys.indexOf(key) !== -1);
		const newObj = {
			...a,
			...b
		};
		for (const key of sharedKeys) {
			const sharedValue = mergeValues(a[key], b[key]);
			if (!sharedValue.valid) return { valid: false };
			newObj[key] = sharedValue.data;
		}
		return {
			valid: true,
			data: newObj
		};
	} else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
		if (a.length !== b.length) return { valid: false };
		const newArray = [];
		for (let index = 0; index < a.length; index++) {
			const itemA = a[index];
			const itemB = b[index];
			const sharedValue = mergeValues(itemA, itemB);
			if (!sharedValue.valid) return { valid: false };
			newArray.push(sharedValue.data);
		}
		return {
			valid: true,
			data: newArray
		};
	} else if (aType === ZodParsedType.date && bType === ZodParsedType.date && +a === +b) return {
		valid: true,
		data: a
	};
	else return { valid: false };
}
var ZodIntersection = class extends ZodType {
	_parse(input) {
		const { status, ctx } = this._processInputParams(input);
		const handleParsed = (parsedLeft, parsedRight) => {
			if (isAborted(parsedLeft) || isAborted(parsedRight)) return INVALID;
			const merged = mergeValues(parsedLeft.value, parsedRight.value);
			if (!merged.valid) {
				addIssueToContext(ctx, { code: ZodIssueCode.invalid_intersection_types });
				return INVALID;
			}
			if (isDirty(parsedLeft) || isDirty(parsedRight)) status.dirty();
			return {
				status: status.value,
				value: merged.data
			};
		};
		if (ctx.common.async) return Promise.all([this._def.left._parseAsync({
			data: ctx.data,
			path: ctx.path,
			parent: ctx
		}), this._def.right._parseAsync({
			data: ctx.data,
			path: ctx.path,
			parent: ctx
		})]).then(([left, right]) => handleParsed(left, right));
		else return handleParsed(this._def.left._parseSync({
			data: ctx.data,
			path: ctx.path,
			parent: ctx
		}), this._def.right._parseSync({
			data: ctx.data,
			path: ctx.path,
			parent: ctx
		}));
	}
};
ZodIntersection.create = (left, right, params) => {
	return new ZodIntersection({
		left,
		right,
		typeName: ZodFirstPartyTypeKind.ZodIntersection,
		...processCreateParams(params)
	});
};
var ZodTuple = class ZodTuple extends ZodType {
	_parse(input) {
		const { status, ctx } = this._processInputParams(input);
		if (ctx.parsedType !== ZodParsedType.array) {
			addIssueToContext(ctx, {
				code: ZodIssueCode.invalid_type,
				expected: ZodParsedType.array,
				received: ctx.parsedType
			});
			return INVALID;
		}
		if (ctx.data.length < this._def.items.length) {
			addIssueToContext(ctx, {
				code: ZodIssueCode.too_small,
				minimum: this._def.items.length,
				inclusive: true,
				exact: false,
				type: "array"
			});
			return INVALID;
		}
		if (!this._def.rest && ctx.data.length > this._def.items.length) {
			addIssueToContext(ctx, {
				code: ZodIssueCode.too_big,
				maximum: this._def.items.length,
				inclusive: true,
				exact: false,
				type: "array"
			});
			status.dirty();
		}
		const items = [...ctx.data].map((item, itemIndex) => {
			const schema = this._def.items[itemIndex] || this._def.rest;
			if (!schema) return null;
			return schema._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex));
		}).filter((x) => !!x);
		if (ctx.common.async) return Promise.all(items).then((results) => {
			return ParseStatus.mergeArray(status, results);
		});
		else return ParseStatus.mergeArray(status, items);
	}
	get items() {
		return this._def.items;
	}
	rest(rest) {
		return new ZodTuple({
			...this._def,
			rest
		});
	}
};
ZodTuple.create = (schemas, params) => {
	if (!Array.isArray(schemas)) throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
	return new ZodTuple({
		items: schemas,
		typeName: ZodFirstPartyTypeKind.ZodTuple,
		rest: null,
		...processCreateParams(params)
	});
};
var ZodRecord = class ZodRecord extends ZodType {
	get keySchema() {
		return this._def.keyType;
	}
	get valueSchema() {
		return this._def.valueType;
	}
	_parse(input) {
		const { status, ctx } = this._processInputParams(input);
		if (ctx.parsedType !== ZodParsedType.object) {
			addIssueToContext(ctx, {
				code: ZodIssueCode.invalid_type,
				expected: ZodParsedType.object,
				received: ctx.parsedType
			});
			return INVALID;
		}
		const pairs = [];
		const keyType = this._def.keyType;
		const valueType = this._def.valueType;
		for (const key in ctx.data) pairs.push({
			key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, key)),
			value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key)),
			alwaysSet: key in ctx.data
		});
		if (ctx.common.async) return ParseStatus.mergeObjectAsync(status, pairs);
		else return ParseStatus.mergeObjectSync(status, pairs);
	}
	get element() {
		return this._def.valueType;
	}
	static create(first, second, third) {
		if (second instanceof ZodType) return new ZodRecord({
			keyType: first,
			valueType: second,
			typeName: ZodFirstPartyTypeKind.ZodRecord,
			...processCreateParams(third)
		});
		return new ZodRecord({
			keyType: ZodString.create(),
			valueType: first,
			typeName: ZodFirstPartyTypeKind.ZodRecord,
			...processCreateParams(second)
		});
	}
};
var ZodMap = class extends ZodType {
	get keySchema() {
		return this._def.keyType;
	}
	get valueSchema() {
		return this._def.valueType;
	}
	_parse(input) {
		const { status, ctx } = this._processInputParams(input);
		if (ctx.parsedType !== ZodParsedType.map) {
			addIssueToContext(ctx, {
				code: ZodIssueCode.invalid_type,
				expected: ZodParsedType.map,
				received: ctx.parsedType
			});
			return INVALID;
		}
		const keyType = this._def.keyType;
		const valueType = this._def.valueType;
		const pairs = [...ctx.data.entries()].map(([key, value], index) => {
			return {
				key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, [index, "key"])),
				value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"]))
			};
		});
		if (ctx.common.async) {
			const finalMap = /* @__PURE__ */ new Map();
			return Promise.resolve().then(async () => {
				for (const pair of pairs) {
					const key = await pair.key;
					const value = await pair.value;
					if (key.status === "aborted" || value.status === "aborted") return INVALID;
					if (key.status === "dirty" || value.status === "dirty") status.dirty();
					finalMap.set(key.value, value.value);
				}
				return {
					status: status.value,
					value: finalMap
				};
			});
		} else {
			const finalMap = /* @__PURE__ */ new Map();
			for (const pair of pairs) {
				const key = pair.key;
				const value = pair.value;
				if (key.status === "aborted" || value.status === "aborted") return INVALID;
				if (key.status === "dirty" || value.status === "dirty") status.dirty();
				finalMap.set(key.value, value.value);
			}
			return {
				status: status.value,
				value: finalMap
			};
		}
	}
};
ZodMap.create = (keyType, valueType, params) => {
	return new ZodMap({
		valueType,
		keyType,
		typeName: ZodFirstPartyTypeKind.ZodMap,
		...processCreateParams(params)
	});
};
var ZodSet = class ZodSet extends ZodType {
	_parse(input) {
		const { status, ctx } = this._processInputParams(input);
		if (ctx.parsedType !== ZodParsedType.set) {
			addIssueToContext(ctx, {
				code: ZodIssueCode.invalid_type,
				expected: ZodParsedType.set,
				received: ctx.parsedType
			});
			return INVALID;
		}
		const def = this._def;
		if (def.minSize !== null) {
			if (ctx.data.size < def.minSize.value) {
				addIssueToContext(ctx, {
					code: ZodIssueCode.too_small,
					minimum: def.minSize.value,
					type: "set",
					inclusive: true,
					exact: false,
					message: def.minSize.message
				});
				status.dirty();
			}
		}
		if (def.maxSize !== null) {
			if (ctx.data.size > def.maxSize.value) {
				addIssueToContext(ctx, {
					code: ZodIssueCode.too_big,
					maximum: def.maxSize.value,
					type: "set",
					inclusive: true,
					exact: false,
					message: def.maxSize.message
				});
				status.dirty();
			}
		}
		const valueType = this._def.valueType;
		function finalizeSet(elements) {
			const parsedSet = /* @__PURE__ */ new Set();
			for (const element of elements) {
				if (element.status === "aborted") return INVALID;
				if (element.status === "dirty") status.dirty();
				parsedSet.add(element.value);
			}
			return {
				status: status.value,
				value: parsedSet
			};
		}
		const elements = [...ctx.data.values()].map((item, i) => valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i)));
		if (ctx.common.async) return Promise.all(elements).then((elements) => finalizeSet(elements));
		else return finalizeSet(elements);
	}
	min(minSize, message) {
		return new ZodSet({
			...this._def,
			minSize: {
				value: minSize,
				message: errorUtil.toString(message)
			}
		});
	}
	max(maxSize, message) {
		return new ZodSet({
			...this._def,
			maxSize: {
				value: maxSize,
				message: errorUtil.toString(message)
			}
		});
	}
	size(size, message) {
		return this.min(size, message).max(size, message);
	}
	nonempty(message) {
		return this.min(1, message);
	}
};
ZodSet.create = (valueType, params) => {
	return new ZodSet({
		valueType,
		minSize: null,
		maxSize: null,
		typeName: ZodFirstPartyTypeKind.ZodSet,
		...processCreateParams(params)
	});
};
var ZodFunction = class ZodFunction extends ZodType {
	constructor() {
		super(...arguments);
		this.validate = this.implement;
	}
	_parse(input) {
		const { ctx } = this._processInputParams(input);
		if (ctx.parsedType !== ZodParsedType.function) {
			addIssueToContext(ctx, {
				code: ZodIssueCode.invalid_type,
				expected: ZodParsedType.function,
				received: ctx.parsedType
			});
			return INVALID;
		}
		function makeArgsIssue(args, error) {
			return makeIssue({
				data: args,
				path: ctx.path,
				errorMaps: [
					ctx.common.contextualErrorMap,
					ctx.schemaErrorMap,
					getErrorMap(),
					errorMap
				].filter((x) => !!x),
				issueData: {
					code: ZodIssueCode.invalid_arguments,
					argumentsError: error
				}
			});
		}
		function makeReturnsIssue(returns, error) {
			return makeIssue({
				data: returns,
				path: ctx.path,
				errorMaps: [
					ctx.common.contextualErrorMap,
					ctx.schemaErrorMap,
					getErrorMap(),
					errorMap
				].filter((x) => !!x),
				issueData: {
					code: ZodIssueCode.invalid_return_type,
					returnTypeError: error
				}
			});
		}
		const params = { errorMap: ctx.common.contextualErrorMap };
		const fn = ctx.data;
		if (this._def.returns instanceof ZodPromise) {
			const me = this;
			return OK(async function(...args) {
				const error = new ZodError([]);
				const parsedArgs = await me._def.args.parseAsync(args, params).catch((e) => {
					error.addIssue(makeArgsIssue(args, e));
					throw error;
				});
				const result = await Reflect.apply(fn, this, parsedArgs);
				return await me._def.returns._def.type.parseAsync(result, params).catch((e) => {
					error.addIssue(makeReturnsIssue(result, e));
					throw error;
				});
			});
		} else {
			const me = this;
			return OK(function(...args) {
				const parsedArgs = me._def.args.safeParse(args, params);
				if (!parsedArgs.success) throw new ZodError([makeArgsIssue(args, parsedArgs.error)]);
				const result = Reflect.apply(fn, this, parsedArgs.data);
				const parsedReturns = me._def.returns.safeParse(result, params);
				if (!parsedReturns.success) throw new ZodError([makeReturnsIssue(result, parsedReturns.error)]);
				return parsedReturns.data;
			});
		}
	}
	parameters() {
		return this._def.args;
	}
	returnType() {
		return this._def.returns;
	}
	args(...items) {
		return new ZodFunction({
			...this._def,
			args: ZodTuple.create(items).rest(ZodUnknown.create())
		});
	}
	returns(returnType) {
		return new ZodFunction({
			...this._def,
			returns: returnType
		});
	}
	implement(func) {
		return this.parse(func);
	}
	strictImplement(func) {
		return this.parse(func);
	}
	static create(args, returns, params) {
		return new ZodFunction({
			args: args ? args : ZodTuple.create([]).rest(ZodUnknown.create()),
			returns: returns || ZodUnknown.create(),
			typeName: ZodFirstPartyTypeKind.ZodFunction,
			...processCreateParams(params)
		});
	}
};
var ZodLazy = class extends ZodType {
	get schema() {
		return this._def.getter();
	}
	_parse(input) {
		const { ctx } = this._processInputParams(input);
		return this._def.getter()._parse({
			data: ctx.data,
			path: ctx.path,
			parent: ctx
		});
	}
};
ZodLazy.create = (getter, params) => {
	return new ZodLazy({
		getter,
		typeName: ZodFirstPartyTypeKind.ZodLazy,
		...processCreateParams(params)
	});
};
var ZodLiteral = class extends ZodType {
	_parse(input) {
		if (input.data !== this._def.value) {
			const ctx = this._getOrReturnCtx(input);
			addIssueToContext(ctx, {
				received: ctx.data,
				code: ZodIssueCode.invalid_literal,
				expected: this._def.value
			});
			return INVALID;
		}
		return {
			status: "valid",
			value: input.data
		};
	}
	get value() {
		return this._def.value;
	}
};
ZodLiteral.create = (value, params) => {
	return new ZodLiteral({
		value,
		typeName: ZodFirstPartyTypeKind.ZodLiteral,
		...processCreateParams(params)
	});
};
function createZodEnum(values, params) {
	return new ZodEnum({
		values,
		typeName: ZodFirstPartyTypeKind.ZodEnum,
		...processCreateParams(params)
	});
}
var ZodEnum = class ZodEnum extends ZodType {
	_parse(input) {
		if (typeof input.data !== "string") {
			const ctx = this._getOrReturnCtx(input);
			const expectedValues = this._def.values;
			addIssueToContext(ctx, {
				expected: util$1.joinValues(expectedValues),
				received: ctx.parsedType,
				code: ZodIssueCode.invalid_type
			});
			return INVALID;
		}
		if (!this._cache) this._cache = new Set(this._def.values);
		if (!this._cache.has(input.data)) {
			const ctx = this._getOrReturnCtx(input);
			const expectedValues = this._def.values;
			addIssueToContext(ctx, {
				received: ctx.data,
				code: ZodIssueCode.invalid_enum_value,
				options: expectedValues
			});
			return INVALID;
		}
		return OK(input.data);
	}
	get options() {
		return this._def.values;
	}
	get enum() {
		const enumValues = {};
		for (const val of this._def.values) enumValues[val] = val;
		return enumValues;
	}
	get Values() {
		const enumValues = {};
		for (const val of this._def.values) enumValues[val] = val;
		return enumValues;
	}
	get Enum() {
		const enumValues = {};
		for (const val of this._def.values) enumValues[val] = val;
		return enumValues;
	}
	extract(values, newDef = this._def) {
		return ZodEnum.create(values, {
			...this._def,
			...newDef
		});
	}
	exclude(values, newDef = this._def) {
		return ZodEnum.create(this.options.filter((opt) => !values.includes(opt)), {
			...this._def,
			...newDef
		});
	}
};
ZodEnum.create = createZodEnum;
var ZodNativeEnum = class extends ZodType {
	_parse(input) {
		const nativeEnumValues = util$1.getValidEnumValues(this._def.values);
		const ctx = this._getOrReturnCtx(input);
		if (ctx.parsedType !== ZodParsedType.string && ctx.parsedType !== ZodParsedType.number) {
			const expectedValues = util$1.objectValues(nativeEnumValues);
			addIssueToContext(ctx, {
				expected: util$1.joinValues(expectedValues),
				received: ctx.parsedType,
				code: ZodIssueCode.invalid_type
			});
			return INVALID;
		}
		if (!this._cache) this._cache = new Set(util$1.getValidEnumValues(this._def.values));
		if (!this._cache.has(input.data)) {
			const expectedValues = util$1.objectValues(nativeEnumValues);
			addIssueToContext(ctx, {
				received: ctx.data,
				code: ZodIssueCode.invalid_enum_value,
				options: expectedValues
			});
			return INVALID;
		}
		return OK(input.data);
	}
	get enum() {
		return this._def.values;
	}
};
ZodNativeEnum.create = (values, params) => {
	return new ZodNativeEnum({
		values,
		typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
		...processCreateParams(params)
	});
};
var ZodPromise = class extends ZodType {
	unwrap() {
		return this._def.type;
	}
	_parse(input) {
		const { ctx } = this._processInputParams(input);
		if (ctx.parsedType !== ZodParsedType.promise && ctx.common.async === false) {
			addIssueToContext(ctx, {
				code: ZodIssueCode.invalid_type,
				expected: ZodParsedType.promise,
				received: ctx.parsedType
			});
			return INVALID;
		}
		return OK((ctx.parsedType === ZodParsedType.promise ? ctx.data : Promise.resolve(ctx.data)).then((data) => {
			return this._def.type.parseAsync(data, {
				path: ctx.path,
				errorMap: ctx.common.contextualErrorMap
			});
		}));
	}
};
ZodPromise.create = (schema, params) => {
	return new ZodPromise({
		type: schema,
		typeName: ZodFirstPartyTypeKind.ZodPromise,
		...processCreateParams(params)
	});
};
var ZodEffects = class extends ZodType {
	innerType() {
		return this._def.schema;
	}
	sourceType() {
		return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
	}
	_parse(input) {
		const { status, ctx } = this._processInputParams(input);
		const effect = this._def.effect || null;
		const checkCtx = {
			addIssue: (arg) => {
				addIssueToContext(ctx, arg);
				if (arg.fatal) status.abort();
				else status.dirty();
			},
			get path() {
				return ctx.path;
			}
		};
		checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
		if (effect.type === "preprocess") {
			const processed = effect.transform(ctx.data, checkCtx);
			if (ctx.common.async) return Promise.resolve(processed).then(async (processed) => {
				if (status.value === "aborted") return INVALID;
				const result = await this._def.schema._parseAsync({
					data: processed,
					path: ctx.path,
					parent: ctx
				});
				if (result.status === "aborted") return INVALID;
				if (result.status === "dirty") return DIRTY(result.value);
				if (status.value === "dirty") return DIRTY(result.value);
				return result;
			});
			else {
				if (status.value === "aborted") return INVALID;
				const result = this._def.schema._parseSync({
					data: processed,
					path: ctx.path,
					parent: ctx
				});
				if (result.status === "aborted") return INVALID;
				if (result.status === "dirty") return DIRTY(result.value);
				if (status.value === "dirty") return DIRTY(result.value);
				return result;
			}
		}
		if (effect.type === "refinement") {
			const executeRefinement = (acc) => {
				const result = effect.refinement(acc, checkCtx);
				if (ctx.common.async) return Promise.resolve(result);
				if (result instanceof Promise) throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
				return acc;
			};
			if (ctx.common.async === false) {
				const inner = this._def.schema._parseSync({
					data: ctx.data,
					path: ctx.path,
					parent: ctx
				});
				if (inner.status === "aborted") return INVALID;
				if (inner.status === "dirty") status.dirty();
				executeRefinement(inner.value);
				return {
					status: status.value,
					value: inner.value
				};
			} else return this._def.schema._parseAsync({
				data: ctx.data,
				path: ctx.path,
				parent: ctx
			}).then((inner) => {
				if (inner.status === "aborted") return INVALID;
				if (inner.status === "dirty") status.dirty();
				return executeRefinement(inner.value).then(() => {
					return {
						status: status.value,
						value: inner.value
					};
				});
			});
		}
		if (effect.type === "transform") if (ctx.common.async === false) {
			const base = this._def.schema._parseSync({
				data: ctx.data,
				path: ctx.path,
				parent: ctx
			});
			if (!isValid(base)) return INVALID;
			const result = effect.transform(base.value, checkCtx);
			if (result instanceof Promise) throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
			return {
				status: status.value,
				value: result
			};
		} else return this._def.schema._parseAsync({
			data: ctx.data,
			path: ctx.path,
			parent: ctx
		}).then((base) => {
			if (!isValid(base)) return INVALID;
			return Promise.resolve(effect.transform(base.value, checkCtx)).then((result) => ({
				status: status.value,
				value: result
			}));
		});
		util$1.assertNever(effect);
	}
};
ZodEffects.create = (schema, effect, params) => {
	return new ZodEffects({
		schema,
		typeName: ZodFirstPartyTypeKind.ZodEffects,
		effect,
		...processCreateParams(params)
	});
};
ZodEffects.createWithPreprocess = (preprocess, schema, params) => {
	return new ZodEffects({
		schema,
		effect: {
			type: "preprocess",
			transform: preprocess
		},
		typeName: ZodFirstPartyTypeKind.ZodEffects,
		...processCreateParams(params)
	});
};
var ZodOptional = class extends ZodType {
	_parse(input) {
		if (this._getType(input) === ZodParsedType.undefined) return OK(void 0);
		return this._def.innerType._parse(input);
	}
	unwrap() {
		return this._def.innerType;
	}
};
ZodOptional.create = (type, params) => {
	return new ZodOptional({
		innerType: type,
		typeName: ZodFirstPartyTypeKind.ZodOptional,
		...processCreateParams(params)
	});
};
var ZodNullable = class extends ZodType {
	_parse(input) {
		if (this._getType(input) === ZodParsedType.null) return OK(null);
		return this._def.innerType._parse(input);
	}
	unwrap() {
		return this._def.innerType;
	}
};
ZodNullable.create = (type, params) => {
	return new ZodNullable({
		innerType: type,
		typeName: ZodFirstPartyTypeKind.ZodNullable,
		...processCreateParams(params)
	});
};
var ZodDefault = class extends ZodType {
	_parse(input) {
		const { ctx } = this._processInputParams(input);
		let data = ctx.data;
		if (ctx.parsedType === ZodParsedType.undefined) data = this._def.defaultValue();
		return this._def.innerType._parse({
			data,
			path: ctx.path,
			parent: ctx
		});
	}
	removeDefault() {
		return this._def.innerType;
	}
};
ZodDefault.create = (type, params) => {
	return new ZodDefault({
		innerType: type,
		typeName: ZodFirstPartyTypeKind.ZodDefault,
		defaultValue: typeof params.default === "function" ? params.default : () => params.default,
		...processCreateParams(params)
	});
};
var ZodCatch = class extends ZodType {
	_parse(input) {
		const { ctx } = this._processInputParams(input);
		const newCtx = {
			...ctx,
			common: {
				...ctx.common,
				issues: []
			}
		};
		const result = this._def.innerType._parse({
			data: newCtx.data,
			path: newCtx.path,
			parent: { ...newCtx }
		});
		if (isAsync(result)) return result.then((result) => {
			return {
				status: "valid",
				value: result.status === "valid" ? result.value : this._def.catchValue({
					get error() {
						return new ZodError(newCtx.common.issues);
					},
					input: newCtx.data
				})
			};
		});
		else return {
			status: "valid",
			value: result.status === "valid" ? result.value : this._def.catchValue({
				get error() {
					return new ZodError(newCtx.common.issues);
				},
				input: newCtx.data
			})
		};
	}
	removeCatch() {
		return this._def.innerType;
	}
};
ZodCatch.create = (type, params) => {
	return new ZodCatch({
		innerType: type,
		typeName: ZodFirstPartyTypeKind.ZodCatch,
		catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
		...processCreateParams(params)
	});
};
var ZodNaN = class extends ZodType {
	_parse(input) {
		if (this._getType(input) !== ZodParsedType.nan) {
			const ctx = this._getOrReturnCtx(input);
			addIssueToContext(ctx, {
				code: ZodIssueCode.invalid_type,
				expected: ZodParsedType.nan,
				received: ctx.parsedType
			});
			return INVALID;
		}
		return {
			status: "valid",
			value: input.data
		};
	}
};
ZodNaN.create = (params) => {
	return new ZodNaN({
		typeName: ZodFirstPartyTypeKind.ZodNaN,
		...processCreateParams(params)
	});
};
var ZodBranded = class extends ZodType {
	_parse(input) {
		const { ctx } = this._processInputParams(input);
		const data = ctx.data;
		return this._def.type._parse({
			data,
			path: ctx.path,
			parent: ctx
		});
	}
	unwrap() {
		return this._def.type;
	}
};
var ZodPipeline = class ZodPipeline extends ZodType {
	_parse(input) {
		const { status, ctx } = this._processInputParams(input);
		if (ctx.common.async) {
			const handleAsync = async () => {
				const inResult = await this._def.in._parseAsync({
					data: ctx.data,
					path: ctx.path,
					parent: ctx
				});
				if (inResult.status === "aborted") return INVALID;
				if (inResult.status === "dirty") {
					status.dirty();
					return DIRTY(inResult.value);
				} else return this._def.out._parseAsync({
					data: inResult.value,
					path: ctx.path,
					parent: ctx
				});
			};
			return handleAsync();
		} else {
			const inResult = this._def.in._parseSync({
				data: ctx.data,
				path: ctx.path,
				parent: ctx
			});
			if (inResult.status === "aborted") return INVALID;
			if (inResult.status === "dirty") {
				status.dirty();
				return {
					status: "dirty",
					value: inResult.value
				};
			} else return this._def.out._parseSync({
				data: inResult.value,
				path: ctx.path,
				parent: ctx
			});
		}
	}
	static create(a, b) {
		return new ZodPipeline({
			in: a,
			out: b,
			typeName: ZodFirstPartyTypeKind.ZodPipeline
		});
	}
};
var ZodReadonly = class extends ZodType {
	_parse(input) {
		const result = this._def.innerType._parse(input);
		const freeze = (data) => {
			if (isValid(data)) data.value = Object.freeze(data.value);
			return data;
		};
		return isAsync(result) ? result.then((data) => freeze(data)) : freeze(result);
	}
	unwrap() {
		return this._def.innerType;
	}
};
ZodReadonly.create = (type, params) => {
	return new ZodReadonly({
		innerType: type,
		typeName: ZodFirstPartyTypeKind.ZodReadonly,
		...processCreateParams(params)
	});
};
ZodObject.lazycreate;
var ZodFirstPartyTypeKind;
(function(ZodFirstPartyTypeKind) {
	ZodFirstPartyTypeKind["ZodString"] = "ZodString";
	ZodFirstPartyTypeKind["ZodNumber"] = "ZodNumber";
	ZodFirstPartyTypeKind["ZodNaN"] = "ZodNaN";
	ZodFirstPartyTypeKind["ZodBigInt"] = "ZodBigInt";
	ZodFirstPartyTypeKind["ZodBoolean"] = "ZodBoolean";
	ZodFirstPartyTypeKind["ZodDate"] = "ZodDate";
	ZodFirstPartyTypeKind["ZodSymbol"] = "ZodSymbol";
	ZodFirstPartyTypeKind["ZodUndefined"] = "ZodUndefined";
	ZodFirstPartyTypeKind["ZodNull"] = "ZodNull";
	ZodFirstPartyTypeKind["ZodAny"] = "ZodAny";
	ZodFirstPartyTypeKind["ZodUnknown"] = "ZodUnknown";
	ZodFirstPartyTypeKind["ZodNever"] = "ZodNever";
	ZodFirstPartyTypeKind["ZodVoid"] = "ZodVoid";
	ZodFirstPartyTypeKind["ZodArray"] = "ZodArray";
	ZodFirstPartyTypeKind["ZodObject"] = "ZodObject";
	ZodFirstPartyTypeKind["ZodUnion"] = "ZodUnion";
	ZodFirstPartyTypeKind["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
	ZodFirstPartyTypeKind["ZodIntersection"] = "ZodIntersection";
	ZodFirstPartyTypeKind["ZodTuple"] = "ZodTuple";
	ZodFirstPartyTypeKind["ZodRecord"] = "ZodRecord";
	ZodFirstPartyTypeKind["ZodMap"] = "ZodMap";
	ZodFirstPartyTypeKind["ZodSet"] = "ZodSet";
	ZodFirstPartyTypeKind["ZodFunction"] = "ZodFunction";
	ZodFirstPartyTypeKind["ZodLazy"] = "ZodLazy";
	ZodFirstPartyTypeKind["ZodLiteral"] = "ZodLiteral";
	ZodFirstPartyTypeKind["ZodEnum"] = "ZodEnum";
	ZodFirstPartyTypeKind["ZodEffects"] = "ZodEffects";
	ZodFirstPartyTypeKind["ZodNativeEnum"] = "ZodNativeEnum";
	ZodFirstPartyTypeKind["ZodOptional"] = "ZodOptional";
	ZodFirstPartyTypeKind["ZodNullable"] = "ZodNullable";
	ZodFirstPartyTypeKind["ZodDefault"] = "ZodDefault";
	ZodFirstPartyTypeKind["ZodCatch"] = "ZodCatch";
	ZodFirstPartyTypeKind["ZodPromise"] = "ZodPromise";
	ZodFirstPartyTypeKind["ZodBranded"] = "ZodBranded";
	ZodFirstPartyTypeKind["ZodPipeline"] = "ZodPipeline";
	ZodFirstPartyTypeKind["ZodReadonly"] = "ZodReadonly";
})(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
const stringType = ZodString.create;
const numberType = ZodNumber.create;
ZodNaN.create;
ZodBigInt.create;
const booleanType = ZodBoolean.create;
ZodDate.create;
ZodSymbol.create;
ZodUndefined.create;
ZodNull.create;
ZodAny.create;
const unknownType = ZodUnknown.create;
ZodNever.create;
ZodVoid.create;
const arrayType = ZodArray.create;
const objectType = ZodObject.create;
ZodObject.strictCreate;
const unionType = ZodUnion.create;
ZodDiscriminatedUnion.create;
ZodIntersection.create;
const tupleType = ZodTuple.create;
const recordType = ZodRecord.create;
ZodMap.create;
ZodSet.create;
ZodFunction.create;
ZodLazy.create;
ZodLiteral.create;
ZodEnum.create;
ZodNativeEnum.create;
ZodPromise.create;
ZodEffects.create;
ZodOptional.create;
ZodNullable.create;
const preprocessType = ZodEffects.createWithPreprocess;
ZodPipeline.create;
//#endregion
//#region src/lib/workflow/schema.ts
/**
* Permissive validation: we accept anything that has the structural minimum and
* keep unknown keys so export can round-trip losslessly (`.passthrough()`).
*/
const positionSchema = tupleType([numberType(), numberType()]);
const connectionTargetSchema = objectType({
	node: stringType(),
	type: stringType().default("main"),
	index: numberType().default(0)
}).passthrough();
const nodeSchema = objectType({
	id: stringType().optional(),
	name: stringType(),
	type: stringType(),
	typeVersion: numberType().default(1),
	position: positionSchema.default([0, 0]),
	parameters: recordType(unknownType()).default({}),
	credentials: recordType(objectType({
		id: stringType().nullish(),
		name: stringType()
	})).optional(),
	disabled: booleanType().optional(),
	notes: stringType().optional()
}).passthrough();
const connectionsSchema = recordType(recordType(arrayType(arrayType(connectionTargetSchema).nullable())));
const workflowSchema = objectType({
	id: unionType([stringType(), numberType()]).optional(),
	name: stringType().default("Imported workflow"),
	active: booleanType().default(false),
	nodes: arrayType(nodeSchema),
	connections: connectionsSchema.default({}),
	settings: preprocessType((v) => v == null ? {} : v, recordType(unknownType()).default({})),
	pinData: preprocessType((v) => v == null ? void 0 : v, recordType(arrayType(recordType(unknownType()))).optional()),
	tags: preprocessType((v) => {
		if (typeof v !== "string") return v;
		try {
			const parsed = JSON.parse(v);
			if (Array.isArray(parsed)) return parsed;
		} catch {}
		return v.length ? [v] : [];
	}, arrayType(unionType([stringType(), objectType({ name: stringType() }).passthrough()])).optional())
}).passthrough();
let counter = 0;
function newId(prefix = "n") {
	counter += 1;
	return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
}
/**
* Normalize common export wrappers into a top-level workflow object.
*
* Accepts:
* - Standard n8n/OpenFlow export: `{ nodes, connections, name, ... }`
* - Template API wrapper: `{ id, name, workflow: { nodes, connections, ... } }`
* - Nested template meta: `{ workflow: { workflow: { nodes, ... }, name, ... } }`
*/
function unwrapWorkflowPayload(raw) {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
	const obj = raw;
	if (Array.isArray(obj.nodes)) return obj;
	const inner = obj.workflow;
	if (inner && typeof inner === "object" && !Array.isArray(inner)) {
		const w = inner;
		if (Array.isArray(w.nodes)) return {
			...w,
			name: w.name ?? obj.name ?? "Imported workflow",
			id: w.id ?? obj.id
		};
		const deeper = w.workflow;
		if (deeper && typeof deeper === "object" && !Array.isArray(deeper)) {
			const d = deeper;
			if (Array.isArray(d.nodes)) return {
				...d,
				name: d.name ?? w.name ?? obj.name ?? "Imported workflow",
				id: d.id ?? w.id ?? obj.id
			};
		}
	}
	return raw;
}
/** Parse raw JSON text (or object) into our workflow model. */
function parseWorkflowJson(input, fallbackId) {
	let raw = input;
	if (typeof input === "string") try {
		raw = JSON.parse(input);
	} catch (e) {
		return {
			ok: false,
			error: `Invalid JSON: ${e.message}`
		};
	}
	raw = unwrapWorkflowPayload(raw);
	const result = workflowSchema.safeParse(raw);
	if (!result.success) {
		const first = result.error.issues[0];
		return {
			ok: false,
			error: `Not a recognisable workflow: ${first.path.join(".") || "root"} — ${first.message}`
		};
	}
	const parsed = result.data;
	return {
		ok: true,
		workflow: {
			...parsed,
			id: fallbackId ?? (parsed.id != null ? String(parsed.id) : newId("wf")),
			name: parsed.name,
			active: Boolean(parsed.active),
			nodes: parsed.nodes.map((n) => ({
				...n,
				id: n.id ?? newId("node"),
				name: n.name,
				type: toCanonicalType(n.type),
				typeVersion: n.typeVersion ?? 1,
				position: [n.position?.[0] ?? 0, n.position?.[1] ?? 0],
				parameters: n.parameters ?? {}
			})),
			connections: parsed.connections ?? {},
			settings: parsed.settings ?? {}
		}
	};
}
/** Rewrite node types for a given export mode (does not mutate input). */
function mapWorkflowTypes(workflow, mode) {
	const mapType = mode === "n8n" ? toWireType : toCanonicalType;
	return {
		...workflow,
		nodes: workflow.nodes.map((n) => ({
			...n,
			type: mapType(n.type)
		}))
	};
}
/** Serialise back to JSON. Default mode is OpenFlow-native type ids. */
function serializeWorkflow(workflow, options) {
	const rest = mapWorkflowTypes(workflow, options?.mode ?? "openflow");
	const ordered = {
		name: rest.name,
		nodes: rest.nodes,
		connections: rest.connections,
		active: rest.active,
		settings: rest.settings,
		...rest.pinData && Object.keys(rest.pinData).length ? { pinData: rest.pinData } : {},
		...rest.tags?.length ? { tags: rest.tags } : {},
		...Object.fromEntries(Object.entries(rest).filter(([k]) => ![
			"name",
			"nodes",
			"connections",
			"active",
			"settings",
			"pinData",
			"tags"
		].includes(k)))
	};
	return JSON.stringify(ordered, null, 2);
}
//#endregion
//#region src/lib/runtime/allowlist.ts
const LITE_NODE_TYPES = [
	"n8n-nodes-base.manualTrigger",
	"n8n-nodes-base.manualWorkflowTrigger",
	"n8n-nodes-base.start",
	"n8n-nodes-base.set",
	"n8n-nodes-base.if",
	"n8n-nodes-base.switch",
	"n8n-nodes-base.merge",
	"n8n-nodes-base.filter",
	"n8n-nodes-base.noOp",
	"n8n-nodes-base.httpRequest",
	"n8n-nodes-base.code",
	"n8n-nodes-base.function",
	"n8n-nodes-base.functionItem",
	"n8n-nodes-base.stickyNote"
];
const HARNESS_EXTRA_TYPES = [
	"@n8n/n8n-nodes-langchain.agent",
	"@n8n/n8n-nodes-langchain.lmChatOpenRouter",
	"n8n-nodes-base.httpRequestTool",
	"n8n-nodes-base.githubTool",
	"n8n-nodes-base.executeCommandTool",
	"n8n-nodes-base.webSearchTool",
	"n8n-nodes-base.gitTool",
	"n8n-nodes-base.filesystemTool"
];
const HARNESS_NODE_TYPES = [...LITE_NODE_TYPES, ...HARNESS_EXTRA_TYPES];
const HARNESS_TOOL_TYPES = [
	"n8n-nodes-base.httpRequestTool",
	"n8n-nodes-base.githubTool",
	"n8n-nodes-base.executeCommandTool",
	"n8n-nodes-base.webSearchTool",
	"n8n-nodes-base.gitTool",
	"n8n-nodes-base.filesystemTool"
];
function expandTypeAliases(type) {
	const out = /* @__PURE__ */ new Set([type]);
	if (type.startsWith("n8n-")) out.add(type.slice(4));
	if (type.startsWith("n8n-nodes-base.")) out.add(type.replace("n8n-nodes-base.", "openflow-node-base."));
	if (type.startsWith("@n8n/n8n-nodes-langchain.")) {
		const rest = type.slice(25);
		out.add(`openflow-node-langchain.${rest}`);
		out.add(`n8n-nodes-langchain.${rest}`);
	}
	if (type.startsWith("openflow-node-base.")) {
		out.add(type.replace("openflow-node-base.", "n8n-nodes-base."));
		out.add(type.replace("openflow-node-base.", "nodes-base."));
	}
	if (type.startsWith("openflow-node-langchain.")) {
		const rest = type.slice(24);
		out.add(`@n8n/n8n-nodes-langchain.${rest}`);
		out.add(`n8n-nodes-langchain.${rest}`);
	}
	return [...out];
}
function buildSet(types) {
	const set = /* @__PURE__ */ new Set();
	for (const t of types) for (const a of expandTypeAliases(t)) set.add(a);
	return set;
}
const LITE_SET = buildSet(LITE_NODE_TYPES);
const HARNESS_SET = buildSet(HARNESS_NODE_TYPES);
const TOOL_SET = buildSet(HARNESS_TOOL_TYPES);
function normalizeNodeType(type) {
	return type.startsWith("n8n-") ? type : `n8n-${type}`;
}
function isLiteNodeType(type) {
	return LITE_SET.has(type);
}
function isHarnessNodeType(type) {
	return HARNESS_SET.has(type);
}
function isHarnessToolType(type) {
	return TOOL_SET.has(type);
}
function allowlistForPreset(preset) {
	return preset === "harness" ? HARNESS_NODE_TYPES : LITE_NODE_TYPES;
}
function isAllowedType(type, preset) {
	return preset === "harness" ? isHarnessNodeType(type) : isLiteNodeType(type);
}
function toolPolicyKey(type) {
	return type.split(".").pop() ?? type;
}
const LITE_TRIGGER_TYPES = /* @__PURE__ */ new Set([
	"n8n-nodes-base.manualTrigger",
	"n8n-nodes-base.manualWorkflowTrigger",
	"n8n-nodes-base.start",
	"nodes-base.manualTrigger",
	"nodes-base.manualWorkflowTrigger",
	"nodes-base.start"
]);
const manualTriggerExecutor = definitionToExecutor(defineNode({
	type: "n8n-nodes-base.manualTrigger",
	async execute() {
		return [[{ json: {} }]];
	}
}));
//#endregion
//#region src/lib/engine/executors/set.ts
/** Maps wire type enums (both v3 and v3.3 assignment shapes) to coerce targets. */
const TYPE_MAP = {
	stringValue: "string",
	string: "string",
	numberValue: "number",
	number: "number",
	booleanValue: "boolean",
	boolean: "boolean",
	arrayValue: "array",
	array: "array",
	objectValue: "object",
	object: "object"
};
const setExecutor = async (ctx) => {
	const items = ensureItems(ctx.getInputItems(0));
	if (isLegacyShape(ctx.getParams())) return [items.map((item, idx) => runLegacy(ctx, item, idx))];
	const mode = ctx.getParam("mode", "manual");
	const options = ctx.getParam("options", {}) ?? {};
	const dotNotation = options.dotNotation !== false;
	const ignoreErrors = options.ignoreConversionErrors === true;
	const include = ctx.getParam("include", "all");
	const includeOtherFields = ctx.getParam("includeOtherFields", false);
	const includeFields = ctx.getParam("includeFields", "");
	const excludeFields = ctx.getParam("excludeFields", "");
	const fields = collectFields(ctx);
	if (mode === "raw") {
		const rawJson = ctx.getParam("jsonOutput");
		return [items.map((item, idx) => {
			return {
				json: mergeRaw(buildBase(item, include, includeOtherFields, includeFields, excludeFields), rawJson, item, idx, ctx.vars),
				binary: item.binary,
				pairedItem: item.pairedItem ?? {
					item: idx,
					input: 0
				}
			};
		})];
	}
	return [items.map((item, idx) => {
		const json = buildBase(item, include, includeOtherFields, includeFields, excludeFields);
		for (const field of fields) {
			const name = field.name;
			if (!name) continue;
			const typeKey = field.type ?? "stringValue";
			assignField(json, name, coerceType(resolveValue$3(field[typeKey] ?? field.value, item, idx, ctx.vars), TYPE_MAP[typeKey] ?? "string", ignoreErrors), dotNotation);
		}
		return {
			json,
			binary: item.binary,
			pairedItem: item.pairedItem ?? {
				item: idx,
				input: 0
			}
		};
	})];
};
/** Detects the legacy typeVersion 1–2 wire shape: `keepOnlySet` or `values.{string,number,boolean}` buckets. */
function isLegacyShape(params) {
	if ("keepOnlySet" in params) return true;
	const values = params.values;
	if (values && typeof values === "object" && !Array.isArray(values)) {
		const v = values;
		return Array.isArray(v.string) || Array.isArray(v.number) || Array.isArray(v.boolean);
	}
	return false;
}
/** Collect field assignments from `assignments` (v3.3+) or `fields` (v3–3.2). */
function collectFields(ctx) {
	const assignmentsContainer = ctx.getParam("assignments");
	if (assignmentsContainer) {
		const arr = Array.isArray(assignmentsContainer) ? assignmentsContainer : assignmentsContainer.assignments ?? [];
		if (arr.length > 0) return arr;
	}
	const fieldsContainer = ctx.getParam("fields");
	if (Array.isArray(fieldsContainer)) return fieldsContainer;
	return fieldsContainer?.values ?? [];
}
/** Build the output base object from the input item per include / keep-only rules. */
function buildBase(item, include, includeOtherFields, includeFields, excludeFields) {
	if (include === "none") return {};
	if (include === "selected") {
		const out = {};
		for (const n of parseFieldList(includeFields)) if (n in item.json) out[n] = item.json[n];
		return out;
	}
	if (include === "except") {
		const drop = new Set(parseFieldList(excludeFields));
		const out = {};
		for (const [k, v] of Object.entries(item.json)) if (!drop.has(k)) out[k] = v;
		return out;
	}
	return includeOtherFields ? { ...item.json } : {};
}
function resolveValue$3(rawValue, item, idx, vars) {
	if (typeof rawValue === "string") {
		const result = evaluateExpression(rawValue, {
			json: item.json,
			itemIndex: idx,
			vars: vars ?? {}
		});
		if (result.ok) return result.value;
		return rawValue;
	}
	return rawValue;
}
function assignField(target, name, value, dotNotation) {
	if (!dotNotation || !name.includes(".")) {
		target[name] = value;
		return;
	}
	const parts = name.split(".");
	let obj = target;
	for (let i = 0; i < parts.length - 1; i++) {
		const part = parts[i];
		const next = obj[part];
		if (typeof next !== "object" || next === null || Array.isArray(next)) obj[part] = {};
		obj = obj[part];
	}
	obj[parts[parts.length - 1]] = value;
}
/** Merge evaluated JSON output onto the include-filtered base. */
function mergeRaw(base, rawJson, item, idx, vars) {
	const text = typeof rawJson === "string" ? rawJson : rawJson == null ? "{}" : JSON.stringify(rawJson);
	const result = evaluateExpression(text, {
		json: item.json,
		itemIndex: idx,
		vars: vars ?? {}
	});
	const parsed = safeParse$2(typeof result.value === "string" ? result.value : text);
	if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) return {
		...base,
		...parsed
	};
	return {
		...base,
		value: parsed
	};
}
/** Legacy typeVersion 1–2 path: keepOnlySet + per-type value buckets. */
function runLegacy(ctx, item, idx) {
	const keepOnlySet = ctx.getParam("keepOnlySet", false);
	const dotNotation = (ctx.getParam("options", {}) ?? {}).dotNotation !== false;
	const json = keepOnlySet ? {} : { ...item.json };
	const valuesContainer = ctx.getParam("values", {}) ?? {};
	for (const [bucket, targetType] of [
		["string", "string"],
		["number", "number"],
		["boolean", "boolean"]
	]) for (const entry of valuesContainer[bucket] ?? []) {
		const name = entry.name;
		if (!name) continue;
		assignField(json, name, coerceType(resolveValue$3(entry.value, item, idx, ctx.vars), targetType, false), dotNotation);
	}
	return {
		json,
		binary: item.binary,
		pairedItem: item.pairedItem ?? {
			item: idx,
			input: 0
		}
	};
}
function coerceType(value, targetType, ignoreErrors) {
	switch (targetType) {
		case "number":
			if (typeof value === "number") return value;
			if (typeof value === "boolean") return value ? 1 : 0;
			if (typeof value === "string") {
				const n = Number(value);
				if (isNaN(n)) {
					if (ignoreErrors) return value;
					return 0;
				}
				return n;
			}
			return 0;
		case "boolean":
			if (typeof value === "boolean") return value;
			if (typeof value === "string") return value === "true" || value === "1";
			return Boolean(value);
		case "array":
			if (Array.isArray(value)) return value;
			if (typeof value === "string") {
				const parsed = safeParse$2(value);
				return Array.isArray(parsed) ? parsed : [parsed];
			}
			return [value];
		case "object":
			if (typeof value === "object" && value !== null && !Array.isArray(value)) return value;
			if (typeof value === "string") {
				const parsed = safeParse$2(value);
				return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : { raw: parsed };
			}
			return { raw: value };
		default: return value;
	}
}
function parseFieldList(value) {
	return value.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}
function safeParse$2(s) {
	try {
		return JSON.parse(s);
	} catch {
		return s;
	}
}
//#endregion
//#region src/lib/engine/conditions.ts
function resolveConditionValue(raw, itemJson, extras) {
	if (typeof raw !== "string") return raw;
	if (raw.startsWith("{{") || raw.startsWith("=")) {
		const result = evaluateExpression(raw, {
			json: itemJson,
			vars: extras?.vars,
			env: extras?.env,
			nodeData: extras?.nodeData,
			allItems: extras?.allItems,
			envAllowlist: extras?.envAllowlist
		});
		return result.ok ? result.value : raw;
	}
	return raw;
}
function normalizeOperator(op) {
	if (op && typeof op === "object") {
		const obj = op;
		op = obj.operation ?? obj.type;
	}
	const s = String(op ?? "");
	switch (s) {
		case "equal": return "equals";
		case "notEqual": return "notEquals";
		case "larger": return "gt";
		case "smaller": return "lt";
		case "largerEqual": return "gte";
		case "smallerEqual": return "lte";
		case "true": return "isTrue";
		case "false": return "isFalse";
		case "empty": return "isEmpty";
		case "notEmpty": return "isNotEmpty";
		default: return s;
	}
}
function toStr(v, ignoreCase) {
	const s = v == null ? "" : String(v);
	return ignoreCase ? s.toLowerCase() : s;
}
function asNumber$1(v) {
	if (typeof v === "number") return v;
	const n = Number(v);
	return Number.isFinite(n) ? n : NaN;
}
function dateMs(v) {
	const t = new Date(typeof v === "string" ? v : String(v ?? "")).getTime();
	return Number.isFinite(t) ? t : NaN;
}
function isEmptyValue(v) {
	if (v == null || v === "") return true;
	if (Array.isArray(v) && v.length === 0) return true;
	if (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0) return true;
	return false;
}
/** Empty needle must not match every string (`"".includes("")` / startsWith/endsWith). */
function hasNonEmptyNeedle(right) {
	return right != null && String(right) !== "";
}
function isTruthy(v) {
	if (typeof v === "boolean") return v;
	if (typeof v === "number") return v === 1;
	if (typeof v === "string") {
		const s = v.trim().toLowerCase();
		return s === "true" || s === "1" || s === "yes";
	}
	return false;
}
function isFalsy(v) {
	if (typeof v === "boolean") return !v;
	if (typeof v === "number") return v === 0;
	if (typeof v === "string") {
		const s = v.trim().toLowerCase();
		return s === "false" || s === "0" || s === "no" || s === "";
	}
	return v == null;
}
function evaluateCondition(left, right, op, ignoreCase) {
	switch (op) {
		case "equals":
			if (left === right) return true;
			if (left == null || right == null) return false;
			if (typeof left === "string" || typeof right === "string") return toStr(left, ignoreCase) === toStr(right, ignoreCase);
			return false;
		case "notEquals": return !evaluateCondition(left, right, "equals", ignoreCase);
		case "contains":
			if (!hasNonEmptyNeedle(right)) return false;
			return toStr(left, ignoreCase).includes(toStr(right, ignoreCase));
		case "notContains":
			if (!hasNonEmptyNeedle(right)) return true;
			return !toStr(left, ignoreCase).includes(toStr(right, ignoreCase));
		case "startsWith":
			if (!hasNonEmptyNeedle(right)) return false;
			return toStr(left, ignoreCase).startsWith(toStr(right, ignoreCase));
		case "notStartsWith":
			if (!hasNonEmptyNeedle(right)) return true;
			return !toStr(left, ignoreCase).startsWith(toStr(right, ignoreCase));
		case "endsWith":
			if (!hasNonEmptyNeedle(right)) return false;
			return toStr(left, ignoreCase).endsWith(toStr(right, ignoreCase));
		case "notEndsWith":
			if (!hasNonEmptyNeedle(right)) return true;
			return !toStr(left, ignoreCase).endsWith(toStr(right, ignoreCase));
		case "isEmpty": return isEmptyValue(left);
		case "isNotEmpty": return !isEmptyValue(left);
		case "exists": return left !== void 0;
		case "notExists": return left === void 0;
		case "gt": return asNumber$1(left) > asNumber$1(right);
		case "gte": return asNumber$1(left) >= asNumber$1(right);
		case "lt": return asNumber$1(left) < asNumber$1(right);
		case "lte": return asNumber$1(left) <= asNumber$1(right);
		case "isTrue": return isTruthy(left);
		case "isFalse": return isFalsy(left);
		case "regex": try {
			return new RegExp(String(right ?? ""), ignoreCase ? "i" : "").test(String(left ?? ""));
		} catch {
			return false;
		}
		case "notRegex": try {
			return !new RegExp(String(right ?? ""), ignoreCase ? "i" : "").test(String(left ?? ""));
		} catch {
			return false;
		}
		case "after": return dateMs(left) > dateMs(right);
		case "before": return dateMs(left) < dateMs(right);
		case "afterOrEqual": return dateMs(left) >= dateMs(right);
		case "beforeOrEqual": return dateMs(left) <= dateMs(right);
		default: return false;
	}
}
function evaluateConditionRow(row, itemJson, ignoreCase, extras) {
	return evaluateCondition(resolveConditionValue(row.leftValue ?? row.value1, itemJson, extras), resolveConditionValue(row.rightValue ?? row.value2, itemJson, extras), normalizeOperator(row.operator ?? row.operation), ignoreCase);
}
function combineConditionResults(results, combinator) {
	if (results.length === 0) return false;
	const c = combinator.toLowerCase();
	if (c === "or" || c === "any") return results.some(Boolean);
	return results.every(Boolean);
}
//#endregion
//#region src/lib/engine/executors/if.ts
function extractV1Rows(container) {
	const rows = [];
	for (const key of [
		"number",
		"string",
		"boolean",
		"dateTime",
		"object",
		"array"
	]) {
		const arr = container[key];
		if (Array.isArray(arr)) for (const row of arr) rows.push(row);
	}
	return rows;
}
const ifExecutor = async (ctx, node) => {
	const inputItems = ctx.getNodeInputItems(node.name, 0);
	const condContainer = node.parameters.conditions;
	let rawRows;
	let nestedCombinator;
	if (Array.isArray(condContainer)) rawRows = condContainer;
	else if (condContainer) {
		nestedCombinator = condContainer.combinator;
		if (condContainer.conditions && condContainer.conditions.length > 0) rawRows = condContainer.conditions;
		else rawRows = extractV1Rows(condContainer);
	} else rawRows = [];
	const nestedComb = nestedCombinator;
	const topCombinator = node.parameters.combinator;
	const v1Combine = node.parameters.combineOperation;
	const combinator = String(nestedComb ?? topCombinator ?? v1Combine ?? "and").toLowerCase();
	const ignoreCase = (node.parameters.options ?? {}).ignoreCase ?? true;
	const trueItems = [];
	const falseItems = [];
	const exprExtras = {
		vars: ctx.vars,
		env: typeof process !== "undefined" ? process.env : void 0
	};
	if (rawRows.length === 0) return [trueItems, inputItems.slice()];
	for (const item of inputItems) if (combineConditionResults(rawRows.map((row) => evaluateConditionRow(row, item.json, ignoreCase, exprExtras)), combinator)) trueItems.push(item);
	else falseItems.push(item);
	return [trueItems, falseItems];
};
//#endregion
//#region src/lib/engine/executors/switch.ts
function evalRuleConditions(rule, itemJson, ignoreCase, extras) {
	const container = rule.conditions;
	let rows = [];
	let combinator = "and";
	if (container) {
		combinator = String(container.combinator ?? "and").toLowerCase();
		rows = container.conditions ?? [];
	} else if (rule.leftValue !== void 0 || rule.rightValue !== void 0) rows = [{
		leftValue: rule.leftValue,
		rightValue: rule.rightValue,
		operator: rule.operator,
		operation: rule.operation
	}];
	if (rows.length === 0) return false;
	return combineConditionResults(rows.map((row) => evaluateConditionRow(row, itemJson, ignoreCase, extras)), combinator);
}
const switchExecutor = async (ctx, node) => {
	const inputItems = ctx.getNodeInputItems(node.name, 0);
	const mode = node.parameters.mode ?? "rules";
	const options = node.parameters.options ?? {};
	const ignoreCase = options.ignoreCase !== false;
	const allMatchingOutputs = options.allMatchingOutputs === true;
	const exprExtras = {
		vars: ctx.vars,
		env: typeof process !== "undefined" ? process.env : void 0
	};
	const fallbackOutput = String(node.parameters.fallbackOutput ?? options.fallbackOutput ?? "none");
	if (mode === "expression") {
		const numberOutputs = Math.max(1, Number(node.parameters.numberOutputs ?? 1));
		const outputExpr = node.parameters.output ?? "={{ 0 }}";
		const outputs = Array.from({ length: numberOutputs }, () => []);
		for (const item of inputItems) {
			const result = evaluateExpression(outputExpr, {
				json: item.json,
				...exprExtras
			});
			const idx = result.ok && typeof result.value === "number" ? result.value : NaN;
			if (Number.isInteger(idx) && idx >= 0 && idx < numberOutputs) outputs[idx].push(item);
		}
		return outputs;
	}
	const rulesContainer = node.parameters.rules;
	const rules = rulesContainer?.rules ?? rulesContainer?.values ?? [];
	const totalOutputs = Math.max(1, rules.length) + (fallbackOutput === "extra" ? 1 : 0);
	const outputs = Array.from({ length: totalOutputs }, () => []);
	for (const item of inputItems) {
		let matched = false;
		for (let i = 0; i < rules.length; i++) {
			const rule = rules[i];
			if (evalRuleConditions(rule, item.json, Boolean(ignoreCase), exprExtras)) {
				outputs[i].push(item);
				matched = true;
				if (!allMatchingOutputs) break;
			}
		}
		if (!matched) {
			if (fallbackOutput === "extra") outputs[totalOutputs - 1].push(item);
			else if (fallbackOutput === "first") outputs[0].push(item);
		}
	}
	return outputs;
};
//#endregion
//#region src/lib/engine/executors/merge.ts
const mergeExecutor = async (ctx) => {
	const mode = ctx.getParam("mode", "append");
	const inputCount = Math.max(2, Number(ctx.getParam("numberInputs", 2)));
	const inputs = [];
	for (let i = 0; i < inputCount; i++) inputs.push(ctx.getInputItems(i));
	if (mode === "append") return [inputs.flat()];
	if (mode === "combine") {
		const combineBy = ctx.getParam("combineBy", "combineByFields");
		const includeUnpaired = (ctx.getParam("options", {}) ?? {}).includeUnpaired === true;
		if (combineBy === "combineByPosition") {
			const maxLen = Math.max(0, ...inputs.map((i) => i.length));
			const result = [];
			const unpaired = [];
			for (let idx = 0; idx < maxLen; idx++) {
				const present = inputs.filter((input) => idx < input.length);
				if (present.length === inputs.length) {
					const merged = {};
					for (const input of inputs) Object.assign(merged, input[idx].json);
					result.push({ json: merged });
				} else if (includeUnpaired) for (const input of present) unpaired.push({ json: { ...input[idx].json } });
			}
			result.push(...unpaired);
			return [result];
		}
		if (combineBy === "combineByFields") {
			const fields = (ctx.getParam("fieldsToMatchString", "") ?? "").split(",").map((f) => f.trim()).filter(Boolean);
			const keyOf = (json) => fields.map((f) => String(json[f] ?? "")).join("\0");
			const map = /* @__PURE__ */ new Map();
			const unpaired = [];
			for (const input of inputs) for (const item of input) {
				const k = keyOf(item.json);
				if (!k && fields.length > 0) {
					unpaired.push(item);
					continue;
				}
				const existing = map.get(k);
				if (existing) map.set(k, { json: {
					...existing.json,
					...item.json
				} });
				else map.set(k, { json: { ...item.json } });
			}
			const result = Array.from(map.values());
			if (includeUnpaired) result.push(...unpaired);
			return [result];
		}
		if (combineBy === "combineAll") {
			let result = inputs[0]?.map((item) => ({ json: { ...item.json } })) ?? [];
			for (let i = 1; i < inputs.length; i++) {
				const next = [];
				for (const a of result) for (const b of inputs[i]) next.push({ json: {
					...a.json,
					...b.json
				} });
				result = next;
			}
			return [result];
		}
	}
	if (mode === "chooseBranch") {
		const output = ctx.getParam("output", "0");
		const branchIdx = parseInt(String(output), 10);
		return [inputs[Number.isNaN(branchIdx) ? 0 : branchIdx] ?? []];
	}
	return [inputs.flat()];
};
//#endregion
//#region src/lib/engine/executors/filter.ts
const filterExecutor = async (ctx, node) => {
	const inputItems = ctx.getNodeInputItems(node.name, 0);
	const mode = node.parameters.mode ?? "manual";
	const exprExtras = {
		vars: ctx.vars,
		env: typeof process !== "undefined" ? process.env : void 0
	};
	if (mode === "expression") {
		const expr = node.parameters.expression ?? "";
		const output = [];
		for (const item of inputItems) {
			const result = evaluateExpression(expr, {
				json: item.json,
				...exprExtras
			});
			if (result.ok && result.value) output.push(item);
		}
		return [output];
	}
	const condContainer = node.parameters.conditions;
	const rawRows = Array.isArray(condContainer) ? condContainer : condContainer?.conditions ?? [];
	const nestedCombinator = Array.isArray(condContainer) ? void 0 : condContainer?.combinator;
	const topCombinator = node.parameters.combinator;
	const v1Combine = node.parameters.combineConditions;
	const combinator = String(nestedCombinator ?? topCombinator ?? v1Combine ?? "and").toLowerCase();
	const ignoreCase = (node.parameters.options ?? {}).ignoreCase ?? true;
	const output = [];
	for (const item of inputItems) {
		if (rawRows.length === 0) {
			output.push(item);
			continue;
		}
		if (combineConditionResults(rawRows.map((row) => evaluateConditionRow(row, item.json, ignoreCase, exprExtras)), combinator)) output.push(item);
	}
	return [output];
};
//#endregion
//#region src/lib/engine/executors/noop.ts
const noopExecutor = async (ctx) => {
	const inputItems = ctx.getInputItems(0);
	if (inputItems.length === 0) return [[{ json: {} }]];
	return [inputItems.map((item, idx) => withPairedItem(item, idx))];
};
//#endregion
//#region src/lib/engine/executors/http-request.ts
function resolveValue$2(raw, itemJson) {
	if (typeof raw !== "string") return raw;
	if (raw.startsWith("{{") || raw.startsWith("=")) {
		const result = evaluateExpression(raw, { json: itemJson });
		return result.ok ? result.value : raw;
	}
	return raw;
}
const httpRequestExecutor = async (ctx, node) => {
	const itemJson = ctx.getNodeInputItems(node.name, 0)[0]?.json ?? {};
	const method = node.parameters.method ?? "GET";
	const rawUrl = node.parameters.url ?? "";
	let url = String(resolveValue$2(rawUrl, itemJson));
	const headers = {};
	if (node.parameters.sendHeaders) {
		const headerContainer = node.parameters.headerParameters;
		const headerParams = Array.isArray(headerContainer) ? headerContainer : headerContainer?.parameters ?? [];
		for (const h of headerParams) if (h.name) headers[h.name] = String(resolveValue$2(h.value, itemJson));
	}
	let bodyInit;
	const isBodyAllowed = method !== "GET" && method !== "HEAD";
	if (node.parameters.sendBody && isBodyAllowed) {
		const contentType = node.parameters.contentType ?? "json";
		if (contentType === "json") {
			const parsed = resolveJsonBody(node.parameters.jsonBody, itemJson);
			bodyInit = JSON.stringify(parsed);
			headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
		} else if (contentType === "form-urlencoded") {
			bodyInit = (node.parameters.bodyParameters?.parameters ?? []).map((p) => `${encodeURIComponent(p.name)}=${encodeURIComponent(resolveValue$2(p.value, itemJson))}`).join("&");
			headers["Content-Type"] = headers["Content-Type"] ?? "application/x-www-form-urlencoded";
		} else {
			const raw = node.parameters.jsonBody;
			bodyInit = typeof raw === "string" ? raw : JSON.stringify(raw);
		}
	}
	const credentials = node.credentials ?? {};
	if (credentials.httpBasicAuth && ctx.getCredential) {
		const cred = await ctx.getCredential("httpBasicAuth");
		if (cred) {
			const user = String(cred.user ?? "");
			const password = String(cred.password ?? "");
			headers["Authorization"] = `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
		}
	}
	if (credentials.httpHeaderAuth && ctx.getCredential) {
		const cred = await ctx.getCredential("httpHeaderAuth");
		if (cred) {
			const headerName = String(cred.name ?? "X-API-Key");
			headers[headerName] = String(cred.value ?? "");
		}
	}
	if (credentials.httpQueryAuth && ctx.getCredential) {
		const cred = await ctx.getCredential("httpQueryAuth");
		if (cred) {
			const paramName = String(cred.name ?? "api_key");
			const paramValue = String(cred.value ?? "");
			const separator = url.includes("?") ? "&" : "?";
			url = `${url}${separator}${encodeURIComponent(paramName)}=${encodeURIComponent(paramValue)}`;
		}
	}
	if (node.parameters.sendQuery) {
		const queryContainer = node.parameters.queryParameters;
		const queryParams = Array.isArray(queryContainer) ? queryContainer : queryContainer?.parameters ?? [];
		if (queryParams.length > 0) {
			const u = new URL(url);
			for (const q of queryParams) if (q.name) u.searchParams.set(q.name, String(resolveValue$2(q.value, itemJson)));
			return executeWithUrl(u.toString(), method, headers, bodyInit, node, ctx.allowUrl);
		}
	}
	return executeWithUrl(url, method, headers, bodyInit, node, ctx.allowUrl);
};
async function executeWithUrl(url, method, headers, body, node, allowUrl) {
	const options = node.parameters.options ?? {};
	const responseOptions = options.response ?? {};
	const timeout = options.timeout ?? 1e4;
	const followRedirect = options.followRedirect !== false;
	const fullResponse = responseOptions.fullResponse === true || options.fullResponse === true;
	const neverError = responseOptions.neverError === true || options.neverError === true;
	const responseFormat = responseOptions.responseFormat ?? "autodetect";
	if (allowUrl && !allowUrl(url)) throw new Error(`HTTP Request blocked by allowUrl policy: ${url}`);
	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeout);
		const response = await fetch(url, {
			method,
			headers,
			body,
			signal: controller.signal,
			redirect: followRedirect ? "follow" : "manual"
		});
		clearTimeout(timer);
		if (!response.ok && !neverError) throw new Error(`HTTP ${response.status} ${response.statusText ?? ""}`.trim());
		let responseData;
		if (responseFormat === "json") responseData = await response.json();
		else if (responseFormat === "text") responseData = await response.text();
		else if (responseFormat === "file") responseData = await response.text();
		else if ((response.headers.get("content-type") ?? "").includes("application/json")) responseData = await response.json();
		else responseData = await response.text();
		if (fullResponse) return [[{ json: {
			statusCode: response.status,
			headers: Object.fromEntries(response.headers.entries()),
			body: responseData
		} }]];
		return [[{ json: typeof responseData === "object" && responseData !== null ? responseData : { data: responseData } }]];
	} catch (err) {
		throw new Error(`HTTP Request failed: ${err instanceof Error ? err.message : String(err)}`);
	}
}
function isEmptyJsonBody(raw) {
	if (raw == null || raw === "") return true;
	if (typeof raw === "object" && !Array.isArray(raw) && Object.keys(raw).length === 0) return true;
	return false;
}
/** Empty jsonBody uses incoming `$json.body` (or the whole item). String expressions are evaluated. */
function resolveJsonBody(raw, itemJson) {
	if (isEmptyJsonBody(raw)) return itemJson.body !== void 0 ? itemJson.body : itemJson;
	if (typeof raw === "string") {
		const resolved = resolveValue$2(raw, itemJson);
		if (typeof resolved === "string") return safeParse$1(resolved);
		return resolved;
	}
	return raw;
}
function safeParse$1(s) {
	try {
		return JSON.parse(s);
	} catch {
		return s;
	}
}
//#endregion
//#region src/lib/engine/executors/code-result.ts
function normalizeCodeResult(result) {
	if (result === null || result === void 0) throw new Error("Code node doesn't return an object");
	if (Array.isArray(result)) return result.map((r) => toExecutionData(r));
	return [toExecutionData(result)];
}
function toExecutionData(value) {
	if (value === null || value === void 0) throw new Error("Code node doesn't return an object");
	if (value && typeof value === "object" && "json" in value) {
		const item = value;
		if (item.json === null || typeof item.json !== "object" || Array.isArray(item.json)) throw new Error("Code node output 'json' property must be an object, not an array or primitive");
		return {
			json: item.json,
			pairedItem: item.pairedItem,
			binary: item.binary
		};
	}
	if (value && typeof value === "object" && !Array.isArray(value)) return { json: value };
	return { json: { result: value } };
}
//#endregion
//#region src/lib/engine/executors/code.ts
const codeExecutor = async (ctx) => {
	const inputItems = ctx.getInputItems(0);
	const mode = ctx.getParam("mode", "runOnceForAllItems");
	const language = ctx.getParam("language", "javaScript");
	if (language === "pythonNative") {
		const { runPythonNative } = await import("../engine/executors/code-python-native");
		return runPythonMode(ctx.getParam("pythonCode", "") ?? "", mode, inputItems, runPythonNative);
	}
	if (language === "python") {
		const { runPythonPyodide } = await import("../engine/executors/code-python-pyodide");
		return runPythonMode(ctx.getParam("pythonCode", "") ?? "", mode, inputItems, runPythonPyodide);
	}
	if (language !== "javaScript") throw new Error(`Code node language '${language}' is not supported; use 'javaScript', 'pythonNative', or 'python'.`);
	const code = ctx.getParam("jsCode", "") ?? "";
	const params = ctx.getParams();
	let ivm;
	try {
		const mod = await import(
			/* @vite-ignore */
			"isolated-vm"
);
		ivm = mod.default ?? mod;
		if (typeof ivm.Isolate !== "function") throw new Error("isolated-vm loaded but Isolate export is missing");
	} catch (err) {
		const detail = err instanceof Error ? err.message : String(err);
		throw new Error(`Code node requires isolated-vm (server-side only): ${detail}`);
	}
	if (mode === "runOnceForEachItem") {
		const outputItems = [];
		const source = inputItems.length > 0 ? inputItems : [{ json: {} }];
		for (const item of source) {
			const result = await runInSandbox(ivm, code, source, item.json ?? {}, params);
			if (Array.isArray(result)) outputItems.push(...normalizeCodeResult(result));
			else outputItems.push(toExecutionData(result));
		}
		return [outputItems];
	}
	const firstItem = inputItems[0]?.json ?? {};
	return [normalizeCodeResult(await runInSandbox(ivm, code, inputItems.length > 0 ? inputItems : [{ json: {} }], firstItem, params))];
};
async function runPythonMode(code, mode, inputItems, runner) {
	if (mode === "runOnceForEachItem") {
		const outputItems = [];
		const source = inputItems.length > 0 ? inputItems : [{ json: {} }];
		for (const item of source) {
			const result = await runner(code, mode, source, item);
			if (Array.isArray(result)) outputItems.push(...normalizeCodeResult(result));
			else outputItems.push(toExecutionData(result));
		}
		return [outputItems];
	}
	return [normalizeCodeResult(await runner(code, mode, inputItems.length > 0 ? inputItems : [{ json: {} }]))];
}
async function runInSandbox(ivm, code, allItems, activeJson, params) {
	const isolate = new ivm.Isolate();
	const context = await isolate.createContext();
	try {
		await context.global.set("global", context.global.derefInto());
		const payload = {
			items: allItems.map((item) => ({
				json: item.json ?? {},
				pairedItem: item.pairedItem
			})),
			activeJson,
			params
		};
		await context.global.set("__ofPayload", new ivm.ExternalCopy(payload).copyInto());
		await (await isolate.compileScript(`
      const __items = __ofPayload.items;
      const __active = __ofPayload.activeJson;
      globalThis.$json = __active;
      globalThis.items = __items;
      globalThis.$input = {
        all: () => __items,
        first: () => __items[0] ?? { json: {} },
        last: () => __items[__items.length - 1] ?? { json: {} },
        item: { json: __active },
        params: __ofPayload.params,
        context: { noItemsLeft: false },
      };
      globalThis.console = {
        log: (...args) => undefined,
        warn: (...args) => undefined,
        error: (...args) => undefined,
      };
      delete globalThis.__ofPayload;
    `)).run(context);
		return await context.evalClosure(code, [], { result: {
			promise: true,
			copy: true
		} });
	} finally {
		context.release();
		isolate.dispose();
	}
}
//#endregion
//#region src/lib/engine/executors/sticky-note.ts
const stickyNoteExecutor = async () => {
	return [];
};
//#endregion
//#region src/lib/engine/executors/langchain-agent.ts
const MCP_CLIENT_TOOL_TYPE = "@n8n/n8n-nodes-langchain.mcpClientTool";
function findConnectedSubNodes(connections, agentName) {
	const subs = {
		languageModels: [],
		tools: [],
		memory: [],
		outputParser: []
	};
	for (const [sourceName, channels] of Object.entries(connections)) for (const outputs of Object.values(channels)) for (const targets of outputs) {
		if (!targets) continue;
		for (const t of targets) {
			if (!t || t.node !== agentName) continue;
			const ref = {
				name: sourceName,
				index: t.index ?? 0
			};
			switch (t.type) {
				case "ai_languageModel":
					subs.languageModels.push(ref);
					break;
				case "ai_tool":
					subs.tools.push(ref);
					break;
				case "ai_memory":
					subs.memory.push(ref);
					break;
				case "ai_outputParser":
					subs.outputParser.push(ref);
					break;
			}
		}
	}
	subs.languageModels.sort((a, b) => a.index - b.index);
	return subs;
}
function getModelHandle(ctx, name) {
	const items = ctx.getNodeInputItems(name, 0);
	if (!items || items.length === 0) return null;
	const json = items[0].json;
	if (json && typeof json.invoke === "function") return json;
	return null;
}
function observationFromMcpResult(result) {
	if (result == null) return "";
	if (typeof result === "string") return result;
	if (typeof result === "object") {
		const r = result;
		if (typeof r.content === "string") return r.isError ? `Error: ${r.content}` : r.content;
	}
	try {
		return JSON.stringify(result);
	} catch {
		return String(result);
	}
}
function observationFromToolResult(obs) {
	if (obs == null) return "";
	if (typeof obs === "string") return obs;
	if (typeof obs === "object") {
		const o = obs;
		if (typeof o.content === "string") return o.isError ? `Error: ${o.content}` : o.content;
		try {
			return JSON.stringify(obs);
		} catch {
			return String(obs);
		}
	}
	return String(obs);
}
function expandToolJson(json) {
	if (typeof json.name === "string") {
		const handle = json;
		if (handle.schema == null && handle.inputSchema != null) handle.schema = handle.inputSchema;
		if (handle.schema == null && handle.parameters != null) handle.schema = handle.parameters;
		return [handle];
	}
	const bundle = json;
	if ((bundle.type === MCP_CLIENT_TOOL_TYPE || Array.isArray(bundle.tools) && typeof bundle.invoke === "function") && Array.isArray(bundle.tools) && typeof bundle.invoke === "function") {
		const invokeBundle = bundle.invoke.bind(bundle);
		return bundle.tools.filter((t) => t && typeof t.name === "string" && t.name.length > 0).map((t) => ({
			name: t.name,
			description: t.description,
			schema: t.inputSchema,
			async invoke(args) {
				return observationFromMcpResult(await invokeBundle(t.name, args ?? {}));
			}
		}));
	}
	return [];
}
function getToolHandles(ctx, names) {
	const handles = [];
	const seen = /* @__PURE__ */ new Set();
	for (const name of names) {
		const items = ctx.getNodeInputItems(name, 0);
		if (!items || items.length === 0) continue;
		for (const item of items) {
			const json = item.json;
			if (!json || typeof json !== "object") continue;
			for (const handle of expandToolJson(json)) {
				if (seen.has(handle.name)) continue;
				seen.add(handle.name);
				handles.push(handle);
			}
		}
	}
	return handles;
}
function getMemoryHandle(ctx, name) {
	const items = ctx.getNodeInputItems(name, 0);
	if (!items || items.length === 0) return null;
	return items[0].json;
}
function getOutputParserHandle(ctx, name) {
	const items = ctx.getNodeInputItems(name, 0);
	if (!items || items.length === 0) return null;
	return items[0].json;
}
function resolvePromptType(ctx, itemJson) {
	const raw = ctx.getParam("promptType", "auto");
	if (typeof raw === "string" && raw.startsWith("=")) {
		const resolved = ctx.evaluate(raw, itemJson);
		return String(resolved ?? "auto");
	}
	return typeof raw === "string" ? raw : "auto";
}
function resolvePromptForItem(ctx, itemJson) {
	if (resolvePromptType(ctx, itemJson) === "define") {
		const text = ctx.getParam("text", "");
		if (typeof text !== "string") return "";
		const resolved = ctx.evaluate(text, itemJson);
		return resolved != null ? String(resolved) : "";
	}
	const auto = itemJson.chatInput ?? itemJson.userPrompt ?? itemJson.prompt ?? itemJson.text;
	return auto != null ? String(auto) : "";
}
function resolveSystemMessage(ctx, itemJson, options) {
	const raw = options.systemMessage;
	if (!raw || typeof raw !== "string") return void 0;
	const resolved = ctx.evaluate(raw, itemJson);
	return resolved != null ? String(resolved) : "";
}
function resolveMaxIterations(options) {
	const raw = options.maxIterations;
	if (typeof raw === "number" && raw > 0) return raw;
	return 10;
}
async function invokeWithFallback(primary, fallback, needsFallback, messages, toolDefs, opts) {
	try {
		return await primary.invoke(messages, toolDefs, opts);
	} catch (err) {
		if (needsFallback && fallback) return await fallback.invoke(messages, toolDefs, opts);
		throw err;
	}
}
function toolCallId(call, index) {
	if (call.id && typeof call.id === "string" && call.id.length > 0) return call.id;
	return `call_${call.name}_${index}`;
}
function failWithTrace(message, itemJson, item, itemIndex, outputItems, turns) {
	const trace = capTrace({ turns });
	const pairedItem = item.pairedItem ?? {
		item: itemIndex,
		input: 0
	};
	return new NodeExecutionError(message, {
		items: [[...outputItems, {
			json: {
				...itemJson,
				agentTrace: trace,
				error: message
			},
			pairedItem
		}]],
		trace
	});
}
const langchainAgentExecutor = async (ctx, node) => {
	const items = ctx.getInputItems(0);
	const subs = findConnectedSubNodes(ctx.getWorkflow().connections, node.name);
	if (subs.languageModels.length === 0) throw new Error("A Chat Model sub-node must be connected");
	const toolHandles = subs.tools.length === 0 ? [] : getToolHandles(ctx, subs.tools.map((t) => t.name));
	if (subs.tools.length > 0 && toolHandles.length === 0) throw new Error("Tool sub-nodes connected but no valid tool handles were produced");
	const primaryModel = getModelHandle(ctx, subs.languageModels[0].name);
	if (!primaryModel) throw new Error("A Chat Model sub-node must be connected");
	const needsFallback = ctx.getParam("needsFallback", false);
	const fallbackModel = needsFallback && subs.languageModels.length > 1 ? getModelHandle(ctx, subs.languageModels[1].name) : null;
	const hasOutputParser = ctx.getParam("hasOutputParser", false);
	const options = ctx.getParam("options", {}) ?? {};
	const returnIntermediateSteps = options.returnIntermediateSteps === true;
	const maxIterations = resolveMaxIterations(options);
	const toolDefs = toolHandles.map((t) => ({
		name: t.name,
		description: t.description,
		schema: t.schema
	}));
	const memoryHandle = subs.memory.length > 0 ? getMemoryHandle(ctx, subs.memory[0].name) : null;
	const parserHandle = hasOutputParser && subs.outputParser.length > 0 ? getOutputParserHandle(ctx, subs.outputParser[0].name) : null;
	const outputItems = [];
	for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
		const item = items[itemIndex];
		const itemJson = item.json ?? {};
		const prompt = resolvePromptForItem(ctx, itemJson);
		if (!prompt) throw new Error("No prompt specified");
		const systemMessage = resolveSystemMessage(ctx, itemJson, options);
		const messages = [];
		if (systemMessage) messages.push({
			role: "system",
			content: systemMessage
		});
		if (memoryHandle?.loadMessages) {
			const priorTurns = memoryHandle.loadMessages();
			if (Array.isArray(priorTurns)) {
				for (const turn of priorTurns) if (turn && typeof turn === "object" && typeof turn.role === "string" && typeof turn.content === "string") messages.push(turn);
			}
		}
		messages.push({
			role: "user",
			content: prompt
		});
		const intermediateSteps = [];
		const turns = [];
		const publishProgress = async (iteration, extra) => {
			await ctx.reportProgress?.({
				progress: {
					iteration,
					maxIterations,
					...extra?.tool ? { tool: extra.tool } : {},
					stepCount: intermediateSteps.length,
					...extra?.lastObservation ? { lastObservation: capText(extra.lastObservation, PROGRESS_TEXT_CAP) } : {},
					...extra?.phase ? { phase: extra.phase } : {},
					...extra?.streaming ? { streaming: true } : {},
					...extra?.lastTokenAt ? { lastTokenAt: extra.lastTokenAt } : {},
					...extra?.chars != null ? { chars: extra.chars } : {},
					updatedAt: nowIso()
				},
				trace: capTrace({ turns })
			});
		};
		let finalText = null;
		try {
			for (let iteration = 0; iteration < maxIterations; iteration++) {
				const turn = {
					iteration,
					toolCalls: [],
					observations: [],
					startedAt: nowIso(),
					status: "running",
					phase: "llm"
				};
				turns.push(turn);
				await publishProgress(iteration, { phase: "llm" });
				const throttle = createDeltaThrottle(async () => {
					const chars = (turn.assistantText?.length ?? 0) + (turn.reasoning?.length ?? 0);
					await publishProgress(iteration, {
						phase: "llm",
						streaming: true,
						lastTokenAt: turn.lastTokenAt,
						chars
					});
				});
				const result = await invokeWithFallback(primaryModel, fallbackModel, needsFallback, messages, toolDefs, { onDelta: (delta) => {
					if (delta.text) turn.assistantText = delta.text;
					if (delta.reasoning) turn.reasoning = delta.reasoning;
					turn.streaming = true;
					turn.lastTokenAt = nowIso();
					throttle.push((turn.assistantText?.length ?? 0) + (turn.reasoning?.length ?? 0));
				} });
				await throttle.flush();
				turn.streaming = false;
				const toolCalls = Array.isArray(result.toolCalls) ? result.toolCalls : [];
				const usage = usageFromResult(result);
				const reasoning = typeof result.reasoning === "string" ? result.reasoning : void 0;
				turn.llmFinishedAt = nowIso();
				if (result.text) turn.assistantText = String(result.text);
				if (reasoning) turn.reasoning = reasoning;
				if (usage) turn.usage = usage;
				turn.toolCalls = toolCalls.map((call) => ({
					id: call.id,
					name: call.name,
					args: call.args ?? {},
					status: "running"
				}));
				if (toolCalls.length > 0) {
					turn.phase = "tools";
					messages.push({
						role: "assistant",
						content: result.text ?? "",
						tool_calls: toolCalls.map((call, i) => ({
							id: toolCallId(call, i),
							type: "function",
							function: {
								name: call.name,
								arguments: JSON.stringify(call.args ?? {})
							}
						}))
					});
					await publishProgress(iteration, {
						phase: "tools",
						tool: toolCalls[0]?.name
					});
					for (let i = 0; i < toolCalls.length; i++) {
						const call = toolCalls[i];
						const recorded = turn.toolCalls[i];
						if (recorded) {
							recorded.startedAt = nowIso();
							recorded.status = "running";
						}
						await publishProgress(iteration, {
							phase: "tool",
							tool: call.name
						});
						const tool = toolHandles.find((t) => t.name === call.name);
						let observation = "";
						let toolStatus = "success";
						if (!tool) {
							observation = `Tool not found: ${call.name}. Available: ${toolHandles.map((t) => t.name).join(", ") || "(none)"}`;
							toolStatus = "error";
						} else if (typeof tool.invoke === "function") try {
							observation = observationFromToolResult(await tool.invoke(call.args ?? {}));
						} catch (err) {
							observation = err instanceof Error ? err.message : String(err);
							toolStatus = "error";
						}
						if (recorded) {
							recorded.finishedAt = nowIso();
							recorded.durationMs = spanMs(recorded.startedAt, recorded.finishedAt);
							recorded.status = toolStatus;
						}
						messages.push({
							role: "tool",
							content: observation,
							tool_call_id: toolCallId(call, i)
						});
						intermediateSteps.push({
							action: {
								tool: call.name,
								toolInput: call.args ?? {}
							},
							observation
						});
						turn.observations.push({
							tool: call.name,
							content: observation
						});
						await publishProgress(iteration, {
							phase: "tool",
							tool: call.name,
							lastObservation: observation
						});
					}
					turn.status = "success";
					turn.finishedAt = nowIso();
					turn.durationMs = spanMs(turn.startedAt, turn.finishedAt);
					continue;
				}
				turn.phase = "final";
				turn.status = "success";
				turn.finishedAt = nowIso();
				turn.durationMs = spanMs(turn.startedAt, turn.finishedAt);
				finalText = result.text ?? "";
				await publishProgress(iteration, { phase: "final" });
				break;
			}
		} catch (err) {
			closeOpenSpans(turns, "error");
			if (err instanceof NodeExecutionError) throw err;
			throw failWithTrace(err instanceof Error ? err.message : String(err), itemJson, item, itemIndex, outputItems, turns);
		}
		if (finalText === null) {
			closeOpenSpans(turns, "error");
			throw failWithTrace(`Agent did not produce a final answer within ${maxIterations} iterations`, itemJson, item, itemIndex, outputItems, turns);
		}
		if (memoryHandle) {
			const userMsg = {
				role: "user",
				content: prompt
			};
			const assistantMsg = {
				role: "assistant",
				content: String(finalText)
			};
			if (typeof memoryHandle.appendTurn === "function") memoryHandle.appendTurn(userMsg, assistantMsg);
			else if (typeof memoryHandle.saveMessages === "function") {
				const prior = typeof memoryHandle.loadMessages === "function" ? memoryHandle.loadMessages() : [];
				memoryHandle.saveMessages([
					...Array.isArray(prior) ? prior : [],
					userMsg,
					assistantMsg
				]);
			}
		}
		let output = finalText;
		if (parserHandle && typeof parserHandle.parse === "function") output = await parserHandle.parse(finalText);
		const json = {
			...itemJson,
			output,
			agentTrace: capTrace({ turns })
		};
		if (returnIntermediateSteps) json.intermediateSteps = intermediateSteps;
		const pairedItem = item.pairedItem ?? {
			item: itemIndex,
			input: 0
		};
		outputItems.push({
			json,
			pairedItem
		});
	}
	return [outputItems];
};
//#endregion
//#region src/lib/engine/llm-silence.ts
const STREAM_FIRST_CHUNK_MS = 6e4;
const STREAM_GAP_MS = 45e3;
//#endregion
//#region src/lib/engine/executors/openrouter-sse.ts
var OpenRouterStreamSilentError = class extends Error {
	constructor(message) {
		super(message);
		this.name = "OpenRouterStreamSilentError";
	}
};
function parseToolCallArguments$1(raw) {
	const trimmed = raw.trim();
	if (!trimmed) return {};
	try {
		const parsed = JSON.parse(trimmed);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
		return { value: parsed };
	} catch {
		return { raw };
	}
}
function looksLikeChatCompletion(body) {
	if (!body || typeof body !== "object") return false;
	return Array.isArray(body.choices);
}
function isStreamRejected(status, body) {
	if (status === 401 || status === 402 || status === 403 || status === 429) return false;
	if (status === 400 || status === 404 || status === 415 || status === 422) return true;
	const text = typeof body === "string" ? body : JSON.stringify(body ?? "");
	return /stream/i.test(text) && status >= 400 && status < 500;
}
function finalizeToolCalls(acc) {
	const out = [];
	const keys = [...acc.keys()].sort((a, b) => a - b);
	for (const k of keys) {
		const tc = acc.get(k);
		if (!tc?.name) continue;
		out.push({
			id: tc.id,
			name: tc.name,
			args: parseToolCallArguments$1(tc.arguments)
		});
	}
	return out;
}
function applyToolCallDeltas(acc, deltas) {
	for (const d of deltas) {
		const idx = typeof d.index === "number" ? d.index : 0;
		const cur = acc.get(idx) ?? {
			name: "",
			arguments: ""
		};
		if (d.id) cur.id = d.id;
		if (d.function?.name) cur.name += d.function.name;
		if (d.function?.arguments) cur.arguments += d.function.arguments;
		acc.set(idx, cur);
	}
}
function parseSseDataPayloads(chunk) {
	const payloads = [];
	for (const rawLine of chunk.split(/\r?\n/)) {
		const line = rawLine.trimEnd();
		if (!line.startsWith("data:")) continue;
		const data = line.slice(5).trim();
		if (!data || data === "[DONE]") {
			if (data === "[DONE]") payloads.push("[DONE]");
			continue;
		}
		try {
			payloads.push(JSON.parse(data));
		} catch {}
	}
	return payloads;
}
async function* iterateByteStream(reader) {
	const decoder = new TextDecoder();
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (value?.byteLength) yield decoder.decode(value, { stream: true });
		}
	} finally {
		reader.releaseLock();
	}
}
function nextWithTimeout(it, ms, message) {
	let timer;
	const timeout = new Promise((_, reject) => {
		timer = setTimeout(() => reject(new OpenRouterStreamSilentError(message)), ms);
	});
	return Promise.race([it.next(), timeout]).finally(() => {
		if (timer) clearTimeout(timer);
	});
}
async function consumeOpenRouterSse(chunks, opts = {}) {
	const firstChunkMs = opts.firstChunkMs ?? 6e4;
	const gapMs = opts.gapMs ?? 45e3;
	const it = chunks[Symbol.asyncIterator]();
	let buffer = "";
	let text = "";
	let reasoning = "";
	let model = "";
	let usage = {
		promptTokens: 0,
		completionTokens: 0,
		totalTokens: 0
	};
	const toolAcc = /* @__PURE__ */ new Map();
	let sawEvent = false;
	const emit = () => {
		const toolCalls = finalizeToolCalls(toolAcc);
		opts.onDelta?.({
			text,
			...reasoning ? { reasoning } : {},
			...toolCalls.length > 0 ? { toolCalls } : {}
		});
	};
	const applyPayload = (payload) => {
		if (payload === "[DONE]") return true;
		if (!payload || typeof payload !== "object") return false;
		const p = payload;
		if (p.model) model = p.model;
		if (p.usage) usage = {
			promptTokens: p.usage.prompt_tokens ?? usage.promptTokens,
			completionTokens: p.usage.completion_tokens ?? usage.completionTokens,
			totalTokens: p.usage.total_tokens ?? usage.totalTokens
		};
		const delta = p.choices?.[0]?.delta;
		if (!delta) return false;
		if (typeof delta.content === "string" && delta.content) text += delta.content;
		const reason = delta.reasoning_content ?? delta.reasoning;
		if (typeof reason === "string" && reason) reasoning += reason;
		if (delta.tool_calls?.length) applyToolCallDeltas(toolAcc, delta.tool_calls);
		emit();
		return false;
	};
	while (true) {
		const step = await nextWithTimeout(it, sawEvent ? gapMs : firstChunkMs, sawEvent ? `OpenRouter stream went silent for ${Math.round(gapMs / 1e3)}s` : `OpenRouter stream silent: no tokens in ${Math.round(firstChunkMs / 1e3)}s`);
		if (step.done) break;
		sawEvent = true;
		buffer += step.value;
		const nl = buffer.lastIndexOf("\n");
		if (nl < 0) continue;
		const complete = buffer.slice(0, nl + 1);
		buffer = buffer.slice(nl + 1);
		const payloads = parseSseDataPayloads(complete);
		for (const payload of payloads) if (applyPayload(payload)) {
			const toolCalls = finalizeToolCalls(toolAcc);
			return {
				text,
				model,
				usage,
				...toolCalls.length > 0 ? { toolCalls } : {},
				...reasoning ? { reasoning } : {}
			};
		}
	}
	if (buffer.trim()) for (const payload of parseSseDataPayloads(buffer)) applyPayload(payload);
	const toolCalls = finalizeToolCalls(toolAcc);
	return {
		text,
		model,
		usage,
		...toolCalls.length > 0 ? { toolCalls } : {},
		...reasoning ? { reasoning } : {}
	};
}
//#endregion
//#region src/lib/engine/executors/lm-chat-open-router.ts
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_TIMEOUT = 9e5;
const DEFAULT_MAX_RETRIES = 4;
function resolveModelId(ctx) {
	const modelParam = ctx.getParam("model");
	let raw = modelParam;
	if (modelParam && typeof modelParam === "object" && "__rl" in modelParam) raw = modelParam.value;
	if (raw == null || raw === "") throw new Error("OpenRouter Chat Model: model id is required");
	const str = String(raw);
	const firstJson = ctx.getInputItems(0)[0]?.json ?? {};
	const resolved = ctx.evaluate(str, firstJson);
	const modelId = String(resolved ?? "").trim();
	if (!modelId) throw new Error("OpenRouter Chat Model: model id resolved to empty");
	return modelId;
}
function buildHeaders(apiKey) {
	return {
		authorization: `Bearer ${apiKey}`,
		"content-type": "application/json"
	};
}
function mapResponseFormat(responseFormat) {
	if (responseFormat == null || responseFormat === "") return void 0;
	const value = String(responseFormat);
	if (value === "json") return { type: "json_object" };
	if (value === "text") return { type: "text" };
}
function normalizeAgentToolDefs(tools) {
	if (!tools || tools.length === 0) return [];
	const out = [];
	for (const t of tools) {
		if (!t || typeof t !== "object") continue;
		const o = t;
		if (typeof o.name !== "string" || !o.name) continue;
		out.push({
			name: o.name,
			description: typeof o.description === "string" ? o.description : void 0,
			schema: o.schema ?? o.parameters
		});
	}
	return out;
}
function mapAgentTools(tools) {
	return tools.map((t) => {
		const parameters = t.schema && typeof t.schema === "object" ? t.schema : {
			type: "object",
			properties: {}
		};
		return {
			type: "function",
			function: {
				name: t.name,
				...t.description ? { description: t.description } : {},
				parameters
			}
		};
	});
}
function serializeMessages(messages) {
	return messages.map((m) => {
		const msg = {
			role: m.role,
			content: m.content ?? ""
		};
		if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
		if (m.tool_calls && m.tool_calls.length > 0) msg.tool_calls = m.tool_calls;
		if (m.name) msg.name = m.name;
		if (m.role === "assistant" && (!m.content || m.content === "") && m.tool_calls?.length) msg.content = null;
		return msg;
	});
}
function parseToolCallArguments(raw) {
	if (raw == null) return {};
	if (typeof raw === "object" && !Array.isArray(raw)) return raw;
	if (typeof raw === "string") {
		const trimmed = raw.trim();
		if (!trimmed) return {};
		try {
			const parsed = JSON.parse(trimmed);
			if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
			return { value: parsed };
		} catch {
			return { raw };
		}
	}
	return { value: raw };
}
function buildChatCompletionsBody(model, messages, options, agentTools) {
	const body = {
		model,
		messages: serializeMessages(messages)
	};
	if (options.temperature != null) body.temperature = options.temperature;
	if (options.maxTokens != null) body.max_tokens = options.maxTokens;
	if (options.frequencyPenalty != null) body.frequency_penalty = options.frequencyPenalty;
	if (options.presencePenalty != null) body.presence_penalty = options.presencePenalty;
	if (options.topP != null) body.top_p = options.topP;
	const responseFormat = mapResponseFormat(options.responseFormat);
	if (responseFormat) body.response_format = responseFormat;
	if (agentTools && agentTools.length > 0) {
		body.tools = mapAgentTools(agentTools);
		body.tool_choice = "auto";
	}
	return body;
}
function parseChatCompletionsResponse(body) {
	const b = body;
	const message = b.choices?.[0]?.message;
	const text = message?.content ?? "";
	const reasoningRaw = message?.reasoning_content ?? message?.reasoning;
	const reasoning = typeof reasoningRaw === "string" && reasoningRaw.length > 0 ? reasoningRaw : void 0;
	const toolCalls = [];
	for (const tc of message?.tool_calls ?? []) {
		const name = tc.function?.name;
		if (!name) continue;
		toolCalls.push({
			id: tc.id,
			name,
			args: parseToolCallArguments(tc.function?.arguments)
		});
	}
	return {
		text: typeof text === "string" ? text : "",
		model: b.model ?? "",
		usage: {
			promptTokens: b.usage?.prompt_tokens ?? 0,
			completionTokens: b.usage?.completion_tokens ?? 0,
			totalTokens: b.usage?.total_tokens ?? 0
		},
		...toolCalls.length > 0 ? { toolCalls } : {},
		...reasoning ? { reasoning } : {}
	};
}
function classifyError(status, body) {
	const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
	if (status === 429) return /* @__PURE__ */ new Error("OpenRouter rate limit exceeded — the service is receiving too many requests. Mitigate with batching or Wait nodes.");
	if (status === 402) return /* @__PURE__ */ new Error("OpenRouter insufficient credits — check your account billing and credit balance.");
	if (status === 401 || status === 403) return /* @__PURE__ */ new Error(`OpenRouter authentication error (${status}) — check your API key. ${bodyStr}`);
	return /* @__PURE__ */ new Error(`OpenRouter API error (${status}): ${bodyStr}`);
}
function isRetryable(status) {
	return status === 429 || status >= 500;
}
function streamEnabled(options) {
	return options.stream !== false;
}
function streamTimeouts(options) {
	return {
		firstChunkMs: typeof options.streamFirstChunkMs === "number" && options.streamFirstChunkMs > 0 ? options.streamFirstChunkMs : STREAM_FIRST_CHUNK_MS,
		gapMs: typeof options.streamGapMs === "number" && options.streamGapMs > 0 ? options.streamGapMs : STREAM_GAP_MS
	};
}
async function postJson(url, headers, body, timeoutMs) {
	return sdkHttpRequest({
		method: "POST",
		url,
		headers,
		body,
		timeoutMs
	});
}
async function invokeViaNativeStream(url, headers, body, timeoutMs, onDelta, firstChunkMs, gapMs) {
	const controller = new AbortController();
	const hardTimer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const res = await fetch(url, {
			method: "POST",
			headers: {
				...headers,
				accept: "text/event-stream, application/json"
			},
			body: JSON.stringify({
				...body,
				stream: true,
				stream_options: { include_usage: true }
			}),
			signal: controller.signal
		});
		const ct = res.headers.get("content-type") ?? "";
		if (!res.ok) {
			const text = await res.text();
			let parsed = text;
			try {
				parsed = text ? JSON.parse(text) : null;
			} catch {}
			return {
				ok: false,
				status: res.status,
				body: parsed,
				retryNonStream: isStreamRejected(res.status, parsed)
			};
		}
		if (ct.includes("application/json") && !ct.includes("event-stream")) {
			const json = await res.json();
			if (looksLikeChatCompletion(json)) return {
				ok: true,
				result: parseChatCompletionsResponse(json)
			};
			return {
				ok: false,
				status: res.status,
				body: json,
				retryNonStream: true
			};
		}
		if (!res.body) return {
			ok: false,
			status: res.status,
			body: "empty body",
			retryNonStream: true
		};
		return {
			ok: true,
			result: await consumeOpenRouterSse(iterateByteStream(res.body.getReader()), {
				firstChunkMs,
				gapMs,
				onDelta
			})
		};
	} catch (err) {
		if (err instanceof OpenRouterStreamSilentError) throw err;
		const message = err instanceof Error ? err.message : String(err);
		throw new Error(`OpenRouter request failed: ${message}`);
	} finally {
		clearTimeout(hardTimer);
	}
}
async function invokeModel(handle, messages, tools, invokeOpts) {
	const timeout = handle.options.timeout ?? DEFAULT_TIMEOUT;
	const maxRetries = handle.options.maxRetries ?? DEFAULT_MAX_RETRIES;
	const headers = buildHeaders(handle.apiKey);
	const url = `${handle.baseUrl}/chat/completions`;
	const body = buildChatCompletionsBody(handle.model, messages, handle.options, normalizeAgentToolDefs(tools));
	const wantStream = streamEnabled(handle.options);
	const { firstChunkMs, gapMs } = streamTimeouts(handle.options);
	let lastError = null;
	let triedNonStream = !wantStream;
	for (let attempt = 0; attempt <= maxRetries; attempt++) try {
		if (wantStream && true) {
			const streamed = await invokeViaNativeStream(url, headers, body, timeout, invokeOpts?.onDelta, firstChunkMs, gapMs);
			if (streamed.ok) return streamed.result;
			if (streamed.retryNonStream && !triedNonStream) {
				triedNonStream = true;
				const fallback = await postJson(url, headers, body, timeout);
				if (fallback.status >= 200 && fallback.status < 300) return parseChatCompletionsResponse(fallback.body);
				lastError = classifyError(fallback.status, fallback.body);
				if (isRetryable(fallback.status) && attempt < maxRetries) {
					await sleep(backoffMs(attempt));
					continue;
				}
				throw lastError;
			}
			lastError = classifyError(streamed.status, streamed.body);
			if (isRetryable(streamed.status) && attempt < maxRetries) {
				await sleep(backoffMs(attempt));
				continue;
			}
			throw lastError;
		}
		const res = await postJson(url, headers, body, timeout);
		if (res.status >= 200 && res.status < 300) return parseChatCompletionsResponse(res.body);
		lastError = classifyError(res.status, res.body);
		if (isRetryable(res.status) && attempt < maxRetries) {
			await sleep(backoffMs(attempt));
			continue;
		}
		throw lastError;
	} catch (err) {
		if (err instanceof OpenRouterStreamSilentError) throw err;
		lastError = err instanceof Error ? err : new Error(String(err));
		if (lastError.message.startsWith("OpenRouter API error")) throw lastError;
		if (lastError.message.startsWith("OpenRouter rate limit")) throw lastError;
		if (lastError.message.startsWith("OpenRouter insufficient")) throw lastError;
		if (lastError.message.startsWith("OpenRouter authentication")) throw lastError;
		if (attempt < maxRetries) {
			await sleep(backoffMs(attempt));
			continue;
		}
		throw lastError.message.startsWith("OpenRouter request failed") ? lastError : /* @__PURE__ */ new Error(`OpenRouter request failed: ${lastError.message}`);
	}
	throw lastError ?? /* @__PURE__ */ new Error("OpenRouter request failed after retries");
}
function sleep(ms) {
	return new Promise((r) => setTimeout(r, ms));
}
function backoffMs(attempt) {
	return Math.min(1e3 * 2 ** attempt, 8e3);
}
const lmChatOpenRouterExecutor = async (ctx) => {
	const credentials = await requireCredential(ctx, "openRouterApi");
	const apiKey = String(credentials.apiKey ?? "");
	if (!apiKey) throw new Error("OpenRouter Chat Model: credential \"openRouterApi\" is missing apiKey");
	const baseUrl = credentials.baseUrl ? String(credentials.baseUrl) : DEFAULT_BASE_URL;
	const model = resolveModelId(ctx);
	const options = ctx.getParam("options", {}) ?? {};
	const handle = {
		type: "@n8n/n8n-nodes-langchain.lmChatOpenRouter",
		model,
		options,
		baseUrl,
		invoke(messages, tools, opts) {
			return invokeModel({
				model,
				options,
				baseUrl,
				apiKey
			}, messages, tools, opts);
		}
	};
	const items = ctx.getInputItems(0);
	return [[{
		json: handle,
		pairedItem: items.length > 0 ? items[0].pairedItem ?? {
			item: 0,
			input: 0
		} : {
			item: 0,
			input: 0
		}
	}]];
};
//#endregion
//#region src/lib/engine/tool-handle.ts
function mergeToolArgs(params, args) {
	return {
		...params,
		...args
	};
}
function assertAllowUrl(ctx, url) {
	if (ctx.allowUrl && !ctx.allowUrl(url)) throw new Error(`HTTP Request blocked by allowUrl policy: ${url}`);
}
function emitToolHandle(ctx, handle) {
	const items = ctx.getInputItems(0);
	return [[{
		json: handle,
		pairedItem: items.length > 0 ? items[0].pairedItem ?? {
			item: 0,
			input: 0
		} : {
			item: 0,
			input: 0
		}
	}]];
}
/** MCP-shaped bundle so the agent expands every tool (must not set top-level `name`). */
function emitMcpBundle(ctx, bundle) {
	const items = ctx.getInputItems(0);
	const pairedItem = items.length > 0 ? items[0].pairedItem ?? {
		item: 0,
		input: 0
	} : {
		item: 0,
		input: 0
	};
	return [[{
		json: {
			type: bundle.type ?? "openflow-node-langchain.mcpClientTool",
			tools: bundle.tools,
			invoke: bundle.invoke
		},
		pairedItem
	}]];
}
function resolveJailPath(fsRoot, requested) {
	const root = resolve(fsRoot);
	const target = resolve(root, requested);
	const prefix = root.endsWith(sep) ? root : root + sep;
	if (target !== root && !target.startsWith(prefix)) throw new Error(`Path escapes fsRoot: ${requested}`);
	return target;
}
function requireFsRoot(ctx) {
	const fromParam = String(ctx.getParam("fsRoot", "") ?? "").trim();
	if (fromParam) return resolve(fromParam);
	const fromCtx = ctx.fsRoot?.trim();
	if (fromCtx) return resolve(fromCtx);
	const env = process.env.OPENFLOW_FS_ROOT?.trim();
	if (env) return resolve(env);
	throw new Error("Filesystem/Git tool requires createRuntime({ fsRoot })");
}
//#endregion
//#region src/lib/engine/executors/httpRequestTool.ts
function resolveValue$1(raw, itemJson) {
	if (typeof raw !== "string") return raw;
	if (raw.startsWith("{{") || raw.startsWith("=")) return raw;
	return raw;
}
function safeParse(s) {
	try {
		return JSON.parse(s);
	} catch {
		return s;
	}
}
function getNested(obj, ...paths) {
	if (!obj) return void 0;
	for (const path of paths) {
		const val = path.split(".").reduce((acc, key) => {
			if (acc && typeof acc === "object" && key in acc) return acc[key];
		}, obj);
		if (val !== void 0) return val;
	}
}
const httpRequestToolExecutor = async (ctx, node) => {
	if (ctx.getInputItems(0).length === 0) return [[{
		json: {
			type: "n8n-nodes-base.httpRequestTool",
			name: String(ctx.getParam("toolName", "http_request")),
			description: String(ctx.getParam("description", "Make an HTTP request and return the response body")),
			schema: {
				type: "object",
				properties: {
					url: {
						type: "string",
						description: "Request URL"
					},
					method: {
						type: "string",
						description: "HTTP method"
					},
					body: { description: "Optional JSON body" }
				}
			},
			async invoke(args) {
				const merged = {
					...node.parameters,
					...args
				};
				const url = String(merged.url ?? "");
				if (ctx.allowUrl && !ctx.allowUrl(url)) throw new Error(`HTTP Request blocked by allowUrl policy: ${url}`);
				const method = String(merged.method ?? "GET");
				const headers = {};
				let bodyInit;
				if (merged.body !== void 0 && method !== "GET" && method !== "HEAD") {
					bodyInit = typeof merged.body === "string" ? merged.body : JSON.stringify(merged.body);
					headers["Content-Type"] = "application/json";
				} else if (merged.sendBody && merged.jsonBody !== void 0) {
					bodyInit = typeof merged.jsonBody === "string" ? merged.jsonBody : JSON.stringify(merged.jsonBody);
					headers["Content-Type"] = "application/json";
				}
				const res = await fetch(url, {
					method,
					headers,
					body: bodyInit
				});
				const text = await res.text();
				if (ctx.allowUrl && !res.ok) {}
				if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`.trim());
				try {
					return { content: text };
				} catch {
					return { content: text };
				}
			}
		},
		pairedItem: {
			item: 0,
			input: 0
		}
	}]];
	const inputItems = ctx.getInputItems(0);
	if (inputItems.length === 0) return emitToolHandle(ctx, {
		type: "n8n-nodes-base.httpRequestTool",
		name: "http_request",
		description: String(ctx.getParam("description", "Fetch a URL and return the response body") ?? "Fetch a URL and return the response body"),
		schema: {
			type: "object",
			properties: {
				url: {
					type: "string",
					description: "URL to request"
				},
				method: {
					type: "string",
					description: "HTTP method"
				}
			},
			required: ["url"]
		},
		async invoke(args) {
			const method = String(args.method ?? node.parameters.method ?? "GET");
			const url = String(args.url ?? "");
			if (!url) throw new Error("http_request: url is required");
			return (await (await fetch(url, { method })).text()).slice(0, 8e3);
		}
	});
	const options = node.parameters.options ?? {};
	const responseOptions = options.response ?? {};
	const includeResponseHeadersAndStatus = responseOptions.includeResponseHeadersAndStatus ?? options.includeResponseHeadersAndStatus ?? false;
	const neverError = responseOptions.neverError ?? options.neverError ?? false;
	const optimizeResponse = responseOptions.optimizeResponse ?? options.optimizeResponse ?? false;
	const results = [];
	for (let idx = 0; idx < inputItems.length; idx++) {
		const item = inputItems[idx];
		const itemJson = item.json ?? {};
		const method = node.parameters.method ?? "GET";
		let url = String(resolveValue$1(node.parameters.url ?? "", itemJson));
		const headers = {};
		if (node.parameters.sendHeaders) {
			const headerContainer = node.parameters.headerParameters;
			const headerParams = Array.isArray(headerContainer) ? headerContainer : headerContainer?.parameters ?? [];
			for (const h of headerParams) if (h.name) headers[h.name] = String(resolveValue$1(h.value, itemJson));
		}
		let bodyInit;
		const isBodyAllowed = method !== "GET" && method !== "HEAD";
		if (node.parameters.sendBody && isBodyAllowed) {
			const bodyContentType = node.parameters.bodyContentType ?? "json";
			if (bodyContentType === "json") {
				const raw = node.parameters.jsonBody;
				const parsed = typeof raw === "string" ? safeParse(raw) : raw;
				bodyInit = JSON.stringify(parsed);
				headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
			} else if (bodyContentType === "formUrlencoded") {
				bodyInit = (node.parameters.bodyParameters?.parameters ?? []).map((p) => `${encodeURIComponent(p.name)}=${encodeURIComponent(resolveValue$1(p.value, itemJson))}`).join("&");
				headers["Content-Type"] = headers["Content-Type"] ?? "application/x-www-form-urlencoded";
			} else if (bodyContentType === "raw") {
				bodyInit = node.parameters.rawBody ?? "";
				const rawCt = node.parameters.rawContentType;
				if (rawCt) headers["Content-Type"] = headers["Content-Type"] ?? rawCt;
			} else if (bodyContentType === "formData") {
				const params = node.parameters.formDataParameters?.parameters ?? [];
				const parts = [];
				for (const p of params) {
					const val = resolveValue$1(p.value, itemJson);
					parts.push(`--X-BOUNDARY\r\nContent-Disposition: form-data; name="${p.name}"\r\n\r\n${val}`);
				}
				parts.push("--X-BOUNDARY--");
				bodyInit = parts.join("\r\n");
				headers["Content-Type"] = headers["Content-Type"] ?? "multipart/form-data; boundary=X-BOUNDARY";
			} else if (bodyContentType === "binaryData") {
				const fieldName = node.parameters.binaryInputDataFieldName ?? "data";
				const binaryData = item.binary?.[fieldName];
				if (binaryData) {
					bodyInit = binaryData.data;
					headers["Content-Type"] = headers["Content-Type"] ?? binaryData.mimeType ?? "application/octet-stream";
				}
			}
		}
		if (node.parameters.sendQuery) {
			const queryContainer = node.parameters.queryParameters;
			const queryParams = Array.isArray(queryContainer) ? queryContainer : queryContainer?.parameters ?? [];
			if (queryParams.length > 0) {
				const u = new URL(url);
				for (const q of queryParams) if (q.name) u.searchParams.set(q.name, String(resolveValue$1(q.value, itemJson)));
				url = u.toString();
			}
		}
		const timeout = getNested(options, "timeout") != null ? Number(getNested(options, "timeout")) : 1e4;
		const followRedirect = getNested(responseOptions, "redirect.followRedirects", "followRedirect");
		const follow = followRedirect !== void 0 ? followRedirect : getNested(options, "redirect.followRedirects", "followRedirect") ?? true;
		try {
			if (ctx.allowUrl && !ctx.allowUrl(url)) throw new Error(`HTTP Request blocked by allowUrl policy: ${url}`);
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), timeout);
			const response = await fetch(url, {
				method,
				headers,
				body: bodyInit,
				signal: controller.signal,
				redirect: follow ? "follow" : "manual"
			});
			clearTimeout(timer);
			if (!response.ok && !neverError) throw new Error(`HTTP ${response.status} ${response.statusText ?? ""}`.trim());
			const responseFormat = responseOptions.responseFormat ?? options.responseFormat ?? "autoDetect";
			let responseData;
			if (responseFormat === "json") responseData = await response.json();
			else if (responseFormat === "file" || responseFormat === "text") responseData = await response.text();
			else if ((response.headers.get("content-type") ?? "").includes("application/json")) responseData = await response.json();
			else responseData = await response.text();
			if (includeResponseHeadersAndStatus) responseData = {
				body: responseData,
				headers: Object.fromEntries(response.headers.entries()),
				statusCode: response.status
			};
			if (optimizeResponse) responseData = await optimizeResponseData(responseData, responseOptions, options);
			results.push({ json: typeof responseData === "object" && responseData !== null ? responseData : responseData });
		} catch (err) {
			throw new Error(`HTTP Request failed: ${err instanceof Error ? err.message : String(err)}`);
		}
	}
	return [results.map((item, idx) => withPairedItem({ json: item.json }, idx))];
};
async function optimizeResponseData(data, responseOptions, options) {
	const expectedResponseType = responseOptions.expectedResponseType ?? options.expectedResponseType ?? "json";
	if (expectedResponseType === "json") {
		const fieldContainingData = responseOptions.fieldContainingData ?? options.fieldContainingData;
		const includeFields = responseOptions.includeFields ?? options.includeFields ?? "all";
		const fields = responseOptions.fields ?? options.fields;
		if (fieldContainingData && typeof data === "object" && data !== null) {
			const parts = fieldContainingData.split(".");
			let current = data;
			for (const part of parts) if (current && typeof current === "object" && part in current) current = current[part];
			else {
				current = void 0;
				break;
			}
			if (current !== void 0) {
				if (typeof current === "string") return current;
				return current;
			}
		}
		if (includeFields !== "all" && fields && typeof data === "object" && data !== null) {
			const fieldNames = fields.split(",").map((f) => f.trim());
			const filtered = {};
			const obj = data;
			if (includeFields === "selected") {
				for (const f of fieldNames) {
					const val = f.split(".").reduce((acc, key) => {
						if (acc && typeof acc === "object" && key in acc) return acc[key];
					}, obj);
					if (val !== void 0) setNested(filtered, f, val);
				}
				return filtered;
			} else if (includeFields === "exclude") {
				const excludeSet = new Set(fieldNames);
				for (const [k, v] of Object.entries(obj)) if (!excludeSet.has(k)) filtered[k] = v;
				return filtered;
			}
		}
		return data;
	}
	if (expectedResponseType === "html" || expectedResponseType === "text") {
		let text = typeof data === "string" ? data : JSON.stringify(data);
		if (responseOptions.returnOnlyContent ?? options.returnOnlyContent ?? false) {
			text = stripHtml(text);
			const elementsToOmit = responseOptions.elementsToOmit ?? options.elementsToOmit;
			if (elementsToOmit) {
				const selectors = elementsToOmit.split(",").map((s) => s.trim());
				for (const sel of selectors) text = removeBySelector(text, sel);
			}
		}
		if (responseOptions.truncateResponse ?? options.truncateResponse ?? false) {
			const maxChars = responseOptions.maxResponseCharacters ?? options.maxResponseCharacters ?? 1e3;
			if (text.length > maxChars) text = text.slice(0, maxChars);
		}
		return text;
	}
	return data;
}
function stripHtml(html) {
	return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}
function removeBySelector(html, _selector) {
	return html;
}
function setNested(obj, path, value) {
	const parts = path.split(".");
	let current = obj;
	for (let i = 0; i < parts.length - 1; i++) {
		if (!(parts[i] in current)) current[parts[i]] = {};
		current = current[parts[i]];
	}
	current[parts[parts.length - 1]] = value;
}
//#endregion
//#region src/lib/engine/executors/n8n-nodes-base.githubTool.ts
function resolveValue(raw, itemJson) {
	if (typeof raw !== "string") return raw;
	if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
		const result = evaluateExpression(raw, { json: itemJson });
		return result.ok ? result.value : raw;
	}
	return raw;
}
function asObj(body) {
	if (body && typeof body === "object" && !Array.isArray(body)) return body;
	return { data: body };
}
async function getCredential(ctx) {
	const cred = await ctx.getCredential("githubApi");
	if (!cred) throw new Error("GitHub: githubApi credential is not configured");
	const credData = cred;
	const token = String(credData.accessToken ?? credData.apiToken ?? credData.token ?? "");
	if (!token) throw new Error("GitHub: access token is required");
	return {
		baseUrl: String(credData.server ?? "https://api.github.com").replace(/\/+$/, ""),
		token
	};
}
function owner(node, itemJson) {
	return String(resolveValue(node.parameters.owner, itemJson) ?? "");
}
function repo(node, itemJson) {
	return String(resolveValue(node.parameters.repository, itemJson) ?? "");
}
async function githubRequest(baseUrl, method, path, body, params, token) {
	const url = `${baseUrl}/${path}${params && Object.keys(params).length > 0 ? `?${new URLSearchParams(params).toString()}` : ""}`;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 3e4);
	try {
		const init = {
			method,
			headers: {
				Authorization: `Bearer ${token ?? ""}`,
				Accept: "application/vnd.github+json",
				"Content-Type": "application/json",
				"User-Agent": "OpenFlow"
			},
			signal: controller.signal
		};
		if (body !== void 0 && method !== "GET" && method !== "HEAD") init.body = JSON.stringify(body);
		const response = await fetch(url, init);
		const text = await response.text();
		let parsed = text;
		try {
			parsed = text ? JSON.parse(text) : null;
		} catch {}
		if (response.status === 204) return {};
		if (response.status < 200 || response.status >= 300) {
			const ghMsg = asObj(parsed).message ?? `Request failed with status code ${response.status}`;
			const err = new Error(ghMsg);
			err.status = response.status;
			throw err;
		}
		return parsed;
	} finally {
		clearTimeout(timer);
	}
}
async function githubGetAll(baseUrl, path, params, token, node, itemJson) {
	const returnAll = Boolean(node.parameters.returnAll);
	const limit = Number(resolveValue(node.parameters.limit, itemJson) ?? 50);
	const perPage = 100;
	let page = 1;
	const results = [];
	while (true) {
		const items = await githubRequest(baseUrl, "GET", path, void 0, {
			...params,
			per_page: String(perPage),
			page: String(page)
		}, token);
		if (Array.isArray(items)) {
			for (const item of items) {
				results.push(item);
				if (!returnAll && results.length >= limit) return results;
			}
			if (items.length < perPage) return results;
		} else return results;
		page++;
	}
}
async function runFileOperation(node, operation, itemJson, baseUrl, token) {
	const own = owner(node, itemJson);
	const rep = repo(node, itemJson);
	if (!own || !rep) throw new Error("GitHub: owner and repository are required for file operations");
	const filePath = String(resolveValue(node.parameters.filePath, itemJson) ?? "");
	if (operation === "get") {
		if (!filePath) throw new Error("GitHub: filePath is required for file get");
		const branch = String(resolveValue(node.parameters.branch, itemJson) ?? "");
		const params = {};
		if (branch) params.ref = branch;
		return [asObj(await githubRequest(baseUrl, "GET", `repos/${own}/${rep}/contents/${encodeURIComponent(filePath)}`, void 0, params, token))];
	}
	if (operation === "create" || operation === "edit") {
		const branch = String(resolveValue(node.parameters.branch, itemJson) ?? "");
		const content = String(resolveValue(node.parameters.content, itemJson) ?? "");
		const commitMessage = String(resolveValue(node.parameters.commitMessage, itemJson) ?? "");
		if (!filePath) throw new Error("GitHub: filePath is required");
		if (!branch) throw new Error("GitHub: branch is required");
		if (!commitMessage) throw new Error("GitHub: commitMessage is required");
		const payload = {
			message: commitMessage,
			content: Buffer.from(content).toString("base64"),
			branch
		};
		return [asObj(await githubRequest(baseUrl, "PUT", `repos/${own}/${rep}/contents/${encodeURIComponent(filePath)}`, payload, {}, token))];
	}
	if (operation === "delete") {
		const branch = String(resolveValue(node.parameters.branch, itemJson) ?? "");
		const commitMessage = String(resolveValue(node.parameters.commitMessage, itemJson) ?? "");
		if (!filePath) throw new Error("GitHub: filePath is required");
		if (!branch) throw new Error("GitHub: branch is required");
		if (!commitMessage) throw new Error("GitHub: commitMessage is required");
		const payload = {
			message: commitMessage,
			branch
		};
		return [asObj(await githubRequest(baseUrl, "DELETE", `repos/${own}/${rep}/contents/${encodeURIComponent(filePath)}`, payload, {}, token))];
	}
	if (operation === "getAll") {
		const branch = String(resolveValue(node.parameters.branch, itemJson) ?? "");
		const params = {};
		if (branch) params.ref = branch;
		return await githubGetAll(baseUrl, `repos/${own}/${rep}/contents/${encodeURIComponent(filePath)}`, params, token, node, itemJson);
	}
	throw new Error(`GitHub: unsupported file operation "${operation}"`);
}
async function runIssueOperation(node, operation, itemJson, baseUrl, token) {
	const own = owner(node, itemJson);
	const rep = repo(node, itemJson);
	if (!own || !rep) throw new Error("GitHub: owner and repository are required for issue operations");
	if (operation === "create") {
		const title = String(resolveValue(node.parameters.title, itemJson) ?? "");
		if (!title) throw new Error("GitHub: title is required for issue create");
		const payload = { title };
		const bodyText = resolveValue(node.parameters.body, itemJson);
		if (bodyText) payload.body = String(bodyText);
		const labels = resolveValue(node.parameters.labels, itemJson);
		if (labels) payload.labels = String(labels).split(",").map((s) => s.trim()).filter(Boolean);
		return [asObj(await githubRequest(baseUrl, "POST", `repos/${own}/${rep}/issues`, payload, {}, token))];
	}
	if (operation === "createComment") {
		const issueNumber = Number(resolveValue(node.parameters.issueNumber, itemJson) ?? 0);
		const bodyText = String(resolveValue(node.parameters.body, itemJson) ?? "");
		if (!issueNumber) throw new Error("GitHub: issueNumber is required for createComment");
		if (!bodyText) throw new Error("GitHub: body is required for createComment");
		return [asObj(await githubRequest(baseUrl, "POST", `repos/${own}/${rep}/issues/${issueNumber}/comments`, { body: bodyText }, {}, token))];
	}
	if (operation === "edit") {
		const issueNumber = Number(resolveValue(node.parameters.issueNumber, itemJson) ?? 0);
		if (!issueNumber) throw new Error("GitHub: issueNumber is required for issue edit");
		const payload = {};
		const title = resolveValue(node.parameters.title, itemJson);
		if (title) payload.title = String(title);
		const bodyText = resolveValue(node.parameters.body, itemJson);
		if (bodyText) payload.body = String(bodyText);
		const state = resolveValue(node.parameters.state, itemJson);
		if (state) payload.state = String(state);
		const labels = resolveValue(node.parameters.labels, itemJson);
		if (labels) payload.labels = String(labels).split(",").map((s) => s.trim()).filter(Boolean);
		return [asObj(await githubRequest(baseUrl, "PATCH", `repos/${own}/${rep}/issues/${issueNumber}`, payload, {}, token))];
	}
	if (operation === "get") {
		const issueNumber = Number(resolveValue(node.parameters.issueNumber, itemJson) ?? 0);
		if (!issueNumber) throw new Error("GitHub: issueNumber is required for issue get");
		return [asObj(await githubRequest(baseUrl, "GET", `repos/${own}/${rep}/issues/${issueNumber}`, void 0, {}, token))];
	}
	if (operation === "lock") {
		const issueNumber = Number(resolveValue(node.parameters.issueNumber, itemJson) ?? 0);
		if (!issueNumber) throw new Error("GitHub: issueNumber is required for issue lock");
		return [asObj(await githubRequest(baseUrl, "PUT", `repos/${own}/${rep}/issues/${issueNumber}/lock`, {}, {}, token))];
	}
	throw new Error(`GitHub: unsupported issue operation "${operation}"`);
}
async function runOrgOperation(node, operation, itemJson, baseUrl, token) {
	const own = owner(node, itemJson);
	if (!own) throw new Error("GitHub: owner is required for organization operations");
	if (operation === "getRepositories") return githubGetAll(baseUrl, `orgs/${own}/repos`, {}, token, node, itemJson);
	throw new Error(`GitHub: unsupported organization operation "${operation}"`);
}
async function runReleaseOperation(node, operation, itemJson, baseUrl, token) {
	const own = owner(node, itemJson);
	const rep = repo(node, itemJson);
	if (!own || !rep) throw new Error("GitHub: owner and repository are required for release operations");
	if (operation === "create") {
		const tag = String(resolveValue(node.parameters.tag, itemJson) ?? "");
		const name = String(resolveValue(node.parameters.releaseName, itemJson) ?? "");
		const body = String(resolveValue(node.parameters.releaseBody, itemJson) ?? "");
		if (!tag) throw new Error("GitHub: tag is required for release create");
		const payload = {
			tag_name: tag,
			name: name || tag
		};
		if (body) payload.body = body;
		return [asObj(await githubRequest(baseUrl, "POST", `repos/${own}/${rep}/releases`, payload, {}, token))];
	}
	if (operation === "delete") {
		const releaseId = Number(resolveValue(node.parameters.releaseId, itemJson) ?? 0);
		if (!releaseId) throw new Error("GitHub: releaseId is required for release delete");
		return [asObj(await githubRequest(baseUrl, "DELETE", `repos/${own}/${rep}/releases/${releaseId}`, void 0, {}, token))];
	}
	if (operation === "get") {
		const releaseId = Number(resolveValue(node.parameters.releaseId, itemJson) ?? 0);
		if (!releaseId) throw new Error("GitHub: releaseId is required for release get");
		return [asObj(await githubRequest(baseUrl, "GET", `repos/${own}/${rep}/releases/${releaseId}`, void 0, {}, token))];
	}
	if (operation === "getAll") return githubGetAll(baseUrl, `repos/${own}/${rep}/releases`, {}, token, node, itemJson);
	if (operation === "update") {
		const releaseId = Number(resolveValue(node.parameters.releaseId, itemJson) ?? 0);
		if (!releaseId) throw new Error("GitHub: releaseId is required for release update");
		const payload = {};
		const name = resolveValue(node.parameters.releaseName, itemJson);
		if (name) payload.name = String(name);
		const body = resolveValue(node.parameters.releaseBody, itemJson);
		if (body) payload.body = String(body);
		return [asObj(await githubRequest(baseUrl, "PATCH", `repos/${own}/${rep}/releases/${releaseId}`, payload, {}, token))];
	}
	throw new Error(`GitHub: unsupported release operation "${operation}"`);
}
async function runRepoOperation(node, operation, itemJson, baseUrl, token) {
	const own = owner(node, itemJson);
	const rep = repo(node, itemJson);
	if (!own || !rep) throw new Error("GitHub: owner and repository are required for repository operations");
	if (operation === "get") return [asObj(await githubRequest(baseUrl, "GET", `repos/${own}/${rep}`, void 0, {}, token))];
	if (operation === "getIssues") return githubGetAll(baseUrl, `repos/${own}/${rep}/issues`, {}, token, node, itemJson);
	if (operation === "getLicense") return [asObj(await githubRequest(baseUrl, "GET", `repos/${own}/${rep}/license`, void 0, {}, token))];
	if (operation === "getPullRequests") return githubGetAll(baseUrl, `repos/${own}/${rep}/pulls`, {}, token, node, itemJson);
	if (operation === "getUserProfile") return [asObj(await githubRequest(baseUrl, "GET", `users/${own}`, void 0, {}, token))];
	if (operation === "listPopularPaths") {
		const res = await githubRequest(baseUrl, "GET", `repos/${own}/${rep}/traffic/popular/paths`, void 0, {}, token);
		return Array.isArray(res) ? res : [];
	}
	if (operation === "listReferrers") {
		const res = await githubRequest(baseUrl, "GET", `repos/${own}/${rep}/traffic/popular/referrers`, void 0, {}, token);
		return Array.isArray(res) ? res : [];
	}
	throw new Error(`GitHub: unsupported repository operation "${operation}"`);
}
async function runReviewOperation(node, operation, itemJson, baseUrl, token) {
	const own = owner(node, itemJson);
	const rep = repo(node, itemJson);
	if (!own || !rep) throw new Error("GitHub: owner and repository are required for review operations");
	const prNumber = Number(resolveValue(node.parameters.pullRequestNumber, itemJson) ?? 0);
	if (!prNumber) throw new Error("GitHub: pullRequestNumber is required for review operations");
	if (operation === "create") {
		const body = String(resolveValue(node.parameters.reviewBody, itemJson) ?? "");
		const payload = { event: String(resolveValue(node.parameters.reviewEvent, itemJson) ?? "comment") };
		if (body) payload.body = body;
		return [asObj(await githubRequest(baseUrl, "POST", `repos/${own}/${rep}/pulls/${prNumber}/reviews`, payload, {}, token))];
	}
	if (operation === "get") {
		const reviewId = Number(resolveValue(node.parameters.reviewId, itemJson) ?? 0);
		if (!reviewId) throw new Error("GitHub: reviewId is required for review get");
		return [asObj(await githubRequest(baseUrl, "GET", `repos/${own}/${rep}/pulls/${prNumber}/reviews/${reviewId}`, void 0, {}, token))];
	}
	if (operation === "getAll") return githubGetAll(baseUrl, `repos/${own}/${rep}/pulls/${prNumber}/reviews`, {}, token, node, itemJson);
	if (operation === "update") {
		const reviewId = Number(resolveValue(node.parameters.reviewId, itemJson) ?? 0);
		if (!reviewId) throw new Error("GitHub: reviewId is required for review update");
		const body = String(resolveValue(node.parameters.reviewBody, itemJson) ?? "");
		return [asObj(await githubRequest(baseUrl, "PUT", `repos/${own}/${rep}/pulls/${prNumber}/reviews/${reviewId}`, { body }, {}, token))];
	}
	throw new Error(`GitHub: unsupported review operation "${operation}"`);
}
async function runUserOperation(node, operation, itemJson, baseUrl, token) {
	const user = String(resolveValue(node.parameters.user, itemJson) ?? "");
	if (!user) throw new Error("GitHub: user is required for user operations");
	if (operation === "getRepositories") return githubGetAll(baseUrl, `users/${user}/repos`, {}, token, node, itemJson);
	if (operation === "invite") {
		const org = String(resolveValue(node.parameters.organization, itemJson) ?? "");
		if (!org) throw new Error("GitHub: organization parameter is required for user invite");
		const payload = {};
		if (user.includes("@")) payload.email = user;
		else payload.invitee_id = user;
		return [asObj(await githubRequest(baseUrl, "POST", `orgs/${org}/invitations`, payload, {}, token))];
	}
	throw new Error(`GitHub: unsupported user operation "${operation}"`);
}
async function runWorkflowOperation(node, operation, itemJson, baseUrl, token) {
	const own = owner(node, itemJson);
	const rep = repo(node, itemJson);
	if (!own || !rep) throw new Error("GitHub: owner and repository are required for workflow operations");
	const workflowId = String(resolveValue(node.parameters.workflowId, itemJson) ?? "");
	if (!workflowId && operation !== "getAll") throw new Error("GitHub: workflowId is required");
	if (operation === "disable") return [asObj(await githubRequest(baseUrl, "PUT", `repos/${own}/${rep}/actions/workflows/${workflowId}/disable`, void 0, {}, token))];
	if (operation === "dispatch") {
		const ref = String(resolveValue(node.parameters.dispatchRef, itemJson) ?? "main");
		const inputsRaw = resolveValue(node.parameters.dispatchInputs, itemJson);
		const payload = { ref };
		if (inputsRaw && typeof inputsRaw === "object") payload.inputs = inputsRaw;
		else if (inputsRaw && typeof inputsRaw === "string") try {
			payload.inputs = JSON.parse(inputsRaw);
		} catch {
			payload.inputs = inputsRaw;
		}
		return [asObj(await githubRequest(baseUrl, "POST", `repos/${own}/${rep}/actions/workflows/${workflowId}/dispatches`, payload, {}, token))];
	}
	if (operation === "enable") return [asObj(await githubRequest(baseUrl, "PUT", `repos/${own}/${rep}/actions/workflows/${workflowId}/enable`, void 0, {}, token))];
	if (operation === "get") return [asObj(await githubRequest(baseUrl, "GET", `repos/${own}/${rep}/actions/workflows/${workflowId}`, void 0, {}, token))];
	if (operation === "getUsage") return [asObj(await githubRequest(baseUrl, "GET", `repos/${own}/${rep}/actions/workflows/${workflowId}/timing`, void 0, {}, token))];
	if (operation === "getAll") return githubGetAll(baseUrl, `repos/${own}/${rep}/actions/workflows`, {}, token, node, itemJson);
	throw new Error(`GitHub: unsupported workflow operation "${operation}"`);
}
async function runOperation(node, resource, operation, itemJson, baseUrl, token) {
	if (resource === "file") return runFileOperation(node, operation, itemJson, baseUrl, token);
	if (resource === "issue") return runIssueOperation(node, operation, itemJson, baseUrl, token);
	if (resource === "organization") return runOrgOperation(node, operation, itemJson, baseUrl, token);
	if (resource === "release") return runReleaseOperation(node, operation, itemJson, baseUrl, token);
	if (resource === "repository") return runRepoOperation(node, operation, itemJson, baseUrl, token);
	if (resource === "review") return runReviewOperation(node, operation, itemJson, baseUrl, token);
	if (resource === "user") return runUserOperation(node, operation, itemJson, baseUrl, token);
	if (resource === "workflow") return runWorkflowOperation(node, operation, itemJson, baseUrl, token);
	throw new Error(`GitHub: unsupported resource "${resource}"`);
}
const githubToolExecutor = async (ctx, node) => {
	const rawItems = ctx.getInputItems(0);
	if (rawItems.length === 0) return emitToolHandle(ctx, {
		type: "n8n-nodes-base.githubTool",
		name: String(ctx.getParam("toolName", "github")),
		description: String(ctx.getParam("description", "GitHub API: get/list files, repos, issues, and contents. Pass resource, operation, owner, repository, filePath.")),
		schema: {
			type: "object",
			properties: {
				resource: { type: "string" },
				operation: { type: "string" },
				owner: { type: "string" },
				repository: { type: "string" },
				filePath: { type: "string" },
				branch: { type: "string" }
			}
		},
		async invoke(args) {
			const merged = {
				...node.parameters,
				...args
			};
			const { baseUrl, token } = await getCredential(ctx);
			assertAllowUrl(ctx, baseUrl);
			const resource = String(merged.resource ?? "file");
			const operation = String(merged.operation ?? "get");
			const results = await runOperation({ parameters: merged }, resource, operation, args, baseUrl, token);
			return { content: JSON.stringify(results) };
		}
	});
	const items = ensureItems(rawItems);
	const out = [];
	const resource = String(node.parameters.resource ?? "issue");
	const operation = String(node.parameters.operation ?? "get");
	const continueOnFail = ctx.continueOnFail();
	for (let idx = 0; idx < items.length; idx++) {
		const item = items[idx];
		const itemJson = item.json ?? {};
		const pairedItem = item.pairedItem ?? {
			item: idx,
			input: 0
		};
		try {
			const { baseUrl, token } = await getCredential(ctx);
			if (ctx.allowUrl && !ctx.allowUrl(baseUrl)) throw new Error(`HTTP Request blocked by allowUrl policy: ${baseUrl}`);
			const results = await runOperation(node, resource, operation, itemJson, baseUrl, token);
			for (const r of results) out.push({
				json: r,
				pairedItem
			});
		} catch (err) {
			if (!continueOnFail) throw err;
			const message = err instanceof Error ? err.message : String(err);
			const code = err instanceof Error && "status" in err ? Number(err.status) : 500;
			out.push({
				json: { error: {
					message,
					code
				} },
				pairedItem
			});
		}
	}
	return [out];
};
//#endregion
//#region src/lib/engine/executors/executeCommandTool.ts
const execAsync = promisify(exec);
async function runCommand(cmd) {
	try {
		const result = await execAsync(cmd);
		return {
			stdout: result.stdout,
			stderr: result.stderr,
			exitCode: 0
		};
	} catch (err) {
		const nodeErr = err;
		const stdout = nodeErr.stdout ?? "";
		const stderr = nodeErr.stderr ?? "";
		if (typeof nodeErr.code === "number" && nodeErr.code !== 127) return {
			stdout,
			stderr,
			exitCode: nodeErr.code
		};
		throw err;
	}
}
const executeCommandToolExecutor = async (ctx) => {
	if (ctx.getInputItems(0).length === 0) return [[{
		json: {
			type: "n8n-nodes-base.executeCommandTool",
			name: String(ctx.getParam("toolName", "execute_command")),
			description: String(ctx.getParam("description", "Run a shell command and return stdout/stderr/exitCode")),
			schema: {
				type: "object",
				properties: { command: {
					type: "string",
					description: "Shell command to execute"
				} },
				required: ["command"]
			},
			async invoke(args) {
				const command = String(args.command ?? ctx.getParam("command", "") ?? "");
				if (!command) throw new Error("Command parameter is required");
				const result = await runCommand(command);
				return { content: JSON.stringify({
					exitCode: result.exitCode,
					stdout: result.stdout,
					stderr: result.stderr
				}) };
			}
		},
		pairedItem: {
			item: 0,
			input: 0
		}
	}]];
	const inputItems = ctx.getInputItems(0);
	const executeOnce = ctx.getParam("executeOnce", false);
	const commandTemplate = ctx.getParam("command", "");
	const contOnFail = ctx.continueOnFail();
	if (!commandTemplate) throw new Error("Command parameter is required");
	if (inputItems.length === 0) return [[{ json: {} }]];
	if (executeOnce) {
		const evaluated = ctx.evaluate(commandTemplate, inputItems[0].json) ?? commandTemplate;
		try {
			const result = await runCommand(evaluated);
			return [[{ json: {
				exitCode: result.exitCode,
				stdout: result.stdout,
				stderr: result.stderr
			} }]];
		} catch (err) {
			if (contOnFail) return [[{ json: { error: err.message } }]];
			throw err;
		}
	}
	return [await Promise.all(inputItems.map(async (item, idx) => {
		const cmd = ctx.evaluate(commandTemplate, item.json) ?? commandTemplate;
		try {
			const result = await runCommand(cmd);
			return withPairedItem({ json: {
				exitCode: result.exitCode,
				stdout: result.stdout,
				stderr: result.stderr
			} }, idx);
		} catch (err) {
			if (contOnFail) return withPairedItem({ json: { error: err.message } }, idx);
			throw err;
		}
	}))];
};
//#endregion
//#region src/lib/engine/executors/webSearchTool.ts
const SEARCH_PROVIDERS = {
	google: "https://www.googleapis.com/customsearch/v1",
	bing: "https://api.bing.microsoft.com/v7.0/search",
	duckduckgo: "https://api.duckduckgo.com"
};
const TYPE$2 = "openflow-node-base.webSearchTool";
const webSearchToolExecutor = async (ctx) => {
	return emitMcpBundle(ctx, {
		type: TYPE$2,
		tools: [{
			name: "web_search",
			description: "Search the web and return titles, URLs, and snippets",
			inputSchema: {
				type: "object",
				properties: {
					query: { type: "string" },
					resultLimit: { type: "number" },
					searchEngine: {
						type: "string",
						description: "duckduckgo | google | bing | custom"
					}
				},
				required: ["query"]
			}
		}],
		async invoke(_toolName, args) {
			const merged = mergeToolArgs(ctx.getParams(), args);
			const query = String(merged.query ?? "");
			if (!query) throw new Error("query is required");
			const resultLimit = Number(merged.resultLimit ?? ctx.getParam("resultLimit", 5)) || 5;
			const searchEngine = String(merged.searchEngine ?? ctx.getParam("searchEngine", "duckduckgo"));
			const customEndpoint = String(merged.customEndpoint ?? ctx.getParam("customEndpoint", ""));
			let searchUrl;
			const params = new URLSearchParams();
			params.set("q", query);
			if (searchEngine === "custom" && customEndpoint) searchUrl = customEndpoint;
			else {
				const base = SEARCH_PROVIDERS[searchEngine];
				if (!base) throw new Error(`Unsupported search engine: ${searchEngine}`);
				searchUrl = base;
				if (searchEngine === "duckduckgo") params.set("format", "json");
			}
			const fullUrl = `${searchUrl}?${params.toString()}`;
			assertAllowUrl(ctx, fullUrl);
			const res = await fetch(fullUrl, {
				headers: { Accept: "application/json" },
				signal: AbortSignal.timeout(1e4)
			});
			const raw = await res.json();
			if (!res.ok) throw new Error(`Search request failed: ${res.status}`);
			const itemsRaw = raw.items ?? raw.RelatedTopics ?? raw.webPages;
			const results = (Array.isArray(itemsRaw) ? itemsRaw : itemsRaw && typeof itemsRaw === "object" && Array.isArray(itemsRaw.value) ? itemsRaw.value : []).slice(0, resultLimit).map((row) => {
				const r = row && typeof row === "object" ? row : {};
				return {
					title: String(r.title ?? r.Text ?? r.name ?? ""),
					url: String(r.link ?? r.FirstURL ?? r.url ?? ""),
					snippet: String(r.snippet ?? r.Text ?? "")
				};
			});
			return { content: JSON.stringify(results) };
		}
	});
};
//#endregion
//#region node_modules/ms/index.js
var require_ms = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	/**
	* Helpers.
	*/
	var s = 1e3;
	var m = s * 60;
	var h = m * 60;
	var d = h * 24;
	var w = d * 7;
	var y = d * 365.25;
	/**
	* Parse or format the given `val`.
	*
	* Options:
	*
	*  - `long` verbose formatting [false]
	*
	* @param {String|Number} val
	* @param {Object} [options]
	* @throws {Error} throw an error if val is not a non-empty string or a number
	* @return {String|Number}
	* @api public
	*/
	module.exports = function(val, options) {
		options = options || {};
		var type = typeof val;
		if (type === "string" && val.length > 0) return parse(val);
		else if (type === "number" && isFinite(val)) return options.long ? fmtLong(val) : fmtShort(val);
		throw new Error("val is not a non-empty string or a valid number. val=" + JSON.stringify(val));
	};
	/**
	* Parse the given `str` and return milliseconds.
	*
	* @param {String} str
	* @return {Number}
	* @api private
	*/
	function parse(str) {
		str = String(str);
		if (str.length > 100) return;
		var match = /^(-?(?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i.exec(str);
		if (!match) return;
		var n = parseFloat(match[1]);
		switch ((match[2] || "ms").toLowerCase()) {
			case "years":
			case "year":
			case "yrs":
			case "yr":
			case "y": return n * y;
			case "weeks":
			case "week":
			case "w": return n * w;
			case "days":
			case "day":
			case "d": return n * d;
			case "hours":
			case "hour":
			case "hrs":
			case "hr":
			case "h": return n * h;
			case "minutes":
			case "minute":
			case "mins":
			case "min":
			case "m": return n * m;
			case "seconds":
			case "second":
			case "secs":
			case "sec":
			case "s": return n * s;
			case "milliseconds":
			case "millisecond":
			case "msecs":
			case "msec":
			case "ms": return n;
			default: return;
		}
	}
	/**
	* Short format for `ms`.
	*
	* @param {Number} ms
	* @return {String}
	* @api private
	*/
	function fmtShort(ms) {
		var msAbs = Math.abs(ms);
		if (msAbs >= d) return Math.round(ms / d) + "d";
		if (msAbs >= h) return Math.round(ms / h) + "h";
		if (msAbs >= m) return Math.round(ms / m) + "m";
		if (msAbs >= s) return Math.round(ms / s) + "s";
		return ms + "ms";
	}
	/**
	* Long format for `ms`.
	*
	* @param {Number} ms
	* @return {String}
	* @api private
	*/
	function fmtLong(ms) {
		var msAbs = Math.abs(ms);
		if (msAbs >= d) return plural(ms, msAbs, d, "day");
		if (msAbs >= h) return plural(ms, msAbs, h, "hour");
		if (msAbs >= m) return plural(ms, msAbs, m, "minute");
		if (msAbs >= s) return plural(ms, msAbs, s, "second");
		return ms + " ms";
	}
	/**
	* Pluralization helper.
	*/
	function plural(ms, msAbs, n, name) {
		var isPlural = msAbs >= n * 1.5;
		return Math.round(ms / n) + " " + name + (isPlural ? "s" : "");
	}
}));
//#endregion
//#region node_modules/debug/src/common.js
var require_common = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	/**
	* This is the common logic for both the Node.js and web browser
	* implementations of `debug()`.
	*/
	function setup(env) {
		createDebug.debug = createDebug;
		createDebug.default = createDebug;
		createDebug.coerce = coerce;
		createDebug.disable = disable;
		createDebug.enable = enable;
		createDebug.enabled = enabled;
		createDebug.humanize = require_ms();
		createDebug.destroy = destroy;
		Object.keys(env).forEach((key) => {
			createDebug[key] = env[key];
		});
		/**
		* The currently active debug mode names, and names to skip.
		*/
		createDebug.names = [];
		createDebug.skips = [];
		/**
		* Map of special "%n" handling functions, for the debug "format" argument.
		*
		* Valid key names are a single, lower or upper-case letter, i.e. "n" and "N".
		*/
		createDebug.formatters = {};
		/**
		* Selects a color for a debug namespace
		* @param {String} namespace The namespace string for the debug instance to be colored
		* @return {Number|String} An ANSI color code for the given namespace
		* @api private
		*/
		function selectColor(namespace) {
			let hash = 0;
			for (let i = 0; i < namespace.length; i++) {
				hash = (hash << 5) - hash + namespace.charCodeAt(i);
				hash |= 0;
			}
			return createDebug.colors[Math.abs(hash) % createDebug.colors.length];
		}
		createDebug.selectColor = selectColor;
		/**
		* Create a debugger with the given `namespace`.
		*
		* @param {String} namespace
		* @return {Function}
		* @api public
		*/
		function createDebug(namespace) {
			let prevTime;
			let enableOverride = null;
			let namespacesCache;
			let enabledCache;
			function debug(...args) {
				if (!debug.enabled) return;
				const self = debug;
				const curr = Number(/* @__PURE__ */ new Date());
				self.diff = curr - (prevTime || curr);
				self.prev = prevTime;
				self.curr = curr;
				prevTime = curr;
				args[0] = createDebug.coerce(args[0]);
				if (typeof args[0] !== "string") args.unshift("%O");
				let index = 0;
				args[0] = args[0].replace(/%([a-zA-Z%])/g, (match, format) => {
					if (match === "%%") return "%";
					index++;
					const formatter = createDebug.formatters[format];
					if (typeof formatter === "function") {
						const val = args[index];
						match = formatter.call(self, val);
						args.splice(index, 1);
						index--;
					}
					return match;
				});
				createDebug.formatArgs.call(self, args);
				(self.log || createDebug.log).apply(self, args);
			}
			debug.namespace = namespace;
			debug.useColors = createDebug.useColors();
			debug.color = createDebug.selectColor(namespace);
			debug.extend = extend;
			debug.destroy = createDebug.destroy;
			Object.defineProperty(debug, "enabled", {
				enumerable: true,
				configurable: false,
				get: () => {
					if (enableOverride !== null) return enableOverride;
					if (namespacesCache !== createDebug.namespaces) {
						namespacesCache = createDebug.namespaces;
						enabledCache = createDebug.enabled(namespace);
					}
					return enabledCache;
				},
				set: (v) => {
					enableOverride = v;
				}
			});
			if (typeof createDebug.init === "function") createDebug.init(debug);
			return debug;
		}
		function extend(namespace, delimiter) {
			const newDebug = createDebug(this.namespace + (typeof delimiter === "undefined" ? ":" : delimiter) + namespace);
			newDebug.log = this.log;
			return newDebug;
		}
		/**
		* Enables a debug mode by namespaces. This can include modes
		* separated by a colon and wildcards.
		*
		* @param {String} namespaces
		* @api public
		*/
		function enable(namespaces) {
			createDebug.save(namespaces);
			createDebug.namespaces = namespaces;
			createDebug.names = [];
			createDebug.skips = [];
			const split = (typeof namespaces === "string" ? namespaces : "").trim().replace(/\s+/g, ",").split(",").filter(Boolean);
			for (const ns of split) if (ns[0] === "-") createDebug.skips.push(ns.slice(1));
			else createDebug.names.push(ns);
		}
		/**
		* Checks if the given string matches a namespace template, honoring
		* asterisks as wildcards.
		*
		* @param {String} search
		* @param {String} template
		* @return {Boolean}
		*/
		function matchesTemplate(search, template) {
			let searchIndex = 0;
			let templateIndex = 0;
			let starIndex = -1;
			let matchIndex = 0;
			while (searchIndex < search.length) if (templateIndex < template.length && (template[templateIndex] === search[searchIndex] || template[templateIndex] === "*")) if (template[templateIndex] === "*") {
				starIndex = templateIndex;
				matchIndex = searchIndex;
				templateIndex++;
			} else {
				searchIndex++;
				templateIndex++;
			}
			else if (starIndex !== -1) {
				templateIndex = starIndex + 1;
				matchIndex++;
				searchIndex = matchIndex;
			} else return false;
			while (templateIndex < template.length && template[templateIndex] === "*") templateIndex++;
			return templateIndex === template.length;
		}
		/**
		* Disable debug output.
		*
		* @return {String} namespaces
		* @api public
		*/
		function disable() {
			const namespaces = [...createDebug.names, ...createDebug.skips.map((namespace) => "-" + namespace)].join(",");
			createDebug.enable("");
			return namespaces;
		}
		/**
		* Returns true if the given mode name is enabled, false otherwise.
		*
		* @param {String} name
		* @return {Boolean}
		* @api public
		*/
		function enabled(name) {
			for (const skip of createDebug.skips) if (matchesTemplate(name, skip)) return false;
			for (const ns of createDebug.names) if (matchesTemplate(name, ns)) return true;
			return false;
		}
		/**
		* Coerce `val`.
		*
		* @param {Mixed} val
		* @return {Mixed}
		* @api private
		*/
		function coerce(val) {
			if (val instanceof Error) return val.stack || val.message;
			return val;
		}
		/**
		* XXX DO NOT USE. This is a temporary stub function.
		* XXX It WILL be removed in the next major release.
		*/
		function destroy() {
			console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.");
		}
		createDebug.enable(createDebug.load());
		return createDebug;
	}
	module.exports = setup;
}));
//#endregion
//#region node_modules/debug/src/browser.js
var require_browser = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	/**
	* This is the web browser implementation of `debug()`.
	*/
	exports.formatArgs = formatArgs;
	exports.save = save;
	exports.load = load;
	exports.useColors = useColors;
	exports.storage = localstorage();
	exports.destroy = (() => {
		let warned = false;
		return () => {
			if (!warned) {
				warned = true;
				console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.");
			}
		};
	})();
	/**
	* Colors.
	*/
	exports.colors = [
		"#0000CC",
		"#0000FF",
		"#0033CC",
		"#0033FF",
		"#0066CC",
		"#0066FF",
		"#0099CC",
		"#0099FF",
		"#00CC00",
		"#00CC33",
		"#00CC66",
		"#00CC99",
		"#00CCCC",
		"#00CCFF",
		"#3300CC",
		"#3300FF",
		"#3333CC",
		"#3333FF",
		"#3366CC",
		"#3366FF",
		"#3399CC",
		"#3399FF",
		"#33CC00",
		"#33CC33",
		"#33CC66",
		"#33CC99",
		"#33CCCC",
		"#33CCFF",
		"#6600CC",
		"#6600FF",
		"#6633CC",
		"#6633FF",
		"#66CC00",
		"#66CC33",
		"#9900CC",
		"#9900FF",
		"#9933CC",
		"#9933FF",
		"#99CC00",
		"#99CC33",
		"#CC0000",
		"#CC0033",
		"#CC0066",
		"#CC0099",
		"#CC00CC",
		"#CC00FF",
		"#CC3300",
		"#CC3333",
		"#CC3366",
		"#CC3399",
		"#CC33CC",
		"#CC33FF",
		"#CC6600",
		"#CC6633",
		"#CC9900",
		"#CC9933",
		"#CCCC00",
		"#CCCC33",
		"#FF0000",
		"#FF0033",
		"#FF0066",
		"#FF0099",
		"#FF00CC",
		"#FF00FF",
		"#FF3300",
		"#FF3333",
		"#FF3366",
		"#FF3399",
		"#FF33CC",
		"#FF33FF",
		"#FF6600",
		"#FF6633",
		"#FF9900",
		"#FF9933",
		"#FFCC00",
		"#FFCC33"
	];
	/**
	* Currently only WebKit-based Web Inspectors, Firefox >= v31,
	* and the Firebug extension (any Firefox version) are known
	* to support "%c" CSS customizations.
	*
	* TODO: add a `localStorage` variable to explicitly enable/disable colors
	*/
	function useColors() {
		if (typeof window !== "undefined" && window.process && (window.process.type === "renderer" || window.process.__nwjs)) return true;
		if (typeof navigator !== "undefined" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/(edge|trident)\/(\d+)/)) return false;
		let m;
		return typeof document !== "undefined" && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance || typeof window !== "undefined" && window.console && (window.console.firebug || window.console.exception && window.console.table) || typeof navigator !== "undefined" && navigator.userAgent && (m = navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/)) && parseInt(m[1], 10) >= 31 || typeof navigator !== "undefined" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/);
	}
	/**
	* Colorize log arguments if enabled.
	*
	* @api public
	*/
	function formatArgs(args) {
		args[0] = (this.useColors ? "%c" : "") + this.namespace + (this.useColors ? " %c" : " ") + args[0] + (this.useColors ? "%c " : " ") + "+" + module.exports.humanize(this.diff);
		if (!this.useColors) return;
		const c = "color: " + this.color;
		args.splice(1, 0, c, "color: inherit");
		let index = 0;
		let lastC = 0;
		args[0].replace(/%[a-zA-Z%]/g, (match) => {
			if (match === "%%") return;
			index++;
			if (match === "%c") lastC = index;
		});
		args.splice(lastC, 0, c);
	}
	/**
	* Invokes `console.debug()` when available.
	* No-op when `console.debug` is not a "function".
	* If `console.debug` is not available, falls back
	* to `console.log`.
	*
	* @api public
	*/
	exports.log = console.debug || console.log || (() => {});
	/**
	* Save `namespaces`.
	*
	* @param {String} namespaces
	* @api private
	*/
	function save(namespaces) {
		try {
			if (namespaces) exports.storage.setItem("debug", namespaces);
			else exports.storage.removeItem("debug");
		} catch (error) {}
	}
	/**
	* Load `namespaces`.
	*
	* @return {String} returns the previously persisted debug modes
	* @api private
	*/
	function load() {
		let r;
		try {
			r = exports.storage.getItem("debug") || exports.storage.getItem("DEBUG");
		} catch (error) {}
		if (!r && typeof process !== "undefined" && "env" in process) r = process.env.DEBUG;
		return r;
	}
	/**
	* Localstorage attempts to return the localstorage.
	*
	* This is necessary because safari throws
	* when a user disables cookies/localstorage
	* and you attempt to access it.
	*
	* @return {LocalStorage}
	* @api private
	*/
	function localstorage() {
		try {
			return localStorage;
		} catch (error) {}
	}
	module.exports = require_common()(exports);
	const { formatters } = module.exports;
	/**
	* Map %j to `JSON.stringify()`, since no Web Inspectors do that by default.
	*/
	formatters.j = function(v) {
		try {
			return JSON.stringify(v);
		} catch (error) {
			return "[UnexpectedJSONParseError]: " + error.message;
		}
	};
}));
//#endregion
//#region node_modules/has-flag/index.js
var require_has_flag = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = (flag, argv = process.argv) => {
		const prefix = flag.startsWith("-") ? "" : flag.length === 1 ? "-" : "--";
		const position = argv.indexOf(prefix + flag);
		const terminatorPosition = argv.indexOf("--");
		return position !== -1 && (terminatorPosition === -1 || position < terminatorPosition);
	};
}));
//#endregion
//#region node_modules/supports-color/index.js
var require_supports_color = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const os = __require("os");
	const tty$1 = __require("tty");
	const hasFlag = require_has_flag();
	const { env } = process;
	let forceColor;
	if (hasFlag("no-color") || hasFlag("no-colors") || hasFlag("color=false") || hasFlag("color=never")) forceColor = 0;
	else if (hasFlag("color") || hasFlag("colors") || hasFlag("color=true") || hasFlag("color=always")) forceColor = 1;
	if ("FORCE_COLOR" in env) if (env.FORCE_COLOR === "true") forceColor = 1;
	else if (env.FORCE_COLOR === "false") forceColor = 0;
	else forceColor = env.FORCE_COLOR.length === 0 ? 1 : Math.min(parseInt(env.FORCE_COLOR, 10), 3);
	function translateLevel(level) {
		if (level === 0) return false;
		return {
			level,
			hasBasic: true,
			has256: level >= 2,
			has16m: level >= 3
		};
	}
	function supportsColor(haveStream, streamIsTTY) {
		if (forceColor === 0) return 0;
		if (hasFlag("color=16m") || hasFlag("color=full") || hasFlag("color=truecolor")) return 3;
		if (hasFlag("color=256")) return 2;
		if (haveStream && !streamIsTTY && forceColor === void 0) return 0;
		const min = forceColor || 0;
		if (env.TERM === "dumb") return min;
		if (process.platform === "win32") {
			const osRelease = os.release().split(".");
			if (Number(osRelease[0]) >= 10 && Number(osRelease[2]) >= 10586) return Number(osRelease[2]) >= 14931 ? 3 : 2;
			return 1;
		}
		if ("CI" in env) {
			if ([
				"TRAVIS",
				"CIRCLECI",
				"APPVEYOR",
				"GITLAB_CI",
				"GITHUB_ACTIONS",
				"BUILDKITE"
			].some((sign) => sign in env) || env.CI_NAME === "codeship") return 1;
			return min;
		}
		if ("TEAMCITY_VERSION" in env) return /^(9\.(0*[1-9]\d*)\.|\d{2,}\.)/.test(env.TEAMCITY_VERSION) ? 1 : 0;
		if (env.COLORTERM === "truecolor") return 3;
		if ("TERM_PROGRAM" in env) {
			const version = parseInt((env.TERM_PROGRAM_VERSION || "").split(".")[0], 10);
			switch (env.TERM_PROGRAM) {
				case "iTerm.app": return version >= 3 ? 3 : 2;
				case "Apple_Terminal": return 2;
			}
		}
		if (/-256(color)?$/i.test(env.TERM)) return 2;
		if (/^screen|^xterm|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux/i.test(env.TERM)) return 1;
		if ("COLORTERM" in env) return 1;
		return min;
	}
	function getSupportLevel(stream) {
		return translateLevel(supportsColor(stream, stream && stream.isTTY));
	}
	module.exports = {
		supportsColor: getSupportLevel,
		stdout: translateLevel(supportsColor(true, tty$1.isatty(1))),
		stderr: translateLevel(supportsColor(true, tty$1.isatty(2)))
	};
}));
//#endregion
//#region node_modules/debug/src/node.js
var require_node = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	/**
	* Module dependencies.
	*/
	const tty = __require("tty");
	const util = __require("util");
	/**
	* This is the Node.js implementation of `debug()`.
	*/
	exports.init = init;
	exports.log = log;
	exports.formatArgs = formatArgs;
	exports.save = save;
	exports.load = load;
	exports.useColors = useColors;
	exports.destroy = util.deprecate(() => {}, "Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.");
	/**
	* Colors.
	*/
	exports.colors = [
		6,
		2,
		3,
		4,
		5,
		1
	];
	try {
		const supportsColor = require_supports_color();
		if (supportsColor && (supportsColor.stderr || supportsColor).level >= 2) exports.colors = [
			20,
			21,
			26,
			27,
			32,
			33,
			38,
			39,
			40,
			41,
			42,
			43,
			44,
			45,
			56,
			57,
			62,
			63,
			68,
			69,
			74,
			75,
			76,
			77,
			78,
			79,
			80,
			81,
			92,
			93,
			98,
			99,
			112,
			113,
			128,
			129,
			134,
			135,
			148,
			149,
			160,
			161,
			162,
			163,
			164,
			165,
			166,
			167,
			168,
			169,
			170,
			171,
			172,
			173,
			178,
			179,
			184,
			185,
			196,
			197,
			198,
			199,
			200,
			201,
			202,
			203,
			204,
			205,
			206,
			207,
			208,
			209,
			214,
			215,
			220,
			221
		];
	} catch (error) {}
	/**
	* Build up the default `inspectOpts` object from the environment variables.
	*
	*   $ DEBUG_COLORS=no DEBUG_DEPTH=10 DEBUG_SHOW_HIDDEN=enabled node script.js
	*/
	exports.inspectOpts = Object.keys(process.env).filter((key) => {
		return /^debug_/i.test(key);
	}).reduce((obj, key) => {
		const prop = key.substring(6).toLowerCase().replace(/_([a-z])/g, (_, k) => {
			return k.toUpperCase();
		});
		let val = process.env[key];
		if (/^(yes|on|true|enabled)$/i.test(val)) val = true;
		else if (/^(no|off|false|disabled)$/i.test(val)) val = false;
		else if (val === "null") val = null;
		else val = Number(val);
		obj[prop] = val;
		return obj;
	}, {});
	/**
	* Is stdout a TTY? Colored output is enabled when `true`.
	*/
	function useColors() {
		return "colors" in exports.inspectOpts ? Boolean(exports.inspectOpts.colors) : tty.isatty(process.stderr.fd);
	}
	/**
	* Adds ANSI color escape codes if enabled.
	*
	* @api public
	*/
	function formatArgs(args) {
		const { namespace: name, useColors } = this;
		if (useColors) {
			const c = this.color;
			const colorCode = "\x1B[3" + (c < 8 ? c : "8;5;" + c);
			const prefix = `  ${colorCode};1m${name} \u001B[0m`;
			args[0] = prefix + args[0].split("\n").join("\n" + prefix);
			args.push(colorCode + "m+" + module.exports.humanize(this.diff) + "\x1B[0m");
		} else args[0] = getDate() + name + " " + args[0];
	}
	function getDate() {
		if (exports.inspectOpts.hideDate) return "";
		return (/* @__PURE__ */ new Date()).toISOString() + " ";
	}
	/**
	* Invokes `util.formatWithOptions()` with the specified arguments and writes to stderr.
	*/
	function log(...args) {
		return process.stderr.write(util.formatWithOptions(exports.inspectOpts, ...args) + "\n");
	}
	/**
	* Save `namespaces`.
	*
	* @param {String} namespaces
	* @api private
	*/
	function save(namespaces) {
		if (namespaces) process.env.DEBUG = namespaces;
		else delete process.env.DEBUG;
	}
	/**
	* Load `namespaces`.
	*
	* @return {String} returns the previously persisted debug modes
	* @api private
	*/
	function load() {
		return process.env.DEBUG;
	}
	/**
	* Init logic for `debug` instances.
	*
	* Create a new `inspectOpts` object in case `useColors` is set
	* differently for a particular `debug` instance.
	*/
	function init(debug) {
		debug.inspectOpts = {};
		const keys = Object.keys(exports.inspectOpts);
		for (let i = 0; i < keys.length; i++) debug.inspectOpts[keys[i]] = exports.inspectOpts[keys[i]];
	}
	module.exports = require_common()(exports);
	const { formatters } = module.exports;
	/**
	* Map %o to `util.inspect()`, all on a single line.
	*/
	formatters.o = function(v) {
		this.inspectOpts.colors = this.useColors;
		return util.inspect(v, this.inspectOpts).split("\n").map((str) => str.trim()).join(" ");
	};
	/**
	* Map %O to `util.inspect()`, allowing multiple lines if needed.
	*/
	formatters.O = function(v) {
		this.inspectOpts.colors = this.useColors;
		return util.inspect(v, this.inspectOpts);
	};
}));
//#endregion
//#region node_modules/debug/src/index.js
var require_src$1 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	/**
	* Detect Electron renderer / nwjs process, which is node, but we should
	* treat as a browser.
	*/
	if (typeof process === "undefined" || process.type === "renderer" || process.browser === true || process.__nwjs) module.exports = require_browser();
	else module.exports = require_node();
}));
//#endregion
//#region node_modules/@kwsites/file-exists/dist/src/index.js
var require_src = /* @__PURE__ */ __commonJSMin(((exports) => {
	var __importDefault = exports && exports.__importDefault || function(mod) {
		return mod && mod.__esModule ? mod : { "default": mod };
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	const fs_1 = __require("fs");
	const log = __importDefault(require_src$1()).default("@kwsites/file-exists");
	function check(path, isFile, isDirectory) {
		log(`checking %s`, path);
		try {
			const stat = fs_1.statSync(path);
			if (stat.isFile() && isFile) {
				log(`[OK] path represents a file`);
				return true;
			}
			if (stat.isDirectory() && isDirectory) {
				log(`[OK] path represents a directory`);
				return true;
			}
			log(`[FAIL] path represents something other than a file or directory`);
			return false;
		} catch (e) {
			if (e.code === "ENOENT") {
				log(`[FAIL] path is not accessible: %o`, e);
				return false;
			}
			log(`[FATAL] %o`, e);
			throw e;
		}
	}
	/**
	* Synchronous validation of a path existing either as a file or as a directory.
	*
	* @param {string} path The path to check
	* @param {number} type One or both of the exported numeric constants
	*/
	function exists(path, type = exports.READABLE) {
		return check(path, (type & exports.FILE) > 0, (type & exports.FOLDER) > 0);
	}
	exports.exists = exists;
	/**
	* Constant representing a file
	*/
	exports.FILE = 1;
	/**
	* Constant representing a folder
	*/
	exports.FOLDER = 2;
	/**
	* Constant representing either a file or a folder
	*/
	exports.READABLE = exports.FILE + exports.FOLDER;
}));
//#endregion
//#region node_modules/@kwsites/file-exists/dist/index.js
var require_dist$1 = /* @__PURE__ */ __commonJSMin(((exports) => {
	function __export(m) {
		for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
	}
	Object.defineProperty(exports, "__esModule", { value: true });
	__export(require_src());
}));
//#endregion
//#region node_modules/@simple-git/args-pathspec/dist/index.mjs
function c$1(...n) {
	const e = new String(n);
	return t.set(e, n), e;
}
function r(n) {
	return n instanceof String && t.has(n);
}
function o(n) {
	return t.get(n) ?? [];
}
var t;
var init_dist$1 = __esmMin((() => {
	t = /* @__PURE__ */ new WeakMap();
}));
//#endregion
//#region node_modules/@kwsites/promise-deferred/dist/index.js
var require_dist = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.createDeferred = exports.deferred = void 0;
	/**
	* Creates a new `DeferredPromise`
	*
	* ```typescript
	import {deferred} from '@kwsites/promise-deferred`;
	```
	*/
	function deferred() {
		let done;
		let fail;
		let status = "pending";
		return {
			promise: new Promise((_done, _fail) => {
				done = _done;
				fail = _fail;
			}),
			done(result) {
				if (status === "pending") {
					status = "resolved";
					done(result);
				}
			},
			fail(error) {
				if (status === "pending") {
					status = "rejected";
					fail(error);
				}
			},
			get fulfilled() {
				return status !== "pending";
			},
			get status() {
				return status;
			}
		};
	}
	exports.deferred = deferred;
	/**
	* Alias of the exported `deferred` function, to help consumers wanting to use `deferred` as the
	* local variable name rather than the factory import name, without needing to rename on import.
	*
	* ```typescript
	import {createDeferred} from '@kwsites/promise-deferred`;
	```
	*/
	exports.createDeferred = deferred;
}));
//#endregion
//#region node_modules/@simple-git/argv-parser/dist/index.mjs
function* U(e, t) {
	const n = t === "global";
	for (const o of e) o.isGlobal === n && (yield o);
}
function F(e, t) {
	for (const { name: o } of U(e, "task")) {
		if (k.has(o)) return p(!0, t);
		if (S.has(o)) return p(!1, t);
	}
	const n = t.at(0)?.toLowerCase();
	return n === void 0 ? null : P.has(n) ? p(!0, t.slice(1)) : E.has(n) ? p(!1, t.slice(1)) : t.length === 1 ? p(!1, t) : p(!0, t);
}
function p(e = !1, t = []) {
	const n = t.at(0)?.toLowerCase();
	return n === void 0 ? null : {
		isWrite: e,
		isRead: !e,
		key: n,
		value: t.at(1)
	};
}
function A(e, t) {
	return t.isWrite && t.value !== void 0 ? {
		key: t.key,
		value: t.value,
		scope: e
	} : {
		key: t.key,
		scope: e
	};
}
function M(e) {
	const t = e?.indexOf("=") || -1;
	return !e || t < 0 ? null : {
		key: e.slice(0, t).trim().toLowerCase(),
		value: e.slice(t + 1)
	};
}
function N(e) {
	for (const { name: t } of U(e, "task")) switch (t) {
		case "--global": return "global";
		case "--system": return "system";
		case "--worktree": return "worktree";
		case "--local": return "local";
		case "--file":
		case "-f": return "file";
	}
	return "local";
}
function G({ name: e }) {
	if (e === "-c" || e === "--config") return "inline";
	if (e === "--config-env") return "env";
}
function* O(e) {
	for (const t of e) {
		const n = G(t), o = n && M(t.value);
		o && (yield {
			...o,
			scope: n
		});
	}
}
function L(e, t, n) {
	const o = {
		read: [],
		write: [...O(t)]
	};
	return e === "config" && $(o, N(t), F(t, n)), o;
}
function $(e, t, n) {
	if (n === null) return;
	const o = A(t, n);
	n.isWrite ? e.write.push(o) : e.read.push(o);
}
function I(e) {
	const t = R[e ?? ""] ?? T;
	return {
		short: new Map([...x.short.entries(), ...t.short.entries()]),
		long: t.long
	};
}
function b(e, t = D) {
	if (e.startsWith("--")) {
		const n = e.indexOf("=");
		if (n > 2) return [{
			name: e.slice(0, n),
			value: e.slice(n + 1),
			needsNext: !1
		}];
		const o = e.slice(2);
		return [{
			name: e,
			needsNext: t.long.has(o)
		}];
	}
	if (e.length === 2) {
		const n = e.charAt(1);
		return [{
			name: e,
			needsNext: t.short.get(n) === !0
		}];
	}
	return W(e, t.short);
}
function W(e, t) {
	const n = e.slice(1).split(""), o = [];
	for (let s = 0; s < n.length; s++) {
		const r = n[s], l = t.get(r);
		if (l === void 0) return [{
			name: e,
			needsNext: !1
		}];
		if (l) {
			const a = n.slice(s + 1).join("");
			if (a && ![...a].every((w) => t.has(w))) return o.push({
				name: `-${r}`,
				value: a,
				needsNext: !1
			}), o;
		}
		o.push({
			name: `-${r}`,
			needsNext: l
		});
	}
	return o;
}
function j(e, t = []) {
	let n = 0;
	for (; n < e.length;) {
		const o = String(e[n]);
		if (!o.startsWith("-") || o.length < 2) break;
		const s = b(o);
		let r = n + 1;
		for (const l of s) {
			const a = {
				name: l.name,
				value: l.value,
				absorbedNext: !1,
				isGlobal: !0
			};
			l.needsNext && a.value === void 0 && r < e.length && (a.value = String(e[r]), a.absorbedNext = !0, r++), t.push(a);
		}
		n = r;
	}
	return {
		flags: t,
		taskIndex: n
	};
}
function B(e, t, n = []) {
	const o$1 = I(t), s = [], r$1 = [];
	let l = 0;
	for (; l < e.length;) {
		const a = e[l];
		if (r(a)) {
			r$1.push(...o(a)), l++;
			continue;
		}
		const f = String(a);
		if (f === "--") {
			for (let g = l + 1; g < e.length; g++) {
				const u = e[g];
				r(u) ? r$1.push(...o(u)) : r$1.push(String(u));
			}
			break;
		}
		if (!f.startsWith("-") || f.length < 2) {
			s.push(f), l++;
			continue;
		}
		const w = b(f, o$1);
		let d = l + 1;
		for (const g of w) {
			const u = {
				name: g.name,
				value: g.value,
				absorbedNext: !1,
				isGlobal: !1
			};
			g.needsNext && u.value === void 0 && d < e.length && !r(e[d]) && (u.value = String(e[d]), u.absorbedNext = !0, d++), n.push(u);
		}
		l = d;
	}
	return {
		flags: n,
		positionals: s,
		pathspecs: r$1
	};
}
function* V({ write: e }) {
	for (const t of e) for (const n of q) {
		const o = n(t.key);
		o && (yield o);
	}
}
function c(e, t, n = String(e)) {
	const o = typeof e == "string" ? new RegExp(`\\s*${e.toLowerCase()}`) : e;
	return function(r) {
		if (o.test(r)) return {
			category: t,
			message: `Configuring ${n} is not permitted without enabling ${t}`
		};
	};
}
function i(e, t) {
	return c(new RegExp(`\\s*${e.toLowerCase().replace(/\./g, "(..+)?.")}`), t, e);
}
function* K(e, t) {
	for (const n of t) for (const o of H) {
		const s = o(e, n.name);
		s && (yield s);
	}
}
function h(e, t, n, o = String(t)) {
	const s = typeof t == "string" ? new RegExp(`\\s*${t.toLowerCase()}`) : t, r = `Use of ${e ? `${e} with option ` : ""}${o} is not permitted without enabling ${n}`;
	return function(a, f) {
		if ((!e || a === e) && s.test(f)) return {
			category: n,
			message: r
		};
	};
}
function C(e, t, n) {
	return [...K(e, t), ...V(n)];
}
function Y(...e) {
	const { flags: t, taskIndex: n } = j(e), o = n < e.length ? String(e[n]).toLowerCase() : null, { positionals: r, pathspecs: l } = B(o !== null ? e.slice(n + 1) : [], o, t), a = L(o, t, r);
	return {
		task: o,
		flags: t.map(J),
		paths: l,
		config: a,
		vulnerabilities: z(C(o, t, a))
	};
}
function z(e) {
	return Object.defineProperty(e, "vulnerabilities", { value: e });
}
function J({ value: e, name: t }) {
	return e !== void 0 ? {
		name: t,
		value: e
	} : { name: t };
}
function* Q(e) {
	const t = parseInt(e.git_config_count ?? "0", 10);
	for (let n = 0; n < t; n++) {
		const o = e[`git_config_key_${n}`], s = e[`git_config_value_${n}`];
		o !== void 0 && (yield {
			key: o.toLowerCase().trim(),
			value: s,
			scope: "env"
		});
	}
}
function* X(e) {
	for (const t of Object.keys(e)) if (_(t)) {
		const n = y[t];
		yield {
			category: n,
			message: `Use of "${t.toUpperCase()}" is not permitted without enabling ${n}`
		};
	}
}
function _(e) {
	return Object.hasOwn(y, e);
}
function Z(e) {
	const t = {};
	for (const [n, o] of Object.entries(e)) {
		const s = n.toLowerCase().trim();
		(_(s) || s.startsWith("git")) && (t[s] = String(o));
	}
	return t;
}
function ee(e) {
	const t = Z(e), n = {
		read: [],
		write: [...Q(t)]
	};
	return {
		config: n,
		vulnerabilities: [...X(t), ...C(null, [], n)]
	};
}
function ne(e, t) {
	return [...Y(...e).vulnerabilities, ...ee(t).vulnerabilities];
}
var k, S, P, E, x, D, R, T, q, H, y;
var init_dist = __esmMin((() => {
	init_dist$1();
	k = /* @__PURE__ */ new Set([
		"--add",
		"--edit",
		"--remove-section",
		"--rename-section",
		"--replace-all",
		"--unset",
		"--unset-all",
		"-e"
	]);
	S = /* @__PURE__ */ new Set([
		"--get",
		"--get-all",
		"--get-color",
		"--get-colorbool",
		"--get-regexp",
		"--get-urlmatch",
		"--list",
		"-l"
	]);
	P = /* @__PURE__ */ new Set([
		"edit",
		"remove-section",
		"rename-section",
		"set",
		"unset"
	]);
	E = /* @__PURE__ */ new Set([
		"get",
		"get-color",
		"get-colorbool",
		"list"
	]);
	x = { short: /* @__PURE__ */ new Map([["c", !0]]) };
	D = {
		short: new Map([
			["C", !0],
			["P", !1],
			["h", !1],
			["p", !1],
			["v", !1],
			...x.short.entries()
		]),
		long: /* @__PURE__ */ new Set([
			"attr-source",
			"config-env",
			"exec-path",
			"git-dir",
			"list-cmds",
			"namespace",
			"super-prefix",
			"work-tree"
		])
	};
	R = {
		clone: {
			short: /* @__PURE__ */ new Map([
				["b", !0],
				["j", !0],
				["l", !1],
				["n", !1],
				["o", !0],
				["q", !1],
				["s", !1],
				["u", !0]
			]),
			long: /* @__PURE__ */ new Set([
				"branch",
				"config",
				"jobs",
				"origin",
				"upload-pack",
				"u",
				"template"
			])
		},
		commit: {
			short: /* @__PURE__ */ new Map([
				["C", !0],
				["F", !0],
				["c", !0],
				["m", !0],
				["t", !0]
			]),
			long: /* @__PURE__ */ new Set([
				"file",
				"message",
				"reedit-message",
				"reuse-message",
				"template"
			])
		},
		config: {
			short: /* @__PURE__ */ new Map([
				["e", !1],
				["f", !0],
				["l", !1]
			]),
			long: /* @__PURE__ */ new Set([
				"blob",
				"comment",
				"default",
				"file",
				"type",
				"value"
			])
		},
		fetch: {
			short: /* @__PURE__ */ new Map(),
			long: /* @__PURE__ */ new Set(["upload-pack"])
		},
		init: {
			short: /* @__PURE__ */ new Map(),
			long: /* @__PURE__ */ new Set(["template"])
		},
		pull: {
			short: /* @__PURE__ */ new Map(),
			long: /* @__PURE__ */ new Set(["upload-pack"])
		},
		push: {
			short: /* @__PURE__ */ new Map(),
			long: /* @__PURE__ */ new Set(["exec", "receive-pack"])
		}
	};
	T = {
		short: /* @__PURE__ */ new Map(),
		long: /* @__PURE__ */ new Set()
	};
	q = [
		c("alias", "allowUnsafeAlias"),
		c("core.askPass", "allowUnsafeAskPass"),
		c("core.editor", "allowUnsafeEditor"),
		c("core.fsmonitor", "allowUnsafeFsMonitor"),
		c("core.gitProxy", "allowUnsafeGitProxy"),
		c("core.hooksPath", "allowUnsafeHooksPath"),
		c("core.pager", "allowUnsafePager"),
		c("core.sshCommand", "allowUnsafeSshCommand"),
		i("credential.helper", "allowUnsafeCredentialHelper"),
		i("diff.command", "allowUnsafeDiffExternal"),
		c("diff.external", "allowUnsafeDiffExternal"),
		i("diff.textconv", "allowUnsafeDiffTextConv"),
		i("filter.clean", "allowUnsafeFilter"),
		i("filter.smudge", "allowUnsafeFilter"),
		i("gpg.program", "allowUnsafeGpgProgram"),
		c("init.templateDir", "allowUnsafeTemplateDir"),
		i("merge.driver", "allowUnsafeMergeDriver"),
		i("mergetool.path", "allowUnsafeMergeDriver"),
		i("mergetool.cmd", "allowUnsafeMergeDriver"),
		i("protocol.allow", "allowUnsafeProtocolOverride"),
		i("remote.receivepack", "allowUnsafePack"),
		i("remote.uploadpack", "allowUnsafePack"),
		c("sequence.editor", "allowUnsafeEditor")
	];
	H = [
		h(null, /--(upload|receive)-pack/, "allowUnsafePack", "--upload-pack or --receive-pack"),
		h("clone", /^-\w*u/, "allowUnsafePack"),
		h("clone", "--u", "allowUnsafePack"),
		h("push", "--exec", "allowUnsafePack"),
		h(null, "--template", "allowUnsafeTemplateDir")
	];
	y = {
		editor: "allowUnsafeEditor",
		git_askpass: "allowUnsafeAskPass",
		git_config_global: "allowUnsafeConfigPaths",
		git_config_system: "allowUnsafeConfigPaths",
		git_config_count: "allowUnsafeConfigEnvCount",
		git_config: "allowUnsafeConfigPaths",
		git_editor: "allowUnsafeEditor",
		git_exec_path: "allowUnsafeConfigPaths",
		git_external_diff: "allowUnsafeDiffExternal",
		git_pager: "allowUnsafePager",
		git_proxy_command: "allowUnsafeGitProxy",
		git_template_dir: "allowUnsafeTemplateDir",
		git_sequence_editor: "allowUnsafeEditor",
		git_ssh: "allowUnsafeSshCommand",
		git_ssh_command: "allowUnsafeSshCommand",
		pager: "allowUnsafePager",
		prefix: "allowUnsafeConfigPaths",
		ssh_askpass: "allowUnsafeAskPass"
	};
}));
//#endregion
//#region node_modules/simple-git/dist/esm/index.js
function asFunction(source) {
	if (typeof source !== "function") return NOOP;
	return source;
}
function isUserFunction(source) {
	return typeof source === "function" && source !== NOOP;
}
function splitOn(input, char) {
	const index = input.indexOf(char);
	if (index <= 0) return [input, ""];
	return [input.substr(0, index), input.substr(index + 1)];
}
function first(input, offset = 0) {
	return isArrayLike(input) && input.length > offset ? input[offset] : void 0;
}
function last(input, offset = 0) {
	if (isArrayLike(input) && input.length > offset) return input[input.length - 1 - offset];
}
function isArrayLike(input) {
	return filterHasLength(input);
}
function toLinesWithContent(input = "", trimmed2 = true, separator = "\n") {
	return input.split(separator).reduce((output, line) => {
		const lineContent = trimmed2 ? line.trim() : line;
		if (lineContent) output.push(lineContent);
		return output;
	}, []);
}
function forEachLineWithContent(input, callback) {
	return toLinesWithContent(input, true).map((line) => callback(line));
}
function folderExists(path) {
	return (0, import_dist.exists)(path, import_dist.FOLDER);
}
function append(target, item) {
	if (Array.isArray(target)) {
		if (!target.includes(item)) target.push(item);
	} else target.add(item);
	return item;
}
function including(target, item) {
	if (Array.isArray(target) && !target.includes(item)) target.push(item);
	return target;
}
function remove(target, item) {
	if (Array.isArray(target)) {
		const index = target.indexOf(item);
		if (index >= 0) target.splice(index, 1);
	} else target.delete(item);
	return item;
}
function asArray(source) {
	return Array.isArray(source) ? source : [source];
}
function asCamelCase(str) {
	return str.replace(/[\s-]+(.)/g, (_all, chr) => {
		return chr.toUpperCase();
	});
}
function asStringArray(source) {
	return asArray(source).map((item) => {
		return item instanceof String ? item : String(item);
	});
}
function asNumber(source, onNaN = 0) {
	if (source == null) return onNaN;
	const num = parseInt(source, 10);
	return Number.isNaN(num) ? onNaN : num;
}
function prefixedArray(input, prefix) {
	const output = [];
	for (let i = 0, max = input.length; i < max; i++) output.push(prefix, input[i]);
	return output;
}
function bufferToString(input) {
	return (Array.isArray(input) ? Buffer.concat(input) : input).toString("utf-8");
}
function pick(source, properties) {
	const out = {};
	properties.forEach((key) => {
		if (source[key] !== void 0) out[key] = source[key];
	});
	return out;
}
function delay(duration = 0) {
	return new Promise((done) => setTimeout(done, duration));
}
function orVoid(input) {
	if (input === false) return;
	return input;
}
function filterType(input, filter, def) {
	if (filter(input)) return input;
	return arguments.length > 2 ? def : void 0;
}
function filterPrimitives(input, omit) {
	const type = r(input) ? "string" : typeof input;
	return /number|string|boolean/.test(type) && (!omit || !omit.includes(type));
}
function filterPlainObject(input) {
	return !!input && objectToString(input) === "[object Object]";
}
function filterFunction(input) {
	return typeof input === "function";
}
function useMatchesDefault() {
	throw new Error(`LineParser:useMatches not implemented`);
}
function createInstanceConfig(...options) {
	const baseDir = process.cwd();
	const config = Object.assign({
		baseDir,
		...defaultOptions
	}, ...options.filter((o) => typeof o === "object" && o));
	config.baseDir = config.baseDir || baseDir;
	config.trimmed = config.trimmed === true;
	return config;
}
function appendTaskOptions(options, commands = []) {
	if (!filterPlainObject(options)) return commands;
	return Object.keys(options).reduce((commands2, key) => {
		const value = options[key];
		if (r(value)) commands2.push(value);
		else if (filterPrimitives(value, ["boolean"])) commands2.push(key + "=" + value);
		else if (Array.isArray(value)) {
			for (const v of value) if (!filterPrimitives(v, ["string", "number"])) commands2.push(key + "=" + v);
		} else commands2.push(key);
		return commands2;
	}, commands);
}
function getTrailingOptions(args, initialPrimitive = 0, objectOnly = false) {
	const command = [];
	for (let i = 0, max = initialPrimitive < 0 ? args.length : initialPrimitive; i < max; i++) if ("string|number".includes(typeof args[i])) command.push(String(args[i]));
	appendTaskOptions(trailingOptionsArgument(args), command);
	if (!objectOnly) command.push(...trailingArrayArgument(args));
	return command;
}
function trailingArrayArgument(args) {
	return asStringArray(filterType(last(args, typeof last(args) === "function" ? 1 : 0), filterArray, []));
}
function trailingOptionsArgument(args) {
	return filterType(last(args, filterFunction(last(args)) ? 1 : 0), filterPlainObject);
}
function trailingFunctionArgument(args, includeNoop = true) {
	const callback = asFunction(last(args));
	return includeNoop || isUserFunction(callback) ? callback : void 0;
}
function callTaskParser(parser4, streams) {
	return parser4(streams.stdOut, streams.stdErr);
}
function parseStringResponse(result, parsers12, texts, trim = true) {
	asArray(texts).forEach((text) => {
		for (let lines = toLinesWithContent(text, trim), i = 0, max = lines.length; i < max; i++) {
			const line = (offset = 0) => {
				if (i + offset >= max) return;
				return lines[i + offset];
			};
			parsers12.some(({ parse }) => parse(line, result));
		}
	});
	return result;
}
function checkIsRepoTask(action) {
	switch (action) {
		case "bare": return checkIsBareRepoTask();
		case "root": return checkIsRepoRootTask();
	}
	return {
		commands: ["rev-parse", "--is-inside-work-tree"],
		format: "utf-8",
		onError,
		parser
	};
}
function checkIsRepoRootTask() {
	return {
		commands: ["rev-parse", "--git-dir"],
		format: "utf-8",
		onError,
		parser(path) {
			return /^\.(git)?$/.test(path.trim());
		}
	};
}
function checkIsBareRepoTask() {
	return {
		commands: ["rev-parse", "--is-bare-repository"],
		format: "utf-8",
		onError,
		parser
	};
}
function isNotRepoMessage(error) {
	return /(Not a git repository|Kein Git-Repository)/i.test(String(error));
}
function cleanSummaryParser(dryRun, text) {
	const summary = new CleanResponse(dryRun);
	const regexp = dryRun ? dryRunRemovalRegexp : removalRegexp;
	toLinesWithContent(text).forEach((line) => {
		const removed = line.replace(regexp, "");
		summary.paths.push(removed);
		(isFolderRegexp.test(removed) ? summary.folders : summary.files).push(removed);
	});
	return summary;
}
function adhocExecTask(parser4) {
	return {
		commands: EMPTY_COMMANDS,
		format: "empty",
		parser: parser4
	};
}
function configurationErrorTask(error) {
	return {
		commands: EMPTY_COMMANDS,
		format: "empty",
		parser() {
			throw typeof error === "string" ? new TaskConfigurationError(error) : error;
		}
	};
}
function straightThroughStringTask(commands, trimmed2 = false) {
	return {
		commands,
		format: "utf-8",
		parser(text) {
			return trimmed2 ? String(text).trim() : text;
		}
	};
}
function straightThroughBufferTask(commands) {
	return {
		commands,
		format: "buffer",
		parser(buffer) {
			return buffer;
		}
	};
}
function isBufferTask(task) {
	return task.format === "buffer";
}
function isEmptyTask(task) {
	return task.format === "empty" || !task.commands.length;
}
function cleanWithOptionsTask(mode, customArgs) {
	const { cleanMode, options, valid } = getCleanOptions(mode);
	if (!cleanMode) return configurationErrorTask(CONFIG_ERROR_MODE_REQUIRED);
	if (!valid.options) return configurationErrorTask(CONFIG_ERROR_UNKNOWN_OPTION + JSON.stringify(mode));
	options.push(...customArgs);
	if (options.some(isInteractiveMode)) return configurationErrorTask(CONFIG_ERROR_INTERACTIVE_MODE);
	return cleanTask(cleanMode, options);
}
function cleanTask(mode, customArgs) {
	return {
		commands: [
			"clean",
			`-${mode}`,
			...customArgs
		],
		format: "utf-8",
		parser(text) {
			return cleanSummaryParser(mode === "n", text);
		}
	};
}
function isCleanOptionsArray(input) {
	return Array.isArray(input) && input.every((test) => CleanOptionValues.has(test));
}
function getCleanOptions(input) {
	let cleanMode;
	let options = [];
	let valid = {
		cleanMode: false,
		options: true
	};
	input.replace(/[^a-z]i/g, "").split("").forEach((char) => {
		if (isCleanMode(char)) {
			cleanMode = char;
			valid.cleanMode = true;
		} else valid.options = valid.options && isKnownOption(options[options.length] = `-${char}`);
	});
	return {
		cleanMode,
		options,
		valid
	};
}
function isCleanMode(cleanMode) {
	return cleanMode === "f" || cleanMode === "n";
}
function isKnownOption(option) {
	return /^-[a-z]$/i.test(option) && CleanOptionValues.has(option.charAt(1));
}
function isInteractiveMode(option) {
	if (/^-[^\-]/.test(option)) return option.indexOf("i") > 0;
	return option === "--interactive";
}
function configListParser(text) {
	const config = new ConfigList();
	for (const item of configParser(text)) config.addValue(item.file, String(item.key), item.value);
	return config;
}
function configGetParser(text, key) {
	let value = null;
	const values = [];
	const scopes = /* @__PURE__ */ new Map();
	for (const item of configParser(text, key)) {
		if (item.key !== key) continue;
		values.push(value = item.value);
		if (!scopes.has(item.file)) scopes.set(item.file, []);
		scopes.get(item.file).push(value);
	}
	return {
		key,
		paths: Array.from(scopes.keys()),
		scopes,
		value,
		values
	};
}
function configFilePath(filePath) {
	return filePath.replace(/^(file):/, "");
}
function* configParser(text, requestedKey = null) {
	const lines = text.split("\0");
	for (let i = 0, max = lines.length - 1; i < max;) {
		const file = configFilePath(lines[i++]);
		let value = lines[i++];
		let key = requestedKey;
		if (value.includes("\n")) {
			const line = splitOn(value, "\n");
			key = line[0];
			value = line[1];
		}
		yield {
			file,
			key,
			value
		};
	}
}
function asConfigScope(scope, fallback) {
	if (typeof scope === "string" && Object.hasOwn(GitConfigScope, scope)) return scope;
	return fallback;
}
function addConfigTask(key, value, append2, scope) {
	const commands = ["config", `--${scope}`];
	if (append2) commands.push("--add");
	commands.push(key, value);
	return {
		commands,
		format: "utf-8",
		parser(text) {
			return text;
		}
	};
}
function getConfigTask(key, scope) {
	const commands = [
		"config",
		"--null",
		"--show-origin",
		"--get-all",
		key
	];
	if (scope) commands.splice(1, 0, `--${scope}`);
	return {
		commands,
		format: "utf-8",
		parser(text) {
			return configGetParser(text, key);
		}
	};
}
function listConfigTask(scope) {
	const commands = [
		"config",
		"--list",
		"--show-origin",
		"--null"
	];
	if (scope) commands.push(`--${scope}`);
	return {
		commands,
		format: "utf-8",
		parser(text) {
			return configListParser(text);
		}
	};
}
function config_default() {
	return {
		addConfig(key, value, ...rest) {
			return this._runTask(addConfigTask(key, value, rest[0] === true, asConfigScope(rest[1], "local")), trailingFunctionArgument(arguments));
		},
		getConfig(key, scope) {
			return this._runTask(getConfigTask(key, asConfigScope(scope, void 0)), trailingFunctionArgument(arguments));
		},
		listConfig(...rest) {
			return this._runTask(listConfigTask(asConfigScope(rest[0], void 0)), trailingFunctionArgument(arguments));
		}
	};
}
function isDiffNameStatus(input) {
	return diffNameStatus.has(input);
}
function grepQueryBuilder(...params) {
	return new GrepQuery().param(...params);
}
function parseGrep(grep) {
	const paths = /* @__PURE__ */ new Set();
	const results = {};
	forEachLineWithContent(grep, (input) => {
		const [path, line, preview] = input.split(NULL);
		paths.add(path);
		(results[path] = results[path] || []).push({
			line: asNumber(line),
			path,
			preview
		});
	});
	return {
		paths,
		results
	};
}
function grep_default() {
	return { grep(searchTerm) {
		const then = trailingFunctionArgument(arguments);
		const options = getTrailingOptions(arguments);
		for (const option of disallowedOptions) if (options.includes(option)) return this._runTask(configurationErrorTask(`git.grep: use of "${option}" is not supported.`), then);
		if (typeof searchTerm === "string") searchTerm = grepQueryBuilder().param(searchTerm);
		const commands = [
			"grep",
			"--null",
			"-n",
			"--full-name",
			...options,
			...searchTerm
		];
		return this._runTask({
			commands,
			format: "utf-8",
			parser(stdOut) {
				return parseGrep(stdOut);
			}
		}, then);
	} };
}
function resetTask(mode, customArgs) {
	const commands = ["reset"];
	if (isValidResetMode(mode)) commands.push(`--${mode}`);
	commands.push(...customArgs);
	return straightThroughStringTask(commands);
}
function getResetMode(mode) {
	if (isValidResetMode(mode)) return mode;
	switch (typeof mode) {
		case "string":
		case "undefined": return "soft";
	}
}
function isValidResetMode(mode) {
	return typeof mode === "string" && validResetModes.includes(mode);
}
function createLog() {
	return (0, import_src.default)("simple-git");
}
function prefixedLogger(to, prefix, forward) {
	if (!prefix || !String(prefix).replace(/\s*/, "")) return !forward ? to : (message, ...args) => {
		to(message, ...args);
		forward(message, ...args);
	};
	return (message, ...args) => {
		to(`%s ${message}`, prefix, ...args);
		if (forward) forward(message, ...args);
	};
}
function childLoggerName(name, childDebugger, { namespace: parentNamespace }) {
	if (typeof name === "string") return name;
	const childNamespace = childDebugger && childDebugger.namespace || "";
	if (childNamespace.startsWith(parentNamespace)) return childNamespace.substr(parentNamespace.length + 1);
	return childNamespace || parentNamespace;
}
function createLogger(label, verbose, initialStep, infoDebugger = createLog()) {
	const labelPrefix = label && `[${label}]` || "";
	const spawned = [];
	const debugDebugger = typeof verbose === "string" ? infoDebugger.extend(verbose) : verbose;
	const key = childLoggerName(filterType(verbose, filterString), debugDebugger, infoDebugger);
	return step(initialStep);
	function sibling(name, initial) {
		return append(spawned, createLogger(label, key.replace(/^[^:]+/, name), initial, infoDebugger));
	}
	function step(phase) {
		const stepPrefix = phase && `[${phase}]` || "";
		const debug2 = debugDebugger && prefixedLogger(debugDebugger, stepPrefix) || NOOP;
		const info = prefixedLogger(infoDebugger, `${labelPrefix} ${stepPrefix}`, debug2);
		return Object.assign(debugDebugger ? debug2 : info, {
			label,
			sibling,
			info,
			step
		});
	}
}
function pluginContext(task, commands) {
	return {
		method: first(task.commands) || "",
		commands
	};
}
function onErrorReceived(target, logger) {
	return (err) => {
		logger(`[ERROR] child process exception %o`, err);
		target.push(Buffer.from(String(err.stack), "ascii"));
	};
}
function onDataReceived(target, name, logger, output) {
	return (buffer) => {
		logger(`%s received %L bytes`, name, buffer);
		output(`%B`, buffer);
		target.push(buffer);
	};
}
function taskCallback(task, response, callback = NOOP) {
	const onSuccess = (data) => {
		callback(null, data);
	};
	const onError2 = (err) => {
		if (err?.task === task) callback(err instanceof GitResponseError ? addDeprecationNoticeToError(err) : err, void 0);
	};
	response.then(onSuccess, onError2);
}
function addDeprecationNoticeToError(err) {
	let log = (name) => {
		console.warn(`simple-git deprecation notice: accessing GitResponseError.${name} should be GitResponseError.git.${name}, this will no longer be available in version 3`);
		log = NOOP;
	};
	return Object.create(err, Object.getOwnPropertyNames(err.git).reduce(descriptorReducer, {}));
	function descriptorReducer(all, name) {
		if (name in err) return all;
		all[name] = {
			enumerable: false,
			configurable: false,
			get() {
				log(name);
				return err.git[name];
			}
		};
		return all;
	}
}
function changeWorkingDirectoryTask(directory, root) {
	return adhocExecTask((instance) => {
		if (!folderExists(directory)) throw new Error(`Git.cwd: cannot change to non-directory "${directory}"`);
		return (root || instance).cwd = directory;
	});
}
function checkoutTask(args) {
	const commands = ["checkout", ...args];
	if (commands[1] === "-b" && commands.includes("-B")) commands[1] = remove(commands, "-B");
	return straightThroughStringTask(commands);
}
function checkout_default() {
	return {
		checkout() {
			return this._runTask(checkoutTask(getTrailingOptions(arguments, 1)), trailingFunctionArgument(arguments));
		},
		checkoutBranch(branchName, startPoint) {
			return this._runTask(checkoutTask([
				"-b",
				branchName,
				startPoint,
				...getTrailingOptions(arguments)
			]), trailingFunctionArgument(arguments));
		},
		checkoutLocalBranch(branchName) {
			return this._runTask(checkoutTask([
				"-b",
				branchName,
				...getTrailingOptions(arguments)
			]), trailingFunctionArgument(arguments));
		}
	};
}
function countObjectsResponse() {
	return {
		count: 0,
		garbage: 0,
		inPack: 0,
		packs: 0,
		prunePackable: 0,
		size: 0,
		sizeGarbage: 0,
		sizePack: 0
	};
}
function count_objects_default() {
	return { countObjects() {
		return this._runTask({
			commands: ["count-objects", "--verbose"],
			format: "utf-8",
			parser(stdOut) {
				return parseStringResponse(countObjectsResponse(), [parser2], stdOut);
			}
		});
	} };
}
function parseCommitResult(stdOut) {
	return parseStringResponse({
		author: null,
		branch: "",
		commit: "",
		root: false,
		summary: {
			changes: 0,
			insertions: 0,
			deletions: 0
		}
	}, parsers, stdOut);
}
function commitTask(message, files, customArgs) {
	return {
		commands: [
			"-c",
			"core.abbrev=40",
			"commit",
			...prefixedArray(message, "-m"),
			...files,
			...customArgs
		],
		format: "utf-8",
		parser: parseCommitResult
	};
}
function commit_default() {
	return { commit(message, ...rest) {
		const next = trailingFunctionArgument(arguments);
		const task = rejectDeprecatedSignatures(message) || commitTask(asArray(message), asArray(filterType(rest[0], filterStringOrStringArray, [])), [...asStringArray(filterType(rest[1], filterArray, [])), ...getTrailingOptions(arguments, 0, true)]);
		return this._runTask(task, next);
	} };
	function rejectDeprecatedSignatures(message) {
		return !filterStringOrStringArray(message) && configurationErrorTask(`git.commit: requires the commit message to be supplied as a string/string[]`);
	}
}
function first_commit_default() {
	return { firstCommit() {
		return this._runTask(straightThroughStringTask([
			"rev-list",
			"--max-parents=0",
			"HEAD"
		], true), trailingFunctionArgument(arguments));
	} };
}
function hashObjectTask(filePath, write) {
	const commands = ["hash-object", filePath];
	if (write) commands.push("-w");
	return straightThroughStringTask(commands, true);
}
function parseInit(bare, path, text) {
	const response = String(text).trim();
	let result;
	if (result = initResponseRegex.exec(response)) return new InitSummary(bare, path, false, result[1]);
	if (result = reInitResponseRegex.exec(response)) return new InitSummary(bare, path, true, result[1]);
	let gitDir = "";
	const tokens = response.split(" ");
	while (tokens.length) if (tokens.shift() === "in") {
		gitDir = tokens.join(" ");
		break;
	}
	return new InitSummary(bare, path, /^re/i.test(response), gitDir);
}
function hasBareCommand(command) {
	return command.includes(bareCommand);
}
function initTask(bare = false, path, customArgs) {
	const commands = ["init", ...customArgs];
	if (bare && !hasBareCommand(commands)) commands.splice(1, 0, bareCommand);
	return {
		commands,
		format: "utf-8",
		parser(text) {
			return parseInit(commands.includes("--bare"), path, text);
		}
	};
}
function logFormatFromCommand(customArgs) {
	for (let i = 0; i < customArgs.length; i++) {
		const format = logFormatRegex.exec(customArgs[i]);
		if (format) return `--${format[1]}`;
	}
	return "";
}
function isLogFormat(customArg) {
	return logFormatRegex.test(customArg);
}
function getDiffParser(format = "") {
	const parser4 = diffSummaryParsers[format];
	return (stdOut) => parseStringResponse(new DiffSummary(), parser4, stdOut, false);
}
function lineBuilder(tokens, fields) {
	return fields.reduce((line, field, index) => {
		line[field] = tokens[index] || "";
		return line;
	}, /* @__PURE__ */ Object.create({ diff: null }));
}
function createListLogSummaryParser(splitter = SPLITTER, fields = defaultFieldNames, logFormat = "") {
	const parseDiffResult = getDiffParser(logFormat);
	return function(stdOut) {
		const all = toLinesWithContent(stdOut.trim(), false, START_BOUNDARY).map(function(item) {
			const lineDetail = item.split(COMMIT_BOUNDARY);
			const listLogLine = lineBuilder(lineDetail[0].split(splitter), fields);
			if (lineDetail.length > 1 && !!lineDetail[1].trim()) listLogLine.diff = parseDiffResult(lineDetail[1]);
			return listLogLine;
		});
		return {
			all,
			latest: all.length && all[0] || null,
			total: all.length
		};
	};
}
function diffSummaryTask(customArgs) {
	let logFormat = logFormatFromCommand(customArgs);
	const commands = ["diff"];
	if (logFormat === "") {
		logFormat = "--stat";
		commands.push("--stat=4096");
	}
	commands.push(...customArgs);
	return validateLogFormatConfig(commands) || {
		commands,
		format: "utf-8",
		parser: getDiffParser(logFormat)
	};
}
function validateLogFormatConfig(customArgs) {
	const flags = customArgs.filter(isLogFormat);
	if (flags.length > 1) return configurationErrorTask(`Summary flags are mutually exclusive - pick one of ${flags.join(",")}`);
	if (flags.length && customArgs.includes("-z")) return configurationErrorTask(`Summary flag ${flags} parsing is not compatible with null termination option '-z'`);
}
function prettyFormat(format, splitter) {
	const fields = [];
	const formatStr = [];
	Object.keys(format).forEach((field) => {
		fields.push(field);
		formatStr.push(String(format[field]));
	});
	return [fields, formatStr.join(splitter)];
}
function userOptions(input) {
	return Object.keys(input).reduce((out, key) => {
		if (!(key in excludeOptions)) out[key] = input[key];
		return out;
	}, {});
}
function parseLogOptions(opt = {}, customArgs = []) {
	const splitter = filterType(opt.splitter, filterString, SPLITTER);
	const [fields, formatStr] = prettyFormat(filterPlainObject(opt.format) ? opt.format : {
		hash: "%H",
		date: opt.strictDate === false ? "%ai" : "%aI",
		message: "%s",
		refs: "%D",
		body: opt.multiLine ? "%B" : "%b",
		author_name: opt.mailMap !== false ? "%aN" : "%an",
		author_email: opt.mailMap !== false ? "%aE" : "%ae"
	}, splitter);
	const suffix = [];
	const command = [`--pretty=format:${START_BOUNDARY}${formatStr}${COMMIT_BOUNDARY}`, ...customArgs];
	const maxCount = opt.n || opt["max-count"] || opt.maxCount;
	if (maxCount) command.push(`--max-count=${maxCount}`);
	if (opt.from || opt.to) {
		const rangeOperator = opt.symmetric !== false ? "..." : "..";
		suffix.push(`${opt.from || ""}${rangeOperator}${opt.to || ""}`);
	}
	if (filterString(opt.file)) command.push("--follow", c$1(opt.file));
	appendTaskOptions(userOptions(opt), command);
	return {
		fields,
		splitter,
		commands: [...command, ...suffix]
	};
}
function logTask(splitter, fields, customArgs) {
	const parser4 = createListLogSummaryParser(splitter, fields, logFormatFromCommand(customArgs));
	return {
		commands: ["log", ...customArgs],
		format: "utf-8",
		parser: parser4
	};
}
function log_default() {
	return { log(...rest) {
		const next = trailingFunctionArgument(arguments);
		const options = parseLogOptions(trailingOptionsArgument(arguments), asStringArray(filterType(arguments[0], filterArray, [])));
		const task = rejectDeprecatedSignatures(...rest) || validateLogFormatConfig(options.commands) || createLogTask(options);
		return this._runTask(task, next);
	} };
	function createLogTask(options) {
		return logTask(options.splitter, options.fields, options.commands);
	}
	function rejectDeprecatedSignatures(from, to) {
		return filterString(from) && filterString(to) && configurationErrorTask(`git.log(string, string) should be replaced with git.log({ from: string, to: string })`);
	}
}
function objectEnumerationResult(remoteMessages) {
	return remoteMessages.objects = remoteMessages.objects || {
		compressing: 0,
		counting: 0,
		enumerating: 0,
		packReused: 0,
		reused: {
			count: 0,
			delta: 0
		},
		total: {
			count: 0,
			delta: 0
		}
	};
}
function asObjectCount(source) {
	const count = /^\s*(\d+)/.exec(source);
	const delta = /delta (\d+)/i.exec(source);
	return {
		count: asNumber(count && count[1] || "0"),
		delta: asNumber(delta && delta[1] || "0")
	};
}
function parseRemoteMessages(_stdOut, stdErr) {
	return parseStringResponse({ remoteMessages: new RemoteMessageSummary() }, parsers2, stdErr);
}
function parsePullErrorResult(stdOut, stdErr) {
	const pullError = parseStringResponse(new PullFailedSummary(), errorParsers, [stdOut, stdErr]);
	return pullError.message && pullError;
}
function mergeTask(customArgs) {
	if (!customArgs.length) return configurationErrorTask("Git.merge requires at least one option");
	return {
		commands: ["merge", ...customArgs],
		format: "utf-8",
		parser(stdOut, stdErr) {
			const merge = parseMergeResult(stdOut, stdErr);
			if (merge.failed) throw new GitResponseError(merge);
			return merge;
		}
	};
}
function pushResultPushedItem(local, remote, status) {
	const deleted = status.includes("deleted");
	const tag = status.includes("tag") || /^refs\/tags/.test(local);
	const alreadyUpdated = !status.includes("new");
	return {
		deleted,
		tag,
		branch: !tag,
		new: !alreadyUpdated,
		alreadyUpdated,
		local,
		remote
	};
}
function pushTagsTask(ref = {}, customArgs) {
	append(customArgs, "--tags");
	return pushTask(ref, customArgs);
}
function pushTask(ref = {}, customArgs) {
	const commands = ["push", ...customArgs];
	if (ref.branch) commands.splice(1, 0, ref.branch);
	if (ref.remote) commands.splice(1, 0, ref.remote);
	remove(commands, "-v");
	append(commands, "--verbose");
	append(commands, "--porcelain");
	return {
		commands,
		format: "utf-8",
		parser: parsePushResult
	};
}
function show_default() {
	return {
		showBuffer() {
			const commands = ["show", ...getTrailingOptions(arguments, 1)];
			if (!commands.includes("--binary")) commands.splice(1, 0, "--binary");
			return this._runTask(straightThroughBufferTask(commands), trailingFunctionArgument(arguments));
		},
		show() {
			const commands = ["show", ...getTrailingOptions(arguments, 1)];
			return this._runTask(straightThroughStringTask(commands), trailingFunctionArgument(arguments));
		}
	};
}
function renamedFile(line) {
	const [to, from] = line.split(NULL);
	return {
		from: from || to,
		to
	};
}
function parser3(indexX, indexY, handler) {
	return [`${indexX}${indexY}`, handler];
}
function conflicts(indexX, ...indexY) {
	return indexY.map((y) => parser3(indexX, y, (result, file) => result.conflicted.push(file)));
}
function splitLine(result, lineStr) {
	const trimmed2 = lineStr.trim();
	switch (" ") {
		case trimmed2.charAt(2): return data(trimmed2.charAt(0), trimmed2.charAt(1), trimmed2.slice(3));
		case trimmed2.charAt(1): return data(" ", trimmed2.charAt(0), trimmed2.slice(2));
		default: return;
	}
	function data(index, workingDir, path) {
		const raw = `${index}${workingDir}`;
		const handler = parsers6.get(raw);
		if (handler) handler(result, path);
		if (raw !== "##" && raw !== "!!") result.files.push(new FileStatusSummary(path, index, workingDir));
	}
}
function statusTask(customArgs) {
	return {
		format: "utf-8",
		commands: [
			"status",
			"--porcelain",
			"-b",
			"-u",
			"--null",
			...customArgs.filter((arg) => !ignoredOptions.includes(arg))
		],
		parser(text) {
			return parseStatusSummary(text);
		}
	};
}
function versionResponse(major = 0, minor = 0, patch = 0, agent = "", installed = true) {
	return Object.defineProperty({
		major,
		minor,
		patch,
		agent,
		installed
	}, "toString", {
		value() {
			return `${this.major}.${this.minor}.${this.patch}`;
		},
		configurable: false,
		enumerable: false
	});
}
function notInstalledResponse() {
	return versionResponse(0, 0, 0, "", false);
}
function version_default() {
	return { version() {
		return this._runTask({
			commands: ["--version"],
			format: "utf-8",
			parser: versionParser,
			onError(result, error, done, fail) {
				if (result.exitCode === -2) return done(Buffer.from(NOT_INSTALLED));
				fail(error);
			}
		});
	} };
}
function versionParser(stdOut) {
	if (stdOut === NOT_INSTALLED) return notInstalledResponse();
	return parseStringResponse(versionResponse(0, 0, 0, stdOut), parsers7, stdOut);
}
function createCloneTask(api, task, repoPath, ...args) {
	if (!filterString(repoPath)) return configurationErrorTask(`git.${api}() requires a string 'repoPath'`);
	return task(repoPath, filterType(args[0], filterString), getTrailingOptions(arguments));
}
function clone_default() {
	return {
		clone(repo, ...rest) {
			return this._runTask(createCloneTask("clone", cloneTask, filterType(repo, filterString), ...rest), trailingFunctionArgument(arguments));
		},
		mirror(repo, ...rest) {
			return this._runTask(createCloneTask("mirror", cloneMirrorTask, filterType(repo, filterString), ...rest), trailingFunctionArgument(arguments));
		}
	};
}
function applyPatchTask(patches, customArgs) {
	return straightThroughStringTask([
		"apply",
		...customArgs,
		...patches
	]);
}
function branchDeletionSuccess(branch, hash) {
	return {
		branch,
		hash,
		success: true
	};
}
function branchDeletionFailure(branch) {
	return {
		branch,
		hash: null,
		success: false
	};
}
function hasBranchDeletionError(data, processExitCode) {
	return processExitCode === 1 && deleteErrorRegex.test(data);
}
function branchStatus(input) {
	return input ? input.charAt(0) : "";
}
function parseBranchSummary(stdOut, currentOnly = false) {
	return parseStringResponse(new BranchSummaryResult(), currentOnly ? [currentBranchParser] : parsers9, stdOut);
}
function containsDeleteBranchCommand(commands) {
	const deleteCommands = [
		"-d",
		"-D",
		"--delete"
	];
	return commands.some((command) => deleteCommands.includes(command));
}
function branchTask(customArgs) {
	const isDelete = containsDeleteBranchCommand(customArgs);
	const isCurrentOnly = customArgs.includes("--show-current");
	const commands = ["branch", ...customArgs];
	if (commands.length === 1) commands.push("-a");
	if (!commands.includes("-v")) commands.splice(1, 0, "-v");
	return {
		format: "utf-8",
		commands,
		parser(stdOut, stdErr) {
			if (isDelete) return parseBranchDeletions(stdOut, stdErr).all[0];
			return parseBranchSummary(stdOut, isCurrentOnly);
		}
	};
}
function branchLocalTask() {
	return {
		format: "utf-8",
		commands: ["branch", "-v"],
		parser(stdOut) {
			return parseBranchSummary(stdOut);
		}
	};
}
function deleteBranchesTask(branches, forceDelete = false) {
	return {
		format: "utf-8",
		commands: [
			"branch",
			"-v",
			forceDelete ? "-D" : "-d",
			...branches
		],
		parser(stdOut, stdErr) {
			return parseBranchDeletions(stdOut, stdErr);
		},
		onError({ exitCode, stdOut }, error, done, fail) {
			if (!hasBranchDeletionError(String(error), exitCode)) return fail(error);
			done(stdOut);
		}
	};
}
function deleteBranchTask(branch, forceDelete = false) {
	const task = {
		format: "utf-8",
		commands: [
			"branch",
			"-v",
			forceDelete ? "-D" : "-d",
			branch
		],
		parser(stdOut, stdErr) {
			return parseBranchDeletions(stdOut, stdErr).branches[branch];
		},
		onError({ exitCode, stdErr, stdOut }, error, _, fail) {
			if (!hasBranchDeletionError(String(error), exitCode)) return fail(error);
			throw new GitResponseError(task.parser(bufferToString(stdOut), bufferToString(stdErr)), String(error));
		}
	};
	return task;
}
function toPath(input) {
	const path = input.trim().replace(/^["']|["']$/g, "");
	return path && normalize(path);
}
function checkIgnoreTask(paths) {
	return {
		commands: ["check-ignore", ...paths],
		format: "utf-8",
		parser: parseCheckIgnore
	};
}
function parseFetchResult(stdOut, stdErr) {
	return parseStringResponse({
		raw: stdOut,
		remote: null,
		branches: [],
		tags: [],
		updated: [],
		deleted: []
	}, parsers10, [stdOut, stdErr]);
}
function disallowedCommand(command) {
	return /^--upload-pack(=|$)/.test(command);
}
function fetchTask(remote, branch, customArgs) {
	const commands = ["fetch", ...customArgs];
	if (remote && branch) commands.push(remote, branch);
	if (commands.find(disallowedCommand)) return configurationErrorTask(`git.fetch: potential exploit argument blocked.`);
	return {
		commands,
		format: "utf-8",
		parser: parseFetchResult
	};
}
function parseMoveResult(stdOut) {
	return parseStringResponse({ moves: [] }, parsers11, stdOut);
}
function moveTask(from, to) {
	return {
		commands: [
			"mv",
			"-v",
			...asArray(from),
			to
		],
		format: "utf-8",
		parser: parseMoveResult
	};
}
function pullTask(remote, branch, customArgs) {
	const commands = ["pull", ...customArgs];
	if (remote && branch) commands.splice(1, 0, remote, branch);
	return {
		commands,
		format: "utf-8",
		parser(stdOut, stdErr) {
			return parsePullResult(stdOut, stdErr);
		},
		onError(result, _error, _done, fail) {
			const pullError = parsePullErrorResult(bufferToString(result.stdOut), bufferToString(result.stdErr));
			if (pullError) return fail(new GitResponseError(pullError));
			fail(_error);
		}
	};
}
function parseGetRemotes(text) {
	const remotes = {};
	forEach(text, ([name]) => remotes[name] = { name });
	return Object.values(remotes);
}
function parseGetRemotesVerbose(text) {
	const remotes = {};
	forEach(text, ([name, url, purpose]) => {
		if (!Object.hasOwn(remotes, name)) remotes[name] = {
			name,
			refs: {
				fetch: "",
				push: ""
			}
		};
		if (purpose && url) remotes[name].refs[purpose.replace(/[^a-z]/g, "")] = url;
	});
	return Object.values(remotes);
}
function forEach(text, handler) {
	forEachLineWithContent(text, (line) => handler(line.split(/\s+/)));
}
function addRemoteTask(remoteName, remoteRepo, customArgs) {
	return straightThroughStringTask([
		"remote",
		"add",
		...customArgs,
		remoteName,
		remoteRepo
	]);
}
function getRemotesTask(verbose) {
	const commands = ["remote"];
	if (verbose) commands.push("-v");
	return {
		commands,
		format: "utf-8",
		parser: verbose ? parseGetRemotesVerbose : parseGetRemotes
	};
}
function listRemotesTask(customArgs) {
	const commands = [...customArgs];
	if (commands[0] !== "ls-remote") commands.unshift("ls-remote");
	return straightThroughStringTask(commands);
}
function remoteTask(customArgs) {
	const commands = [...customArgs];
	if (commands[0] !== "remote") commands.unshift("remote");
	return straightThroughStringTask(commands);
}
function removeRemoteTask(remoteName) {
	return straightThroughStringTask([
		"remote",
		"remove",
		remoteName
	]);
}
function stashListTask(opt = {}, customArgs) {
	const options = parseLogOptions(opt);
	const commands = [
		"stash",
		"list",
		...options.commands,
		...customArgs
	];
	const parser4 = createListLogSummaryParser(options.splitter, options.fields, logFormatFromCommand(commands));
	return validateLogFormatConfig(commands) || {
		commands,
		format: "utf-8",
		parser: parser4
	};
}
function addSubModuleTask(repo, path) {
	return subModuleTask([
		"add",
		repo,
		path
	]);
}
function initSubModuleTask(customArgs) {
	return subModuleTask(["init", ...customArgs]);
}
function subModuleTask(customArgs) {
	const commands = [...customArgs];
	if (commands[0] !== "submodule") commands.unshift("submodule");
	return straightThroughStringTask(commands);
}
function updateSubModuleTask(customArgs) {
	return subModuleTask(["update", ...customArgs]);
}
function singleSorted(a, b) {
	const aIsNum = Number.isNaN(a);
	if (aIsNum !== Number.isNaN(b)) return aIsNum ? 1 : -1;
	return aIsNum ? sorted(a, b) : 0;
}
function sorted(a, b) {
	return a === b ? 0 : a > b ? 1 : -1;
}
function trimmed(input) {
	return input.trim();
}
function toNumber(input) {
	if (typeof input === "string") return parseInt(input.replace(/^\D+/g, ""), 10) || 0;
	return 0;
}
function tagListTask(customArgs = []) {
	const hasCustomSort = customArgs.some((option) => /^--sort=/.test(option));
	return {
		format: "utf-8",
		commands: [
			"tag",
			"-l",
			...customArgs
		],
		parser(text) {
			return parseTagList(text, hasCustomSort);
		}
	};
}
function addTagTask(name) {
	return {
		format: "utf-8",
		commands: ["tag", name],
		parser() {
			return { name };
		}
	};
}
function addAnnotatedTagTask(name, tagMessage) {
	return {
		format: "utf-8",
		commands: [
			"tag",
			"-a",
			"-m",
			tagMessage,
			name
		],
		parser() {
			return { name };
		}
	};
}
function abortPlugin(signal) {
	if (!signal) return;
	return [{
		type: "spawn.before",
		action(_data, context) {
			if (signal.aborted) context.kill(new GitPluginError(void 0, "abort", "Abort already signaled"));
		}
	}, {
		type: "spawn.after",
		action(_data, context) {
			function kill() {
				context.kill(new GitPluginError(void 0, "abort", "Abort signal received"));
			}
			signal.addEventListener("abort", kill);
			context.spawned.on("close", () => signal.removeEventListener("abort", kill));
		}
	}];
}
function blockUnsafeOperationsPlugin(options = {}) {
	return {
		type: "spawn.args",
		action(args, { env }) {
			for (const vulnerability of ne(args, env)) if (options[vulnerability.category] !== true) throw new GitPluginError(void 0, "unsafe", vulnerability.message);
			return args;
		}
	};
}
function commandConfigPrefixingPlugin(configuration) {
	const prefix = prefixedArray(configuration, "-c");
	return {
		type: "spawn.args",
		action(data) {
			return [...prefix, ...data];
		}
	};
}
function completionDetectionPlugin({ onClose = true, onExit = 50 } = {}) {
	function createEvents() {
		let exitCode = -1;
		const events = {
			close: (0, import_dist$2.deferred)(),
			closeTimeout: (0, import_dist$2.deferred)(),
			exit: (0, import_dist$2.deferred)(),
			exitTimeout: (0, import_dist$2.deferred)()
		};
		const result = Promise.race([onClose === false ? never : events.closeTimeout.promise, onExit === false ? never : events.exitTimeout.promise]);
		configureTimeout(onClose, events.close, events.closeTimeout);
		configureTimeout(onExit, events.exit, events.exitTimeout);
		return {
			close(code) {
				exitCode = code;
				events.close.done();
			},
			exit(code) {
				exitCode = code;
				events.exit.done();
			},
			get exitCode() {
				return exitCode;
			},
			result
		};
	}
	function configureTimeout(flag, event, timeout) {
		if (flag === false) return;
		(flag === true ? event.promise : event.promise.then(() => delay(flag))).then(timeout.done);
	}
	return {
		type: "spawn.after",
		async action(_data, { spawned, close }) {
			const events = createEvents();
			let deferClose = true;
			let quickClose = () => void (deferClose = false);
			spawned.stdout?.on("data", quickClose);
			spawned.stderr?.on("data", quickClose);
			spawned.on("error", quickClose);
			spawned.on("close", (code) => events.close(code));
			spawned.on("exit", (code) => events.exit(code));
			try {
				await events.result;
				if (deferClose) await delay(50);
				close(events.exitCode);
			} catch (err) {
				close(events.exitCode, err);
			}
		}
	};
}
function isBadArgument(arg) {
	return !arg || !/^([a-z]:)?([a-z0-9/.\\_~-]+)$/i.test(arg);
}
function toBinaryConfig(input, allowUnsafe) {
	if (input.length < 1 || input.length > 2) throw new GitPluginError(void 0, "binary", WRONG_NUMBER_ERR);
	if (input.some(isBadArgument)) if (allowUnsafe) console.warn(WRONG_CHARS_ERR);
	else throw new GitPluginError(void 0, "binary", WRONG_CHARS_ERR);
	const [binary, prefix] = input;
	return {
		binary,
		prefix
	};
}
function customBinaryPlugin(plugins, input = ["git"], allowUnsafe = false) {
	let config = toBinaryConfig(asArray(input), allowUnsafe);
	plugins.on("binary", (input2) => {
		config = toBinaryConfig(asArray(input2), allowUnsafe);
	});
	plugins.append("spawn.binary", () => {
		return config.binary;
	});
	plugins.append("spawn.args", (data) => {
		return config.prefix ? [config.prefix, ...data] : data;
	});
}
function isTaskError(result) {
	return !!(result.exitCode && result.stdErr.length);
}
function getErrorMessage(result) {
	return Buffer.concat([...result.stdOut, ...result.stdErr]);
}
function errorDetectionHandler(overwrite = false, isError = isTaskError, errorMessage = getErrorMessage) {
	return (error, result) => {
		if (!overwrite && error || !isError(result)) return error;
		return errorMessage(result);
	};
}
function errorDetectionPlugin(config) {
	return {
		type: "task.error",
		action(data, context) {
			const error = config(data.error, {
				stdErr: context.stdErr,
				stdOut: context.stdOut,
				exitCode: context.exitCode
			});
			if (Buffer.isBuffer(error)) return { error: new GitError(void 0, error.toString("utf-8")) };
			return { error };
		}
	};
}
function progressMonitorPlugin(progress) {
	const progressCommand = "--progress";
	const progressMethods = [
		"checkout",
		"clone",
		"fetch",
		"pull",
		"push"
	];
	return [{
		type: "spawn.args",
		action(args, context) {
			if (!progressMethods.includes(context.method)) return args;
			return including(args, progressCommand);
		}
	}, {
		type: "spawn.after",
		action(_data, context) {
			if (!context.commands.includes(progressCommand)) return;
			context.spawned.stderr?.on("data", (chunk) => {
				const message = /^([\s\S]+?):\s*(\d+)% \((\d+)\/(\d+)\)/.exec(chunk.toString("utf8"));
				if (!message) return;
				progress({
					method: context.method,
					stage: progressEventStage(message[1]),
					progress: asNumber(message[2]),
					processed: asNumber(message[3]),
					total: asNumber(message[4])
				});
			});
		}
	}];
}
function progressEventStage(input) {
	return String(input.toLowerCase().split(" ", 1)) || "unknown";
}
function spawnOptionsPlugin(spawnOptions) {
	const options = pick(spawnOptions, ["uid", "gid"]);
	return {
		type: "spawn.options",
		action(data) {
			return {
				...options,
				...data
			};
		}
	};
}
function timeoutPlugin({ block, stdErr = true, stdOut = true }) {
	if (block > 0) return {
		type: "spawn.after",
		action(_data, context) {
			let timeout;
			function wait() {
				timeout && clearTimeout(timeout);
				timeout = setTimeout(kill, block);
			}
			function stop() {
				context.spawned.stdout?.off("data", wait);
				context.spawned.stderr?.off("data", wait);
				context.spawned.off("exit", stop);
				context.spawned.off("close", stop);
				timeout && clearTimeout(timeout);
			}
			function kill() {
				stop();
				context.kill(new GitPluginError(void 0, "timeout", `block timeout reached`));
			}
			stdOut && context.spawned.stdout?.on("data", wait);
			stdErr && context.spawned.stderr?.on("data", wait);
			context.spawned.on("exit", stop);
			context.spawned.on("close", stop);
			wait();
		}
	};
}
function suffixPathsPlugin() {
	return {
		type: "spawn.args",
		action(data) {
			const prefix = [];
			let suffix;
			function append2(args) {
				(suffix = suffix || []).push(...args);
			}
			for (let i = 0; i < data.length; i++) {
				const param = data[i];
				if (r(param)) {
					append2(o(param));
					continue;
				}
				if (param === "--") {
					append2(data.slice(i + 1).flatMap((item) => r(item) && o(item) || item));
					break;
				}
				prefix.push(param);
			}
			return !suffix ? prefix : [
				...prefix,
				"--",
				...suffix.map(String)
			];
		}
	};
}
function gitInstanceFactory(baseDir, options) {
	const plugins = new PluginStore();
	const config = createInstanceConfig(baseDir && (typeof baseDir === "string" ? { baseDir } : baseDir) || {}, options);
	if (!folderExists(config.baseDir)) throw new GitConstructError(config, `Cannot use simple-git on a directory that does not exist`);
	if (Array.isArray(config.config)) plugins.add(commandConfigPrefixingPlugin(config.config));
	plugins.add(blockUnsafeOperationsPlugin(config.unsafe));
	plugins.add(completionDetectionPlugin(config.completion));
	config.abort && plugins.add(abortPlugin(config.abort));
	config.progress && plugins.add(progressMonitorPlugin(config.progress));
	config.timeout && plugins.add(timeoutPlugin(config.timeout));
	config.spawnOptions && plugins.add(spawnOptionsPlugin(config.spawnOptions));
	plugins.add(suffixPathsPlugin());
	plugins.add(errorDetectionPlugin(errorDetectionHandler(true)));
	config.errors && plugins.add(errorDetectionPlugin(config.errors));
	customBinaryPlugin(plugins, config.binary, config.unsafe?.allowUnsafeCustomBinary);
	return new Git(config, plugins);
}
var import_dist, import_src, import_dist$1, import_dist$2, __defProp, __getOwnPropDesc, __getOwnPropNames, __hasOwnProp, __esm, __commonJS, __export, __copyProps, __toCommonJS, GitError, init_git_error, GitResponseError, init_git_response_error, TaskConfigurationError, init_task_configuration_error, NULL, NOOP, objectToString, init_util, filterArray, filterNumber, filterString, filterStringOrStringArray, filterHasLength, init_argument_filters, ExitCodes, init_exit_codes, GitOutputStreams, init_git_output_streams, LineParser, RemoteLineParser, init_line_parser, defaultOptions, init_simple_git_options, init_task_options, init_task_parser, utils_exports, init_utils, check_is_repo_exports, CheckRepoActions, onError, parser, init_check_is_repo, CleanResponse, removalRegexp, dryRunRemovalRegexp, isFolderRegexp, init_CleanSummary, task_exports, EMPTY_COMMANDS, init_task, clean_exports, CONFIG_ERROR_INTERACTIVE_MODE, CONFIG_ERROR_MODE_REQUIRED, CONFIG_ERROR_UNKNOWN_OPTION, CleanOptions, CleanOptionValues, init_clean, ConfigList, init_ConfigList, GitConfigScope, init_config, DiffNameStatus, diffNameStatus, init_diff_name_status, disallowedOptions, Query, _a, GrepQuery, init_grep, reset_exports, ResetMode, validResetModes, init_reset, init_git_logger, TasksPendingQueue, init_tasks_pending_queue, GitExecutorChain, init_git_executor_chain, git_executor_exports, GitExecutor, init_git_executor, init_task_callback, init_change_working_directory, init_checkout, parser2, init_count_objects, parsers, init_parse_commit, init_commit, init_first_commit, init_hash_object, InitSummary, initResponseRegex, reInitResponseRegex, init_InitSummary, bareCommand, init_init, logFormatRegex, init_log_format, DiffSummary, init_DiffSummary, statParser, numStatParser, nameOnlyParser, nameStatusParser, diffSummaryParsers, init_parse_diff_summary, START_BOUNDARY, COMMIT_BOUNDARY, SPLITTER, defaultFieldNames, init_parse_list_log_summary, diff_exports, init_diff, excludeOptions, init_log, MergeSummaryConflict, MergeSummaryDetail, init_MergeSummary, PullSummary, PullFailedSummary, init_PullSummary, remoteMessagesObjectParsers, init_parse_remote_objects, parsers2, RemoteMessageSummary, init_parse_remote_messages, FILE_UPDATE_REGEX, SUMMARY_REGEX, ACTION_REGEX, parsers3, errorParsers, parsePullDetail, parsePullResult, init_parse_pull, parsers4, parseMergeResult, parseMergeDetail, init_parse_merge, init_merge, parsers5, parsePushResult, parsePushDetail, init_parse_push, push_exports, init_push, init_show, fromPathRegex, FileStatusSummary, init_FileStatusSummary, StatusSummary, parsers6, parseStatusSummary, init_StatusSummary, ignoredOptions, init_status, NOT_INSTALLED, parsers7, init_version, cloneTask, cloneMirrorTask, init_clone, simple_git_api_exports, SimpleGitApi, init_simple_git_api, scheduler_exports, createScheduledTask, Scheduler, init_scheduler, apply_patch_exports, init_apply_patch, BranchDeletionBatch, init_BranchDeleteSummary, deleteSuccessRegex, deleteErrorRegex, parsers8, parseBranchDeletions, init_parse_branch_delete, BranchSummaryResult, init_BranchSummary, parsers9, currentBranchParser, init_parse_branch, branch_exports, init_branch, parseCheckIgnore, init_CheckIgnore, check_ignore_exports, init_check_ignore, parsers10, init_parse_fetch, fetch_exports, init_fetch, parsers11, init_parse_move, move_exports, init_move, pull_exports, init_pull, init_GetRemoteSummary, remote_exports, init_remote, stash_list_exports, init_stash_list, sub_module_exports, init_sub_module, TagList, parseTagList, init_TagList, tag_exports, init_tag, require_git, GitConstructError, GitPluginError, never, WRONG_NUMBER_ERR, WRONG_CHARS_ERR, PluginStore, Git, simpleGit;
var init_esm = __esmMin((() => {
	import_dist = require_dist$1();
	init_dist$1();
	import_src = /* @__PURE__ */ __toESM(require_src$1(), 1);
	import_dist$1 = require_dist();
	init_dist();
	import_dist$2 = require_dist();
	__defProp = Object.defineProperty;
	__getOwnPropDesc = Object.getOwnPropertyDescriptor;
	__getOwnPropNames = Object.getOwnPropertyNames;
	__hasOwnProp = Object.prototype.hasOwnProperty;
	__esm = (fn, res) => function __init() {
		return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
	};
	__commonJS = (cb, mod) => function __require() {
		return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
	};
	__export = (target, all) => {
		for (var name in all) __defProp(target, name, {
			get: all[name],
			enumerable: true
		});
	};
	__copyProps = (to, from, except, desc) => {
		if (from && typeof from === "object" || typeof from === "function") {
			for (let key of __getOwnPropNames(from)) if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
				get: () => from[key],
				enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
			});
		}
		return to;
	};
	__toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
	init_git_error = __esm({ "src/lib/errors/git-error.ts"() {
		"use strict";
		GitError = class extends Error {
			constructor(task, message) {
				super(message);
				this.task = task;
				Object.setPrototypeOf(this, new.target.prototype);
			}
		};
	} });
	init_git_response_error = __esm({ "src/lib/errors/git-response-error.ts"() {
		"use strict";
		init_git_error();
		GitResponseError = class extends GitError {
			constructor(git, message) {
				super(void 0, message || String(git));
				this.git = git;
			}
		};
	} });
	init_task_configuration_error = __esm({ "src/lib/errors/task-configuration-error.ts"() {
		"use strict";
		init_git_error();
		TaskConfigurationError = class extends GitError {
			constructor(message) {
				super(void 0, message);
			}
		};
	} });
	init_util = __esm({ "src/lib/utils/util.ts"() {
		"use strict";
		init_argument_filters();
		NULL = "\0";
		NOOP = () => {};
		objectToString = Object.prototype.toString.call.bind(Object.prototype.toString);
	} });
	init_argument_filters = __esm({ "src/lib/utils/argument-filters.ts"() {
		"use strict";
		init_util();
		filterArray = (input) => {
			return Array.isArray(input);
		};
		filterNumber = (input) => {
			return typeof input === "number";
		};
		filterString = (input) => {
			return typeof input === "string" || r(input);
		};
		filterStringOrStringArray = (input) => {
			return filterString(input) || Array.isArray(input) && input.every(filterString);
		};
		filterHasLength = (input) => {
			if (input == null || "number|boolean|function".includes(typeof input)) return false;
			return typeof input.length === "number";
		};
	} });
	init_exit_codes = __esm({ "src/lib/utils/exit-codes.ts"() {
		"use strict";
		ExitCodes = /* @__PURE__ */ ((ExitCodes2) => {
			ExitCodes2[ExitCodes2["SUCCESS"] = 0] = "SUCCESS";
			ExitCodes2[ExitCodes2["ERROR"] = 1] = "ERROR";
			ExitCodes2[ExitCodes2["NOT_FOUND"] = -2] = "NOT_FOUND";
			ExitCodes2[ExitCodes2["UNCLEAN"] = 128] = "UNCLEAN";
			return ExitCodes2;
		})(ExitCodes || {});
	} });
	init_git_output_streams = __esm({ "src/lib/utils/git-output-streams.ts"() {
		"use strict";
		GitOutputStreams = class _GitOutputStreams {
			constructor(stdOut, stdErr) {
				this.stdOut = stdOut;
				this.stdErr = stdErr;
			}
			asStrings() {
				return new _GitOutputStreams(this.stdOut.toString("utf8"), this.stdErr.toString("utf8"));
			}
		};
	} });
	init_line_parser = __esm({ "src/lib/utils/line-parser.ts"() {
		"use strict";
		LineParser = class {
			constructor(regExp, useMatches) {
				this.matches = [];
				this.useMatches = useMatchesDefault;
				this.parse = (line, target) => {
					this.resetMatches();
					if (!this._regExp.every((reg, index) => this.addMatch(reg, index, line(index)))) return false;
					return this.useMatches(target, this.prepareMatches()) !== false;
				};
				this._regExp = Array.isArray(regExp) ? regExp : [regExp];
				if (useMatches) this.useMatches = useMatches;
			}
			resetMatches() {
				this.matches.length = 0;
			}
			prepareMatches() {
				return this.matches;
			}
			addMatch(reg, index, line) {
				const matched = line && reg.exec(line);
				if (matched) this.pushMatch(index, matched);
				return !!matched;
			}
			pushMatch(_index, matched) {
				this.matches.push(...matched.slice(1));
			}
		};
		RemoteLineParser = class extends LineParser {
			addMatch(reg, index, line) {
				return /^remote:\s/.test(String(line)) && super.addMatch(reg, index, line);
			}
			pushMatch(index, matched) {
				if (index > 0 || matched.length > 1) super.pushMatch(index, matched);
			}
		};
	} });
	init_simple_git_options = __esm({ "src/lib/utils/simple-git-options.ts"() {
		"use strict";
		defaultOptions = {
			binary: "git",
			maxConcurrentProcesses: 5,
			config: [],
			trimmed: false
		};
	} });
	init_task_options = __esm({ "src/lib/utils/task-options.ts"() {
		"use strict";
		init_argument_filters();
		init_util();
	} });
	init_task_parser = __esm({ "src/lib/utils/task-parser.ts"() {
		"use strict";
		init_util();
	} });
	utils_exports = {};
	__export(utils_exports, {
		ExitCodes: () => ExitCodes,
		GitOutputStreams: () => GitOutputStreams,
		LineParser: () => LineParser,
		NOOP: () => NOOP,
		NULL: () => NULL,
		RemoteLineParser: () => RemoteLineParser,
		append: () => append,
		appendTaskOptions: () => appendTaskOptions,
		asArray: () => asArray,
		asCamelCase: () => asCamelCase,
		asFunction: () => asFunction,
		asNumber: () => asNumber,
		asStringArray: () => asStringArray,
		bufferToString: () => bufferToString,
		callTaskParser: () => callTaskParser,
		createInstanceConfig: () => createInstanceConfig,
		delay: () => delay,
		filterArray: () => filterArray,
		filterFunction: () => filterFunction,
		filterHasLength: () => filterHasLength,
		filterNumber: () => filterNumber,
		filterPlainObject: () => filterPlainObject,
		filterPrimitives: () => filterPrimitives,
		filterString: () => filterString,
		filterStringOrStringArray: () => filterStringOrStringArray,
		filterType: () => filterType,
		first: () => first,
		folderExists: () => folderExists,
		forEachLineWithContent: () => forEachLineWithContent,
		getTrailingOptions: () => getTrailingOptions,
		including: () => including,
		isUserFunction: () => isUserFunction,
		last: () => last,
		objectToString: () => objectToString,
		orVoid: () => orVoid,
		parseStringResponse: () => parseStringResponse,
		pick: () => pick,
		prefixedArray: () => prefixedArray,
		remove: () => remove,
		splitOn: () => splitOn,
		toLinesWithContent: () => toLinesWithContent,
		trailingFunctionArgument: () => trailingFunctionArgument,
		trailingOptionsArgument: () => trailingOptionsArgument
	});
	init_utils = __esm({ "src/lib/utils/index.ts"() {
		"use strict";
		init_argument_filters();
		init_exit_codes();
		init_git_output_streams();
		init_line_parser();
		init_simple_git_options();
		init_task_options();
		init_task_parser();
		init_util();
	} });
	check_is_repo_exports = {};
	__export(check_is_repo_exports, {
		CheckRepoActions: () => CheckRepoActions,
		checkIsBareRepoTask: () => checkIsBareRepoTask,
		checkIsRepoRootTask: () => checkIsRepoRootTask,
		checkIsRepoTask: () => checkIsRepoTask
	});
	init_check_is_repo = __esm({ "src/lib/tasks/check-is-repo.ts"() {
		"use strict";
		init_utils();
		CheckRepoActions = /* @__PURE__ */ ((CheckRepoActions2) => {
			CheckRepoActions2["BARE"] = "bare";
			CheckRepoActions2["IN_TREE"] = "tree";
			CheckRepoActions2["IS_REPO_ROOT"] = "root";
			return CheckRepoActions2;
		})(CheckRepoActions || {});
		onError = ({ exitCode }, error, done, fail) => {
			if (exitCode === 128 && isNotRepoMessage(error)) return done(Buffer.from("false"));
			fail(error);
		};
		parser = (text) => {
			return text.trim() === "true";
		};
	} });
	init_CleanSummary = __esm({ "src/lib/responses/CleanSummary.ts"() {
		"use strict";
		init_utils();
		CleanResponse = class {
			constructor(dryRun) {
				this.dryRun = dryRun;
				this.paths = [];
				this.files = [];
				this.folders = [];
			}
		};
		removalRegexp = /^[a-z]+\s*/i;
		dryRunRemovalRegexp = /^[a-z]+\s+[a-z]+\s*/i;
		isFolderRegexp = /\/$/;
	} });
	task_exports = {};
	__export(task_exports, {
		EMPTY_COMMANDS: () => EMPTY_COMMANDS,
		adhocExecTask: () => adhocExecTask,
		configurationErrorTask: () => configurationErrorTask,
		isBufferTask: () => isBufferTask,
		isEmptyTask: () => isEmptyTask,
		straightThroughBufferTask: () => straightThroughBufferTask,
		straightThroughStringTask: () => straightThroughStringTask
	});
	init_task = __esm({ "src/lib/tasks/task.ts"() {
		"use strict";
		init_task_configuration_error();
		EMPTY_COMMANDS = [];
	} });
	clean_exports = {};
	__export(clean_exports, {
		CONFIG_ERROR_INTERACTIVE_MODE: () => CONFIG_ERROR_INTERACTIVE_MODE,
		CONFIG_ERROR_MODE_REQUIRED: () => CONFIG_ERROR_MODE_REQUIRED,
		CONFIG_ERROR_UNKNOWN_OPTION: () => CONFIG_ERROR_UNKNOWN_OPTION,
		CleanOptions: () => CleanOptions,
		cleanTask: () => cleanTask,
		cleanWithOptionsTask: () => cleanWithOptionsTask,
		isCleanOptionsArray: () => isCleanOptionsArray
	});
	init_clean = __esm({ "src/lib/tasks/clean.ts"() {
		"use strict";
		init_CleanSummary();
		init_utils();
		init_task();
		CONFIG_ERROR_INTERACTIVE_MODE = "Git clean interactive mode is not supported";
		CONFIG_ERROR_MODE_REQUIRED = "Git clean mode parameter (\"n\" or \"f\") is required";
		CONFIG_ERROR_UNKNOWN_OPTION = "Git clean unknown option found in: ";
		CleanOptions = /* @__PURE__ */ ((CleanOptions2) => {
			CleanOptions2["DRY_RUN"] = "n";
			CleanOptions2["FORCE"] = "f";
			CleanOptions2["IGNORED_INCLUDED"] = "x";
			CleanOptions2["IGNORED_ONLY"] = "X";
			CleanOptions2["EXCLUDING"] = "e";
			CleanOptions2["QUIET"] = "q";
			CleanOptions2["RECURSIVE"] = "d";
			return CleanOptions2;
		})(CleanOptions || {});
		CleanOptionValues = /* @__PURE__ */ new Set(["i", ...asStringArray(Object.values(CleanOptions))]);
	} });
	init_ConfigList = __esm({ "src/lib/responses/ConfigList.ts"() {
		"use strict";
		init_utils();
		ConfigList = class {
			constructor() {
				this.files = [];
				this.values = /* @__PURE__ */ Object.create(null);
			}
			get all() {
				if (!this._all) this._all = this.files.reduce((all, file) => {
					return Object.assign(all, this.values[file]);
				}, {});
				return this._all;
			}
			addFile(file) {
				if (!(file in this.values)) {
					const latest = last(this.files);
					this.values[file] = latest ? Object.create(this.values[latest]) : {};
					this.files.push(file);
				}
				return this.values[file];
			}
			addValue(file, key, value) {
				const values = this.addFile(file);
				if (!Object.hasOwn(values, key)) values[key] = value;
				else if (Array.isArray(values[key])) values[key].push(value);
				else values[key] = [values[key], value];
				this._all = void 0;
			}
		};
	} });
	init_config = __esm({ "src/lib/tasks/config.ts"() {
		"use strict";
		init_ConfigList();
		init_utils();
		GitConfigScope = /* @__PURE__ */ ((GitConfigScope2) => {
			GitConfigScope2["system"] = "system";
			GitConfigScope2["global"] = "global";
			GitConfigScope2["local"] = "local";
			GitConfigScope2["worktree"] = "worktree";
			return GitConfigScope2;
		})(GitConfigScope || {});
	} });
	init_diff_name_status = __esm({ "src/lib/tasks/diff-name-status.ts"() {
		"use strict";
		DiffNameStatus = /* @__PURE__ */ ((DiffNameStatus2) => {
			DiffNameStatus2["ADDED"] = "A";
			DiffNameStatus2["COPIED"] = "C";
			DiffNameStatus2["DELETED"] = "D";
			DiffNameStatus2["MODIFIED"] = "M";
			DiffNameStatus2["RENAMED"] = "R";
			DiffNameStatus2["CHANGED"] = "T";
			DiffNameStatus2["UNMERGED"] = "U";
			DiffNameStatus2["UNKNOWN"] = "X";
			DiffNameStatus2["BROKEN"] = "B";
			return DiffNameStatus2;
		})(DiffNameStatus || {});
		diffNameStatus = new Set(Object.values(DiffNameStatus));
	} });
	init_grep = __esm({ "src/lib/tasks/grep.ts"() {
		"use strict";
		init_utils();
		init_task();
		disallowedOptions = ["-h"];
		Query = Symbol("grepQuery");
		GrepQuery = class {
			constructor() {
				this[_a] = [];
			}
			*[(_a = Query, Symbol.iterator)]() {
				for (const query of this[Query]) yield query;
			}
			and(...and) {
				and.length && this[Query].push("--and", "(", ...prefixedArray(and, "-e"), ")");
				return this;
			}
			param(...param) {
				this[Query].push(...prefixedArray(param, "-e"));
				return this;
			}
		};
	} });
	reset_exports = {};
	__export(reset_exports, {
		ResetMode: () => ResetMode,
		getResetMode: () => getResetMode,
		resetTask: () => resetTask
	});
	init_reset = __esm({ "src/lib/tasks/reset.ts"() {
		"use strict";
		init_utils();
		init_task();
		ResetMode = /* @__PURE__ */ ((ResetMode2) => {
			ResetMode2["MIXED"] = "mixed";
			ResetMode2["SOFT"] = "soft";
			ResetMode2["HARD"] = "hard";
			ResetMode2["MERGE"] = "merge";
			ResetMode2["KEEP"] = "keep";
			return ResetMode2;
		})(ResetMode || {});
		validResetModes = asStringArray(Object.values(ResetMode));
	} });
	init_git_logger = __esm({ "src/lib/git-logger.ts"() {
		"use strict";
		init_utils();
		import_src.default.formatters.L = (value) => String(filterHasLength(value) ? value.length : "-");
		import_src.default.formatters.B = (value) => {
			if (Buffer.isBuffer(value)) return value.toString("utf8");
			return objectToString(value);
		};
	} });
	init_tasks_pending_queue = __esm({ "src/lib/runners/tasks-pending-queue.ts"() {
		"use strict";
		init_git_error();
		init_git_logger();
		TasksPendingQueue = class _TasksPendingQueue {
			constructor(logLabel = "GitExecutor") {
				this.logLabel = logLabel;
				this._queue = /* @__PURE__ */ new Map();
			}
			withProgress(task) {
				return this._queue.get(task);
			}
			createProgress(task) {
				const name = _TasksPendingQueue.getName(task.commands[0]);
				return {
					task,
					logger: createLogger(this.logLabel, name),
					name
				};
			}
			push(task) {
				const progress = this.createProgress(task);
				progress.logger("Adding task to the queue, commands = %o", task.commands);
				this._queue.set(task, progress);
				return progress;
			}
			fatal(err) {
				for (const [task, { logger }] of Array.from(this._queue.entries())) {
					if (task === err.task) {
						logger.info(`Failed %o`, err);
						logger(`Fatal exception, any as-yet un-started tasks run through this executor will not be attempted`);
					} else logger.info(`A fatal exception occurred in a previous task, the queue has been purged: %o`, err.message);
					this.complete(task);
				}
				if (this._queue.size !== 0) throw new Error(`Queue size should be zero after fatal: ${this._queue.size}`);
			}
			complete(task) {
				if (this.withProgress(task)) this._queue.delete(task);
			}
			attempt(task) {
				const progress = this.withProgress(task);
				if (!progress) throw new GitError(void 0, "TasksPendingQueue: attempt called for an unknown task");
				progress.logger("Starting task");
				return progress;
			}
			static getName(name = "empty") {
				return `task:${name}:${++_TasksPendingQueue.counter}`;
			}
			static {
				this.counter = 0;
			}
		};
	} });
	init_git_executor_chain = __esm({ "src/lib/runners/git-executor-chain.ts"() {
		"use strict";
		init_git_error();
		init_task();
		init_utils();
		init_tasks_pending_queue();
		GitExecutorChain = class {
			constructor(_executor, _scheduler, _plugins) {
				this._executor = _executor;
				this._scheduler = _scheduler;
				this._plugins = _plugins;
				this._chain = Promise.resolve();
				this._queue = new TasksPendingQueue();
			}
			get cwd() {
				return this._cwd || this._executor.cwd;
			}
			set cwd(cwd) {
				this._cwd = cwd;
			}
			get env() {
				return this._executor.env;
			}
			get outputHandler() {
				return this._executor.outputHandler;
			}
			chain() {
				return this;
			}
			push(task) {
				this._queue.push(task);
				return this._chain = this._chain.then(() => this.attemptTask(task));
			}
			async attemptTask(task) {
				const onScheduleComplete = await this._scheduler.next();
				const onQueueComplete = () => this._queue.complete(task);
				try {
					const { logger } = this._queue.attempt(task);
					return await (isEmptyTask(task) ? this.attemptEmptyTask(task, logger) : this.attemptRemoteTask(task, logger));
				} catch (e) {
					throw this.onFatalException(task, e);
				} finally {
					onQueueComplete();
					onScheduleComplete();
				}
			}
			onFatalException(task, e) {
				const gitError = e instanceof GitError ? Object.assign(e, { task }) : new GitError(task, e && String(e));
				this._chain = Promise.resolve();
				this._queue.fatal(gitError);
				return gitError;
			}
			async attemptRemoteTask(task, logger) {
				const binary = this._plugins.exec("spawn.binary", "", pluginContext(task, task.commands));
				const args = this._plugins.exec("spawn.args", [...task.commands], {
					...pluginContext(task, task.commands),
					env: { ...this.env }
				});
				const raw = await this.gitResponse(task, binary, args, this.outputHandler, logger.step("SPAWN"));
				const outputStreams = await this.handleTaskData(task, args, raw, logger.step("HANDLE"));
				logger(`passing response to task's parser as a %s`, task.format);
				if (isBufferTask(task)) return callTaskParser(task.parser, outputStreams);
				return callTaskParser(task.parser, outputStreams.asStrings());
			}
			async attemptEmptyTask(task, logger) {
				logger(`empty task bypassing child process to call to task's parser`);
				return task.parser(this);
			}
			handleTaskData(task, args, result, logger) {
				const { exitCode, rejection, stdOut, stdErr } = result;
				return new Promise((done, fail) => {
					logger(`Preparing to handle process response exitCode=%d stdOut=`, exitCode);
					const { error } = this._plugins.exec("task.error", { error: rejection }, {
						...pluginContext(task, args),
						...result
					});
					if (error && task.onError) {
						logger.info(`exitCode=%s handling with custom error handler`);
						return task.onError(result, error, (newStdOut) => {
							logger.info(`custom error handler treated as success`);
							logger(`custom error returned a %s`, objectToString(newStdOut));
							done(new GitOutputStreams(Array.isArray(newStdOut) ? Buffer.concat(newStdOut) : newStdOut, Buffer.concat(stdErr)));
						}, fail);
					}
					if (error) {
						logger.info(`handling as error: exitCode=%s stdErr=%s rejection=%o`, exitCode, stdErr.length, rejection);
						return fail(error);
					}
					logger.info(`retrieving task output complete`);
					done(new GitOutputStreams(Buffer.concat(stdOut), Buffer.concat(stdErr)));
				});
			}
			async gitResponse(task, command, args, outputHandler, logger) {
				const outputLogger = logger.sibling("output");
				const spawnOptions = this._plugins.exec("spawn.options", {
					cwd: this.cwd,
					env: this.env,
					windowsHide: true
				}, pluginContext(task, task.commands));
				return new Promise((done) => {
					const stdOut = [];
					const stdErr = [];
					logger.info(`%s %o`, command, args);
					logger("%O", spawnOptions);
					let rejection = this._beforeSpawn(task, args);
					if (rejection) return done({
						stdOut,
						stdErr,
						exitCode: 9901,
						rejection
					});
					this._plugins.exec("spawn.before", void 0, {
						...pluginContext(task, args),
						kill(reason) {
							rejection = reason || rejection;
						}
					});
					const spawned = spawn(command, args, spawnOptions);
					spawned.stdout.on("data", onDataReceived(stdOut, "stdOut", logger, outputLogger.step("stdOut")));
					spawned.stderr.on("data", onDataReceived(stdErr, "stdErr", logger, outputLogger.step("stdErr")));
					spawned.on("error", onErrorReceived(stdErr, logger));
					if (outputHandler) {
						logger(`Passing child process stdOut/stdErr to custom outputHandler`);
						outputHandler(command, spawned.stdout, spawned.stderr, [...args]);
					}
					this._plugins.exec("spawn.after", void 0, {
						...pluginContext(task, args),
						spawned,
						close(exitCode, reason) {
							done({
								stdOut,
								stdErr,
								exitCode,
								rejection: rejection || reason
							});
						},
						kill(reason) {
							if (spawned.killed) return;
							rejection = reason;
							spawned.kill("SIGINT");
						}
					});
				});
			}
			_beforeSpawn(task, args) {
				let rejection;
				this._plugins.exec("spawn.before", void 0, {
					...pluginContext(task, args),
					kill(reason) {
						rejection = reason || rejection;
					}
				});
				return rejection;
			}
		};
	} });
	git_executor_exports = {};
	__export(git_executor_exports, { GitExecutor: () => GitExecutor });
	init_git_executor = __esm({ "src/lib/runners/git-executor.ts"() {
		"use strict";
		init_git_executor_chain();
		GitExecutor = class {
			constructor(cwd, _scheduler, _plugins) {
				this.cwd = cwd;
				this._scheduler = _scheduler;
				this._plugins = _plugins;
				this._chain = new GitExecutorChain(this, this._scheduler, this._plugins);
			}
			chain() {
				return new GitExecutorChain(this, this._scheduler, this._plugins);
			}
			push(task) {
				return this._chain.push(task);
			}
		};
	} });
	init_task_callback = __esm({ "src/lib/task-callback.ts"() {
		"use strict";
		init_git_response_error();
		init_utils();
	} });
	init_change_working_directory = __esm({ "src/lib/tasks/change-working-directory.ts"() {
		"use strict";
		init_utils();
		init_task();
	} });
	init_checkout = __esm({ "src/lib/tasks/checkout.ts"() {
		"use strict";
		init_utils();
		init_task();
	} });
	init_count_objects = __esm({ "src/lib/tasks/count-objects.ts"() {
		"use strict";
		init_utils();
		parser2 = new LineParser(/([a-z-]+): (\d+)$/, (result, [key, value]) => {
			const property = asCamelCase(key);
			if (Object.hasOwn(result, property)) result[property] = asNumber(value);
		});
	} });
	init_parse_commit = __esm({ "src/lib/parsers/parse-commit.ts"() {
		"use strict";
		init_utils();
		parsers = [
			new LineParser(/^\[([^\s]+)( \([^)]+\))? ([^\]]+)/, (result, [branch, root, commit]) => {
				result.branch = branch;
				result.commit = commit;
				result.root = !!root;
			}),
			new LineParser(/\s*Author:\s(.+)/i, (result, [author]) => {
				const parts = author.split("<");
				const email = parts.pop();
				if (!email || !email.includes("@")) return;
				result.author = {
					email: email.substr(0, email.length - 1),
					name: parts.join("<").trim()
				};
			}),
			new LineParser(/(\d+)[^,]*(?:,\s*(\d+)[^,]*)(?:,\s*(\d+))/g, (result, [changes, insertions, deletions]) => {
				result.summary.changes = parseInt(changes, 10) || 0;
				result.summary.insertions = parseInt(insertions, 10) || 0;
				result.summary.deletions = parseInt(deletions, 10) || 0;
			}),
			new LineParser(/^(\d+)[^,]*(?:,\s*(\d+)[^(]+\(([+-]))?/, (result, [changes, lines, direction]) => {
				result.summary.changes = parseInt(changes, 10) || 0;
				const count = parseInt(lines, 10) || 0;
				if (direction === "-") result.summary.deletions = count;
				else if (direction === "+") result.summary.insertions = count;
			})
		];
	} });
	init_commit = __esm({ "src/lib/tasks/commit.ts"() {
		"use strict";
		init_parse_commit();
		init_utils();
		init_task();
	} });
	init_first_commit = __esm({ "src/lib/tasks/first-commit.ts"() {
		"use strict";
		init_utils();
		init_task();
	} });
	init_hash_object = __esm({ "src/lib/tasks/hash-object.ts"() {
		"use strict";
		init_task();
	} });
	init_InitSummary = __esm({ "src/lib/responses/InitSummary.ts"() {
		"use strict";
		InitSummary = class {
			constructor(bare, path, existing, gitDir) {
				this.bare = bare;
				this.path = path;
				this.existing = existing;
				this.gitDir = gitDir;
			}
		};
		initResponseRegex = /^Init.+ repository in (.+)$/;
		reInitResponseRegex = /^Rein.+ in (.+)$/;
	} });
	init_init = __esm({ "src/lib/tasks/init.ts"() {
		"use strict";
		init_InitSummary();
		bareCommand = "--bare";
	} });
	init_log_format = __esm({ "src/lib/args/log-format.ts"() {
		"use strict";
		logFormatRegex = /^--(stat|numstat|name-only|name-status)(=|$)/;
	} });
	init_DiffSummary = __esm({ "src/lib/responses/DiffSummary.ts"() {
		"use strict";
		DiffSummary = class {
			constructor() {
				this.changed = 0;
				this.deletions = 0;
				this.insertions = 0;
				this.files = [];
			}
		};
	} });
	init_parse_diff_summary = __esm({ "src/lib/parsers/parse-diff-summary.ts"() {
		"use strict";
		init_log_format();
		init_DiffSummary();
		init_diff_name_status();
		init_utils();
		statParser = [
			new LineParser(/^(.+)\s+\|\s+(\d+)(\s+[+\-]+)?$/, (result, [file, changes, alterations = ""]) => {
				result.files.push({
					file: file.trim(),
					changes: asNumber(changes),
					insertions: alterations.replace(/[^+]/g, "").length,
					deletions: alterations.replace(/[^-]/g, "").length,
					binary: false
				});
			}),
			new LineParser(/^(.+) \|\s+Bin ([0-9.]+) -> ([0-9.]+) ([a-z]+)/, (result, [file, before, after]) => {
				result.files.push({
					file: file.trim(),
					before: asNumber(before),
					after: asNumber(after),
					binary: true
				});
			}),
			new LineParser(/(\d+) files? changed\s*((?:, \d+ [^,]+){0,2})/, (result, [changed, summary]) => {
				const inserted = /(\d+) i/.exec(summary);
				const deleted = /(\d+) d/.exec(summary);
				result.changed = asNumber(changed);
				result.insertions = asNumber(inserted?.[1]);
				result.deletions = asNumber(deleted?.[1]);
			})
		];
		numStatParser = [new LineParser(/(\d+)\t(\d+)\t(.+)$/, (result, [changesInsert, changesDelete, file]) => {
			const insertions = asNumber(changesInsert);
			const deletions = asNumber(changesDelete);
			result.changed++;
			result.insertions += insertions;
			result.deletions += deletions;
			result.files.push({
				file,
				changes: insertions + deletions,
				insertions,
				deletions,
				binary: false
			});
		}), new LineParser(/-\t-\t(.+)$/, (result, [file]) => {
			result.changed++;
			result.files.push({
				file,
				after: 0,
				before: 0,
				binary: true
			});
		})];
		nameOnlyParser = [new LineParser(/(.+)$/, (result, [file]) => {
			result.changed++;
			result.files.push({
				file,
				changes: 0,
				insertions: 0,
				deletions: 0,
				binary: false
			});
		})];
		nameStatusParser = [new LineParser(/([ACDMRTUXB])([0-9]{0,3})\t(.[^\t]*)(\t(.[^\t]*))?$/, (result, [status, similarity, from, _to, to]) => {
			result.changed++;
			result.files.push({
				file: to ?? from,
				changes: 0,
				insertions: 0,
				deletions: 0,
				binary: false,
				status: orVoid(isDiffNameStatus(status) && status),
				from: orVoid(!!to && from !== to && from),
				similarity: asNumber(similarity)
			});
		})];
		diffSummaryParsers = {
			[""]: statParser,
			["--stat"]: statParser,
			["--numstat"]: numStatParser,
			["--name-status"]: nameStatusParser,
			["--name-only"]: nameOnlyParser
		};
	} });
	init_parse_list_log_summary = __esm({ "src/lib/parsers/parse-list-log-summary.ts"() {
		"use strict";
		init_utils();
		init_parse_diff_summary();
		init_log_format();
		START_BOUNDARY = "òòòòòò ";
		COMMIT_BOUNDARY = " òò";
		SPLITTER = " ò ";
		defaultFieldNames = [
			"hash",
			"date",
			"message",
			"refs",
			"author_name",
			"author_email"
		];
	} });
	diff_exports = {};
	__export(diff_exports, {
		diffSummaryTask: () => diffSummaryTask,
		validateLogFormatConfig: () => validateLogFormatConfig
	});
	init_diff = __esm({ "src/lib/tasks/diff.ts"() {
		"use strict";
		init_log_format();
		init_parse_diff_summary();
		init_task();
	} });
	init_log = __esm({ "src/lib/tasks/log.ts"() {
		"use strict";
		init_log_format();
		init_parse_list_log_summary();
		init_utils();
		init_task();
		init_diff();
		excludeOptions = /* @__PURE__ */ ((excludeOptions2) => {
			excludeOptions2[excludeOptions2["--pretty"] = 0] = "--pretty";
			excludeOptions2[excludeOptions2["max-count"] = 1] = "max-count";
			excludeOptions2[excludeOptions2["maxCount"] = 2] = "maxCount";
			excludeOptions2[excludeOptions2["n"] = 3] = "n";
			excludeOptions2[excludeOptions2["file"] = 4] = "file";
			excludeOptions2[excludeOptions2["format"] = 5] = "format";
			excludeOptions2[excludeOptions2["from"] = 6] = "from";
			excludeOptions2[excludeOptions2["to"] = 7] = "to";
			excludeOptions2[excludeOptions2["splitter"] = 8] = "splitter";
			excludeOptions2[excludeOptions2["symmetric"] = 9] = "symmetric";
			excludeOptions2[excludeOptions2["mailMap"] = 10] = "mailMap";
			excludeOptions2[excludeOptions2["multiLine"] = 11] = "multiLine";
			excludeOptions2[excludeOptions2["strictDate"] = 12] = "strictDate";
			return excludeOptions2;
		})(excludeOptions || {});
	} });
	init_MergeSummary = __esm({ "src/lib/responses/MergeSummary.ts"() {
		"use strict";
		MergeSummaryConflict = class {
			constructor(reason, file = null, meta) {
				this.reason = reason;
				this.file = file;
				this.meta = meta;
			}
			toString() {
				return `${this.file}:${this.reason}`;
			}
		};
		MergeSummaryDetail = class {
			constructor() {
				this.conflicts = [];
				this.merges = [];
				this.result = "success";
			}
			get failed() {
				return this.conflicts.length > 0;
			}
			get reason() {
				return this.result;
			}
			toString() {
				if (this.conflicts.length) return `CONFLICTS: ${this.conflicts.join(", ")}`;
				return "OK";
			}
		};
	} });
	init_PullSummary = __esm({ "src/lib/responses/PullSummary.ts"() {
		"use strict";
		PullSummary = class {
			constructor() {
				this.remoteMessages = { all: [] };
				this.created = [];
				this.deleted = [];
				this.files = [];
				this.deletions = {};
				this.insertions = {};
				this.summary = {
					changes: 0,
					deletions: 0,
					insertions: 0
				};
			}
		};
		PullFailedSummary = class {
			constructor() {
				this.remote = "";
				this.hash = {
					local: "",
					remote: ""
				};
				this.branch = {
					local: "",
					remote: ""
				};
				this.message = "";
			}
			toString() {
				return this.message;
			}
		};
	} });
	init_parse_remote_objects = __esm({ "src/lib/parsers/parse-remote-objects.ts"() {
		"use strict";
		init_utils();
		remoteMessagesObjectParsers = [
			new RemoteLineParser(/^remote:\s*(enumerating|counting|compressing) objects: (\d+),/i, (result, [action, count]) => {
				const key = action.toLowerCase();
				const enumeration = objectEnumerationResult(result.remoteMessages);
				Object.assign(enumeration, { [key]: asNumber(count) });
			}),
			new RemoteLineParser(/^remote:\s*(enumerating|counting|compressing) objects: \d+% \(\d+\/(\d+)\),/i, (result, [action, count]) => {
				const key = action.toLowerCase();
				const enumeration = objectEnumerationResult(result.remoteMessages);
				Object.assign(enumeration, { [key]: asNumber(count) });
			}),
			new RemoteLineParser(/total ([^,]+), reused ([^,]+), pack-reused (\d+)/i, (result, [total, reused, packReused]) => {
				const objects = objectEnumerationResult(result.remoteMessages);
				objects.total = asObjectCount(total);
				objects.reused = asObjectCount(reused);
				objects.packReused = asNumber(packReused);
			})
		];
	} });
	init_parse_remote_messages = __esm({ "src/lib/parsers/parse-remote-messages.ts"() {
		"use strict";
		init_utils();
		init_parse_remote_objects();
		parsers2 = [
			new RemoteLineParser(/^remote:\s*(.+)$/, (result, [text]) => {
				result.remoteMessages.all.push(text.trim());
				return false;
			}),
			...remoteMessagesObjectParsers,
			new RemoteLineParser([/create a (?:pull|merge) request/i, /\s(https?:\/\/\S+)$/], (result, [pullRequestUrl]) => {
				result.remoteMessages.pullRequestUrl = pullRequestUrl;
			}),
			new RemoteLineParser([/found (\d+) vulnerabilities.+\(([^)]+)\)/i, /\s(https?:\/\/\S+)$/], (result, [count, summary, url]) => {
				result.remoteMessages.vulnerabilities = {
					count: asNumber(count),
					summary,
					url
				};
			})
		];
		RemoteMessageSummary = class {
			constructor() {
				this.all = [];
			}
		};
	} });
	init_parse_pull = __esm({ "src/lib/parsers/parse-pull.ts"() {
		"use strict";
		init_PullSummary();
		init_utils();
		init_parse_remote_messages();
		FILE_UPDATE_REGEX = /^\s*(.+?)\s+\|\s+\d+\s*(\+*)(-*)/;
		SUMMARY_REGEX = /(\d+)\D+((\d+)\D+\(\+\))?(\D+(\d+)\D+\(-\))?/;
		ACTION_REGEX = /^(create|delete) mode \d+ (.+)/;
		parsers3 = [
			new LineParser(FILE_UPDATE_REGEX, (result, [file, insertions, deletions]) => {
				result.files.push(file);
				if (insertions) result.insertions[file] = insertions.length;
				if (deletions) result.deletions[file] = deletions.length;
			}),
			new LineParser(SUMMARY_REGEX, (result, [changes, , insertions, , deletions]) => {
				if (insertions !== void 0 || deletions !== void 0) {
					result.summary.changes = +changes || 0;
					result.summary.insertions = +insertions || 0;
					result.summary.deletions = +deletions || 0;
					return true;
				}
				return false;
			}),
			new LineParser(ACTION_REGEX, (result, [action, file]) => {
				append(result.files, file);
				append(action === "create" ? result.created : result.deleted, file);
			})
		];
		errorParsers = [
			new LineParser(/^from\s(.+)$/i, (result, [remote]) => void (result.remote = remote)),
			new LineParser(/^fatal:\s(.+)$/, (result, [message]) => void (result.message = message)),
			new LineParser(/([a-z0-9]+)\.\.([a-z0-9]+)\s+(\S+)\s+->\s+(\S+)$/, (result, [hashLocal, hashRemote, branchLocal, branchRemote]) => {
				result.branch.local = branchLocal;
				result.hash.local = hashLocal;
				result.branch.remote = branchRemote;
				result.hash.remote = hashRemote;
			})
		];
		parsePullDetail = (stdOut, stdErr) => {
			return parseStringResponse(new PullSummary(), parsers3, [stdOut, stdErr]);
		};
		parsePullResult = (stdOut, stdErr) => {
			return Object.assign(new PullSummary(), parsePullDetail(stdOut, stdErr), parseRemoteMessages(stdOut, stdErr));
		};
	} });
	init_parse_merge = __esm({ "src/lib/parsers/parse-merge.ts"() {
		"use strict";
		init_MergeSummary();
		init_utils();
		init_parse_pull();
		parsers4 = [
			new LineParser(/^Auto-merging\s+(.+)$/, (summary, [autoMerge]) => {
				summary.merges.push(autoMerge);
			}),
			new LineParser(/^CONFLICT\s+\((.+)\): Merge conflict in (.+)$/, (summary, [reason, file]) => {
				summary.conflicts.push(new MergeSummaryConflict(reason, file));
			}),
			new LineParser(/^CONFLICT\s+\((.+\/delete)\): (.+) deleted in (.+) and/, (summary, [reason, file, deleteRef]) => {
				summary.conflicts.push(new MergeSummaryConflict(reason, file, { deleteRef }));
			}),
			new LineParser(/^CONFLICT\s+\((.+)\):/, (summary, [reason]) => {
				summary.conflicts.push(new MergeSummaryConflict(reason, null));
			}),
			new LineParser(/^Automatic merge failed;\s+(.+)$/, (summary, [result]) => {
				summary.result = result;
			})
		];
		parseMergeResult = (stdOut, stdErr) => {
			return Object.assign(parseMergeDetail(stdOut, stdErr), parsePullResult(stdOut, stdErr));
		};
		parseMergeDetail = (stdOut) => {
			return parseStringResponse(new MergeSummaryDetail(), parsers4, stdOut);
		};
	} });
	init_merge = __esm({ "src/lib/tasks/merge.ts"() {
		"use strict";
		init_git_response_error();
		init_parse_merge();
		init_task();
	} });
	init_parse_push = __esm({ "src/lib/parsers/parse-push.ts"() {
		"use strict";
		init_utils();
		init_parse_remote_messages();
		parsers5 = [
			new LineParser(/^Pushing to (.+)$/, (result, [repo]) => {
				result.repo = repo;
			}),
			new LineParser(/^updating local tracking ref '(.+)'/, (result, [local]) => {
				result.ref = {
					...result.ref || {},
					local
				};
			}),
			new LineParser(/^[=*-]\s+([^:]+):(\S+)\s+\[(.+)]$/, (result, [local, remote, type]) => {
				result.pushed.push(pushResultPushedItem(local, remote, type));
			}),
			new LineParser(/^Branch '([^']+)' set up to track remote branch '([^']+)' from '([^']+)'/, (result, [local, remote, remoteName]) => {
				result.branch = {
					...result.branch || {},
					local,
					remote,
					remoteName
				};
			}),
			new LineParser(/^([^:]+):(\S+)\s+([a-z0-9]+)\.\.([a-z0-9]+)$/, (result, [local, remote, from, to]) => {
				result.update = {
					head: {
						local,
						remote
					},
					hash: {
						from,
						to
					}
				};
			})
		];
		parsePushResult = (stdOut, stdErr) => {
			const pushDetail = parsePushDetail(stdOut, stdErr);
			const responseDetail = parseRemoteMessages(stdOut, stdErr);
			return {
				...pushDetail,
				...responseDetail
			};
		};
		parsePushDetail = (stdOut, stdErr) => {
			return parseStringResponse({ pushed: [] }, parsers5, [stdOut, stdErr]);
		};
	} });
	push_exports = {};
	__export(push_exports, {
		pushTagsTask: () => pushTagsTask,
		pushTask: () => pushTask
	});
	init_push = __esm({ "src/lib/tasks/push.ts"() {
		"use strict";
		init_parse_push();
		init_utils();
	} });
	init_show = __esm({ "src/lib/tasks/show.ts"() {
		"use strict";
		init_utils();
		init_task();
	} });
	init_FileStatusSummary = __esm({ "src/lib/responses/FileStatusSummary.ts"() {
		"use strict";
		fromPathRegex = /^(.+)\0(.+)$/;
		FileStatusSummary = class {
			constructor(path, index, working_dir) {
				this.path = path;
				this.index = index;
				this.working_dir = working_dir;
				if (index === "R" || working_dir === "R") {
					const detail = fromPathRegex.exec(path) || [
						null,
						path,
						path
					];
					this.from = detail[2] || "";
					this.path = detail[1] || "";
				}
			}
		};
	} });
	init_StatusSummary = __esm({ "src/lib/responses/StatusSummary.ts"() {
		"use strict";
		init_utils();
		init_FileStatusSummary();
		StatusSummary = class {
			constructor() {
				this.not_added = [];
				this.conflicted = [];
				this.created = [];
				this.deleted = [];
				this.ignored = void 0;
				this.modified = [];
				this.renamed = [];
				this.files = [];
				this.staged = [];
				this.ahead = 0;
				this.behind = 0;
				this.current = null;
				this.tracking = null;
				this.detached = false;
				this.isClean = () => {
					return !this.files.length;
				};
			}
		};
		parsers6 = new Map([
			parser3(" ", "A", (result, file) => result.created.push(file)),
			parser3(" ", "D", (result, file) => result.deleted.push(file)),
			parser3(" ", "M", (result, file) => result.modified.push(file)),
			parser3("A", " ", (result, file) => {
				result.created.push(file);
				result.staged.push(file);
			}),
			parser3("A", "M", (result, file) => {
				result.created.push(file);
				result.staged.push(file);
				result.modified.push(file);
			}),
			parser3("D", " ", (result, file) => {
				result.deleted.push(file);
				result.staged.push(file);
			}),
			parser3("M", " ", (result, file) => {
				result.modified.push(file);
				result.staged.push(file);
			}),
			parser3("M", "M", (result, file) => {
				result.modified.push(file);
				result.staged.push(file);
			}),
			parser3("R", " ", (result, file) => {
				result.renamed.push(renamedFile(file));
			}),
			parser3("R", "M", (result, file) => {
				const renamed = renamedFile(file);
				result.renamed.push(renamed);
				result.modified.push(renamed.to);
			}),
			parser3("!", "!", (_result, _file) => {
				(_result.ignored = _result.ignored || []).push(_file);
			}),
			parser3("?", "?", (result, file) => result.not_added.push(file)),
			...conflicts("A", "A", "U"),
			...conflicts("D", "D", "U"),
			...conflicts("U", "A", "D", "U"),
			["##", (result, line) => {
				const aheadReg = /ahead (\d+)/;
				const behindReg = /behind (\d+)/;
				const currentReg = /^(.+?(?=(?:\.{3}|\s|$)))/;
				const trackingReg = /\.{3}(\S*)/;
				const onEmptyBranchReg = /\son\s(\S+?)(?=\.{3}|$)/;
				let regexResult = aheadReg.exec(line);
				result.ahead = regexResult && +regexResult[1] || 0;
				regexResult = behindReg.exec(line);
				result.behind = regexResult && +regexResult[1] || 0;
				regexResult = currentReg.exec(line);
				result.current = filterType(regexResult?.[1], filterString, null);
				regexResult = trackingReg.exec(line);
				result.tracking = filterType(regexResult?.[1], filterString, null);
				regexResult = onEmptyBranchReg.exec(line);
				if (regexResult) result.current = filterType(regexResult?.[1], filterString, result.current);
				result.detached = /\(no branch\)/.test(line);
			}]
		]);
		parseStatusSummary = function(text) {
			const lines = text.split(NULL);
			const status = new StatusSummary();
			for (let i = 0, l = lines.length; i < l;) {
				let line = lines[i++].trim();
				if (!line) continue;
				if (line.charAt(0) === "R") line += NULL + (lines[i++] || "");
				splitLine(status, line);
			}
			return status;
		};
	} });
	init_status = __esm({ "src/lib/tasks/status.ts"() {
		"use strict";
		init_StatusSummary();
		ignoredOptions = ["--null", "-z"];
	} });
	init_version = __esm({ "src/lib/tasks/version.ts"() {
		"use strict";
		init_utils();
		NOT_INSTALLED = "installed=false";
		parsers7 = [new LineParser(/version (\d+)\.(\d+)\.(\d+)(?:\s*\((.+)\))?/, (result, [major, minor, patch, agent = ""]) => {
			Object.assign(result, versionResponse(asNumber(major), asNumber(minor), asNumber(patch), agent));
		}), new LineParser(/version (\d+)\.(\d+)\.(\D+)(.+)?$/, (result, [major, minor, patch, agent = ""]) => {
			Object.assign(result, versionResponse(asNumber(major), asNumber(minor), patch, agent));
		})];
	} });
	init_clone = __esm({ "src/lib/tasks/clone.ts"() {
		"use strict";
		init_task();
		init_utils();
		cloneTask = (repo, directory, customArgs) => {
			const commands = ["clone", ...customArgs];
			filterString(repo) && commands.push(c$1(repo));
			filterString(directory) && commands.push(c$1(directory));
			return straightThroughStringTask(commands);
		};
		cloneMirrorTask = (repo, directory, customArgs) => {
			append(customArgs, "--mirror");
			return cloneTask(repo, directory, customArgs);
		};
	} });
	simple_git_api_exports = {};
	__export(simple_git_api_exports, { SimpleGitApi: () => SimpleGitApi });
	init_simple_git_api = __esm({ "src/lib/simple-git-api.ts"() {
		"use strict";
		init_task_callback();
		init_change_working_directory();
		init_checkout();
		init_count_objects();
		init_commit();
		init_config();
		init_first_commit();
		init_grep();
		init_hash_object();
		init_init();
		init_log();
		init_merge();
		init_push();
		init_show();
		init_status();
		init_task();
		init_version();
		init_utils();
		init_clone();
		SimpleGitApi = class {
			constructor(_executor) {
				this._executor = _executor;
			}
			_runTask(task, then) {
				const chain = this._executor.chain();
				const promise = chain.push(task);
				if (then) taskCallback(task, promise, then);
				return Object.create(this, {
					then: { value: promise.then.bind(promise) },
					catch: { value: promise.catch.bind(promise) },
					_executor: { value: chain }
				});
			}
			add(files) {
				return this._runTask(straightThroughStringTask(["add", ...asArray(files)]), trailingFunctionArgument(arguments));
			}
			cwd(directory) {
				const next = trailingFunctionArgument(arguments);
				if (typeof directory === "string") return this._runTask(changeWorkingDirectoryTask(directory, this._executor), next);
				if (typeof directory?.path === "string") return this._runTask(changeWorkingDirectoryTask(directory.path, directory.root && this._executor || void 0), next);
				return this._runTask(configurationErrorTask("Git.cwd: workingDirectory must be supplied as a string"), next);
			}
			hashObject(path, write) {
				return this._runTask(hashObjectTask(path, write === true), trailingFunctionArgument(arguments));
			}
			init(bare) {
				return this._runTask(initTask(bare === true, this._executor.cwd, getTrailingOptions(arguments)), trailingFunctionArgument(arguments));
			}
			merge() {
				return this._runTask(mergeTask(getTrailingOptions(arguments)), trailingFunctionArgument(arguments));
			}
			mergeFromTo(remote, branch) {
				if (!(filterString(remote) && filterString(branch))) return this._runTask(configurationErrorTask(`Git.mergeFromTo requires that the 'remote' and 'branch' arguments are supplied as strings`));
				return this._runTask(mergeTask([
					remote,
					branch,
					...getTrailingOptions(arguments)
				]), trailingFunctionArgument(arguments, false));
			}
			outputHandler(handler) {
				this._executor.outputHandler = handler;
				return this;
			}
			push() {
				const task = pushTask({
					remote: filterType(arguments[0], filterString),
					branch: filterType(arguments[1], filterString)
				}, getTrailingOptions(arguments));
				return this._runTask(task, trailingFunctionArgument(arguments));
			}
			stash() {
				return this._runTask(straightThroughStringTask(["stash", ...getTrailingOptions(arguments)]), trailingFunctionArgument(arguments));
			}
			status() {
				return this._runTask(statusTask(getTrailingOptions(arguments)), trailingFunctionArgument(arguments));
			}
		};
		Object.assign(SimpleGitApi.prototype, checkout_default(), clone_default(), commit_default(), config_default(), count_objects_default(), first_commit_default(), grep_default(), log_default(), show_default(), version_default());
	} });
	scheduler_exports = {};
	__export(scheduler_exports, { Scheduler: () => Scheduler });
	init_scheduler = __esm({ "src/lib/runners/scheduler.ts"() {
		"use strict";
		init_utils();
		init_git_logger();
		createScheduledTask = /* @__PURE__ */ (() => {
			let id = 0;
			return () => {
				id++;
				const { promise, done } = (0, import_dist$1.createDeferred)();
				return {
					promise,
					done,
					id
				};
			};
		})();
		Scheduler = class {
			constructor(concurrency = 2) {
				this.concurrency = concurrency;
				this.logger = createLogger("", "scheduler");
				this.pending = [];
				this.running = [];
				this.logger(`Constructed, concurrency=%s`, concurrency);
			}
			schedule() {
				if (!this.pending.length || this.running.length >= this.concurrency) {
					this.logger(`Schedule attempt ignored, pending=%s running=%s concurrency=%s`, this.pending.length, this.running.length, this.concurrency);
					return;
				}
				const task = append(this.running, this.pending.shift());
				this.logger(`Attempting id=%s`, task.id);
				task.done(() => {
					this.logger(`Completing id=`, task.id);
					remove(this.running, task);
					this.schedule();
				});
			}
			next() {
				const { promise, id } = append(this.pending, createScheduledTask());
				this.logger(`Scheduling id=%s`, id);
				this.schedule();
				return promise;
			}
		};
	} });
	apply_patch_exports = {};
	__export(apply_patch_exports, { applyPatchTask: () => applyPatchTask });
	init_apply_patch = __esm({ "src/lib/tasks/apply-patch.ts"() {
		"use strict";
		init_task();
	} });
	init_BranchDeleteSummary = __esm({ "src/lib/responses/BranchDeleteSummary.ts"() {
		"use strict";
		BranchDeletionBatch = class {
			constructor() {
				this.all = [];
				this.branches = {};
				this.errors = [];
			}
			get success() {
				return !this.errors.length;
			}
		};
	} });
	init_parse_branch_delete = __esm({ "src/lib/parsers/parse-branch-delete.ts"() {
		"use strict";
		init_BranchDeleteSummary();
		init_utils();
		deleteSuccessRegex = /(\S+)\s+\(\S+\s([^)]+)\)/;
		deleteErrorRegex = /^error[^']+'([^']+)'/m;
		parsers8 = [new LineParser(deleteSuccessRegex, (result, [branch, hash]) => {
			const deletion = branchDeletionSuccess(branch, hash);
			result.all.push(deletion);
			result.branches[branch] = deletion;
		}), new LineParser(deleteErrorRegex, (result, [branch]) => {
			const deletion = branchDeletionFailure(branch);
			result.errors.push(deletion);
			result.all.push(deletion);
			result.branches[branch] = deletion;
		})];
		parseBranchDeletions = (stdOut, stdErr) => {
			return parseStringResponse(new BranchDeletionBatch(), parsers8, [stdOut, stdErr]);
		};
	} });
	init_BranchSummary = __esm({ "src/lib/responses/BranchSummary.ts"() {
		"use strict";
		BranchSummaryResult = class {
			constructor() {
				this.all = [];
				this.branches = {};
				this.current = "";
				this.detached = false;
			}
			push(status, detached, name, commit, label) {
				if (status === "*") {
					this.detached = detached;
					this.current = name;
				}
				this.all.push(name);
				this.branches[name] = {
					current: status === "*",
					linkedWorkTree: status === "+",
					name,
					commit,
					label
				};
			}
		};
	} });
	init_parse_branch = __esm({ "src/lib/parsers/parse-branch.ts"() {
		"use strict";
		init_BranchSummary();
		init_utils();
		parsers9 = [new LineParser(/^([*+]\s)?\((?:HEAD )?detached (?:from|at) (\S+)\)\s+([a-z0-9]+)\s(.*)$/, (result, [current, name, commit, label]) => {
			result.push(branchStatus(current), true, name, commit, label);
		}), new LineParser(/^([*+]\s)?(\S+)\s+([a-z0-9]+)\s?(.*)$/s, (result, [current, name, commit, label]) => {
			result.push(branchStatus(current), false, name, commit, label);
		})];
		currentBranchParser = new LineParser(/^(\S+)$/s, (result, [name]) => {
			result.push("*", false, name, "", "");
		});
	} });
	branch_exports = {};
	__export(branch_exports, {
		branchLocalTask: () => branchLocalTask,
		branchTask: () => branchTask,
		containsDeleteBranchCommand: () => containsDeleteBranchCommand,
		deleteBranchTask: () => deleteBranchTask,
		deleteBranchesTask: () => deleteBranchesTask
	});
	init_branch = __esm({ "src/lib/tasks/branch.ts"() {
		"use strict";
		init_git_response_error();
		init_parse_branch_delete();
		init_parse_branch();
		init_utils();
	} });
	init_CheckIgnore = __esm({ "src/lib/responses/CheckIgnore.ts"() {
		"use strict";
		parseCheckIgnore = (text) => {
			return text.split(/\n/g).map(toPath).filter(Boolean);
		};
	} });
	check_ignore_exports = {};
	__export(check_ignore_exports, { checkIgnoreTask: () => checkIgnoreTask });
	init_check_ignore = __esm({ "src/lib/tasks/check-ignore.ts"() {
		"use strict";
		init_CheckIgnore();
	} });
	init_parse_fetch = __esm({ "src/lib/parsers/parse-fetch.ts"() {
		"use strict";
		init_utils();
		parsers10 = [
			new LineParser(/From (.+)$/, (result, [remote]) => {
				result.remote = remote;
			}),
			new LineParser(/\* \[new branch]\s+(\S+)\s*-> (.+)$/, (result, [name, tracking]) => {
				result.branches.push({
					name,
					tracking
				});
			}),
			new LineParser(/\* \[new tag]\s+(\S+)\s*-> (.+)$/, (result, [name, tracking]) => {
				result.tags.push({
					name,
					tracking
				});
			}),
			new LineParser(/- \[deleted]\s+\S+\s*-> (.+)$/, (result, [tracking]) => {
				result.deleted.push({ tracking });
			}),
			new LineParser(/\s*([^.]+)\.\.(\S+)\s+(\S+)\s*-> (.+)$/, (result, [from, to, name, tracking]) => {
				result.updated.push({
					name,
					tracking,
					to,
					from
				});
			})
		];
	} });
	fetch_exports = {};
	__export(fetch_exports, { fetchTask: () => fetchTask });
	init_fetch = __esm({ "src/lib/tasks/fetch.ts"() {
		"use strict";
		init_parse_fetch();
		init_task();
	} });
	init_parse_move = __esm({ "src/lib/parsers/parse-move.ts"() {
		"use strict";
		init_utils();
		parsers11 = [new LineParser(/^Renaming (.+) to (.+)$/, (result, [from, to]) => {
			result.moves.push({
				from,
				to
			});
		})];
	} });
	move_exports = {};
	__export(move_exports, { moveTask: () => moveTask });
	init_move = __esm({ "src/lib/tasks/move.ts"() {
		"use strict";
		init_parse_move();
		init_utils();
	} });
	pull_exports = {};
	__export(pull_exports, { pullTask: () => pullTask });
	init_pull = __esm({ "src/lib/tasks/pull.ts"() {
		"use strict";
		init_git_response_error();
		init_parse_pull();
		init_utils();
	} });
	init_GetRemoteSummary = __esm({ "src/lib/responses/GetRemoteSummary.ts"() {
		"use strict";
		init_utils();
	} });
	remote_exports = {};
	__export(remote_exports, {
		addRemoteTask: () => addRemoteTask,
		getRemotesTask: () => getRemotesTask,
		listRemotesTask: () => listRemotesTask,
		remoteTask: () => remoteTask,
		removeRemoteTask: () => removeRemoteTask
	});
	init_remote = __esm({ "src/lib/tasks/remote.ts"() {
		"use strict";
		init_GetRemoteSummary();
		init_task();
	} });
	stash_list_exports = {};
	__export(stash_list_exports, { stashListTask: () => stashListTask });
	init_stash_list = __esm({ "src/lib/tasks/stash-list.ts"() {
		"use strict";
		init_log_format();
		init_parse_list_log_summary();
		init_diff();
		init_log();
	} });
	sub_module_exports = {};
	__export(sub_module_exports, {
		addSubModuleTask: () => addSubModuleTask,
		initSubModuleTask: () => initSubModuleTask,
		subModuleTask: () => subModuleTask,
		updateSubModuleTask: () => updateSubModuleTask
	});
	init_sub_module = __esm({ "src/lib/tasks/sub-module.ts"() {
		"use strict";
		init_task();
	} });
	init_TagList = __esm({ "src/lib/responses/TagList.ts"() {
		"use strict";
		TagList = class {
			constructor(all, latest) {
				this.all = all;
				this.latest = latest;
			}
		};
		parseTagList = function(data, customSort = false) {
			const tags = data.split("\n").map(trimmed).filter(Boolean);
			if (!customSort) tags.sort(function(tagA, tagB) {
				const partsA = tagA.split(".");
				const partsB = tagB.split(".");
				if (partsA.length === 1 || partsB.length === 1) return singleSorted(toNumber(partsA[0]), toNumber(partsB[0]));
				for (let i = 0, l = Math.max(partsA.length, partsB.length); i < l; i++) {
					const diff = sorted(toNumber(partsA[i]), toNumber(partsB[i]));
					if (diff) return diff;
				}
				return 0;
			});
			const latest = customSort ? tags[0] : [...tags].reverse().find((tag) => tag.indexOf(".") >= 0);
			return new TagList(tags, latest);
		};
	} });
	tag_exports = {};
	__export(tag_exports, {
		addAnnotatedTagTask: () => addAnnotatedTagTask,
		addTagTask: () => addTagTask,
		tagListTask: () => tagListTask
	});
	init_tag = __esm({ "src/lib/tasks/tag.ts"() {
		"use strict";
		init_TagList();
	} });
	require_git = __commonJS({ "src/git.js"(exports, module) {
		"use strict";
		var { GitExecutor: GitExecutor2 } = (init_git_executor(), __toCommonJS(git_executor_exports));
		var { SimpleGitApi: SimpleGitApi2 } = (init_simple_git_api(), __toCommonJS(simple_git_api_exports));
		var { Scheduler: Scheduler2 } = (init_scheduler(), __toCommonJS(scheduler_exports));
		var { adhocExecTask: adhocExecTask2, configurationErrorTask: configurationErrorTask2 } = (init_task(), __toCommonJS(task_exports));
		var { asArray: asArray2, filterArray: filterArray2, filterPrimitives: filterPrimitives2, filterString: filterString2, filterStringOrStringArray: filterStringOrStringArray2, filterType: filterType2, getTrailingOptions: getTrailingOptions2, trailingFunctionArgument: trailingFunctionArgument2, trailingOptionsArgument: trailingOptionsArgument2 } = (init_utils(), __toCommonJS(utils_exports));
		var { applyPatchTask: applyPatchTask2 } = (init_apply_patch(), __toCommonJS(apply_patch_exports));
		var { branchTask: branchTask2, branchLocalTask: branchLocalTask2, deleteBranchesTask: deleteBranchesTask2, deleteBranchTask: deleteBranchTask2 } = (init_branch(), __toCommonJS(branch_exports));
		var { checkIgnoreTask: checkIgnoreTask2 } = (init_check_ignore(), __toCommonJS(check_ignore_exports));
		var { checkIsRepoTask: checkIsRepoTask2 } = (init_check_is_repo(), __toCommonJS(check_is_repo_exports));
		var { cleanWithOptionsTask: cleanWithOptionsTask2, isCleanOptionsArray: isCleanOptionsArray2 } = (init_clean(), __toCommonJS(clean_exports));
		var { diffSummaryTask: diffSummaryTask2 } = (init_diff(), __toCommonJS(diff_exports));
		var { fetchTask: fetchTask2 } = (init_fetch(), __toCommonJS(fetch_exports));
		var { moveTask: moveTask2 } = (init_move(), __toCommonJS(move_exports));
		var { pullTask: pullTask2 } = (init_pull(), __toCommonJS(pull_exports));
		var { pushTagsTask: pushTagsTask2 } = (init_push(), __toCommonJS(push_exports));
		var { addRemoteTask: addRemoteTask2, getRemotesTask: getRemotesTask2, listRemotesTask: listRemotesTask2, remoteTask: remoteTask2, removeRemoteTask: removeRemoteTask2 } = (init_remote(), __toCommonJS(remote_exports));
		var { getResetMode: getResetMode2, resetTask: resetTask2 } = (init_reset(), __toCommonJS(reset_exports));
		var { stashListTask: stashListTask2 } = (init_stash_list(), __toCommonJS(stash_list_exports));
		var { addSubModuleTask: addSubModuleTask2, initSubModuleTask: initSubModuleTask2, subModuleTask: subModuleTask2, updateSubModuleTask: updateSubModuleTask2 } = (init_sub_module(), __toCommonJS(sub_module_exports));
		var { addAnnotatedTagTask: addAnnotatedTagTask2, addTagTask: addTagTask2, tagListTask: tagListTask2 } = (init_tag(), __toCommonJS(tag_exports));
		var { straightThroughBufferTask: straightThroughBufferTask2, straightThroughStringTask: straightThroughStringTask2 } = (init_task(), __toCommonJS(task_exports));
		function Git2(options, plugins) {
			this._plugins = plugins;
			this._executor = new GitExecutor2(options.baseDir, new Scheduler2(options.maxConcurrentProcesses), plugins);
			this._trimmed = options.trimmed;
		}
		(Git2.prototype = Object.create(SimpleGitApi2.prototype)).constructor = Git2;
		Git2.prototype.customBinary = function(command) {
			this._plugins.reconfigure("binary", command);
			return this;
		};
		Git2.prototype.env = function(name, value) {
			if (arguments.length === 1 && typeof name === "object") this._executor.env = name;
			else (this._executor.env = this._executor.env || {})[name] = value;
			return this;
		};
		Git2.prototype.stashList = function(options) {
			return this._runTask(stashListTask2(trailingOptionsArgument2(arguments) || {}, filterArray2(options) && options || []), trailingFunctionArgument2(arguments));
		};
		Git2.prototype.mv = function(from, to) {
			return this._runTask(moveTask2(from, to), trailingFunctionArgument2(arguments));
		};
		Git2.prototype.checkoutLatestTag = function(then) {
			var git = this;
			return this.pull(function() {
				git.tags(function(err, tags) {
					git.checkout(tags.latest, then);
				});
			});
		};
		Git2.prototype.pull = function(remote, branch, options, then) {
			return this._runTask(pullTask2(filterType2(remote, filterString2), filterType2(branch, filterString2), getTrailingOptions2(arguments)), trailingFunctionArgument2(arguments));
		};
		Git2.prototype.fetch = function(remote, branch) {
			return this._runTask(fetchTask2(filterType2(remote, filterString2), filterType2(branch, filterString2), getTrailingOptions2(arguments)), trailingFunctionArgument2(arguments));
		};
		Git2.prototype.silent = function(silence) {
			return this._runTask(adhocExecTask2(() => console.warn("simple-git deprecation notice: git.silent: logging should be configured using the `debug` library / `DEBUG` environment variable, this method will be removed.")));
		};
		Git2.prototype.tags = function(options, then) {
			return this._runTask(tagListTask2(getTrailingOptions2(arguments)), trailingFunctionArgument2(arguments));
		};
		Git2.prototype.rebase = function() {
			return this._runTask(straightThroughStringTask2(["rebase", ...getTrailingOptions2(arguments)]), trailingFunctionArgument2(arguments));
		};
		Git2.prototype.reset = function(mode) {
			return this._runTask(resetTask2(getResetMode2(mode), getTrailingOptions2(arguments)), trailingFunctionArgument2(arguments));
		};
		Git2.prototype.revert = function(commit) {
			const next = trailingFunctionArgument2(arguments);
			if (typeof commit !== "string") return this._runTask(configurationErrorTask2("Commit must be a string"), next);
			return this._runTask(straightThroughStringTask2([
				"revert",
				...getTrailingOptions2(arguments, 0, true),
				commit
			]), next);
		};
		Git2.prototype.addTag = function(name) {
			const task = typeof name === "string" ? addTagTask2(name) : configurationErrorTask2("Git.addTag requires a tag name");
			return this._runTask(task, trailingFunctionArgument2(arguments));
		};
		Git2.prototype.addAnnotatedTag = function(tagName, tagMessage) {
			return this._runTask(addAnnotatedTagTask2(tagName, tagMessage), trailingFunctionArgument2(arguments));
		};
		Git2.prototype.deleteLocalBranch = function(branchName, forceDelete, then) {
			return this._runTask(deleteBranchTask2(branchName, typeof forceDelete === "boolean" ? forceDelete : false), trailingFunctionArgument2(arguments));
		};
		Git2.prototype.deleteLocalBranches = function(branchNames, forceDelete, then) {
			return this._runTask(deleteBranchesTask2(branchNames, typeof forceDelete === "boolean" ? forceDelete : false), trailingFunctionArgument2(arguments));
		};
		Git2.prototype.branch = function(options, then) {
			return this._runTask(branchTask2(getTrailingOptions2(arguments)), trailingFunctionArgument2(arguments));
		};
		Git2.prototype.branchLocal = function(then) {
			return this._runTask(branchLocalTask2(), trailingFunctionArgument2(arguments));
		};
		Git2.prototype.raw = function(commands) {
			const createRestCommands = !Array.isArray(commands);
			const command = [].slice.call(createRestCommands ? arguments : commands, 0);
			for (let i = 0; i < command.length && createRestCommands; i++) if (!filterPrimitives2(command[i])) {
				command.splice(i, command.length - i);
				break;
			}
			command.push(...getTrailingOptions2(arguments, 0, true));
			var next = trailingFunctionArgument2(arguments);
			if (!command.length) return this._runTask(configurationErrorTask2("Raw: must supply one or more command to execute"), next);
			return this._runTask(straightThroughStringTask2(command, this._trimmed), next);
		};
		Git2.prototype.submoduleAdd = function(repo, path, then) {
			return this._runTask(addSubModuleTask2(repo, path), trailingFunctionArgument2(arguments));
		};
		Git2.prototype.submoduleUpdate = function(args, then) {
			return this._runTask(updateSubModuleTask2(getTrailingOptions2(arguments, true)), trailingFunctionArgument2(arguments));
		};
		Git2.prototype.submoduleInit = function(args, then) {
			return this._runTask(initSubModuleTask2(getTrailingOptions2(arguments, true)), trailingFunctionArgument2(arguments));
		};
		Git2.prototype.subModule = function(options, then) {
			return this._runTask(subModuleTask2(getTrailingOptions2(arguments)), trailingFunctionArgument2(arguments));
		};
		Git2.prototype.listRemote = function() {
			return this._runTask(listRemotesTask2(getTrailingOptions2(arguments)), trailingFunctionArgument2(arguments));
		};
		Git2.prototype.addRemote = function(remoteName, remoteRepo, then) {
			return this._runTask(addRemoteTask2(remoteName, remoteRepo, getTrailingOptions2(arguments)), trailingFunctionArgument2(arguments));
		};
		Git2.prototype.removeRemote = function(remoteName, then) {
			return this._runTask(removeRemoteTask2(remoteName), trailingFunctionArgument2(arguments));
		};
		Git2.prototype.getRemotes = function(verbose, then) {
			return this._runTask(getRemotesTask2(verbose === true), trailingFunctionArgument2(arguments));
		};
		Git2.prototype.remote = function(options, then) {
			return this._runTask(remoteTask2(getTrailingOptions2(arguments)), trailingFunctionArgument2(arguments));
		};
		Git2.prototype.tag = function(options, then) {
			const command = getTrailingOptions2(arguments);
			if (command[0] !== "tag") command.unshift("tag");
			return this._runTask(straightThroughStringTask2(command), trailingFunctionArgument2(arguments));
		};
		Git2.prototype.updateServerInfo = function(then) {
			return this._runTask(straightThroughStringTask2(["update-server-info"]), trailingFunctionArgument2(arguments));
		};
		Git2.prototype.pushTags = function(remote, then) {
			const task = pushTagsTask2({ remote: filterType2(remote, filterString2) }, getTrailingOptions2(arguments));
			return this._runTask(task, trailingFunctionArgument2(arguments));
		};
		Git2.prototype.rm = function(files) {
			return this._runTask(straightThroughStringTask2([
				"rm",
				"-f",
				...asArray2(files)
			]), trailingFunctionArgument2(arguments));
		};
		Git2.prototype.rmKeepLocal = function(files) {
			return this._runTask(straightThroughStringTask2([
				"rm",
				"--cached",
				...asArray2(files)
			]), trailingFunctionArgument2(arguments));
		};
		Git2.prototype.catFile = function(options, then) {
			return this._catFile("utf-8", arguments);
		};
		Git2.prototype.binaryCatFile = function() {
			return this._catFile("buffer", arguments);
		};
		Git2.prototype._catFile = function(format, args) {
			var handler = trailingFunctionArgument2(args);
			var command = ["cat-file"];
			var options = args[0];
			if (typeof options === "string") return this._runTask(configurationErrorTask2("Git.catFile: options must be supplied as an array of strings"), handler);
			if (Array.isArray(options)) command.push.apply(command, options);
			const task = format === "buffer" ? straightThroughBufferTask2(command) : straightThroughStringTask2(command);
			return this._runTask(task, handler);
		};
		Git2.prototype.diff = function(options, then) {
			const task = filterString2(options) ? configurationErrorTask2("git.diff: supplying options as a single string is no longer supported, switch to an array of strings") : straightThroughStringTask2(["diff", ...getTrailingOptions2(arguments)]);
			return this._runTask(task, trailingFunctionArgument2(arguments));
		};
		Git2.prototype.diffSummary = function() {
			return this._runTask(diffSummaryTask2(getTrailingOptions2(arguments, 1)), trailingFunctionArgument2(arguments));
		};
		Git2.prototype.applyPatch = function(patches) {
			const task = !filterStringOrStringArray2(patches) ? configurationErrorTask2(`git.applyPatch requires one or more string patches as the first argument`) : applyPatchTask2(asArray2(patches), getTrailingOptions2([].slice.call(arguments, 1)));
			return this._runTask(task, trailingFunctionArgument2(arguments));
		};
		Git2.prototype.revparse = function() {
			const commands = ["rev-parse", ...getTrailingOptions2(arguments, true)];
			return this._runTask(straightThroughStringTask2(commands, true), trailingFunctionArgument2(arguments));
		};
		Git2.prototype.clean = function(mode, options, then) {
			const usingCleanOptionsArray = isCleanOptionsArray2(mode);
			const cleanMode = usingCleanOptionsArray && mode.join("") || filterType2(mode, filterString2) || "";
			const customArgs = getTrailingOptions2([].slice.call(arguments, usingCleanOptionsArray ? 1 : 0));
			return this._runTask(cleanWithOptionsTask2(cleanMode, customArgs), trailingFunctionArgument2(arguments));
		};
		Git2.prototype.exec = function(then) {
			return this._runTask({
				commands: [],
				format: "utf-8",
				parser() {
					if (typeof then === "function") then();
				}
			});
		};
		Git2.prototype.clearQueue = function() {
			return this._runTask(adhocExecTask2(() => console.warn("simple-git deprecation notice: clearQueue() is deprecated and will be removed, switch to using the abortPlugin instead.")));
		};
		Git2.prototype.checkIgnore = function(pathnames, then) {
			return this._runTask(checkIgnoreTask2(asArray2(filterType2(pathnames, filterStringOrStringArray2, []))), trailingFunctionArgument2(arguments));
		};
		Git2.prototype.checkIsRepo = function(checkType, then) {
			return this._runTask(checkIsRepoTask2(filterType2(checkType, filterString2)), trailingFunctionArgument2(arguments));
		};
		module.exports = Git2;
	} });
	init_git_error();
	GitConstructError = class extends GitError {
		constructor(config, message) {
			super(void 0, message);
			this.config = config;
		}
	};
	init_git_error();
	init_git_error();
	GitPluginError = class extends GitError {
		constructor(task, plugin, message) {
			super(task, message);
			this.task = task;
			this.plugin = plugin;
			Object.setPrototypeOf(this, new.target.prototype);
		}
	};
	init_git_response_error();
	init_task_configuration_error();
	init_check_is_repo();
	init_clean();
	init_config();
	init_diff_name_status();
	init_grep();
	init_reset();
	init_utils();
	init_utils();
	never = (0, import_dist$2.deferred)().promise;
	init_utils();
	WRONG_NUMBER_ERR = `Invalid value supplied for custom binary, requires a single string or an array containing either one or two strings`;
	WRONG_CHARS_ERR = `Invalid value supplied for custom binary, restricted characters must be removed or supply the unsafe.allowUnsafeCustomBinary option`;
	init_git_error();
	init_utils();
	PluginStore = class {
		constructor() {
			this.plugins = /* @__PURE__ */ new Set();
			this.events = new EventEmitter();
		}
		on(type, listener) {
			this.events.on(type, listener);
		}
		reconfigure(type, data) {
			this.events.emit(type, data);
		}
		append(type, action) {
			const plugin = append(this.plugins, {
				type,
				action
			});
			return () => this.plugins.delete(plugin);
		}
		add(plugin) {
			const plugins = [];
			asArray(plugin).forEach((plugin2) => plugin2 && this.plugins.add(append(plugins, plugin2)));
			return () => {
				plugins.forEach((plugin2) => this.plugins.delete(plugin2));
			};
		}
		exec(type, data, context) {
			let output = data;
			const contextual = Object.freeze(Object.create(context));
			for (const plugin of this.plugins) if (plugin.type === type) output = plugin.action(output, contextual);
			return output;
		}
	};
	init_utils();
	init_utils();
	init_utils();
	Git = require_git();
	init_git_response_error();
	simpleGit = gitInstanceFactory;
}));
//#endregion
//#region src/lib/engine/executors/git-transport.ts
var git_transport_exports = /* @__PURE__ */ __exportAll({ defaultGitClientFactory: () => defaultGitClientFactory });
function resolveGitBinary() {
	const fromEnv = process.env.GIT_BINARY?.trim();
	if (fromEnv) return fromEnv;
	const pathEnv = process.env.PATH ?? "";
	for (const dir of pathEnv.split(delimiter)) {
		if (!dir) continue;
		for (const name of ["git", "git.exe"]) {
			const candidate = join(dir, name);
			try {
				accessSync(candidate, constants.X_OK);
				return candidate;
			} catch {}
		}
	}
	for (const candidate of [
		"/usr/bin/git",
		"/bin/git",
		"/usr/local/bin/git"
	]) try {
		accessSync(candidate, constants.X_OK);
		return candidate;
	} catch {}
	throw new Error("Git: system git binary not found (spawn would fail with ENOENT). Install git in the runtime image/host, or set GIT_BINARY to its absolute path.");
}
function str(v, fallback = "") {
	if (v === void 0 || v === null) return fallback;
	return String(v);
}
function isSshCreds(creds) {
	if (!creds) return false;
	return str(creds.privateKey).length > 0;
}
function isHttpsCreds(creds) {
	if (!creds || isSshCreds(creds)) return false;
	return str(creds.username).length > 0 || str(creds.password).length > 0;
}
/** Embed HTTPS username/password into a git remote URL when possible. */
function applyHttpsCredentials(repository, creds) {
	if (!isHttpsCreds(creds) || !creds) return repository;
	try {
		const url = new URL(repository);
		if (url.protocol !== "http:" && url.protocol !== "https:") return repository;
		const username = str(creds.username);
		const password = str(creds.password);
		if (username) url.username = username;
		if (password) url.password = password;
		return url.toString();
	} catch {
		return repository;
	}
}
async function writeTempFile(content, prefix, mode = 384) {
	const path = join(tmpdir(), `${prefix}-${randomBytes(8).toString("hex")}`);
	await promises.writeFile(path, content, {
		mode,
		encoding: "utf8"
	});
	return path;
}
function sanitizedProcessEnv() {
	const out = {};
	for (const [key, value] of Object.entries(process.env)) {
		if (UNSAFE_ENV_KEYS.has(key.toUpperCase())) continue;
		if (/^GIT_CONFIG_(KEY|VALUE)_/i.test(key)) continue;
		out[key] = value;
	}
	return out;
}
async function buildAuthEnv(creds) {
	const baseEnv = {
		...sanitizedProcessEnv(),
		GIT_TERMINAL_PROMPT: "0"
	};
	const tempFiles = [];
	let allowSsh = false;
	let allowAskPass = false;
	const cleanup = async () => {
		await Promise.all(tempFiles.map((f) => promises.unlink(f).catch(() => {})));
	};
	if (!isSshCreds(creds) || !creds) return {
		env: baseEnv,
		cleanup,
		allowSsh,
		allowAskPass
	};
	const privateKey = str(creds.privateKey);
	const passphrase = str(creds.passphrase);
	const keyPath = await writeTempFile(privateKey.endsWith("\n") ? privateKey : `${privateKey}\n`, "openflow-git-key");
	tempFiles.push(keyPath);
	const sshParts = [
		"ssh",
		"-i",
		keyPath,
		"-o",
		"IdentitiesOnly=yes",
		"-o",
		"StrictHostKeyChecking=accept-new"
	];
	if (passphrase) {
		const askpass = await writeTempFile(`#!/bin/sh\nprintf '%s\\n' "$OPENFLOW_GIT_SSH_PASSPHRASE"\n`, "openflow-git-askpass", 448);
		tempFiles.push(askpass);
		baseEnv.OPENFLOW_GIT_SSH_PASSPHRASE = passphrase;
		baseEnv.SSH_ASKPASS = askpass;
		baseEnv.SSH_ASKPASS_REQUIRE = "force";
		baseEnv.DISPLAY = baseEnv.DISPLAY || "openflow:0";
		allowAskPass = true;
	}
	baseEnv.GIT_SSH_COMMAND = sshParts.join(" ");
	allowSsh = true;
	return {
		env: baseEnv,
		cleanup,
		allowSsh,
		allowAskPass
	};
}
function createGit(baseDir, timeoutMs, env, unsafe, binary) {
	return simpleGit({
		baseDir: baseDir || process.cwd(),
		binary,
		maxConcurrentProcesses: 1,
		trimmed: true,
		timeout: { block: timeoutMs },
		unsafe: {
			allowUnsafeCustomBinary: true,
			...unsafe.allowSsh ? { allowUnsafeSshCommand: true } : {},
			...unsafe.allowAskPass ? { allowUnsafeAskPass: true } : {}
		}
	}).env(env);
}
function parseReflog(raw, maxCommits) {
	const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, maxCommits);
	const out = [];
	const re = /^([0-9a-fA-F]+)\s+(\S+):\s*(.*)$/;
	for (const line of lines) {
		const m = line.match(re);
		if (m) out.push({
			hash: m[1],
			selector: m[2],
			message: m[3] ?? ""
		});
		else out.push({
			hash: "",
			selector: "",
			message: line
		});
	}
	return out;
}
function splitPaths(pathsToAdd) {
	const trimmed = pathsToAdd.trim();
	if (!trimmed || trimmed === ".") return ".";
	const parts = trimmed.split(/\s+/).filter(Boolean);
	return parts.length <= 1 ? trimmed : parts;
}
var UNSAFE_ENV_KEYS, defaultGitClientFactory;
var init_git_transport = __esmMin((() => {
	init_esm();
	UNSAFE_ENV_KEYS = /* @__PURE__ */ new Set([
		"EDITOR",
		"GIT_EDITOR",
		"GIT_SEQUENCE_EDITOR",
		"VISUAL",
		"PAGER",
		"GIT_PAGER",
		"GIT_ASKPASS",
		"SSH_ASKPASS",
		"GIT_SSH",
		"GIT_SSH_COMMAND",
		"GIT_PROXY_COMMAND",
		"GIT_EXTERNAL_DIFF",
		"GIT_CONFIG",
		"GIT_CONFIG_GLOBAL",
		"GIT_CONFIG_SYSTEM",
		"GIT_CONFIG_COUNT",
		"GIT_TEMPLATE_DIR",
		"GIT_EXEC_PATH",
		"PREFIX"
	]);
	defaultGitClientFactory = async (credentials, options) => {
		const timeoutMs = Math.max(1e3, Number(options.timeout ?? 1e4) || 1e4);
		const binary = resolveGitBinary();
		const { env, cleanup, allowSsh, allowAskPass } = await buildAuthEnv(credentials);
		const unsafe = {
			allowSsh,
			allowAskPass
		};
		let closed = false;
		const gitAt = (baseDir) => createGit(baseDir, timeoutMs, env, unsafe, binary);
		return {
			async clone(repository, path, cloneOptions) {
				const url = applyHttpsCredentials(repository, cloneOptions.credentials ?? credentials);
				const args = [];
				if (cloneOptions.branch) args.push("--branch", cloneOptions.branch);
				await gitAt().clone(url, path, args);
			},
			async add(repoPath, pathsToAdd) {
				await gitAt(repoPath).add(splitPaths(pathsToAdd));
			},
			async commit(repoPath, message, commitOptions) {
				const git = gitAt(repoPath);
				const hash = str((await git.commit(message, void 0, commitOptions.allowEmpty ? { "--allow-empty": null } : void 0)).commit).replace(/^['"]|['"]$/g, "");
				if (hash) return hash;
				return (await git.revparse(["HEAD"])).trim();
			},
			async push(repoPath, pushOptions) {
				const git = gitAt(repoPath);
				const remote = pushOptions.remote || "origin";
				const branch = pushOptions.branch;
				const pushCreds = pushOptions.credentials ?? credentials;
				if (isHttpsCreds(pushCreds)) try {
					const remoteUrl = (await git.remote(["get-url", remote]))?.trim();
					if (remoteUrl) {
						const authed = applyHttpsCredentials(remoteUrl, pushCreds);
						if (authed !== remoteUrl) await git.remote([
							"set-url",
							remote,
							authed
						]);
					}
				} catch {}
				const args = [];
				if (pushOptions.force) args.push("--force");
				if (branch) await git.push(remote, branch, args);
				else await git.push(remote, void 0, args);
			},
			async log(repoPath, maxCommits) {
				return (await gitAt(repoPath).log({ maxCount: maxCommits })).all.map((e) => ({
					hash: e.hash,
					date: e.date,
					author: e.author_name || e.author_email || "",
					message: (e.message || "").trim()
				}));
			},
			async reflog(repoPath, maxCommits) {
				return parseReflog(await gitAt(repoPath).raw(["reflog", `-n${maxCommits}`]), maxCommits);
			},
			async switchBranch(repoPath, branch, switchOptions) {
				const git = gitAt(repoPath);
				if (switchOptions.create) {
					if (switchOptions.force) await git.checkout(["-B", branch]);
					else await git.checkoutLocalBranch(branch);
					return;
				}
				if (switchOptions.force) await git.checkout(["-f", branch]);
				else await git.checkout(branch);
			},
			async tag(repoPath, action, tagOptions) {
				const git = gitAt(repoPath);
				const name = tagOptions.name ?? "";
				switch (action) {
					case "list": return (await git.tags()).all ?? [];
					case "delete":
						if (!name) throw new Error("Git: tagName is required for tag delete");
						await git.tag(["-d", name]);
						return [];
					default:
						if (!name) throw new Error("Git: tagName is required for tag add");
						if (tagOptions.message) await git.addAnnotatedTag(name, tagOptions.message);
						else await git.addTag(name);
						return [];
				}
			},
			async addConfig(repoPath, key, value) {
				await gitAt(repoPath).addConfig(key, value);
			},
			async close() {
				if (closed) return;
				closed = true;
				await cleanup();
			}
		};
	};
}));
const DEFAULT_FACTORY = async (credentials, options) => {
	const { defaultGitClientFactory } = await Promise.resolve().then(() => (init_git_transport(), git_transport_exports));
	return defaultGitClientFactory(credentials, options);
};
async function createGitClient(credentials, options) {
	return DEFAULT_FACTORY(credentials, options);
}
//#endregion
//#region src/lib/engine/executors/gitTool.ts
const TYPE$1 = "openflow-node-base.gitTool";
async function getClient(ctx) {
	return createGitClient(await ctx.getCredential("gitPassword").catch(() => null) ?? await ctx.getCredential("sshPrivateKey").catch(() => null), { timeout: 3e4 });
}
const gitToolExecutor = async (ctx) => {
	return emitMcpBundle(ctx, {
		type: TYPE$1,
		tools: [
			{
				name: "git_clone",
				description: "Clone a git repository into a path under the workspace root",
				inputSchema: {
					type: "object",
					properties: {
						repository: {
							type: "string",
							description: "Remote URL"
						},
						path: {
							type: "string",
							description: "Destination relative to fsRoot"
						},
						branch: { type: "string" }
					},
					required: ["repository"]
				}
			},
			{
				name: "git_show",
				description: "Read a file from a cloned repo (working tree)",
				inputSchema: {
					type: "object",
					properties: {
						path: {
							type: "string",
							description: "Repo directory relative to fsRoot"
						},
						filePath: {
							type: "string",
							description: "File inside the repo"
						}
					},
					required: ["filePath"]
				}
			},
			{
				name: "git_log",
				description: "List recent commits in a local repo",
				inputSchema: {
					type: "object",
					properties: {
						path: { type: "string" },
						maxCommits: { type: "number" }
					}
				}
			}
		],
		async invoke(toolName, args) {
			const dest = resolveJailPath(requireFsRoot(ctx), String(args.path ?? "repo"));
			if (toolName === "git_clone") {
				const repository = String(args.repository ?? "");
				if (!repository) throw new Error("repository is required");
				assertAllowUrl(ctx, repository);
				const client = await getClient(ctx);
				try {
					await client.clone(repository, dest, { branch: args.branch ? String(args.branch) : void 0 });
				} finally {
					await client.close().catch(() => {});
				}
				return { content: JSON.stringify({
					cloned: dest,
					repository
				}) };
			}
			if (toolName === "git_show") {
				const filePath = String(args.filePath ?? "");
				if (!filePath) throw new Error("filePath is required");
				return { content: await readFile(resolveJailPath(dest, filePath), "utf8") };
			}
			if (toolName === "git_log") {
				const client = await getClient(ctx);
				try {
					const entries = await client.log(dest, Number(args.maxCommits ?? 20) || 20);
					return { content: JSON.stringify(entries) };
				} finally {
					await client.close().catch(() => {});
				}
			}
			throw new Error(`Git tool: unknown tool "${toolName}"`);
		}
	});
};
//#endregion
//#region src/lib/engine/executors/filesystemTool.ts
const TYPE = "openflow-node-base.filesystemTool";
async function walkFiles(root, max = 500) {
	const out = [];
	const queue = [root];
	while (queue.length && out.length < max) {
		const dir = queue.pop();
		const entries = await readdir(dir, { withFileTypes: true });
		for (const e of entries) {
			const full = join(dir, e.name);
			if (e.isDirectory()) {
				if (e.name === "node_modules" || e.name === ".git") continue;
				queue.push(full);
			} else if (e.isFile()) {
				out.push(full);
				if (out.length >= max) break;
			}
		}
	}
	return out;
}
const filesystemToolExecutor = async (ctx) => {
	return emitMcpBundle(ctx, {
		type: TYPE,
		tools: [
			{
				name: "read_file",
				description: "Read a UTF-8 file under the workspace root",
				inputSchema: {
					type: "object",
					properties: { path: {
						type: "string",
						description: "Path relative to fsRoot"
					} },
					required: ["path"]
				}
			},
			{
				name: "list_directory",
				description: "List files under a directory (recursive, skips node_modules/.git)",
				inputSchema: {
					type: "object",
					properties: { path: {
						type: "string",
						description: "Directory relative to fsRoot"
					} }
				}
			},
			{
				name: "search_files",
				description: "Grep file contents under a path",
				inputSchema: {
					type: "object",
					properties: {
						path: { type: "string" },
						pattern: {
							type: "string",
							description: "JavaScript regex"
						}
					},
					required: ["pattern"]
				}
			}
		],
		async invoke(toolName, args) {
			const fsRoot = requireFsRoot(ctx);
			const target = resolveJailPath(fsRoot, String(args.path ?? "."));
			if (toolName === "read_file") {
				if (!(await stat(target)).isFile()) throw new Error("read_file requires a file path");
				return { content: await readFile(target, "utf8") };
			}
			if (toolName === "list_directory") {
				const files = await walkFiles(target);
				return { content: JSON.stringify(files.map((f) => relative(fsRoot, f).replaceAll("\\", "/"))) };
			}
			if (toolName === "search_files") {
				const pattern = String(args.pattern ?? "");
				if (!pattern) throw new Error("pattern is required");
				const re = new RegExp(pattern, "i");
				const files = await walkFiles(target);
				const matches = [];
				for (const file of files) {
					let text;
					try {
						text = await readFile(file, "utf8");
					} catch {
						continue;
					}
					const lines = text.split("\n");
					for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) {
						matches.push({
							path: relative(fsRoot, file).replaceAll("\\", "/"),
							line: i + 1,
							text: lines[i].slice(0, 240)
						});
						if (matches.length >= 80) break;
					}
					if (matches.length >= 80) break;
				}
				return { content: JSON.stringify(matches) };
			}
			throw new Error(`Filesystem tool: unknown tool "${toolName}"`);
		}
	});
};
//#endregion
//#region src/lib/runtime/executors.ts
function register(map, type, executor) {
	for (const key of expandTypeAliases(type)) map[key] = executor;
}
function createLiteExecutorMap() {
	return createRuntimeExecutorMap("lite");
}
function createRuntimeExecutorMap(preset) {
	const map = {};
	register(map, "n8n-nodes-base.manualTrigger", manualTriggerExecutor);
	register(map, "n8n-nodes-base.manualWorkflowTrigger", manualTriggerExecutor);
	register(map, "n8n-nodes-base.start", manualTriggerExecutor);
	register(map, "n8n-nodes-base.set", setExecutor);
	register(map, "n8n-nodes-base.if", ifExecutor);
	register(map, "n8n-nodes-base.switch", switchExecutor);
	register(map, "n8n-nodes-base.merge", mergeExecutor);
	register(map, "n8n-nodes-base.filter", filterExecutor);
	register(map, "n8n-nodes-base.noOp", noopExecutor);
	register(map, "n8n-nodes-base.httpRequest", httpRequestExecutor);
	register(map, "n8n-nodes-base.code", codeExecutor);
	register(map, "n8n-nodes-base.function", codeExecutor);
	register(map, "n8n-nodes-base.functionItem", codeExecutor);
	register(map, "n8n-nodes-base.stickyNote", stickyNoteExecutor);
	if (preset === "harness") {
		register(map, "@n8n/n8n-nodes-langchain.agent", langchainAgentExecutor);
		register(map, "@n8n/n8n-nodes-langchain.lmChatOpenRouter", lmChatOpenRouterExecutor);
		register(map, "n8n-nodes-base.httpRequestTool", httpRequestToolExecutor);
		register(map, "n8n-nodes-base.githubTool", githubToolExecutor);
		register(map, "n8n-nodes-base.executeCommandTool", executeCommandToolExecutor);
		register(map, "n8n-nodes-base.webSearchTool", webSearchToolExecutor);
		register(map, "n8n-nodes-base.gitTool", gitToolExecutor);
		register(map, "n8n-nodes-base.filesystemTool", filesystemToolExecutor);
	}
	return map;
}
//#endregion
//#region src/lib/runtime/errors.ts
var LiteRuntimeError = class extends Error {
	code;
	unsupportedNodes;
	constructor(message, code, unsupportedNodes) {
		super(message);
		this.name = "LiteRuntimeError";
		this.code = code;
		this.unsupportedNodes = unsupportedNodes;
	}
};
//#endregion
//#region src/lib/runtime/url-policy.ts
const BLOCKED_HOSTS = /* @__PURE__ */ new Set([
	"localhost",
	"127.0.0.1",
	"0.0.0.0",
	"::1",
	"metadata.google.internal",
	"169.254.169.254"
]);
function isPrivateIpv4(host) {
	const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
	if (!m) return false;
	const a = Number(m[1]);
	const b = Number(m[2]);
	if (a === 10 || a === 127) return true;
	if (a === 0) return true;
	if (a === 172 && b >= 16 && b <= 31) return true;
	if (a === 192 && b === 168) return true;
	if (a === 169 && b === 254) return true;
	return false;
}
function isBlockedPrivateUrl(url) {
	let parsed;
	try {
		parsed = new URL(url);
	} catch {
		return true;
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return true;
	const host = parsed.hostname.toLowerCase();
	if (BLOCKED_HOSTS.has(host)) return true;
	if (host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
	if (host.startsWith("[") && host.includes("::")) return true;
	return isPrivateIpv4(host);
}
function denyPrivateUrls(url) {
	return !isBlockedPrivateUrl(url);
}
//#endregion
//#region src/lib/runtime/validate.ts
function unsupportedRuntimeNodes(workflow, preset = "lite") {
	return workflow.nodes.filter((n) => !isAllowedType(n.type, preset)).map((n) => ({
		name: n.name,
		type: n.type
	}));
}
function unsupportedLiteNodes(workflow) {
	return unsupportedRuntimeNodes(workflow, "lite");
}
function assertLiteCompatible(workflow, preset = "lite") {
	const unsupported = unsupportedRuntimeNodes(workflow, preset);
	if (unsupported.length === 0) return;
	throw new LiteRuntimeError(`Workflow is not ${preset}-runtime compatible: ${unsupported.map((n) => `${n.name} (${n.type})`).join(", ")}`, "unsupported_nodes", unsupported);
}
function assertToolPolicy(workflow, allowedTools) {
	if (allowedTools === void 0) return;
	const allow = new Set(allowedTools);
	const extras = workflow.nodes.filter((n) => {
		if (n.disabled) return false;
		if (!isHarnessToolType(n.type)) return false;
		return !allow.has(n.type) && !allow.has(toolPolicyKey(n.type));
	});
	if (extras.length === 0) return;
	throw new LiteRuntimeError(`Tool policy rejected: ${extras.map((n) => `${n.name} (${n.type})`).join(", ")}`, "tool_policy", extras.map((n) => ({
		name: n.name,
		type: n.type
	})));
}
//#endregion
//#region src/lib/runtime/serialize.ts
function stripNodeCredentials(node) {
	const creds = node.credentials;
	if (!creds || Object.keys(creds).length === 0) return {
		node,
		slots: []
	};
	const slots = [];
	const kept = {};
	for (const [slot, ref] of Object.entries(creds)) {
		slots.push({
			slot,
			name: ref.name,
			node: node.name,
			id: ref.id
		});
		kept[slot] = { name: ref.name };
	}
	return {
		node: {
			...node,
			credentials: kept
		},
		slots
	};
}
function serializeForRuntime(workflow, preset = "lite") {
	const requiredCredentials = [];
	const nodes = workflow.nodes.map((n) => {
		const { node, slots } = stripNodeCredentials(n);
		requiredCredentials.push(...slots);
		return node;
	});
	const next = {
		...workflow,
		nodes
	};
	const unsupportedNodes = unsupportedRuntimeNodes(next, preset);
	const warnings = [];
	if (unsupportedNodes.length > 0) warnings.push(`${unsupportedNodes.length} node(s) are not supported by the ${preset} runtime`);
	if (requiredCredentials.length > 0) warnings.push(`${requiredCredentials.length} credential slot(s) must be bound by the host`);
	return {
		workflow: next,
		requiredCredentials,
		unsupportedNodes,
		warnings
	};
}
function serializeForRuntimeJson(workflow) {
	return serializeWorkflow(serializeForRuntime(workflow).workflow);
}
//#endregion
//#region src/lib/runtime/create-runtime.ts
function parseInput(workflow) {
	if (typeof workflow !== "string") return workflow;
	const parsed = parseWorkflowJson(workflow);
	if (!parsed.ok || !parsed.workflow) throw new LiteRuntimeError(parsed.error ?? "Invalid workflow JSON", "invalid_workflow");
	return parsed.workflow;
}
function makeResolver(creds) {
	if (!creds) return void 0;
	if (typeof creds === "function") return creds;
	return async (ref) => {
		if (ref.type && creds[ref.type]) return creds[ref.type];
		if (ref.id && creds[ref.id]) return creds[ref.id];
		if (creds[ref.name]) return creds[ref.name];
		return null;
	};
}
function toPinItems(input) {
	if (input == null) return [{ json: {} }];
	if (Array.isArray(input)) return input.map((item) => {
		if (item && typeof item === "object" && "json" in item) return item;
		if (item && typeof item === "object") return { json: item };
		return { json: { value: item } };
	});
	if (typeof input === "object" && input && "json" in input) return [input];
	if (typeof input === "object" && input) return [{ json: input }];
	return [{ json: { value: input } }];
}
function resolveStartName(workflow, preferred) {
	if (preferred) return preferred;
	const trigger = workflow.nodes.find((n) => !n.disabled && LITE_TRIGGER_TYPES.has(n.type));
	if (trigger) return trigger.name;
	return workflow.nodes.find((n) => !n.disabled)?.name ?? null;
}
function createRuntime(options = {}) {
	const preset = options.preset ?? "lite";
	const nodeExecutors = createRuntimeExecutorMap(preset);
	const credentialResolver = makeResolver(options.credentials);
	const allowUrl = options.allowUrl ?? denyPrivateUrls;
	const env = options.env ?? {};
	return {
		supportedTypes() {
			return allowlistForPreset(preset);
		},
		validate(workflow) {
			return serializeForRuntime(parseInput(workflow), preset);
		},
		async run(workflow, runOptions = {}) {
			const parsed = parseInput(workflow);
			assertLiteCompatible(parsed, preset);
			assertToolPolicy(parsed, options.allowedTools);
			const startNode = resolveStartName(parsed, runOptions.startNode);
			const pinData = startNode != null ? { [startNode]: toPinItems(runOptions.input) } : void 0;
			const result = await executeWorkflow({
				workflow: parsed,
				nodeExecutors,
				pinData,
				startNode,
				credentialResolver,
				vars: options.vars,
				env,
				envAllowlist: options.envAllowlist,
				allowUrl,
				fsRoot: options.fsRoot,
				onProgress: runOptions.onProgress
			});
			const missing = Object.entries(result.runData).filter(([, v]) => v.status === "skipped" && v.error?.startsWith("No executor"));
			if (missing.length > 0) {
				const unsupported = unsupportedRuntimeNodes(parsed, preset);
				throw new LiteRuntimeError(`Missing lite executor for: ${missing.map(([n]) => n).join(", ")}`, "missing_executor", unsupported);
			}
			return result;
		}
	};
}
//#endregion
export { HARNESS_NODE_TYPES, LITE_NODE_TYPES, LiteRuntimeError, assertLiteCompatible, createLiteExecutorMap, createRuntime, createRuntimeExecutorMap, denyPrivateUrls, isBlockedPrivateUrl, isHarnessNodeType, isLiteNodeType, normalizeNodeType, parseWorkflowJson, serializeForRuntime, serializeForRuntimeJson, unsupportedLiteNodes };

//# sourceMappingURL=index.js.map