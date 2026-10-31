# Rayora Documentation

Rooftop solar operations platform for **SunPower Solutions**, built for the Odoo Hackathon final (Solar Installation Management System).

This document explains what the system does, how it is built, what every module is responsible for, and how to run, test and demo it. For the original product spec see [`spec.md`](spec.md); for a quick start see [`README.md`](README.md).

---

## Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Technology stack](#3-technology-stack)
4. [Setup and running](#4-setup-and-running)
5. [Roles and permissions](#5-roles-and-permissions)
6. [Business modules](#6-business-modules)
7. [Backend structure](#7-backend-structure)
8. [Frontend structure](#8-frontend-structure)
9. [Data model](#9-data-model)
10. [API reference](#10-api-reference)
11. [Error codes](#11-error-codes)
12. [Reliability, scale and security](#12-reliability-scale-and-security)
13. [Theming and design system](#13-theming-and-design-system)
14. [Seed data](#14-seed-data)
15. [Testing](#15-testing)
16. [Worked example: confirming an order](#16-worked-example-confirming-an-order)
17. [Odoo mapping](#17-odoo-mapping)
18. [Troubleshooting](#18-troubleshooting)
19. [Questions the jury may ask](#19-questions-the-jury-may-ask)

---

## 1. Overview

SunPower completes about 40 rooftop installations a month, holds high-value stock (panels, inverters, batteries), runs a 15-person crew and handles service calls. Today this runs on WhatsApp, calls and paper registers.

Rayora replaces that with one system that follows a customer from **"I'm interested"** to **"repaired in year 20"**:

```
Enquiry → Qualification → Site survey → Quote (from a kit) → Confirm
   → Stock reserved → Dispatch (serials scanned) → Delivery (warranty starts)
   → Installation (serials, GPS photos, signature) → Subsidy paperwork → Service → Profit
```

### What sets it apart

| Idea | What it does |
|---|---|
| **Subsidy-ready by design** | PM Surya Ghar inspection rejections are mostly installer mistakes: photos without GPS, non-DCR panels, missing serials, capacity above sanction, installing before feasibility, name mismatches. Each one is a rule the system enforces, and submission is blocked until the checklist passes. |
| **Serial-level traceability** | Every inverter, battery, charge controller and panel has its own record, from purchase receipt to the customer's roof. The exact unit cost of each serial feeds profit per job. |
| **QR sticker after-sales** | Each delivered unit gets a QR code. The customer scans it, sees their warranty, and raises a complaint already linked to that unit. |
| **Profit visibility** | Profit per job is computed from real costs: serials used, other parts, technician hours and warranty repairs. |

---

## 2. Architecture

```
┌──────────────────────────┐    HTTP + JSON (JWT)    ┌────────────────────────────┐        ┌─────────────────┐
│  React app (Vite)        │ ──────────────────────▶ │  FastAPI                    │  SQL   │  PostgreSQL 16  │
│  - internal app          │                         │  routers → services → ORM   │ ─────▶ │  constraints    │
│  - public pages          │ ◀────────────────────── │  RBAC, validation, errors   │        │  row locks      │
│  localhost:5173          │   one error format      │  localhost:8000             │        │  sequences      │
└──────────────────────────┘                         └────────────────────────────┘        └─────────────────┘
        Vite proxies /api and /uploads to the backend, so the browser sees one origin.
        Uploaded photos and signatures are stored in backend/uploads/.
```

**Three layers, one job each:**

- **Frontend:** displays data and sends requests. It hides buttons a role can't use, but it is never the security boundary.
- **Backend:** authenticates the user, checks the role, validates input and enforces every business rule.
- **Database:** stores data and enforces constraints as the last line of defence (unique serials, no overpayment, no negative stock).

**Everything runs locally.** No cloud services, CDNs or external APIs are needed. The font is bundled.

---

## 3. Technology stack

### Backend

| Technology | Role in Rayora |
|---|---|
| **Python 3.11+** | Language for all backend code |
| **FastAPI** | Web framework. Routes requests, injects dependencies (database session, current user), and generates interactive API docs at `/docs` |
| **Pydantic v2** | Validates request bodies before any code runs (phone format, ranges, allowed values) |
| **SQLAlchemy 2.0** | ORM: Python classes map to tables, rows to objects. Also provides optimistic locking via `version_id_col` |
| **Alembic** | Database migrations. `alembic upgrade head` creates the schema |
| **PostgreSQL 16** | Relational database: foreign keys, `UNIQUE` and `CHECK` constraints, transactions, `SELECT … FOR UPDATE SKIP LOCKED`, sequences |
| **psycopg 3** | PostgreSQL driver |
| **passlib + bcrypt** | Password hashing |
| **PyJWT** | Signed access tokens (8 hours) |
| **slowapi** | Rate limiting on login and public endpoints |
| **Pillow** | Validates and downsizes uploaded photos; generates seed images |
| **qrcode** | Generates QR sticker images |
| **pytest + httpx** | Automated tests through the real API |

### Frontend

| Technology | Role in Rayora |
|---|---|
| **React 18** | Component-based UI |
| **TypeScript** | Type safety across the app (strict mode) |
| **Vite** | Dev server with API proxy; production build with code splitting |
| **Tailwind CSS** | Styling through design tokens defined as CSS variables (light and dark) |
| **React Router 6** | URL to page mapping, role-protected routes |
| **TanStack Query 5** | Data fetching, caching (30 s), retries with backoff, loading and error states |
| **Radix UI** | Accessible dialog and dropdown-menu primitives |
| **Recharts** | Dashboard charts |
| **lucide-react** | Icons |
| **sonner** | Toast notifications |
| **signature_pad** | Customer signature capture |
| **@fontsource-variable/inter** | Inter font, bundled for offline use |

---

## 4. Setup and running

### Prerequisites
- Python 3.11 or newer
- Node.js 18 or newer
- PostgreSQL 16 (local install or Docker)

On a Mac with Homebrew:
```bash
brew install python@3.12 node postgresql@16
brew services start postgresql@16
```

### Database
Local install:
```bash
psql postgres -c "CREATE USER suryaops WITH PASSWORD 'suryaops' CREATEDB;"
psql postgres -c "CREATE DATABASE suryaops OWNER suryaops;"
psql postgres -c "CREATE DATABASE suryaops_test OWNER suryaops;"   # only for tests
```
Or Docker, from the project root:
```bash
docker compose up -d
```

### Backend (terminal 1)
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                 # then change JWT_SECRET
alembic upgrade head                 # create tables
python -m app.seed.seed              # load demo data
uvicorn app.main:app --reload --port 8000
```
API docs: http://localhost:8000/docs

### Frontend (terminal 2)
```bash
cd frontend
npm install
npm run dev
```
App: http://localhost:5173

### Environment variables (`backend/.env`)

| Variable | Purpose | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection | `postgresql+psycopg://suryaops:suryaops@localhost:5432/suryaops` |
| `JWT_SECRET` | Signs login tokens; use a long random string | — |
| `CORS_ORIGINS` | Allowed frontend origins | `http://localhost:5173,http://127.0.0.1:5173` |
| `PUBLIC_BASE_URL` | Base for QR sticker links and share links | `http://localhost:5173` |

### Useful commands

| Command | What it does |
|---|---|
| `python -m app.seed.seed --reset` | Drop all tables and rebuild clean demo data |
| `pytest -q` | Run the rule tests against `suryaops_test` |
| `uvicorn app.main:app --workers 4 --port 8000` | Run with several workers (production-style) |
| `npm run build` | Type-check and build the frontend into `dist/` |
| `alembic revision --autogenerate -m "..."` | Create a migration after changing a model |

### Demo on a phone
`npm run dev` prints a network address (for example `http://192.168.1.20:5173`). Open it on a phone on the same WiFi, and set `PUBLIC_BASE_URL` to that address so QR stickers point to it. Browsers only share GPS on HTTPS or `localhost`, so for the photo step use the laptop browser or an HTTPS tunnel.

---

## 5. Roles and permissions

| Role | Demo login | Can do |
|---|---|---|
| **Director (admin)** | director@sunpower.in | Everything, including settings and share links |
| **Sales** | priya@sunpower.in | Leads, surveys (approve), quotes, orders, job scheduling, subsidy tracker |
| **Technician** | ravi@sunpower.in | Own surveys, own installation jobs, own tickets; delivery |
| **Warehouse** | warehouse@sunpower.in | Purchases, receiving, stock, dispatch, delivery |
| **Support** | support@sunpower.in | Tickets, serial lookup, leads (read) |
| **Accounts** | accounts@sunpower.in | Invoices, payments, technician pay, dashboard, reports |

All demo passwords: **`demo1234`**.

**How it's enforced:** every route uses `require_roles(...)` in `core/deps.py`. The admin role passes every check. Technicians also get **row-level filtering**: job, survey and ticket lists only return their own work, and opening someone else's job returns `FORBIDDEN`. The frontend mirrors this with `can(user, ...roles)` to hide menus and buttons.

---

## 6. Business modules

Each module lists its workflow, its rules (with the error code it returns), and where the code lives.

### 6.1 CRM: leads and qualification
**Files:** `services/crm.py`, `routers/crm.py`, `features/Leads.tsx`, public form in `features/Public.tsx`

**Status flow:** `new → contacted → qualified → survey_scheduled → survey_approved → quoted → won | lost`

| Rule | Behaviour | Code |
|---|---|---|
| Phone is unique per customer | A repeat enquiry attaches a new lead to the existing customer and shows "Returning customer" | — |
| Qualification needs data | Roof area, shade, grid suitability and monthly bill must be filled | `QUALIFICATION_INCOMPLETE` |
| Unsuitable roof or grid | Can't qualify; mark lost instead | `NOT_SUITABLE` |
| Subsidy readiness | Warns if names on Aadhaar, bill and bank differ (case and spacing ignored) or the bank isn't Aadhaar-seeded | shown as a warning |
| Losing a lead | Needs a reason | `LOST_REASON_REQUIRED` |
| Going cold | New or contacted leads with no activity for 48 hours get a badge | — |

The public enquiry form (`/enquiry`) posts to `POST /public/leads`, rate-limited to 5 per minute per IP.

### 6.2 Site surveys
**Files:** `services/crm.py`, `features/Surveys.tsx`

**Status flow:** `scheduled → submitted → approved | rejected`

| Rule | Code |
|---|---|
| Lead must be qualified to book a survey | `LEAD_NOT_QUALIFIED` |
| Only one open survey per lead | `SURVEY_ALREADY_OPEN` |
| Only the assigned technician (or admin) can submit | `FORBIDDEN` |
| Tilt 0–90°, cable distance ≥ 0 (Pydantic and DB `CHECK`) | `VALIDATION_ERROR` |
| Rejection needs a reason | `VALIDATION_ERROR` |
| Approval moves the lead to `survey_approved` | — |

### 6.3 Products and kits
**Files:** `models/catalog.py`, `routers/sales.py`

- **Products** have a category (panel, inverter, battery, charge controller, structure, wiring, safety, service), cost and sale price, warranty months, and two flags: `is_serialized` (tracked per unit) and `is_dcr` (domestically made panel, required for subsidy).
- **Kit templates** are ready-made bills of materials: Panel Set, On-Grid and Off-Grid in 1, 2, 3 and 5 kW. Off-Grid kits include batteries and a charge controller. Panel sets have `includes_installation = false`.
- Installation is a **service product** (priced per kW, no stock).

### 6.4 Quotes and orders
**Files:** `services/sales.py`, `routers/sales.py`, `features/Orders.tsx`, quote builder in `features/Leads.tsx`

**Status flow:** `draft → sent → confirmed → dispatched → delivered → completed | cancelled`. Panel-only sets go straight from `delivered` to `completed`.

| Rule | Code |
|---|---|
| No quote until the site survey is approved | `SURVEY_NOT_APPROVED` |
| Choosing a kit copies every kit line into the order | — |
| Subsidy orders can only contain DCR panels | `NON_DCR_PANEL_IN_SUBSIDY_ORDER` |
| Panel-only sets can't be subsidy orders | `SUBSIDY_NEEDS_INSTALLATION` |
| Only draft or sent quotes can be edited | `ORDER_LOCKED` |
| Confirm needs an advance of at least `min_advance_percent` (30%) | `ADVANCE_TOO_LOW` |
| Advance can't exceed the total | `ADVANCE_TOO_HIGH` |
| Not enough stock rolls everything back | `INSUFFICIENT_STOCK` |
| Cancelling a confirmed order releases its reservations | — |

**Expected subsidy** uses editable settings: ₹30,000 per kW for the first 2 kW, ₹18,000 for the 3rd kW, capped at ₹78,000.

**Payback card:** yearly units = kW × units per kW per day × 365; savings = units × tariff; net cost = total − expected subsidy; payback = net cost ÷ yearly savings.

**Confirming** is one database transaction; see [section 16](#16-worked-example-confirming-an-order).

### 6.5 Purchases and stock
**Files:** `services/stock.py`, `routers/ops.py`, `features/Operations.tsx`

**Purchase flow:** `draft → ordered → received`

| Rule | Code |
|---|---|
| Number of serials must equal the quantity for serialized products | `SERIAL_COUNT_MISMATCH` |
| Serials must be unique (checked in code and by the DB) | `DUPLICATE_SERIAL` |
| A received purchase can't be received again or edited | `ALREADY_RECEIVED` |
| Services can't be purchased | `INVALID_PRODUCT` |

Receiving creates one `stock_units` row per serial (status `in_stock`, with that purchase line's unit cost), or increases `qty_on_hand` for quantity-tracked items. The stock page shows on hand, reserved, available, value, and flags items below their reorder level.

**Stock unit status:** `in_stock → reserved → dispatched → delivered → installed` (or `returned` when replaced under warranty).

### 6.6 Dispatch, delivery and warranty
**Files:** `services/stock.py`, `features/Operations.tsx` (`DispatchScanner`)

| Rule | Code |
|---|---|
| Serial must exist | `SERIAL_NOT_FOUND` |
| Serial must be reserved for this order | `SERIAL_NOT_RESERVED`, `SERIAL_OTHER_ORDER` |
| A serial can't be scanned twice | `SERIAL_ALREADY_SCANNED` |
| Dispatch only when every serialized line is fully scanned | `SCAN_INCOMPLETE` |
| Only confirmed orders can be dispatched | `INVALID_TRANSITION` |

**On delivery** (automatic, per unit): status becomes `delivered`, the unit is linked to the customer, `warranty_end = delivery date + warranty months` (24 for inverters and batteries, 240 for panels), and a random `qr_token` is generated for the sticker.

The QR sticker sheet (`/orders/:id/qr`) prints one code per unit, linking to `/u/<token>`.

### 6.7 Installation jobs
**Files:** `services/field.py`, `routers/ops.py`, `features/Jobs.tsx`, `components/shared/Capture.tsx`

**Status flow:** `unscheduled → scheduled → in_progress → customer_accepted | cancelled`

| Rule | Code |
|---|---|
| A technician can't be booked on overlapping jobs | `TECHNICIAN_DOUBLE_BOOKED` |
| End must be after start | `INVALID_TIME_RANGE` |
| Materials must be delivered before starting | `NOT_DELIVERED` |
| Subsidy jobs can't start before DISCOM feasibility approval | `FEASIBILITY_NOT_APPROVED` |
| Only serials dispatched for this order can be recorded | `SERIAL_NOT_ON_ORDER` |
| Every delivered serial must be recorded before completion | `SERIALS_NOT_RECORDED` |
| Roof and inverter-serial photos are required | `PHOTOS_MISSING` |
| Installed kW can't exceed sanctioned kW on subsidy jobs | `CAPACITY_OVER_SANCTION` |
| Customer signature required | `INVALID_SIGNATURE` / Pydantic |

**The mobile flow** has three steps (Serials → Photos → Sign-off):
- Photos are compressed in the browser to 1600 px and uploaded with **latitude, longitude and timestamp** from the phone's location.
- Each upload shows progress and has its own **Retry** button.
- The form saves a **draft on the device** after every change, so a dropped signal loses nothing.
- The signature pad keeps the strokes when the screen rotates or the keyboard closes.

**On completion:** a time log is written for technician pay, units become `installed`, the order becomes `completed`, and the subsidy case moves to `installed`.

### 6.8 Subsidy tracker and inspection gate
**Files:** `services/field.py` (`inspection_checklist`, `submit_inspection`, `advance_case`), `features/Subsidy.tsx`

**Stage flow:** `applied → feasibility_approved → installed → inspection_submitted → net_meter_installed → subsidy_credited`

- A case is created automatically when a subsidy order is confirmed.
- The board shows days in the current stage; cards turn red after `subsidy_stage_sla_days` (30).
- Every stage change is logged in `subsidy_events`.
- `installed` is set automatically by job completion; the other stages are moved by sales.

| Rule | Code |
|---|---|
| Feasibility needs the portal application number | `APPLICATION_NO_REQUIRED` |
| Stages must move in order | `INVALID_TRANSITION` |
| Inspection can only be submitted when every check passes | `INSPECTION_NOT_READY` |

**The inspection checklist:**
1. Names match on Aadhaar, bill and bank, and the bank is Aadhaar-seeded
2. All panels are DCR
3. Every panel serial and the inverter serial are recorded
4. Required photos are present, each geo-tagged and timestamped
5. Installed capacity is within the sanctioned capacity
6. Feasibility was approved before installation started
7. The customer signed the installation report

Each failed check has a **Fix** link to the screen where it can be corrected.

### 6.9 Service tickets
**Files:** `services/support.py`, `routers/service.py`, `features/Service.tsx`, QR page in `features/Public.tsx`

**Status flow:** `open → assigned → in_progress → resolved → closed`

**Ways in:** support searches by serial (warranty shown immediately), or the customer scans the QR sticker and fills in the problem (`channel = qr`).

| Rule | Code |
|---|---|
| `in_warranty` is decided automatically from the unit's warranty end date | — |
| Due date is 15 days after opening (`ticket_sla_days`) | — |
| One open ticket per unit | `TICKET_ALREADY_OPEN` |
| The unit must have been delivered to a customer | `UNIT_NOT_DELIVERED` |
| Serialized replacement parts need the replacement's serial | `REPLACEMENT_SERIAL_REQUIRED`, `REPLACEMENT_NOT_AVAILABLE` |
| Resolving needs work recorded | `NO_WORK_RECORDED` |
| Resolving needs an after-repair photo with GPS | `AFTER_REPAIR_PHOTO_REQUIRED`, `PHOTO_NOT_GEOTAGGED` |
| Closing needs the customer's confirmation | `CUSTOMER_CONFIRMATION_REQUIRED` |

**Money:** each line records the price to the customer and the cost to the company. In warranty, the customer pays ₹0 but the cost still counts against that job's profit. Out of warranty, an invoice is created automatically on resolve. A replacement unit gets its own new warranty, and the old unit is marked `returned`.

### 6.10 Invoices and payments
**Files:** `services/finance.py`, `features/Finance.tsx`

**Status flow:** `draft → sent → partially_paid → paid`. **Overdue** is computed, not stored: sent or partially paid with the due date passed.

- Created automatically on order confirmation (full price, with the advance as the first payment) and on billable ticket resolution.
- Numbers like `INV-2026-0001` come from a PostgreSQL sequence, so they're unique even under concurrent requests.
- The invoice page prints cleanly (Print or save PDF).
- The subsidy is paid by the government to the **customer's** bank, so the company always invoices the full price.

| Rule | Code |
|---|---|
| Every payment needs an `Idempotency-Key` header; repeating it returns the original payment | `IDEMPOTENCY_KEY_REQUIRED` |
| A payment can't exceed the balance (also a DB `CHECK`) | `OVERPAYMENT` |
| Fully paid invoices accept no more payments | `INVOICE_SETTLED` |

### 6.11 Technician pay
**Files:** `services/finance.py`, `features/Finance.tsx` (`TechnicianPay`)

Hours come from time logs written automatically on job completion and ticket resolution. The monthly summary shows tasks, hours, rate and amount, and **Mark as paid** creates a pay run.

| Rule | Code |
|---|---|
| A technician can't be paid twice for the same month (`UNIQUE(technician_id, month)`) | `ALREADY_PAID` |
| Future months can't be paid | `FUTURE_MONTH` |
| A month with no hours can't be paid | `NO_HOURS` |

### 6.12 Dashboard, reports and sharing
**Files:** `services/reports.py`, `features/Dashboard.tsx`, `features/Public.tsx`

**Period filter:** Today, This week, This month, Last 90 days, Custom.

**KPIs:** revenue, costs, profit and margin, money blocked by subsidy delays, open installations, open repairs (overdue count), outstanding invoices (overdue count), loss-making jobs.

**Profit per job** = order total − Σ unit cost of the exact serials used − (quantity × cost) for other parts − (hours × technician rate) − warranty repair costs on that order's units. Loss-making rows are tinted red.

**Money blocked by subsidy delays** = unpaid invoice balances on subsidy orders not yet at net metering.

**Sharing the numbers:**
1. **Export CSV:** profit per job, invoices, tickets, technician pay, subsidy cases.
2. **Print report:** a print-optimised page (`/reports/print`); use the browser's Save as PDF.
3. **Share link:** a read-only page at `/shared/<token>`. The token is 32 random bytes, the link expires (1–90 days), can be revoked, and every view is logged. Customer names are shortened ("R. Varma") and no phone numbers or addresses are shown.

### 6.13 Global search
`GET /search?q=` searches customers (name, phone), serials, orders, tickets and invoices. Opened with **Ctrl+K** (⌘K on Mac) from anywhere in the app.

### 6.14 Settings
Director only. Company name, minimum advance, invoice due days, GST, repair labour rate, subsidy rates and cap, subsidy stage deadline, generation per kW per day, tariff, repair deadline. Stored in the `settings` table; defaults in `services/common.py`.

---

## 7. Backend structure

```
backend/
├── app/
│   ├── main.py            app setup: middleware, error handlers, routers, /uploads
│   ├── core/              shared plumbing
│   ├── models/            tables
│   ├── schemas/           request validation
│   ├── services/          business rules
│   ├── routers/           HTTP endpoints
│   └── seed/              demo data
├── alembic/               migrations
├── tests/                 rule tests
├── uploads/               photos and signatures
├── requirements.txt
└── .env.example
```

### Layering rule
```
request → router (HTTP only) → service (rules + transaction) → models → PostgreSQL
```
Routers never contain business logic. Services never deal with HTTP. This keeps every rule in one place and testable.

### `core/`

| File | Responsibility |
|---|---|
| `config.py` | Reads settings from environment / `.env` |
| `db.py` | Engine with connection pool (10 + 20 overflow, pre-ping), session per request, timestamp mixin |
| `security.py` | bcrypt hashing, JWT create and decode |
| `deps.py` | `get_current_user` and `require_roles(...)` |
| `errors.py` | `AppError` class and handlers that turn every error (business, validation, database conflict, stale version, rate limit, crash) into one JSON format |
| `logging.py` | JSON logs and request-ID middleware |
| `ratelimit.py` | slowapi limiter |

### `models/`

| File | Tables |
|---|---|
| `users.py` | `users`, `settings`, `activity_log` |
| `crm.py` | `customers`, `leads`, `lead_notes`, `surveys` |
| `catalog.py` | `products`, `kit_templates`, `kit_lines`, `suppliers`, `purchases`, `purchase_lines`, `stock_units` |
| `sales.py` | `orders`, `order_lines`, `pick_lists` |
| `field.py` | `jobs`, `job_serials`, `photos`, `time_logs`, `pay_runs`, `subsidy_cases`, `subsidy_events` |
| `money.py` | `tickets`, `ticket_lines`, `invoices`, `invoice_lines`, `payments`, `shared_reports`, `report_views` |
| `__init__.py` | Imports everything; defines the four number sequences |

### `services/`

| File | Responsibility |
|---|---|
| `common.py` | Default settings, clock, money rounding, month arithmetic, document numbers, subsidy formula, pagination, audit log |
| `crm.py` | Leads, qualification, subsidy readiness, notes, surveys |
| `sales.py` | Quotes, order editing, DCR rule, confirm transaction, cancel, payback |
| `stock.py` | Purchases, receiving, stock summary, scanning, dispatch, delivery and warranty |
| `field.py` | Job scheduling and completion, photo and signature storage, subsidy stages, inspection checklist |
| `support.py` | Tickets, parts and labour, replacements, resolve and close |
| `finance.py` | Invoices, idempotent payments, pay summary, pay runs |
| `reports.py` | Profit per job, dashboard (with cache), CSV exports, share links, search |
| `serializers.py` | Converts models into consistent JSON shapes |

### `routers/`

| File | Endpoints |
|---|---|
| `core.py` | auth, users, settings, activity, search, health |
| `crm.py` | customers, leads, surveys |
| `sales.py` | products, kits, suppliers, quotes, orders, QR sheet |
| `ops.py` | purchases, stock, pick lists, delivery, jobs, subsidy |
| `service.py` | tickets, invoices, payments, technician pay, dashboard, reports, share links, public endpoints |

---

## 8. Frontend structure

```
frontend/src/
├── main.tsx               providers: theme, query client, router, auth, toasts
├── app/App.tsx            routes, role protection, lazy loading
├── styles/index.css       design tokens (light + dark), base styles, print styles
├── lib/                   non-visual logic
├── components/ui/         basic building blocks
├── components/shared/     larger reusable pieces
└── features/              pages, one file per business area
```

### `lib/`

| File | Responsibility |
|---|---|
| `api.ts` | The single API client: adds the token, idempotency keys, query strings; turns errors into `ApiError`; signals connection loss; CSV downloads |
| `auth.tsx` | Login state, session restore, logout on 401, `can()` role check, home page per role |
| `theme.tsx` | Light / Dark / System choice, saved per device, applied to `<html data-theme>` |
| `status.ts` | Status → colour map and stage lists for every workflow |
| `format.ts` | ₹ (Indian grouping), compact lakhs and crores, dates, relative times |
| `hooks.ts` | `useList` (paged lists), `useAction` (mutations with toasts and refresh), `useDebounced`, `useOnline` |
| `chart.ts` | Resolves theme colours for charts |
| `utils.ts` | Class merging, IDs, safe localStorage |

### `components/ui/`

| File | Components |
|---|---|
| `button.tsx` | Button (primary, secondary, ghost, subtle, danger; loading state) |
| `form.tsx` | Input, Select, Textarea, Field (label, hint, error), Toggle, `fieldErrors()` |
| `surface.tsx` | Card, CardHeader, Badge, StatusBadge, Skeleton, Spec (key-value list), Callout |
| `dialog.tsx` | Dialog, ConfirmDialog |
| `menu.tsx` | Dropdown menu |

### `components/shared/`

| File | Responsibility |
|---|---|
| `AppShell.tsx` | Sidebar (role-filtered), top bar, account menu, connection banner, Ctrl+K |
| `DataTable.tsx` | Tables with paging, search, filter chips, skeletons, empty and error states |
| `StatusStepper.tsx` | Odoo-style chevron progress bar |
| `Kpi.tsx` | KPI strip |
| `CommandPalette.tsx` | Global search dialog |
| `Capture.tsx` | Photo capture (compression, GPS, retry) and signature pad |
| `Activity.tsx` | Audit timeline |
| `ThemeToggle.tsx` | Light / Dark / System switch |
| `ErrorBoundary.tsx` | Keeps one broken page from blanking the app |
| `EmptyState.tsx`, `PageHeader.tsx`, `Brand.tsx` | Layout and branding |

### `features/`

| File | Screens | Main users |
|---|---|---|
| `Login.tsx` | Sign-in | Everyone |
| `Dashboard.tsx` | Business overview, share dialog | Director, accounts |
| `Leads.tsx` | Lead list, lead detail, qualification, quote builder | Sales |
| `Surveys.tsx` | Survey list, survey report form | Sales, technicians |
| `Orders.tsx` | Order list, order detail, quote editor, confirm, QR sheet | Sales |
| `Operations.tsx` | Purchases, receiving, stock, dispatch list, scanner | Warehouse |
| `Jobs.tsx` | Job list, scheduling, mobile install flow | Technicians, sales |
| `Subsidy.tsx` | Kanban board, case drawer with checklist | Sales, accounts |
| `Service.tsx` | Ticket list, new ticket, ticket detail | Support, technicians |
| `Finance.tsx` | Invoices, invoice detail, payments, technician pay, settings | Accounts, director |
| `Public.tsx` | Enquiry form, QR warranty page, shared report, print report | Customers, outsiders |

### Routes

| Path | Page | Roles |
|---|---|---|
| `/login` | Sign-in | Public |
| `/enquiry` | Web enquiry form | Public |
| `/u/:token` | QR warranty and complaint page | Public |
| `/shared/:token` | Shared read-only report | Public |
| `/dashboard` | Dashboard | Accounts, director |
| `/reports/print` | Printable report | Accounts, director |
| `/leads`, `/leads/:id` | Leads | Sales, support |
| `/surveys` | Surveys | Sales, technician |
| `/orders`, `/orders/:id`, `/orders/:id/qr` | Orders, QR stickers | Sales and others |
| `/purchases`, `/purchases/:id` | Purchases | Warehouse |
| `/stock` | Stock and serials | Warehouse, sales, support, accounts |
| `/dispatch`, `/dispatch/:id` | Dispatch, scanner | Warehouse |
| `/jobs`, `/jobs/:id` | Installations | Technician, sales, warehouse |
| `/subsidy` | Subsidy tracker | Sales, accounts |
| `/tickets`, `/tickets/:id` | Service tickets | Support, technician |
| `/invoices`, `/invoices/:id` | Invoices | Accounts, sales |
| `/technician-pay` | Technician pay | Accounts |
| `/settings` | Settings | Director |

---

## 9. Data model

31 tables. Conventions: `id` primary key, `created_at` / `updated_at` timestamps, money as `NUMERIC(12,2)`, statuses as text with `CHECK` constraints, and a `version` column on workflow tables for optimistic locking.

### Relationships

```
customers ─┬─< leads ─┬─< surveys
           │          └─< lead_notes
           ├─< orders ─┬─< order_lines >── products ─< kit_lines >── kit_templates
           │           ├── pick_list
           │           ├── job ─┬─< job_serials >── stock_units
           │           │        └─< photos (owner_type = job)
           │           ├── subsidy_case ─< subsidy_events
           │           └─< invoices ─┬─< invoice_lines
           │                          └─< payments
           ├─< stock_units (after delivery) >── purchase_lines >── purchases >── suppliers
           └─< tickets ─┬─< ticket_lines
                        ├─< photos (owner_type = ticket)
                        └── invoice (if billable)
users ─< time_logs, pay_runs, activity_log, shared_reports ─< report_views
settings (key → JSON value)
```

### Key constraints (the database's own safety net)

| Constraint | Protects against |
|---|---|
| `customers.phone UNIQUE` | Duplicate customers |
| `stock_units.serial_no UNIQUE` | The same serial existing twice |
| `job_serials.stock_unit_id UNIQUE` | A unit installed on two jobs |
| `invoices CHECK (amount_paid >= 0 AND amount_paid <= total)` | Overpayment |
| `invoices CHECK (order_id IS NOT NULL OR ticket_id IS NOT NULL)` | Orphan invoices |
| `payments.idempotency_key UNIQUE` | Recording the same payment twice |
| `products CHECK (qty_on_hand >= 0, qty_reserved <= qty_on_hand)` | Negative or over-reserved stock |
| `pay_runs UNIQUE (technician_id, month)` | Paying a month twice |
| `jobs CHECK (scheduled_end > scheduled_start)`, `time_logs CHECK (ended_at > started_at)` | Impossible time ranges |
| `surveys CHECK (tilt 0–90, cable ≥ 0)` | Invalid survey data |
| `orders.number`, `invoices.number`, `tickets.number`, `purchases.number UNIQUE` + sequences | Duplicate document numbers |
| `CHECK (status IN (...))` on every workflow table | Unknown statuses |

### Indexes
Foreign keys throughout, plus `leads(status, created_at)`, `orders(status, created_at)`, `stock_units(product_id, status)`, `jobs(technician_id, scheduled_start)`, `tickets(status, due_by)`, `invoices(status, due_date)` and `photos(owner_type, owner_id)`.

---

## 10. API reference

Base path: **`/api/v1`**. Interactive docs with request and response examples: **http://localhost:8000/docs**.

All requests except public ones need `Authorization: Bearer <token>`. List endpoints accept `page`, `page_size` (max 100) and filters, and return `{ items, total, page, page_size }`.

| Area | Method and path | Purpose |
|---|---|---|
| **Auth** | `POST /auth/login` | Sign in, returns token and user |
| | `GET /auth/me` | Current user |
| **Core** | `GET /users?role=` | Active users (for pickers) |
| | `GET /settings`, `PATCH /settings` | Read, update settings |
| | `GET /activity?entity=&entity_id=` | Audit timeline |
| | `GET /search?q=` | Global search |
| | `GET /health` | App and database check |
| **CRM** | `GET /customers`, `GET /customers/{id}` | Customers, with subsidy readiness |
| | `GET /leads`, `POST /leads` | List (`q`, `status`, `source`, `sort`), create |
| | `GET /leads/{id}`, `PATCH /leads/{id}` | Detail, update qualification |
| | `POST /leads/{id}/transition` | `contacted`, `qualified`, `lost` |
| | `POST /leads/{id}/notes` | Add a note |
| | `POST /leads/{id}/surveys` | Book a survey |
| | `GET /surveys` | List (technicians see their own) |
| | `POST /surveys/{id}/submit`, `/approve`, `/reject` | Survey workflow |
| **Catalog** | `GET /products`, `GET /kits`, `GET /suppliers` | Reference data |
| **Orders** | `POST /leads/{id}/quote` | Create a quote from a kit |
| | `GET /orders`, `GET /orders/{id}` | List, detail (lines, units, pick list, job, invoice, subsidy, payback) |
| | `PATCH /orders/{id}` | Edit lines, subsidy flag, sanctioned kW |
| | `POST /orders/{id}/send` | Mark quote sent |
| | `POST /orders/{id}/confirm` | Confirm with advance (`Idempotency-Key` header) |
| | `POST /orders/{id}/cancel` | Cancel and release stock |
| | `GET /orders/{id}/payback`, `GET /orders/{id}/qr-sheet` | Payback, QR stickers |
| **Purchases** | `GET /purchases`, `POST /purchases`, `GET /purchases/{id}` | Purchases |
| | `POST /purchases/{id}/order`, `POST /purchases/{id}/receive` | Workflow, receive with serials |
| **Stock** | `GET /stock/summary`, `GET /stock/units?serial=` | Stock levels, unit lookup |
| **Dispatch** | `GET /pick-lists`, `GET /pick-lists/{id}` | Pick lists with progress |
| | `POST /pick-lists/{id}/scan`, `/unscan`, `/dispatch` | Scanning and dispatch |
| | `POST /orders/{id}/deliver` | Delivery, starts warranty |
| **Jobs** | `GET /jobs`, `GET /jobs/{id}` | Jobs (technicians see their own) |
| | `POST /jobs/{id}/schedule`, `/start`, `/serials`, `/complete` | Job workflow |
| | `POST /jobs/{id}/photos` | Multipart: `file`, `kind`, `lat`, `lng`, `taken_at` |
| **Subsidy** | `GET /subsidy`, `GET /subsidy/{id}`, `GET /subsidy/{id}/checklist` | Board, case, checklist |
| | `POST /subsidy/{id}/advance`, `POST /subsidy/{id}/submit-inspection` | Stage workflow |
| **Tickets** | `GET /tickets`, `POST /tickets`, `GET /tickets/{id}`, `PATCH /tickets/{id}` | Tickets, assign, start |
| | `POST /tickets/{id}/lines`, `/photos`, `/resolve`, `/close` | Repair workflow |
| **Finance** | `GET /invoices`, `GET /invoices/{id}`, `POST /invoices/{id}/send` | Invoices |
| | `POST /invoices/{id}/payments` | Payment (`Idempotency-Key` required) |
| | `GET /technicians/pay?month=`, `POST /technicians/{id}/pay-runs` | Technician pay |
| **Reports** | `GET /dashboard?d_from=&d_to=` | Dashboard data |
| | `GET /reports/{name}.csv` | `profit_per_job`, `invoices`, `tickets`, `technician_pay`, `subsidy` |
| | `GET /shared-reports`, `POST /shared-reports`, `DELETE /shared-reports/{id}` | Share links |
| **Public** | `POST /public/leads` | Web enquiry (5/min) |
| | `GET /public/units/{token}`, `POST /public/units/{token}/tickets` | QR page and complaint |
| | `GET /public/units/{token}/qr.png` | Sticker image |
| | `GET /public/shared/{token}` | Shared report |

---

## 11. Error codes

Every error has the same shape:
```json
{ "error": { "code": "SURVEY_NOT_APPROVED",
             "message": "A quote can't be created until the site survey is approved.",
             "details": { "lead_id": 42 },
             "request_id": "a1b2c3d4e5f6" } }
```

| HTTP | Meaning |
|---|---|
| 400 | A business rule blocked the action |
| 401 | Not signed in or session expired |
| 403 | Role not allowed |
| 404 | Not found |
| 409 | Conflict: duplicate, stale version, double booking, insufficient stock |
| 410 | Share link expired |
| 422 | Input failed validation (field messages in `details.fields`) |
| 429 | Rate limited |
| 500 | Unexpected error (generic message; details in server logs with the request ID) |

### By area

| Area | Codes |
|---|---|
| Auth and access | `INVALID_CREDENTIALS`, `ACCOUNT_DISABLED`, `UNAUTHENTICATED`, `SESSION_EXPIRED`, `FORBIDDEN` |
| General | `NOT_FOUND`, `VALIDATION_ERROR`, `CONFLICT`, `STALE_VERSION`, `INVALID_TRANSITION`, `RATE_LIMITED`, `INTERNAL_ERROR`, `INVALID_DATE`, `INVALID_PERIOD` |
| Leads and surveys | `QUALIFICATION_INCOMPLETE`, `NOT_SUITABLE`, `LOST_REASON_REQUIRED`, `LEAD_CLOSED`, `LEAD_NOT_QUALIFIED`, `SURVEY_ALREADY_OPEN`, `INVALID_TECHNICIAN` |
| Quotes and orders | `SURVEY_NOT_APPROVED`, `INVALID_KIT`, `INVALID_PRODUCT`, `EMPTY_ORDER`, `ORDER_LOCKED`, `NON_DCR_PANEL_IN_SUBSIDY_ORDER`, `SUBSIDY_NEEDS_INSTALLATION`, `ADVANCE_TOO_LOW`, `ADVANCE_TOO_HIGH`, `ALREADY_CONFIRMED`, `INSUFFICIENT_STOCK`, `CANNOT_CANCEL` |
| Purchases and stock | `INVALID_SUPPLIER`, `SERIAL_COUNT_MISMATCH`, `DUPLICATE_SERIAL`, `ALREADY_RECEIVED` |
| Dispatch | `SERIAL_NOT_FOUND`, `SERIAL_NOT_RESERVED`, `SERIAL_OTHER_ORDER`, `SERIAL_ALREADY_SCANNED`, `SCAN_INCOMPLETE`, `ALREADY_DISPATCHED`, `NO_QR_YET` |
| Installation | `TECHNICIAN_DOUBLE_BOOKED`, `INVALID_TIME_RANGE`, `NOT_DELIVERED`, `FEASIBILITY_NOT_APPROVED`, `SERIAL_NOT_ON_ORDER`, `SERIALS_NOT_RECORDED`, `PHOTOS_MISSING`, `CAPACITY_OVER_SANCTION`, `INVALID_SIGNATURE`, `INVALID_PHOTO_KIND`, `INVALID_FILE_TYPE`, `FILE_TOO_LARGE`, `INVALID_IMAGE` |
| Subsidy | `APPLICATION_NO_REQUIRED`, `INSPECTION_NOT_READY` |
| Tickets | `CUSTOMER_REQUIRED`, `UNIT_NOT_DELIVERED`, `UNIT_NOT_FOUND`, `TICKET_ALREADY_OPEN`, `TICKET_CLOSED`, `NOT_ASSIGNED`, `REPLACEMENT_SERIAL_REQUIRED`, `REPLACEMENT_NOT_AVAILABLE`, `NO_WORK_RECORDED`, `AFTER_REPAIR_PHOTO_REQUIRED`, `PHOTO_NOT_GEOTAGGED`, `CUSTOMER_CONFIRMATION_REQUIRED` |
| Money | `IDEMPOTENCY_KEY_REQUIRED`, `OVERPAYMENT`, `INVOICE_SETTLED`, `ALREADY_PAID`, `FUTURE_MONTH`, `NO_HOURS` |
| Reports and settings | `UNKNOWN_REPORT`, `LINK_INVALID`, `LINK_EXPIRED`, `UNKNOWN_SETTING` |

---

## 12. Reliability, scale and security

### Data integrity and concurrency
| Technique | Where | Why |
|---|---|---|
| **One transaction per action** | Confirm, receive, dispatch, deliver, complete job, payment, resolve | Everything succeeds or nothing changes |
| **Row locks** `SELECT … FOR UPDATE` | Orders, invoices, products, technicians while booking | Two people can't act on the same record at once |
| **`SKIP LOCKED`** | Reserving serial units | Two simultaneous confirms get different units instead of waiting or colliding |
| **Optimistic locking** (`version` column) | Leads, surveys, orders, jobs, tickets, invoices, purchases, subsidy cases, stock units | A stale edit gets `STALE_VERSION` instead of silently overwriting |
| **Idempotency keys** | Order confirm and payments | Double clicks and retries never charge twice |
| **Database constraints** | See [section 9](#9-data-model) | Last line of defence if code has a bug |
| **Sequences** | Document numbers | Unique numbers under concurrency |

### Performance under load
- Server-side pagination, filtering, sorting and search on every list (max 100 rows).
- Indexes on every hot path.
- Dashboard numbers come from SQL aggregates, cached for 60 seconds and **cleared automatically** when orders, invoices, tickets, jobs or stock change.
- Connection pool (10 + 20 overflow, dead connections detected), multiple uvicorn workers supported, GZip responses.
- Frontend: route-level code splitting, 30-second query cache, debounced search, photos compressed before upload.

### Handling technical problems
- One error format everywhere, with a request ID the user can quote.
- Structured JSON logs (request ID, path, status, duration).
- `/health` endpoint; the app shows a **"Connection lost, retrying"** banner and recovers automatically.
- Reads retry with exponential backoff on network or server errors; writes never auto-retry (idempotency makes manual retry safe).
- Error boundary per page, so a broken widget never blanks the app.
- Install form drafts saved on the device; per-photo upload retry; signature survives screen rotation.
- Migrations with Alembic; `--reset` rebuilds clean demo data.

### Security
- Passwords hashed with bcrypt; JWT tokens expire after 8 hours.
- Role check on every route; technicians only see their own work.
- Rate limits: login 10/min, enquiry form 5/min, QR complaints 3/min, public pages 30/min.
- Public pages expose minimal, masked data (no phone or address).
- Share tokens are 32 random bytes, expire and can be revoked; views are logged with a hashed IP.
- Uploads restricted to JPEG, PNG and WebP under 5 MB, re-encoded and stored with random names.
- CORS limited to the frontend origin; secrets live in `.env`, never in Git.

---

## 13. Theming and design system

### Light and dark themes
- Every colour is a **CSS variable** in `src/styles/index.css`, defined once for light (`:root`) and again for dark (`[data-theme="dark"]`).
- Tailwind classes like `bg-surface` or `text-muted` read those variables, so components never contain raw colours and every screen switches theme automatically.
- The **Light / Dark / System** switch sits in the sidebar and the account menu. The choice is saved per device; "System" follows the operating system and updates live.
- A small script in `index.html` applies the theme **before the first paint**, so there's no flash.
- Printing always uses a white page.

### Tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` | `#F4F6F9` silica | `#0D1220` night sky | Page background |
| `surface` | `#FFFFFF` | `#141B2C` | Cards and tables |
| `ink` / `muted` | `#151A25` / `#596273` | `#E8ECF3` / `#96A0B4` | Text |
| `sun` | `#F2A900` | `#F7B928` | Brand and primary actions (always dark text on it) |
| `cell` | `#2C4E9E` | `#809EE8` | Secondary accent and data |
| `ok`, `warn`, `bad`, `info` | emerald, amber-brown, rose, sky | brighter variants | Status, each with a soft tint |
| Chart revenue / cost | `#2C4E9E` / `#D69200` | `#7391DB` / `#C4870F` | Validated for colour-blind separation in both themes |

### Design rules
- Inter font, 14 px body, tabular numbers for all money and counts.
- One status colour map (`lib/status.ts`) used everywhere.
- Every record page has an Odoo-style **status stepper**, actions top right (only valid next steps shown), and an **activity timeline**.
- Every list and page has loading skeletons, empty states with a next step, and errors that say how to fix them.
- Works from 375 px phones to 1440 px desktops; keyboard focus is visible; reduced motion is respected.

---

## 14. Seed data

`python -m app.seed.seed` builds realistic data by **calling the real services** with a simulated clock spread over the last three months, so every record obeys the business rules.

| Data | Contents |
|---|---|
| Users | 10: director, 2 sales, 4 technicians (with hourly rates), warehouse, support, accounts |
| Products | 16, including DCR panels, one non-DCR panel (to demo the rule), inverters, batteries, safety gear, installation service |
| Kits | 12: Panel Set, On-Grid, Off-Grid in 1, 2, 3 and 5 kW |
| Stock | 4 received purchases creating about 200 serialized units, plus one draft purchase |
| Leads | 25 customers in Hyderabad, Jaipur and Pune across every status, including one name mismatch |
| Orders | 15 in every stage, including a half-scanned pick list, a job scheduled for today, a job blocked by feasibility, a panel-only set, and one loss-making job |
| Subsidy | 13 cases across all six stages, including one failing the inspection checklist and several overdue |
| Tickets | In-warranty replaced and closed, out-of-warranty billed, one overdue, one raised by QR, one assigned |
| Invoices | Paid, partially paid and overdue |
| Other | Last month's technician pay (one technician left unpaid), one active share link, a legacy unit at `/u/legacy-demo-unit-0007` with an expired warranty |

### Demo shortcuts

| To show | Open |
|---|---|
| Quote blocked without survey | Lead **Shabana Begum** |
| Name mismatch warning and quote builder | Lead **Fatima Siddiqui** |
| Dispatch scanner (half scanned) | Dispatch, the pending pick list |
| Mobile install | Sign in as **ravi**, today's job |
| Feasibility block | Sign in as **imran**, the scheduled Jaipur job |
| Inspection gate failing | Subsidy tracker, **Srinivas Goud** (Installed) |
| Loss-making job | Dashboard, profit per job (red row) |
| Out-of-warranty QR page | `/u/legacy-demo-unit-0007` |

---

## 15. Testing

```bash
cd backend
pytest -q
```

Tests run against `suryaops_test`, which is reset and seeded automatically. The 15 tests in `tests/test_rules.py`:

| Test | Proves |
|---|---|
| `test_quote_blocked_without_approved_survey` | `SURVEY_NOT_APPROVED` |
| `test_non_dcr_panel_blocked_in_subsidy_order` | DCR rule |
| `test_advance_required_and_insufficient_stock_rolls_back` | Minimum advance; a failed confirm reserves nothing |
| `test_concurrent_reservations_never_share_a_unit` | Two sessions get different units (`SKIP LOCKED`) |
| `test_duplicate_serial_rejected_on_receive` | Serial count and uniqueness on receipt |
| `test_duplicate_scan_and_wrong_serial_refused` | Scanner rules and dispatch block |
| `test_warranty_starts_on_delivery` | 2-year and 20-year warranty dates |
| `test_technician_double_booking_rejected` | No overlapping bookings |
| `test_payment_idempotent_and_overpayment_blocked` | Same key charges once; no overpayment |
| `test_inspection_gate_lists_missing_items` | Checklist finds the missing GPS photo; submission blocked |
| `test_feasibility_required_before_install` | Can't start before feasibility |
| `test_warranty_decides_free_or_billable` | ₹0 in warranty with cost tracked; invoice out of warranty |
| `test_pay_run_twice_rejected` | A month can't be paid twice |
| `test_rbac_blocks_wrong_role` | Technician can't open the dashboard |
| `test_public_qr_page_hides_personal_data` | Masked name, no phone |

---

## 16. Worked example: confirming an order

The clearest example of how the layers work together.

**1. Browser.** The salesperson clicks **Confirm order** and enters a 40% advance. `ConfirmOrderDialog` (`features/Orders.tsx`) generates an idempotency key once when the dialog opens, so a retry reuses it.

**2. API client.** `api.ts` sends:
```
POST /api/v1/orders/12/confirm
Authorization: Bearer <token>
Idempotency-Key: 4f1c...
{ "advance_amount": 72400, "method": "upi", "reference": "UTR123..." }
```

**3. Vite** forwards `/api` to FastAPI on port 8000.

**4. Auth and role.** `require_roles("sales")` decodes the token and confirms the user is sales or director, otherwise `FORBIDDEN`.

**5. Validation.** Pydantic's `ConfirmIn` checks the amount is positive and the method is allowed, otherwise `VALIDATION_ERROR`.

**6. Router.** `routers/sales.py` calls `sales.confirm_order(...)`. Nothing else.

**7. Service, in one transaction** (`services/sales.py`):
1. If a payment already exists with this idempotency key, return the order as it is (a replay).
2. Lock the order row; it must be draft or sent (`ALREADY_CONFIRMED`).
3. Recheck the DCR rule and recalculate totals.
4. Check the advance is at least 30% and not above the total.
5. For each line, lock the product. For serialized products, select the needed `in_stock` units with `FOR UPDATE SKIP LOCKED` and mark them `reserved` for this order. For quantity products, check availability and increase `qty_reserved`.
6. If anything is short, **roll back** and return `INSUFFICIENT_STOCK` with the list of shortages.
7. Create the **pick list**, the **installation job** (if the kit includes installation), the **invoice** with lines, and the **advance payment** with the idempotency key.
8. For subsidy orders, create the **subsidy case** at `applied` and its first event.
9. Mark the order `confirmed`, the lead `won`, and write the **activity log**.
10. Commit.

**8. Database.** PostgreSQL applies everything at once. If any constraint fails, nothing is saved.

**9. Cache.** The commit touched orders and invoices, so the dashboard cache clears itself.

**10. Browser.** The success toast says what happened; TanStack Query refreshes the order, and the "Created automatically" panel shows the pick list, job, invoice and subsidy case. The warehouse sees the pick list in Dispatch immediately.

---

## 17. Odoo mapping

| Rayora | Odoo equivalent |
|---|---|
| Leads and qualification | CRM |
| Kit templates to order lines | Sales + product kits / Bill of Materials |
| Purchases with serial receipt | Purchase + Inventory lot/serial tracking |
| Pick list and dispatch | Inventory delivery orders |
| Installation jobs | Field Service |
| Service tickets | Helpdesk |
| Invoices and payments | Invoicing / Accounting |
| Time logs and pay runs | Timesheets / Payroll |
| Status stepper | Form view status bar |
| Activity timeline | Chatter |
| Service-layer rules and DB constraints | `@api.constrains` and SQL constraints |
| SQLAlchemy models | Odoo ORM models |
| Profit per job | Analytic accounting |
| Settings table | System parameters |

---

## 18. Troubleshooting

| Problem | Fix |
|---|---|
| `connection refused` to the database | Start PostgreSQL: `brew services start postgresql@16` or `docker compose up -d` |
| `role "suryaops" does not exist` | Run the `CREATE USER` and `CREATE DATABASE` commands in [section 4](#4-setup-and-running) |
| `Database already has data` | `python -m app.seed.seed --reset` |
| `relation ... does not exist` | `alembic upgrade head` |
| Login page loads but sign-in fails | The backend isn't running, or it's on another port; check terminal 1 |
| Every request says "Please sign in" | The session expired (8 hours); sign in again |
| Port 8000 or 5173 in use | Close the old terminal or `lsof -ti:8000 \| xargs kill` |
| Photos say "No GPS" | Allow location in the browser; use `localhost` or HTTPS (GPS is blocked on plain HTTP over the network) |
| QR stickers open the wrong address | Set `PUBLIC_BASE_URL` in `.env` to the address phones can reach, restart the backend, reseed or re-deliver |
| Tests fail to connect | Create `suryaops_test` owned by `suryaops` |
| `bcrypt` warning or error | Keep `bcrypt==4.0.1` as pinned in `requirements.txt` |
| Dashboard numbers look stale | They refresh within 60 seconds, or immediately after any order, invoice or ticket change |

---

## 19. Questions the jury may ask

**Where are your business rules?**
All in `backend/app/services/`. Routers only handle HTTP, the frontend only displays, and database constraints are a second line of defence.

**Why PostgreSQL and not MongoDB?**
The data is relational: orders have lines, units belong to purchases and orders, tickets belong to units. We need foreign keys, unique constraints, transactions and row locks. It's also what Odoo uses.

**What is an ORM and why use one?**
It maps tables to Python classes. It writes the SQL, prevents SQL injection, and handles relationships. We still understand the queries underneath and use aggregates and eager loading to avoid N+1 queries.

**What happens if two people confirm orders at the same moment for the last inverter?**
Each confirm locks the units it selects with `FOR UPDATE SKIP LOCKED`. The first gets the inverter; the second skips the locked row, finds none left, and rolls back with `INSUFFICIENT_STOCK`. There's a test for this.

**What if someone double-clicks "Record payment"?**
Both requests carry the same idempotency key. The second returns the first payment instead of creating another. The database also has a unique constraint on the key and a check that paid never exceeds the total.

**What if two people edit the same record?**
Each record has a version number. The second save sees a different version and gets `STALE_VERSION`, with a message to refresh.

**How do you handle a weak network on the rooftop?**
The install form saves a draft on the device, photos are compressed before upload and each has a retry button, reads retry automatically with backoff, and a banner shows when the connection drops.

**How does the warranty work?**
It starts automatically on delivery, per serial: delivery date plus the product's warranty months. Tickets check it to decide free or billable.

**What's innovative here?**
We researched why real PM Surya Ghar applications fail and found most inspection rejections are installer mistakes. Each is now a rule, and submission is blocked until the checklist passes. Plus the QR sticker: the serial number itself becomes the customer's way to raise a complaint.

**How is profit per job calculated?**
Invoice total minus the exact purchase cost of each serial used, the cost of other parts, technician hours times their rate, and any warranty repair costs on that order's units.

**How do you keep personal data safe in shared reports?**
Share links show only aggregated numbers and shortened names, never phones or addresses. They expire, can be revoked, and every view is logged.

**How does the dark theme work?**
All colours are CSS variables defined twice, once per theme. Components only use the variable names, so switching sets one attribute on the page and everything follows.