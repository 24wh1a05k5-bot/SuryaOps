/** Brand mark: a sun rising over a tilted solar panel. */
export function BrandMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="7" fill="rgb(var(--sun))" />
      <circle cx="21.5" cy="10" r="3.6" fill="rgb(var(--sun-ink))" />
      <path d="M21.5 3.6v1.6M27.9 10h-1.6M26 5.5l-1.1 1.1M17 5.5l1.1 1.1" stroke="rgb(var(--sun-ink))" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M5 26.5 9 15h13l-4 11.5Z" fill="rgb(var(--sun-ink))" />
      <path d="M13.3 15l-4 11.5M17.7 15l-4 11.5M7 20.8h13" stroke="rgb(var(--sun))" strokeWidth="1.1" />
    </svg>
  );
}

export function BrandName({ company }: { company?: string }) {
  return (
    <div className="leading-tight">
      <p className="text-md font-semibold tracking-tight">SuryaOps</p>
      {company && <p className="text-xs text-side-muted">{company}</p>}
    </div>
  );
}
