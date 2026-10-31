const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = new Intl.NumberFormat("en-IN");

export const money = (v?: number | null, exact = false) => (v == null ? "—" : (exact ? inr2 : inr).format(v));
export const compactMoney = (v?: number | null) => {
  if (v == null) return "—";
  const a = Math.abs(v);
  if (a >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
  return inr.format(v);
};
export const number = (v?: number | null) => (v == null ? "—" : num.format(v));
export const date = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
export const time = (v?: string | null) =>
  v ? new Date(v).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : "—";
export const dateTime = (v?: string | null) => (v ? `${date(v)}, ${time(v)}` : "—");
export const relative = (v?: string | null) => {
  if (!v) return "—";
  const diff = (Date.now() - new Date(v).getTime()) / 1000;
  const abs = Math.abs(diff);
  const fmt = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 60) return "just now";
  if (abs < 3600) return fmt.format(-Math.round(diff / 60), "minute");
  if (abs < 86400) return fmt.format(-Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return fmt.format(-Math.round(diff / 86400), "day");
  return date(v);
};
export const humanize = (s?: string | null) => (s ? (s.charAt(0).toUpperCase() + s.slice(1)).replace(/_/g, " ") : "—");
export const isoDate = (d: Date) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};
export const toLocalInput = (d: Date) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 16);
};
