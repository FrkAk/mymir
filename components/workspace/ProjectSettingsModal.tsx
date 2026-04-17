'use client';

import { useCallback, useState } from 'react';
import { Modal } from '@/components/shared/Modal';
import { validateIdentifier } from '@/lib/graph/identifier';
import { updateProjectSettings, updateProjectStatus } from '@/lib/actions/project';
import { renameCategory, deleteCategory, updateProject } from '@/lib/graph/mutations';
import type { ProjectStatus } from '@/lib/types';

interface ProjectSettingsModalProps {
  /** @param open - Whether the modal is visible. */
  open: boolean;
  /** @param onClose - Called when the modal requests dismissal. */
  onClose: () => void;
  /** @param projectId - UUID of the project being edited. */
  projectId: string;
  /** @param project - Current project fields reflected by the form. */
  project: { title: string; description: string; identifier: string; status: string; categories: string[] };
  /** @param taskCount - Number of tasks affected by an identifier rename. */
  taskCount: number;
  /** @param onUpdated - Fired after a successful update. Caller refetches. */
  onUpdated?: () => void;
}

/** Project lifecycle, ordered. */
const PROJECT_STATUS_FLOW: ProjectStatus[] = ['brainstorming', 'decomposing', 'active', 'archived'];

/** Display mapping for project statuses inside the modal stepper. */
const PROJECT_STATUS_META: Record<ProjectStatus, { label: string; dot: string; text: string }> = {
  brainstorming: { label: 'Idea', dot: 'bg-accent', text: 'text-accent' },
  decomposing: { label: 'Building', dot: 'bg-progress', text: 'text-progress' },
  active: { label: 'Active', dot: 'bg-done', text: 'text-done' },
  archived: { label: 'Archived', dot: 'bg-draft', text: 'text-draft' },
};

const SECTION_LABEL_CLASS =
  'font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted';

/**
 * Per-project settings dialog — edit title, description, identifier, categories.
 * Identifier rename uses a 2-click inline-danger confirm with external-ref warning.
 * @param props - Modal configuration.
 * @returns Settings modal rendered via {@link Modal}.
 */
export function ProjectSettingsModal({
  open,
  onClose,
  projectId,
  project,
  taskCount,
  onUpdated,
}: ProjectSettingsModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Project settings" maxWidth="md">
      <div className="space-y-5">
        <TitleSection
          projectId={projectId}
          initialTitle={project.title}
          onUpdated={onUpdated}
        />
        <DescriptionSection
          projectId={projectId}
          initialDescription={project.description}
          onUpdated={onUpdated}
        />
        <StatusSection
          projectId={projectId}
          status={project.status}
          onUpdated={onUpdated}
        />
        <IdentifierSection
          projectId={projectId}
          identifier={project.identifier}
          taskCount={taskCount}
          onUpdated={onUpdated}
        />
        <CategoriesSection
          projectId={projectId}
          categories={project.categories}
          onUpdated={onUpdated}
        />
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

interface StatusSectionProps {
  projectId: string;
  status: string;
  onUpdated?: () => void;
}

/**
 * Project lifecycle stepper — mirrors the task status stepper in DetailPanel.
 * Each step is clickable and calls `updateProjectStatus` server action.
 * @param props - Section props.
 * @returns Status row with stepper.
 */
function StatusSection({ projectId, status, onUpdated }: StatusSectionProps) {
  const [pending, setPending] = useState<string | null>(null);
  const currentIdx = PROJECT_STATUS_FLOW.indexOf(status as ProjectStatus);

  const handleStatusChange = useCallback(async (next: ProjectStatus) => {
    if (next === status) return;
    setPending(next);
    try {
      await updateProjectStatus(projectId, next);
      onUpdated?.();
    } finally {
      setPending(null);
    }
  }, [projectId, status, onUpdated]);

  return (
    <section className="space-y-1.5">
      <label className={SECTION_LABEL_CLASS}>Status</label>
      <div className="flex items-center gap-0.5 overflow-x-auto">
        {PROJECT_STATUS_FLOW.map((s, i) => {
          const meta = PROJECT_STATUS_META[s];
          const isCurrent = s === status;
          const isPast = i < currentIdx;
          const isPending = pending === s;
          return (
            <div key={s} className="flex items-center">
              {i > 0 && (
                <div className={`mx-0.5 h-px w-3 ${isPast ? 'bg-done/40' : 'bg-border-strong'}`} />
              )}
              <button
                type="button"
                onClick={() => handleStatusChange(s)}
                disabled={isPending}
                className={`relative cursor-pointer rounded-md px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider transition-all ${
                  isCurrent
                    ? `${meta.text} bg-surface-raised ring-1 ring-current/20`
                    : isPast
                      ? 'text-done/60 hover:bg-surface-hover'
                      : 'text-text-muted/60 hover:bg-surface-hover hover:text-text-muted'
                } ${isPending ? 'opacity-60' : ''}`}
                title={`Set status to ${meta.label}`}
              >
                <span className="inline-flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${isCurrent ? meta.dot : 'bg-current'}`} />
                  {meta.label}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Title
// ---------------------------------------------------------------------------

interface TitleSectionProps {
  projectId: string;
  initialTitle: string;
  onUpdated?: () => void;
}

/**
 * Click-to-edit title input that persists on blur.
 * @param props - Section props.
 * @returns Title row.
 */
function TitleSection({ projectId, initialTitle, onUpdated }: TitleSectionProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialTitle);
  const [prev, setPrev] = useState(initialTitle);

  if (initialTitle !== prev) {
    setPrev(initialTitle);
    setValue(initialTitle);
  }

  const commit = useCallback(async () => {
    setEditing(false);
    const trimmed = value.trim();
    if (!trimmed) { setValue(initialTitle); return; }
    if (trimmed === initialTitle) return;
    const result = await updateProjectSettings(projectId, { title: trimmed });
    if (!result.ok) { setValue(initialTitle); return; }
    onUpdated?.();
  }, [value, initialTitle, projectId, onUpdated]);

  return (
    <section className="space-y-1.5">
      <label className={SECTION_LABEL_CLASS}>Title</label>
      {editing ? (
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
            if (e.key === 'Escape') { setValue(initialTitle); setEditing(false); }
          }}
          autoFocus
          className="w-full rounded-lg border border-border-strong bg-base px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-accent"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="w-full cursor-pointer rounded-lg border border-transparent px-3 py-2 text-left text-sm text-text-primary transition-colors hover:border-border hover:bg-surface-hover/40"
        >
          {value || <span className="text-text-muted">Untitled</span>}
        </button>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Description
// ---------------------------------------------------------------------------

interface DescriptionSectionProps {
  projectId: string;
  initialDescription: string;
  onUpdated?: () => void;
}

/**
 * Click-to-edit textarea (3 rows) that persists on blur.
 * @param props - Section props.
 * @returns Description row.
 */
function DescriptionSection({ projectId, initialDescription, onUpdated }: DescriptionSectionProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialDescription);
  const [prev, setPrev] = useState(initialDescription);

  if (initialDescription !== prev) {
    setPrev(initialDescription);
    setValue(initialDescription);
  }

  const commit = useCallback(async () => {
    setEditing(false);
    if (value === initialDescription) return;
    const result = await updateProjectSettings(projectId, { description: value });
    if (!result.ok) { setValue(initialDescription); return; }
    onUpdated?.();
  }, [value, initialDescription, projectId, onUpdated]);

  return (
    <section className="space-y-1.5">
      <label className={SECTION_LABEL_CLASS}>Description</label>
      {editing ? (
        <textarea
          value={value}
          rows={3}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { setValue(initialDescription); setEditing(false); }
          }}
          autoFocus
          className="w-full resize-none rounded-lg border border-border-strong bg-base px-3 py-2 text-sm text-text-secondary outline-none transition-colors focus:border-accent"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="block w-full cursor-pointer rounded-lg border border-transparent px-3 py-2 text-left text-sm text-text-secondary transition-colors hover:border-border hover:bg-surface-hover/40"
        >
          {value || <span className="text-text-muted">Add a description…</span>}
        </button>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Identifier
// ---------------------------------------------------------------------------

interface IdentifierSectionProps {
  projectId: string;
  identifier: string;
  taskCount: number;
  onUpdated?: () => void;
}

/**
 * Identifier edit + 2-click rename confirm.
 *
 * Validation runs live via {@link validateIdentifier}. On submit, replaces the
 * Save/Cancel row with an inline danger banner explaining the external-ref
 * breakage; the actual rename only fires on the second confirm click.
 *
 * @param props - Section props.
 * @returns Identifier row with rename flow.
 */
function IdentifierSection({ projectId, identifier, taskCount, onUpdated }: IdentifierSectionProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(identifier);
  const [prevIdentifier, setPrevIdentifier] = useState(identifier);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [confirmStage, setConfirmStage] = useState<'idle' | 'pending' | 'saving'>('idle');
  const [serverError, setServerError] = useState<string | null>(null);

  if (!editing && identifier !== prevIdentifier) {
    setPrevIdentifier(identifier);
    setDraft(identifier);
  }

  const startEdit = () => {
    setDraft(identifier);
    setValidationError(null);
    setServerError(null);
    setConfirmStage('idle');
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setConfirmStage('idle');
    setValidationError(null);
    setServerError(null);
    setDraft(identifier);
  };

  const handleDraftChange = (raw: string) => {
    const next = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    setDraft(next);
    setValidationError(validateIdentifier(next));
    setServerError(null);
  };

  const canSave = !validationError && draft !== identifier && draft.length >= 2;

  const commitRename = async () => {
    setConfirmStage('saving');
    setServerError(null);
    const result = await updateProjectSettings(projectId, { identifier: draft });
    if (result.ok) {
      setEditing(false);
      setConfirmStage('idle');
      onUpdated?.();
      return;
    }
    setServerError(result.message);
    setConfirmStage('idle');
  };

  return (
    <section className="space-y-1.5">
      <label className={SECTION_LABEL_CLASS}>Identifier</label>

      {!editing ? (
        <button
          type="button"
          onClick={startEdit}
          className="w-full cursor-pointer rounded-lg border border-transparent px-3 py-2 text-left font-mono text-xs text-text-primary transition-colors hover:border-border hover:bg-surface-hover/40"
        >
          {identifier}
          <span className="ml-2 font-sans text-[11px] text-text-muted">click to rename</span>
        </button>
      ) : (
        <div className="space-y-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => handleDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') cancelEdit();
            }}
            autoFocus
            disabled={confirmStage !== 'idle'}
            className="w-full rounded-lg border border-border-strong bg-base px-3 py-2 font-mono text-sm uppercase tracking-wider text-text-primary outline-none transition-colors focus:border-accent disabled:opacity-60"
          />
          {validationError && (
            <p className="font-mono text-[10px] text-danger">{validationError}</p>
          )}
          {!validationError && (
            <p className="font-mono text-[10px] text-text-muted">
              Preview: <span className="text-text-secondary">{draft || identifier}-1</span>
            </p>
          )}

          {confirmStage === 'idle' ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmStage('pending')}
                disabled={!canSave}
                className="cursor-pointer rounded-md bg-accent/15 px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-accent hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Save
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                className="cursor-pointer rounded-md px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted hover:text-text-secondary"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="space-y-2 rounded-lg border border-danger/20 bg-danger/5 p-3 text-xs">
              <p className="font-semibold text-danger">
                Rename {identifier} → {draft}?
              </p>
              <p className="text-text-secondary">
                All {taskCount} task IDs will change to{' '}
                <code className="font-mono text-text-primary">{draft}-N</code>. External references
                (GitHub PRs, docs, commit messages, links) to the old prefix will no longer resolve.
              </p>
              <div className="flex gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={commitRename}
                  disabled={confirmStage === 'saving'}
                  className="cursor-pointer rounded-md bg-danger/15 px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-danger hover:bg-danger/25 disabled:opacity-50"
                >
                  {confirmStage === 'saving' ? 'Renaming…' : 'Rename'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmStage('idle')}
                  disabled={confirmStage === 'saving'}
                  className="cursor-pointer rounded-md px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted hover:text-text-secondary disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {serverError && (
            <p className="font-mono text-[10px] text-danger">{serverError}</p>
          )}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

interface CategoriesSectionProps {
  projectId: string;
  categories: string[];
  onUpdated?: () => void;
}

/**
 * Minimal inline category editor — chips with hover-remove + add-new input.
 * Delegates persistence to {@link updateProject} and {@link deleteCategory}.
 * @param props - Section props.
 * @returns Categories row.
 */
function CategoriesSection({ projectId, categories, onUpdated }: CategoriesSectionProps) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name || categories.includes(name)) { setAdding(false); setNewName(''); return; }
    await updateProject(projectId, { categories: [...categories, name] });
    setAdding(false);
    setNewName('');
    onUpdated?.();
  };

  const handleRemove = async (name: string) => {
    await deleteCategory(projectId, name);
    onUpdated?.();
  };

  const commitRename = async (oldName: string) => {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === oldName || categories.includes(trimmed)) {
      setRenaming(null);
      return;
    }
    await renameCategory(projectId, oldName, trimmed);
    setRenaming(null);
    onUpdated?.();
  };

  return (
    <section className="space-y-1.5">
      <label className={SECTION_LABEL_CLASS}>Categories</label>
      <div className="flex flex-wrap items-center gap-1.5">
        {categories.map((cat) => {
          if (renaming === cat) {
            return (
              <input
                key={cat}
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename(cat);
                  if (e.key === 'Escape') setRenaming(null);
                }}
                onBlur={() => commitRename(cat)}
                autoFocus
                className="w-24 rounded-md bg-accent/5 px-1.5 py-0.5 font-mono text-[10px] font-medium text-accent-light outline-none ring-1 ring-accent/30"
              />
            );
          }
          return (
            <span
              key={cat}
              className="group/cat inline-flex items-center gap-1 rounded-md bg-accent/8 px-1.5 py-0.5 font-mono text-[10px] font-medium text-accent-light"
            >
              <button
                type="button"
                onClick={() => { setRenaming(cat); setRenameValue(cat); }}
                className="cursor-pointer hover:underline"
                title="Rename category"
              >
                {cat}
              </button>
              <button
                type="button"
                onClick={() => handleRemove(cat)}
                className="cursor-pointer rounded-sm opacity-0 transition-opacity group-hover/cat:opacity-100 hover:text-accent"
                title={`Remove category "${cat}"`}
              >
                <svg viewBox="0 0 16 16" fill="currentColor" className="h-2.5 w-2.5">
                  <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
                </svg>
              </button>
            </span>
          );
        })}

        {adding ? (
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
              if (e.key === 'Escape') { setAdding(false); setNewName(''); }
            }}
            onBlur={handleAdd}
            autoFocus
            placeholder="Category"
            className="w-28 rounded-md bg-accent/5 px-1.5 py-0.5 font-mono text-[10px] text-accent placeholder:text-accent/30 outline-none ring-1 ring-accent/30"
          />
        ) : (
          <button
            type="button"
            onClick={() => { setAdding(true); setNewName(''); }}
            className="cursor-pointer rounded-md border border-dashed border-border-strong px-1.5 py-0.5 font-mono text-[10px] font-medium text-text-muted transition-colors hover:border-accent/40 hover:text-accent-light"
          >
            + Add category
          </button>
        )}
      </div>
    </section>
  );
}

export default ProjectSettingsModal;
