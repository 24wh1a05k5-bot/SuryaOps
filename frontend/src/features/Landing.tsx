import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, BadgeCheck, BatteryCharging, Calculator, ChevronDown, ClipboardCheck, FileCheck2, Gauge, Home,
  IndianRupee, MapPin, MessageCircle, PanelsTopLeft, QrCode, ScanLine, ShieldCheck, Sun, Wrench, Zap,
} from "lucide-react";
import { BrandMark } from "@/components/shared/Brand";
import { LoginScene } from "@/components/shared/LoginScene";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { cn } from "@/lib/utils";

/* Estimates for the calculator. Same subsidy rule and savings assumptions as the quote screen. */
const GEN_PER_KW_PER_DAY = 4;      // units generated per kW per day
const TARIFF = 7.5;                // ₹ saved per unit
const PRICE_PER_KW = 70000;        // typical on-grid system price per kW, final price after the site survey
const SIZES = [1, 2, 3, 5];        // sizes offered on the enquiry form

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
function subsidyFor(kw: number) {
  return Math.min(Math.min(kw, 2) * 30000 + Math.min(Math.max(kw - 2, 0), 1) * 18000, 78000);
}

function Section({ id, eyebrow, title, intro, children, className }: {
  id?: string; eyebrow: string; title: string; intro?: string; children: ReactNode; className?: string;
}) {
  return (
    <section id={id} className={cn("scroll-mt-20 px-4 py-20 sm:py-24", className)}>
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[rgb(var(--sun))]">{eyebrow}</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
          {intro && <p className="mt-4 text-lg text-muted">{intro}</p>}
        </div>
        <div className="mt-12">{children}</div>
      </div>
    </section>
  );
}

function CTA({ to = "/enquiry", children, ghost }: { to?: string; children: ReactNode; ghost?: boolean }) {
  const cls = cn("inline-flex h-12 items-center justify-center gap-2 rounded-lg px-6 text-md font-semibold transition-colors",
    ghost ? "border border-line-strong bg-surface text-ink hover:bg-sunken" : "bg-sun text-sun-ink shadow-sm hover:bg-sun-strong");
  // In-page anchors use a plain link so the browser scrolls to the section
  return to.startsWith("#") ? <a href={to} className={cls}>{children}</a> : <Link to={to} className={cls}>{children}</Link>;
}

function Header() {
  const links = [["#how", "How it works"], ["#calculator", "Savings"], ["#why", "Why Rayora"], ["#faq", "FAQ"]];
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
        <a href="#top" className="flex items-center gap-2.5">
          <BrandMark className="h-9 w-9" />
          <span className="leading-tight"><span className="block text-md font-semibold">Rayora</span>
            <span className="block text-xs text-muted">by SunPower Solutions</span></span>
        </a>
        <nav className="ml-8 hidden items-center gap-6 text-base text-muted md:flex">
          {links.map(([href, label]) => <a key={href} href={href} className="hover:text-ink">{label}</a>)}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden sm:block"><ThemeToggle /></div>
          <Link to="/login" className="hidden px-3 text-sm font-medium text-muted hover:text-ink sm:block">Staff login</Link>
          <Link to="/enquiry" className="inline-flex h-10 items-center rounded-lg bg-sun px-4 text-sm font-semibold text-sun-ink hover:bg-sun-strong">Free quote</Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section id="top" className="relative overflow-hidden px-4 pb-16 pt-12 sm:pt-20">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-sun-soft/60 blur-3xl" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
        <div className="text-center lg:text-left">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-sm font-medium text-muted">
            <BadgeCheck className="h-4 w-4 text-ok" /> PM Surya Ghar subsidy, handled for you
          </span>
          <h1 className="mt-5 text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
            Rooftop solar, done right.<br /><span className="text-[rgb(var(--sun))]">Your subsidy, kept safe.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-muted lg:mx-0">
            Cut your electricity bill with a solar system on your roof. We handle the survey, installation, government
            paperwork and service for 20 years, and you can follow every step from your phone.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
            <CTA>Get a free quote <ArrowRight className="h-5 w-5" /></CTA>
            <CTA to="#calculator" ghost><Calculator className="h-5 w-5" /> See your savings</CTA>
          </div>
          <p className="mt-4 text-sm text-faint">No payment to enquire. A solar advisor calls you within one working day.</p>
        </div>
        <div className="relative mx-auto aspect-[4/3] w-full max-w-xl overflow-hidden rounded-2xl border border-line shadow-xl">
          <LoginScene />
          <div className="absolute bottom-4 left-4 right-4 flex flex-wrap gap-2">
            {["Up to ₹78,000 subsidy", "20-year panel warranty"].map((t) => (
              <span key={t} className="rounded-full bg-white/90 px-3 py-1.5 text-sm font-semibold text-[#283618] shadow">{t}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Highlights() {
  const items = [
    { icon: IndianRupee, title: "Up to ₹78,000", text: "Government subsidy, paid straight to your bank" },
    { icon: BadgeCheck, title: "Made-in-India panels", text: "DCR panels, as the subsidy requires" },
    { icon: ShieldCheck, title: "20-year warranty", text: "On panels, starting the day they're delivered" },
    { icon: Wrench, title: "15-day repairs", text: "Every fault fixed within 15 days" },
  ];
  return (
    <div className="border-y border-line bg-surface px-4 py-10">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 lg:grid-cols-4">
        {items.map(({ icon: I, title, text }) => (
          <div key={title} className="flex flex-col items-center text-center">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-sun-soft text-[rgb(var(--sun))]"><I className="h-6 w-6" /></span>
            <p className="mt-3 text-lg font-semibold">{title}</p>
            <p className="mt-1 text-sm text-muted">{text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function HowItWorks() {
  const steps = [
    { icon: MessageCircle, title: "Tell us about your home", text: "Fill a 1-minute form, or call or WhatsApp us." },
    { icon: MapPin, title: "Free site survey", text: "An engineer checks your roof, shade and wiring." },
    { icon: FileCheck2, title: "Clear quote", text: "Every part listed, with your subsidy and payback worked out." },
    { icon: ClipboardCheck, title: "Approval first", text: "We install only after the electricity board approves." },
    { icon: Zap, title: "Installed in a day", text: "Photos, serials and your signature recorded on site." },
    { icon: IndianRupee, title: "Subsidy in your bank", text: "We follow up until the money is credited." },
  ];
  return (
    <Section id="how" eyebrow="How it works" title="From enquiry to savings in six steps"
      intro="One team handles everything, and you can track every step on your phone.">
      <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map(({ icon: I, title, text }, i) => (
          <li key={title} className="relative rounded-xl border border-line bg-surface p-6">
            <span className="absolute right-5 top-5 text-4xl font-bold text-line">{String(i + 1).padStart(2, "0")}</span>
            <span className="grid h-11 w-11 place-items-center rounded-lg bg-cell-soft text-cell"><I className="h-5 w-5" /></span>
            <h3 className="mt-4 text-lg font-semibold">{title}</h3>
            <p className="mt-1 text-muted">{text}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function SavingsCalculator() {
  const [bill, setBill] = useState(2500);
  const r = useMemo(() => {
    const ideal = bill / 1000;  // about 1 kW for every ₹1,000 of monthly bill
    const kw = SIZES.reduce((best, s) => (Math.abs(s - ideal) < Math.abs(best - ideal) ? s : best), SIZES[0]);
    const price = kw * PRICE_PER_KW;
    const subsidy = subsidyFor(kw);
    const monthly = Math.min(kw * GEN_PER_KW_PER_DAY * 30 * TARIFF, bill);
    const net = price - subsidy;
    return { kw, price, subsidy, monthly, net, years: net / (monthly * 12), life: monthly * 12 * 25 * 0.9 };
  }, [bill]);
  return (
    <Section id="calculator" eyebrow="Savings calculator" title="What could solar save you?"
      intro="Move the slider to your average monthly electricity bill." className="bg-sunken/50">
      <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_1.1fr]">
        <div className="rounded-2xl border border-line bg-surface p-7">
          <label htmlFor="bill" className="text-sm font-medium text-muted">Your monthly electricity bill</label>
          <p className="num mt-1 text-4xl font-semibold tracking-tight">{inr(bill)}</p>
          <input id="bill" type="range" min={500} max={8000} step={100} value={bill} onChange={(e) => setBill(Number(e.target.value))}
            className="mt-6 w-full accent-[rgb(var(--sun))]" />
          <div className="mt-1 flex justify-between text-sm text-faint"><span>₹500</span><span>₹8,000</span></div>
          <div className="mt-8 flex items-center gap-4 rounded-xl bg-sun-soft/60 p-5">
            <Sun className="h-10 w-10 shrink-0 text-[rgb(var(--sun))]" />
            <div><p className="text-sm text-muted">Suggested system</p>
              <p className="text-2xl font-semibold">{r.kw} kW rooftop solar</p></div>
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-7">
          <div className="grid grid-cols-2 gap-5">
            {[["You save every month", inr(r.monthly)], ["Pays for itself in", `${r.years.toFixed(1)} years`],
              ["Government subsidy", inr(r.subsidy)], ["Savings over 25 years", inr(r.life)]].map(([k, v]) => (
              <div key={k}><p className="text-sm text-muted">{k}</p><p className="num mt-1 text-2xl font-semibold tracking-tight">{v}</p></div>
            ))}
          </div>
          <dl className="mt-6 space-y-2 border-t border-line pt-5 text-base">
            <div className="flex justify-between"><dt className="text-muted">Typical system price</dt><dd className="num">{inr(r.price)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Subsidy to your bank</dt><dd className="num text-ok">− {inr(r.subsidy)}</dd></div>
            <div className="flex justify-between font-semibold"><dt>Your net cost</dt><dd className="num">{inr(r.net)}</dd></div>
          </dl>
          <Link to={`/enquiry?kw=${r.kw}&bill=${bill}`}
            className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-sun font-semibold text-sun-ink hover:bg-sun-strong">
            Get an exact quote for {r.kw} kW <ArrowRight className="h-5 w-5" />
          </Link>
          <p className="mt-3 text-center text-xs text-faint">An estimate for a grid-connected system. Your exact price comes after the free site survey.</p>
        </div>
      </div>
    </Section>
  );
}

function WhyUs() {
  const items = [
    { icon: ClipboardCheck, title: "Subsidy-safe paperwork",
      text: "Claims are often rejected for small mistakes: names that don't match, photos without location, the wrong panels. We check seven points before anything is submitted." },
    { icon: ScanLine, title: "Every part traceable",
      text: "Each panel and inverter is recorded by its serial number, so your warranty is never in doubt." },
    { icon: Gauge, title: "Track it like a delivery",
      text: "Get a live link on WhatsApp showing delivery, installation and every subsidy step until the money arrives." },
    { icon: QrCode, title: "Service with one scan",
      text: "A QR sticker on your inverter. Scan it, describe the problem, and we already know your system and warranty." },
  ];
  return (
    <Section id="why" eyebrow="Why Rayora" title="Built to protect your subsidy and your system"
      intro="We run every job on our own software, so nothing is forgotten, lost or delayed.">
      <div className="grid gap-5 md:grid-cols-2">
        {items.map(({ icon: I, title, text }) => (
          <div key={title} className="flex gap-5 rounded-xl border border-line bg-surface p-6">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-sun-soft text-[rgb(var(--sun))]"><I className="h-6 w-6" /></span>
            <div><h3 className="text-lg font-semibold">{title}</h3><p className="mt-1 text-muted">{text}</p></div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Systems() {
  const items = [
    { icon: Zap, title: "Grid-connected", tag: "Lowest bills", text: "Panels feed your home and send extra power to the grid through a net meter. Eligible for the subsidy." },
    { icon: BatteryCharging, title: "With battery backup", tag: "No power cuts", text: "Batteries store solar power for the evening and keep the lights on during outages." },
    { icon: PanelsTopLeft, title: "Panels only", tag: "Do it yourself", text: "Quality panels and parts delivered to your door, for customers with their own installer." },
  ];
  return (
    <Section eyebrow="Systems" title="The right system for your home" className="bg-sunken/50">
      <div className="grid gap-5 md:grid-cols-3">
        {items.map(({ icon: I, title, tag, text }) => (
          <div key={title} className="flex flex-col rounded-xl border border-line bg-surface p-6 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-cell-soft text-cell"><I className="h-7 w-7" /></span>
            <span className="mx-auto mt-4 rounded-full bg-sun-soft px-3 py-1 text-xs font-semibold text-[rgb(var(--sun-strong))]">{tag}</span>
            <h3 className="mt-3 text-xl font-semibold">{title}</h3>
            <p className="mt-2 flex-1 text-muted">{text}</p>
            <Link to="/enquiry" className="mt-5 inline-flex items-center justify-center gap-1 font-semibold text-[rgb(var(--sun))] hover:underline">
              Ask for a quote <ArrowRight className="h-4 w-4" /></Link>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Customers() {
  return (
    <section className="px-4 pb-4 pt-20">
      <div className="mx-auto grid max-w-6xl gap-5 md:grid-cols-2">
        <div className="rounded-2xl border border-line bg-surface p-7">
          <Home className="h-7 w-7 text-cell" />
          <h3 className="mt-3 text-xl font-semibold">Already a customer?</h3>
          <p className="mt-1 text-muted">Open the tracking link we sent you on WhatsApp to see where your installation and subsidy are right now.</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-7">
          <QrCode className="h-7 w-7 text-cell" />
          <h3 className="mt-3 text-xl font-semibold">Something not working?</h3>
          <p className="mt-1 text-muted">Scan the QR sticker on your inverter or battery with your phone camera, and tell us what's wrong. We'll fix it within 15 days.</p>
        </div>
      </div>
    </section>
  );
}

function Faq() {
  const qs = [
    ["How much subsidy can I get?", "Under PM Surya Ghar, ₹30,000 per kW for the first 2 kW and ₹18,000 for the third kW, up to ₹78,000 in total. It's paid directly into your bank account after the system is inspected."],
    ["Who is eligible?", "Homeowners with their own electricity connection and a roof that gets good sun. The names on your Aadhaar, electricity bill and bank account need to match, and we help you fix this before applying."],
    ["How long does it take?", "The installation itself usually takes a day. The full process, including the electricity board's approval, net meter and subsidy, takes a few weeks, and you can track every step."],
    ["Do I pay everything upfront?", "No. You pay an advance (at least 30%) to confirm, and the rest later. The subsidy then comes back to your bank account."],
    ["What if something breaks?", "Scan the QR sticker on your system to report it. Repairs under warranty are free, and every repair is fixed within 15 days."],
  ];
  return (
    <Section id="faq" eyebrow="Questions" title="Frequently asked questions">
      <div className="mx-auto max-w-3xl divide-y divide-line rounded-2xl border border-line bg-surface">
        {qs.map(([q, a]) => (
          <details key={q} className="group px-6 py-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-medium">
              {q}<ChevronDown className="h-5 w-5 shrink-0 text-muted transition-transform group-open:rotate-180" />
            </summary>
            <p className="mt-3 text-muted">{a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}

function FinalCta() {
  return (
    <section className="px-4 pb-20">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl bg-side px-6 py-16 text-center text-side-ink sm:px-12">
        <Sun className="mx-auto h-12 w-12 text-[#DDA15E]" />
        <h2 className="mx-auto mt-4 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">Ready to stop paying for sunshine you already have?</h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-side-muted">Tell us about your home in one minute. A solar advisor will call you within one working day.</p>
        <Link to="/enquiry" className="mt-8 inline-flex h-12 items-center gap-2 rounded-lg bg-[#BC6C25] px-7 text-base font-semibold text-[#FEFAE0] hover:bg-[#A35C1F]">
          Get my free quote <ArrowRight className="h-5 w-5" /></Link>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-line px-4 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 text-center sm:flex-row sm:justify-between sm:text-left">
        <div className="flex items-center gap-2.5"><BrandMark className="h-8 w-8" />
          <div className="leading-tight"><p className="font-semibold">Rayora</p><p className="text-xs text-muted">Smart solar by SunPower Solutions</p></div></div>
        <div className="flex items-center gap-5 text-sm text-muted">
          <a href="#how" className="hover:text-ink">How it works</a>
          <Link to="/enquiry" className="hover:text-ink">Get a quote</Link>
          <Link to="/login" className="hover:text-ink">Staff login</Link>
        </div>
      </div>
    </footer>
  );
}

/** Public, customer-facing home page. Every call to action leads to the enquiry form. */
export default function Landing() {
  return (
    <div className="min-h-screen bg-bg text-ink">
      <Header />
      <main>
        <Hero />
        <Highlights />
        <HowItWorks />
        <SavingsCalculator />
        <WhyUs />
        <Systems />
        <Customers />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}