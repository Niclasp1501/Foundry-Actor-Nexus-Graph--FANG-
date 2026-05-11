#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const langDir = path.join(root, "lang");
const localeFiles = fs.readdirSync(langDir).filter((file) => file.endsWith(".json")).sort();

function flattenKeys(value, prefix = "") {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => {
    const next = prefix ? `${prefix}.${key}` : key;
    return flattenKeys(child, next);
  });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

const errors = [];
const warnings = [];
const locales = new Map();

for (const file of localeFiles) {
  try {
    locales.set(file, readJson(path.join(langDir, file)));
  } catch (err) {
    errors.push(`${file}: invalid JSON (${err.message})`);
  }
}

const english = locales.get("en.json");
if (!english) errors.push("Missing lang/en.json");

if (english) {
  const baseKeys = new Set(flattenKeys(english).filter(Boolean));
  for (const [file, json] of locales.entries()) {
    const keys = new Set(flattenKeys(json).filter(Boolean));
    const missing = [...baseKeys].filter((key) => !keys.has(key));
    const extra = [...keys].filter((key) => !baseKeys.has(key));
    if (missing.length) errors.push(`${file}: missing keys: ${missing.join(", ")}`);
    if (extra.length) warnings.push(`${file}: extra keys: ${extra.join(", ")}`);
  }
}

const suspiciousPatterns = [
  /Ã./,
  /Â./,
  /Ð./,
  /Ñ./,
  /�/
];

for (const file of [...localeFiles, "README.md", "TODO.md", "DEVELOPER_GUIDE.md"]) {
  const filePath = path.join(root, file.startsWith("lang/") ? file : file);
  const resolved = fs.existsSync(filePath) ? filePath : path.join(root, "lang", file);
  if (!fs.existsSync(resolved)) continue;
  const text = fs.readFileSync(resolved, "utf8");
  if (suspiciousPatterns.some((pattern) => pattern.test(text))) {
    warnings.push(`${file}: possible mojibake/encoding artifacts detected`);
  }
}

if (warnings.length) {
  console.warn("Warnings:");
  for (const warning of warnings) console.warn(`- ${warning}`);
}

if (errors.length) {
  console.error("Errors:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`FANG validation passed (${localeFiles.length} locales).`);
