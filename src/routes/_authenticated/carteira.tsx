import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { listDocuments, errorMessage } from "@/lib/api";
import { filterDocuments, expiryStatus, formatDate, maskNumber, toneFor } from "@/lib/wallet";
import { usePrivacy } from "@/lib/privacy";

export const Route = createFileRoute("/_authenticated/carteira")({
  head: () => ({ meta: [{ title: "Carteira — Minha Carteira Digital" }] }),
  component: Wallet,
});

const LABEL = { expired: "Vencido", soon: "Vence em breve", valid: "Válido", none: "" } as const;

function Wallet() {
  const { hidden } = usePrivacy();
  const [query, setQuery] = useState("");
  const q = useQuery({ queryKey: ["documents"], queryFn: listDocuments });
  const docs = filterDocuments(q.data ?? [], { query });

  return (
    <div className="space-y-4">
      <Input placeholder="Buscar documentos" value={query} onChange={(e) => setQuery(e.target.value)} />
      {q.isLoading && <p className="text-muted-foreground">Carregando…</p>}
      {q.error && <p className="text-destructive">{errorMessage(q.error)}</p>}
      {q.data && docs.length === 0 && (
        <p className="rounded-2xl border bg-surface p-6 text-center text-muted-foreground">
          Nenhum documento ainda.
        </p>
      )}
      {docs.map((d) => {
        const st = expiryStatus(d.expires_at, d.reminder_days);
        return (
          <article key={d.id} className={`wallet-card ${toneFor(d.category_id ?? d.id)} p-5`}>
            <p className="font-display text-lg font-semibold">{d.name}</p>
            {d.holder && <p className={hidden ? "privacy-blur" : ""}>{d.holder}</p>}
            {d.number && <p className="text-sm opacity-80">{hidden ? maskNumber(d.number) : d.number}</p>}
            {d.expires_at && (
              <p className="mt-2 text-xs opacity-80">
                Validade {formatDate(d.expires_at)} {LABEL[st] && `· ${LABEL[st]}`}
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}
