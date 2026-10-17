import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FileText, Lock, CalendarClock, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Minha Carteira Digital — seus documentos, privados" },
      { name: "description", content: "Guarde RG, CNH, passaporte e outros documentos com frente, verso e PDF, com alertas de validade." },
      { property: "og:title", content: "Minha Carteira Digital" },
      { property: "og:description", content: "Seus documentos pessoais organizados em cartões, privados e com alertas de validade." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);

  const features = [
    { icon: FileText, t: "Frente, verso e PDF", d: "Várias imagens por documento, com capa escolhida por você." },
    { icon: CalendarClock, t: "Central de validade", d: "Veja o que venceu e o que vence em breve." },
    { icon: Lock, t: "Privado por conta", d: "Arquivos em armazenamento privado, acessados por links temporários." },
    { icon: Smartphone, t: "Instalável", d: "Adicione à tela inicial do celular." },
  ];

  return (
    <main className="min-h-screen bg-hero">
      <div className="mx-auto flex max-w-md flex-col px-6 pb-16 pt-16">
        <img src="/icon-192.png" alt="" width={56} height={56} className="rounded-2xl" />
        <h1 className="mt-8 text-4xl font-semibold leading-tight">Minha Carteira Digital</h1>
        <p className="mt-3 text-muted-foreground">
          Seus documentos pessoais organizados em cartões, sempre à mão e só visíveis para você.
        </p>
        <div className="mt-8 flex gap-3">
          {signedIn ? (
            <Button asChild size="lg" className="flex-1">
              <Link to="/carteira">Abrir minha carteira</Link>
            </Button>
          ) : (
            <Button asChild size="lg" className="flex-1">
              <Link to="/auth">Entrar ou criar conta</Link>
            </Button>
          )}
        </div>
        <ul className="mt-12 space-y-3">
          {features.map(({ icon: Icon, t, d }) => (
            <li key={t} className="flex gap-4 rounded-2xl border bg-surface/70 p-4">
              <Icon className="mt-0.5 size-5 shrink-0 text-primary" />
              <div>
                <p className="font-medium">{t}</p>
                <p className="text-sm text-muted-foreground">{d}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
