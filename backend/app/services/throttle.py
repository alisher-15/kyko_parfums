"""Brute-force protection for logins and password-reset emails.

Attempts are counted in process memory: the app runs as one uvicorn process, and a restart only
forgets the counts. Keys are emails, because behind the Next.js proxy every request comes from
the same address.
"""

import threading
import time
from collections import deque

MAX_KEYS = 10_000


class Throttle:
    """At most ``limit`` attempts per key within a sliding window of ``window`` seconds."""

    def __init__(self, limit: int, window: int):
        self.limit = limit
        self.window = window
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def _prune(self, key: str, now: float) -> deque[float] | None:
        hits = self._hits.get(key)
        while hits and hits[0] <= now - self.window:
            hits.popleft()
        if hits is not None and not hits:
            del self._hits[key]
            return None
        return hits

    def retry_after(self, key: str) -> int:
        """Seconds until the key may try again; 0 when it may try now."""
        with self._lock:
            now = time.monotonic()
            hits = self._prune(key, now)
            if hits is None or len(hits) < self.limit:
                return 0
            return int(hits[0] + self.window - now) + 1

    def hit(self, key: str) -> None:
        with self._lock:
            now = time.monotonic()
            if len(self._hits) >= MAX_KEYS:
                for k in list(self._hits):
                    self._prune(k, now)
                # Still full (a flood of made-up emails): forget a tenth, so memory stays bounded
                # and a login never waits on a sweep of hundreds of thousands of keys. The keys
                # hit least lately go first (the dict is kept in that order), and a locked key
                # only when nothing else is left: a flood must not unlock the email it targets.
                if len(self._hits) >= MAX_KEYS:
                    order = list(self._hits)
                    locked = {k for k in order if len(self._hits[k]) >= self.limit}
                    victims = [k for k in order if k not in locked] + [
                        k for k in order if k in locked
                    ]
                    for k in victims[: MAX_KEYS // 10]:
                        del self._hits[k]
            # Moved to the end: the dict runs from the key hit least lately to the latest.
            hits = self._hits.pop(key, None) or deque()
            hits.append(now)
            self._hits[key] = hits

    def reset(self, key: str) -> None:
        with self._lock:
            self._hits.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._hits.clear()


# Wrong passwords per email.
login_failures = Throttle(limit=10, window=15 * 60)
# Password-reset emails per address.
reset_emails = Throttle(limit=3, window=60 * 60)
# Orders without an account: per phone number, and for the whole site, so that nobody can empty
# the shelves with made-up orders. Customers with an account are not limited.
guest_orders_per_phone = Throttle(limit=3, window=60 * 60)
guest_orders = Throttle(limit=30, window=60 * 60)
