import { z } from 'zod';
import { IsoSchema, RoleSchema } from './common';

/** Spec §10.2: the sandbox terminal is a WebSocket at `/runs/:id/terminal`, one JSON frame per message. */
export const TerminalLineSchema = z.object({
  id: z.number().int(),
  stream: z.enum(['stdout', 'stderr', 'system', 'command']),
  text: z.string(),
  at: IsoSchema,
});
export type TerminalLine = z.infer<typeof TerminalLineSchema>;

export const TerminalServerFrameSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('ready'),
    cwd: z.string(),
    branch: z.string(),
    /** Only Engineer and above may send input; everyone else watches. */
    canWrite: z.boolean(),
    requiredRole: RoleSchema,
    runActive: z.boolean(),
  }),
  z.object({ type: z.literal('line'), line: TerminalLineSchema }),
  z.object({
    type: z.literal('rejected'),
    code: z.enum(['command_not_allowed', 'forbidden', 'run_not_active']),
    rule: z.string().optional(),
    message: z.string(),
    requiredRole: RoleSchema.optional(),
  }),
  z.object({ type: z.literal('exit'), command: z.string(), code: z.number().int() }),
]);
export type TerminalServerFrame = z.infer<typeof TerminalServerFrameSchema>;

export const TerminalClientFrameSchema = z.object({ type: z.literal('input'), data: z.string().max(1000) });
export type TerminalClientFrame = z.infer<typeof TerminalClientFrameSchema>;
