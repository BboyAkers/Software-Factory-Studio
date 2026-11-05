import { z } from 'zod';

export const GitHubWebhookResponseSchema = z.object({
  ok: z.boolean(),
  event: z.string(),
  action: z.string().optional(),
  message: z.string().optional(),
  issueNumber: z.number().optional(),
  outcome: z.string().optional(),
  epicId: z.string().nullable().optional(),
  steered: z.boolean().optional(),
  runId: z.string().optional(),
  workpackId: z.string().optional(),
  received: z.boolean().optional(),
});
export type GitHubWebhookResponse = z.infer<typeof GitHubWebhookResponseSchema>;

export const GitHubIssueWebhookPayloadSchema = z.object({
  action: z.string(),
  issue: z.object({
    number: z.number(),
    title: z.string(),
    body: z.string().nullable().optional(),
    state: z.string().optional(),
    html_url: z.string().optional(),
    labels: z.array(z.union([z.string(), z.object({ name: z.string() })])).optional(),
    user: z.object({ login: z.string() }).optional(),
    pull_request: z.record(z.string(), z.unknown()).optional(),
  }),
  repository: z.object({
    id: z.number().optional(),
    name: z.string().optional(),
    full_name: z.string(),
  }).optional(),
});
export type GitHubIssueWebhookPayload = z.infer<typeof GitHubIssueWebhookPayloadSchema>;

export const GitHubCommentWebhookPayloadSchema = z.object({
  action: z.string(),
  issue: z.object({
    number: z.number(),
    title: z.string().optional(),
    pull_request: z.record(z.string(), z.unknown()).optional(),
  }),
  comment: z.object({
    body: z.string(),
    user: z.object({ login: z.string() }).optional(),
  }),
  repository: z.object({
    full_name: z.string(),
  }).optional(),
});
export type GitHubCommentWebhookPayload = z.infer<typeof GitHubCommentWebhookPayloadSchema>;
