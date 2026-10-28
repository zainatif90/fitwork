"""
Shared Redis client plus two small helpers used across the app:
JSON caching and fixed-window rate limiting.

If Redis is down, caching silently turns off (the app still works, just slower).
Rate limiting "fails open" in that case and logs a warning.
"""
import json
import logging
from typing import Any

import redis

from app.core.config import settings

log = logging.getLogger(__name__)

redis_client: redis.Redis = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)


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
