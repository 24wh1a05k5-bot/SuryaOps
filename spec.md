# SuryaOps — Product & Technical Specification

> **Rooftop Solar Operations Platform** — Odoo Hackathon Final (Solar Installation Management System)
>
> One system that takes a solar customer from first enquiry to a 20-year warranty — **subsidy-ready by design**, with **serial-level traceability** and **profit visibility on every job**.

---

## 0. How to use this document

- This is the single source of truth for the team (and for any LLM generating code). Paste the relevant section into the LLM along with the instruction.
- **Do not invent fields, statuses or endpoints that are not here.** If something is missing, add it to this file first, then build.
- Priority tags: **[P0]** must have · **[P1]** should have · **[P2]** nice to have.
- Every developer must be able to explain every part of the code they commit.

---

## 1. Problem summary

SunPower Solutions completes ~40 rooftop projects/month, keeps high-value stock (panels, inverters, batteries), runs a 15-technician crew, and handles endless service calls. Today:

| Area | Today | SuryaOps fixes it by |
|---|---|---|
| Enquiries | Lost across WhatsApp, calls, web form | One lead inbox, duplicate detection |
| Quotes | Typed by hand, parts missed | Kit templates auto-fill every part |
| Serial numbers | On paper, lost by warranty time | Recorded at purchase receipt, scanned at dispatch |
| Warranty | Dates typed in registers | Starts automatically on delivery |
| Site work | Registers + photos scattered on phones | Mobile install form with GPS-tagged photos + signature |
| Subsidy paperwork | Rejected for avoidable mistakes | Compliance gate blocks submission until correct |
| Repairs | Untracked | Tickets with warranty auto-check, 15-day deadline |
| Money | No picture of margins | Profit per job, dashboards, shareable reports |

### Real-world research that drives our innovation

- Only ~22.7% of PM Surya Ghar applications had become completed installations (Dec 2025); approvals take 45–120 days vs a 30-day target.
- Inspection rejections are **mostly installer mistakes**: missing GPS-tagged photos, non-ALMM/non-DCR panels, missing panel/inverter serials, installed capacity above sanctioned capacity.
- Installing before DISCOM feasibility approval and name mismatches across Aadhaar / electricity bill / bank are common rejection reasons.
- Installers collect 30–50% upfront; the rest is stuck until net metering is complete.
- MNRE requires defects to be fixed within 15 days with geo-tagged, timestamped proof photos.
- Central subsidy: ₹30,000/kW for the first 2 kW + ₹18,000 for the 3rd kW, capped at ₹78,000 (store as **editable settings**).
- Subsidy is credited **to the customer's bank account**, so the company invoices the full price.

---

## 2. Tech stack

### Frontend
| Tool | Purpose |
|---|---|
| **React 18 + Vite + TypeScript** | Fast dev server, type safety |
| **Tailwind CSS** | Utility styling with a strict design-token config |
| **Radix UI primitives + own component kit** | Accessible dialog and menu primitives; buttons, forms, badges, tables are our own shadcn-style components in `components/ui` (all offline) |
| **lucide-react** | Consistent icon set |
| **TanStack Query** | Server state, caching, retries, loading/error states |
| **DataTable (own)** | Server-side paginated, filterable tables with skeleton, empty and error states |
| **Controlled forms + server field errors** | Inputs use HTML constraints for instant feedback; Pydantic `VALIDATION_ERROR` field messages are shown under each field |
| **React Router** | Routing + role-protected routes |
| **Recharts** | Dashboard charts |
| **sonner** | Toast notifications |
| **CSS transitions** | Subtle motion only (dialog pop, scan feedback shake); honours `prefers-reduced-motion` |
| **@fontsource/inter** | Font bundled locally — **no dependency on Google Fonts / internet** |
| **signature_pad** | Customer signature capture |
| **Barcode scanners as keyboards** | Hardware scanners type into the scan box; phone cameras open QR links natively |

### Backend
| Tool | Purpose |
|---|---|
| **Python 3.11 + FastAPI** | API, automatic OpenAPI docs at `/docs` |
| **Pydantic v2** | Request/response validation |
| **SQLAlchemy 2.0** | ORM (models ↔ tables) |
| **Alembic** | Versioned database migrations |
| **PostgreSQL 16** (local) | Relational DB; constraints, transactions, row locks |
| **psycopg 3** | Postgres driver with connection pooling |
| **passlib[bcrypt]** | Password hashing |
| **PyJWT** | JWT access tokens |
| **slowapi** | Rate limiting on public endpoints |
| **qrcode + Pillow** | QR generation, image compression |
| **python-multipart** | File uploads |
| **uvicorn** | ASGI server (multiple workers) |
| **pytest + httpx** | API tests for critical rules |

### Everything runs locally
No cloud services. Postgres runs on the laptop (native install or `docker compose`). Uploaded files stored in `backend/uploads/`. Fonts and icons bundled.

---

## 3. Architecture

```
┌──────────────────────┐        HTTPS/JSON (JWT)        ┌───────────────────────────┐
│  React SPA (Vite)    │  ───────────────────────────▶  │  FastAPI                   │
│  - Internal app      │                                │  routers → services → repo │
│  - Public pages:     │  ◀───────────────────────────  │  Pydantic schemas          │
│    lead form, QR,    │        consistent errors       │  RBAC dependencies         │
│    shared report     │                                └─────────────┬─────────────┘
└──────────────────────┘                                              │ SQLAlchemy (pool)
                                                                      ▼
                                                       ┌───────────────────────────┐
                                                       │ PostgreSQL 16              │
                                                       │ constraints, indexes,      │
                                                       │ transactions, row locks    │
                                                       └───────────────────────────┘
                                                       uploads/ (photos, signatures)
```

### Backend layering (strict)
- **routers/** — HTTP only: parse input, call service, return schema. No business logic.
- **services/** — all business rules, state transitions, transactions.
- **models/** — SQLAlchemy models.
- **schemas/** — Pydantic request/response models.
- **core/** — config, security, db session, errors, logging, rate limiting.

### Repository structure
```
suryaops/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── core/        (config.py, db.py, security.py, errors.py, logging.py, deps.py)
│   │   ├── models/      (one file per domain)
│   │   ├── schemas/
│   │   ├── services/
│   │   ├── routers/
│   │   └── seed/        (seed.py — realistic demo data)
│   ├── alembic/
│   ├── uploads/
│   ├── tests/
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── app/         (router, providers, layout)
│   │   ├── components/  (ui/ = shadcn, shared/ = our composites)
│   │   ├── features/    (leads, surveys, quotes, orders, purchases, dispatch,
│   │   │                 jobs, subsidy, tickets, invoices, technicians, dashboard, settings)
│   │   ├── lib/         (api client, auth, formatters, query keys)
│   │   └── styles/
│   └── package.json
├── docker-compose.yml   (postgres only, optional)
└── README.md
```

---

## 4. Roles & permissions (RBAC)

| Role | Can do |
|---|---|
| **admin** (Director) | Everything; settings; dashboard; share reports; technician pay |
| **sales** | Leads, qualification, quotes, orders, customer invoices view |
| **technician** | Own surveys, own install jobs, own tickets; mobile forms |
| **warehouse** | Purchases, stock receipt, pick lists, dispatch |
| **support** | Tickets, customer/serial lookup, warranty view |
| **accounts** | Invoices, payments, technician pay runs |

Enforced in the **backend** via a `require_roles(...)` dependency on every route. The frontend only hides menus — it is never the security boundary.

---

## 5. Data model (PostgreSQL)

Conventions: every table has `id BIGSERIAL PK`, `created_at TIMESTAMPTZ DEFAULT now()`, `updated_at TIMESTAMPTZ`. Mutable workflow tables also have `version INT NOT NULL DEFAULT 1` (optimistic locking). Money is `NUMERIC(12,2)`. Statuses are Postgres `ENUM`s or `VARCHAR` with `CHECK`.

### 5.1 Users & settings
```
users          (id, name, email UNIQUE, password_hash, role, phone, hourly_rate NUMERIC,
                is_active BOOL)
settings       (key PK, value JSONB)   -- subsidy_rates, tariff_per_unit, gen_per_kw_per_day,
                                       -- company_name, invoice_prefix, ticket_sla_days=15,
                                       -- subsidy_stage_sla_days=30
activity_log   (id, user_id FK NULL, entity, entity_id, action, details JSONB, created_at)
```

### 5.2 CRM
```
customers      (id, name, phone UNIQUE, email, address, city, pincode,
                consumer_no, aadhaar_name, bill_name, bank_account_name,
                bank_aadhaar_seeded BOOL, monthly_bill NUMERIC)
leads          (id, customer_id FK, source CHECK IN ('web','call','whatsapp','referral'),
                requested_kw NUMERIC(4,1), system_type CHECK IN ('panel_set','on_grid','off_grid'),
                wants_subsidy BOOL, roof_area_sqft NUMERIC, shadow_free BOOL,
                grid_suitable BOOL, status, lost_reason, assigned_to FK users, version)
lead_notes     (id, lead_id FK, user_id FK, note, created_at)
```
Lead status: `new → contacted → qualified → survey_scheduled → survey_approved → quoted → won | lost`

### 5.3 Survey
```
surveys        (id, lead_id FK, technician_id FK, scheduled_at, roof_direction,
                tilt_deg NUMERIC CHECK 0–90, cable_distance_m NUMERIC CHECK >=0,
                usable_area_sqft NUMERIC, notes, status, reviewed_by FK, reviewed_at,
                rejection_reason, version)
```
Survey status: `scheduled → submitted → approved | rejected`

### 5.4 Products, kits, stock
```
products       (id, sku UNIQUE, name, category CHECK IN ('panel','inverter','battery',
                'charge_controller','structure','wiring','safety','service'),
                brand, model, wattage, cost_price, sale_price, warranty_months INT,
                is_serialized BOOL, is_dcr BOOL, is_active BOOL,
                qty_on_hand INT DEFAULT 0 CHECK >= 0,      -- non-serialized only
                qty_reserved INT DEFAULT 0 CHECK >= 0,
                reorder_level INT DEFAULT 0)
kit_templates  (id, name UNIQUE, capacity_kw, system_type, includes_installation BOOL,
                is_active BOOL)
kit_lines      (id, kit_id FK, product_id FK, qty INT CHECK > 0, UNIQUE(kit_id, product_id))
suppliers      (id, name, phone, gstin)
purchases      (id, number UNIQUE, supplier_id FK, status, ordered_at, received_at, total, version)
purchase_lines (id, purchase_id FK, product_id FK, qty INT CHECK > 0, unit_cost NUMERIC)
stock_units    (id, product_id FK, serial_no UNIQUE NOT NULL, purchase_line_id FK,
                unit_cost NUMERIC, status, order_id FK NULL, customer_id FK NULL,
                dispatched_at, delivered_at, warranty_end DATE, qr_token UNIQUE, version)
```
Purchase status: `draft → ordered → received | cancelled`
Stock unit status: `in_stock → reserved → dispatched → delivered → installed | returned | scrapped`

### 5.5 Sales
```
orders         (id, number UNIQUE, lead_id FK, customer_id FK, kit_id FK,
                is_subsidy BOOL, sanctioned_kw NUMERIC NULL, expected_subsidy NUMERIC,
                subtotal, total, status, confirmed_at, version)
order_lines    (id, order_id FK, product_id FK, qty INT CHECK > 0, unit_price, line_total)
pick_lists     (id, order_id FK UNIQUE, status CHECK IN ('pending','packed','dispatched'))
```
Order status: `draft → sent → confirmed → dispatched → delivered → installed → completed | cancelled`
(panel-set kits without installation: `delivered → completed`)

### 5.6 Field work
```
jobs           (id, order_id FK UNIQUE, technician_id FK, scheduled_start, scheduled_end,
                actual_start, actual_end, installed_kw NUMERIC, status,
                signature_path, signed_by_name, accepted_at, notes, version)
job_serials    (id, job_id FK, stock_unit_id FK UNIQUE)      -- every panel + inverter etc.
photos         (id, owner_type CHECK IN ('job','ticket'), owner_id, kind
                CHECK IN ('roof','inverter_serial','wiring','meter','after_repair','other'),
                path, lat NUMERIC(9,6), lng NUMERIC(9,6), taken_at TIMESTAMPTZ,
                size_bytes INT)
time_logs      (id, technician_id FK, source_type CHECK IN ('survey','job','ticket'),
                source_id, started_at, ended_at, hours NUMERIC GENERATED or computed,
                CHECK ended_at > started_at)
pay_runs       (id, technician_id FK, month DATE, hours, amount, paid_at, paid_by FK,
                UNIQUE(technician_id, month))
```
Job status: `unscheduled → scheduled → in_progress → customer_accepted | cancelled` (created `unscheduled` on order confirm; the customer's signature is the acceptance)

### 5.7 Subsidy
```
subsidy_cases  (id, order_id FK UNIQUE, application_no, stage, stage_entered_at,
                feasibility_approved_at, inspection_submitted_at, net_meter_at,
                subsidy_credited_at, version)
subsidy_events (id, case_id FK, from_stage, to_stage, user_id FK, note, created_at)
```
Subsidy stage: `applied → feasibility_approved → installed → inspection_submitted → net_meter_installed → subsidy_credited`

### 5.8 Service
```
tickets        (id, number UNIQUE, customer_id FK, stock_unit_id FK NULL, channel
                CHECK IN ('phone','qr','walk_in'), issue, fault_code, in_warranty BOOL,
                assigned_to FK NULL, status, due_by TIMESTAMPTZ, resolved_at,
                customer_confirmed_at, version)
ticket_lines   (id, ticket_id FK, is_labour BOOL, product_id FK NULL,
                replacement_unit_id FK NULL, description, qty NUMERIC CHECK > 0,
                unit_price, line_total)
```
Ticket status: `open → assigned → in_progress → resolved → closed`

### 5.9 Money
```
invoices       (id, number UNIQUE, customer_id FK, order_id FK NULL, ticket_id FK NULL,
                subtotal, tax, total, amount_paid DEFAULT 0, due_date, status,
                issued_at, version,
                CHECK (amount_paid >= 0 AND amount_paid <= total),
                CHECK (order_id IS NOT NULL OR ticket_id IS NOT NULL))
invoice_lines  (id, invoice_id FK, description, qty, unit_price, line_total)
payments       (id, invoice_id FK, amount CHECK > 0, method CHECK IN
                ('cash','upi','bank_transfer','cheque','card'), reference,
                idempotency_key UNIQUE, paid_at, recorded_by FK)
```
Invoice status: `draft → sent → partially_paid → paid` ; `overdue` is **computed** (due_date < today and not paid).

### 5.10 Sharing
```
shared_reports (id, token UNIQUE (32 random bytes, url-safe), period_start, period_end,
                expires_at, revoked BOOL DEFAULT false, created_by FK, created_at)
report_views   (id, shared_report_id FK, viewed_at, ip_hash)
```

### 5.11 Indexes (performance)
- FK columns everywhere.
- `customers(phone)`, `stock_units(serial_no)` (unique already), `stock_units(product_id, status)`.
- `leads(status, created_at DESC)`, `orders(status, created_at DESC)`, `tickets(status, due_by)`, `invoices(status, due_date)`, `jobs(technician_id, scheduled_start)`.
- Trigram index (`pg_trgm`) on `customers(name)` for fast fuzzy search [P1].

---

## 6. Modules & business rules

> Every rule below is enforced in the **backend service layer** (and DB constraints where noted). The frontend mirrors it for UX, with the same messages.

### 6.1 CRM — Leads [P0]
- Public lead form (no login, rate-limited) + internal manual entry.
- **R-CRM-1** Phone is unique per customer. A repeat enquiry attaches a new lead to the existing customer and shows a "Returning customer" badge.
- **R-CRM-2** Cannot move to `qualified` unless `roof_area_sqft`, `shadow_free`, `grid_suitable`, `monthly_bill` are filled.
- **R-CRM-3** Subsidy readiness warning if `aadhaar_name`, `bill_name`, `bank_account_name` don't match (case/space-insensitive), or `bank_aadhaar_seeded = false`.
- **R-CRM-4** `lost` requires a `lost_reason`.
- Leads untouched > 48h get a "Going cold" badge [P1].

### 6.2 Survey [P0]
- **R-SUR-1** Only the assigned technician (or admin) can submit.
- **R-SUR-2** `tilt_deg` 0–90; `cable_distance_m` ≥ 0.
- **R-SUR-3** Reject requires `rejection_reason`.
- **R-SUR-4** On approval, lead → `survey_approved`.

### 6.3 Products & kits [P0]
- Seeded kits: Panel Set 1–5 kW (no installation), On-Grid 1–5 kW, Off-Grid 1–5 kW.
- **R-KIT-1** Off-Grid kits must contain a battery line.
- **R-KIT-2** Inactive products cannot be added to new kits or quotes.

### 6.4 Quotes & orders [P0]
- **R-ORD-1** **No quote unless the lead's survey is `approved`.** Error: `SURVEY_NOT_APPROVED`.
- **R-ORD-2** Choosing a kit copies all kit lines into order lines (editable before confirm).
- **R-ORD-3** If `is_subsidy`: every panel line must be `is_dcr = true`. Error: `NON_DCR_PANEL_IN_SUBSIDY_ORDER`.
- **R-ORD-4** `expected_subsidy` computed from settings and `requested_kw`.
- **R-ORD-5** Confirm requires an advance of at least `min_advance_percent` (default 30%) or the full amount, recorded as the first payment on the invoice in the same transaction.
- **R-ORD-6 (Confirm transaction — single DB transaction, all-or-nothing):**
  1. Lock required products/stock units (`SELECT … FOR UPDATE`), check availability, reserve (serialized units → `reserved`; non-serialized `qty_reserved += qty`). If short → rollback with list of shortages (`INSUFFICIENT_STOCK`).
  2. Create `pick_list`.
  3. Create `job` if kit `includes_installation`.
  4. Create/finalise customer `invoice`.
  5. Create `subsidy_case` if `is_subsidy`.
  6. Write `activity_log`.
- **R-ORD-7** Cancelling a confirmed order releases reservations.
- **Payback card [P2]:** yearly generation = kW × `gen_per_kw_per_day` × 365; savings = generation × tariff; net cost = total − expected_subsidy; payback years = net cost ÷ yearly savings.

### 6.5 Purchases & stock receipt [P0]
- **R-PUR-1** On receive, for serialized products the number of serials entered must equal `qty`.
- **R-PUR-2** Serials unique (DB constraint) — duplicates rejected with the exact duplicate serials listed.
- **R-PUR-3** Receiving creates `stock_units` (`in_stock`, `unit_cost` from line) or increments `qty_on_hand`.
- **R-PUR-4** A received purchase is immutable.
- Low-stock alert when `available < reorder_level` [P1].

### 6.6 Dispatch & warranty [P0]
- **R-DIS-1** Scanned serial must exist, be `reserved` for **this** order, and match a product on the order.
- **R-DIS-2** Same serial cannot be scanned twice (UI + DB).
- **R-DIS-3** Dispatch allowed only when scanned quantities equal ordered quantities for every serialized product.
- **R-DIS-4** On *Mark Delivered*: units → `delivered`, `delivered_at = now()`, `warranty_end = delivered_at + warranty_months`, `customer_id` set. Order → `delivered`. **Automatic.**
- **R-DIS-5** Generate `qr_token` per serialized unit; printable QR sticker sheet per order [P2].

### 6.7 Installation [P0]
- **R-JOB-1** Technician cannot be double-booked: no overlapping `scheduled_start/end` for the same technician (checked in service, inside a transaction).
- **R-JOB-2** For subsidy orders, job cannot start unless subsidy stage ≥ `feasibility_approved`. Error: `FEASIBILITY_NOT_APPROVED`.
- **R-JOB-3** `actual_end > actual_start`.
- **R-JOB-4** For subsidy orders, `installed_kw ≤ sanctioned_kw`.
- **R-JOB-5** Completion requires: all delivered serialized units for the order linked in `job_serials`; at least roof + inverter_serial photos; signature.
- **R-JOB-6** Photos store `lat`, `lng`, `taken_at` from browser geolocation; client compresses images to ≤ 1600px / ~500KB before upload.
- On completion: order → `installed` → `completed`; time_log written; subsidy stage → `installed`.

### 6.8 Invoicing [P0]
- Auto-created on order confirm (full price) and on billable ticket resolve.
- Numbering: `INV-2026-0001` from a Postgres **sequence** (safe under concurrency).
- **R-INV-1** `amount_paid ≤ total` (DB CHECK) → no overpayment, no double payment.
- **R-INV-2** Every payment request carries an `idempotency_key`; replays return the original payment instead of creating a new one.
- **R-INV-3** Payment recording locks the invoice row (`FOR UPDATE`) and recomputes status.
- Printable invoice page (print stylesheet → Save as PDF).

### 6.9 Subsidy tracker — **Innovation #1** [P1]
- Kanban board by stage; each card shows days in current stage; > `subsidy_stage_sla_days` → red "Overdue".
- Stage changes logged in `subsidy_events`.
- **Inspection gate:** `POST /subsidy/{id}/submit-inspection` runs all checks and returns a checklist. Button disabled until all pass:
  - ✅ Names match (Aadhaar / bill / bank) and bank Aadhaar-seeded
  - ✅ All panels on the order are DCR
  - ✅ Every panel serial + inverter serial linked to the job
  - ✅ Required photos present, each with lat/lng/taken_at
  - ✅ `installed_kw ≤ sanctioned_kw`
  - ✅ Feasibility approved **before** `actual_start`
- Dashboard: **money blocked by subsidy delays** = unpaid balances on invoices of subsidy orders not yet at `net_meter_installed`.

### 6.10 Service tickets [P0]
- Open via: support search (name/phone/serial) or **public QR page** [P2].
- **R-TKT-1** `in_warranty = (today ≤ stock_unit.warranty_end)` — computed at ticket creation, shown prominently.
- **R-TKT-2** `due_by = created_at + ticket_sla_days (15)`; countdown + overdue badge.
- **R-TKT-3** Ticket lines: parts (from stock; replacement serial recorded, its own warranty starts) + labour hours.
- **R-TKT-4** In warranty → customer invoice total ₹0, but costs still count toward company cost. Out of warranty → invoice auto-created on resolve.
- **R-TKT-5** Resolve requires an `after_repair` photo (geo-tagged). Close requires customer confirmation.
- **R-TKT-6** Only one open ticket per stock unit at a time (warn + link to existing).

### 6.11 Technician time & pay [P1]
- Time logs auto-created from survey, job and ticket actual times.
- Monthly pay summary: hours × hourly_rate → `Mark as paid`.
- **R-PAY-1** `UNIQUE(technician_id, month)` → a month can't be paid twice.

### 6.12 Director dashboard & sharing [P0 dashboard, P1 export/PDF, P2 share link]
**Filters:** Today · This week · This month · Custom range.

**KPI cards:** Revenue · Costs · Profit · Margin % · Open jobs · Open tickets (overdue) · Outstanding invoices (overdue) · Money blocked by subsidy delays.

**Profit per job** = order invoice total − Σ(unit_cost of serials used) − Σ(non-serialized qty × cost_price) − labour (hours × rate) − warranty repair costs on that order's units. Negative profit rows highlighted.

**Tables:** profit per job · unfinished jobs by stage · open tickets · invoices outstanding · subsidy cases by stage · technician pay due.

**Charts:** revenue vs cost over time (line) · jobs by stage (bar).

**Sharing ("share these numbers"):**
1. **Export CSV** on every dashboard table (`GET /reports/{name}.csv?from=&to=`).
2. **PDF report**: `/reports/print?from=&to=` — a print-optimised page → browser *Save as PDF*.
3. **Share link**: director creates a link (period + expiry, default 7 days) → `/shared/{token}` read-only snapshot, **no customer personal data**, revocable, every view logged.

---

## 7. API (REST, JSON, `/api/v1`)

All list endpoints: `?page=&page_size=(max 100)&q=&status=&sort=` and return `{ items, total, page, page_size }`.

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/login` · `GET /auth/me` |
| Public | `POST /public/leads` · `GET /public/units/{qr_token}` · `POST /public/units/{qr_token}/tickets` · `GET /public/shared/{token}` |
| Customers | `GET /customers` · `GET /customers/{id}` · `GET /search?q=` (global: name/phone/serial/order/ticket) |
| Leads | `GET/POST /leads` · `GET/PATCH /leads/{id}` · `POST /leads/{id}/transition` · `POST /leads/{id}/notes` |
| Surveys | `POST /leads/{id}/surveys` · `PATCH /surveys/{id}` · `POST /surveys/{id}/submit` · `POST /surveys/{id}/approve` · `POST /surveys/{id}/reject` |
| Catalog | `GET/POST /products` · `PATCH /products/{id}` · `GET/POST /kits` · `GET /kits/{id}` |
| Orders | `POST /leads/{id}/quote` · `GET /orders` · `GET/PATCH /orders/{id}` · `POST /orders/{id}/confirm` · `POST /orders/{id}/cancel` · `GET /orders/{id}/payback` |
| Purchases | `GET/POST /purchases` · `POST /purchases/{id}/order` · `POST /purchases/{id}/receive` |
| Stock | `GET /stock/units?serial=` · `GET /stock/summary` |
| Dispatch | `GET /pick-lists` · `POST /pick-lists/{id}/scan` · `POST /pick-lists/{id}/dispatch` · `POST /orders/{id}/deliver` · `GET /orders/{id}/qr-sheet` |
| Jobs | `GET /jobs?technician=me` · `POST /jobs/{id}/schedule` · `POST /jobs/{id}/start` · `POST /jobs/{id}/serials` · `POST /jobs/{id}/photos` · `POST /jobs/{id}/complete` · `POST /jobs/{id}/accept` |
| Subsidy | `GET /subsidy` · `POST /subsidy/{id}/advance` · `GET /subsidy/{id}/checklist` · `POST /subsidy/{id}/submit-inspection` |
| Tickets | `GET/POST /tickets` · `GET/PATCH /tickets/{id}` · `POST /tickets/{id}/lines` · `POST /tickets/{id}/resolve` · `POST /tickets/{id}/close` |
| Invoices | `GET /invoices` · `GET /invoices/{id}` · `POST /invoices/{id}/send` · `POST /invoices/{id}/payments` (requires `Idempotency-Key` header) |
| Technicians | `GET /technicians/pay?month=` · `POST /technicians/{id}/pay-runs` |
| Reports | `GET /dashboard?from=&to=` · `GET /reports/{name}.csv` · `POST /shared-reports` · `DELETE /shared-reports/{id}` |
| Settings | `GET/PATCH /settings` |
| Ops | `GET /health` (DB ping) |

### Error format (every error, everywhere)
```json
{ "error": { "code": "SURVEY_NOT_APPROVED",
             "message": "A quote can't be created until the site survey is approved.",
             "details": { "lead_id": 42 } } }
```
HTTP codes: 400 business rule · 401 unauthenticated · 403 wrong role · 404 not found · 409 conflict (duplicate, stale version, double booking) · 422 validation · 429 rate limited · 500 unexpected (generic message; details only in server logs).

---

## 8. Reliability, scale & failure handling

### 8.1 Concurrency & data integrity
- **Transactions** for every multi-step operation (confirm order, receive purchase, dispatch, complete job, record payment, resolve ticket).
- **Row locks** (`SELECT … FOR UPDATE`) when reserving stock and recording payments → two users can't reserve the same unit or overpay the same invoice.
- **Optimistic locking** (`version` column) on orders, jobs, tickets, invoices, subsidy cases → stale edits get `409 STALE_VERSION` and the UI says "This record was updated by someone else — refresh to see the latest."
- **DB constraints as the last line of defence:** UNIQUE (serials, phone, invoice numbers, pay runs), CHECK (non-negative stock, amount_paid ≤ total, end > start), FKs.
- **Idempotency keys** on payment and confirm endpoints → double clicks / retries never duplicate money or orders.
- **Postgres sequences** for human-readable numbers (INV-, ORD-, TKT-, PO-).

### 8.2 High usage / performance
- Server-side **pagination, filtering, sorting, search** everywhere (never load full tables). Max page size 100.
- **Indexes** per §5.11; use `EXPLAIN ANALYZE` on dashboard queries.
- Dashboard numbers computed with **SQL aggregates** (one query per widget, no N+1); `selectinload`/`joinedload` for relationships.
- Short **in-memory TTL cache (60s)** for dashboard aggregates, invalidated on writes to orders/invoices/tickets.
- **Connection pool** (`pool_size=10, max_overflow=20, pool_pre_ping=True`).
- Run uvicorn with **multiple workers** (`--workers 4`); GZip middleware on responses.
- **Uploads:** client-side compression before upload; server validates type (jpeg/png/webp) and size (≤ 5 MB); files saved with UUID names; served statically.
- Frontend: route-level **code splitting** (`React.lazy`), TanStack Query caching (`staleTime` 30s), debounced search (300ms), virtualised long tables [P2].

### 8.3 Technical problems & resilience
- **Global exception handler** → consistent error JSON; unexpected errors logged with a request ID, user sees a friendly message + request ID.
- **Structured logging** (JSON lines: time, level, request_id, user_id, path, status, duration_ms).
- **Health check** `/health` (app + DB). Frontend shows a top banner "Connection lost — retrying…" when the API is unreachable and auto-recovers.
- **Retries:** TanStack Query retries GETs (exponential backoff, 3 tries). Mutations never auto-retry (idempotency keys make manual retry safe).
- **Flaky rooftop network:** the install form auto-saves a **draft locally** (localStorage, wrapped in try/catch) so a technician never loses entered data; photo uploads show per-file progress with "Retry" on failure.
- **React Error Boundary** per page → a broken widget never blanks the whole app.
- **Input validation twice:** Zod on the client (instant feedback), Pydantic + service rules on the server (truth).
- **Migrations** via Alembic (never hand-edit tables). **Backup:** `pg_dump` script + `make reset-demo` to restore clean seed data before demos.
- **Rate limiting** (slowapi) on public endpoints: lead form, QR ticket form, shared report, login (prevents spam / brute force).

### 8.4 Security
- bcrypt password hashing; JWT access token (8h) stored in memory + refresh on reload via `/auth/me`.
- RBAC on every route; technicians only see their own jobs/tickets (row-level filtering in services).
- CORS restricted to the frontend origin.
- Public endpoints expose **minimum data** (QR page: product, install date, warranty status, masked customer name — no phone/address).
- Share tokens: 32 random bytes (`secrets.token_urlsafe`), expiry + revoke.
- No secrets in Git (`.env` + `.env.example`).

---

## 9. UI / UX — "picture perfect" standard

> The judges should think it's a shipped SaaS product. Consistency beats decoration.

### 9.1 Design principles
1. **Calm, dense, professional** — like Linear / Stripe / Odoo 17: neutral surfaces, one accent colour, clear hierarchy.
2. **Every screen answers "what's next?"** — primary action top-right, status always visible.
3. **No dead ends** — every empty state has a helpful message + action; every error says how to fix it.
4. **Consistency is law** — same table, same badges, same form layout everywhere.

### 9.2 Design tokens (Tailwind config)
- **Font:** Inter (bundled). Sizes: 12 / 13 / 14 (body) / 16 / 20 / 24 / 30. Weights 400/500/600. Tabular numbers (`tabular-nums`) for all money and counts.
- **Themes [P0]: light ("daylight") and dark ("night sky"), plus "system" (follows the OS).** Every colour is a CSS variable in `src/styles/index.css`, redefined under `[data-theme="dark"]`; components only use tokens, never raw colours. The choice is a Light / Dark / System switch in the sidebar and the account menu, saved per device, and applied before first paint (no flash).
- **Colours (token: light / dark):**
  - `bg` silica `#F4F6F9` / night `#0D1220` (blue-tinted, not flat black); `surface` `#FFFFFF` / `#141B2C`; `line` `#E3E7ED` / `#252E44`.
  - `ink` `#151A25` / `#E8ECF3`; `muted` `#596273` / `#96A0B4`.
  - **Brand `sun` (marigold amber):** `#F2A900` / `#F7B928`, always with dark text on it (`sun-ink`) for contrast.
  - `cell` (silicon-cell blue, secondary/data): `#2C4E9E` / `#809EE8`.
  - Sidebar: ink-dark in both themes, amber active indicator.
  - Semantic: `ok` emerald, `warn` amber-brown, `bad` rose, `info` sky, each with a `-soft` tint for badges and callouts.
  - **Charts:** revenue `#2C4E9E` / `#7391DB`, cost `#D69200` / `#C4870F`. Validated for colour-blind separation in both themes; light-mode cost is below 3:1 contrast, so charts always ship a legend, a tooltip and the table view.
- **Spacing:** 4px grid; page padding 24px; card padding 20px; gap 16px.
- **Radius:** 8px (cards, inputs), 6px (buttons, badges). **Shadow:** `shadow-sm` on cards only.
- **Motion:** 150–200ms ease-out; no bouncing; respect `prefers-reduced-motion`.
- Print stylesheet forces a white page for invoices and reports in either theme.

### 9.3 Layout
- **App shell:** collapsible left sidebar (icons + labels, grouped: *Sales* — Leads, Surveys, Orders · *Operations* — Purchases, Stock, Dispatch, Jobs · *Compliance* — Subsidy · *Service* — Tickets · *Finance* — Invoices, Technician pay · *Insights* — Dashboard · *Settings*).
- **Top bar:** page title + breadcrumb, **global search / command palette (⌘K / Ctrl+K)** — type a phone, serial, order or ticket number and jump straight there (wow factor + solves "find the customer in seconds"), notifications bell [P2], user menu with role badge.
- **Record pages (Odoo-style):** header with record number + **status bar stepper** (e.g. Draft › Sent › Confirmed › Dispatched …, current stage highlighted, past stages checked), action buttons on the right (only valid next actions shown), then tabs (Details · Lines · Photos · Activity).
- **Activity timeline** on every record (from `activity_log`) — who did what, when.

### 9.4 Components (build once, reuse everywhere)
- `DataTable` — sticky header, sortable columns, column filters, search, pagination, row click → record, row actions menu, CSV export button, loading skeleton rows, empty state.
- `StatusBadge` — single colour map for every status in the system (one source of truth).
- `StatusStepper` — the Odoo-style status bar.
- `KpiCard` — label, big tabular number, delta vs previous period (green/red), tiny sparkline [P2].
- `MoneyText` — ₹ formatting with Indian grouping (`₹1,50,000`).
- `FormSection` — label left / fields right on desktop, stacked on mobile; inline errors under fields.
- `ConfirmDialog` — for destructive or irreversible actions (cancel order, dispatch, mark paid).
- `ChecklistPanel` — for the subsidy inspection gate (green ticks / red crosses with "Fix" links).
- `EmptyState` — icon, title, one-line help, primary action.
- `PageSkeleton` — skeletons, never spinners on full pages.
- Toasts (sonner) for success; inline + toast for errors with the server message.

### 9.5 Signature screens (spend extra polish here)
1. **Dashboard** — 8 KPI cards, revenue-vs-cost chart, profit-per-job table with negative rows tinted rose, "Share report" button.
2. **Quote builder** — kit picker cards (capacity + type), auto-filled lines table, live totals, subsidy + payback card.
3. **Dispatch scanner** — big scan input with autofocus, live progress per product ("Inverter 1/1 ✓, Battery 0/1"), instant green/red feedback with sound-free animation, duplicate scan shake + message.
4. **Mobile install form** — large touch targets, step-by-step (Times → Serials → Photos → Signature), GPS badge on each photo, draft auto-save indicator.
5. **Subsidy board** — Kanban columns per stage, cards with days-in-stage chip, overdue in rose; card drawer shows the inspection checklist.
6. **Public QR page** — clean, mobile-first, company branding, warranty status in a large green/rose pill, "Report a problem" form.

### 9.6 Quality bar (checklist before every merge)
- [ ] Loading (skeleton), empty, error and success states exist.
- [ ] Works at 375px (mobile) and 1440px (desktop).
- [ ] Checked in both light and dark themes.
- [ ] Keyboard accessible; focus rings visible; buttons have labels.
- [ ] All money in ₹ with Indian grouping; dates as `31 Oct 2026`; times `10:30 AM`.
- [ ] No console errors; no placeholder "Lorem ipsum".
- [ ] Action buttons disabled while submitting (prevents double submit).

---

## 10. Seed data (realistic, in the database — never static JSON)

- Users: 1 admin (Director), 2 sales, 4 technicians (with hourly rates), 1 warehouse, 1 support, 1 accounts. Password for all demo users documented in README.
- Products (real-sounding Indian brands/models): DCR 540W mono panels, a non-DCR panel (to demo the rule), 3/5 kW on-grid inverters, off-grid inverter, 150Ah/200Ah batteries, charge controllers, GI structures, DC/AC cables, ACDB/DCDB, earthing kits, lightning arrestor, installation service.
- Kits: Panel Set / On-Grid / Off-Grid for 1, 2, 3, 5 kW.
- Suppliers: 3. Purchases: 4 received (creating ~150 serialized units).
- Customers in Hyderabad / Jaipur / Pune with Indian names; ~25 leads across all statuses (one with a name mismatch to demo R-CRM-3).
- ~12 orders across all stages; 8 completed jobs with photos; subsidy cases across all stages (two overdue).
- Tickets: in-warranty, out-of-warranty, overdue.
- Invoices: paid, partially paid, overdue.
- Data spread over the last 3 months so dashboard charts look alive.
- `python -m app.seed.seed --reset` rebuilds everything in seconds.

---

## 11. Testing (critical rules only — fast, high value)

pytest + httpx against a test database:
- Quote blocked without approved survey.
- Non-DCR panel blocked in subsidy order.
- Confirm order reserves stock; insufficient stock rolls back everything.
- Concurrent confirms can't reserve the same unit (two sessions).
- Duplicate serial rejected on receive and on scan.
- Warranty end date computed correctly on delivery.
- Technician double-booking rejected.
- Payment idempotency + overpayment blocked.
- Inspection gate returns the right missing items.
- In-warranty ticket invoices ₹0; out-of-warranty creates invoice.
- Pay run for the same month twice rejected.

---

## 12. Team plan (3 people + LLMs)

| Person | Owns |
|---|---|
| **A — Backend core** | DB models, migrations, seed, auth/RBAC, orders/stock/purchases/dispatch services, concurrency & idempotency |
| **B — Backend features + integration** | Jobs, subsidy gate, tickets, invoices/payments, technician pay, dashboard aggregates, CSV/share, tests |
| **C — Frontend & design system** | Design tokens, app shell, shared components (§9.4), all screens, mobile install form, public pages, polish |

**Rules:** feature branches (`feat/<area>`), small commits from **all three accounts**, pull `main` hourly, one person owns `App.tsx` routes and `models/__init__.py` (announce before touching shared files). API contract (§7) agreed in the first hour — frontend uses mocked responses until endpoints land.

### Timeline
| Time | Goal |
|---|---|
| 10:45–12:00 | Repo, Postgres, migrations, seed skeleton, auth, app shell + design tokens, API contract |
| 12:00–17:00 | **Spine end-to-end:** lead → survey → quote → confirm → receive → dispatch → deliver → install → ticket → invoice |
| 17:00–21:00 | All business rules + error messages, subsidy tracker + inspection gate, dashboard v1 |
| 21:00–01:00 | Payments/idempotency, technician pay, CSV/PDF, QR sticker + public page, command palette |
| 01:00–05:00 | Signature-screen polish, share link, payback card, tests for critical rules |
| 05:00 | **Feature freeze.** Reset seed, full demo rehearsal, fix bugs, README, everyone explains everyone's code |
| 08:00 | Review → final fixes → push GitHub by 10:00 → video by 10:30 |

---

## 13. Demo script (5 minutes)

1. **Web form enquiry** → appears in Leads instantly (returning-customer detection).
2. Try to quote before survey → **blocked** with clear message. Approve survey → **quote builder** auto-fills the 3 kW On-Grid kit; payback card shows savings.
3. Add a non-DCR panel to the subsidy order → **blocked**.
4. Record advance → **Confirm** → pick list, crew job, invoice and subsidy case appear automatically.
5. **Dispatch scanner:** scan serials; scan one twice → refused. Deliver → warranty end dates appear.
6. **Mobile install form** on a phone: GPS-tagged photos, serials, customer signature.
7. **Subsidy board:** "Submit for inspection" shows what's missing → fix → passes.
8. **Scan the printed QR sticker** with a phone → "In warranty" → report a problem → ticket appears for support with ₹0 repair.
9. **Dashboard:** profit per job, money blocked by subsidy delays → **Share report** link opened in an incognito window.

**Closing line:** *"We researched why real subsidy applications fail. Inspection rejections are mostly installer mistakes — so we turned each one into a rule the system enforces, and made every unit traceable for its whole 20-year life."*

---

## 14. Odoo mapping (for the jury)

| SuryaOps | Odoo equivalent |
|---|---|
| Leads & qualification | CRM |
| Kit templates → order lines | Sales + Bill of Materials / product kits |
| Purchases & receipt with serials | Purchase + Inventory (lot/serial tracking) |
| Pick list & dispatch | Inventory delivery orders |
| Installation jobs | Field Service |
| Tickets | Helpdesk |
| Invoices & payments | Invoicing / Accounting |
| Time logs & pay | Timesheets / Payroll |
| Status steppers, activity timeline | Odoo statusbar & chatter |
| Business rules & DB constraints | Odoo `@api.constrains` & SQL constraints |
| Profit per job | Analytic accounting |

---

## 15. Definition of done

- Every scene in the problem statement works end to end on seeded data.
- Every rule in §6 returns the documented error code and a human message.
- No page without loading / empty / error states.
- `README.md`: setup (Postgres, backend, frontend), demo logins, architecture diagram, feature list, screenshots, Odoo mapping, team.
- Clean commit history from all three members.
