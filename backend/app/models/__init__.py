"""All models imported here so Base.metadata knows every table."""
from sqlalchemy import Sequence

from app.core.db import Base
from app.models.catalog import KitLine, KitTemplate, Product, Purchase, PurchaseLine, StockUnit, Supplier
from app.models.crm import Customer, Lead, LeadNote, Survey
from app.models.field import (Job, JobSerial, PayRun, Photo, SubsidyCase, SubsidyEvent, TimeLog,
                              SUBSIDY_STAGES)
from app.models.money import (Invoice, InvoiceLine, Payment, ReportView, SharedReport, Ticket, TicketLine)
from app.models.sales import Order, OrderLine, PickList
from app.models.users import ActivityLog, Setting, User

# Postgres sequences -> human-readable numbers that stay unique under concurrency
SEQUENCES = {
    "ORD": Sequence("order_number_seq", metadata=Base.metadata),
    "INV": Sequence("invoice_number_seq", metadata=Base.metadata),
    "TKT": Sequence("ticket_number_seq", metadata=Base.metadata),
    "PO": Sequence("purchase_number_seq", metadata=Base.metadata),
}

__all__ = [
    "Base", "User", "Setting", "ActivityLog", "Customer", "Lead", "LeadNote", "Survey", "Product",
    "KitTemplate", "KitLine", "Supplier", "Purchase", "PurchaseLine", "StockUnit", "Order", "OrderLine",
    "PickList", "Job", "JobSerial", "Photo", "TimeLog", "PayRun", "SubsidyCase", "SubsidyEvent", "Ticket",
    "TicketLine", "Invoice", "InvoiceLine", "Payment", "SharedReport", "ReportView", "SEQUENCES",
    "SUBSIDY_STAGES",
]
