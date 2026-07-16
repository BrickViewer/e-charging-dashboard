import { useState } from "react";
import { Camera, FileVideo, Home, Image as ImageIcon, Info, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  intakeFileUrl,
  useQuoteRequest,
  type ParticulierPayload,
  type QuoteRequest,
  type QuoteRequestFile,
  type UploadRef,
  type ZakelijkPayload,
} from "@/hooks/useQuoteRequest";
import { MAPS, TRIAGE_KLEUR, TRIAGE_LABEL, bytes, centPerKwh, label, maandLabel, zakelijkAdres } from "@/lib/quoteRequest";

// Toont de offerteaanvraag zoals de klant hem op de website invulde: alle antwoorden
// per stap, plus de foto's en video's uit de privé-bucket (signed URL op aanvraag).

export function QuoteRequestPanel({ leadId }: { leadId: string }) {
  const q = useQuoteRequest(leadId);

  if (q.isLoading) return <Skeleton className="h-64 w-full" />;
  if (!q.data) return null;
  const req = q.data;

  return (
    <div className="space-y-4">
      <div className="portal-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Chip className="bg-muted text-foreground">
            {req.flow === "particulier" ? <Home className="h-3 w-3" /> : <Building2 className="h-3 w-3" />}
            {req.flow === "particulier" ? "Particulier" : "Zakelijk"}
          </Chip>
          <Chip className={TRIAGE_KLEUR[req.triage]}>{TRIAGE_LABEL[req.triage]}</Chip>
          {req.updates_opt_in && <Chip className="bg-emerald-100 text-emerald-800">Nieuwsbrief-opt-in</Chip>}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Ingediend op {new Date(req.created_at).toLocaleString("nl-NL")} · akkoord met de privacyverklaring op{" "}
          {new Date(req.privacy_accepted_at).toLocaleString("nl-NL")}
        </p>
      </div>

      {req.flow === "particulier" ? (
        <ParticulierBlokken req={req} data={req.payload as ParticulierPayload} />
      ) : (
        <ZakelijkBlokken req={req} data={req.payload as ZakelijkPayload} />
      )}
    </div>
  );
}

/* ────────────────────────────── particulier ────────────────────────────── */

function ParticulierBlokken({ req, data }: { req: QuoteRequest; data: ParticulierPayload }) {
  const g = data.gegevens;
  const bestandenVan = (refs: UploadRef[]) => req.files.filter((f) => refs.some((r) => r.path === f.path));

  return (
    <>
      <Card title="Gegevens" icon={Info}>
        <Row label="Naam" value={g.naam} />
        <Row label="Adres" value={`${g.straat} ${[g.huisnummer, g.toevoeging].filter(Boolean).join(" ")}, ${g.postcode} ${g.plaats}`} />
        <Row label="E-mail" value={g.email} />
        <Row label="Telefoon" value={g.telefoon} />
      </Card>

      <Card title="Meterkast" icon={Camera}>
        <Row label="Kruipruimte" value={label(MAPS.jaNeeWeetNiet, data.meterkast.kruipruimte)} />
        <Row label="Huidige aansluiting" value={label(MAPS.aansluiting, data.meterkast.aansluiting)} />
        <Row label="Wordt verzwaard naar 3-fase" value={label(MAPS.jaNeeWeetNiet, data.meterkast.verzwaring_3fase)} />
        <Row label="Verwachte verzwaring" value={maandLabel(data.meterkast.verzwaring_maand)} />
        <Bestanden
          files={bestandenVan(data.meterkast.fotos)}
          overgeslagen={data.meterkast.fotos_overgeslagen}
          leegTekst="Geen foto van de meterkast toegevoegd."
        />
      </Card>

      {data.laadpalen.map((lp, i) => (
        <Card key={i} title={`Laadpaal ${i + 1} van ${data.aantal_laadpalen}`} icon={Camera}>
          <Row
            label="Vaste kabel"
            value={lp.vaste_kabel === "ja" ? `Ja, ${label(MAPS.kabelLengte, lp.kabel_lengte)}` : label(MAPS.jaNee, lp.vaste_kabel)}
          />
          <Row label="Kleur front cover" value={label(MAPS.kleurFront, lp.kleur_front)} />
          <SubKop>Foto van de plek</SubKop>
          <Bestanden files={bestandenVan(lp.foto_plek)} overgeslagen={lp.foto_plek_overgeslagen} leegTekst="Geen foto toegevoegd." />
          <SubKop>Route van de meterkast naar de plek</SubKop>
          <Bestanden files={bestandenVan(lp.route_media)} overgeslagen={lp.route_overgeslagen} leegTekst="Geen route toegevoegd." />
        </Card>
      ))}

      <Card title="Laden en verrekenen" icon={Info}>
        <Row label="Laadpas werkgever of zakelijk verrekenen" value={label(MAPS.jaNee, data.verrekenen.zakelijk_verrekenen)} />
        <Row label="Dynamisch energiecontract" value={label(MAPS.jaNeeWeetNiet, data.verrekenen.dynamisch_contract)} />
        <Row label="Gewenst laadtarief" value={label(MAPS.laadtarief, data.verrekenen.laadtarief)} />
        <Row label="Gemiddelde stroomkosten" value={centPerKwh(data.verrekenen.stroomkosten_cent)} />
        <Row label="Gewenste marge" value={centPerKwh(data.verrekenen.marge_cent)} />
      </Card>

      <Card title="Afronden" icon={Info}>
        <Row
          label="Gewenste plaatsing"
          value={
            data.afronden.plaatsing === "specifieke_maand"
              ? maandLabel(data.afronden.plaatsing_maand)
              : label(MAPS.plaatsing, data.afronden.plaatsing)
          }
        />
        <Row label="Opmerkingen" value={data.afronden.opmerkingen} />
      </Card>
    </>
  );
}

/* ─────────────────────────────── zakelijk ─────────────────────────────── */

function ZakelijkBlokken({ req, data }: { req: QuoteRequest; data: ZakelijkPayload }) {
  const o = data.organisatie;
  const bestandenVan = (refs: UploadRef[]) => req.files.filter((f) => refs.some((r) => r.path === f.path));

  return (
    <>
      <Card title="Organisatie" icon={Building2}>
        <Row label="Bedrijfsnaam" value={o.bedrijfsnaam} />
        <Row label="Contactpersoon" value={o.functie ? `${o.contactpersoon} (${o.functie})` : o.contactpersoon} />
        <Row label="E-mail" value={o.email} />
        <Row label="Telefoon" value={o.telefoon} />
        <Row
          label="Type organisatie"
          value={o.type_organisatie === "anders" ? `Anders: ${o.type_organisatie_anders}` : label(MAPS.typeOrganisatie, o.type_organisatie)}
        />
        <Row label="KvK-nummer" value={o.kvk} />
      </Card>

      <Card title="Locatie" icon={Info}>
        <Row label="Adres" value={zakelijkAdres(data.locatie)} />
        <Row
          label="Type locatie"
          value={data.locatie.type_locatie === "anders" ? `Anders: ${data.locatie.type_locatie_anders}` : label(MAPS.typeLocatie, data.locatie.type_locatie)}
        />
        <Row label="Eigenaar of huurder" value={label(MAPS.eigendom, data.locatie.eigendom)} />
        <Row label="Bestaand of nieuwbouw" value={label(MAPS.bestaandNieuwbouw, data.locatie.bestaand_of_nieuwbouw)} />
        <Row label="Wie gaat er laden" value={data.locatie.wie_gaat_laden.map((w) => label(MAPS.wieGaatLaden, w)).join(", ")} />
      </Card>

      <Card title="Schaal" icon={Info}>
        <Row label="Laadpunten nu" value={data.schaal.aantal_laadpunten} />
        <Row
          label="Uitbreiding verwacht"
          value={
            data.schaal.uitbreiding === "ja"
              ? `Ja${data.schaal.uitbreiding_aantal ? `, ongeveer ${data.schaal.uitbreiding_aantal} extra` : ""}`
              : label(MAPS.jaNee, data.schaal.uitbreiding)
          }
        />
        {/* Legacy: alleen oude aanvragen hebben nog een laadtype; zonder waarde rendert Row niets. */}
        <Row label="Gewenst laadtype" value={label(MAPS.laadtype, data.schaal.laadtype)} />
      </Card>

      <Card title="Techniek" icon={Camera}>
        <Row label="Aansluitwaarde" value={data.techniek.aansluitwaarde_onbekend ? "Onbekend" : data.techniek.aansluitwaarde} />
        <SubKop>Foto van de meterkast of verdeelinrichting</SubKop>
        <Bestanden files={bestandenVan(data.techniek.foto_meterkast)} leegTekst="Geen foto toegevoegd." />
        <SubKop>Situatiefoto's of plattegrond</SubKop>
        <Bestanden files={bestandenVan(data.techniek.situatie_media)} leegTekst="Niets toegevoegd." />
      </Card>

      <Card title="Afronden" icon={Info}>
        <Row label="Opmerkingen" value={data.afronden.opmerkingen} />
      </Card>
    </>
  );
}

/* ──────────────────────────────── bouwstenen ──────────────────────────────── */

function Chip({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${className}`}>
      {children}
    </span>
  );
}

function Card({ title, icon: Icon, children }: { title: string; icon: typeof Info; children: React.ReactNode }) {
  return (
    <div className="portal-card p-4">
      <p className="cockpit-section-label mb-1 flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        {title}
      </p>
      {children}
    </div>
  );
}

function Row({ label: l, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 py-2 last:border-0">
      <span className="text-sm text-muted-foreground">{l}</span>
      <span className="text-right text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

function SubKop({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground/70">{children}</p>;
}

/** Overgeslagen uploads expliciet tonen: sales weet dan dat er nagevraagd moet worden. */
function Bestanden({
  files,
  overgeslagen,
  leegTekst,
}: {
  files: QuoteRequestFile[];
  overgeslagen?: boolean;
  leegTekst: string;
}) {
  if (files.length === 0) {
    return (
      <p className="mt-1 text-sm text-muted-foreground">
        {overgeslagen ? (
          <span className="text-amber-700">Overgeslagen door de aanvrager — vraag dit nog na.</span>
        ) : (
          leegTekst
        )}
      </p>
    );
  }
  return (
    <div className="mt-2 space-y-2">
      {files.map((f) => (
        <Bestand key={f.path} file={f} />
      ))}
    </div>
  );
}

function Bestand({ file }: { file: QuoteRequestFile }) {
  const [url, setUrl] = useState<string | null>(null);
  const [laden, setLaden] = useState(false);
  const isVideo = file.content_type.startsWith("video/");

  const bekijk = async () => {
    setLaden(true);
    const u = await intakeFileUrl(file.path);
    setLaden(false);
    if (!u) {
      toast.error("Bestand kon niet geladen worden");
      return;
    }
    setUrl(u);
    if (isVideo) window.open(u, "_blank", "noopener,noreferrer");
  };

  if (url && !isVideo) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block">
        <img src={url} alt={file.name} className="max-h-72 w-full rounded border object-contain" />
        <span className="mt-1 block text-xs text-muted-foreground">
          {file.name} · {bytes(file.size)}
        </span>
      </a>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" className="gap-1.5" onClick={bekijk} disabled={laden}>
        {isVideo ? <FileVideo className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
        {laden ? "Laden…" : isVideo ? "Video openen" : "Foto bekijken"}
      </Button>
      <span className="truncate text-xs text-muted-foreground">
        {file.name} · {bytes(file.size)}
      </span>
    </div>
  );
}
