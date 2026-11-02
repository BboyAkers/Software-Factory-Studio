import { usePageTitle } from '../../app/usePageTitle';
import { Page, PageHeader } from '../../components/layout/Page';
import { EmptyState } from '../../components/ui';

export default function QualitySandboxesPage() {
  usePageTitle('Quality & Sandboxes');
  return (
    <Page>
      <PageHeader title="Quality & Sandboxes" />
      <EmptyState icon="verified_user" title="Quality & Sandboxes is being built" description="This page is a placeholder until its feature module lands." />
    </Page>
  );
}
