import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;
export type LeadStatus = "found" | "analyzed" | "authorized" | "contacted" | "interested" | "demo" | "subscriber" | "not_interested" | "invalid" | "do_not_contact";
export type ConsentStatus = "unknown" | "authorized" | "denied";
export type Lead = {
  id: string; name: string; phone: string | null; normalized_phone: string | null; address: string | null;
  city: string | null; state: string | null; website: string | null; instagram: string | null;
  contact_name: string | null; source: string; source_id: string | null; source_url: string | null;
  status: LeadStatus; consent_status: ConsentStatus; notes: string | null; tags: string[];
  last_contacted_at: string | null; next_follow_up_at: string | null; created_at: string; updated_at: string;
};
export type MessageTemplate = { id: string; name: string; content: string; is_first_contact: boolean; created_at: string };
export type Campaign = { id: string; name: string; description: string | null; status: "draft" | "active" | "paused" | "completed"; created_at: string };
export type MediaAsset = { id: string; name: string; storage_path: string; mime_type: string; size_bytes: number; created_at: string };
export type LeadMessage = { id: string; lead_id: string; direction: "inbound" | "outbound"; body: string; status: "draft" | "opened" | "sent" | "replied" | "failed"; created_at: string; leads?: { name: string } };

export function normalizePhone(value: string) {
  let digits = value.replace(/\\D/g, "");
  if (digits.length >= 10 && !digits.startsWith("55")) digits = `55${digits}`;
  return digits;
}

export async function listLeads(): Promise<Lead[]> {
  const { data, error } = await db.from("leads").select("*").order("created_at", { ascending: false }).limit(1000);
  if (error) throw error;
  return data ?? [];
}
export async function createLead(input: Partial<Lead> & { name: string }) {
  const phone = input.phone?.trim() || null;
  const { data, error } = await db.from("leads").insert({
    ...input, phone, normalized_phone: phone ? normalizePhone(phone) : null,
    source: input.source ?? "manual", status: input.status ?? "found", consent_status: input.consent_status ?? "unknown",
  }).select().single();
  if (error) throw error;
  await logLeadEvent(data.id, "lead_created", "Lead cadastrado manualmente");
  return data as Lead;
}
export async function updateLead(id: string, patch: Partial<Lead>) {
  const next = { ...patch } as Record<string, unknown>;
  if ("phone" in patch) next.normalized_phone = patch.phone ? normalizePhone(patch.phone) : null;
  const { data, error } = await db.from("leads").update(next).eq("id", id).select().single();
  if (error) throw error;
  return data as Lead;
}
export async function deleteLead(id: string) {
  const { error } = await db.from("leads").delete().eq("id", id);
  if (error) throw error;
}
export async function logLeadEvent(leadId: string, eventType: string, description: string, metadata = {}) {
  const { error } = await db.from("lead_events").insert({ lead_id: leadId, event_type: eventType, description, metadata });
  if (error) throw error;
}
export async function listLeadEvents(leadId: string) {
  const { data, error } = await db.from("lead_events").select("*").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(50);
  if (error) throw error;
  return data ?? [];
}
export async function listTemplates(): Promise<MessageTemplate[]> {
  const { data, error } = await db.from("message_templates").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
export async function saveTemplate(input: { id?: string; name: string; content: string; is_first_contact?: boolean }) {
  const payload = { name: input.name.trim(), content: input.content.trim(), is_first_contact: !!input.is_first_contact };
  const query = input.id ? db.from("message_templates").update(payload).eq("id", input.id) : db.from("message_templates").insert(payload);
  const { data, error } = await query.select().single();
  if (error) throw error;
  return data as MessageTemplate;
}
export async function deleteTemplate(id: string) {
  const { error } = await db.from("message_templates").delete().eq("id", id);
  if (error) throw error;
}
export async function listCampaigns(): Promise<Campaign[]> {
  const { data, error } = await db.from("campaigns").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
export async function createCampaign(name: string, description: string) {
  const { data, error } = await db.from("campaigns").insert({ name: name.trim(), description: description.trim() || null }).select().single();
  if (error) throw error;
  return data as Campaign;
}
export async function updateCampaign(id: string, patch: Partial<Campaign>) {
  const { error } = await db.from("campaigns").update(patch).eq("id", id);
  if (error) throw error;
}
export async function listMessages(): Promise<LeadMessage[]> {
  const { data, error } = await db.from("lead_messages").select("*, leads(name)").order("created_at", { ascending: false }).limit(200);
  if (error) throw error;
  return data ?? [];
}
export async function logMessage(input: { lead_id: string; body: string; status: LeadMessage["status"]; direction?: LeadMessage["direction"]; template_id?: string | null }) {
  const { data, error } = await db.from("lead_messages").insert({ ...input, direction: input.direction ?? "outbound" }).select().single();
  if (error) throw error;
  return data;
}
export async function updateMessageStatus(id: string, status: LeadMessage["status"], leadId: string) {
  const { error } = await db.from("lead_messages").update({ status }).eq("id", id);
  if (error) throw error;
  if (status === "sent") await db.from("leads").update({ status: "contacted", last_contacted_at: new Date().toISOString() }).eq("id", leadId);
  if (status === "replied") await db.from("leads").update({ status: "interested" }).eq("id", leadId);
}
export async function listMedia(): Promise<MediaAsset[]> {
  const { data, error } = await db.from("media_assets").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
export async function uploadMedia(file: File) {
  const allowed = ["image/jpeg", "image/png", "image/webp", "audio/mpeg", "audio/mp4", "audio/ogg", "video/mp4", "video/webm"];
  if (!allowed.includes(file.type)) throw new Error("Formato não suportado. Use imagem, áudio MP3/MP4/OGG ou vídeo MP4/WEBM.");
  if (file.size > 50 * 1024 * 1024) throw new Error("O arquivo excede 50 MB.");
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error("Sessão expirada.");
  const ext = file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "") || "bin";
  const path = `${auth.user.id}/${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await db.storage.from("prospect-media").upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) throw uploadError;
  const { data, error } = await db.from("media_assets").insert({ name: file.name, storage_path: path, mime_type: file.type, size_bytes: file.size }).select().single();
  if (error) { await db.storage.from("prospect-media").remove([path]); throw error; }
  return data as MediaAsset;
}
export async function deleteMedia(asset: MediaAsset) {
  const { error: storageError } = await db.storage.from("prospect-media").remove([asset.storage_path]);
  if (storageError) throw storageError;
  const { error } = await db.from("media_assets").delete().eq("id", asset.id);
  if (error) throw error;
}
export async function mediaSignedUrl(path: string) {
  const { data, error } = await db.storage.from("prospect-media").createSignedUrl(path, 600);
  if (error) throw error;
  return data.signedUrl;
}
export function personalizeMessage(template: string, lead: Lead) {
  return template
    .replace(/\\{nome\\}/gi, lead.contact_name || "tudo bem")
    .replace(/\\{barbearia\\}/gi, lead.name)
    .replace(/\\{cidade\\}/gi, lead.city || "")
    .replace(/\\{estado\\}/gi, lead.state || "");
}
export function downloadLeadsCsv(leads: Lead[]) {
  const columns: (keyof Lead)[] = ["name","phone","address","city","state","website","instagram","status","consent_status","source","notes"];
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g,'""')}"`;
  const csv = [columns.join(";"), ...leads.map((lead) => columns.map((column) => escape(lead[column])).join(";"))].join("\\r\\n");
  const blob = new Blob(["\\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "cozy-prospect-leads.csv"; a.click(); URL.revokeObjectURL(url);
}
