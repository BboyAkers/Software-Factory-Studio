import { z } from 'zod';
import { IsoSchema } from './common';

export const AuditEntrySchema = z.object({
  id: z.string(),
  projectId: z.string(),
  actor: z.string(),
  actorType: z.enum(['user', 'agent', 'system']),
  actorName: z.string(),
  action: z.string(),
  target: z.record(z.string(), z.unknown()),
  prevHash: z.string(),
  hash: z.string(),
  createdAt: IsoSchema,
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;

export const VerifyResultSchema = z.object({
  ok: z.boolean(),
  checked: z.number().int(),
  brokenAtId: z.string().nullable(),
  reason: z.string().nullable(),
});
export type VerifyResult = z.infer<typeof VerifyResultSchema>;
