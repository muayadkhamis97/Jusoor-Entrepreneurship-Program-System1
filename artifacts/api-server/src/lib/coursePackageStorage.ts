import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { access, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, posix, relative, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import yauzl from "yauzl";
import { getCourseMaterialFile } from "./courseStorage";

export type CoursePackageKind = "scorm" | "xapi";
export type CoursePackageFormat = "scorm12" | "scorm2004" | "xapi";

export interface CoursePackageInfo {
  format: CoursePackageFormat;
  launchPath: string;
  activityId: string | null;
}

const maxPackageBytes = 100 * 1024 * 1024;
const maxExpandedBytes = 500 * 1024 * 1024;
const maxEntries = 10_000;
const packageCacheRoot = resolve(tmpdir(), "jusoor-course-packages");
const pendingExtractions = new Map<string, Promise<string>>();

export async function prepareCoursePackage(
  objectPath: string,
  kind: CoursePackageKind,
): Promise<CoursePackageInfo> {
  const root = await ensurePackageExtracted(objectPath);
  return inspectPackage(root, kind);
}

export async function getCoursePackageResource(
  objectPath: string,
  relativePath: string,
): Promise<{ filePath: string; contentType: string }> {
  const root = await ensurePackageExtracted(objectPath);
  const safePath = normalizePackagePath(relativePath);
  if (!safePath) throw new Error("Invalid package path.");
  const filePath = resolve(root, ...safePath.split("/"));
  if (!filePath.startsWith(`${root}${sep}`)) throw new Error("Invalid package path.");
  const metadata = await stat(filePath);
  if (!metadata.isFile()) throw new Error("Package resource not found.");
  return { filePath, contentType: contentTypeFor(safePath) };
}

export async function deleteCoursePackageCache(objectPath: string): Promise<void> {
  pendingExtractions.delete(objectPath);
  await rm(packageDirectory(objectPath), { recursive: true, force: true });
}

async function ensurePackageExtracted(objectPath: string): Promise<string> {
  const existing = pendingExtractions.get(objectPath);
  if (existing) return existing;
  const extraction = extractCoursePackage(objectPath);
  pendingExtractions.set(objectPath, extraction);
  try {
    return await extraction;
  } catch (error) {
    pendingExtractions.delete(objectPath);
    throw error;
  }
}

function packageDirectory(objectPath: string): string {
  const digest = createHash("sha256").update(objectPath).digest("hex").slice(0, 32);
  return resolve(packageCacheRoot, digest);
}

async function extractCoursePackage(objectPath: string): Promise<string> {
  const destination = packageDirectory(objectPath);
  const markerPath = resolve(destination, ".jusoor-package-ready");
  try {
    await access(markerPath);
    return destination;
  } catch {
    // Re-extract after a process restart or an incomplete prior extraction.
  }

  const staging = resolve(packageCacheRoot, `.staging-${randomUUID()}`);
  const archivePath = resolve(staging, "upload.zip");
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true, mode: 0o700 });
  try {
    const file = await getCourseMaterialFile(objectPath);
    const [metadata] = await file.getMetadata();
    const size = Number(metadata.size);
    if (!Number.isSafeInteger(size) || size < 1 || size > maxPackageBytes) {
      throw new Error("Course package exceeds the upload size limit.");
    }
    await pipeline(file.createReadStream(), createWriteStream(archivePath, { flags: "wx", mode: 0o600 }));
    await extractZipSafely(archivePath, staging);
    await rm(archivePath, { force: true });
    await writeFile(resolve(staging, ".jusoor-package-ready"), "ready\n", { mode: 0o600 });
    await rm(destination, { recursive: true, force: true });
    await rename(staging, destination);
    return destination;
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

function extractZipSafely(archivePath: string, destination: string): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    yauzl.open(archivePath, {
      lazyEntries: true,
      autoClose: true,
      decodeStrings: true,
      validateEntrySizes: true,
    }, (openError, zipFile) => {
      if (openError || !zipFile) {
        rejectPromise(openError ?? new Error("Could not open course package."));
        return;
      }
      let entries = 0;
      let expandedBytes = 0;
      let finished = false;
      const fail = (error: Error) => {
        if (finished) return;
        finished = true;
        zipFile.close();
        rejectPromise(error);
      };
      zipFile.on("error", fail);
      zipFile.on("end", () => {
        if (finished) return;
        finished = true;
        resolvePromise();
      });
      zipFile.on("entry", (entry) => {
        if (finished) return;
        entries += 1;
        if (entries > maxEntries) {
          fail(new Error("Course package contains too many files."));
          return;
        }
        const rawName = entry.fileName.replace(/\\/g, "/");
        const safePath = normalizePackagePath(rawName);
        const unixMode = (entry.externalFileAttributes >>> 16) & 0o170000;
        if (!safePath || unixMode === 0o120000 || /^[a-z]:/i.test(rawName)) {
          fail(new Error("Course package contains an unsafe file path."));
          return;
        }
        expandedBytes += entry.uncompressedSize;
        if (!Number.isSafeInteger(entry.uncompressedSize) || expandedBytes > maxExpandedBytes) {
          fail(new Error("Course package expands beyond the allowed size."));
          return;
        }
        const target = resolve(destination, ...safePath.split("/"));
        if (!target.startsWith(`${destination}${sep}`)) {
          fail(new Error("Course package contains an unsafe file path."));
          return;
        }
        if (rawName.endsWith("/")) {
          void mkdir(target, { recursive: true, mode: 0o700 })
            .then(() => zipFile.readEntry())
            .catch((error: unknown) => fail(error instanceof Error ? error : new Error("Could not create a package directory.")));
          return;
        }
        void mkdir(resolve(target, ".."), { recursive: true, mode: 0o700 })
          .then(() => new Promise<void>((streamResolve, streamReject) => {
            zipFile.openReadStream(entry, (streamError, source) => {
              if (streamError || !source) {
                streamReject(streamError ?? new Error("Could not read a package file."));
                return;
              }
              const sink = createWriteStream(target, { flags: "wx", mode: 0o600 });
              void pipeline(source, sink).then(() => streamResolve()).catch(streamReject);
            });
          }))
          .then(() => zipFile.readEntry())
          .catch((error: unknown) => fail(error instanceof Error ? error : new Error("Could not extract a package file.")));
      });
      zipFile.readEntry();
    });
  });
}

function normalizePackagePath(value: string): string | null {
  const normalized = posix.normalize(value.trim().replace(/\\/g, "/"));
  if (!normalized || normalized === "." || normalized.startsWith("/") ||
    normalized.split("/").some((segment) => segment === ".." || segment === "." || segment.includes("\0"))) {
    return null;
  }
  return normalized;
}

async function inspectPackage(root: string, kind: CoursePackageKind): Promise<CoursePackageInfo> {
  const rootFiles = await readdir(root);
  const manifestName = rootFiles.find((name) =>
    name.toLowerCase() === (kind === "scorm" ? "imsmanifest.xml" : "tincan.xml"));
  if (!manifestName) {
    throw new Error(kind === "scorm"
      ? "SCORM packages must include imsmanifest.xml at the archive root."
      : "Tin Can packages must include tincan.xml at the archive root.");
  }
  const xml = await readFile(resolve(root, manifestName), "utf8");
  let launchPath: string | null = null;
  let format: CoursePackageFormat = "xapi";
  let activityId: string | null = null;

  if (kind === "scorm") {
    launchPath = scormLaunchFromManifest(xml);
    const schemaVersion = xml.match(/<schemaversion[^>]*>\s*([^<]+)/i)?.[1] ?? "";
    format = /2004/i.test(schemaVersion) || /adlcp_v1p3|imsss_v1p0/i.test(xml) ? "scorm2004" : "scorm12";
  } else {
    const activity = xml.match(/<activity\b([^>]*)>/i);
    activityId = activity ? readXmlAttribute(activity[1], "id") : null;
    const launch = xml.match(/<launch\b[^>]*>\s*([^<]+?)\s*<\/launch>/i);
    launchPath = launch?.[1]?.trim() ?? null;
  }

  const safeLaunch = launchPath ? normalizePackagePath(decodeXmlEntities(launchPath)) : null;
  if (!safeLaunch || !/\.(?:html?|xhtml)$/i.test(safeLaunch)) {
    throw new Error("Course package manifest does not identify an HTML launch page.");
  }
  const launchFile = resolve(root, ...safeLaunch.split("/"));
  if (!launchFile.startsWith(`${root}${sep}`)) throw new Error("Course package launch path is invalid.");
  const launchStats = await stat(launchFile).catch(() => null);
  if (!launchStats?.isFile()) throw new Error("Course package launch page is missing.");
  if (kind === "xapi" && (!activityId || !/^https?:\/\//i.test(activityId))) {
    throw new Error("Tin Can package manifest must provide an activity URI.");
  }
  return { format, launchPath: safeLaunch, activityId };
}

function scormLaunchFromManifest(xml: string): string | null {
  const resources = [...xml.matchAll(/<resource\b([^>]*)>/gi)].map((match) => ({
    id: readXmlAttribute(match[1], "identifier"),
    href: readXmlAttribute(match[1], "href"),
    type: readXmlAttribute(match[1], "adlcp:scormtype") ?? readXmlAttribute(match[1], "scormtype"),
  }));
  const organizationRef = xml.match(/<organization\b[^>]*\b(?:default|identifierref)=["']([^"']+)["']/i)?.[1] ??
    xml.match(/<item\b[^>]*\bidentifierref=["']([^"']+)["']/i)?.[1];
  const selected = resources.find((resource) => resource.id === organizationRef) ??
    resources.find((resource) => resource.type?.toLowerCase() === "sco" && resource.href) ??
    resources.find((resource) => resource.href);
  return selected?.href ? decodeXmlEntities(selected.href) : null;
}

function readXmlAttribute(attributes: string, name: string): string | null {
  const match = [...attributes.matchAll(/([^\s=]+)\s*=\s*["']([^"']+)["']/g)]
    .find(([, attribute]) => attribute?.toLowerCase() === name.toLowerCase());
  return match?.[2] ? decodeXmlEntities(match[2]) : null;
}

function decodeXmlEntities(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function contentTypeFor(filePath: string): string {
  const extension = extname(filePath).toLowerCase();
  const types: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".htm": "text/html; charset=utf-8",
    ".xhtml": "application/xhtml+xml",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".xml": "application/xml; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".pdf": "application/pdf",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
  };
  return types[extension] ?? "application/octet-stream";
}
