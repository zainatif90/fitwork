"""
Provider-agnostic LLM client (used only for proposal drafts).

Pick the provider with env vars:
    LLM_PROVIDER = gemini | openai
    LLM_API_KEY  = your key
    LLM_MODEL    = e.g. gemini-2.5-flash  or  gpt-4o-mini
Both providers are called with plain HTTPS requests (httpx), so there is no extra SDK to install.
Any failure raises LLMError; the caller then falls back to a template proposal.
"""
import logging

import httpx

from app.core.config import settings

log = logging.getLogger(__name__)


class LLMError(Exception):
    pass


class LLMClient:
    def __init__(self, provider: str | None = None, api_key: str | None = None, model: str | None = None,
                 timeout: float | None = None) -> None:
        self.provider = (provider or settings.LLM_PROVIDER).lower()
        self.api_key = api_key if api_key is not None else settings.LLM_API_KEY
        self.model = model or settings.LLM_MODEL
        self.timeout = timeout or settings.LLM_TIMEOUT_SEC

    def generate(self, system: str, prompt: str) -> str:
        if not self.api_key or self.api_key.strip().lower() == "none":
            raise LLMError("LLM_API_KEY is not set")
        try:
            if self.provider == "gemini":
                text = self._gemini(system, prompt)
            elif self.provider == "openai":
                text = self._openai(system, prompt)
            else:
                raise LLMError(f"Unknown LLM_PROVIDER '{self.provider}'")
        except httpx.TimeoutException as exc:
            raise LLMError(f"LLM timed out after {self.timeout}s") from exc
        except httpx.HTTPError as exc:
            raise LLMError(f"LLM request failed: {exc}") from exc
        text = text.strip()
        if not text:
            raise LLMError("LLM returned an empty response")
        return text

    def _gemini(self, system: str, prompt: str) -> str:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent"
        res = httpx.post(
            url,
            headers={"x-goog-api-key": self.api_key},
            json={
                "systemInstruction": {"parts": [{"text": system}]},
                "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.7, "maxOutputTokens": 1024},
            },
            timeout=self.timeout,
        )
        if res.status_code != 200:
            raise LLMError(f"Gemini HTTP {res.status_code}: {res.text[:200]}")
        data = res.json()
        try:
            parts = data["candidates"][0]["content"]["parts"]
        except (KeyError, IndexError) as exc:
            raise LLMError(f"Unexpected Gemini response: {str(data)[:200]}") from exc
        return "".join(p.get("text", "") for p in parts)

    def _openai(self, system: str, prompt: str) -> str:
        res = httpx.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={
                "model": self.model,
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
                "max_completion_tokens": 1024,
            },
            timeout=self.timeout,
        )
        if res.status_code != 200:
            raise LLMError(f"OpenAI HTTP {res.status_code}: {res.text[:200]}")
        try:
            return res.json()["choices"][0]["message"]["content"] or ""
        except (KeyError, IndexError) as exc:
            raise LLMError("Unexpected OpenAI response") from exc
