const STORAGE_KEY = "openflow:onboarding.v1";

export type OnboardingState = {
  /** User dismissed the checklist entirely */
  dismissed: boolean;
  /** Sample workflow created from the welcome CTA */
  sampleCreated: boolean;
  /** At least one successful execution marked during onboarding */
  firstRunSuccess: boolean;
  completedAt?: string;
};

const DEFAULT_STATE: OnboardingState = {
  dismissed: false,
  sampleCreated: false,
  firstRunSuccess: false,
};

export function loadOnboardingState(): OnboardingState {
  if (typeof window === "undefined") return { ...DEFAULT_STATE };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw) as Partial<OnboardingState>;
    return {
      dismissed: Boolean(parsed.dismissed),
      sampleCreated: Boolean(parsed.sampleCreated),
      firstRunSuccess: Boolean(parsed.firstRunSuccess),
      completedAt: typeof parsed.completedAt === "string" ? parsed.completedAt : undefined,
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function saveOnboardingState(next: OnboardingState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function patchOnboardingState(patch: Partial<OnboardingState>): OnboardingState {
  const current = loadOnboardingState();
  const next: OnboardingState = { ...current, ...patch };
  if (next.sampleCreated && next.firstRunSuccess && !next.completedAt) {
    next.completedAt = new Date().toISOString();
  }
  saveOnboardingState(next);
  return next;
}

export function shouldShowOnboarding(
  state: OnboardingState,
  workflowCount: number,
): boolean {
  if (state.dismissed) return false;
  if (state.completedAt) return false;
  // Show on empty home, or until first run success after sample create
  if (workflowCount === 0) return true;
  return state.sampleCreated && !state.firstRunSuccess;
}

/** Query flag used when navigating into the editor for first-run coaching. */
export const ONBOARDING_RUN_QUERY = "onboardingRun";

const BANNER_SESSION_KEY = "openflow:onboardingBanner";

/** Mark that the next editor open should show the first-run Execute coach. */
export function armOnboardingBanner(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(BANNER_SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function consumeOnboardingBanner(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get(ONBOARDING_RUN_QUERY) === "1") {
      params.delete(ONBOARDING_RUN_QUERY);
      const qs = params.toString();
      window.history.replaceState(
        {},
        "",
        window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash,
      );
      window.sessionStorage.removeItem(BANNER_SESSION_KEY);
      return true;
    }
    if (window.sessionStorage.getItem(BANNER_SESSION_KEY) === "1") {
      window.sessionStorage.removeItem(BANNER_SESSION_KEY);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}
