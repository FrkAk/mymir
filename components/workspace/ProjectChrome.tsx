'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { ProjectSettingsModal } from '@/components/workspace/ProjectSettingsModal';

interface ProjectChromeProps {
  /** @param projectId - UUID of the project. */
  projectId: string;
  /** @param projectName - Current project title for breadcrumb + modal. */
  projectName: string;
  /** @param description - Current project description for the settings modal. */
  description: string;
  /** @param identifier - Current project identifier (e.g. MYMR). */
  identifier: string;
  /** @param status - Current project lifecycle status (brainstorming → decomposing → active → archived). */
  status: string;
  /** @param categories - Current project categories. */
  categories: string[];
  /** @param taskCount - Total number of tasks (drives rename warning copy). */
  taskCount: number;
  /** @param stageLabel - Optional stage label shown in TopBar center. */
  stageLabel?: string;
  /** @param taskStats - Optional task stats shown in TopBar center. */
  taskStats?: string;
}

/**
 * Client-side chrome for the workspace — renders TopBar with a gear trigger
 * and owns {@link ProjectSettingsModal} open state. Refreshes the server-layout
 * data via router.refresh() after any successful update.
 * @param props - Chrome props seeded from the server layout.
 * @returns TopBar plus modal.
 */
export function ProjectChrome({
  projectId,
  projectName,
  description,
  identifier,
  status,
  categories,
  taskCount,
  stageLabel,
  taskStats,
}: ProjectChromeProps) {
  const router = useRouter();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleUpdated = () => {
    router.refresh();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mymir:project-updated', { detail: { projectId } }));
    }
  };

  return (
    <>
      <TopBar
        projectName={projectName}
        stageLabel={stageLabel}
        taskStats={taskStats}
        projectId={projectId}
        projectStatus={status}
        onOpenProjectSettings={() => setSettingsOpen(true)}
      />
      <ProjectSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        projectId={projectId}
        project={{ title: projectName, description, identifier, status, categories }}
        taskCount={taskCount}
        onUpdated={handleUpdated}
      />
    </>
  );
}

export default ProjectChrome;
