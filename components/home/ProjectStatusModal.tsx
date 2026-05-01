'use client';

import { Modal } from '@/components/shared/Modal';

export type CliManagedStatus = 'brainstorming' | 'decomposing';

interface ProjectStatusModalProps {
  /** @param open - Whether the modal is visible. */
  open: boolean;
  /** @param onClose - Called when the modal requests dismissal. */
  onClose: () => void;
  /** @param status - CLI-managed project lifecycle status. */
  status: CliManagedStatus;
  /** @param title - Project title displayed in the modal body. */
  title: string;
  /** @param identifier - Project identifier used in the CLI resume hint. */
  identifier: string;
}

interface StatusContent {
  modalTitle: string;
  label: string;
  summary: string;
  activity: string;
  prompt: string;
  nextStep: string;
  accentClass: string;
}

const STATUS_CONTENT: Record<CliManagedStatus, StatusContent> = {
  brainstorming: {
    modalTitle: 'Idea in progress',
    label: 'Brainstorming',
    summary: 'Your CLI agent is still shaping the project brief, goals, constraints, and first useful scope.',
    activity: 'Mymir is collecting the decisions that make the project concrete enough to break down.',
    prompt: 'Continue brainstorming {identifier}. Ask the next useful clarifying question, tighten the project brief, and record key decisions when the idea is concrete.',
    nextStep: 'Paste this into any CLI agent with the Mymir plugin installed. The workspace opens after the project becomes active.',
    accentClass: 'text-accent border-accent/25 bg-accent/8',
  },
  decomposing: {
    modalTitle: 'Structure in progress',
    label: 'Decomposing',
    summary: 'Your CLI agent is turning the brief into tasks, acceptance criteria, and dependency edges.',
    activity: 'Mymir is building the graph the workspace will use for planning, tracking, and execution context.',
    prompt: 'Continue decomposing {identifier}. Create focused tasks with criteria, tags, categories, and dependencies; activate the project when the graph is ready.',
    nextStep: 'Paste this into any CLI agent with the Mymir plugin installed. The workspace opens after the project becomes active.',
    accentClass: 'text-progress border-progress/25 bg-progress/8',
  },
};

const SECTION_LABEL_CLASS =
  'font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted';

/**
 * Status dialog for projects that are still managed from a CLI lifecycle phase.
 * @param props - Modal configuration and project metadata.
 * @returns Status-aware modal with a CLI resume hint.
 */
export function ProjectStatusModal({
  open,
  onClose,
  status,
  title,
  identifier,
}: ProjectStatusModalProps) {
  const content = STATUS_CONTENT[status];

  return (
    <Modal open={open} onClose={onClose} title={content.modalTitle} maxWidth="md">
      <div className="space-y-5">
        <div className="space-y-2">
          <div className={`inline-flex rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${content.accentClass}`}>
            {content.label}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-text-secondary">
              {content.summary}
            </p>
          </div>
        </div>

        <section className="rounded-lg border border-border bg-surface-raised p-3">
          <h4 className={SECTION_LABEL_CLASS}>What is happening</h4>
          <p className="mt-1.5 text-xs leading-relaxed text-text-muted">
            {content.activity}
          </p>
        </section>

        <section className="space-y-1.5">
          <h4 className={SECTION_LABEL_CLASS}>Prompt to paste</h4>
          <pre className="overflow-x-auto rounded-md border border-border bg-surface-raised p-3 font-mono text-xs leading-relaxed text-text-primary">
            <code>{content.prompt.replace('{identifier}', identifier)}</code>
          </pre>
          <p className="text-xs leading-relaxed text-text-muted">
            {content.nextStep}
          </p>
        </section>
      </div>
    </Modal>
  );
}

export default ProjectStatusModal;
