// Reads the mail the app sent during a test, from the directory the SMTP
// sink (scripts/smtp_sink.py --out) writes to. Same default as
// playwright.config.ts.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const MAIL_DIR =
  process.env.E2E_MAIL_DIR ?? path.resolve(__dirname, "..", ".e2e-mail");

/**
 * Wait for a message addressed to `to` that arrived after `sinceMs` and
 * return its decoded text (headers + text/plain + text/html). Matching on
 * the recipient keeps fully-parallel tests from reading each other's mail.
 */
export async function waitForMail(
  to: string,
  sinceMs: number,
  timeoutMs = 15_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  const sinceNs = BigInt(sinceMs) * 1_000_000n;
  while (Date.now() < deadline) {
    if (fs.existsSync(MAIL_DIR)) {
      const files = fs
        .readdirSync(MAIL_DIR)
        .filter((f) => f.endsWith(".txt") && BigInt(f.slice(0, -4)) >= sinceNs)
        .sort();
      for (const f of files) {
        const text = fs.readFileSync(path.join(MAIL_DIR, f), "utf8");
        if (text.split("\n")[0].toLowerCase().includes(to.toLowerCase())) return text;
      }
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No mail to ${to} arrived in ${MAIL_DIR} within ${timeoutMs}ms`);
}

/** The e-signature token from a "please sign" email's link. */
export function signingTokenFrom(mailText: string): string {
  const m = mailText.match(/\/sign\/([\w.\-]+)/);
  if (!m) throw new Error("No /sign/<token> link found in mail");
  return m[1];
}
