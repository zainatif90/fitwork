"""
Shared Redis client plus two small helpers used across the app:
JSON caching and fixed-window rate limiting.

If Redis is down, caching silently turns off (the app still works, just slower).
Rate limiting "fails open" in that case and logs a warning.

REDIS_URL=memory uses a small in-process store instead of a Redis server. That is used on
Google Cloud Run, which runs exactly ONE instance of the app (max-instances=1), so keeping
the cache and rate-limit counters in memory gives the same behaviour without paying for Redis.
"""
import json
import logging
import threading
import time
from typing import Any

import redis

from app.core.config import settings

log = logging.getLogger(__name__)


class MemoryStore:
    """The few Redis commands FitWork uses, kept in a dict with expiry times (thread-safe)."""

    def __init__(self) -> None:
        self._data: dict[str, tuple[str, float | None]] = {}
        self._lock = threading.Lock()

    def _alive(self, key: str) -> tuple[str, float | None] | None:
        item = self._data.get(key)
        if item and item[1] is not None and item[1] <= time.monotonic():
            del self._data[key]
            return None
        return item

    def get(self, key: str) -> str | None:
        with self._lock:
            item = self._alive(key)
            return item[0] if item else None

    def set(self, key: str, value: Any, ex: int | None = None, nx: bool = False) -> bool:
        with self._lock:
            if nx and self._alive(key):
                return False
            self._data[key] = (str(value), time.monotonic() + ex if ex else None)
            return True

    def setex(self, key: str, seconds: int, value: Any) -> bool:
        return self.set(key, value, ex=seconds)

    def delete(self, *keys: str) -> int:
        with self._lock:
            return sum(1 for k in keys if self._data.pop(k, None) is not None)

    def exists(self, key: str) -> int:
        with self._lock:
            return 1 if self._alive(key) else 0

    def incr(self, key: str) -> int:
        with self._lock:
            item = self._alive(key)
            value = int(item[0]) + 1 if item else 1
            self._data[key] = (str(value), item[1] if item else None)
            return value

    def expire(self, key: str, seconds: int) -> bool:
        with self._lock:
            item = self._alive(key)
            if not item:
                return False
            self._data[key] = (item[0], time.monotonic() + seconds)
            return True

    def flushdb(self) -> bool:
        with self._lock:
            self._data.clear()
            return True


redis_client: Any = (
    MemoryStore() if settings.REDIS_URL == "memory"
    else redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)
)


def cache_get(key: str) -> Any | None:
    try:
        raw = redis_client.get(key)
    except redis.RedisError as exc:
        log.warning("Redis get failed for %s: %s", key, exc)
        return None
    return json.loads(raw) if raw else None


def cache_set(key: str, value: Any, ttl_seconds: int) -> None:
    try:
        redis_client.setex(key, ttl_seconds, json.dumps(value, default=str))
    except redis.RedisError as exc:
        log.warning("Redis set failed for %s: %s", key, exc)


def cache_delete(*keys: str) -> None:
    try:
        if keys:
            redis_client.delete(*keys)
    except redis.RedisError as exc:
        log.warning("Redis delete failed: %s", exc)


def hit_rate_limit(key: str, limit: int, window_seconds: int) -> bool:
    """
    Count one attempt for `key`. Returns True when the limit is exceeded.
    Fixed window: the counter starts at the first attempt and expires after the window.
    """
    try:
        count = redis_client.incr(key)
        if count == 1:
            redis_client.expire(key, window_seconds)
        return count > limit
    except redis.RedisError as exc:
        log.warning("Rate limit check skipped (Redis error): %s", exc)
        return False
