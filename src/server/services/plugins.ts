import { prisma } from "../db";
import {
  BUILTIN_PLUGINS,
  pluginExecutorMap,
  validatePluginManifest,
  type PluginManifest,
} from "../../lib/plugins/manifest";
import { registerDescription, registerExecutor, unregisterType } from "../../lib/engine/node-runtime";

export const PLUGINS_KEY = "plugins.marketplace";

export type PluginSettings = {
  allowPublishers: string[];
  enabledIds: string[];
};

const DEFAULT_SETTINGS: PluginSettings = {
  allowPublishers: ["openflow"],
  enabledIds: ["openflow.hello"],
};

let applied = new Set<string>();

export function parsePluginSettings(raw: unknown): PluginSettings {
  const base: PluginSettings = {
    allowPublishers: [...DEFAULT_SETTINGS.allowPublishers],
    enabledIds: [...DEFAULT_SETTINGS.enabledIds],
  };
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.allowPublishers)) {
      base.allowPublishers = o.allowPublishers.map((x) => String(x).trim()).filter(Boolean);
    }
    if (Array.isArray(o.enabledIds)) {
      base.enabledIds = o.enabledIds.map((x) => String(x).trim()).filter(Boolean);
    }
  }
  return base;
}

export async function getPluginSettings(): Promise<PluginSettings> {
  let stored: unknown;
  try {
    const row = await prisma.instanceSetting.findUnique({ where: { key: PLUGINS_KEY } });
    stored = row?.value ? JSON.parse(row.value) : null;
  } catch {
    stored = null;
  }
  return parsePluginSettings(stored);
}

export async function setPluginSettings(patch: Partial<PluginSettings>): Promise<PluginSettings> {
  const current = await getPluginSettings();
  const next = parsePluginSettings({ ...current, ...patch });
  await prisma.instanceSetting.upsert({
    where: { key: PLUGINS_KEY },
    create: { key: PLUGINS_KEY, value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  });
  applyPluginSettings(next);
  return next;
}

export function catalogPlugins(): PluginManifest[] {
  return BUILTIN_PLUGINS;
}

export function applyPluginSettings(settings: PluginSettings): { enabled: string[]; errors: string[] } {
  const errors: string[] = [];
  const enabled = new Set(settings.enabledIds);
  for (const id of applied) {
    const plugin = catalogPlugins().find((p) => p.id === id);
    if (plugin) {
      for (const node of plugin.nodes) unregisterType(node.type);
    }
  }
  applied = new Set();
  const ok: string[] = [];
  for (const plugin of catalogPlugins()) {
    if (!enabled.has(plugin.id)) continue;
    try {
      const safe = validatePluginManifest(plugin, settings.allowPublishers);
      const execs = pluginExecutorMap(safe);
      for (const node of safe.nodes) {
        const executor = execs[node.type];
        if (executor) registerExecutor(node.type, executor);
        if (node.description) registerDescription(node.description);
      }
      applied.add(plugin.id);
      ok.push(plugin.id);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return { enabled: ok, errors };
}

export async function bootPlugins(): Promise<void> {
  try {
    applyPluginSettings(await getPluginSettings());
  } catch {
    applyPluginSettings(DEFAULT_SETTINGS);
  }
}
