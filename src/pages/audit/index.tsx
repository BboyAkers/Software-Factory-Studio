import { usePageTitle } from '../../app/usePageTitle';
import { Page, PageHeader } from '../../components/layout/Page';
import { EmptyState } from '../../components/ui';

export default function AuditPage() {
  usePageTitle('Audit Log');
  return (
    <Page>
      <PageHeader title="Audit Log" />
      <EmptyState icon="receipt_long" title="Audit Log is being built" description="This page is a placeholder until its feature module lands." />
    </Page>
  );
}
