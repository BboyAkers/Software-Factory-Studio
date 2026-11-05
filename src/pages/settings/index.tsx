import { usePageTitle } from '../../app/usePageTitle';
import { Page, PageHeader } from '../../components/layout/Page';
import { Badge } from '../../components/ui';
import { useSession } from '../../app/session';
import { useSearchState } from '../../app/nav';
import { SearchSchema } from './routes';
import { GitHubConnectionCard } from './components/GitHubConnectionCard';
import { ModelProviderKeysCard } from './components/ModelProviderKeysCard';

export default function SettingsPage() {
  usePageTitle('Settings');
  const { role } = useSession();
  const [search, setSearch] = useSearchState(SearchSchema);

  const isConnectModalOpen = search.section === 'connect';

  const handleOpenConnectModal = () => {
    setSearch({ section: 'connect' });
  };

  const handleCloseConnectModal = () => {
    setSearch({ section: undefined });
  };

  return (
    <Page scroll="page">
      <PageHeader
        title="Settings & Integrations"
        description="Source control repositories, autonomous guardrails, external integrations, model provider keys, and telemetry."
        meta={
          <Badge tone="purple" icon="shield_person">
            Role: {role.toUpperCase()}
          </Badge>
        }
      />

      <div className="space-y-6">
        {/* GitHub Connection Card */}
        <GitHubConnectionCard
          isConnectModalOpen={isConnectModalOpen}
          onOpenConnectModal={handleOpenConnectModal}
          onCloseConnectModal={handleCloseConnectModal}
        />

        {/* Model Provider Gateways & API Keys Card */}
        <ModelProviderKeysCard />
      </div>
    </Page>
  );
}
