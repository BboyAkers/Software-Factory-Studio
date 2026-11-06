import { Icon } from '../../../../components/ui';

interface GitHubFooterSectionsProps {
  defaultBranch: string;
}

export function GitHubFooterSections({ defaultBranch }: GitHubFooterSectionsProps) {
  return (
    <div className="flex items-start gap-2.5 rounded-md border border-fluent-border bg-white/[0.01] p-3 text-[12px] text-on-surface-variant">
      <Icon name="shield" size={16} className="mt-0.5 text-fluent-blue-light" />
      <div className="leading-5">
        <strong className="text-white">Mainline Branch Protection:</strong> Factory agents never commit directly to the default branch (<code className="font-mono text-[11px] text-white">{defaultBranch}</code>). All synthesis takes place on isolated branches (<code className="font-mono text-[11px] text-white">factory/&lt;wp-id&gt;-&lt;slug&gt;</code>) and undergoes deterministic GateKeeper verification before PR creation.
      </div>
    </div>
  );
}
