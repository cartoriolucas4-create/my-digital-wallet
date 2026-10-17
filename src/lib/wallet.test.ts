import { describe, expect, it } from "vitest";
import {
  buildStoragePath,
  daysUntil,
  expiryStatus,
  filterDocuments,
  parseTags,
  validateFile,
  MAX_FILE_BYTES,
} from "./wallet";

const today = new Date(2026, 9, 17); // 17 Oct 2026

describe("expiry", () => {
  it("counts calendar days", () => {
    expect(daysUntil("2026-10-27", today)).toBe(10);
    expect(daysUntil("2026-10-16", today)).toBe(-1);
  });
  it("past date is expired", () => {
    expect(expiryStatus("2026-10-16", 30, today)).toBe("expired");
  });
  it("expiring today is soon, not expired", () => {
    expect(expiryStatus("2026-10-17", 30, today)).toBe("soon");
  });
  it("inside reminder window is soon, outside is valid", () => {
    expect(expiryStatus("2026-11-16", 30, today)).toBe("soon");
    expect(expiryStatus("2026-11-17", 30, today)).toBe("valid");
  });
  it("no date means none", () => {
    expect(expiryStatus(null, 30, today)).toBe("none");
  });
});

describe("files", () => {
  it("rejects unsupported types and files over 20MB", () => {
    expect(validateFile({ type: "text/plain", size: 10 })).not.toBeNull();
    expect(validateFile({ type: "image/png", size: MAX_FILE_BYTES + 1 })).not.toBeNull();
    expect(validateFile({ type: "application/pdf", size: 1000 })).toBeNull();
  });
  it("storage path starts with the user id", () => {
    expect(buildStoragePath("u1", "d1", "image/jpeg", "x")).toBe("u1/d1/x.jpg");
  });
});

describe("tags", () => {
  it("normalizes and dedupes", () => {
    expect(parseTags(" Viagem, viagem ,Saúde,, ")).toEqual(["viagem", "saúde"]);
  });
});

describe("filters", () => {
  const base = {
    holder: null, number: null, notes: null, tags: [] as string[], category_id: null,
    is_favorite: false, is_archived: false, expires_at: null, reminder_days: 30,
  };
  const docs = [
    { ...base, name: "RG" },
    { ...base, name: "Passaporte", is_favorite: true, tags: ["viagem"] },
    { ...base, name: "Antigo", is_archived: true },
  ];
  it("hides archived from the main list and shows only them in archived view", () => {
    expect(filterDocuments(docs, {}).map((d) => d.name)).toEqual(["RG", "Passaporte"]);
    expect(filterDocuments(docs, { view: "archived" }).map((d) => d.name)).toEqual(["Antigo"]);
  });
  it("searches tags and filters favorites", () => {
    expect(filterDocuments(docs, { query: "viag" }).map((d) => d.name)).toEqual(["Passaporte"]);
    expect(filterDocuments(docs, { view: "favorites" }).map((d) => d.name)).toEqual(["Passaporte"]);
  });
});
