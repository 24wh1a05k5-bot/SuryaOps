import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { HOME_FOR, useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { BrandMark } from "@/components/shared/Brand";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import type { ApiError } from "@/lib/api";

const DEMO = [
  ["Director", "director@sunpower.in"], ["Sales", "priya@sunpower.in"], ["Technician", "ravi@sunpower.in"],
  ["Warehouse", "warehouse@sunpower.in"], ["Support", "support@sunpower.in"], ["Accounts", "accounts@sunpower.in"],
];

export default function Login() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState("director@sunpower.in");
  const [password, setPassword] = useState("demo1234");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from;
  if (user) return <Navigate to={from ?? HOME_FOR[user.role]} replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const u = await login(email.trim(), password);
      nav(from ?? HOME_FOR[u.role], { replace: true });
    } catch (err) {
      setError((err as ApiError).message);
    } finally { setBusy(false); }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_520px]">
      <section className="relative hidden overflow-hidden bg-side text-side-ink lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="flex items-center gap-3"><BrandMark className="h-9 w-9" /><span className="text-md font-semibold">SuryaOps</span></div>
        <svg viewBox="0 0 600 340" className="absolute inset-x-0 bottom-28 w-full opacity-90" aria-hidden>
          <path d="M40 300 A260 260 0 0 1 560 300" fill="none" stroke="rgb(var(--side-muted))" strokeOpacity=".35" strokeDasharray="3 7" />
          <circle cx="430" cy="92" r="26" fill="rgb(var(--sun))" />
          {Array.from({ length: 6 }).map((_, i) => (
            <g key={i} transform={`translate(${70 + i * 82} 250) skewX(-18)`}>
              <rect width="70" height="44" rx="3" fill="rgb(var(--cell))" opacity={0.55 + i * 0.07} />
              <path d="M23 0v44M47 0v44M0 22h70" stroke="rgb(var(--side))" strokeOpacity=".55" />
            </g>
          ))}
        </svg>
        <div className="relative max-w-md">
          <p className="text-2xl font-semibold leading-tight tracking-tight">From the first enquiry to year twenty of the warranty, in one place.</p>
          <p className="mt-3 text-base text-side-muted">Leads, surveys, kits, serial-tracked stock, installs, PM Surya Ghar paperwork, service and profit per job.</p>
        </div>
      </section>
      <section className="flex flex-col justify-center px-6 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center justify-between lg:hidden"><BrandMark /><ThemeToggle /></div>
          <h1 className="text-xl font-semibold">Sign in</h1>
          <p className="mt-1 text-muted">Use your SunPower Solutions work account.</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <Field label="Email"><Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
            <Field label="Password"><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
            {error && <p role="alert" className="rounded bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
            <Button type="submit" variant="primary" size="lg" className="w-full justify-center" loading={busy}>Sign in</Button>
          </form>
          <div className="mt-8 border-t border-line pt-5">
            <p className="text-sm text-muted">Demo accounts (password demo1234)</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {DEMO.map(([role, mail]) => (
                <button key={mail} type="button" onClick={() => { setEmail(mail); setPassword("demo1234"); }}
                  className={`h-7 rounded px-2.5 text-sm ${email === mail ? "bg-ink text-bg" : "bg-sunken text-muted hover:text-ink"}`}>{role}</button>
              ))}
            </div>
          </div>
          <div className="mt-6 hidden lg:block"><ThemeToggle /></div>
        </div>
      </section>
    </div>
  );
}
