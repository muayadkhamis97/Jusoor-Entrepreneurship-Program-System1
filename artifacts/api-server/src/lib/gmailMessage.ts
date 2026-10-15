import { randomBytes } from "node:crypto";

export type GmailMessage = {
  from: string;
  recipients: string[];
  subject: string;
  text: string;
  html: string;
};

const emailPattern = /^[^\s<>@\r\n]+@[^\s<>@\r\n]+\.[^\s<>@\r\n]+$/;

function base64Body(value: string): string {
  return Buffer.from(value, "utf8").toString("base64").match(/.{1,76}/g)?.join("\r\n") ?? "";
}

function encodeSubject(value: string): string {
  if (!value.trim() || value.length > 500 || /[\r\n]/.test(value)) throw new Error("Email subject is invalid.");
  const words: string[] = [];
  let chunk = "";
  for (const character of value) {
    if (Buffer.byteLength(chunk + character, "utf8") > 42 && chunk) {
      words.push(chunk);
      chunk = "";
    }
    chunk += character;
  }
  if (chunk) words.push(chunk);
  return words
    .map((word) => `=?UTF-8?B?${Buffer.from(word, "utf8").toString("base64")}?=`)
    .join("\r\n ");
}

function foldRecipientHeader(recipients: string[]): string {
  const lines: string[] = [];
  let line = "Bcc: ";
  for (const recipient of recipients) {
    const next = line === "Bcc: " ? recipient : `, ${recipient}`;
    if (Buffer.byteLength(line + next, "utf8") > 76 && line !== "Bcc: ") {
      lines.push(line);
      line = ` ${recipient}`;
    } else {
      line += next;
    }
  }
  lines.push(line);
  return lines.join("\r\n");
}

export function buildGmailRawMessage(message: GmailMessage): string {
  const from = message.from.trim().toLowerCase();
  const recipients = [...new Set(message.recipients.map((value) => value.trim().toLowerCase()))];
  if (!emailPattern.test(from) || recipients.length === 0 || recipients.some((email) => !emailPattern.test(email))) {
    throw new Error("Email sender or recipient address is invalid.");
  }
  if (!message.text.trim() && !message.html.trim()) throw new Error("Email body is empty.");
  const boundary = `email-alt-${randomBytes(18).toString("hex")}`;
  const mime = [
    `From: ${from}`,
    "To: undisclosed-recipients:;",
    foldRecipientHeader(recipients),
    `Subject: ${encodeSubject(message.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Body(message.text),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Body(message.html),
    `--${boundary}--`,
    "",
  ].join("\r\n");
  return Buffer.from(mime, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
