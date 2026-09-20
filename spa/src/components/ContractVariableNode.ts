import {
  Mark,
  Node,
  mergeAttributes,
  type Editor,
  type JSONContent,
  type MarkdownToken,
} from "@tiptap/core";

/** Matches one `{{snake_case}}` placeholder at the start of a string. Mirrors
 *  the backend's _VARIABLE_RE (app/routes/contract_templates.py): lowercase
 *  letter first, then lowercase/digits/underscores, at least two chars. */
export const CONTRACT_VARIABLE_RE = /^\{\{\s*([a-z][a-z0-9_]+)\s*\}\}/;
const CONTRACT_VARIABLE_RE_G = /\{\{\s*([a-z][a-z0-9_]+)\s*\}\}/g;

export function isValidVariableName(name: string): boolean {
  return /^[a-z][a-z0-9_]+$/.test(name);
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    contractVariable: {
      /** Insert a `{{name}}` placeholder chip at the cursor. */
      insertContractVariable: (name: string) => ReturnType;
    };
  }
}

/**
 * A contract-template placeholder (`{{client_name}}`) as an inline atom in
 * the EDITOR: a chip the user can't type inside of or half-delete, inserted
 * from a menu. See ContractVariableMark for how it crosses the markdown
 * boundary — the node itself has no markdown hooks on purpose.
 */
export const ContractVariable = Node.create({
  name: "contractVariable",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      name: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-variable") ?? "",
        renderHTML: (attrs) => ({ "data-variable": attrs.name }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-variable]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class: "contract-variable",
        contenteditable: "false",
      }),
      String(node.attrs.name),
    ];
  },

  renderText({ node }) {
    return `{{${node.attrs.name}}}`;
  },

  // Safety net only: chips are swapped for marked text before serializing
  // (see serializeContractMarkdown), so this should never run.
  renderMarkdown: (node) => `{{${node.attrs?.name ?? ""}}}`,

  addCommands() {
    return {
      insertContractVariable:
        (name: string) =>
        ({ chain }) =>
          chain()
            .focus()
            // Trailing space so the caret lands after the chip and typing
            // continues as prose rather than fighting the atom boundary.
            .insertContent([
              { type: this.name, attrs: { name } },
              { type: "text", text: " " },
            ])
            .run(),
    };
  },
});

/**
 * The placeholder's MARKDOWN form: plain text `{{name}}` carrying this mark.
 *
 * Why not let the chip node round-trip itself: @tiptap/markdown only applies
 * marks to text nodes when parsing (`**{{x}}**` would lose its bold) and
 * force-closes every mark before rendering a non-text node (`**${{fee}}**`
 * would come out as `**$**{{fee}}`, which python-markdown's attr_list then
 * mangles). As TEXT the placeholder sits inside bold/italic runs like any
 * other word, and `code: true` exempts it from the serializer's
 * backslash-escaping so `client_name` never becomes `client\_name`.
 *
 * This mark exists only at the boundary: parse → swap marked text for chip
 * nodes; serialize → swap chips back. The editor document never holds it.
 */
export const ContractVariableMark = Mark.create({
  name: "contractVariableRaw",
  code: true,
  parseHTML() {
    return [{ tag: "span[data-variable-raw]" }];
  },
  renderHTML() {
    return ["span", { "data-variable-raw": "" }, 0];
  },
  markdownTokenizer: {
    name: "contractVariableRaw",
    level: "inline",
    start: (src: string) => src.indexOf("{{"),
    tokenize: (src: string): MarkdownToken | undefined => {
      const m = CONTRACT_VARIABLE_RE.exec(src);
      if (!m) return undefined;
      return { type: "contractVariableRaw", raw: m[0], name: m[1] } as MarkdownToken;
    },
  },
  parseMarkdown: (token, helpers) =>
    helpers.createTextNode(`{{${(token as MarkdownToken & { name: string }).name}}}`, [
      { type: "contractVariableRaw" },
    ]),
  // No delimiters — the text already is the `{{name}}` syntax.
  renderMarkdown: (node, h) => h.renderChildren(node),
});

const RAW = ContractVariableMark.name;

function walk(node: JSONContent, fn: (n: JSONContent) => JSONContent | JSONContent[]): JSONContent {
  if (!node.content) return node;
  const content: JSONContent[] = [];
  for (const child of node.content) {
    const out = fn(walk(child, fn));
    if (Array.isArray(out)) content.push(...out);
    else content.push(out);
  }
  return { ...node, content };
}

/** Editor JSON → JSON the markdown serializer understands (chips → text). */
function chipsToText(doc: JSONContent): JSONContent {
  return walk(doc, (n) => {
    if (n.type !== ContractVariable.name) return n;
    return {
      type: "text",
      text: `{{${n.attrs?.name ?? ""}}}`,
      marks: [...(n.marks ?? []), { type: RAW }],
    };
  });
}

/** Parsed JSON → editor JSON (marked text → chips). The parser merges
 *  adjacent text nodes with identical marks, so one text node may hold
 *  several placeholders back to back; emit one chip per match. */
function textToChips(doc: JSONContent): JSONContent {
  return walk(doc, (n) => {
    if (n.type !== "text" || !n.marks?.some((m) => m.type === RAW)) return n;
    const otherMarks = n.marks.filter((m) => m.type !== RAW);
    const chips: JSONContent[] = [];
    for (const m of (n.text ?? "").matchAll(CONTRACT_VARIABLE_RE_G)) {
      chips.push({
        type: ContractVariable.name,
        attrs: { name: m[1] },
        ...(otherMarks.length ? { marks: otherMarks } : {}),
      });
    }
    return chips.length ? chips : { ...n, marks: otherMarks };
  });
}

/** Markdown → editor content, placeholders as chips. */
export function parseContractMarkdown(editor: Editor, markdown: string): JSONContent {
  return textToChips(editor.storage.markdown.manager.parse(markdown));
}

/** Editor content → markdown, chips as verbatim `{{name}}`. */
export function serializeContractMarkdown(editor: Editor): string {
  if (editor.isEmpty) return "";
  return editor.storage.markdown.manager.serialize(chipsToText(editor.getJSON()));
}
