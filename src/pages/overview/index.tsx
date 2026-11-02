import { usePageTitle } from '../../app/usePageTitle';
import { Page, PageHeader } from '../../components/layout/Page';
import { EmptyState } from '../../components/ui';

export default function OverviewPage() {
  usePageTitle('Overview');
  return (
    <Page>
      <PageHeader title="Overview" />
      <EmptyState icon="grid_view" title="Overview is being built" description="This page is a placeholder until its feature module lands." />
    </Page>
  );
}
