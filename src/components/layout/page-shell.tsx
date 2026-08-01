import type { ReactNode } from "react";
import { AppHeader } from "./app-header";

export function PageShell({
  children,
  maxWidth = "max-w-5xl",
  actions,
}: {
  children: ReactNode;
  maxWidth?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader actions={actions} />
      <main className={`mx-auto w-full flex-1 px-6 py-10 ${maxWidth}`}>{children}</main>
    </div>
  );
}
