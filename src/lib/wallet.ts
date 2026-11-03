// Pure wallet rules — no I/O, fully unit-tested.

export type ExpiryStatus = "none" | "expired" | "soon" | "valid";

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const ACCEPTED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
] as const;
export const ACCEPT_ATTR = ACCEPTED_MIME.join(",");

/** Parses a YYYY-MM-DD date as a local calendar day. */
function parseDay(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function daysUntil(dateStr: string, today: Date = new Date()): number | null {
  const d = parseDay(dateStr);
  if (!d) return null;
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((d.getTime() - t.getTime()) / 86_400_000);
}

/** Expired if the date has passed; "soon" when within reminderDays (inclusive). */
export function expiryStatus(
  expiresAt: string | null | undefined,
  reminderDays: number,
  today: Date = new Date(),
): ExpiryStatus {
  if (!expiresAt) return "none";
  const d = daysUntil(expiresAt, today);
  if (d === null) return "none";
  if (d < 0) return "expired";
  if (d <= reminderDays) return "soon";
  return "valid";
}

export function validateFile(f: { type: string; size: number }): string | null {
  if (!(ACCEPTED_MIME as readonly string[]).includes(f.type)) {
    return "Formato não suportado. Use JPG, PNG, WEBP, HEIC ou PDF.";
  }
  if (f.size <= 0) return "Arquivo vazio.";
  if (f.size > MAX_FILE_BYTES) return "Arquivo maior que 20 MB.";
  return null;
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
};

/** First path segment must be the user id — storage policies depend on it. */
export function buildStoragePath(userId: string, documentId: string, mime: string, id: string) {
  return `${userId}/${documentId}/${id}.${EXT[mime] ?? "bin"}`;
}

export function parseTags(input: string): string[] {
  const out: string[] = [];
  for (const raw of input.split(",")) {
    const t = raw.trim().toLowerCase().slice(0, 30);
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= 20) break;
  }
  return out;
}

export type View = "all" | "favorites" | "archived";

export interface FilterableDoc {
  name: string;
  holder: string | null;
  number: string | null;
  notes: string | null;
  tags: string[];
  category_id: string | null;
  is_favorite: boolean;
  is_archived: boolean;
  expires_at: string | null;
  reminder_days: number;
}

export interface Filters {
  query?: string;
  categoryId?: string | null;
  tag?: string | null;
  view?: View;
  expiry?: ExpiryStatus | null;
}

export function filterDocuments<T extends FilterableDoc>(docs: T[], f: Filters, today = new Date()): T[] {
  const q = (f.query ?? "").trim().toLowerCase();
  const view = f.view ?? "all";
  return docs.filter((d) => {
    if (view === "archived" ? !d.is_archived : d.is_archived) return false;
    if (view === "favorites" && !d.is_favorite) return false;
    if (f.categoryId && d.category_id !== f.categoryId) return false;
    if (f.tag && !d.tags.includes(f.tag)) return false;
    if (f.expiry && expiryStatus(d.expires_at, d.reminder_days, today) !== f.expiry) return false;
    if (q) {
      const hay = [d.name, d.holder, d.number, d.notes, ...d.tags].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function toneFor(key: string | null | undefined): string {
  const tones = ["tone-1", "tone-2", "tone-3", "tone-4", "tone-5"];
  if (!key) return tones[4] ?? "tone-5";
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return tones[h % tones.length] ?? "tone-5";
}

export function maskNumber(n: string): string {
  if (n.length <= 4) return "••••";
  return "•••• " + n.slice(-4);
}

export function formatDate(s: string | null): string {
  const d = s ? parseDay(s) : null;
  return d ? d.toLocaleDateString("pt-BR") : "—";
}
