export type CompatLevel = "ready" | "partial" | "limited";

/** Source id for OpenFlow-authored certified starter templates. */
export const CERTIFIED_SOURCE_ID = "openflow-certified";

export function isCertifiedTemplate(opts: {
  sourceId: string;
  packId?: string;
  readyToDemo: boolean;
  compatibilityLevel: CompatLevel;
}): boolean {
  const pack = opts.sourceId === CERTIFIED_SOURCE_ID || opts.packId === CERTIFIED_SOURCE_ID;
  return pack && opts.readyToDemo && opts.compatibilityLevel === "ready";
}
