import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import type { INodeTypeDescription } from "@/lib/nodes/types";
import {
  nodesAcceptingChannel,
  nodesProvidingChannel,
  channelLabel,
  type SlotPickerTarget,
} from "@/lib/workflow/channels";
import { NodeIcon } from "./BaseNode";
import { cn } from "@/lib/utils";

export type { SlotPickerTarget };

interface Props {
  target: SlotPickerTarget | null;
  onClose: () => void;
  onPick: (type: string, target: SlotPickerTarget) => void;
}

export function SlotNodePicker({ target, onClose, onPick }: Props) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const items = useMemo(() => {
    if (!target) return [] as INodeTypeDescription[];
    const list =
      target.side === "input"
        ? nodesProvidingChannel(target.channel)
        : nodesAcceptingChannel(target.channel);
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (d) =>
        d.displayName.toLowerCase().includes(q) ||
        d.name.toLowerCase().includes(q) ||
        d.description.toLowerCase().includes(q),
    );
  }, [target, query]);

  useEffect(() => {
    if (!target) {
      setQuery("");
      return;
    }
    setQuery("");
    const t = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [target]);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [target, onClose]);

  if (!target) return null;

  const label = channelLabel(target.channel);

  return (
    <div
      ref={panelRef}
      className="fixed z-50 w-64 overflow-hidden rounded-md border border-border bg-surface shadow-xl"
      style={{
        left: Math.min(target.x, window.innerWidth - 280),
        top: Math.min(target.y, window.innerHeight - 320),
      }}
      role="dialog"
      aria-label={`Add ${label} node`}
    >
      <div className="border-b border-border px-3 py-2">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {target.side === "input" ? "Connect" : "Attach to"} · {label}
        </p>
        <div className="relative mt-1.5">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search nodes"
            className="h-8 w-full rounded border border-border bg-background pl-7 pr-2 text-xs outline-none focus:border-primary"
          />
        </div>
      </div>
      <ul className="max-h-56 overflow-y-auto p-1">
        {items.length === 0 && (
          <li className="px-2 py-3 text-center text-[12px] text-muted-foreground">
            No matching nodes
          </li>
        )}
        {items.map((d) => (
          <li key={d.name}>
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px]",
                "hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
              )}
              onClick={() => onPick(d.name, target)}
            >
              <NodeIcon name={d.icon} className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-foreground">{d.displayName}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
