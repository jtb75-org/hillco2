import DOMPurify from "dompurify";

export function sanitizeRichTextHtml(html: string) {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
  });
}
