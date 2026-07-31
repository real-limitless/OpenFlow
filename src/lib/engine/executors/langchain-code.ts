import type { NodeExecutor, INodeExecutionData } from "@/sdk";

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
  evalClosure(
    code: string,
    args?: unknown[],
    options?: { result?: { promise?: boolean; copy?: boolean } },
  ): Promise<unknown>;
}

interface IVMGlobal {
  set(key: string, value: unknown): Promise<void>;
  derefInto(): unknown;
}

interface IVMScript {
  run(context: IVMContext, options?: { copy?: boolean }): Promise<unknown>;
}

export const langchainCodeExecutor: NodeExecutor = async (ctx) => {
  const mode = ctx.getParam<string>("mode", "execute");
  const jsCode = ctx.getParam<string>("jsCode", "");
  const outputs = ctx.getParam<string[]>("outputs", ["main"]);

  if (mode === "execute" && !outputs.includes("main")) {
    throw new Error("Execute mode requires a 'main' output channel");
  }
  if (mode === "supplyData" && outputs.includes("main")) {
    throw new Error("Supply Data mode cannot have a 'main' output channel");
  }

  const inputItems = ctx.getInputItems(0);

  let ivm: IVMModule;
  try {
    const mod = (await import(/* @vite-ignore */ "isolated-vm")) as {
      default?: IVMModule;
    } & IVMModule;
    ivm = mod.default ?? mod;
    if (typeof ivm.Isolate !== "function") {
      throw new Error("isolated-vm loaded but Isolate export is missing");
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`LangChain Code node requires isolated-vm (server-side only): ${detail}`);
  }

  const source = inputItems.length > 0 ? inputItems : [{ json: {} }];
  const isolate = new ivm.Isolate();
  const context = await isolate.createContext();

  try {
    await context.global.set("global", context.global.derefInto());

    const payload = {
      items: source.map((item) => ({
        json: item.json ?? {},
        pairedItem: item.pairedItem,
      })),
      outputs,
    };
    await context.global.set("__ofPayload", new ivm.ExternalCopy(payload).copyInto());

    const bootstrap = await isolate.compileScript(`
      const __p = __ofPayload;
      const __items = __p.items;

      globalThis.$input = {
        all: () => __items,
        first: () => __items[0] ?? { json: {} },
        last: () => __items[__items.length - 1] ?? { json: {} },
      };

      globalThis.console = { log: () => {}, warn: () => {}, error: () => {} };

      globalThis.__ofOutputData = [];

      globalThis.__ofHelpers = {
        getInputData: function(inputIndex, inputName) { return __items; },
        getInputConnectionData: async function(inputName, itemIndex, inputIndex) {
          throw new Error("getInputConnectionData: sub-node resolution not implemented in this build");
        },
        addInputData: function(inputName, data) {},
        addOutputData: function(channel, data) { globalThis.__ofOutputData.push({ channel, data }); },
        getNode: function() { return { name: "langchain-code" }; },
        getNodeOutputs: function() { return __p.outputs; },
        getExecutionCancelSignal: function() { return undefined; },
      };

      delete globalThis.__ofPayload;
    `);
    await bootstrap.run(context);

    const wrappedCode = `const __of = globalThis.__ofHelpers; return (function() { ${jsCode} }).call(__of);`;

    const result = await context.evalClosure(wrappedCode, [], {
      result: { promise: true, copy: true },
    });

    const collectedOutput: unknown[] = [];
    try {
      const raw = await context.evalClosure("globalThis.__ofOutputData", [], {
        result: { promise: false, copy: true },
      });
      if (Array.isArray(raw)) {
        for (const entry of raw) {
          const e = entry as { channel: string; data: unknown };
          collectedOutput.push(e.data);
        }
      }
    } catch {
      // no output data collected
    }

    if (mode === "supplyData") {
      return [collectedOutput.length > 0 ? collectedOutput.map((d) => toExecutionData(d)) : normalizeCodeResult(result)];
    }

    return [normalizeCodeResult(result)];
  } finally {
    context.release();
    isolate.dispose();
  }
};

function normalizeCodeResult(result: unknown): INodeExecutionData[] {
  if (result === null || result === undefined) {
    throw new Error("LangChain Code node doesn't return an object");
  }
  if (Array.isArray(result)) {
    return result.map((r) => toExecutionData(r));
  }
  return [toExecutionData(result)];
}

function toExecutionData(value: unknown): INodeExecutionData {
  if (value === null || value === undefined) {
    throw new Error("LangChain Code node doesn't return an object");
  }
  if (value && typeof value === "object" && "json" in value) {
    const item = value as INodeExecutionData;
    if (
      item.json === null ||
      typeof item.json !== "object" ||
      Array.isArray(item.json)
    ) {
      throw new Error("LangChain Code node output 'json' property must be an object");
    }
    return {
      json: item.json as Record<string, unknown>,
      pairedItem: item.pairedItem,
      binary: item.binary,
    };
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return { json: value as Record<string, unknown> };
  }
  return { json: { result: value } };
}