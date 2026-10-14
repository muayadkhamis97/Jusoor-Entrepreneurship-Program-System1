import assert from "node:assert/strict";
import test from "node:test";
import {
  buildProfilePhotoObjectPath,
  isProfilePhotoPathForUser,
  isSupportedProfilePhoto,
} from "../src/lib/profilePhotoStorage";
import { canEditUserProfile, normalizeProfileUpdate } from "../src/lib/userProfiles";

test("profile editing permits only the owner or an Admin", () => {
  assert.equal(canEditUserProfile("user-a", "user-a", false), true);
  assert.equal(canEditUserProfile("user-a", "user-b", false), false);
  assert.equal(canEditUserProfile("admin", "user-b", true), true);
});

test("private profile photo paths are bound to their owner", () => {
  const path = buildProfilePhotoObjectPath("user-a", "123e4567-e89b-12d3-a456-426614174000");
  assert.equal(isProfilePhotoPathForUser(path, "user-a"), true);
  assert.equal(isProfilePhotoPathForUser(path, "user-b"), false);
  assert.equal(isProfilePhotoPathForUser("/objects/course-materials/1/file.pdf", "user-a"), false);
});

test("profile photo uploads accept only bounded JPEG, PNG, and WebP images", () => {
  assert.equal(isSupportedProfilePhoto("image/jpeg", 1024), true);
  assert.equal(isSupportedProfilePhoto("image/png", 5 * 1024 * 1024), true);
  assert.equal(isSupportedProfilePhoto("image/gif", 1024), false);
  assert.equal(isSupportedProfilePhoto("image/webp", 5 * 1024 * 1024 + 1), false);
});

test("profile updates trim user-provided fields and reject blank display names", () => {
  assert.deepEqual(normalizeProfileUpdate({
    displayName: "  Lina Haddad ",
    phone: "  ",
    organization: " Jusoor ",
  }), {
    displayName: "Lina Haddad",
    phone: null,
    organization: "Jusoor",
  });
  assert.equal(normalizeProfileUpdate({ displayName: "  " }), null);
});
