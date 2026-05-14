import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../../api/client";
import { PageHeader } from "../../components/PageHeader";
import { useSnackbar } from "../../components/Snackbar";

// /api/catalog/* returns plain dicts. Hand-typed for the columns we
// render and edit; backend shape is in app/routes/catalog.py.
type CatalogScope = "assessment" | "placement";
type OwnerRole = "consultant" | "assistant" | "both";

interface Phase {
  id: string;
  scope: CatalogScope;
  sort_order: number;
  title: string;
  description: string | null;
  est_hours: string | null;
  default_billable: boolean;
  item_count: number;
}

interface Item {
  id: string;
  phase_id: string;
  sort_order: number;
  title: string;
  description: string | null;
  default_est_hours: string | null;
  default_billable: boolean;
  default_deliverable: string | null;
  default_owner_role: OwnerRole | null;
}

const OWNER_OPTIONS: Array<{ value: OwnerRole; label: string }> = [
  { value: "consultant", label: "Consultant" },
  { value: "assistant", label: "Assistant" },
  { value: "both", label: "Either" },
];

export function CatalogPage() {
  const [scope, setScope] = useState<CatalogScope>("assessment");

  return (
    <Stack spacing={2}>
      <PageHeader
        title="Catalog"
        subtitle="The phases and tasks that seed every engagement. Drag to reorder, click to edit, soft-delete to retire."
      />

      <Tabs
        value={scope}
        onChange={(_e, v: CatalogScope) => setScope(v)}
        sx={{ borderBottom: 1, borderColor: "divider" }}
      >
        <Tab value="assessment" label="Assessment" />
        <Tab value="placement" label="Placement" />
      </Tabs>

      <CatalogScope scope={scope} />
    </Stack>
  );
}

function CatalogScope({ scope }: { scope: CatalogScope }) {
  const qc = useQueryClient();
  const snackbar = useSnackbar();

  const phases = useQuery<Phase[], Error>({
    queryKey: ["catalog", "phases", scope],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/catalog/phases", {
        params: { query: { scope } },
      });
      if (error || !data) throw new Error("Failed to load phases.");
      return data as unknown as Phase[];
    },
  });

  // All items across the scope's phases. We fetch via /catalog/items
  // with scope filter so we get every row in one request and can
  // group client-side, including the cross-phase move case.
  const items = useQuery<Item[], Error>({
    queryKey: ["catalog", "items", scope],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/catalog/items", {
        params: { query: { scope } },
      });
      if (error || !data) throw new Error("Failed to load items.");
      return data as unknown as Item[];
    },
  });

  const itemsByPhase = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const it of items.data ?? []) {
      const arr = m.get(it.phase_id) ?? [];
      arr.push(it);
      m.set(it.phase_id, arr);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title));
    }
    return m;
  }, [items.data]);

  const patchPhase = useMutation({
    mutationFn: async (args: { id: string; body: Record<string, unknown> }) => {
      const { error } = await api.PATCH("/api/catalog/phases/{phase_id}", {
        params: { path: { phase_id: args.id } },
        body: args.body as never,
      });
      if (error) {
        const msg = (error as { detail?: string }).detail ?? "Save failed.";
        throw new Error(msg);
      }
    },
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  const patchItem = useMutation({
    mutationFn: async (args: { id: string; body: Record<string, unknown> }) => {
      const { error } = await api.PATCH("/api/catalog/items/{item_id}", {
        params: { path: { item_id: args.id } as never },
        body: args.body as never,
      });
      if (error) {
        const msg = (error as { detail?: string }).detail ?? "Save failed.";
        throw new Error(msg);
      }
    },
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  const deletePhase = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE("/api/catalog/phases/{phase_id}", {
        params: { path: { phase_id: id } },
      });
      if (error) {
        const msg = (error as { detail?: string }).detail ?? "Delete failed.";
        throw new Error(msg);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["catalog", "phases", scope] });
      qc.invalidateQueries({ queryKey: ["catalog", "items", scope] });
      snackbar.show("Phase removed");
    },
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE("/api/catalog/items/{item_id}", {
        params: { path: { item_id: id } as never },
      });
      if (error) {
        const msg = (error as { detail?: string }).detail ?? "Delete failed.";
        throw new Error(msg);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["catalog", "items", scope] });
      qc.invalidateQueries({ queryKey: ["catalog", "phases", scope] }); // item_count
      snackbar.show("Activity removed");
    },
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  const [addPhaseOpen, setAddPhaseOpen] = useState(false);
  const [addItemPhaseId, setAddItemPhaseId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Reorder phases on drag end. Recompute sort_order spaced by 100
  // and PATCH every phase whose position changed.
  const onPhaseDragEnd = (e: DragEndEvent) => {
    if (!phases.data) return;
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = phases.data.findIndex((p) => p.id === active.id);
    const newIndex = phases.data.findIndex((p) => p.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(phases.data, oldIndex, newIndex);

    // Optimistic update.
    qc.setQueryData(["catalog", "phases", scope], next);

    // Persist new sort orders for any row whose position changed.
    Promise.all(
      next
        .map((p, idx) => ({ p, sort_order: (idx + 1) * 100 }))
        .filter(({ p, sort_order }) => p.sort_order !== sort_order)
        .map(({ p, sort_order }) =>
          patchPhase.mutateAsync({ id: p.id, body: { sort_order } }),
        ),
    )
      .then(() => qc.invalidateQueries({ queryKey: ["catalog", "phases", scope] }))
      .catch(() => qc.invalidateQueries({ queryKey: ["catalog", "phases", scope] }));
  };

  if (phases.error || items.error) {
    return (
      <Alert severity="error">
        {phases.error?.message ?? items.error?.message}
      </Alert>
    );
  }
  if (phases.isPending || items.isPending) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Stack spacing={2}>
      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setAddPhaseOpen(true)}
        >
          Add phase
        </Button>
      </Box>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onPhaseDragEnd}>
        <SortableContext
          items={phases.data.map((p) => p.id)}
          strategy={verticalListSortingStrategy}
        >
          <Stack spacing={1.5}>
            {phases.data.map((phase) => (
              <PhaseCard
                key={phase.id}
                phase={phase}
                items={itemsByPhase.get(phase.id) ?? []}
                allPhaseIds={phases.data.map((p) => p.id)}
                onPatchPhase={(body) =>
                  patchPhase.mutate({ id: phase.id, body })
                }
                onDeletePhase={() => deletePhase.mutate(phase.id)}
                onAddItem={() => setAddItemPhaseId(phase.id)}
                onPatchItem={(itemId, body) =>
                  patchItem.mutate({ id: itemId, body })
                }
                onDeleteItem={(itemId) => deleteItem.mutate(itemId)}
                onItemsReorder={async (newItems) => {
                  // Optimistic update for the affected phase's slice
                  // of the items query.
                  qc.setQueryData<Item[]>(["catalog", "items", scope], (prev) => {
                    if (!prev) return prev;
                    const others = prev.filter((i) => i.phase_id !== phase.id);
                    return [...others, ...newItems];
                  });
                  await Promise.all(
                    newItems
                      .map((it, idx) => ({ it, sort_order: (idx + 1) * 100 }))
                      .filter(({ it, sort_order }) => it.sort_order !== sort_order)
                      .map(({ it, sort_order }) =>
                        patchItem.mutateAsync({ id: it.id, body: { sort_order } }),
                      ),
                  );
                  qc.invalidateQueries({ queryKey: ["catalog", "items", scope] });
                }}
                onItemMoveOut={async (itemId, targetPhaseId) => {
                  await patchItem.mutateAsync({
                    id: itemId,
                    body: { phase_id: targetPhaseId },
                  });
                  qc.invalidateQueries({ queryKey: ["catalog", "items", scope] });
                  qc.invalidateQueries({ queryKey: ["catalog", "phases", scope] });
                }}
              />
            ))}
          </Stack>
        </SortableContext>
      </DndContext>

      <AddPhaseDialog
        open={addPhaseOpen}
        scope={scope}
        nextSortOrder={(phases.data.length + 1) * 100}
        onClose={() => setAddPhaseOpen(false)}
        onCreated={() => {
          setAddPhaseOpen(false);
          qc.invalidateQueries({ queryKey: ["catalog", "phases", scope] });
        }}
      />
      <AddItemDialog
        phaseId={addItemPhaseId}
        nextSortOrder={
          addItemPhaseId
            ? ((itemsByPhase.get(addItemPhaseId) ?? []).length + 1) * 100
            : 100
        }
        onClose={() => setAddItemPhaseId(null)}
        onCreated={() => {
          setAddItemPhaseId(null);
          qc.invalidateQueries({ queryKey: ["catalog", "items", scope] });
          qc.invalidateQueries({ queryKey: ["catalog", "phases", scope] });
        }}
      />
    </Stack>
  );
}

function PhaseCard({
  phase,
  items,
  allPhaseIds,
  onPatchPhase,
  onDeletePhase,
  onAddItem,
  onPatchItem,
  onDeleteItem,
  onItemsReorder,
  onItemMoveOut,
}: {
  phase: Phase;
  items: Item[];
  allPhaseIds: string[];
  onPatchPhase: (body: Record<string, unknown>) => void;
  onDeletePhase: () => void;
  onAddItem: () => void;
  onPatchItem: (itemId: string, body: Record<string, unknown>) => void;
  onDeleteItem: (itemId: string) => void;
  onItemsReorder: (next: Item[]) => Promise<void> | void;
  onItemMoveOut: (itemId: string, targetPhaseId: string) => Promise<void> | void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: phase.id });
  const [expanded, setExpanded] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Drag end inside the items list — handles both same-phase reorder
  // and same-scope cross-phase moves. The target phase id sits as the
  // drop zone's sortable id, decorated below.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onItemDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    // Cross-phase move: the drop target is another PhaseCard's body.
    const overPhaseId = allPhaseIds.find((id) => id === over.id);
    if (overPhaseId && overPhaseId !== phase.id) {
      await onItemMoveOut(String(active.id), overPhaseId);
      return;
    }
    // Same-phase reorder.
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(items, oldIndex, newIndex);
    await onItemsReorder(next);
  };

  return (
    <Paper
      ref={setNodeRef}
      variant="outlined"
      sx={{
        p: 0,
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ p: 1.25, borderBottom: 1, borderColor: "divider" }}
      >
        <Box
          {...attributes}
          {...listeners}
          sx={{ display: "flex", cursor: "grab", color: "text.disabled" }}
          aria-label={`Drag ${phase.title}`}
        >
          <DragIndicatorIcon fontSize="small" />
        </Box>
        {editingTitle ? (
          <InlineEdit
            initial={phase.title}
            onCommit={(v) => {
              const t = v.trim();
              if (t && t !== phase.title) onPatchPhase({ title: t });
              setEditingTitle(false);
            }}
            onCancel={() => setEditingTitle(false)}
          />
        ) : (
          <Typography
            variant="subtitle1"
            sx={{ fontWeight: 600, flex: 1, cursor: "text" }}
            onClick={() => setEditingTitle(true)}
          >
            {phase.title}
          </Typography>
        )}
        <Typography variant="caption" color="text.secondary">
          {items.length} {items.length === 1 ? "activity" : "activities"}
        </Typography>
        <IconButton size="small" onClick={() => setExpanded((v) => !v)}>
          {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </IconButton>
        <Tooltip title="Add activity">
          <IconButton size="small" onClick={onAddItem}>
            <AddIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Remove phase">
          <IconButton
            size="small"
            onClick={() => setConfirmingDelete(true)}
            sx={{ color: "error.main" }}
          >
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      <Collapse in={expanded}>
        <Box sx={{ p: 1.5, borderBottom: 1, borderColor: "divider", bgcolor: "action.hover" }}>
          <PhaseDetails phase={phase} onPatch={onPatchPhase} />
        </Box>
      </Collapse>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onItemDragEnd}>
        <SortableContext
          items={items.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          <Stack
            spacing={0}
            sx={{ p: 1 }}
            // Sortable's "self" drop target: when an item from another
            // phase is dragged here, the DnD lib matches against any
            // sortable id in this card's context. We add the phase id
            // as a synthetic id below.
          >
            <PhaseDropTarget phaseId={phase.id} />
            {items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                onPatch={(body) => onPatchItem(item.id, body)}
                onDelete={() => onDeleteItem(item.id)}
              />
            ))}
            {items.length === 0 && (
              <Typography
                variant="caption"
                color="text.disabled"
                sx={{ pl: 4, py: 1, fontStyle: "italic" }}
              >
                No activities — drag one in or click + above to add.
              </Typography>
            )}
          </Stack>
        </SortableContext>
      </DndContext>

      <Dialog open={confirmingDelete} onClose={() => setConfirmingDelete(false)}>
        <DialogTitle>Remove "{phase.title}"?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            The phase is soft-deleted — engagements that already used it stay
            intact, but it stops appearing on new ones.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmingDelete(false)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              setConfirmingDelete(false);
              onDeletePhase();
            }}
          >
            Remove
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}

// Invisible-ish drop target keyed by the phase id. When an item is
// dragged from another phase, the cross-phase handler in onItemDragEnd
// fires because over.id === this phase's id.
function PhaseDropTarget({ phaseId }: { phaseId: string }) {
  const { setNodeRef, isOver } = useSortable({ id: phaseId, disabled: true });
  return (
    <Box
      ref={setNodeRef}
      sx={{
        height: isOver ? 32 : 8,
        borderRadius: 1,
        bgcolor: isOver ? "primary.light" : "transparent",
        transition: "all 120ms",
      }}
    />
  );
}

function ItemRow({
  item,
  onPatch,
  onDelete,
}: {
  item: Item;
  onPatch: (body: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });
  const [expanded, setExpanded] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  return (
    <Box
      ref={setNodeRef}
      sx={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        borderRadius: 1,
        "&:hover": { bgcolor: "action.hover" },
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 1, py: 0.75 }}>
        <Box
          {...attributes}
          {...listeners}
          sx={{ display: "flex", cursor: "grab", color: "text.disabled" }}
          aria-label={`Drag ${item.title}`}
        >
          <DragIndicatorIcon fontSize="small" />
        </Box>
        {editingTitle ? (
          <InlineEdit
            initial={item.title}
            onCommit={(v) => {
              const t = v.trim();
              if (t && t !== item.title) onPatch({ title: t });
              setEditingTitle(false);
            }}
            onCancel={() => setEditingTitle(false)}
          />
        ) : (
          <Typography
            variant="body2"
            sx={{ flex: 1, cursor: "text" }}
            onClick={() => setEditingTitle(true)}
          >
            {item.title}
          </Typography>
        )}
        {item.default_est_hours && (
          <Typography variant="caption" color="text.secondary">
            {item.default_est_hours}h est
          </Typography>
        )}
        <IconButton size="small" onClick={() => setExpanded((v) => !v)}>
          {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </IconButton>
        <Tooltip title="Remove">
          <IconButton
            size="small"
            onClick={() => setConfirmingDelete(true)}
            sx={{ color: "error.main" }}
          >
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
      <Collapse in={expanded}>
        <Box sx={{ p: 1.5, bgcolor: "action.hover" }}>
          <ItemDetails item={item} onPatch={onPatch} />
        </Box>
      </Collapse>
      <Dialog open={confirmingDelete} onClose={() => setConfirmingDelete(false)}>
        <DialogTitle>Remove "{item.title}"?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Activity is soft-deleted. Engagements that already seeded it stay
            unaffected.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmingDelete(false)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              setConfirmingDelete(false);
              onDelete();
            }}
          >
            Remove
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function PhaseDetails({
  phase,
  onPatch,
}: {
  phase: Phase;
  onPatch: (body: Record<string, unknown>) => void;
}) {
  return (
    <Stack spacing={1.5}>
      <BlurField
        label="Description"
        initial={phase.description ?? ""}
        multiline
        onCommit={(v) => onPatch({ description: v || null })}
      />
      <Stack direction="row" spacing={2}>
        <BlurField
          label="Est. hours"
          initial={phase.est_hours ?? ""}
          width={120}
          onCommit={(v) => onPatch({ est_hours: v.trim() ? v.trim() : null })}
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={phase.default_billable}
              onChange={(e) => onPatch({ default_billable: e.target.checked })}
            />
          }
          label="Billable by default"
        />
      </Stack>
    </Stack>
  );
}

function ItemDetails({
  item,
  onPatch,
}: {
  item: Item;
  onPatch: (body: Record<string, unknown>) => void;
}) {
  return (
    <Stack spacing={1.5}>
      <BlurField
        label="Description"
        initial={item.description ?? ""}
        multiline
        onCommit={(v) => onPatch({ description: v || null })}
      />
      <Stack direction="row" spacing={2} flexWrap="wrap">
        <BlurField
          label="Est. hours"
          initial={item.default_est_hours ?? ""}
          width={120}
          onCommit={(v) => onPatch({ default_est_hours: v.trim() ? v.trim() : null })}
        />
        <BlurField
          label="Deliverable"
          initial={item.default_deliverable ?? ""}
          width={260}
          onCommit={(v) => onPatch({ default_deliverable: v || null })}
        />
        <TextField
          select
          size="small"
          label="Owner"
          value={item.default_owner_role ?? ""}
          onChange={(e) =>
            onPatch({ default_owner_role: e.target.value || null })
          }
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">Unset</MenuItem>
          {OWNER_OPTIONS.map((o) => (
            <MenuItem key={o.value} value={o.value}>
              {o.label}
            </MenuItem>
          ))}
        </TextField>
        <FormControlLabel
          control={
            <Checkbox
              checked={item.default_billable}
              onChange={(e) => onPatch({ default_billable: e.target.checked })}
            />
          }
          label="Billable by default"
        />
      </Stack>
    </Stack>
  );
}

/** TextField that holds local state while typing and commits on blur.
 *  Avoids PATCHing every keystroke for the title / description fields. */
function BlurField({
  label,
  initial,
  multiline,
  width,
  onCommit,
}: {
  label: string;
  initial: string;
  multiline?: boolean;
  width?: number;
  onCommit: (v: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <TextField
      size="small"
      label={label}
      multiline={multiline}
      minRows={multiline ? 2 : undefined}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value !== initial) onCommit(value);
      }}
      sx={{ width: width ?? "100%", flex: width ? "none" : 1 }}
    />
  );
}

/** Inline editable title — enter to commit, escape to cancel. */
function InlineEdit({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (v: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <TextField
      size="small"
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onCommit(value);
        if (e.key === "Escape") onCancel();
      }}
      sx={{ flex: 1 }}
    />
  );
}

function AddPhaseDialog({
  open,
  scope,
  nextSortOrder,
  onClose,
  onCreated,
}: {
  open: boolean;
  scope: CatalogScope;
  nextSortOrder: number;
  onClose: () => void;
  onCreated: () => void;
}) {
  const snackbar = useSnackbar();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const create = useMutation({
    mutationFn: async () => {
      const { error } = await api.POST("/api/catalog/phases", {
        body: {
          scope,
          title: title.trim(),
          description: description.trim() || null,
          sort_order: nextSortOrder,
          default_billable: true,
        } as never,
      });
      if (error) {
        const msg = (error as { detail?: string }).detail ?? "Create failed.";
        throw new Error(msg);
      }
    },
    onSuccess: () => {
      setTitle("");
      setDescription("");
      onCreated();
    },
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add phase ({scope})</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            autoFocus
            size="small"
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <TextField
            size="small"
            label="Description (optional)"
            multiline
            minRows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!title.trim() || create.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending ? "Adding…" : "Add phase"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function AddItemDialog({
  phaseId,
  nextSortOrder,
  onClose,
  onCreated,
}: {
  phaseId: string | null;
  nextSortOrder: number;
  onClose: () => void;
  onCreated: () => void;
}) {
  const snackbar = useSnackbar();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const create = useMutation({
    mutationFn: async () => {
      if (!phaseId) return;
      const { error } = await api.POST("/api/catalog/items", {
        body: {
          phase_id: phaseId,
          title: title.trim(),
          description: description.trim() || null,
          sort_order: nextSortOrder,
          default_billable: true,
        } as never,
      });
      if (error) {
        const msg = (error as { detail?: string }).detail ?? "Create failed.";
        throw new Error(msg);
      }
    },
    onSuccess: () => {
      setTitle("");
      setDescription("");
      onCreated();
    },
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });
  return (
    <Dialog open={!!phaseId} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add activity</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            autoFocus
            size="small"
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <TextField
            size="small"
            label="Description (optional)"
            multiline
            minRows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!title.trim() || create.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending ? "Adding…" : "Add activity"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
