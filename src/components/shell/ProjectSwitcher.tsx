import { useNavigate } from '@tanstack/react-router';
import { useCurrentPage, useGo } from '../../app/nav';
import { clearSelectedProject, setSelectedProject } from '../../app/SelectOrConnectRepo';
import { useCan, useSession } from '../../app/session';
import { Icon, Menu, Skeleton, type MenuItem } from '../ui';

/**
 * One entry per project plus "Connect repository". Switching keeps the current page and changes the
 * `:project` segment, so every query refetches for the new project.
 */
export function ProjectSwitcher() {
  const { project, projects, projectId } = useSession();
  const page = useCurrentPage();
  const go = useGo();
  const navigate = useNavigate();
  const connect = useCan('project.connect');

  if (!project) return <Skeleton className="h-8 w-44" />;

  const items: MenuItem[] = [
    ...projects.map(
      (p): MenuItem => ({
        id: p.id,
        label: p.name,
        description: p.repo,
        icon: 'folder',
        current: p.id === projectId,
        onSelect: () => {
          setSelectedProject(p.id);
          void go(page?.segment ?? 'overview', { project: p.id });
        },
      }),
    ),
    {
      id: 'switch_repo',
      label: 'Switch or select repository...',
      icon: 'sync_alt',
      separatorBefore: true,
      onSelect: () => {
        clearSelectedProject();
        void navigate({ to: '/', search: { switch: true } });
      },
    },
    {
      id: 'connect',
      label: 'Connect repository',
      icon: 'add_link',
      disabled: !connect.allowed,
      ...(connect.reason ? { reason: connect.reason } : {}),
      onSelect: () => void go('settings', { search: { section: 'connect' } }),
    },
  ];

  return (
    <Menu
      label="Switch project"
      align="start"
      items={items}
      trigger={(props) => (
        <button {...props} className="focus-ring flex h-8 max-w-[300px] min-w-0 items-center gap-2 rounded-md px-2 text-left transition-colors duration-150 hover:bg-white/6">
          <Icon name="folder_open" size={18} className="shrink-0 text-on-surface-variant" />
          <span className="min-w-0">
            <span className="block truncate text-[13px] leading-4 font-semibold text-on-surface">{project.name}</span>
            <span className="hidden truncate text-[12px] leading-4 text-on-surface-variant lg:block">{project.repo}</span>
          </span>
          <Icon name="unfold_more" size={16} className="shrink-0 text-on-surface-variant" />
        </button>
      )}
    />
  );
}
