import type { NodeExecutor } from "../types";
import type { INodeExecutionData } from "../../workflow/types";

interface IVMModule {
  Isolate: new () => IIsolate;
  ExternalCopy: new (value: unknown) => { copyInto(): unknown };
}

interface IIsolate {
  createContext(): Promise<IVMContext>;
  compileScript(code: string): Promise<IVMScript>;
  dispose(): void;
}

interface IVMContext {
  global: IVMGlobal;
  release(): void;
}

interface IVMGlobal {
  set(key: string, value: unknown): Promise<void>;
  derefInto(): unknown;
}

interface IVMScript {
  run(context: IVMContext, options?: { copy?: boolean }): Promise<unknown>;
}

export const codeExecutor: NodeExecutor = async (ctx, node) => {
  const inputItems = ctx.getNodeInputItems(node.name, 0);
  const code = (node.parameters.jsCode as string) ?? "";
  const mode = (node.parameters.mode as string) ?? "runOnceForAllItems";

  let ivm: IVMModule;
  try {
    // Dynamic import — native module, resolved from node_modules at runtime
    const mod = (await import(/* @vite-ignore */ "isolated-vm")) as {
      default?: IVMModule;
    } & IVMModule;
    ivm = mod.default ?? mod;
    if (typeof ivm.Isolate !== "function") {
      throw new Error("isolated-vm loaded but Isolate export is missing");
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Code node requires isolated-vm (server-side only): ${detail}`);
  }

  if (mode === "runOnceForEachItem") {
    const outputItems: INodeExecutionData[] = [];
    for (const item of inputItems) {
      const result = await runInSandbox(ivm, code, inputItems, item.json ?? {});
      if (Array.isArray(result)) {
        outputItems.push(...normalizeCodeResult(result));
      } else {
        outputItems.push(toExecutionData(result));
      }
    }
    return [outputItems];
  }

  // runOnceForAllItems
  const firstItem = inputItems[0]?.json ?? {};
  const result = await runInSandbox(ivm, code, inputItems, firstItem);

  return [normalizeCodeResult(result)];
};

function normalizeCodeResult(result: unknown): INodeExecutionData[] {
  if (Array.isArray(result)) {
    return result.map((r) => toExecutionData(r));
  }
  return [toExecutionData(result)];
}

function toExecutionData(value: unknown): INodeExecutionData {
  if (value && typeof value === "object" && "json" in value) {
    const item = value as INodeExecutionData;
    return {
      json:
        item.json && typeof item.json === "object"
          ? (item.json as Record<string, unknown>)
          : { result: item.json },
      pairedItem: item.pairedItem,
      binary: item.binary,
    };
  }
  if (value && typeof value === "object") {
    return { json: value as Record<string, unknown> };
  }
  return { json: { result: value } };
}

async function runInSandbox(
  ivm: IVMModule,
  code: string,
  allItems: INodeExecutionData[],
  activeJson: Record<string, unknown>,
): Promise<unknown> {
  const isolate = new ivm.Isolate();
  const context = await isolate.createContext();

  try {
    await context.global.set("global", context.global.derefInto());

    // ExternalCopy can only transfer plain data — no functions
    const payload = {
      items: allItems.map((item) => ({
        json: item.json ?? {},
        pairedItem: item.pairedItem,
      })),
      activeJson,
    };
    await context.global.set("__ofPayload", new ivm.ExternalCopy(payload).copyInto());

    const bootstrap = await isolate.compileScript(`
      const __items = __ofPayload.items;
      const __active = __ofPayload.activeJson;
      globalThis.$json = __active;
      globalThis.$input = {
        all: () => __items,
        first: () => __items[0] ?? { json: {} },
        last: () => __items[__items.length - 1] ?? { json: {} },
        item: { json: __active },
      };
      globalThis.console = {
        log: (...args) => undefined,
        warn: (...args) => undefined,
        error: (...args) => undefined,
      };
      delete globalThis.__ofPayload;
    `);
    await bootstrap.run(context);

    const wrapped = `
      (function() {
        ${code}
      })()
    `;
    const script = await isolate.compileScript(wrapped);
    return await script.run(context, { copy: true });
  } finally {
    context.release();
    isolate.dispose();
  }
}
