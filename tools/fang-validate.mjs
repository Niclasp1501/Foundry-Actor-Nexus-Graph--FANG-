#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

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
  /Ã[\u0080-\u00BF]/,
  /Â[\u0080-\u00BF]/,
  /Ð[\u0080-\u00BF]/,
  /Ñ[\u0080-\u00BF]/,
  /�/,
  /\w\?\w/,
  /\?\?/
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

// Braces in the stylesheets have to balance.
//
// One unclosed block swallows everything after it: the rules are still in the file, still served,
// and simply never match. A selector list edited by script is how it happened -- a line ending in
// "{" was duplicated, so one block got two opening braces, and five of those left the last four
// hundred rules inert with nothing anywhere reporting a problem.
{
  const styleDir = path.join(root, "styles");
  const sheets = fs.existsSync(styleDir)
    ? fs.readdirSync(styleDir).filter((file) => file.endsWith(".css")).sort()
    : [];
  for (const file of sheets) {
    const text = fs.readFileSync(path.join(styleDir, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    let depth = 0;
    let line = 1;
    let firstExtraClose = 0;
    for (const char of text) {
      if (char === "\n") line++;
      else if (char === "{") depth++;
      else if (char === "}") {
        depth--;
        if (depth < 0 && !firstExtraClose) firstExtraClose = line;
      }
    }
    if (depth > 0) errors.push(`styles/${file}: unbalanced braces, ${depth} block(s) never closed`);
    else if (depth < 0 || firstExtraClose) errors.push(`styles/${file}: unbalanced braces, extra "}" around line ${firstExtraClose}`);
  }
}

// Parse every script the way Foundry actually loads it: as an ES module.
//
// "node --check foo.js" treats the file as a CommonJS script and waves through things a module
// parser rejects. "a ?? b || c" is one of them. It shipped, and the browser answered with a
// SyntaxError pointing at an unrelated private method thirty lines into a different class --
// which meant main.js never evaluated, so there were no hooks, no button, no FANG at all, for
// everyone. Copying to .mjs before checking is what makes this honest.
{
  const scriptDir = path.join(root, "scripts");
  const scripts = fs.existsSync(scriptDir)
    ? fs.readdirSync(scriptDir).filter((file) => /\.(js|mjs)$/.test(file)).sort()
    : [];
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fang-check-"));
  for (const file of scripts) {
    const asModule = path.join(tmpDir, file.replace(/\.js$/, ".mjs"));
    fs.copyFileSync(path.join(scriptDir, file), asModule);
    try {
      execFileSync(process.execPath, ["--check", asModule], { stdio: "pipe" });
    } catch (err) {
      const message = String(err.stderr || err.message).match(/SyntaxError: .*/)?.[0] ?? "parse failed";
      errors.push(`scripts/${file}: ${message}`);
    }
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
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

console.log(`FANG validation passed (${localeFiles.length} locales, scripts parse as ES modules, stylesheets balanced).`);
