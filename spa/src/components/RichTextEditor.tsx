import { useEffect, useRef } from "react";
import { Box, IconButton, Stack, Tooltip } from "@mui/material";
import FormatBoldIcon from "@mui/icons-material/FormatBold";
import FormatItalicIcon from "@mui/icons-material/FormatItalic";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import FormatListNumberedIcon from "@mui/icons-material/FormatListNumbered";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

/** Lightweight rich-text editor with a bold / italic / bulleted /
 *  numbered toolbar. Emits HTML — store it in a TEXT column and
 *  sanitize with DOMPurify before rendering elsewhere. */
export function RichTextEditor({
  value,
  onChange,
  placeholder,
  minRows = 12,
  autoFocus = false,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minRows?: number;
  autoFocus?: boolean;
}) {
  // Track the raw HTML we last emitted to the consumer. The sync
  // effect below uses this to tell "the parent is just echoing back
  // our own value" (skip) from "the parent has a different value to
  // apply" (push it into the editor). Without this, the effect
  // re-applies content on every keystroke and the cursor jumps.
  const lastEmittedRef = useRef<string>(value);

  const editor = useEditor({
    extensions: [StarterKit],
    content: value,
    onUpdate: ({ editor }) => {
      const raw = editor.getHTML();
      lastEmittedRef.current = raw;
      // Treat "<p></p>" as empty so the consumer can do a simple
      // truthiness check before saving.
      onChange(editor.isEmpty ? "" : raw);
    },
    editorProps: {
      attributes: {
        // Style hooks the .editor-body CSS below picks up. Using a
        // class keeps the inline-style surface small and lets MUI
        // theming win.
        class: "rich-text-editor-body",
      },
    },
  });

  // If the prop changes externally (e.g., form reset), push it into
  // the editor without recreating the instance — but never while the
  // user is focused/typing, and never to re-apply a value we just
  // emitted (which would reset the cursor mid-keystroke).
  useEffect(() => {
    if (!editor) return;
    if (editor.isFocused) return;
    if (value === lastEmittedRef.current) return;
    if (editor.getHTML() === value) return;
    editor.commands.setContent(value || "", { emitUpdate: false });
    lastEmittedRef.current = value;
  }, [value, editor]);

  // Autofocus once the editor instance is ready. We can't pass
  // autofocus via useEditor's options because the option only applies
  // on construction and our consumers conditionally mount; doing it in
  // a one-shot effect handles either path.
  const focusedOnceRef = useRef(false);
  useEffect(() => {
    if (!editor || !autoFocus || focusedOnceRef.current) return;
    focusedOnceRef.current = true;
    editor.commands.focus("end");
  }, [editor, autoFocus]);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        borderRadius: 1,
        border: 1,
        borderColor: "divider",
        overflow: "hidden",
        "&:focus-within": {
          borderColor: "primary.main",
          boxShadow: (t) => `0 0 0 1px ${t.palette.primary.main}`,
        },
        "& .rich-text-editor-body": {
          minHeight: `${minRows * 1.6}em`,
          padding: 1.5,
          outline: "none",
          fontSize: 14,
          lineHeight: 1.6,
        },
        "& .rich-text-editor-body p": { margin: 0, marginBottom: 0.5 },
        "& .rich-text-editor-body p:last-child": { marginBottom: 0 },
        "& .rich-text-editor-body ul, & .rich-text-editor-body ol": {
          paddingLeft: 3,
          margin: 0,
          marginBottom: 0.5,
        },
        // TipTap renders a faint placeholder when the editor is empty
        // if we tag the doc with data-placeholder via the Placeholder
        // extension; until then, show our hint as a fallback.
        "& .rich-text-editor-body:empty::before, & .rich-text-editor-body p.is-editor-empty:first-of-type::before":
          {
            content: `"${placeholder?.replace(/"/g, '\\"') ?? ""}"`,
            color: "text.disabled",
            float: "left",
            height: 0,
            pointerEvents: "none",
          },
      }}
    >
      <Toolbar editor={editor} />
      <Box sx={{ flex: 1, overflow: "auto" }}>
        <EditorContent editor={editor} />
      </Box>
    </Box>
  );
}

function Toolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;
  return (
    <Stack
      direction="row"
      spacing={0.5}
      sx={{
        borderBottom: 1,
        borderColor: "divider",
        bgcolor: "action.hover",
        px: 0.5,
        py: 0.25,
      }}
    >
      <ToolbarButton
        title="Bold (⌘B)"
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive("bold")}
      >
        <FormatBoldIcon fontSize="small" />
      </ToolbarButton>
      <ToolbarButton
        title="Italic (⌘I)"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive("italic")}
      >
        <FormatItalicIcon fontSize="small" />
      </ToolbarButton>
      <ToolbarButton
        title="Bulleted list"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive("bulletList")}
      >
        <FormatListBulletedIcon fontSize="small" />
      </ToolbarButton>
      <ToolbarButton
        title="Numbered list"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive("orderedList")}
      >
        <FormatListNumberedIcon fontSize="small" />
      </ToolbarButton>
    </Stack>
  );
}

function ToolbarButton({
  title,
  active,
  onClick,
  children,
}: {
  title: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip title={title}>
      <IconButton
        size="small"
        onClick={onClick}
        // Active state echoes the chip-toggle pattern used elsewhere
        // (catalog item chips); filled when on, outlined when off.
        sx={{
          bgcolor: active ? "primary.main" : "transparent",
          color: active ? "primary.contrastText" : "text.secondary",
          borderRadius: 1,
          "&:hover": {
            bgcolor: active ? "primary.dark" : "action.selected",
          },
        }}
      >
        {children}
      </IconButton>
    </Tooltip>
  );
}
