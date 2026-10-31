import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { HOME_FOR, useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { BrandFull, BrandMark } from "@/components/shared/Brand";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { LoginScene } from "@/components/shared/LoginScene";
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
        <LoginScene />
        <div className="relative flex items-center gap-3">
          <BrandMark className="h-10 w-10" />
          <div className="leading-tight">
            <p className="ls-ink text-md font-semibold">Rayora</p>
            <p className="ls-ink2 text-xs uppercase tracking-[0.22em] text-side-muted">Smart Solar Management</p>
          </div>
        </div>
        <div className="relative max-w-sm pb-2">
          <p className="text-balance text-2xl font-semibold leading-snug tracking-tight">From enquiry to warranty, all in one place.</p>
          <p className="mt-2 text-base text-side-muted">Leads, surveys, stock, installs, subsidy and service.</p>
        </div>
      </section>
      <section className="flex flex-col justify-center px-6 py-6 sm:px-12">
        <div className="mx-auto w-full max-w-sm animate-pop">
          {/* Full logo with tagline. Multiply blends its cream background into the beige page in light mode. */}
          <div className="mx-auto mb-4 aspect-[10/8.4] w-full max-w-[230px] overflow-hidden rounded-xl">
            <BrandFull className="h-full w-full object-cover mix-blend-multiply dark:mix-blend-normal" />
          </div>
          <h1 className="text-xl font-semibold">Sign in to Rayora</h1>
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
          <div className="mt-6"><ThemeToggle /></div>
        </div>
      </section>
    </div>
  );
}