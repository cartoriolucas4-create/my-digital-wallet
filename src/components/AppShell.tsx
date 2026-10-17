import { Outlet } from "@tanstack/react-router";
import { Eye, EyeOff, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePrivacy } from "@/lib/privacy";
import { Button } from "@/components/ui/button";

export function AppShell() {
  const { hidden, toggle } = usePrivacy();
  return (
    <div className="min-h-screen bg-hero">
      <header className="mx-auto flex max-w-2xl items-center justify-between px-5 pt-6">
        <h1 className="text-xl font-semibold">Minha Carteira</h1>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" onClick={toggle} aria-label={hidden ? "Mostrar dados" : "Ocultar dados"}>
            {hidden ? <EyeOff /> : <Eye />}
          </Button>
          <Button variant="ghost" size="icon" aria-label="Sair" onClick={() => supabase.auth.signOut()}>
            <LogOut />
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-5 pb-16 pt-4">
        <Outlet />
      </main>
    </div>
  );
}
