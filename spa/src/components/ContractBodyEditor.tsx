import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  Divider,
  ListSubheader,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Typography,
  alpha,
} from "@mui/material";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import DataObjectIcon from "@mui/icons-material/DataObject";
import HorizontalRuleIcon from "@mui/icons-material/HorizontalRule";
import TitleIcon from "@mui/icons-material/Title";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";

import {
  ContractVariable,
  ContractVariableMark,
  isValidVariableName,
  parseContractMarkdown,
  serializeContractMarkdown,
} from "./ContractVariableNode";
import { HtmlComment } from "./HtmlCommentNode";
import { BasicFormattingButtons, ToolbarButton } from "./RichTextEditor";

// Sentinel so the very first sync effect applies the initial value (the
// editor is created empty; content is parsed in once the markdown manager
// exists — see parseContractMarkdown).
const UNSET = Symbol("unset");

/**
 * Rich editor for contract-template bodies. Reads and writes MARKDOWN (the
 * storage format the PDF renderer consumes), unlike RichTextEditor which
 * emits HTML. Placeholders render as chips (see ContractVariableNode) and are
 * inserted from the "Insert variable" menu.
 *
 * The toolbar is deliberately limited to what the real templates use —
 * headings, bold/italic, lists, section rules — so the markdown we emit stays
 * inside the dialect python-markdown (`extra` + `sane_lists`) renders.
 */
export function ContractBodyEditor({
  value,
  onChange,
  knownVariables,
  minRows = 20,
  testId,
}: {
  /** Markdown source. */
  value: string;
  onChange: (markdown: string) => void;
  /** Variable names offered in the picker (union of what templates use). */
  knownVariables: string[];
  minRows?: number;
  testId?: string;
}) {
  // Same echo-suppression pattern as RichTextEditor: remember the last
  // markdown we emitted so the sync effect can tell "parent echoing our
  // value" from "parent has genuinely new content" (form reset / open).
  const lastEmittedRef = useRef<string | typeof UNSET>(UNSET);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        // Not part of the contract dialect; disabling keeps stray keystrokes
        // (backticks, `>`, ~~) from producing markdown the templates never
        // used and the PDF stylesheet doesn't style.
        codeBlock: false,
        code: false,
        blockquote: false,
        strike: false,
        underline: false,
        link: false,
      }),
      Markdown,
      ContractVariable,
      ContractVariableMark,
      HtmlComment,
    ],
    onUpdate: ({ editor }) => {
      const md = serializeContractMarkdown(editor);
      lastEmittedRef.current = md;
      onChange(md);
    },
    editorProps: {
      attributes: { class: "contract-body-editor" },
    },
  });

  // Push external value changes in (initial load, dialog opened on a
  // different template) without recreating the editor — never while the
  // user is typing, and never to re-apply something we just emitted (the
  // cursor would jump).
  useEffect(() => {
    if (!editor) return;
    if (editor.isFocused) return;
    if (value === lastEmittedRef.current) return;
    editor.commands.setContent(parseContractMarkdown(editor, value || ""), {
      emitUpdate: false,
    });
    lastEmittedRef.current = value;
  }, [value, editor]);

  return (
    <Box
      data-testid={testId}
      sx={{
        display: "flex",
        flexDirection: "column",
        borderRadius: 1,
        border: 1,
        borderColor: "divider",
        overflow: "hidden",
        "&:focus-within": {
          borderColor: "primary.main",
          boxShadow: (t) => `0 0 0 1px ${t.palette.primary.main}`,
        },
        "& .contract-body-editor": {
          minHeight: `${minRows * 1.6}em`,
          maxHeight: "60vh",
          overflow: "auto",
          padding: 2,
          outline: "none",
          fontSize: 14,
          lineHeight: 1.6,
        },
        // Approximate the PDF's document hierarchy so what's edited reads
        // like what's signed.
        "& .contract-body-editor h1": {
          fontSize: 18,
          fontWeight: 800,
          letterSpacing: 0.2,
          margin: 0,
          marginTop: 2,
          marginBottom: 1,
        },
        "& .contract-body-editor h1:first-of-type": { marginTop: 0 },
        "& .contract-body-editor h2": {
          fontSize: 15,
          fontWeight: 700,
          margin: 0,
          marginTop: 1.5,
          marginBottom: 0.75,
        },
        "& .contract-body-editor h3": {
          fontSize: 14,
          fontWeight: 700,
          margin: 0,
          marginTop: 1.25,
          marginBottom: 0.5,
        },
        "& .contract-body-editor p": { margin: 0, marginBottom: 1 },
        "& .contract-body-editor ul, & .contract-body-editor ol": {
          paddingLeft: 3,
          margin: 0,
          marginBottom: 1,
        },
        "& .contract-body-editor hr": {
          border: 0,
          borderTop: 1,
          borderColor: "divider",
          margin: "12px 0",
        },
        // The placeholder chip. Monospace + the raw name so it matches the
        // "Detected variables" list below the editor one-to-one.
        "& .contract-body-editor .contract-variable": {
          display: "inline-block",
          px: 0.75,
          py: 0,
          // No side margin: the chip must hug adjacent punctuation
          // (`{{effective_date}},`) exactly as the text does.
          mx: 0,
          borderRadius: 999,
          bgcolor: (t) => alpha(t.palette.primary.main, 0.12),
          color: "primary.dark",
          fontFamily: "monospace",
          fontSize: 12,
          lineHeight: 1.7,
          whiteSpace: "nowrap",
          userSelect: "none",
          verticalAlign: "baseline",
        },
        "& .contract-body-editor .contract-variable.ProseMirror-selectednode": {
          outline: (t) => `2px solid ${t.palette.primary.main}`,
          outlineOffset: 1,
        },
        // Preserved HTML comment (the e-sign cut marker): a labelled dashed
        // divider so it's visible and deliberate, never invisible markup.
        "& .contract-body-editor .contract-html-comment": {
          my: 1.5,
          py: 0.5,
          px: 1,
          borderTop: "1px dashed",
          borderBottom: "1px dashed",
          borderColor: "warning.main",
          color: "text.secondary",
          fontSize: 11,
          fontStyle: "italic",
          textAlign: "center",
          userSelect: "none",
        },
        "& .contract-body-editor .contract-html-comment.ProseMirror-selectednode": {
          outline: (t) => `2px solid ${t.palette.primary.main}`,
          outlineOffset: 1,
        },
      }}
    >
      <Toolbar editor={editor} knownVariables={knownVariables} />
      <EditorContent editor={editor} />
    </Box>
  );
}

function Toolbar({
  editor,
  knownVariables,
}: {
  editor: Editor | null;
  knownVariables: string[];
}) {
  if (!editor) return null;
  return (
    <Stack
      direction="row"
      spacing={0.5}
      alignItems="center"
      useFlexGap
      flexWrap="wrap"
      sx={{
        borderBottom: 1,
        borderColor: "divider",
        bgcolor: "action.hover",
        px: 0.5,
        py: 0.25,
      }}
    >
      <ToolbarButton
        title="Section title"
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        active={editor.isActive("heading", { level: 1 })}
      >
        <TitleIcon fontSize="small" />
      </ToolbarButton>
      <ToolbarButton
        title="Subheading"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive("heading", { level: 2 })}
      >
        <Typography component="span" sx={{ fontWeight: 800, fontSize: 13, px: 0.25 }}>
          H2
        </Typography>
      </ToolbarButton>
      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
      <BasicFormattingButtons editor={editor} />
      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
      <ToolbarButton
        title="Section divider"
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        active={false}
      >
        <HorizontalRuleIcon fontSize="small" />
      </ToolbarButton>
      <Box sx={{ flex: 1 }} />
      <VariableMenu editor={editor} knownVariables={knownVariables} />
    </Stack>
  );
}

/** "Insert variable" picker: type to filter the known names, or type a new
 *  snake_case name and press Enter to insert it. */
function VariableMenu({
  editor,
  knownVariables,
}: {
  editor: Editor;
  knownVariables: string[];
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  const open = Boolean(anchor);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return knownVariables.filter((v) => !q || v.includes(q));
  }, [knownVariables, query]);
  const typed = query.trim();
  const canInsertTyped = isValidVariableName(typed) && !knownVariables.includes(typed);

  const insert = (name: string) => {
    editor.chain().focus().insertContractVariable(name).run();
    setAnchor(null);
    setQuery("");
  };

  return (
    <>
      <Button
        size="small"
        data-testid="contract-insert-variable"
        startIcon={<DataObjectIcon fontSize="small" />}
        endIcon={<ArrowDropDownIcon />}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{ textTransform: "none", fontWeight: 700 }}
      >
        Insert variable
      </Button>
      <Menu
        anchorEl={anchor}
        open={open}
        onClose={() => {
          setAnchor(null);
          setQuery("");
        }}
        slotProps={{ paper: { sx: { width: 300, maxHeight: 380 } } }}
      >
        <Box sx={{ px: 1.5, pt: 1, pb: 0.5 }}>
          <TextField
            autoFocus
            fullWidth
            size="small"
            placeholder="Search or type a new name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            // Keep the Menu's type-ahead from stealing keystrokes.
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                if (filtered.length === 1 && !canInsertTyped) insert(filtered[0]);
                else if (canInsertTyped) insert(typed);
              }
            }}
            inputProps={{ "data-testid": "contract-variable-search" } as Record<string, string>}
          />
        </Box>
        {canInsertTyped && (
          <MenuItem onClick={() => insert(typed)} sx={{ fontFamily: "monospace", fontSize: 13 }}>
            Insert new “{typed}”
          </MenuItem>
        )}
        {typed && !isValidVariableName(typed) && filtered.length === 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ px: 2, py: 1, display: "block" }}>
            Names are lowercase letters, digits and underscores, e.g. client_name.
          </Typography>
        )}
        {filtered.length > 0 && <ListSubheader disableSticky>Known variables</ListSubheader>}
        {filtered.map((v) => (
          <MenuItem
            key={v}
            onClick={() => insert(v)}
            sx={{ fontFamily: "monospace", fontSize: 13 }}
          >
            {v}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
