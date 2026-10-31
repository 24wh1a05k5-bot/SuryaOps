"""Request bodies. Pydantic validates shape and basic ranges; services enforce business rules."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

PHONE_PATTERN = r"^[6-9]\d{9}$"   # Indian mobile numbers


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class LoginIn(Strict):
    email: EmailStr
    password: str = Field(min_length=1)


class CustomerIn(Strict):
    name: str = Field(min_length=2, max_length=120)
    phone: str = Field(pattern=PHONE_PATTERN, description="10-digit Indian mobile number")
    email: EmailStr | None = None
    address: str | None = Field(default=None, max_length=300)
    city: str | None = Field(default=None, max_length=80)
    pincode: str | None = Field(default=None, pattern=r"^\d{6}$")


class PublicLeadIn(CustomerIn):
    requested_kw: float = Field(gt=0, le=10)
    system_type: Literal["panel_set", "on_grid", "off_grid"] = "on_grid"
    wants_subsidy: bool = True
    monthly_bill: float | None = Field(default=None, ge=0, le=1_000_000)


class LeadIn(PublicLeadIn):
    source: Literal["web", "call", "whatsapp", "referral"] = "call"
    assigned_to: int | None = None


class LeadUpdate(Strict):
    version: int | None = None
    requested_kw: float | None = Field(default=None, gt=0, le=10)
    system_type: Literal["panel_set", "on_grid", "off_grid"] | None = None
    wants_subsidy: bool | None = None
    roof_area_sqft: float | None = Field(default=None, gt=0, le=100000)
    shadow_free: bool | None = None
    grid_suitable: bool | None = None
    assigned_to: int | None = None
    # customer subsidy-readiness fields
    monthly_bill: float | None = Field(default=None, ge=0)
    consumer_no: str | None = Field(default=None, max_length=40)
    aadhaar_name: str | None = Field(default=None, max_length=120)
    bill_name: str | None = Field(default=None, max_length=120)
    bank_account_name: str | None = Field(default=None, max_length=120)
    bank_aadhaar_seeded: bool | None = None
    address: str | None = Field(default=None, max_length=300)
    city: str | None = Field(default=None, max_length=80)


class LeadTransitionIn(Strict):
    to: Literal["contacted", "qualified", "lost"]
    lost_reason: str | None = Field(default=None, max_length=300)


class NoteIn(Strict):
    note: str = Field(min_length=1, max_length=2000)


class SurveyCreate(Strict):
    technician_id: int
    scheduled_at: datetime


class SurveySubmit(Strict):
    roof_direction: Literal["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
    tilt_deg: float = Field(ge=0, le=90)
    cable_distance_m: float = Field(ge=0, le=500)
    usable_area_sqft: float = Field(gt=0, le=100000)
    notes: str | None = Field(default=None, max_length=2000)


class RejectIn(Strict):
    reason: str = Field(min_length=3, max_length=300)


class QuoteIn(Strict):
    kit_id: int
    is_subsidy: bool = False
    sanctioned_kw: float | None = Field(default=None, gt=0, le=10)


class ConfirmIn(Strict):
    advance_amount: float = Field(gt=0)
    method: Literal["cash", "upi", "bank_transfer", "cheque", "card"] = "upi"
    reference: str | None = Field(default=None, max_length=80)


class CancelIn(Strict):
    reason: str = Field(min_length=3, max_length=300)


class OrderLineIn(Strict):
    product_id: int
    qty: int = Field(gt=0, le=1000)
    unit_price: float | None = Field(default=None, ge=0)


class OrderUpdate(Strict):
    version: int | None = None
    is_subsidy: bool | None = None
    sanctioned_kw: float | None = Field(default=None, gt=0, le=10)
    lines: list[OrderLineIn] | None = None


class PurchaseLineIn(Strict):
    product_id: int
    qty: int = Field(gt=0, le=10000)
    unit_cost: float = Field(ge=0)


class PurchaseIn(Strict):
    supplier_id: int
    lines: list[PurchaseLineIn] = Field(min_length=1)


class ReceiveLineIn(Strict):
    line_id: int
    serials: list[str] = Field(default_factory=list)

    @field_validator("serials")
    @classmethod
    def clean(cls, v: list[str]) -> list[str]:
        return [s.strip().upper() for s in v if s and s.strip()]


class ReceiveIn(Strict):
    lines: list[ReceiveLineIn]


class ScanIn(Strict):
    serial: str = Field(min_length=3, max_length=80)


class ScheduleIn(Strict):
    technician_id: int
    scheduled_start: datetime
    scheduled_end: datetime


class JobSerialsIn(Strict):
    serials: list[str] = Field(min_length=1)


class JobStartIn(Strict):
    actual_start: datetime | None = None


class JobCompleteIn(Strict):
    actual_end: datetime | None = None
    installed_kw: float = Field(gt=0, le=10)
    signed_by_name: str = Field(min_length=2, max_length=120)
    signature_data_url: str = Field(min_length=50, description="PNG data URL from the signature pad")
    notes: str | None = Field(default=None, max_length=2000)


class SubsidyAdvanceIn(Strict):
    to_stage: Literal["feasibility_approved", "net_meter_installed", "subsidy_credited"]
    application_no: str | None = Field(default=None, max_length=60)
    note: str | None = Field(default=None, max_length=300)


class TicketIn(Strict):
    customer_id: int | None = None
    serial: str | None = None
    channel: Literal["phone", "qr", "walk_in"] = "phone"
    issue: str = Field(min_length=5, max_length=2000)
    fault_code: str | None = Field(default=None, max_length=40)


class PublicTicketIn(Strict):
    issue: str = Field(min_length=5, max_length=2000)
    fault_code: str | None = Field(default=None, max_length=40)


class TicketCloseIn(Strict):
    customer_confirmed: bool


class TicketUpdate(Strict):
    version: int | None = None
    assigned_to: int | None = None
    status: Literal["assigned", "in_progress"] | None = None


class TicketLineIn(Strict):
    is_labour: bool = False
    product_id: int | None = None
    replacement_serial: str | None = None
    description: str | None = Field(default=None, max_length=200)
    qty: float = Field(gt=0, le=1000)
    unit_price: float | None = Field(default=None, ge=0)


class PaymentIn(Strict):
    amount: float = Field(gt=0)
    method: Literal["cash", "upi", "bank_transfer", "cheque", "card"]
    reference: str | None = Field(default=None, max_length=80)


class PayRunIn(Strict):
    month: str = Field(pattern=r"^\d{4}-\d{2}$")


class SharedReportIn(Strict):
    title: str = Field(default="Business report", max_length=120)
    period_start: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    period_end: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    expires_in_days: int = Field(default=7, ge=1, le=90)


class SettingsUpdate(Strict):
    values: dict
