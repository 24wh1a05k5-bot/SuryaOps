import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn("field", className)} {...p} />
));
Input.displayName = "Input";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...p }, ref) => (
  <select ref={ref} className={cn("field appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-9", className)}
    style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238a93a3' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}
    {...p}>
    {children}
  </select>
));
Select.displayName = "Select";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea ref={ref} rows={3} className={cn("field resize-y", className)} {...p} />
));
Textarea.displayName = "Textarea";

export function Field({ label, hint, error, children, className, required }: {
  label: string; hint?: ReactNode; error?: string; children: ReactNode; className?: string; required?: boolean;
}) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="text-sm font-medium text-ink">{label}{required && <span className="text-bad"> *</span>}</span>
      {children}
      {error ? <span className="block text-sm text-bad">{error}</span> : hint ? <span className="block text-sm text-muted">{hint}</span> : null}
    </label>
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className="flex w-full items-start gap-3 rounded text-left">
      <span className={cn("mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors", checked ? "bg-sun" : "bg-line-strong")}>
        <span className={cn("h-4 w-4 rounded-full bg-white shadow transition-transform", checked && "translate-x-4")} />
      </span>
      <span>
        <span className="block text-base font-medium">{label}</span>
        {description && <span className="block text-sm text-muted">{description}</span>}
      </span>
    </button>
  );
}

/** Field errors from a VALIDATION_ERROR response. */
export function fieldErrors(err: unknown): Record<string, string> {
  const e = err as { code?: string; details?: { fields?: Record<string, string> } };
  return e?.code === "VALIDATION_ERROR" ? e.details?.fields ?? {} : {};
}
