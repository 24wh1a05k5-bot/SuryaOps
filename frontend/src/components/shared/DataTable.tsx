import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "../ui/surface";
import { Button } from "../ui/button";
import { EmptyState } from "./EmptyState";
import { number } from "@/lib/format";

export type Column<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  hideOnMobile?: boolean;
};

export function DataTable<T>({
  columns, rows, loading, error, onRetry, onRowClick, rowKey, rowClassName,
  page, pageSize, total, onPage, empty, toolbar, dense,
}: {
  columns: Column<T>[]; rows?: T[]; loading?: boolean; error?: Error | null; onRetry?: () => void;
  onRowClick?: (row: T) => void; rowKey: (row: T) => string | number; rowClassName?: (row: T) => string | undefined;
  page?: number; pageSize?: number; total?: number; onPage?: (p: number) => void;
  empty?: ReactNode; toolbar?: ReactNode; dense?: boolean;
}) {
  const pages = total && pageSize ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const align = (a?: string) => (a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left");
  return (
    <div className="overflow-hidden rounded-md bg-surface shadow-card">
      {toolbar && <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">{toolbar}</div>}
      <div className="overflow-x-auto scroll-thin">
        <table className="w-full min-w-[640px] border-collapse">
          <thead className="sticky top-0 z-[1] bg-sunken/70 backdrop-blur">
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col"
                  className={cn("border-b border-line px-4 py-2.5 text-sm font-medium text-muted", align(c.align), c.hideOnMobile && "hidden md:table-cell", c.className)}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="border-b border-line last:border-0">
                {columns.map((c) => <td key={c.key} className={cn("px-4 py-3.5", c.hideOnMobile && "hidden md:table-cell")}><Skeleton className="h-4 w-[70%]" /></td>)}
              </tr>
            ))}
            {!loading && rows?.map((r) => (
              <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined}
                onKeyDown={onRowClick ? (e) => { if (e.key === "Enter") onRowClick(r); } : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                className={cn("border-b border-line last:border-0", onRowClick && "cursor-pointer hover:bg-sunken/60 focus:bg-sunken/60 focus:outline-none", rowClassName?.(r))}>
                {columns.map((c) => (
                  <td key={c.key} className={cn("px-4 align-middle text-base", dense ? "py-2" : "py-3", align(c.align), c.hideOnMobile && "hidden md:table-cell", c.className)}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && error && (
          <EmptyState tone="bad" title="This list didn't load" description={error.message}
            action={onRetry && <Button onClick={onRetry}>Try again</Button>} />
        )}
        {!loading && !error && rows && rows.length === 0 && (empty ?? <EmptyState title="Nothing here yet" description="Records will appear here as work comes in." />)}
      </div>
      {onPage && total !== undefined && total > (pageSize ?? 0) && (
        <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-sm text-muted">
          <span className="num">{number((page! - 1) * pageSize! + 1)}–{number(Math.min(page! * pageSize!, total))} of {number(total)}</span>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" disabled={page! <= 1} onClick={() => onPage(page! - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
            <span className="num px-2">Page {page} of {pages}</span>
            <Button size="sm" variant="ghost" disabled={page! >= pages} onClick={() => onPage(page! + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative w-full sm:w-72">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder}
        className="field pl-9" />
    </div>
  );
}

export function FilterChips<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={cn("h-8 rounded px-3 text-sm font-medium transition-colors",
            value === o.value ? "bg-ink text-bg" : "text-muted hover:bg-sunken hover:text-ink")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
