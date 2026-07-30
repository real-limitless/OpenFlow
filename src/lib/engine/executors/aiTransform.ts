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

export const aiTransformExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);

  const instructions = (ctx.getParam<string>("instructions", "") ?? "").trim();
  const codeGeneratedForPrompt = (ctx.getParam<string>("codeGeneratedForPrompt", "") ?? "").trim();
  const aiTransformJsCode = (ctx.getParam<string>("AI_TRANSFORM_JS_CODE", "") ?? "").trim();

  let code = aiTransformJsCode;
  let usedGeneratedCode = false;

  if (!code) {
    if (instructions) {
      throw new Error(
        "Missing code for data transformation — Click the 'Generate code' button to create the code",
      );
    }
    throw new Error(
      "Missing instructions to generate code — Enter your prompt in the 'Instructions' parameter and click 'Generate code'",
    );
  }

  if (codeGeneratedForPrompt && codeGeneratedForPrompt !== instructions) {
    throw new Error(
      "Missing code for data transformation — Click the 'Generate code' button to create the code",
    );
  }

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
    throw new Error(`AI Transform node requires isolated-vm (server-side only): ${detail}`);
  }

  const hasBinaryInput = inputItems.some(
    (item) => item.binary && Object.keys(item.binary).length > 0,
  );

  const result = await runInSandbox(
    ivm,
    code,
    inputItems.length > 0 ? inputItems : [{ json: {} }],
    inputItems[0]?.json ?? {},
    ctx.getParams(),
  );

  const outputItems = normalizeCodeResult(result);

  if (hasBinaryInput) {
    outputItems.push({
      json: {
        _hint: "Input items contain binary data. Use the 'Extract from File' node first to convert binary to JSON before transforming.",
      },
    });
  }

  return [outputItems];
};

function normalizeCodeResult(result: unknown): INodeExecutionData[] {
  if (result === null || result === undefined) {
    throw new Error("AI Transform doesn't return an object");
  }
  if (Array.isArray(result)) {
    return result.map((r) => toExecutionData(r));
  }
  return [toExecutionData(result)];
}

function toExecutionData(value: unknown): INodeExecutionData {
  if (value === null || value === undefined) {
    throw new Error("AI Transform doesn't return an object");
  }

  if (value && typeof value === "object" && "json" in value) {
    const item = value as INodeExecutionData;
    if (
      item.json === null ||
      typeof item.json !== "object" ||
      Array.isArray(item.json)
    ) {
      throw new Error(
        "AI Transform output 'json' property must be an object, not an array or primitive",
      );
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

async function runInSandbox(
  ivm: IVMModule,
  code: string,
  allItems: INodeExecutionData[],
  activeJson: Record<string, unknown>,
  params: Record<string, unknown>,
): Promise<unknown> {
  const isolate = new ivm.Isolate();
  const context = await isolate.createContext();

  try {
    await context.global.set("global", context.global.derefInto());

    const payload = {
      items: allItems.map((item) => ({
        json: item.json ?? {},
        pairedItem: item.pairedItem,
      })),
      activeJson,
      params,
    };
    await context.global.set("__ofPayload", new ivm.ExternalCopy(payload).copyInto());

    const bootstrap = await isolate.compileScript(`
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
    `);
    await bootstrap.run(context);

    return await context.evalClosure(code, [], {
      result: { promise: true, copy: true },
    });
  } finally {
    context.release();
    isolate.dispose();
  }
}