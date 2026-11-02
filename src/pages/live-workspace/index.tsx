import { usePageTitle } from '../../app/usePageTitle';
import { Page, PageHeader } from '../../components/layout/Page';
import { EmptyState } from '../../components/ui';

export default function LiveWorkspacePage() {
  usePageTitle('Live Workspace');
  return (
    <Page>
      <PageHeader title="Live Workspace" />
      <EmptyState icon="terminal" title="Live Workspace is being built" description="This page is a placeholder until its feature module lands." />
    </Page>
  );
}
