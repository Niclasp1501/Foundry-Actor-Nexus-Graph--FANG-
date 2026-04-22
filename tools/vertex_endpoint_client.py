#!/usr/bin/env python3
"""Shared Vertex endpoint caller for FANG translation scripts."""

from __future__ import annotations

import json
import os
from urllib import parse, request


DEFAULT_PROJECT_ID = "357050007151"
DEFAULT_LOCATION = "europe-west4"
DEFAULT_ENDPOINT_ID = "4963571520757563392"


def _first_env(*names: str, default: str = "") -> str:
    for name in names:
        value = os.environ.get(name)
        if value and value.strip():
            return value.strip()
    return default


def resolve_api_key() -> str:
    return _first_env("DND_VERTEX_KEY", "GEMINI_API_KEY")


def resolve_vertex_target() -> tuple[str, str, str]:
    project_id = _first_env(
        "DND_VERTEX_PROJECT_ID",
        "VERTEX_PROJECT_ID",
        "GOOGLE_CLOUD_PROJECT",
        default=DEFAULT_PROJECT_ID,
    )
    location = _first_env(
        "DND_VERTEX_LOCATION",
        "VERTEX_LOCATION",
        "GOOGLE_CLOUD_LOCATION",
        default=DEFAULT_LOCATION,
    )
    endpoint_id = _first_env(
        "DND_VERTEX_ENDPOINT_ID",
        "VERTEX_ENDPOINT_ID",
        default=DEFAULT_ENDPOINT_ID,
    )
    return project_id, location, endpoint_id


def build_vertex_url(api_key: str) -> str:
    project_id, location, endpoint_id = resolve_vertex_target()
    if not endpoint_id:
        raise RuntimeError("DND_VERTEX_ENDPOINT_ID (or VERTEX_ENDPOINT_ID) is not set")
    return (
        f"https://{location}-aiplatform.googleapis.com/v1/"
        f"projects/{project_id}/locations/{location}/endpoints/{endpoint_id}:generateContent"
        f"?key={parse.quote(api_key)}"
    )


def vertex_generate_text(
    *,
    api_key: str,
    prompt: str,
    system_instruction: str | None = None,
    temperature: float = 0.2,
    timeout: int = 180,
    max_output_tokens: int | None = None,
) -> str:
    url = build_vertex_url(api_key)
    payload: dict = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": temperature},
    }
    if system_instruction:
        payload["systemInstruction"] = {"parts": [{"text": system_instruction}]}
    if max_output_tokens is not None:
        payload["generationConfig"]["maxOutputTokens"] = max_output_tokens

    req = request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with request.urlopen(req, timeout=timeout) as response:
        body = response.read().decode("utf-8")

    parsed = json.loads(body)
    candidates = parsed.get("candidates", [])
    if not candidates:
        raise RuntimeError(f"No candidates returned: {body}")
    parts = candidates[0].get("content", {}).get("parts", [])
    text = "".join(part.get("text", "") for part in parts)
    if not text.strip():
        raise RuntimeError(f"Empty text response: {body}")
    return text

