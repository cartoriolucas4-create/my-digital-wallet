import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Activity, BarChart3, Building2, Check, ChevronDown, ChevronLeft, ChevronRight, Clipboard,
  Download, ExternalLink, LayoutDashboard, MapPin, MessageSquare, Phone, Plus, Search,
  Send, Settings, ShieldAlert, Users, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { searchBarbershops } from "@/lib/prospect.functions";

export const Route = createFileRoute("/_authenticated/prospect")({
  head: () => ({ meta: [{ title: "COZY PROSPECT — Prospecção inteligente" }] }),
  component: Prospect,
});

type Lead = {
  id:string; name:string; phone:string|null; normalized_phone:string|null; address:string|null;
  city:string|null; state:string|null; website:string|null; instagram:string|null; source:string;
  source_id:string|null; source_url:string|null; status:string; notes:string|null; created_at:string;
};
type Template = {id:string;name:string;content:string;is_active?:boolean;is_first_contact:boolean;created_at:string};
type SearchRow = {id:string;city:string;state:string|null;found_count:number;inserted_count:number;duplicate_count:number;created_at:string};
type Section = "dashboard"|"search"|"leads"|"queue"|"messages"|"cities"|"reports"|"settings";

const db = supabase as any;
const nav: {id:Section;label:string;icon:typeof LayoutDashboard}[] = [
  {id:"dashboard",label:"Visão geral",icon:LayoutDashboard},{id:"search",label:"Prospectar",icon:Search},
  {id:"leads",label:"Leads",icon:Users},{id:"queue",label:"Central de envio",icon:Send},
  {id:"messages",label:"Mensagens",icon:MessageSquare},{id:"cities",label:"Cidades pesquisadas",icon:MapPin},
  {id:"reports",label:"Relatórios",icon:BarChart3},{id:"settings",label:"Configurações",icon:Settings},
];
const defaults = [
  {name:"Apresentação 1",content:"Olá! Tudo bem? Conheci a {nome_barbearia}, em {cidade}, e gostaria de compartilhar uma ideia para facilitar os agendamentos e a gestão da barbearia. Posso explicar rapidamente?"},
  {name:"Apresentação 2",content:"Oi! Tudo certo? Tenho uma solução para ajudar a {nome_barbearia}, em {cidade}, a organizar clientes, agendamentos e financeiro. Posso mostrar como funciona?"},
  {name:"Apresentação 3",content:"Olá! Desenvolvi uma solução voltada para barbearias e acredito que pode ser interessante para a {nome_barbearia}, em {cidade}. Posso apresentar?"},
];

function phoneDigits(value:string){return value.replace(/\D/g,"");}
function personalize(text:string,lead:Lead){
  return text.replace(/\{nome_barbearia\}/gi,lead.name||"sua barbearia")
    .replace(/\{cidade\}/gi,lead.city||"sua cidade")
    .replace(/\{estado\}/gi,lead.state||"");
}
function Card({children,className=""}:{children:ReactNode;className?:string}) {
  return <section className={`rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-lg shadow-black/10 ${className}`}>{children}</section>;
}
function Prospect(){
  const searchFn=useServerFn(searchBarbershops);
  const [section,setSection]=useState<Section>("dashboard");
  const [leads,setLeads]=useState<Lead[]>([]);
  const [templates,setTemplates]=useState<Template[]>([]);
  const [searches,setSearches]=useState<SearchRow[]>([]);
  const [messages,setMessages]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [city,setCity]=useState("");
  const [state,setState]=useState("PE");
  const [limit,setLimit]=useState("30");
  const [query,setQuery]=useState("");
  const [filter,setFilter]=useState("all");
  const [templateName,setTemplateName]=useState("");
  const [templateText,setTemplateText]=useState("");
  const [editing,setEditing]=useState<string|null>(null);
  const [activeLead,setActiveLead]=useState(0);
  const [messageDraft,setMessageDraft]=useState("");

  async function refresh(){
    setLoading(true);
    try{
      const [l,t,s,m]=await Promise.all([
        db.from("leads").select("*").order("created_at",{ascending:false}).limit(2000),
        db.from("message_templates").select("*").order("created_at",{ascending:true}),
        db.from("prospect_searches").select("*").order("created_at",{ascending:false}).limit(200),
        db.from("lead_messages").select("*,leads(name)").order("created_at",{ascending:false}).limit(500),
      ]);
      for(const result of [l,t,s,m]) if(result.error) throw result.error;
      setLeads(l.data??[]);setTemplates(t.data??[]);setSearches(s.data??[]);setMessages(m.data??[]);
    }catch(e:any){toast.error(e.message||"Não foi possível carregar os dados.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{void refresh();},[]);
  const eligible=useMemo(()=>leads.filter(x=>x.phone&&phoneDigits(x.phone).length>=10&&x.status!=="do_not_contact"&&x.status!=="not_interested"),[leads]);
  const visible=useMemo(()=>leads.filter(x=>(filter==="all"||x.status===filter)&&[x.name,x.city,x.phone,x.address].some(v=>(v??"").toLowerCase().includes(query.toLowerCase()))),[leads,filter,query]);
  const stats=useMemo(()=>({
    total:leads.length,new:leads.filter(x=>x.status==="found").length,withPhone:leads.filter(x=>x.phone&&phoneDigits(x.phone).length>=10).length,
    contacted:leads.filter(x=>["contacted","interested","demo","subscriber"].includes(x.status)).length,
    interested:leads.filter(x=>["interested","demo","subscriber"].includes(x.status)).length,
    blocked:leads.filter(x=>x.status==="do_not_contact").length,
  }),[leads]);
  const current=eligible[Math.min(activeLead,Math.max(0,eligible.length-1))]??null;
  const assignedTemplate=useMemo(()=>current?templates.filter(t=>t.is_active!==false)[eligible.findIndex(l=>l.id===current.id)%Math.max(1,templates.filter(t=>t.is_active!==false).length)]:null,[current,eligible,templates]);
  const preview=current?personalize(messageDraft||assignedTemplate?.content||"",current):"";

  async function search(){
    if(!city.trim()){toast.error("Informe a cidade.");return;}
    setBusy(true);
    try{
      const result=await searchFn({data:{city:city.trim(),state:state.trim(),limit:Number(limit)}});
      const {error}=await db.from("prospect_searches").insert({city:result.city,state:result.state||null,source:"openstreetmap",found_count:result.found,inserted_count:result.inserted,duplicate_count:result.duplicates});
      if(error) throw error;
      toast.success(`Pesquisa concluída: ${result.inserted} novos, ${result.duplicates} repetidos.`);
      await refresh();setSection("leads");
    }catch(e:any){toast.error(e.message||"Falha na pesquisa.");}
    finally{setBusy(false);}
  }
  async function saveTemplate(){
    if(!templateName.trim()||!templateText.trim()){toast.error("Preencha nome e mensagem.");return;}
    const active=templates.filter(t=>t.is_active!==false).length;
    if(!editing&&active>=30){toast.error("Limite de 30 modelos ativos.");return;}
    const payload={name:templateName.trim(),content:templateText.trim(),is_first_contact:true,is_active:true};
    const result=editing?await db.from("message_templates").update(payload).eq("id",editing):await db.from("message_templates").insert(payload);
    if(result.error){toast.error(result.error.message);return;}
    setEditing(null);setTemplateName("");setTemplateText("");await refresh();toast.success("Modelo salvo.");
  }
  async function toggleTemplate(t:Template){
    if(t.is_active===false&&templates.filter(x=>x.is_active!==false).length>=30){toast.error("Limite de 30 modelos ativos.");return;}
    if(t.is_active!==false&&templates.filter(x=>x.is_active!==false).length<=3){toast.error("Mantenha pelo menos 3 modelos ativos.");return;}
    const {error}=await db.from("message_templates").update({is_active:t.is_active===false}).eq("id",t.id);
    if(error)toast.error(error.message);else await refresh();
  }
  async function removeTemplate(t:Template){
    if(templates.filter(x=>x.is_active!==false).length<=3&&t.is_active!==false){toast.error("Mantenha pelo menos 3 modelos ativos.");return;}
    const {error}=await db.from("message_templates").delete().eq("id",t.id);
    if(error)toast.error(error.message);else{await refresh();toast.success("Modelo removido.");}
  }
  async function logEvent(lead:Lead,event_type:string,details:Record<string,unknown>={}){
    const {error}=await db.from("contact_history").insert({lead_id:lead.id,event_type,details});
    if(error)toast.error(error.message);
  }
  async function openWhatsApp(){
    if(!current)return;
    const digits=phoneDigits(current.phone||"");
    if(digits.length<10){toast.error("Telefone inválido.");return;}
    if(current.status==="do_not_contact"||current.status==="not_interested"){toast.error("Este contato está bloqueado para novas mensagens.");return;}
    const text=personalize(messageDraft||assignedTemplate?.content||"",current);
    if(!text.trim()){toast.error("Selecione ou escreva uma mensagem.");return;}
    const popup=window.open(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`,"_blank","noopener,noreferrer");
    if(!popup){toast.error("O navegador bloqueou a nova aba. Permita pop-ups e tente novamente.");return;}
    const {error}=await db.from("lead_messages").insert({lead_id:current.id,template_id:assignedTemplate?.id??null,body:text,status:"opened",direction:"outbound"});
    if(error){popup.close();toast.error(error.message);return;}
    await logEvent(current,"whatsapp_opened",{template_id:assignedTemplate?.id??null});
    toast.success("Conversa aberta. Confirme o envio no WhatsApp e depois registre aqui.");
    await refresh();
  }
  async function confirmSent(){
    if(!current)return;
    const {data,error}=await db.from("lead_messages").select("id").eq("lead_id",current.id).eq("status","opened").order("created_at",{ascending:false}).limit(1).maybeSingle();
    if(error||!data){toast.error("Abra a conversa antes de confirmar o envio.");return;}
    const upd=await db.from("lead_messages").update({status:"sent"}).eq("id",data.id);
    if(upd.error){toast.error(upd.error.message);return;}
    await db.from("leads").update({status:"contacted",last_contacted_at:new Date().toISOString()}).eq("id",current.id);
    await logEvent(current,"message_sent_confirmed",{confirmed_manually:true});
    await refresh();setActiveLead(i=>Math.min(i+1,eligible.length-1));toast.success("Envio registrado manualmente.");
  }
  async function skip(){
    if(!current)return;await logEvent(current,"lead_skipped");setActiveLead(i=>Math.min(i+1,eligible.length-1));
  }
  async function blockLead(lead:Lead){
    const {error}=await db.from("leads").update({status:"do_not_contact"}).eq("id",lead.id);
    if(error){toast.error(error.message);return;}
    await db.from("contact_history").insert({lead_id:lead.id,event_type:"do_not_contact",details:{reason:"Bloqueio manual"}});
    await refresh();toast.success("Lead bloqueado para novos contatos.");
  }
  async function addManualLead(){
    const name=prompt("Nome da barbearia");if(!name?.trim())return;
    const phone=prompt("Telefone (opcional)")||null;
    const {error}=await db.from("leads").insert({name:name.trim(),phone,normalized_phone:phone?phoneDigits(phone):null,source:"manual",status:"found"});
    if(error)toast.error(error.message);else{await refresh();toast.success("Lead cadastrado.");}
  }
  function exportCsv(){
    const cols=["name","phone","address","city","state","website","instagram","status","source"];
    const csv=[cols.join(";"),...visible.map(l=>cols.map(k=>`"${String((l as any)[k]??"").replace(/"/g,'""')}"`).join(";"))].join("\r\n");
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["\\ufeff",csv],{type:"text/csv;charset=utf-8"}));a.download="cozy-prospect-leads.csv";a.click();URL.revokeObjectURL(a.href);
  }

  return <div className="min-h-screen bg-[#0b1220] text-slate-100">
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-white/10 bg-[#0e1929] p-5 lg:flex lg:flex-col">
      <div className="mb-9 flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-emerald-400 text-lg font-black text-slate-950">C</div><div><div className="font-display text-lg font-bold tracking-wide">COZY <span className="text-emerald-400">PROSPECT</span></div><div className="text-xs text-slate-400">Prospecção inteligente</div></div></div>
      <nav className="space-y-1">{nav.map(item=><button key={item.id} onClick={()=>setSection(item.id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition ${section===item.id?"bg-emerald-400/15 text-emerald-300":"text-slate-400 hover:bg-white/5 hover:text-white"}`}><item.icon size={18}/>{item.label}</button>)}</nav>
      <div className="mt-auto rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-400">Pesquisa pública via OpenStreetMap. O envio pelo WhatsApp é sempre confirmado manualmente.</div>
    </aside>
    <main className="min-h-screen lg:ml-64">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[#0b1220]/90 px-5 py-4 backdrop-blur lg:px-8">
        <div><p className="text-xs uppercase tracking-[.2em] text-emerald-400">COZY PROSPECT</p><h1 className="font-display text-xl font-semibold">{nav.find(n=>n.id===section)?.label}</h1></div>
        <div className="flex items-center gap-2"><Button variant="outline" size="sm" onClick={()=>void refresh()}><Activity size={15}/> Atualizar</Button><Button size="sm" onClick={()=>setSection("search")}><Search size={15}/> Prospectar</Button></div>
      </header>
      <div className="border-b border-white/10 px-3 py-2 lg:hidden"><div className="flex gap-1 overflow-x-auto">{nav.map(n=><button key={n.id} onClick={()=>setSection(n.id)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs ${section===n.id?"bg-emerald-400/15 text-emerald-300":"text-slate-400"}`}>{n.label}</button>)}</div></div>
      <div className="mx-auto max-w-7xl space-y-6 p-5 lg:p-8">
        {loading?<p className="text-slate-400">Carregando dados do COZY PROSPECT…</p>:null}
        {section==="dashboard"&&<><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[
          ["Barbearias cadastradas",stats.total,Building2],["Novos leads",stats.new,Users],["Com telefone válido",stats.withPhone,Phone],["Contatos realizados",stats.contacted,Send],["Interessados",stats.interested,Activity],["Não contatar",stats.blocked,ShieldAlert],
        ].map(([label,value,Icon]:any)=><Card key={label}><div className="flex items-center justify-between"><span className="text-sm text-slate-400">{label}</span><Icon size={18} className="text-emerald-400"/></div><p className="mt-3 font-display text-3xl font-bold">{value}</p></Card>)}</div><Card><div className="flex items-center justify-between"><div><h2 className="font-semibold">Comece uma nova prospecção</h2><p className="mt-1 text-sm text-slate-400">Encontre estabelecimentos e cadastre os resultados diretamente no CRM.</p></div><Button onClick={()=>setSection("search")}>Pesquisar agora <ChevronRight size={16}/></Button></div></Card></>}
        {section==="search"&&<div className="grid gap-5 xl:grid-cols-[1fr_360px]"><Card><div className="mb-5 flex items-center gap-2"><Search className="text-emerald-400"/><h2 className="text-lg font-semibold">Encontrar barbearias</h2></div><p className="mb-5 text-sm text-slate-400">Pesquise dados públicos no OpenStreetMap. A quantidade selecionada é o limite máximo, não uma garantia de resultados.</p><div className="grid gap-4 sm:grid-cols-2"><label className="space-y-2 text-sm">Cidade<Input value={city} onChange={e=>setCity(e.target.value)} placeholder="Ex.: Salgueiro"/></label><label className="space-y-2 text-sm">Estado<Input value={state} onChange={e=>setState(e.target.value)} placeholder="PE"/></label><label className="space-y-2 text-sm">Quantidade máxima<select value={limit} onChange={e=>setLimit(e.target.value)} className="h-10 w-full rounded-md border border-white/10 bg-[#101c2c] px-3">{["10","20","30","50","100"].map(x=><option key={x}>{x}</option>)}</select></label></div><Button className="mt-5 w-full sm:w-auto" disabled={busy} onClick={()=>void search()}>{busy?<Activity className="animate-spin"/>:<Search/>}{busy?" Pesquisando…":" Pesquisar barbearias"}</Button><p className="mt-4 text-xs text-slate-500">Fontes: Nominatim e Overpass API. Resultados dependem da cobertura colaborativa do OpenStreetMap.</p></Card><Card><h3 className="font-semibold">Últimas pesquisas</h3><div className="mt-4 space-y-3">{searches.slice(0,6).map(s=><div key={s.id} className="border-b border-white/10 pb-3"><p className="font-medium">{s.city} {s.state}</p><p className="text-xs text-slate-400">{s.inserted_count} novos · {s.duplicate_count} repetidos · {s.found_count} encontrados</p></div>)}{!searches.length&&<p className="text-sm text-slate-500">Nenhuma pesquisa registrada.</p>}</div></Card></div>}
        {section==="leads"&&<Card><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Base de leads</h2><p className="text-sm text-slate-400">{visible.length} registros encontrados</p></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={addManualLead}><Plus size={15}/> Adicionar</Button><Button variant="outline" size="sm" onClick={exportCsv}><Download size={15}/> CSV</Button></div></div><div className="mb-4 grid gap-2 sm:grid-cols-[1fr_190px]"><Input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar nome, cidade, telefone…"/><select value={filter} onChange={e=>setFilter(e.target.value)} className="rounded-md border border-white/10 bg-[#101c2c] px-3 text-sm"><option value="all">Todos os status</option>{["found","analyzed","authorized","contacted","interested","demo","subscriber","not_interested","invalid","do_not_contact"].map(s=><option key={s} value={s}>{s.replaceAll("_"," ")}</option>)}</select></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="text-xs uppercase text-slate-500"><tr><th className="p-3">Estabelecimento</th><th className="p-3">Cidade</th><th className="p-3">Telefone</th><th className="p-3">Status</th><th className="p-3">Ações</th></tr></thead><tbody>{visible.map(l=><tr key={l.id} className="border-t border-white/10"><td className="p-3 font-medium">{l.name}<div className="text-xs text-slate-500">{l.address}</div></td><td className="p-3">{l.city||"—"} / {l.state||"—"}</td><td className="p-3">{l.phone||"Sem telefone"}</td><td className="p-3"><span className="rounded-full bg-white/10 px-2 py-1 text-xs">{l.status}</span></td><td className="p-3"><div className="flex gap-2"><Button size="sm" variant="outline" onClick={()=>{setSection("queue");setActiveLead(Math.max(0,eligible.findIndex(x=>x.id===l.id)));}}>Abrir fila</Button>{l.status!=="do_not_contact"&&<Button size="sm" variant="ghost" onClick={()=>void blockLead(l)}>Bloquear</Button>}</div></td></tr>)}</tbody></table></div></Card>}
        {section==="queue"&&<div className="mx-auto max-w-2xl space-y-4"><div className="flex items-center justify-between text-sm text-slate-400"><span>MODO PROSPECÇÃO</span><span>{eligible.length?Math.min(activeLead+1,eligible.length):0} de {eligible.length}</span></div>{current?<Card><div className="flex items-start justify-between"><div><h2 className="text-xl font-semibold">{current.name}</h2><p className="mt-1 text-sm text-slate-400">{current.city} / {current.state} · {current.phone}</p></div><Button variant="ghost" size="icon" onClick={()=>void blockLead(current)} aria-label="Bloquear contato"><ShieldAlert/></Button></div><label className="mt-5 block space-y-2 text-sm">Mensagem personalizada<Textarea rows={7} value={messageDraft||assignedTemplate?.content||""} onChange={e=>setMessageDraft(e.target.value)}/></label><div className="mt-3 rounded-xl bg-black/20 p-3 text-sm text-slate-300"><p className="mb-2 text-xs uppercase text-slate-500">Prévia</p>{preview}</div><div className="mt-5 grid gap-2 sm:grid-cols-2"><Button onClick={()=>void openWhatsApp()}><ExternalLink size={16}/> Enviar mensagem pelo WhatsApp</Button><Button variant="outline" onClick={()=>{void navigator.clipboard.writeText(preview);toast.success("Mensagem copiada.");}}><Clipboard size={16}/> Copiar mensagem</Button><Button variant="outline" onClick={()=>void confirmSent()}><Check size={16}/> Marcar como enviada</Button><Button variant="outline" onClick={()=>void skip()}>Pular contato <ChevronRight size={16}/></Button><Button variant="ghost" onClick={()=>setActiveLead(i=>Math.max(0,i-1))}><ChevronLeft size={16}/> Anterior</Button><Button variant="ghost" onClick={()=>setActiveLead(i=>Math.min(eligible.length-1,i+1))}>Próximo <ChevronRight size={16}/></Button></div><p className="mt-3 text-xs text-slate-500">A conversa abre individualmente com o texto preenchido. O envio só é registrado quando você confirmar manualmente.</p></Card>:<Card><p className="text-center text-slate-400">Não há leads elegíveis com telefone válido na fila.</p></Card>}</div>}
        {section==="messages"&&<div className="grid gap-5 xl:grid-cols-[380px_1fr]"><Card><h2 className="mb-4 font-semibold">{editing?"Editar modelo":"Novo modelo"}</h2><div className="space-y-3"><Input placeholder="Nome do modelo" value={templateName} onChange={e=>setTemplateName(e.target.value)}/><Textarea rows={7} placeholder="Use {nome_barbearia}, {cidade}, {estado}" value={templateText} onChange={e=>setTemplateText(e.target.value)}/><Button className="w-full" onClick={()=>void saveTemplate()}>{editing?"Salvar alterações":"Adicionar modelo"}</Button><Button variant="outline" className="w-full" onClick={()=>{setEditing(null);setTemplateName("");setTemplateText("");}}>Limpar</Button><p className="text-xs text-slate-500">{templates.filter(t=>t.is_active!==false).length} ativos · mínimo 3 · máximo 30.</p></div></Card><div className="space-y-3">{templates.map(t=><Card key={t.id}><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-medium">{t.name}</h3><p className="mt-1 whitespace-pre-wrap text-sm text-slate-400">{t.content}</p></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={()=>{setEditing(t.id);setTemplateName(t.name);setTemplateText(t.content);}}>Editar</Button><Button size="sm" variant="outline" onClick={()=>void toggleTemplate(t)}>{t.is_active===false?"Ativar":"Desativar"}</Button><Button size="sm" variant="ghost" onClick={()=>void removeTemplate(t)}><X size={15}/></Button></div></div></Card>)}{templates.length===0&&<Card><p className="text-sm text-slate-400">Cadastre pelo menos três modelos ativos. Os modelos padrão podem ser inseridos pela configuração inicial.</p><Button className="mt-3" onClick={async()=>{for(const t of defaults)await db.from("message_templates").insert({...t,is_first_contact:true,is_active:true});await refresh();}}>Criar 3 modelos padrão</Button></Card>}</div></div>}
        {section==="cities"&&<Card><h2 className="mb-4 font-semibold">Histórico de cidades pesquisadas</h2><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-slate-500"><tr><th className="p-3">Cidade</th><th className="p-3">Data</th><th className="p-3">Encontrados</th><th className="p-3">Novos</th><th className="p-3">Duplicados</th></tr></thead><tbody>{searches.map(s=><tr key={s.id} className="border-t border-white/10"><td className="p-3">{s.city}/{s.state}</td><td className="p-3">{new Date(s.created_at).toLocaleString("pt-BR")}</td><td className="p-3">{s.found_count}</td><td className="p-3">{s.inserted_count}</td><td className="p-3">{s.duplicate_count}</td></tr>)}</tbody></table></div></Card>}
        {section==="reports"&&<div className="grid gap-4 md:grid-cols-2"><Card><h3 className="font-semibold">Conversão por status</h3><div className="mt-4 space-y-3">{Object.entries(stats).map(([k,v])=><div key={k}><div className="mb-1 flex justify-between text-sm"><span className="capitalize text-slate-400">{k}</span><b>{v}</b></div><div className="h-2 rounded-full bg-white/10"><div className="h-2 rounded-full bg-emerald-400" style={{width:`${stats.total?Math.min(100,Number(v)/stats.total*100):0}%`}}/></div></div>)}</div></Card><Card><h3 className="font-semibold">Atividade de mensagens</h3><p className="mt-4 text-3xl font-bold">{messages.length}</p><p className="text-sm text-slate-400">Registros no histórico de mensagens</p><p className="mt-3 text-sm">Confirmadas: {messages.filter(m=>m.status==="sent").length}</p><p className="text-sm">Abertas, ainda não confirmadas: {messages.filter(m=>m.status==="opened").length}</p></Card></div>}
        {section==="settings"&&<Card><h2 className="font-semibold">Configurações do COZY PROSPECT</h2><p className="mt-2 text-sm text-slate-400">Pesquisa baseada em dados públicos do OpenStreetMap. Contatos sem telefone válido e registros marcados como Não contatar são excluídos da fila.</p><div className="mt-4 flex items-center gap-2 text-sm text-emerald-300"><Check size={16}/> Autenticação Supabase ativa nesta área protegida.</div></Card>}
      </div>
    </main>
  </div>;
}
