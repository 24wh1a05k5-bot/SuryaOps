# Rayora

**Rooftop solar operations platform**, (Solar Installation Management System).

One system that takes a solar customer from first enquiry to a 20-year warranty: **subsidy-ready by design**, with **serial-level traceability** and **profit on every job**. Light and dark themes included.

The full product and technical spec is in [`spec.md`](spec.md).

---

## What's in it

| Area | What it does |
|---|---|
| **Leads** | Web form, call and WhatsApp enquiries in one inbox. Phone numbers are unique, so returning customers are detected. Qualification checks for roof, shade, bill and grid. |
| **Site surveys** | Technician records direction, tilt and cable run. **No quote until the survey is approved.** |
| **Quotes** | Pick a kit (On-Grid / Off-Grid / Panel set, 1–5 kW) and every part fills in automatically. Payback card shows savings, subsidy and years to break even. |
| **Confirm** | One transaction: reserves the exact serials (row locks, `SKIP LOCKED`), creates the pick list, crew job, invoice with advance payment, and the subsidy case. All or nothing. |
| **Purchases** | Receiving goods records every serial; duplicate or missing serials are refused. |
| **Dispatch** | Scanner screen: only serials reserved for *this* order are accepted; duplicate scans are refused; dispatch is blocked until everything is scanned. |
| **Warranty** | Starts automatically on delivery (2 years inverter/battery, 20 years panels). A QR sticker is generated per unit. |
| **Installation** | Mobile step-by-step form: serials, GPS-tagged photos, customer signature. Drafts are saved on the device so a weak rooftop signal loses nothing. Technicians can't be double-booked. |
| **Subsidy tracker** | Kanban board from application to money credited, with days in each stage. **Inspection gate:** submission stays blocked until names match, panels are DCR, serials are recorded, photos are geo-tagged, capacity is within sanction, and feasibility came before installation. |
| **Service** | Search by serial, or the customer scans the QR sticker. Warranty decides free or billable; out-of-warranty repairs invoice automatically. 15-day MNRE deadline with countdown. |
| **Finance** | Invoices with idempotent payments (no double charge, no overpayment). Technician pay from logged hours; a month can't be paid twice. |
| **Dashboard** | Profit per job from the exact cost of each serial used, plus labour and repairs. Money blocked by subsidy delays, overdue repairs and invoices. **Share:** CSV export, print/PDF report, and expiring read-only links with no personal data. |

### Why the subsidy gate
Research for this build found that PM Surya Ghar inspection rejections are mostly installer mistakes: photos without GPS, non-DCR panels, missing serials, capacity above sanction, or installing before feasibility approval. Each one is a rule the system enforces.

---

## Tech stack

- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS (design tokens as CSS variables for light and dark), Radix UI, TanStack Query, Recharts, lucide icons, sonner toasts, signature_pad. Inter font bundled locally.
- **Backend:** Python 3.11+, FastAPI, Pydantic v2, SQLAlchemy 2.0, Alembic, PostgreSQL 16, psycopg 3, JWT auth, bcrypt, slowapi rate limiting, qrcode, Pillow.
- **Everything runs locally.** No cloud services.

```
React SPA (Vite)  --/api, JSON + JWT-->  FastAPI: routers -> services -> SQLAlchemy  -->  PostgreSQL
  internal app + public pages                RBAC, one error format, rate limits          constraints, locks,
  (enquiry form, QR page, shared report)                                                  sequences
```

---

## Run it

### 1. Database
Either install PostgreSQL 16 locally, or use Docker:
```bash
docker compose up -d          # starts postgres with user/password/db = suryaops
```
With a local install, create the user and database once:
```bash
psql -U postgres -c "CREATE USER suryaops WITH PASSWORD 'suryaops' CREATEDB;"
psql -U postgres -c "CREATE DATABASE suryaops OWNER suryaops;"
```

### 2. Backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                    # change JWT_SECRET
alembic upgrade head                                    # create tables
python -m app.seed.seed                                 # demo data (use --reset to rebuild)
uvicorn app.main:app --reload --port 8000
```
API docs: http://localhost:8000/docs

### 3. Frontend
```bash
cd frontend
npm install
npm run dev
```
Open http://localhost:5173. The dev server proxies `/api` and `/uploads` to the backend.

**For the demo**, also open it on a phone on the same WiFi: `npm run dev` listens on your laptop's IP (shown in the terminal). Set `PUBLIC_BASE_URL` in `backend/.env` to that address so QR stickers point to it. Phone GPS needs HTTPS or localhost, so for the photo step either use the laptop browser or a tunnel.

### Reset before the demo
```bash
cd backend && python -m app.seed.seed --reset
```

### Tests
```bash
cd backend && pytest -q       # uses database suryaops_test (create it like the main one)
```
15 tests cover the critical rules: quote blocked without survey, non-DCR panels in subsidy orders, stock rollback, concurrent reservations, duplicate serials, warranty dates, double-booking, payment idempotency and overpayment, the inspection gate, feasibility before install, free vs billable repairs, pay runs, RBAC and the public QR page.

---

## Demo logins

All passwords: **`demo1234`**

| Role | Email | Lands on |
|---|---|---|
| Director (admin) | director@sunpower.in | Dashboard |
| Sales | priya@sunpower.in | Leads |
| Technician | ravi@sunpower.in | Installations |
| Warehouse | warehouse@sunpower.in | Dispatch |
| Support | support@sunpower.in | Service tickets |
| Accounts | accounts@sunpower.in | Invoices |

Public pages (no login): `/enquiry` (web form), `/u/legacy-demo-unit-0007` (QR page of an out-of-warranty inverter), `/shared/<token>` (shared report; create one from the dashboard).

---

## Demo script (5 minutes)

1. **`/enquiry`**: submit a web enquiry, then show it in Leads.
2. Open **Shabana Begum** (survey booked): *Build quote* is disabled, since there's no approved survey.
3. Open **Fatima Siddiqui** (survey approved): the readiness panel flags mismatched names. Build a 2 kW On-Grid quote; parts fill in and the payback card appears. Edit the quote, add the non-DCR panel: **blocked**.
4. Confirm with a 40% advance: the pick list, crew job, invoice and subsidy case appear automatically.
5. Sign in as **warehouse**, open the half-scanned pick list: scan a serial twice and it's **refused**; dispatch is blocked until all are scanned. Mark delivered and the warranty dates appear.
6. Sign in as **ravi**: open today's job, complete it on a phone-sized screen (serials, GPS photos, signature).
7. **Subsidy tracker**: open **Srinivas Goud** (Installed). The checklist shows the photo without GPS, and *Submit for inspection* stays disabled.
8. Open the **QR sticker sheet** for a delivered order, scan one with a phone, report a problem: a ticket appears for support, marked free repair.
9. **Dashboard**: profit per job (one loss-making job highlighted), money blocked by subsidy delays. *Share report* then open the link in an incognito window. Switch the theme to dark.

---

## Built for real-world load and failures

- **Concurrency:** transactions for every multi-step action, `SELECT … FOR UPDATE SKIP LOCKED` for stock, optimistic `version` columns (stale edits get a clear 409).
- **Money safety:** idempotency keys on confirm and payments; `CHECK (amount_paid <= total)` in the database.
- **Database as the last line of defence:** unique serials, phones, document numbers and pay runs; non-negative stock; valid time ranges.
- **Scale:** server-side pagination, filtering and search; indexes on hot paths; SQL aggregates with a 60-second dashboard cache that clears on writes; connection pool; GZip; route-level code splitting.
- **Resilience:** one error format with request IDs; JSON logs; health check; "connection lost" banner with auto-retry; GET retries with backoff; per-page error boundaries; install drafts saved on the device; per-photo upload retry; client-side image compression.
- **Security:** bcrypt, JWT, role checks on every route (technicians only see their own work), rate limits on login and public endpoints, public pages show minimal masked data, share links expire and can be revoked.

---

## Project layout

```
backend/
  app/core/       config, db, security, errors, logging, rate limits, RBAC
  app/models/     SQLAlchemy models (one file per domain)
  app/schemas/    Pydantic request bodies
  app/services/   all business rules and transactions
  app/routers/    HTTP only
  app/seed/       realistic demo data generated through the real services
  alembic/        migrations
  tests/          critical-rule tests
frontend/
  src/styles/     design tokens (light + dark)
  src/lib/        api client, auth, theme, formatting, hooks
  src/components/ ui kit + shared (shell, table, stepper, palette, capture)
  src/features/   one file per area
```