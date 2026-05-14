import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
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

// /api/catalog/* + /api/engagement-types return plain dicts. Hand-typed
// here for the columns we render and edit; backend shapes are in
// app/routes/catalog.py and app/routes/engagement_types.py.
type OwnerRole = "consultant" | "assistant" | "both";

interface Phase {
  id: string;
  scope: string; // deprecated; kept on the row but not surfaced
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
  engagement_type_ids: string[];
}

interface EngagementType {
  id: string;
  code: string;
  label: string;
  description: string | null;
  sort_order: number;
  deleted_at: string | null;
}

const OWNER_OPTIONS: Array<{ value: OwnerRole; label: string }> = [
  { value: "consultant", label: "Consultant" },
  { value: "assistant", label: "Assistant" },
  { value: "both", label: "Either" },
];

// New phases default to this scope under the hood. catalog_phases.scope
// is deprecated post-PR-A and the SPA no longer surfaces it; this just
// satisfies the NOT NULL constraint until PR C drops the column.
const DEFAULT_PHASE_SCOPE = "assessment";

export function CatalogPage() {
  const qc = useQueryClient();
  const snackbar = useSnackbar();

  const phases = useQuery<Phase[], Error>({
    queryKey: ["catalog", "phases"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/catalog/phases", {});
      if (error || !data) throw new Error("Failed to load phases.");
      return data as unknown as Phase[];
    },
  });

  const items = useQuery<Item[], Error>({
    queryKey: ["catalog", "items"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/catalog/items", {});
      if (error || !data) throw new Error("Failed to load items.");
      return data as unknown as Item[];
    },
  });

  const engagementTypes = useQuery<EngagementType[], Error>({
    queryKey: ["engagement-types"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/engagement-types", {});
      if (error || !data) throw new Error("Failed to load engagement types.");
      return data as unknown as EngagementType[];
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
      qc.invalidateQueries({ queryKey: ["catalog", "phases"] });
      qc.invalidateQueries({ queryKey: ["catalog", "items"] });
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
      qc.invalidateQueries({ queryKey: ["catalog", "items"] });
      qc.invalidateQueries({ queryKey: ["catalog", "phases"] }); // item_count
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

  const onPhaseDragEnd = (e: DragEndEvent) => {
    if (!phases.data) return;
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = phases.data.findIndex((p) => p.id === active.id);
    const newIndex = phases.data.findIndex((p) => p.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(phases.data, oldIndex, newIndex);
    qc.setQueryData(["catalog", "phases"], next);
    Promise.all(
      next
        .map((p, idx) => ({ p, sort_order: (idx + 1) * 100 }))
        .filter(({ p, sort_order }) => p.sort_order !== sort_order)
        .map(({ p, sort_order }) =>
          patchPhase.mutateAsync({ id: p.id, body: { sort_order } }),
        ),
    )
      .then(() => qc.invalidateQueries({ queryKey: ["catalog", "phases"] }))
      .catch(() => qc.invalidateQueries({ queryKey: ["catalog", "phases"] }));
  };

  if (phases.error || items.error || engagementTypes.error) {
    return (
      <Alert severity="error">
        {phases.error?.message ?? items.error?.message ?? engagementTypes.error?.message}
      </Alert>
    );
  }
  if (phases.isPending || items.isPending || engagementTypes.isPending) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  const allTypes = engagementTypes.data;
  const liveTypes = allTypes.filter((t) => !t.deleted_at);

  return (
    <Stack spacing={2}>
      <PageHeader
        title="Catalog"
        subtitle="Engagement types, phases, and activities. Drag to reorder; tag each activity with the engagement types it belongs to."
      />

      <EngagementTypesPanel types={allTypes} />

      <Stack direction="row" alignItems="baseline" spacing={1}>
        <Typography variant="h6" sx={{ fontWeight: 600, flex: 1 }}>
          Phases &amp; activities
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setAddPhaseOpen(true)}
        >
          Add phase
        </Button>
      </Stack>

      {liveTypes.length === 0 && (
        <Alert severity="info">
          No engagement types yet. Add one above so new activities have somewhere to belong.
        </Alert>
      )}

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
                engagementTypes={liveTypes}
                onPatchPhase={(body) => patchPhase.mutate({ id: phase.id, body })}
                onDeletePhase={() => deletePhase.mutate(phase.id)}
                onAddItem={() => setAddItemPhaseId(phase.id)}
                onPatchItem={(itemId, body) =>
                  patchItem.mutate({ id: itemId, body })
                }
                onDeleteItem={(itemId) => deleteItem.mutate(itemId)}
                onItemsReorder={async (newItems) => {
                  qc.setQueryData<Item[]>(["catalog", "items"], (prev) => {
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
                  qc.invalidateQueries({ queryKey: ["catalog", "items"] });
                }}
                onItemMoveOut={async (itemId, targetPhaseId) => {
                  await patchItem.mutateAsync({
                    id: itemId,
                    body: { phase_id: targetPhaseId },
                  });
                  qc.invalidateQueries({ queryKey: ["catalog", "items"] });
                  qc.invalidateQueries({ queryKey: ["catalog", "phases"] });
                }}
              />
            ))}
          </Stack>
        </SortableContext>
      </DndContext>

      <AddPhaseDialog
        open={addPhaseOpen}
        nextSortOrder={(phases.data.length + 1) * 100}
        onClose={() => setAddPhaseOpen(false)}
        onCreated={() => {
          setAddPhaseOpen(false);
          qc.invalidateQueries({ queryKey: ["catalog", "phases"] });
        }}
      />
      <AddItemDialog
        phaseId={addItemPhaseId}
        nextSortOrder={
          addItemPhaseId
            ? ((itemsByPhase.get(addItemPhaseId) ?? []).length + 1) * 100
            : 100
        }
        engagementTypes={liveTypes}
        onClose={() => setAddItemPhaseId(null)}
        onCreated={() => {
          setAddItemPhaseId(null);
          qc.invalidateQueries({ queryKey: ["catalog", "items"] });
          qc.invalidateQueries({ queryKey: ["catalog", "phases"] });
        }}
      />
    </Stack>
  );
}

// ---- Engagement types panel ------------------------------------------------

function EngagementTypesPanel({ types }: { types: EngagementType[] }) {
  const qc = useQueryClient();
  const snackbar = useSnackbar();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<EngagementType | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<EngagementType | null>(null);

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE("/api/engagement-types/{type_id}", {
        params: { path: { type_id: id } as never },
      });
      if (error) {
        const msg = (error as { detail?: string }).detail ?? "Delete failed.";
        throw new Error(msg);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["engagement-types"] });
      snackbar.show("Engagement type removed");
    },
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  const restore = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.POST("/api/engagement-types/{type_id}/restore", {
        params: { path: { type_id: id } as never },
      });
      if (error) {
        const msg = (error as { detail?: string }).detail ?? "Restore failed.";
        throw new Error(msg);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["engagement-types"] });
      snackbar.show("Engagement type restored");
    },
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  const live = types.filter((t) => !t.deleted_at);
  const archived = types.filter((t) => !!t.deleted_at);

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 1 }}>
        <Typography variant="overline" color="text.secondary" sx={{ flex: 1 }}>
          Engagement types
        </Typography>
        <Button
          size="small"
          variant="text"
          startIcon={<AddIcon fontSize="small" />}
          onClick={() => setAddOpen(true)}
        >
          Add type
        </Button>
      </Stack>
      {live.length === 0 ? (
        <Typography variant="body2" color="text.disabled">
          No engagement types yet.
        </Typography>
      ) : (
        <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ gap: 1 }}>
          {live.map((t) => (
            <Chip
              key={t.id}
              label={`${t.label} · ${t.code}`}
              onClick={() => setEditing(t)}
              onDelete={() => setConfirmingDelete(t)}
              variant="outlined"
            />
          ))}
        </Stack>
      )}
      {archived.length > 0 && (
        <Box sx={{ mt: 1.5 }}>
          <Typography variant="caption" color="text.disabled" sx={{ display: "block", mb: 0.5 }}>
            Archived
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ gap: 1 }}>
            {archived.map((t) => (
              <Chip
                key={t.id}
                label={`${t.label} · ${t.code}`}
                onClick={() => restore.mutate(t.id)}
                variant="outlined"
                sx={{ color: "text.disabled", textDecoration: "line-through" }}
              />
            ))}
          </Stack>
        </Box>
      )}

      <AddEngagementTypeDialog
        open={addOpen}
        nextSortOrder={(live.length + 1) * 100}
        onClose={() => setAddOpen(false)}
        onCreated={() => {
          setAddOpen(false);
          qc.invalidateQueries({ queryKey: ["engagement-types"] });
        }}
      />
      <EditEngagementTypeDialog
        target={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          qc.invalidateQueries({ queryKey: ["engagement-types"] });
        }}
      />
      <Dialog open={!!confirmingDelete} onClose={() => setConfirmingDelete(null)}>
        <DialogTitle>Remove "{confirmingDelete?.label}"?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Soft delete only. Existing engagements that already use this type stay
            intact; it just stops appearing in pickers and on new activities.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmingDelete(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              if (confirmingDelete) remove.mutate(confirmingDelete.id);
              setConfirmingDelete(null);
            }}
          >
            Remove
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}

function AddEngagementTypeDialog({
  open,
  nextSortOrder,
  onClose,
  onCreated,
}: {
  open: boolean;
  nextSortOrder: number;
  onClose: () => void;
  onCreated: () => void;
}) {
  const snackbar = useSnackbar();
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const create = useMutation({
    mutationFn: async () => {
      const { error } = await api.POST("/api/engagement-types", {
        body: {
          code: code.trim(),
          label: label.trim(),
          description: description.trim() || null,
          sort_order: nextSortOrder,
        } as never,
      });
      if (error) {
        const msg = (error as { detail?: string }).detail ?? "Create failed.";
        throw new Error(msg);
      }
    },
    onSuccess: () => {
      setCode("");
      setLabel("");
      setDescription("");
      onCreated();
    },
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add engagement type</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            size="small"
            label="Code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            helperText="Stable slug, e.g. consultation. lowercase letters / digits / underscores."
          />
          <TextField
            size="small"
            label="Label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
            helperText="Display name shown to users."
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
          disabled={!code.trim() || !label.trim() || create.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending ? "Adding…" : "Add type"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function EditEngagementTypeDialog({
  target,
  onClose,
  onSaved,
}: {
  target: EngagementType | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const snackbar = useSnackbar();
  const [label, setLabel] = useState(target?.label ?? "");
  const [description, setDescription] = useState(target?.description ?? "");
  // Reset local state when target changes (open with a fresh row).
  // useEffect would be cleaner; here we just key on the dialog's open
  // transition via a derived check.
  if (target && label === "" && description === "") {
    // first render after target set; initialize once
    setLabel(target.label);
    setDescription(target.description ?? "");
  }
  const save = useMutation({
    mutationFn: async () => {
      if (!target) return;
      const { error } = await api.PATCH("/api/engagement-types/{type_id}", {
        params: { path: { type_id: target.id } as never },
        body: {
          label: label.trim(),
          description: description.trim() || null,
        } as never,
      });
      if (error) {
        const msg = (error as { detail?: string }).detail ?? "Save failed.";
        throw new Error(msg);
      }
    },
    onSuccess: () => {
      setLabel("");
      setDescription("");
      onSaved();
    },
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });
  return (
    <Dialog open={!!target} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit "{target?.code}"</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            size="small"
            label="Label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
          />
          <TextField
            size="small"
            label="Description"
            multiline
            minRows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Typography variant="caption" color="text.disabled">
            Code "{target?.code}" can't be renamed — it's the stable identifier
            referenced by engagements and activity memberships.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!label.trim() || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ---- Phase + Item rendering ------------------------------------------------

function PhaseCard({
  phase,
  items,
  allPhaseIds,
  engagementTypes,
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
  engagementTypes: EngagementType[];
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onItemDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const overPhaseId = allPhaseIds.find((id) => id === over.id);
    if (overPhaseId && overPhaseId !== phase.id) {
      await onItemMoveOut(String(active.id), overPhaseId);
      return;
    }
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
          <Stack spacing={0} sx={{ p: 1 }}>
            <PhaseDropTarget phaseId={phase.id} />
            {items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                engagementTypes={engagementTypes}
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
  engagementTypes,
  onPatch,
  onDelete,
}: {
  item: Item;
  engagementTypes: EngagementType[];
  onPatch: (body: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });
  const [expanded, setExpanded] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const memberships = new Set(item.engagement_type_ids);
  const toggleType = (typeId: string) => {
    const next = new Set(memberships);
    if (next.has(typeId)) next.delete(typeId);
    else next.add(typeId);
    onPatch({ engagement_type_ids: Array.from(next) });
  };

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
        <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ gap: 0.5 }}>
          {engagementTypes.map((t) => {
            const on = memberships.has(t.id);
            return (
              <Chip
                key={t.id}
                label={t.label}
                size="small"
                clickable
                onClick={() => toggleType(t.id)}
                variant={on ? "filled" : "outlined"}
                color={on ? "primary" : "default"}
              />
            );
          })}
        </Stack>
        {item.default_est_hours && (
          <Typography variant="caption" color="text.secondary" sx={{ minWidth: 56, textAlign: "right" }}>
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
  nextSortOrder,
  onClose,
  onCreated,
}: {
  open: boolean;
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
          scope: DEFAULT_PHASE_SCOPE,
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
      <DialogTitle>Add phase</DialogTitle>
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
  engagementTypes,
  onClose,
  onCreated,
}: {
  phaseId: string | null;
  nextSortOrder: number;
  engagementTypes: EngagementType[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const snackbar = useSnackbar();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  // Pre-select every engagement type so new activities are usable
  // immediately. The chips on the row can flip individual ones off.
  const [typeIds, setTypeIds] = useState<string[]>(() => engagementTypes.map((t) => t.id));
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
          engagement_type_ids: typeIds,
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
      setTypeIds(engagementTypes.map((t) => t.id));
      onCreated();
    },
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });
  const toggle = (id: string) => {
    setTypeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };
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
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
              Engagement types this activity belongs to
            </Typography>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ gap: 0.5 }}>
              {engagementTypes.map((t) => {
                const on = typeIds.includes(t.id);
                return (
                  <Chip
                    key={t.id}
                    label={t.label}
                    size="small"
                    clickable
                    onClick={() => toggle(t.id)}
                    variant={on ? "filled" : "outlined"}
                    color={on ? "primary" : "default"}
                  />
                );
              })}
            </Stack>
          </Box>
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
