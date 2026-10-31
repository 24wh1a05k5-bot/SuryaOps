import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

export function PageHeader({ title, description, actions, crumbs, meta }: {
  title: ReactNode; description?: ReactNode; actions?: ReactNode; crumbs?: { label: string; to: string }[]; meta?: ReactNode;
}) {
  return (
    <header className="mb-6">
      {crumbs && (
        <nav aria-label="Breadcrumb" className="mb-2 flex items-center gap-1 text-sm text-muted">
          {crumbs.map((c) => (
            <span key={c.to} className="flex items-center gap-1">
              <Link to={c.to} className="hover:text-ink">{c.label}</Link>
              <ChevronRight className="h-3.5 w-3.5 text-faint" />
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-base text-muted">{description}</p>}
          {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
        </div>
        {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
