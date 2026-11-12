import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const cssRoot = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(repositoryRoot, "artifacts/jusoor-program/src");

const physicalProperties = new Set([
  "left",
  "right",
  "inset-left",
  "inset-right",
  "margin-left",
  "margin-right",
  "padding-left",
  "padding-right",
  "scroll-margin-left",
  "scroll-margin-right",
  "scroll-padding-left",
  "scroll-padding-right",
]);

function isPhysicalProperty(property, value) {
  const normalized = property.toLowerCase();
  const values = splitCssValues(value);
  return (
    physicalProperties.has(normalized) ||
    /^border-(left|right)(-|$)/.test(normalized) ||
    /^border-(top|bottom)-(left|right)-radius$/.test(normalized) ||
    (normalized === "inset" &&
      values.length === 4 &&
      values[1] !== values[3]) ||
    (["float", "clear"].includes(normalized) &&
      /^(left|right)(?:\s|$)/i.test(value.trim()))
  );
}

function splitCssValues(value) {
  const values = [];
  let current = "";
  let depth = 0;
  let quote = "";
  let escaped = false;
  const shorthand = value.replace(/\s*!important\s*$/i, "").trim();

  for (const character of shorthand) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      current += character;
      escaped = true;
      continue;
    }
    if (quote) {
      current += character;
      if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      current += character;
    } else if (character === "(") {
      depth += 1;
      current += character;
    } else if (character === ")") {
      depth = Math.max(0, depth - 1);
      current += character;
    } else if (/\s/.test(character) && depth === 0) {
      if (current) {
        values.push(current);
        current = "";
      }
    } else {
      current += character;
    }
  }

  if (current) values.push(current);
  return values;
}

async function collectCssFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return collectCssFiles(path);
      return entry.isFile() && entry.name.endsWith(".css") ? [path] : [];
    }),
  );
  return nested.flat();
}

function checkCss(path, source) {
  // Keep character positions stable so comments can document intentional exceptions.
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, (comment) =>
    comment.replace(/[^\n]/g, " "),
  );
  const declarationPattern = /(?:^|[;{}])\s*([-\w]+)\s*:\s*([^;{}]*)/g;
  const violations = [];
  let match;

  while ((match = declarationPattern.exec(withoutComments))) {
    const property = match[1];
    const value = match[2];
    if (!isPhysicalProperty(property, value)) continue;

    const propertyStart = match.index + match[0].lastIndexOf(property);
    const precedingText = source.slice(match.index, propertyStart);
    const documentedException =
      /\/\*\s*physical-layout-exception:\s*\S[\s\S]*?\*\//i.test(
        precedingText,
      );
    if (documentedException) continue;

    const line = source.slice(0, propertyStart).split("\n").length;
    violations.push(`${relative(repositoryRoot, path)}:${line}: ${property}: ${value.trim()}`);
  }

  return violations;
}

const files = await collectCssFiles(cssRoot);
const violations = (
  await Promise.all(
    files.map(async (path) => checkCss(path, await readFile(path, "utf8"))),
  )
).flat();

if (violations.length > 0) {
  console.error("Physical left/right layout properties found in app CSS:");
  for (const violation of violations) console.error(`  ${violation}`);
  console.error(
    "\nUse logical properties (for example, inset-inline-start). If a physical declaration is necessary, document it immediately before the declaration with /* physical-layout-exception: reason */.",
  );
  process.exitCode = 1;
} else {
  console.log(`Checked ${files.length} CSS files; no undocumented physical left/right layout properties found.`);
}
