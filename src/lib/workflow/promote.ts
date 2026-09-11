export function canPromoteTo(opts: { actorRole: string; toSlug: string }): boolean {
  if (opts.toSlug === "production") {
    return opts.actorRole === "owner" || opts.actorRole === "admin";
  }
  return true;
}

export function mergeActivation(
  current: unknown,
  environmentId: string,
): string[] {
  const list = Array.isArray(current) ? current.filter((x): x is string => typeof x === "string") : [];
  if (!list.includes(environmentId)) list.push(environmentId);
  return list;
}
