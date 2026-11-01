
export function getDefaultSandboxLogs(): string[] {
  return [
    '[kernel] Booted in 118ms via Firecracker v1.4.0',
    '[billing] Subscribed to stripe.webhook.subscription.updated',
    '[sandbox] HTTP 200 OK — Ledger proration balance verified ($3,840.00).',
    '[e2e] Playwright completed 48 viewport matrix permutations in 1.42s.'
  ];
}
