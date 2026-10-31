import { useEffect, useRef, useState } from "react";
import * as D from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Barcode, FileText, LifeBuoy, Search, ShoppingCart, User } from "lucide-react";
import { api } from "@/lib/api";
import { useDebounced } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const ICON: Record<string, typeof User> = { customer: User, serial: Barcode, order: ShoppingCart, ticket: LifeBuoy, invoice: FileText };
const LABEL: Record<string, string> = { customer: "Customer", serial: "Serial number", order: "Order", ticket: "Ticket", invoice: "Invoice" };

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const dq = useDebounced(q, 200);
  const nav = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const res = useQuery({ queryKey: ["search", dq], queryFn: () => api<any[]>("/search", { query: { q: dq } }), enabled: dq.trim().length >= 2 });
  const items = dq.trim().length >= 2 ? res.data ?? [] : [];

  useEffect(() => { setActive(0); }, [dq]);
  useEffect(() => { if (!open) setQ(""); }, [open]);

  const go = (url: string) => { onOpenChange(false); nav(url); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    if (e.key === "Enter" && items[active]) go(items[active].url);
  };

  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-[rgb(var(--shadow)/0.45)] backdrop-blur-[2px]" />
        <D.Content onOpenAutoFocus={(e) => { e.preventDefault(); input.current?.focus(); }}
          className="fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-32px)] max-w-xl -translate-x-1/2 overflow-hidden rounded-lg bg-raised shadow-pop animate-pop">
          <D.Title className="sr-only">Search</D.Title>
          <div className="flex items-center gap-3 border-b border-line px-4">
            <Search className="h-4 w-4 text-faint" />
            <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
              placeholder="Phone, name, serial, order, ticket or invoice number"
              className="h-14 flex-1 bg-transparent text-md outline-none placeholder:text-faint" />
            <kbd className="rounded border border-line px-1.5 text-xs text-faint">Esc</kbd>
          </div>
          <div className="max-h-[50vh] overflow-y-auto p-2 scroll-thin">
            {dq.trim().length < 2 && <p className="px-3 py-6 text-center text-sm text-muted">Type at least two characters. Try a serial like GRW3K or a phone number.</p>}
            {dq.trim().length >= 2 && !res.isFetching && items.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted">No matches for "{dq}".</p>}
            {items.map((it, i) => {
              const Icon = ICON[it.type] ?? Search;
              return (
                <button key={`${it.type}-${it.id}`} onMouseEnter={() => setActive(i)} onClick={() => go(it.url)}
                  className={cn("flex w-full items-center gap-3 rounded px-3 py-2.5 text-left", i === active && "bg-sunken")}>
                  <span className="grid h-8 w-8 place-items-center rounded bg-sunken text-muted"><Icon className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{it.title}</span>
                    <span className="block truncate text-sm text-muted">{it.subtitle}</span>
                  </span>
                  <span className="text-xs text-faint">{LABEL[it.type]}</span>
                </button>
              );
            })}
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
