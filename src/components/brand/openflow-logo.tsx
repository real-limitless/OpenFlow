import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  /** When true, draw the dark rounded plate behind the mark (marketing-style). */
  withPlate?: boolean;
  title?: string;
};

/**
 * OpenFlow mark — hub node + flow arcs + branch.
 * Uses currentColor so it picks up text-primary in the app chrome.
 */
export function OpenFlowLogo({
  className,
  withPlate = false,
  title = "OpenFlow",
}: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 40 40"
      fill="none"
      className={cn("shrink-0", className)}
      role="img"
      aria-label={title}
    >
      {withPlate ? (
        <rect width="40" height="40" rx="10" fill="var(--surface-raised, #2a3142)" />
      ) : null}
      <path
        d="M9 20c0-6.075 4.925-11 11-11s11 4.925 11 11"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M13 20c0-3.866 3.134-7 7-7s7 3.134 7 7"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity="0.5"
      />
      <circle cx="20" cy="20" r="3.6" fill="currentColor" />
      <circle cx="9" cy="20" r="2.1" fill="currentColor" />
      <circle cx="31" cy="20" r="2.1" fill="currentColor" />
      <path
        d="M20 23.6v7.2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.75"
      />
      <circle cx="20" cy="32.5" r="2.1" fill="currentColor" opacity="0.85" />
    </svg>
  );
}
