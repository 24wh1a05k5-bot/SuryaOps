import { useEffect, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  BadgeIndianRupee, Boxes, ClipboardCheck, FileText, Gauge, HardHat, LifeBuoy, LogOut, Menu as MenuIcon, PackageCheck, RotateCcw,
  Search, Settings, ShieldCheck, ShoppingCart, Truck, UserRound, Users, WifiOff, X,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ROLE_LABEL, can, useAuth, type Role } from "@/lib/auth";
import { api } from "@/lib/api";
import { useOnline } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { BrandMark, BrandName } from "./Brand";
import { CommandPalette } from "./CommandPalette";
import { ThemeToggle } from "./ThemeToggle";
import { ErrorBoundary } from "./ErrorBoundary";
import { ConfirmDialog } from "../ui/dialog";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "../ui/menu";

type Item = { to: string; label: string; icon: typeof Gauge; roles: Role[] };
const NAV: { group: string; items: Item[] }[] = [
  { group: "Insights", items: [{ to: "/dashboard", label: "Dashboard", icon: Gauge, roles: ["accounts"] }] },
  { group: "Sales", items: [
    { to: "/leads", label: "Leads", icon: Users, roles: ["sales", "support"] },
    { to: "/surveys", label: "Site surveys", icon: ClipboardCheck, roles: ["sales", "technician"] },
    { to: "/orders", label: "Quotes & orders", icon: ShoppingCart, roles: ["sales", "warehouse", "accounts", "support"] },
  ] },
  { group: "Operations", items: [
    { to: "/purchases", label: "Purchases", icon: PackageCheck, roles: ["warehouse"] },
    { to: "/stock", label: "Stock & serials", icon: Boxes, roles: ["warehouse", "sales", "support", "accounts"] },
    { to: "/dispatch", label: "Dispatch", icon: Truck, roles: ["warehouse"] },
    { to: "/jobs", label: "Installations", icon: HardHat, roles: ["technician", "sales", "warehouse"] },
  ] },
  { group: "Compliance", items: [{ to: "/subsidy", label: "Subsidy tracker", icon: ShieldCheck, roles: ["sales", "accounts"] }] },
  { group: "Service", items: [{ to: "/tickets", label: "Service tickets", icon: LifeBuoy, roles: ["support", "technician"] }] },
  { group: "Finance", items: [
    { to: "/invoices", label: "Invoices", icon: FileText, roles: ["accounts", "sales"] },
    { to: "/technician-pay", label: "Technician pay", icon: BadgeIndianRupee, roles: ["accounts"] },
  ] },
];

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth();
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => api("/settings"), staleTime: 300000 });
  return (
    <div className="flex h-full flex-col bg-side text-side-ink">
      <div className="flex items-center gap-3 px-5 py-5">
        <BrandMark />
        <BrandName company={settings.data?.company_name} />
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4 scroll-thin" aria-label="Main">
        {NAV.map((g) => {
          const items = g.items.filter((i) => can(user, ...i.roles));
          if (!items.length) return null;
          return (
            <div key={g.group}>
              <p className="px-2 pb-1.5 text-xs font-medium text-side-muted">{g.group}</p>
              <ul className="space-y-0.5">
                {items.map(({ to, label, icon: Icon }) => (
                  <li key={to}>
                    <NavLink to={to} onClick={onNavigate}
                      className={({ isActive }) => cn(
                        "relative flex h-9 items-center gap-3 rounded px-2.5 text-base transition-colors",
                        isActive ? "bg-side-hover font-medium text-side-ink before:absolute before:-left-3 before:top-1.5 before:h-6 before:w-[3px] before:rounded-r before:bg-sun"
                          : "text-side-muted hover:bg-side-hover hover:text-side-ink")}>
                      <Icon className="h-4 w-4 shrink-0" /> {label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {can(user) && (
          <NavLink to="/settings" onClick={onNavigate} className={({ isActive }) => cn("flex h-9 items-center gap-3 rounded px-2.5 text-base",
            isActive ? "bg-side-hover font-medium" : "text-side-muted hover:bg-side-hover hover:text-side-ink")}>
            <Settings className="h-4 w-4" /> Settings
          </NavLink>
        )}
      </nav>
      <div className="border-t border-white/5 p-3"><ThemeToggle onDark className="w-full" /></div>
    </div>
  );
}

export function AppShell({ children }: { children?: ReactNode }) {
  const { user, logout } = useAuth();
  const [palette, setPalette] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const online = useOnline();
  const loc = useLocation();

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((p) => !p); }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);
  useEffect(() => { setDrawer(false); }, [loc.pathname]);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="no-print hidden bg-side lg:block"><div className="sticky top-0 h-screen"><Sidebar /></div></aside>
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-[rgb(var(--shadow)/0.5)]" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 w-[264px] animate-pop"><Sidebar onNavigate={() => setDrawer(false)} /></div>
        </div>
      )}
      <div className="min-w-0">
        {!online && (
          <div role="status" className="no-print flex items-center justify-center gap-2 bg-bad px-4 py-2 text-sm font-medium text-white">
            <WifiOff className="h-4 w-4" /> Connection lost. Retrying automatically; your entered data is kept on this device.
          </div>
        )}
        <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur md:px-6">
          <button className="rounded p-1.5 text-muted hover:bg-sunken lg:hidden" onClick={() => setDrawer(true)} aria-label="Open menu">
            {drawer ? <X className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
          </button>
          <button onClick={() => setPalette(true)}
            className="flex h-9 min-w-0 flex-1 max-w-md items-center gap-2 rounded border border-line bg-surface px-3 text-left text-base text-faint hover:border-line-strong">
            <Search className="h-4 w-4" />
            <span className="flex-1 truncate">Find a customer, serial, order or ticket</span>
            <kbd className="hidden rounded border border-line px-1.5 text-xs sm:inline">Ctrl K</kbd>
          </button>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {user?.role === "admin" && <ResetDemoButton />}
            <Menu>
              <MenuTrigger asChild>
                <button className="flex items-center gap-2.5 rounded py-1 pl-1 pr-2 hover:bg-sunken" aria-label="Account menu">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-cell-soft text-sm font-semibold text-cell">
                    {user?.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                  </span>
                  <span className="hidden text-left leading-tight sm:block">
                    <span className="block text-sm font-medium">{user?.name}</span>
                    <span className="block text-xs text-muted">{user && ROLE_LABEL[user.role]}</span>
                  </span>
                </button>
              </MenuTrigger>
              <MenuContent>
                <MenuLabel>{user?.email}</MenuLabel>
                <MenuSeparator />
                <div className="px-1.5 py-1"><ThemeToggle className="w-full" /></div>
                <MenuSeparator />
                <MenuItem icon={<UserRound className="h-4 w-4" />} onSelect={() => setPalette(true)}>Search everything</MenuItem>
                <MenuItem icon={<LogOut className="h-4 w-4" />} onSelect={logout}>Sign out</MenuItem>
              </MenuContent>
            </Menu>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 md:px-8 md:py-8">
          <ErrorBoundary key={loc.pathname}>{children ?? <Outlet />}</ErrorBoundary>
        </main>
      </div>
      <CommandPalette open={palette} onOpenChange={setPalette} />
    </div>
  );
}

/** Director only: puts the demo data back to its starting state (same as `seed --reset`). */
function ResetDemoButton() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const reset = async () => {
    setBusy(true);
    try {
      await api("/admin/reset-demo", { body: {} });
      qc.clear();
      toast.success("Demo data reset");
      window.location.assign("/dashboard");
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
      setOpen(false);
    }
  };
  return (
    <>
      <button onClick={() => setOpen(true)} title="Reset demo data"
        className="flex h-8 items-center gap-1.5 rounded border border-line px-2.5 text-sm text-muted hover:border-line-strong hover:bg-sunken hover:text-ink">
        <RotateCcw className="h-3.5 w-3.5" /><span className="hidden sm:inline">Reset demo</span>
      </button>
      <ConfirmDialog open={open} onOpenChange={(o) => !busy && setOpen(o)} title="Reset demo data?"
        description="Everything goes back to the starting demo: new leads, orders, payments and tickets are removed. Takes about 10 seconds."
        confirmLabel="Reset" danger loading={busy} onConfirm={reset} />
    </>
  );
}