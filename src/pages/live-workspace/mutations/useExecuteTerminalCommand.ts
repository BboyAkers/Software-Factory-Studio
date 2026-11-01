export function useExecuteTerminalCommand(
  onAppendOutput: (lines: string[]) => void
) {
  const executeCommand = (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    onAppendOutput([`agent@synthetix:~$ ${trimmed}`]);

    setTimeout(() => {
      if (trimmed.startsWith('test') || trimmed.startsWith('npm test')) {
        onAppendOutput([
          '✓ session.test.ts (8 tests passed)',
          '✓ cas_lock.test.ts (6 tests passed)',
          'Test Files 2 passed (2)',
          'Tests 14 passed (14)',
          'Duration 390ms'
        ]);
      } else if (trimmed === 'git diff') {
        onAppendOutput([
          'diff --git a/src/auth/session_store.ts b/src/auth/session_store.ts',
          '+ import { TelemetrySpan } from "../telemetry";',
          '+ async acquire(key: string, ttlMs = 3000): Promise<boolean>'
        ]);
      } else {
        onAppendOutput([`[exec] '${trimmed}' completed with exit status 0.`]);
      }
    }, 150);
  };

  return { executeCommand };
}
