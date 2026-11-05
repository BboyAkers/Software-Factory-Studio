import { useState } from 'react';
import { Badge, Button, Icon, Input } from '../../../../components/ui';

const ACTIVE_WEBHOOK_SUBSCRIPTIONS = (
  <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-on-surface-muted">
    <span className="font-medium text-on-surface-variant">Active Subscriptions:</span>
    <span className="rounded bg-white/5 px-2 py-0.5 font-mono text-white">issues (Intake)</span>
    <span className="rounded bg-white/5 px-2 py-0.5 font-mono text-white">issue_comment (@factory steer)</span>
    <span className="rounded bg-white/5 px-2 py-0.5 font-mono text-white">pull_request (Merge)</span>
    <span className="rounded bg-white/5 px-2 py-0.5 font-mono text-white">ping (Health)</span>
  </div>
);

interface GitHubWebhookSectionProps {
  repoFullName: string;
  webhookActive: boolean;
  isOffline: boolean;
  onWebhookVerified: () => Promise<void>;
}

export function GitHubWebhookSection({
  repoFullName,
  webhookActive,
  isOffline,
  onWebhookVerified,
}: GitHubWebhookSectionProps) {
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [webhookTestMessage, setWebhookTestMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const webhookUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/api/v1/webhooks/github`;

  const handleCopyWebhook = () => {
    try {
      void navigator.clipboard?.writeText(webhookUrl);
      setCopiedWebhook(true);
      setTimeout(() => setCopiedWebhook(false), 2000);
    } catch {
      // clipboard unavailable
    }
  };

  const handleTestWebhook = async () => {
    if (isOffline) return;
    setTestingWebhook(true);
    setWebhookTestMessage(null);
    try {
      const res = await fetch('/api/v1/webhooks/github', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'ping',
        },
        body: JSON.stringify({
          zen: 'Approachable is better than simple.',
          hook_id: 1099234,
          repository: {
            full_name: repoFullName,
          },
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setWebhookTestMessage({ ok: true, text: 'Webhook verified! Ping event acknowledged.' });
        await onWebhookVerified();
      } else {
        setWebhookTestMessage({ ok: false, text: data.message || 'Verification failed.' });
      }
    } catch {
      setWebhookTestMessage({ ok: false, text: 'Failed to reach webhook endpoint.' });
    } finally {
      setTestingWebhook(false);
    }
  };

  return (
    <div className="rounded-lg border border-fluent-border bg-white/[0.02] p-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-fluent-border pb-3">
        <div>
          <h4 className="text-[13px] font-semibold text-white flex items-center gap-2">
            <Icon name="webhook" size={16} className="text-fluent-blue-light" />
            GitHub Webhook Endpoint
          </h4>
          <p className="text-[12px] text-on-surface-variant">
            Software Factory Studio receives GitHub events (<code className="font-mono text-white">issues</code>, <code className="font-mono text-white">issue_comment</code>, <code className="font-mono text-white">pull_request</code>, <code className="font-mono text-white">ping</code>) at this endpoint.
          </p>
        </div>
        <Badge tone={webhookActive ? 'success' : 'warning'} icon={webhookActive ? 'check_circle' : 'pending'}>
          {webhookActive ? 'Active & Receiving' : 'Pending Verification'}
        </Badge>
      </div>

      <div className="space-y-2.5">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="flex-1">
            <Input
              readOnly
              value={webhookUrl}
              aria-label="GitHub Webhook URL"
              className="font-mono text-[12px] bg-black/40 border-white/10 text-white"
            />
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon={copiedWebhook ? 'check' : 'content_copy'}
            onClick={handleCopyWebhook}
          >
            {copiedWebhook ? 'Copied' : 'Copy URL'}
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon="sensors"
            loading={testingWebhook}
            onClick={() => void handleTestWebhook()}
            disabled={isOffline}
          >
            Send Test Ping
          </Button>
        </div>

        {webhookTestMessage ? (
          <div
            className={`text-[12px] flex items-center gap-1.5 p-2 rounded ${
              webhookTestMessage.ok
                ? 'bg-fluent-success/10 text-fluent-success border border-fluent-success/20'
                : 'bg-fluent-error/10 text-fluent-error border border-fluent-error/20'
            }`}
          >
            <Icon name={webhookTestMessage.ok ? 'check_circle' : 'error'} size={15} />
            <span>{webhookTestMessage.text}</span>
          </div>
        ) : null}

        {ACTIVE_WEBHOOK_SUBSCRIPTIONS}
      </div>
    </div>
  );
}

