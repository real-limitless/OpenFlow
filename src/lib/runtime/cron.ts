export function isFiveFieldCron(expr: string): boolean {
  return expr.trim().split(/\s+/).length === 5;
}
