import { Node, mergeAttributes, type MarkdownToken } from "@tiptap/core";

const COMMENT_RE = /^<!--([\s\S]*?)-->/;

/** Human label for the markers the templates actually use. Anything else
 *  shows its raw text so nothing is hidden from the editor. */
export function commentLabel(text: string): string {
  if (text.trim() === "esign-cut") {
    return "E-signature cut line — everything below appears only on printed (wet-ink) copies";
  }
  return text.trim();
}

/**
 * An HTML comment (`<!-- esign-cut -->`) as a block atom, so it survives the
 * markdown round-trip. Without this the parser drops comments outright, and
 * the marker the backend uses to trim the wet-ink signature block from
 * e-signed PDFs would vanish the first time someone saved from the rich
 * editor. Rendered as a muted divider with a label so editors can see it —
 * and keep it — rather than as invisible markup.
 */
export const HtmlComment = Node.create({
  name: "htmlComment",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      text: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-comment") ?? "",
        renderHTML: (attrs) => ({ "data-comment": attrs.text }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-comment]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "contract-html-comment",
        contenteditable: "false",
      }),
      commentLabel(String(node.attrs.text)),
    ];
  },

  renderText({ node }) {
    return `<!--${node.attrs.text}-->`;
  },

  // Runs before marked's built-in `html` block tokenizer, which would
  // otherwise swallow the comment.
  markdownTokenizer: {
    name: "htmlComment",
    level: "block",
    start: (src: string) => src.indexOf("<!--"),
    tokenize: (src: string): MarkdownToken | undefined => {
      const m = COMMENT_RE.exec(src);
      if (!m) return undefined;
      // Absorb the trailing newline so the comment doesn't leave a stray
      // empty paragraph behind it.
      const raw = src.startsWith(`${m[0]}\n`) ? `${m[0]}\n` : m[0];
      return { type: "htmlComment", raw, text: m[1] } as MarkdownToken;
    },
  },
  parseMarkdown: (token, helpers) =>
    helpers.createNode("htmlComment", {
      text: (token as MarkdownToken & { text: string }).text,
    }),
  renderMarkdown: (node) => `<!--${node.attrs?.text ?? ""}-->`,
});
