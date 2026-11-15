import assert from "node:assert/strict";
import test from "node:test";
import {
  brandLogoIdFromObjectPath,
  brandLogoIdFromReference,
  brandLogoObjectPath,
  isBrandLogoId,
  isSupportedBrandLogo,
} from "../src/lib/brandLogoStorage";

const logoId = "a9e2b1f0-5c4d-4e31-8a77-1029384756ab";

test("program logo paths accept only UUID-based objects from the branding namespace", () => {
  assert.equal(isBrandLogoId(logoId), true);
  assert.equal(isBrandLogoId("../other-file"), false);
  assert.equal(brandLogoObjectPath(logoId), `/objects/program-branding/logos/${logoId}`);
  assert.equal(brandLogoIdFromObjectPath(`/objects/program-branding/logos/${logoId}`), logoId);
  assert.equal(brandLogoIdFromReference(`https://app.example.test/api/branding/logo/${logoId}`), logoId);
  assert.equal(brandLogoIdFromReference(`/api/branding/logo/${logoId}`), logoId);
  assert.equal(brandLogoIdFromObjectPath("/objects/course-materials/1/file"), null);
  assert.equal(brandLogoIdFromObjectPath(`/objects/program-branding/logos/${logoId}/other`), null);
});

test("program logo uploads allow small JPEG, PNG, and WebP files only", () => {
  assert.equal(isSupportedBrandLogo("image/png", 1), true);
  assert.equal(isSupportedBrandLogo("image/jpeg", 5 * 1024 * 1024), true);
  assert.equal(isSupportedBrandLogo("image/webp", 500), true);
  assert.equal(isSupportedBrandLogo("image/svg+xml", 500), false);
  assert.equal(isSupportedBrandLogo("image/png", 5 * 1024 * 1024 + 1), false);
  assert.equal(isSupportedBrandLogo("image/png", 0), false);
  assert.equal(isSupportedBrandLogo("image/png", 1.5), false);
});
