import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import "@lovable.dev/cloud-auth-js/styles.css";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/api";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — COZY PROSPECT" },
      { name: "description", content: "Entre ou crie sua conta na COZY PROSPECT." },
      { property: "og:title", content: "Entrar — COZY PROSPECT" },
      { property: "og:description", content: "Acesse sua plataforma de prospecção comercial." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "forgot";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/prospect", replace: true });
    });
    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate({ to: "/prospect", replace: true });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw new Error(error.message === "Invalid login credentials" ? "E-mail ou senha incorretos." : error.message);
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/prospect" },
        });
        if (error) throw error;
        if (!data.session) setNotice("Enviamos um link de confirmação para seu e-mail. Confirme para entrar.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + "/reset-password",
        });
        if (error) throw error;
        setNotice("Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.");
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function social(provider: "google" | "lovable") {
    const r = await lovable.auth.signInWithOAuth(provider, { redirect_uri: window.location.origin + "/auth" });
    if (r.error) toast.error(errorMessage(r.error));
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-hero px-6">
      <div className="w-full max-w-sm">
        <Link to="/" className="text-sm text-muted-foreground">← Início</Link>
        <h1 className="mt-6 text-3xl font-semibold">
          {mode === "signin" ? "Entrar" : mode === "signup" ? "Criar conta" : "Recuperar senha"}
        </h1>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {mode !== "forgot" && (
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                minLength={8}
                required
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}
          {notice && <p className="rounded-lg border bg-surface p-3 text-sm">{notice}</p>}
          <Button type="submit" className="w-full" size="lg" disabled={busy}>
            {busy ? "Aguarde…" : mode === "signin" ? "Entrar" : mode === "signup" ? "Criar conta" : "Enviar link"}
          </Button>
        </form>

        {mode !== "forgot" && (
          <>
            <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />ou<span className="h-px flex-1 bg-border" />
            </div>
            <div className="space-y-3">
              <Button variant="secondary" className="w-full" size="lg" onClick={() => social("google")}>
                Continuar com Google
              </Button>
              <button type="button" className="lovable-auth-button w-full" onClick={() => social("lovable")}>
                Continue with Lovable
              </button>
            </div>
          </>
        )}

        <div className="mt-6 flex flex-col gap-2 text-center text-sm text-muted-foreground">
          {mode === "signin" && (
            <>
              <button className="underline-offset-4 hover:underline" onClick={() => setMode("forgot")}>Esqueci minha senha</button>
              <button className="underline-offset-4 hover:underline" onClick={() => setMode("signup")}>Não tem conta? Criar conta</button>
            </>
          )}
          {mode !== "signin" && (
            <button className="underline-offset-4 hover:underline" onClick={() => setMode("signin")}>Já tenho conta</button>
          )}
        </div>
      </div>
    </main>
  );
}
