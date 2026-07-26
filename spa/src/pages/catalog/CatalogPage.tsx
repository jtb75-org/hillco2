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
  useDroppable,
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

import { useTheme } from "@mui/material/styles";

import { api } from "../../api/client";
import { SectionPanel } from "../../components/SectionPanel";
import { useSnackbar } from "../../components/Snackbar";

// /api/catalog/* + /api/engagement-types return plain dicts. Hand-typed
// here for the columns we render and edit; backend shapes are in
// app/routes/catalog.py and app/routes/engagement_types.py.
type OwnerRole = "consultant" | "assistant" | "both";

interface Phase {
  id: string;
  sort_order: number;
  title: string;
  description: string | null;
  est_hours: string | null;
  default_billable: boolean;
  item_count: number;
}

type ActivityKind =
  | "task"
  | "document_review"
  | "best_environment"
  | "feedback_meeting"
  | "school_visit"
  | "school_recommendation";

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
  default_activity_kind: ActivityKind;
  engagement_type_ids: string[];
}

const KIND_OPTIONS: Array<{ value: ActivityKind; label: string; hint: string }> = [
  { value: "task",                   label: "Task (notes)",       hint: "Plain checklist activity captured with notes" },
  { value: "document_review",        label: "Document review",    hint: "Attach educational + medical documents" },
  { value: "best_environment",       label: "Best environment",   hint: "Curriculum / placement / social-emotional / extras" },
  { value: "feedback_meeting",       label: "Feedback meeting",   hint: "Recommendations / admissions strategy / follow-on" },
  { value: "school_visit",           label: "Campus visit",       hint: "Backed by a school_visits row with hours + facts + opinions" },
  { value: "school_recommendation",  label: "School recommendation", hint: "Backed by a school_recommendations row" },
];

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

  // Mutation-level onSuccess intentionally omitted: the reorder paths
  // below batch many PATCHes via Promise.all + a single invalidate
  // afterwards, and auto-invalidating per call would cause flicker
  // from partial server states landing mid-batch. Single-field edits
  // (chip toggle, inline rename, expand-field commit) pass their own
  // per-call onSuccess invalidation at the use site.
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

  // Single top-level drag handler. Differentiates phases vs items via
  // the `type` we tag on each useSortable's data — cross-phase moves
  // need one shared DndContext, so we can't have a per-PhaseCard
  // DndContext like the earlier version did.
  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const activeType = (active.data.current as { type?: string } | undefined)?.type;
    if (activeType === "phase") {
      handlePhaseDragEnd(active.id as string, over.id as string);
      return;
    }
    if (activeType === "item") {
      await handleItemDragEnd(active, over);
      return;
    }
  };

  const handlePhaseDragEnd = (activeId: string, overId: string) => {
    if (!phases.data) return;
    const oldIndex = phases.data.findIndex((p) => p.id === activeId);
    const newIndex = phases.data.findIndex((p) => p.id === overId);
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

  const handleItemDragEnd = async (
    active: DragEndEvent["active"],
    over: NonNullable<DragEndEvent["over"]>,
  ) => {
    const sourcePhaseId = (active.data.current as { phaseId?: string } | undefined)?.phaseId;
    if (!sourcePhaseId) return;
    // Target phase: comes either from another item's data (dropping
    // on top of an item in another phase) or from the phase drop
    // target itself (dropping on the empty area of a phase).
    const overData = over.data.current as
      | { type?: string; phaseId?: string }
      | undefined;
    const targetPhaseId =
      overData?.type === "item"
        ? overData.phaseId
        : overData?.type === "phase-drop"
          ? overData.phaseId
          : undefined;
    if (!targetPhaseId) return;

    if (targetPhaseId !== sourcePhaseId) {
      // Cross-phase move. Renumber the destination so the dropped
      // item lands at the end; backend will accept a single PATCH.
      const destItems = itemsByPhase.get(targetPhaseId) ?? [];
      const nextSort = (destItems.length + 1) * 100;
      await patchItem.mutateAsync({
        id: String(active.id),
        body: { phase_id: targetPhaseId, sort_order: nextSort },
      });
      qc.invalidateQueries({ queryKey: ["catalog", "items"] });
      qc.invalidateQueries({ queryKey: ["catalog", "phases"] });
      return;
    }

    // Same-phase reorder. Find the indices within this phase and
    // renumber sort_order spaced by 100 for any rows that moved.
    const phaseItems = itemsByPhase.get(sourcePhaseId) ?? [];
    const oldIndex = phaseItems.findIndex((i) => i.id === active.id);
    const newIndex = phaseItems.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(phaseItems, oldIndex, newIndex);
    qc.setQueryData<Item[]>(["catalog", "items"], (prev) => {
      if (!prev) return prev;
      const others = prev.filter((i) => i.phase_id !== sourcePhaseId);
      return [...others, ...reordered];
    });
    await Promise.all(
      reordered
        .map((it, idx) => ({ it, sort_order: (idx + 1) * 100 }))
        .filter(({ it, sort_order }) => it.sort_order !== sort_order)
        .map(({ it, sort_order }) =>
          patchItem.mutateAsync({ id: it.id, body: { sort_order } }),
        ),
    );
    qc.invalidateQueries({ queryKey: ["catalog", "items"] });
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

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
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
                engagementTypes={liveTypes}
                onPatchPhase={(body) =>
                  // Per-call invalidation here (not at the mutation
                  // level) so the multi-PATCH reorder paths above
                  // don't get hammered with per-PATCH refetches.
                  patchPhase.mutate(
                    { id: phase.id, body },
                    {
                      onSuccess: () =>
                        qc.invalidateQueries({ queryKey: ["catalog", "phases"] }),
                    },
                  )
                }
                onDeletePhase={() => deletePhase.mutate(phase.id)}
                onAddItem={() => setAddItemPhaseId(phase.id)}
                onPatchItem={(itemId, body) =>
                  patchItem.mutate(
                    { id: itemId, body },
                    {
                      onSuccess: () =>
                        qc.invalidateQueries({ queryKey: ["catalog", "items"] }),
                    },
                  )
                }
                onDeleteItem={(itemId) => deleteItem.mutate(itemId)}
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
    <SectionPanel
      title="Engagement types"
      titleVariant="overline"
      actions={
        <Button
          size="small"
          variant="text"
          startIcon={<AddIcon fontSize="small" />}
          onClick={() => setAddOpen(true)}
        >
          Add type
        </Button>
      }
    >
      <Box sx={{ p: 2 }}>
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
      </Box>
    </SectionPanel>
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
  engagementTypes,
  onPatchPhase,
  onDeletePhase,
  onAddItem,
  onPatchItem,
  onDeleteItem,
}: {
  phase: Phase;
  items: Item[];
  engagementTypes: EngagementType[];
  onPatchPhase: (body: Record<string, unknown>) => void;
  onDeletePhase: () => void;
  onAddItem: () => void;
  onPatchItem: (itemId: string, body: Record<string, unknown>) => void;
  onDeleteItem: (itemId: string) => void;
}) {
  // Tag this sortable with type=phase so the top-level onDragEnd can
  // tell phase reorders from item drags.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: phase.id, data: { type: "phase" } });
  const [expanded, setExpanded] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const { hillco: { panel } } = useTheme();

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
      {/* Header uses the window-style panel tokens directly — the drag
          handle + inline-editable title don't fit SectionPanel's anatomy,
          but the strip should restyle exactly like every other section
          header (sharp tint / ink bar / ledger rule). */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{
          p: 1.25,
          bgcolor: panel.headerBg,
          borderBottom: panel.outside ? 2 : 1,
          borderColor: panel.headerBorder,
          ...(panel.onDark && {
            "& .MuiTypography-root": { color: "rgba(255,255,255,0.9)" },
            "& .MuiIconButton-root": { color: "rgba(255,255,255,0.8)" },
          }),
        }}
      >
        <Box
          {...attributes}
          {...listeners}
          sx={{
            display: "flex",
            cursor: "grab",
            color: panel.onDark ? "rgba(255,255,255,0.6)" : "text.disabled",
          }}
          aria-label={`Drag ${phase.title}`}
        >
          <DragIndicatorIcon fontSize="small" />
        </Box>
        {editingTitle ? (
          <Box sx={{ flex: 1, bgcolor: "background.paper", borderRadius: 1 }}>
            <InlineEdit
              initial={phase.title}
              onCommit={(v) => {
                const t = v.trim();
                if (t && t !== phase.title) onPatchPhase({ title: t });
                setEditingTitle(false);
              }}
              onCancel={() => setEditingTitle(false)}
            />
          </Box>
        ) : (
          <Typography
            variant="subtitle1"
            sx={{
              ...(panel.titleSx ?? { fontWeight: 600 }),
              flex: 1,
              cursor: "text",
            }}
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

      {/* Items live in the outer DndContext (set up by CatalogPage)
          so they can be dragged across phases. SortableContext here
          handles within-phase ordering. The PhaseDropZone wraps the
          item list as a separate droppable so an item dragged in
          from another phase has a valid drop target even when this
          phase is empty. */}
      <SortableContext
        items={items.map((i) => i.id)}
        strategy={verticalListSortingStrategy}
      >
        <PhaseDropZone phaseId={phase.id}>
          {items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              phaseId={phase.id}
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
        </PhaseDropZone>
      </SortableContext>

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

/** Drop target wrapping a phase's item list. Registered as a plain
 *  droppable (not a sortable) tagged with the phase id, so the
 *  top-level onDragEnd can route items dropped here to that phase
 *  even when it has no items to land "on top of". */
function PhaseDropZone({
  phaseId,
  children,
}: {
  phaseId: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `phase-drop-${phaseId}`,
    data: { type: "phase-drop", phaseId },
  });
  return (
    <Stack
      ref={setNodeRef}
      spacing={0}
      sx={{
        p: 1,
        minHeight: 40,
        borderRadius: 1,
        bgcolor: isOver ? "primary.light" : "transparent",
        transition: "background-color 120ms",
      }}
    >
      {children}
    </Stack>
  );
}

function ItemRow({
  item,
  phaseId,
  engagementTypes,
  onPatch,
  onDelete,
}: {
  item: Item;
  phaseId: string;
  engagementTypes: EngagementType[];
  onPatch: (body: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  // Tag this sortable with type=item + the owning phase so the
  // top-level drag handler can resolve same-phase reorder vs.
  // cross-phase move from the active/over data.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id, data: { type: "item", phaseId } });
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
        <TextField
          select
          size="small"
          label="Activity kind"
          value={item.default_activity_kind}
          onChange={(e) =>
            onPatch({ default_activity_kind: e.target.value as ActivityKind })
          }
          helperText={
            KIND_OPTIONS.find((o) => o.value === item.default_activity_kind)?.hint
          }
          sx={{ minWidth: 240 }}
        >
          {KIND_OPTIONS.map((o) => (
            <MenuItem key={o.value} value={o.value}>
              {o.label}
            </MenuItem>
          ))}
        </TextField>
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
