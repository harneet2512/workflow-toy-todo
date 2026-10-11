// The one place that decides what a todo title may be.
// normalizeTitle is pure: it never touches its input and returns a fresh value,
// either { title } (trimmed) or { error } (a message for a 400 body).
export const MAX_TITLE_LENGTH = 200;

const REQUIRED = 'title is required';
const TOO_LONG = `title must be ${MAX_TITLE_LENGTH} characters or fewer`;

export function normalizeTitle(raw) {
  if (typeof raw !== 'string') return { error: REQUIRED };
  const title = raw.trim();
  if (title === '') return { error: REQUIRED };
  // Count code points, not UTF-16 units, so an emoji is one character.
  if ([...title].length > MAX_TITLE_LENGTH) return { error: TOO_LONG };
  return { title };
}
