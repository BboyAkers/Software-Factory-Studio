import { usePageTitle } from '../../app/usePageTitle';
import { Page, PageHeader } from '../../components/layout/Page';
import { EmptyState } from '../../components/ui';

export default function SpecStudioPage() {
  usePageTitle('Spec Studio');
  return (
    <Page>
      <PageHeader title="Spec Studio" />
      <EmptyState icon="edit_note" title="Spec Studio is being built" description="This page is a placeholder until its feature module lands." />
    </Page>
  );
}
