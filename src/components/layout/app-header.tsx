import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Braces,
  ChevronDown,
  FolderKanban,
  KeyRound,
  Layers,
  LogOut,
  Settings,
  Share2,
  Table2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { OpenFlowLogo } from "@/components/brand/openflow-logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  fetchProjects,
  getSelectedProjectId,
  setSelectedProjectId,
  type ProjectSummary,
} from "@/lib/projects/client";
import {
  fetchEnvironments,
  getSelectedEnvironmentId,
  setSelectedEnvironmentId,
  type EnvironmentSummary,
} from "@/lib/environments/client";
import {
  fetchAuthStatus,
  logout,
  type AuthUser,
} from "@/lib/auth/client";
import { cn } from "@/lib/utils";

type Props = {
  /** Compact bar for editor */
  compact?: boolean;
  /** Extra actions on the right (before user menu) */
  actions?: React.ReactNode;
  /** Hide main nav links */
  hideNav?: boolean;
};

export function AppHeader({ compact, actions, hideNav }: Props) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [environments, setEnvironments] = useState<EnvironmentSummary[]>([]);
  const [environmentId, setEnvironmentId] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authDisabled, setAuthDisabled] = useState(false);

  const loadScope = useCallback(async () => {
    const list = await fetchProjects();
    setProjects(list);
    const stored = getSelectedProjectId();
    const next =
      (stored && list.find((p) => p.id === stored)?.id) ||
      list.find((p) => p.type === "personal")?.id ||
      list[0]?.id ||
      null;
    if (next && next !== stored) setSelectedProjectId(next);
    setProjectId(next);

    if (next) {
      const envs = await fetchEnvironments(next);
      setEnvironments(envs);
      const estored = getSelectedEnvironmentId();
      const enext =
        (estored && envs.find((e) => e.id === estored)?.id) ||
        envs.find((e) => e.isDefault)?.id ||
        envs[0]?.id ||
        null;
      if (enext !== estored) setSelectedEnvironmentId(enext);
      setEnvironmentId(enext);
    }
  }, []);

  useEffect(() => {
    void fetchAuthStatus().then(({ user: u, authDisabled: d }) => {
      setUser(u);
      setAuthDisabled(d);
    });
    void loadScope();
  }, [loadScope, pathname]);

  const onLogout = async () => {
    await logout();
    toast.success("Signed out");
    navigate({ to: "/login", search: {} });
  };

  const navCls = (path: string) =>
    `text-[12px] ${pathname === path || pathname.startsWith(path + "/") ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`;

  return (
    <header
      className={`flex shrink-0 items-center gap-2 border-b border-border bg-sidebar px-3 ${
        compact ? "h-14" : "h-12"
      }`}
    >
      <Link to="/" className="flex items-center gap-2 pr-1 text-primary" aria-label="Home">
        <OpenFlowLogo className="size-5" withPlate />
        {!compact && (
          <span className="hidden font-mono text-[13px] font-semibold tracking-tight text-foreground sm:inline">
            OpenFlow
          </span>
        )}
      </Link>

      {projects.length > 0 && (
        <ScopeDropdown
          label="Project"
          icon={<FolderKanban className="size-3.5 shrink-0 opacity-70" />}
          valueLabel={projects.find((p) => p.id === projectId)?.name ?? "Project"}
          title={
            (() => {
              const p = projects.find((x) => x.id === projectId);
              if (!p) return "Select project";
              return `${p.name}${p.type === "personal" ? " · personal" : ""} · ${p.role}`;
            })()
          }
          items={projects.map((p) => ({
            id: p.id,
            primary: p.name,
            secondary: `${p.type === "personal" ? "personal" : "team"} · ${p.role}`,
          }))}
          selectedId={projectId}
          onSelect={(id) => {
            setSelectedProjectId(id);
            setProjectId(id);
            void loadScope();
            window.dispatchEvent(new CustomEvent("openflow:scope-change"));
          }}
        />
      )}

      {environments.length > 0 && (
        <ScopeDropdown
          label="Environment"
          icon={<Layers className="size-3.5 shrink-0 opacity-70" />}
          valueLabel={environments.find((e) => e.id === environmentId)?.name ?? "Env"}
          title={
            (() => {
              const e = environments.find((x) => x.id === environmentId);
              if (!e) return "Select environment";
              return `${e.name}${e.isDefault ? " (default)" : ""}`;
            })()
          }
          items={environments.map((e) => ({
            id: e.id,
            primary: e.name,
            secondary: e.isDefault ? "default" : undefined,
          }))}
          selectedId={environmentId}
          onSelect={(id) => {
            setSelectedEnvironmentId(id);
            setEnvironmentId(id);
            window.dispatchEvent(new CustomEvent("openflow:scope-change"));
          }}
        />
      )}

      {!hideNav && (
        <nav className="ml-1 hidden items-center gap-3 md:flex">
          <Link to="/" className={navCls("/")}>
            Workflows
          </Link>
          <Link to="/templates" search={{}} className={navCls("/templates")}>
            Templates
          </Link>
          <Link to="/shared" className={navCls("/shared")}>
            Shared
          </Link>
          <Link to="/projects" className={navCls("/projects")}>
            Projects
          </Link>
          <Link to="/credentials" className={navCls("/credentials")}>
            Credentials
          </Link>
          <Link to="/variables" className={navCls("/variables")}>
            Variables
          </Link>
          <Link to="/data-tables" className={navCls("/data-tables")}>
            Tables
          </Link>
          <Link to="/settings" className={navCls("/settings")}>
            Settings
          </Link>
        </nav>
      )}

      <div className="ml-auto flex items-center gap-1">
        {actions}
        {authDisabled && (
          <span className="hidden rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">
            auth off
          </span>
        )}
        {user && !authDisabled && (
          <span className="hidden max-w-[10rem] truncate text-[11px] text-muted-foreground sm:inline">
            {user.email}
          </span>
        )}
        {!authDisabled && user && (
          <Button variant="ghost" size="sm" className="h-8 text-[12px]" onClick={() => void onLogout()}>
            <LogOut className="size-3.5" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        )}
        {!authDisabled && !user && (
          <Button variant="outline" size="sm" className="h-8 text-[12px]" asChild>
            <Link to="/login" search={{}}>Sign in</Link>
          </Button>
        )}
        <Button variant="ghost" size="icon" className="size-8 md:hidden" asChild aria-label="Settings">
          <Link to="/settings">
            <Settings className="size-4" />
          </Link>
        </Button>
      </div>
    </header>
  );
}

function ScopeDropdown({
  label,
  icon,
  valueLabel,
  title,
  items,
  selectedId,
  onSelect,
}: {
  label: string;
  icon: React.ReactNode;
  valueLabel: string;
  title: string;
  items: Array<{ id: string; primary: string; secondary?: string }>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 max-w-[9rem] shrink gap-1 px-2 text-[12px] font-normal sm:max-w-[12rem] md:max-w-[14rem]"
          aria-label={label}
          title={title}
        >
          {icon}
          <span className="min-w-0 flex-1 truncate text-left">{valueLabel}</span>
          <ChevronDown className="size-3.5 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[12rem] max-w-[20rem]">
        <DropdownMenuLabel className="text-[11px] text-muted-foreground">{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.map((item) => (
          <DropdownMenuItem
            key={item.id}
            className={cn(
              "flex flex-col items-start gap-0.5 py-2",
              item.id === selectedId && "bg-accent",
            )}
            onClick={() => onSelect(item.id)}
          >
            <span className="w-full truncate text-[13px] font-medium">{item.primary}</span>
            {item.secondary && (
              <span className="w-full truncate text-[11px] text-muted-foreground">
                {item.secondary}
              </span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Compact icon nav for mobile / overflow */
export function AppNavIcons() {
  return (
    <div className="flex flex-wrap gap-1">
      <Button variant="ghost" size="sm" className="h-8 text-[12px]" asChild>
        <Link to="/templates" search={{}}>
          Templates
        </Link>
      </Button>
      <Button variant="ghost" size="sm" className="h-8 text-[12px]" asChild>
        <Link to="/projects">
          <FolderKanban className="mr-1 size-3.5" /> Projects
        </Link>
      </Button>
      <Button variant="ghost" size="sm" className="h-8 text-[12px]" asChild>
        <Link to="/shared">
          <Share2 className="mr-1 size-3.5" /> Shared
        </Link>
      </Button>
      <Button variant="ghost" size="sm" className="h-8 text-[12px]" asChild>
        <Link to="/credentials">
          <KeyRound className="mr-1 size-3.5" /> Vault
        </Link>
      </Button>
      <Button variant="ghost" size="sm" className="h-8 text-[12px]" asChild>
        <Link to="/variables">
          <Braces className="mr-1 size-3.5" /> Vars
        </Link>
      </Button>
      <Button variant="ghost" size="sm" className="h-8 text-[12px]" asChild>
        <Link to="/data-tables">
          <Table2 className="mr-1 size-3.5" /> Tables
        </Link>
      </Button>
    </div>
  );
}
