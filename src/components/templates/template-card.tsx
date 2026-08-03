import { Link } from "@tanstack/react-router";
import { Eye, Boxes } from "lucide-react";
import { CompatibilityBadge } from "./compatibility-badge";
import {
  formatViews,
  type TemplateListItem,
} from "@/lib/templates/client";

const GRADIENTS = [
  "from-violet-600/80 to-indigo-900/90",
  "from-cyan-600/70 to-slate-900/90",
  "from-rose-600/70 to-slate-900/90",
  "from-emerald-600/70 to-slate-900/90",
  "from-amber-600/70 to-slate-900/90",
  "from-fuchsia-600/70 to-indigo-950/90",
];

function gradientFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length]!;
}

export function TemplateCard({ item }: { item: TemplateListItem }) {
  const cats = item.categories.slice(0, 2);
  return (
    <Link
      to="/templates/$id"
      params={{ id: item.id }}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div
            className={`flex h-full w-full items-end bg-gradient-to-br p-3 ${gradientFor(item.id)}`}
          >
            <span className="line-clamp-2 text-sm font-semibold text-white/95 drop-shadow">
              {item.name}
            </span>
          </div>
        )}
        <div className="absolute right-2 top-2">
          <CompatibilityBadge level={item.compatibility.level} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <h3 className="line-clamp-2 text-[13px] font-semibold leading-snug tracking-tight text-foreground">
          {item.name}
        </h3>
        {item.descriptionSnippet ? (
          <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
            {item.descriptionSnippet}
          </p>
        ) : null}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-0.5">
            <Eye className="size-3 opacity-70" />
            {formatViews(item.views)}
          </span>
          <span className="inline-flex items-center gap-0.5">
            <Boxes className="size-3 opacity-70" />
            {item.nodeCount}
          </span>
          {cats.map((c) => (
            <span
              key={c}
              className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
            >
              {c}
            </span>
          ))}
        </div>
        {item.authorName ? (
          <div className="flex items-center gap-1.5 border-t border-border/60 pt-2">
            {item.authorAvatar ? (
              <img
                src={item.authorAvatar}
                alt=""
                className="size-5 rounded-full bg-muted object-cover"
              />
            ) : (
              <div className="size-5 rounded-full bg-muted" />
            )}
            <span className="truncate text-[10px] text-muted-foreground">
              {item.authorName}
            </span>
          </div>
        ) : null}
      </div>
    </Link>
  );
}
