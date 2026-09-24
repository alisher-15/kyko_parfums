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
            self._hits.setdefault(key, deque()).append(now)

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
