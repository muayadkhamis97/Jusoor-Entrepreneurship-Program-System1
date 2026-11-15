import { db, programBrandingTable } from "@workspace/db";

export type ProgramEmailBranding = {
  brandName: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
};

export function visibleEmailBrandName(value: string | null | undefined): string {
  const configured = value?.trim();
  return configured && !/(jusoor|جسور)/i.test(configured) ? configured : "Program Hub";
}

export async function loadProgramEmailBranding(): Promise<ProgramEmailBranding> {
  const [settings] = await db.select({
    brandName: programBrandingTable.brandName,
    logoUrl: programBrandingTable.logoUrl,
    primaryColor: programBrandingTable.primaryColor,
    accentColor: programBrandingTable.accentColor,
  }).from(programBrandingTable).limit(1);

  if (!settings?.brandName.trim()) {
    throw new Error("Save the program branding before sending email.");
  }

  return {
    brandName: visibleEmailBrandName(settings.brandName),
    logoUrl: publicLogoUrl(settings.logoUrl),
    primaryColor: safeColor(settings.primaryColor, "#28665a"),
    accentColor: safeColor(settings.accentColor, "#d98a46"),
  };
}

export function renderBrandedEmailHtml(
  contentHtml: string,
  branding: ProgramEmailBranding,
): string {
  const brandName = escapeHtml(visibleEmailBrandName(branding.brandName));
  const logoUrl = publicLogoUrl(branding.logoUrl);
  const primaryColor = safeColor(branding.primaryColor, "#28665a");
  const accentColor = safeColor(branding.accentColor, "#d98a46");
  const logo = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${brandName}" width="42" height="42" style="display:block;width:42px;height:42px;object-fit:contain;border-radius:8px">`
    : `<span style="display:inline-block;width:42px;height:42px;line-height:42px;text-align:center;border-radius:8px;background:${primaryColor};color:${contrastColor(primaryColor)};font:700 20px Arial,sans-serif">${escapeHtml(firstCharacter(branding.brandName))}</span>`;

  return `<!doctype html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${brandName}</title></head>
<body style="margin:0;padding:0;background:#f3f5f4;color:#24312f;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f5f4">
    <tr><td align="center" style="padding:28px 12px">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:620px">
        <tr><td style="padding:0 8px 16px">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
            <tr><td style="padding-right:12px;vertical-align:middle">${logo}</td>
              <td style="vertical-align:middle;color:#24312f;font-size:18px;font-weight:700">${brandName}</td></tr>
          </table>
        </td></tr>
        <tr><td style="background:#ffffff;border:1px solid #e1e7e4;border-top:4px solid ${primaryColor};border-radius:12px;padding:28px 30px;color:#24312f;font-size:15px;line-height:1.65">
          ${contentHtml}
        </td></tr>
        <tr><td align="center" style="padding:16px 8px 0;border-top:2px solid ${accentColor};color:#596762;font-size:12px;line-height:1.5">
          <strong style="color:#24312f">${brandName}</strong><br>
          <span>Automated program message</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function renderBrandedEmailText(
  contentText: string,
  branding: ProgramEmailBranding,
): string {
  return `${contentText.trimEnd()}\n\n— ${visibleEmailBrandName(branding.brandName)}`;
}

function publicLogoUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function safeColor(value: string, fallback: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : fallback;
}

export function contrastColor(hex: string): string {
  const channels = hex.slice(1).match(/.{2}/g)?.map(channel => parseInt(channel, 16) / 255);
  if (!channels || channels.length !== 3) return "#ffffff";
  const [red, green, blue] = channels.map(channel =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return luminance > 0.42 ? "#17211f" : "#ffffff";
}

function firstCharacter(value: string): string {
  return Array.from(value.trim())[0] ?? "P";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}
