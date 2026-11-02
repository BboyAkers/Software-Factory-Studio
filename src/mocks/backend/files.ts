import type { DiffFile, DiffLine, FileContent, Workpack, WorkpackDiff } from '../../contracts';
import { diffLines } from '../../domain/dsl';
import { conflict, notFound } from '../http';
import { generateFile, revealLines } from './codegen';
import { emit, nowIso, recordAudit } from './runtime';
import type { Actor, FileState, ProjectState } from './store';

/** Create the file states for a workpack from its target files the first time they are needed. */
export function ensureFiles(ps: ProjectState, wp: Workpack): FileState[] {
  let files = ps.files.get(wp.id);
  if (files) return files;
  files = wp.targetFiles
    .filter((p) => !p.includes('*'))
    .map((path): FileState => {
      const pair = generateFile(path);
      return { path, original: pair.original, modified: pair.original, final: pair.final, lockedBy: null, writing: false };
    });
  ps.files.set(wp.id, files);
  return files;
}

/** Convert a line diff into unified hunks with three lines of context. */
export function toDiffLines(original: string, modified: string, context = 3): DiffLine[] {
  const entries = diffLines(original, modified);
  const changed = entries.map((e, i) => (e.type === 'same' ? -1 : i)).filter((i) => i >= 0);
  if (changed.length === 0) {
    return entries.map((e) => ({ type: 'context', text: e.text, oldNumber: e.oldLine, newNumber: e.newLine }));
  }
  const keep = new Set<number>();
  for (const i of changed) for (let j = Math.max(0, i - context); j <= Math.min(entries.length - 1, i + context); j++) keep.add(j);

  const out: DiffLine[] = [];
  let previous = -2;
  for (const i of [...keep].sort((a, b) => a - b)) {
    const e = entries[i]!;
    if (i !== previous + 1) {
      const oldStart = e.oldLine ?? (entries.slice(i).find((x) => x.oldLine)?.oldLine ?? 1);
      const newStart = e.newLine ?? (entries.slice(i).find((x) => x.newLine)?.newLine ?? 1);
      out.push({ type: 'hunk', text: `@@ -${oldStart} +${newStart} @@`, oldNumber: null, newNumber: null });
    }
    out.push({
      type: e.type === 'add' ? 'added' : e.type === 'remove' ? 'removed' : 'context',
      text: e.text,
      oldNumber: e.oldLine,
      newNumber: e.newLine,
    });
    previous = i;
  }
  return out;
}

function stats(file: FileState): { additions: number; deletions: number } {
  const entries = diffLines(file.original, file.modified);
  return { additions: entries.filter((e) => e.type === 'add').length, deletions: entries.filter((e) => e.type === 'remove').length };
}

export function diffView(ps: ProjectState, wp: Workpack, path: string | null): WorkpackDiff {
  const files = ensureFiles(ps, wp);
  const list: DiffFile[] = files.map((f) => ({ path: f.path, ...stats(f), locked: f.lockedBy !== null, lockedBy: f.lockedBy, writing: f.writing }));
  const target = path ? files.find((f) => f.path === path) : (files.find((f) => f.writing) ?? files[0]);
  if (path && !target) throw notFound('File', path);
  return { files: list, file: target ? { path: target.path, lines: toDiffLines(target.original, target.modified) } : null };
}

export function fileContent(ps: ProjectState, wp: Workpack, path: string): FileContent {
  const file = ensureFiles(ps, wp).find((f) => f.path === path);
  if (!file) throw notFound('File', path);
  return { path, content: file.modified, locked: file.lockedBy !== null, lockedBy: file.lockedBy };
}

/** A human save through the editor, the only human write path (spec §7.3). Marks the workpack human-intervened. */
export function humanSave(ps: ProjectState, wp: Workpack, path: string, content: string, actor: Actor): void {
  const file = ensureFiles(ps, wp).find((f) => f.path === path);
  if (!file) throw notFound('File', path);
  if (file.lockedBy !== actor.name) {
    throw conflict('locked_by_other', file.lockedBy ? `${path} is locked by ${file.lockedBy}.` : `Lock ${path} before saving it.`);
  }
  file.modified = content;
  file.final = content;
  wp.humanIntervened = true;
  wp.version += 1;
  recordAudit(ps, actor, 'workpack.file_saved', { workpackId: wp.id, path, bytes: content.length });
  emit(ps, { type: 'workpack.progress', workpackId: wp.id, completeness: wp.completeness, linesAdded: wp.linesAdded, linesRemoved: wp.linesRemoved, attempt: wp.attempt });
}

/**
 * The agent writes more of each file as the run progresses. A file locked by a human is skipped and
 * a policy violation is reported once per file (spec §7.3).
 */
export function writeProgress(ps: ProjectState, wp: Workpack, fraction: number, runId: string, onViolation: (path: string) => void): void {
  const files = ensureFiles(ps, wp);
  if (files.length === 0) return;
  const perFile = 1 / files.length;
  let added = 0;
  let removed = 0;
  files.forEach((file, i) => {
    const local = Math.min(1, Math.max(0, (fraction - i * perFile) / perFile));
    file.writing = local > 0 && local < 1;
    if (file.lockedBy) {
      if (local > 0) onViolation(file.path);
    } else {
      file.modified = revealLines(file.original, file.final, local);
    }
    const s = stats(file);
    added += s.additions;
    removed += s.deletions;
  });
  wp.linesAdded = added;
  wp.linesRemoved = removed;
  wp.filesCount = files.length;
  const writing = files.find((f) => f.writing);
  wp.activeDiffStream = writing ? `${writing.path} (${stats(writing).additions} lines written)` : null;
  void runId;
  void nowIso;
}
