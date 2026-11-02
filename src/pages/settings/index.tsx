import { usePageTitle } from '../../app/usePageTitle';
import { Page, PageHeader } from '../../components/layout/Page';
import { EmptyState } from '../../components/ui';

export default function SettingsPage() {
  usePageTitle('Settings');
  return (
    <Page>
      <PageHeader title="Settings" />
      <EmptyState icon="settings" title="Settings is being built" description="This page is a placeholder until its feature module lands." />
    </Page>
  );
}
