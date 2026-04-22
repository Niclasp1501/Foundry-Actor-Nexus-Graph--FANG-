#!/usr/bin/env python3
"""Translate FANG i18n files from lang/en.json via Vertex endpoint."""

from __future__ import annotations

import argparse
import json
import random
import time
from pathlib import Path
from urllib import error

from vertex_endpoint_client import resolve_api_key, vertex_generate_text


SYSTEM_INSTRUCTION = (
    "You are a professional localization assistant for Foundry VTT modules. "
    "Translate UI text naturally and consistently for the requested target language. "
    "Keep output compact and return only the required JSON object."
)

TARGET_LOCALES = {
    "fr": "French",
    "es": "Spanish",
    "pt-BR": "Portuguese (Brazil)",
    "it": "Italian",
    "pl": "Polish",
    "ru": "Russian",
    "cs": "Czech",
    "nl": "Dutch",
}


def flatten(node, prefix="", out=None):
    if out is None:
        out = {}
    if isinstance(node, dict):
        for k, v in node.items():
            p = f"{prefix}.{k}" if prefix else k
            flatten(v, p, out)
    else:
        out[prefix] = node
    return out


def unflatten_to_nested(flat_map):
    root = {}
    for key, value in flat_map.items():
        parts = key.split(".")
        cur = root
        for part in parts[:-1]:
            cur = cur.setdefault(part, {})
        cur[parts[-1]] = value
    return root


def extract_json_object(text):
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("Response does not contain a JSON object")
    return json.loads(text[start : end + 1])


def save_lang_file(out_path: Path, translated_flat: dict[str, str]) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    nested = unflatten_to_nested(translated_flat)
    out_path.write_text(json.dumps(nested, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description="Translate FANG i18n files from EN via Vertex API.")
    parser.add_argument("--source", default="lang/en.json")
    parser.add_argument("--out-dir", default="lang")
    parser.add_argument("--batch-size", type=int, default=28)
    parser.add_argument("--sleep-ms", type=int, default=900)
    parser.add_argument("--max-retries", type=int, default=5)
    parser.add_argument("--initial-backoff-ms", type=int, default=1500)
    parser.add_argument("--jitter-ms", type=int, default=500)
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()

    api_key = resolve_api_key()
    if not api_key:
        raise RuntimeError("DND_VERTEX_KEY (or GEMINI_API_KEY fallback) is not set")

    source_path = Path(args.source)
    source_json = json.loads(source_path.read_text(encoding="utf-8"))
    source_flat = flatten(source_json)
    source_items = list(source_flat.items())

    out_dir = Path(args.out_dir)
    reports = []

    for locale, locale_name in TARGET_LOCALES.items():
        out_path = out_dir / f"{locale}.json"
        translated = {}
        if out_path.exists() and not args.overwrite:
            translated = flatten(json.loads(out_path.read_text(encoding="utf-8")))

        pending = [(k, v) for k, v in source_items if k not in translated]
        total_batches = (len(pending) + args.batch_size - 1) // args.batch_size if pending else 0
        print(f"[{locale}] start | pending={len(pending)} | batches={total_batches}", flush=True)

        failures = []
        batch_number = 0
        for i in range(0, len(pending), args.batch_size):
            batch_number += 1
            batch = pending[i : i + args.batch_size]
            payload = {k: v for k, v in batch}

            prompt = (
                f"Target language: {locale_name} ({locale})\n"
                "Translate this Foundry VTT i18n JSON object.\n"
                "Output exactly one JSON object with the same keys.\n"
                "Rules:\n"
                "1) Keep keys unchanged.\n"
                "2) Preserve placeholders exactly: {name}, {value}, %s, %d, %1$s.\n"
                "3) Preserve HTML tags/entities and punctuation.\n"
                "4) Keep product/module names and explicit IDs unchanged.\n"
                "5) Do not add comments or extra keys.\n"
                f"JSON:\n{json.dumps(payload, ensure_ascii=False)}"
            )

            success = False
            last_error = None
            for attempt in range(args.max_retries + 1):
                try:
                    response_text = vertex_generate_text(
                        api_key=api_key,
                        prompt=prompt,
                        system_instruction=SYSTEM_INSTRUCTION,
                        temperature=0.2,
                        timeout=180,
                    )
                    obj = extract_json_object(response_text)
                    accepted = 0
                    for key, src in payload.items():
                        val = obj.get(key)
                        if isinstance(val, str) and val.strip():
                            translated[key] = val
                            accepted += 1
                        else:
                            translated[key] = src
                            failures.append({"key": key, "reason": "missing_or_empty_in_model_response"})
                    save_lang_file(out_path, translated)
                    print(
                        f"[{locale}] batch {batch_number}/{total_batches} ok | accepted={accepted}/{len(payload)}",
                        flush=True,
                    )
                    success = True
                    break
                except error.HTTPError as exc:
                    last_error = f"HTTP {exc.code}: {exc.reason}"
                    if exc.code == 429 and attempt < args.max_retries:
                        backoff = (args.initial_backoff_ms * (2 ** attempt)) + random.randint(0, args.jitter_ms)
                        print(
                            f"[{locale}] retry {attempt + 1}/{args.max_retries} after {backoff}ms due to {last_error}",
                            flush=True,
                        )
                        time.sleep(backoff / 1000)
                        continue
                    break
                except Exception as exc:  # noqa: BLE001
                    last_error = str(exc)
                    break

            if not success:
                for key, src in payload.items():
                    translated[key] = src
                    failures.append({"key": key, "reason": f"batch_failed: {last_error}"})
                save_lang_file(out_path, translated)
                print(f"[{locale}] batch {batch_number}/{total_batches} failed | reason={last_error}", flush=True)

            if args.sleep_ms > 0:
                time.sleep(args.sleep_ms / 1000)

        report = {
            "locale": locale,
            "locale_name": locale_name,
            "source_keys": len(source_items),
            "translated_keys": len(translated),
            "failures": len(failures),
        }
        reports.append(report)
        print(f"[{locale}] done | translated={len(translated)} | failures={len(failures)}", flush=True)

    report_path = Path("tools/i18n-translation-report.json")
    report_path.write_text(json.dumps(reports, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"report={report_path}")


if __name__ == "__main__":
    main()

