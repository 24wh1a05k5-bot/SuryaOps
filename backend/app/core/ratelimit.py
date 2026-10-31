"""Rate limiter for public endpoints (lead form, QR tickets, shared reports, login)."""
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
