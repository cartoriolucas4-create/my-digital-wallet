import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type SearchInput = { city: string; state?: string; limit?: number };
type OSMElement = { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };

function clean(value?: string) {
  return value?.trim() || null;
}

function normalizePhone(value?: string) {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length >= 8 ? digits : null;
}

function addressFrom(tags: Record<string, string>, city: string, state?: string) {
  const street = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(", ");
  return [
    street,
    tags["addr:suburb"] ?? tags["addr:neighbourhood"],
    tags["addr:city"] ?? city,
    tags["addr:state"] ?? state,
    tags["addr:postcode"],
  ].filter(Boolean).join(" · ") || null;
}

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { "User-Agent": "CozyProspect/1.0 (public OpenStreetMap lead discovery)", ...init?.headers },
    signal: AbortSignal.timeout(40_000),
  });
  if (!response.ok) throw new Error(`Fonte pública respondeu com HTTP ${response.status}.`);
  return response.json();
}

export const searchBarbershops = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: SearchInput) => {
    const city = input.city?.trim();
    if (!city || city.length < 2 || city.length > 100) throw new Error("Informe uma cidade válida.");
    return { city, state: input.state?.trim().slice(0, 80) || "", limit: Math.min(200, Math.max(1, Number(input.limit) || 100)) };
  })
  .handler(async ({ data, context }) => {
    const search = new URL("https://nominatim.openstreetmap.org/search");
    search.searchParams.set("format", "jsonv2");
    search.searchParams.set("q", [data.city, data.state, "Brasil"].filter(Boolean).join(", "));
    search.searchParams.set("limit", "1");
    search.searchParams.set("addressdetails", "1");

    const places = await fetchJson(search.toString()) as Array<{ display_name?: string; boundingbox?: string[]; address?: Record<string, string> }>;
    const place = places[0];
    if (!place?.boundingbox || place.boundingbox.length !== 4) {
      throw new Error("Não foi possível localizar essa cidade no OpenStreetMap. Confira a grafia e o estado.");
    }

    const [south, north, west, east] = place.boundingbox.map(Number);
    const bbox = [south, west, north, east].join(",");
    const query = `[out:json][timeout:30];(nwr["shop"~"barber|hairdresser",i](${bbox});nwr["craft"="hairdresser"](${bbox});nwr["amenity"="barber"](${bbox}););out center tags ${data.limit};`;
    const endpoints = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
    let payload: { elements?: OSMElement[] } | null = null;
    let lastError: unknown;
    for (const endpoint of endpoints) {
      try {
        payload = await fetchJson(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ data: query }).toString(),
        }) as { elements?: OSMElement[] };
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!payload) throw new Error(lastError instanceof Error ? lastError.message : "Não foi possível consultar o Overpass agora.");

    const cityName = place.address?.city ?? place.address?.town ?? place.address?.municipality ?? data.city;
    const stateName = place.address?.state ?? data.state;
    const candidates = (payload.elements ?? []).flatMap((element) => {
      const tags = element.tags ?? {};
      const name = clean(tags.name ?? tags.brand ?? tags.operator);
      if (!name) return [];
      const phone = clean(tags["contact:phone"] ?? tags.phone ?? tags["contact:mobile"] ?? tags.mobile);
      const website = clean(tags["contact:website"] ?? tags.website);
      const instagram = clean(tags["contact:instagram"] ?? tags.instagram);
      const point = element.center ?? (element.lat !== undefined && element.lon !== undefined ? { lat: element.lat, lon: element.lon } : null);
      const sourceId = `${element.type}/${element.id}`;
      return [{
        name,
        phone,
        normalized_phone: normalizePhone(phone ?? undefined),
        address: addressFrom(tags, cityName, stateName),
        city: cityName,
        state: stateName || null,
        website,
        instagram,
        source: "openstreetmap",
        source_id: sourceId,
        source_url: `https://www.openstreetmap.org/${element.type}/${element.id}`,
        latitude: point?.lat ?? null,
        longitude: point?.lon ?? null,
      }];
    });

    const { data: counts, error } = await (context.supabase as any).rpc("insert_prospect_leads", {
      p_leads: candidates.map(({ latitude: _lat, longitude: _lon, normalized_phone: _phone, ...lead }) => lead),
    });
    if (error) throw new Error(`Os resultados foram encontrados, mas não puderam ser salvos: ${error.message}`);
    const inserted = Number(counts?.[0]?.inserted_count ?? 0);
    const duplicates = Number(counts?.[0]?.duplicate_count ?? 0);

    return {
      city: cityName,
      state: stateName || "",
      source: "OpenStreetMap / Overpass",
      found: candidates.length,
      inserted,
      duplicates,
      leads: candidates,
    };
  });
