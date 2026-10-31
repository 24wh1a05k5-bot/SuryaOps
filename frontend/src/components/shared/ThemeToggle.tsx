import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemeChoice } from "@/lib/theme";
import { cn } from "@/lib/utils";

const OPTIONS: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/** Segmented light / dark / system switch. */
export function ThemeToggle({ className, onDark }: { className?: string; onDark?: boolean }) {
  const { choice, setChoice } = useTheme();
  return (
    <div role="radiogroup" aria-label="Theme" className={cn("inline-flex rounded p-0.5", onDark ? "bg-side-hover" : "bg-sunken", className)}>
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button key={value} role="radio" aria-checked={choice === value} title={label} aria-label={label} onClick={() => setChoice(value)}
          className={cn("flex h-7 flex-1 items-center justify-center gap-1.5 rounded-sm px-2 text-xs font-medium transition-colors",
            choice === value
              ? onDark ? "bg-side text-side-ink shadow" : "bg-surface text-ink shadow-card"
              : onDark ? "text-side-muted hover:text-side-ink" : "text-muted hover:text-ink")}>
          <Icon className="h-3.5 w-3.5" /> <span className={onDark ? "" : "hidden sm:inline"}>{label}</span>
        </button>
      ))}
    </div>
  );
}
