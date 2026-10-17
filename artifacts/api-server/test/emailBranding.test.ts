import assert from "node:assert/strict";
import test from "node:test";
import {
  renderBrandedEmailHtml,
  renderBrandedEmailText,
  visibleEmailBrandName,
  type ProgramEmailBranding,
} from "../src/lib/email-branding";

const configuredBrand: ProgramEmailBranding = {
  brandName: "North & Main",
  logoUrl: "https://cdn.example.test/brand/logo.png",
  primaryColor: "#163b52",
  accentColor: "#e1a447",
};

test("branded email uses the current name, hosted logo, and saved colors", () => {
  const html = renderBrandedEmailHtml("<p>Session reminder</p>", configuredBrand);
  const text = renderBrandedEmailText("Session reminder", configuredBrand);

  assert.match(html, /North &amp; Main/);
  assert.match(html, /https:\/\/cdn\.example\.test\/brand\/logo\.png/);
  assert.match(html, /border-top:4px solid #163b52/);
  assert.match(html, /border-top:2px solid #e1a447/);
  assert.match(html, /<p>Session reminder<\/p>/);
  assert.match(text, /Session reminder\n\n— North & Main/);
});

test("branded email escapes user-configured markup and ignores non-public logo URLs", () => {
  const html = renderBrandedEmailHtml("<p>Update</p>", {
    brandName: "<Example> & Co",
    logoUrl: "javascript:alert(1)",
    primaryColor: "#f3f4f5",
    accentColor: "#183a51",
  });

  assert.match(html, /&lt;Example&gt; &amp; Co/);
  assert.doesNotMatch(html, /javascript:/);
  assert.match(html, /background:#f3f4f5;color:#17211f/);
  assert.match(html, />&lt;</);
});

test("branded email falls back to a readable initial mark when no logo is saved", () => {
  const html = renderBrandedEmailHtml("<p>Update</p>", {
    brandName: "Harbor Labs",
    logoUrl: null,
    primaryColor: "#183a51",
    accentColor: "#c77c43",
  });

  assert.match(html, /background:#183a51;color:#ffffff/);
  assert.match(html, />H<\/span>/);
  assert.doesNotMatch(html, /<img\b/);
});

test("legacy saved organization names are shown as a neutral name in outgoing email", () => {
  const legacyBrand = { ...configuredBrand, brandName: "Jusoor" };

  assert.equal(visibleEmailBrandName(legacyBrand.brandName), "Program Hub");
  assert.doesNotMatch(renderBrandedEmailHtml("<p>Invitation</p>", legacyBrand), /Jusoor|جسور/i);
  assert.doesNotMatch(renderBrandedEmailText("Invitation", legacyBrand), /Jusoor|جسور/i);
});
