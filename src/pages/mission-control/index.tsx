import { usePageTitle } from '../../app/usePageTitle';
import { Page, PageHeader } from '../../components/layout/Page';
import { EmptyState } from '../../components/ui';

export default function MissionControlPage() {
  usePageTitle('Mission Control');
  return (
    <Page>
      <PageHeader title="Mission Control" />
      <EmptyState icon="account_tree" title="Mission Control is being built" description="This page is a placeholder until its feature module lands." />
    </Page>
  );
}
