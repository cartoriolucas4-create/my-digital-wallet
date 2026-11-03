import { Outlet, Link, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { LayoutDashboard, LogOut, Search, Users, Send, MessageSquare, MapPin, BarChart3, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const links = [
  ["/prospect","Visão geral",LayoutDashboard],
  ["/prospect","Prospectar",Search],
  ["/prospect","Leads",Users],
  ["/prospect","Central de envio",Send],
  ["/prospect","Mensagens",MessageSquare],
  ["/prospect","Cidades pesquisadas",MapPin],
  ["/prospect","Relatórios",BarChart3],
  ["/prospect","Configurações",Settings],
] as const;

export function AppShell() {
  const router=useRouter();
  useEffect(()=>{ void router.navigate({to:"/prospect"}); },[router]);
  return <div className="min-h-screen bg-[#0b1220] text-slate-100"><header className="flex items-center justify-between border-b border-white/10 px-5 py-4"><Link to="/prospect" className="font-display text-xl font-bold">COZY <span className="text-emerald-400">PROSPECT</span></Link><Button variant="ghost" size="sm" onClick={()=>void supabase.auth.signOut()}><LogOut size={16}/> Sair</Button></header><main><Outlet/></main></div>;
}
