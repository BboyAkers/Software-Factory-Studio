import { usePageTitle } from '../../app/usePageTitle';
import { Page, PageHeader } from '../../components/layout/Page';
import { EmptyState } from '../../components/ui';

export default function FleetTuningPage() {
  usePageTitle('Fleet & Tuning');
  return (
    <Page>
      <PageHeader title="Fleet & Tuning" />
      <EmptyState icon="tune" title="Fleet & Tuning is being built" description="This page is a placeholder until its feature module lands." />
    </Page>
  );
}
