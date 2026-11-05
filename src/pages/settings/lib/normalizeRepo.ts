const GITHUB_URL = /^(?:(?:https?:\/\/)?(?:www\.)?github\.com\/|git@github\.com:)([^/\s]+)\/([^/\s?#]+)/i;

/**
 * Normalizes input to `<owner>/<repo>`. Accepts full HTTPS URLs, SSH URLs,
 * or raw `owner/repo` strings, stripping trailing `.git`.
 */
export function normalizeRepo(input: string): string {
  const text = input.trim();
  const url = GITHUB_URL.exec(text);
  return (url ? `${url[1]}/${url[2]}` : text).replace(/\.git$/i, '');
}
