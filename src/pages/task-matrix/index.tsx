import { usePageTitle } from '../../app/usePageTitle';
import { Page, PageHeader } from '../../components/layout/Page';
import { EmptyState } from '../../components/ui';

export default function TaskMatrixPage() {
  usePageTitle('Task Matrix');
  return (
    <Page>
      <PageHeader title="Task Matrix" />
      <EmptyState icon="view_kanban" title="Task Matrix is being built" description="This page is a placeholder until its feature module lands." />
    </Page>
  );
}
