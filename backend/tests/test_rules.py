"""Critical business rules (spec section 11). Run: pytest -q"""
import uuid

from sqlalchemy import select

from app.core.db import SessionLocal
from app.models import Job, Order, PickList, Product, StockUnit, SubsidyCase, Ticket, User

API = "/api/v1"


def err(r):
    return r.json()["error"]["code"]


def first(client, admin, path):
    return client.get(f"{API}{path}", headers=admin).json()["items"][0]


def test_quote_blocked_without_approved_survey(client, admin):
    lead = first(client, admin, "/leads?status=survey_scheduled")
    kit = client.get(f"{API}/kits", headers=admin).json()[0]
    r = client.post(f"{API}/leads/{lead['id']}/quote", json={"kit_id": kit["id"]}, headers=admin)
    assert r.status_code == 400 and err(r) == "SURVEY_NOT_APPROVED"


def test_non_dcr_panel_blocked_in_subsidy_order(client, admin):
    lead = first(client, admin, "/leads?status=survey_approved")
    kit = next(k for k in client.get(f"{API}/kits", headers=admin).json() if k["system_type"] == "on_grid")
    r = client.post(f"{API}/leads/{lead['id']}/quote", json={"kit_id": kit["id"], "is_subsidy": True}, headers=admin)
    assert r.status_code == 201, r.text
    order = r.json()
    detail = client.get(f"{API}/orders/{order['id']}", headers=admin).json()
    non_dcr = next(p for p in client.get(f"{API}/products", headers=admin).json()
                   if p["category"] == "panel" and not p["is_dcr"])
    lines = [{"product_id": ln["product"]["id"], "qty": ln["qty"]} for ln in detail["lines"]]
    lines.append({"product_id": non_dcr["id"], "qty": 1})
    r = client.patch(f"{API}/orders/{order['id']}", json={"lines": lines}, headers=admin)
    assert r.status_code == 400 and err(r) == "NON_DCR_PANEL_IN_SUBSIDY_ORDER"


def test_advance_required_and_insufficient_stock_rolls_back(client, admin):
    order = first(client, admin, "/orders?status=sent")
    detail = client.get(f"{API}/orders/{order['id']}", headers=admin).json()
    r = client.post(f"{API}/orders/{order['id']}/confirm", json={"advance_amount": 1, "method": "upi"}, headers=admin)
    assert err(r) == "ADVANCE_TOO_LOW"
    # ask for far more inverters than exist, then try to confirm
    lines = [{"product_id": ln["product"]["id"], "qty": ln["qty"] if ln["product"]["category"] != "inverter" else 500}
             for ln in detail["lines"]]
    r = client.patch(f"{API}/orders/{order['id']}", json={"lines": lines}, headers=admin)
    assert r.status_code == 200
    total = r.json()["total"]
    with SessionLocal() as db:
        before = db.execute(select(StockUnit).where(StockUnit.status == "reserved")).scalars().all()
    r = client.post(f"{API}/orders/{order['id']}/confirm", json={"advance_amount": total, "method": "upi"},
                    headers={**admin, "Idempotency-Key": uuid.uuid4().hex})
    assert r.status_code == 409 and err(r) == "INSUFFICIENT_STOCK"
    with SessionLocal() as db:
        after = db.execute(select(StockUnit).where(StockUnit.status == "reserved")).scalars().all()
        assert len(before) == len(after)  # nothing was reserved: the whole transaction rolled back
        assert db.get(Order, order["id"]).status == "sent"


def test_concurrent_reservations_never_share_a_unit():
    """Two sessions reserving at the same time get different units (FOR UPDATE SKIP LOCKED)."""
    s1, s2 = SessionLocal(), SessionLocal()
    try:
        pid = s1.execute(select(StockUnit.product_id).where(StockUnit.status == "in_stock")).scalars().first()
        q = select(StockUnit).where(StockUnit.product_id == pid, StockUnit.status == "in_stock") \
            .order_by(StockUnit.id).limit(2).with_for_update(skip_locked=True)
        a = {u.id for u in s1.execute(q).scalars()}
        b = {u.id for u in s2.execute(q).scalars()}
        assert a and b and not (a & b)
    finally:
        s1.rollback(); s2.rollback(); s1.close(); s2.close()


def test_duplicate_serial_rejected_on_receive(client, admin):
    wh = client.post(f"{API}/auth/login", json={"email": "warehouse@sunpower.in", "password": "demo1234"}).json()
    h = {"Authorization": f"Bearer {wh['access_token']}"}
    with SessionLocal() as db:
        existing = db.execute(select(StockUnit).join(Product).where(Product.sku == "INV-GRW-3K")).scalars().first()
        pid = existing.product_id
    po = client.post(f"{API}/purchases", json={"supplier_id": 1, "lines": [{"product_id": pid, "qty": 2, "unit_cost": 29000}]},
                     headers=h).json()
    line = po["lines"][0]["id"]
    r = client.post(f"{API}/purchases/{po['id']}/receive", json={"lines": [{"line_id": line, "serials": ["NEW-1"]}]}, headers=h)
    assert err(r) == "SERIAL_COUNT_MISMATCH"
    r = client.post(f"{API}/purchases/{po['id']}/receive",
                    json={"lines": [{"line_id": line, "serials": ["NEW-1", existing.serial_no]}]}, headers=h)
    assert r.status_code == 409 and err(r) == "DUPLICATE_SERIAL"


def test_duplicate_scan_and_wrong_serial_refused(client, admin):
    with SessionLocal() as db:
        pl = db.execute(select(PickList).where(PickList.status.in_(("pending", "packed")))).scalars().first()
        scanned = db.execute(select(StockUnit).where(StockUnit.order_id == pl.order_id,
                                                    StockUnit.scanned_at.is_not(None))).scalars().first()
        stranger = db.execute(select(StockUnit).where(StockUnit.status == "in_stock")).scalars().first()
    r = client.post(f"{API}/pick-lists/{pl.id}/scan", json={"serial": scanned.serial_no}, headers=admin)
    assert r.status_code == 409 and err(r) == "SERIAL_ALREADY_SCANNED"
    r = client.post(f"{API}/pick-lists/{pl.id}/scan", json={"serial": stranger.serial_no}, headers=admin)
    assert err(r) == "SERIAL_NOT_RESERVED"
    r = client.post(f"{API}/pick-lists/{pl.id}/dispatch", headers=admin)
    assert err(r) == "SCAN_INCOMPLETE"


def test_warranty_starts_on_delivery():
    with SessionLocal() as db:
        u = db.execute(select(StockUnit).join(Product).where(Product.category == "inverter",
                                                             StockUnit.delivered_at.is_not(None),
                                                             StockUnit.serial_no.notlike("%LEG%"))).scalars().first()
        d = u.delivered_at.date()
        assert u.warranty_end.year == d.year + 2 and u.warranty_end.month == d.month
        panel = db.execute(select(StockUnit).join(Product).where(Product.category == "panel",
                                                                 StockUnit.delivered_at.is_not(None))).scalars().first()
        assert panel.warranty_end.year == panel.delivered_at.year + 20


def test_technician_double_booking_rejected(client, admin):
    with SessionLocal() as db:
        busy = db.execute(select(Job).where(Job.status == "scheduled")).scalars().first()
        target = db.execute(select(Job).where(Job.status.in_(("scheduled", "unscheduled")), Job.id != busy.id)).scalars().first()
    r = client.post(f"{API}/jobs/{target.id}/schedule", headers=admin, json={
        "technician_id": busy.technician_id, "scheduled_start": busy.scheduled_start.isoformat(),
        "scheduled_end": busy.scheduled_end.isoformat()})
    assert r.status_code == 409 and err(r) == "TECHNICIAN_DOUBLE_BOOKED"


def test_payment_idempotent_and_overpayment_blocked(client, admin):
    inv = first(client, admin, "/invoices?status=partially_paid")
    key = uuid.uuid4().hex
    h = {**admin, "Idempotency-Key": key}
    r1 = client.post(f"{API}/invoices/{inv['id']}/payments", json={"amount": 100, "method": "upi"}, headers=h)
    r2 = client.post(f"{API}/invoices/{inv['id']}/payments", json={"amount": 100, "method": "upi"}, headers=h)
    assert r1.status_code == 201 and r2.status_code == 201
    assert r1.json()["payment"]["id"] == r2.json()["payment"]["id"]
    after = client.get(f"{API}/invoices/{inv['id']}", headers=admin).json()
    assert round(after["amount_paid"] - inv["amount_paid"], 2) == 100  # charged once
    r = client.post(f"{API}/invoices/{inv['id']}/payments", json={"amount": after["balance"] + 1, "method": "upi"},
                    headers={**admin, "Idempotency-Key": uuid.uuid4().hex})
    assert err(r) == "OVERPAYMENT"


def test_inspection_gate_lists_missing_items(client, admin):
    with SessionLocal() as db:
        case = db.execute(select(SubsidyCase).where(SubsidyCase.stage == "installed")).scalars().first()
    ck = client.get(f"{API}/subsidy/{case.id}/checklist", headers=admin).json()
    assert not ck["ready"]
    assert "photos" in [c["key"] for c in ck["checks"] if not c["ok"]]
    r = client.post(f"{API}/subsidy/{case.id}/submit-inspection", headers=admin)
    assert err(r) == "INSPECTION_NOT_READY"


def test_feasibility_required_before_install(client):
    tk = client.post(f"{API}/auth/login", json={"email": "imran@sunpower.in", "password": "demo1234"}).json()
    h = {"Authorization": f"Bearer {tk['access_token']}"}
    with SessionLocal() as db:
        job = db.execute(select(Job).join(Order).join(SubsidyCase, SubsidyCase.order_id == Order.id)
                         .where(Job.status == "scheduled", SubsidyCase.stage == "applied")).scalars().first()
    r = client.post(f"{API}/jobs/{job.id}/start", json={}, headers=h)
    assert err(r) == "FEASIBILITY_NOT_APPROVED"


def test_warranty_decides_free_or_billable(client, admin):
    with SessionLocal() as db:
        free = db.execute(select(Ticket).where(Ticket.in_warranty.is_(True), Ticket.status == "closed")).scalars().first()
        paid = db.execute(select(Ticket).where(Ticket.in_warranty.is_(False), Ticket.status == "resolved")).scalars().first()
    f = client.get(f"{API}/tickets/{free.id}", headers=admin).json()
    p = client.get(f"{API}/tickets/{paid.id}", headers=admin).json()
    assert f["customer_total"] == 0 and f["company_cost"] > 0 and f["invoice"] is None
    assert p["invoice"] is not None and p["invoice"]["total"] > 0


def test_pay_run_twice_rejected(client, admin):
    from app.models import PayRun
    with SessionLocal() as db:
        run = db.execute(select(PayRun)).scalars().first()
    r = client.post(f"{API}/technicians/{run.technician_id}/pay-runs", json={"month": run.month.strftime("%Y-%m")},
                    headers=admin)
    assert r.status_code == 409 and err(r) == "ALREADY_PAID"


def test_rbac_blocks_wrong_role(client, tech):
    r = client.get(f"{API}/dashboard", headers=tech)
    assert r.status_code == 403 and err(r) == "FORBIDDEN"


def test_public_qr_page_hides_personal_data(client):
    r = client.get(f"{API}/public/units/legacy-demo-unit-0007")
    body = r.json()
    assert r.status_code == 200 and body["in_warranty"] is False
    assert "phone" not in body and body["owner"] == "P. Jain"
