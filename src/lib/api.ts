import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { buildStoragePath, validateFile } from "./wallet";

export type Doc = Tables<"documents">;
export type DocFile = Tables<"document_files">;
export type Category = Tables<"categories">;
export type DocWithFiles = Doc & { document_files: DocFile[] };

export const BUCKET = "documents";
const SIGNED_TTL = 600; // seconds

async function uid(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Sessão expirada. Entre novamente.");
  return data.user.id;
}

export async function listDocuments(): Promise<DocWithFiles[]> {
  const { data, error } = await supabase
    .from("documents")
    .select("*, document_files(*)")
    .order("is_favorite", { ascending: false })
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((d) => ({
    ...d,
    document_files: [...d.document_files].sort((a, b) => a.position - b.position),
  }));
}

export async function getDocument(id: string): Promise<DocWithFiles | null> {
  const { data, error } = await supabase
    .from("documents")
    .select("*, document_files(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { ...data, document_files: [...data.document_files].sort((a, b) => a.position - b.position) };
}

export async function listCategories(): Promise<Category[]> {
  const { data, error } = await supabase.from("categories").select("*").order("name");
  if (error) throw error;
  return data ?? [];
}

export async function createCategory(name: string) {
  const { data, error } = await supabase.from("categories").insert({ name: name.trim() }).select().single();
  if (error) throw error.code === "23505" ? new Error("Essa categoria já existe.") : error;
  return data;
}
export async function renameCategory(id: string, name: string) {
  const { error } = await supabase.from("categories").update({ name: name.trim() }).eq("id", id);
  if (error) throw error;
}
export async function deleteCategory(id: string) {
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) throw error;
}

export type DocInput = Pick<
  Doc,
  "name" | "category_id" | "holder" | "number" | "expires_at" | "notes" | "tags" | "reminder_days"
>;

export async function createDocument(input: DocInput) {
  const { data, error } = await supabase.from("documents").insert(input).select().single();
  if (error) throw error;
  return data;
}

export async function updateDocument(id: string, patch: Partial<Doc>) {
  const { error } = await supabase.from("documents").update(patch).eq("id", id);
  if (error) throw error;
}

export async function uploadFile(
  documentId: string,
  file: File,
  side: DocFile["side"],
  position: number,
): Promise<DocFile> {
  const problem = validateFile(file);
  if (problem) throw new Error(`${file.name}: ${problem}`);
  const userId = await uid();
  const path = buildStoragePath(userId, documentId, file.type, crypto.randomUUID());
  const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) throw new Error(`Falha ao enviar ${file.name}: ${up.error.message}`);
  const { data, error } = await supabase
    .from("document_files")
    .insert({
      document_id: documentId,
      storage_path: path,
      mime_type: file.type,
      side,
      position,
      original_name: file.name,
      size_bytes: file.size,
    })
    .select()
    .single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw error;
  }
  return data;
}

export async function updateFile(id: string, patch: Partial<Pick<DocFile, "side" | "position">>) {
  const { error } = await supabase.from("document_files").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteFile(file: DocFile) {
  const rm = await supabase.storage.from(BUCKET).remove([file.storage_path]);
  if (rm.error) throw rm.error;
  const { error } = await supabase.from("document_files").delete().eq("id", file.id);
  if (error) throw error;
}

export async function deleteDocument(doc: DocWithFiles) {
  const paths = doc.document_files.map((f) => f.storage_path);
  if (paths.length) {
    const rm = await supabase.storage.from(BUCKET).remove(paths);
    if (rm.error) throw rm.error;
  }
  const { error } = await supabase.from("documents").delete().eq("id", doc.id);
  if (error) throw error;
}

/** Short-lived signed URLs; the bucket is private. */
export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, SIGNED_TTL);
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const r of data ?? []) if (r.path && r.signedUrl) out[r.path] = r.signedUrl;
  return out;
}

export async function downloadOriginal(file: DocFile) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(file.storage_path, 60, { download: file.original_name ?? true });
  if (error || !data) throw error ?? new Error("Falha ao gerar link.");
  const a = document.createElement("a");
  a.href = data.signedUrl;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function exportAll(): Promise<Blob> {
  const JSZip = (await import("jszip")).default;
  const [docs, cats] = await Promise.all([listDocuments(), listCategories()]);
  const zip = new JSZip();
  zip.file(
    "dados.json",
    JSON.stringify({ exportado_em: new Date().toISOString(), categorias: cats, documentos: docs }, null, 2),
  );
  for (const d of docs) {
    for (const f of d.document_files) {
      const { data, error } = await supabase.storage.from(BUCKET).download(f.storage_path);
      if (error || !data) throw new Error(`Falha ao baixar ${f.original_name ?? f.storage_path}`);
      const safe = d.name.replace(/[^\w\- ]+/g, "_");
      zip.file(`arquivos/${safe}-${d.id.slice(0, 8)}/${f.position}-${f.side}-${f.original_name ?? f.id}`, data);
    }
  }
  return zip.generateAsync({ type: "blob" });
}

/** Removes every file and record owned by the signed-in user. */
export async function deleteAllData() {
  const userId = await uid();
  const { data: files, error } = await supabase.from("document_files").select("storage_path");
  if (error) throw error;
  const paths = (files ?? []).map((f) => f.storage_path);
  for (let i = 0; i < paths.length; i += 100) {
    const rm = await supabase.storage.from(BUCKET).remove(paths.slice(i, i + 100));
    if (rm.error) throw rm.error;
  }
  const d1 = await supabase.from("documents").delete().eq("user_id", userId);
  if (d1.error) throw d1.error;
  const d2 = await supabase.from("categories").delete().eq("user_id", userId);
  if (d2.error) throw d2.error;
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return "Algo deu errado. Tente novamente.";
}
