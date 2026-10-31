import mark from "@/assets/rayora-mark.png";
import full from "@/assets/rayora-logo-full.png";
import { cn } from "@/lib/utils";

/** Rayora icon (R with sun and solar panel). Used in the sidebar, login and public pages. */
export function BrandMark({ className = "h-8 w-8" }: { className?: string }) {
  return <img src={mark} alt="Rayora" className={cn("shrink-0 rounded-lg object-cover", className)} />;
}

/** Full logo with name and tagline, for landing or print pages. */
export function BrandFull({ className = "h-40 w-auto" }: { className?: string }) {
  return <img src={full} alt="Rayora, Smart Solar Management" className={cn("rounded-lg", className)} />;
}

export function BrandName({ company }: { company?: string }) {
  return (
    <div className="leading-tight">
      <p className="text-md font-semibold tracking-tight">Rayora</p>
      {company && <p className="text-xs text-side-muted">{company}</p>}
    </div>
  );
}
