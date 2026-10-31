import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { HOME_FOR, can, useAuth, type Role } from "@/lib/auth";
import { AppShell } from "@/components/shared/AppShell";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/surface";
import Login from "@/features/Login";

// Route-level code splitting: each area loads only when opened
const Dashboard = lazy(() => import("@/features/Dashboard"));
const Leads = lazy(() => import("@/features/Leads").then((m) => ({ default: m.LeadsList })));
const LeadDetail = lazy(() => import("@/features/Leads").then((m) => ({ default: m.LeadDetail })));
const Surveys = lazy(() => import("@/features/Surveys"));
const Orders = lazy(() => import("@/features/Orders").then((m) => ({ default: m.OrdersList })));
const OrderDetail = lazy(() => import("@/features/Orders").then((m) => ({ default: m.OrderDetail })));
const QrSheet = lazy(() => import("@/features/Orders").then((m) => ({ default: m.QrSheet })));
const Purchases = lazy(() => import("@/features/Operations").then((m) => ({ default: m.PurchasesList })));
const PurchaseDetail = lazy(() => import("@/features/Operations").then((m) => ({ default: m.PurchaseDetail })));
const Stock = lazy(() => import("@/features/Operations").then((m) => ({ default: m.Stock })));
const Dispatch = lazy(() => import("@/features/Operations").then((m) => ({ default: m.DispatchList })));
const Scanner = lazy(() => import("@/features/Operations").then((m) => ({ default: m.DispatchScanner })));
const Jobs = lazy(() => import("@/features/Jobs").then((m) => ({ default: m.JobsList })));
const JobDetail = lazy(() => import("@/features/Jobs").then((m) => ({ default: m.JobDetail })));
const Subsidy = lazy(() => import("@/features/Subsidy"));
const Tickets = lazy(() => import("@/features/Service").then((m) => ({ default: m.TicketsList })));
const TicketDetail = lazy(() => import("@/features/Service").then((m) => ({ default: m.TicketDetail })));
const Invoices = lazy(() => import("@/features/Finance").then((m) => ({ default: m.InvoicesList })));
const InvoiceDetail = lazy(() => import("@/features/Finance").then((m) => ({ default: m.InvoiceDetail })));
const TechPay = lazy(() => import("@/features/Finance").then((m) => ({ default: m.TechnicianPay })));
const Settings = lazy(() => import("@/features/Finance").then((m) => ({ default: m.Settings })));
const Enquiry = lazy(() => import("@/features/Public").then((m) => ({ default: m.EnquiryForm })));
const UnitPage = lazy(() => import("@/features/Public").then((m) => ({ default: m.UnitPage })));
const Shared = lazy(() => import("@/features/Public").then((m) => ({ default: m.SharedReport })));
const PrintReport = lazy(() => import("@/features/Public").then((m) => ({ default: m.PrintReport })));

function PageFallback() {
  return <div className="space-y-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-4 w-96" /><Skeleton className="h-80" /></div>;
}

function Protected({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="grid min-h-screen place-items-center"><Skeleton className="h-10 w-48" /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  if (roles && !can(user, ...roles)) {
    return <AppShell><EmptyState title="This area isn't part of your role" description="Ask the director if you need access." /></AppShell>;
  }
  return <>{children}</>;
}

function Home() {
  const { user } = useAuth();
  return <Navigate to={user ? HOME_FOR[user.role] : "/login"} replace />;
}

const R = (roles: Role[], el: ReactNode) => <Protected roles={roles}><AppShell><Suspense fallback={<PageFallback />}>{el}</Suspense></AppShell></Protected>;

export default function App() {
  return (
    <Suspense fallback={<div className="p-8"><PageFallback /></div>}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/enquiry" element={<Enquiry />} />
        <Route path="/u/:token" element={<UnitPage />} />
        <Route path="/shared/:token" element={<Shared />} />
        <Route path="/reports/print" element={<Protected roles={["accounts"]}><PrintReport /></Protected>} />
        <Route path="/" element={<Protected><Home /></Protected>} />
        <Route path="/dashboard" element={R(["accounts"], <Dashboard />)} />
        <Route path="/leads" element={R(["sales", "support"], <Leads />)} />
        <Route path="/leads/:id" element={R(["sales", "support"], <LeadDetail />)} />
        <Route path="/surveys" element={R(["sales", "technician"], <Surveys />)} />
        <Route path="/orders" element={R(["sales", "warehouse", "accounts", "support"], <Orders />)} />
        <Route path="/orders/:id" element={R(["sales", "warehouse", "accounts", "support", "technician"], <OrderDetail />)} />
        <Route path="/orders/:id/qr" element={R(["sales", "warehouse", "support", "technician"], <QrSheet />)} />
        <Route path="/purchases" element={R(["warehouse"], <Purchases />)} />
        <Route path="/purchases/:id" element={R(["warehouse"], <PurchaseDetail />)} />
        <Route path="/stock" element={R(["warehouse", "sales", "support", "accounts"], <Stock />)} />
        <Route path="/dispatch" element={R(["warehouse"], <Dispatch />)} />
        <Route path="/dispatch/:id" element={R(["warehouse", "sales"], <Scanner />)} />
        <Route path="/jobs" element={R(["technician", "sales", "warehouse"], <Jobs />)} />
        <Route path="/jobs/:id" element={R(["technician", "sales", "warehouse"], <JobDetail />)} />
        <Route path="/subsidy" element={R(["sales", "accounts"], <Subsidy />)} />
        <Route path="/tickets" element={R(["support", "technician"], <Tickets />)} />
        <Route path="/tickets/:id" element={R(["support", "technician"], <TicketDetail />)} />
        <Route path="/invoices" element={R(["accounts", "sales"], <Invoices />)} />
        <Route path="/invoices/:id" element={R(["accounts", "sales"], <InvoiceDetail />)} />
        <Route path="/technician-pay" element={R(["accounts"], <TechPay />)} />
        <Route path="/settings" element={R([], <Settings />)} />
        <Route path="*" element={<div className="p-10"><EmptyState title="Page not found" description="Check the address, or go back to your home screen." /></div>} />
      </Routes>
    </Suspense>
  );
}
