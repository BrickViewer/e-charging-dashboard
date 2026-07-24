import { useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Save, RotateCcw, Mail } from "lucide-react";
import {
  EMAIL_TEMPLATES, GROUP_LABELS, TEMPLATES_BY_KEY, missingPlaceholders,
  type EmailTemplateDef, type TemplateGroup,
} from "@/services/emailTemplates";
import { useEmailTemplates, useSaveEmailTemplate, useResetEmailTemplate } from "@/hooks/useEmailTemplates";

/** Vult {{placeholders}} met de voorbeeldwaarden, voor het tekstvoorbeeld. */
function preview(text: string, sample: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (hele, naam: string) => sample[naam] ?? hele);
}

function TemplateEditor({ def }: { def: EmailTemplateDef }) {
  const { data: rows } = useEmailTemplates();
  const save = useSaveEmailTemplate();
  const reset = useResetEmailTemplate();
  const row = rows?.find((r) => r.key === def.key);

  // Leeg veld = "gebruik de standaardtekst". We tonen de standaard als placeholder-tekst,
  // zodat je ziet wat er verstuurd wordt zonder dat je hem hoeft over te typen.
  const [slots, setSlots] = useState<Record<string, string>>(() => ({ ...(row?.slots ?? {}) }));
  const [dirty, setDirty] = useState(false);
  const laatsteFocus = useRef<string | null>(null);

  const ontbreekt = useMemo(() => missingPlaceholders(def.key, slots), [def.key, slots]);
  const aangepast = Object.values(slots).some((v) => v && v.trim());

  const zetSlot = (naam: string, waarde: string) => {
    setSlots((s) => ({ ...s, [naam]: waarde }));
    setDirty(true);
  };

  // Placeholder invoegen in het veld waar je het laatst stond; anders kopiëren naar klembord.
  const voegPlaceholderIn = (naam: string) => {
    const doel = laatsteFocus.current;
    if (!doel) {
      void navigator.clipboard?.writeText(`{{${naam}}}`);
      toast.info(`{{${naam}}} gekopieerd — plak hem in een tekstveld`);
      return;
    }
    const huidig = slots[doel] ?? def.slots.find((s) => s.name === doel)?.default ?? "";
    zetSlot(doel, `${huidig}{{${naam}}}`);
  };

  const opslaan = async () => {
    if (ontbreekt.length) {
      toast.error(`Verplichte placeholder(s) ontbreken: ${ontbreekt.map((p) => `{{${p}}}`).join(", ")}`);
      return;
    }
    try {
      await save.mutateAsync({ key: def.key, slots });
      setDirty(false);
      toast.success("Sjabloon opgeslagen");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Opslaan mislukt");
    }
  };

  const terugzetten = async () => {
    try {
      await reset.mutateAsync(def.key);
      setSlots({});
      setDirty(false);
      toast.success("Terug op de standaardtekst");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Terugzetten mislukt");
    }
  };

  return (
    <Card className="portal-card">
      <CardContent className="p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">{def.label}</h3>
              {aangepast
                ? <Badge variant="secondary" className="text-[10px]">Aangepast</Badge>
                : <Badge variant="outline" className="text-[10px]">Standaard</Badge>}
              <Badge variant="outline" className="text-[10px]">
                {def.sender === "info" ? "info@" : "noreply@"}
              </Badge>
            </div>
            <p className="mt-1 max-w-3xl text-xs text-muted-foreground">{def.description}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            {aangepast && (
              <Button variant="outline" size="sm" onClick={terugzetten} disabled={reset.isPending}>
                <RotateCcw className="mr-1 h-3.5 w-3.5" />Standaard
              </Button>
            )}
            <Button size="sm" onClick={opslaan} disabled={!dirty || save.isPending}>
              <Save className="mr-1 h-3.5 w-3.5" />Opslaan
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {def.placeholders.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => voegPlaceholderIn(p.name)}
              title={p.label}
              className="rounded-md border bg-muted/50 px-2 py-1 font-mono text-[11px] transition-colors hover:bg-muted"
            >
              {`{{${p.name}}}`}{p.required && <span className="ml-1 text-destructive">*</span>}
            </button>
          ))}
        </div>

        {ontbreekt.length > 0 && (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            Verplichte placeholder(s) ontbreken: {ontbreekt.map((p) => `{{${p}}}`).join(", ")}. Opslaan is geblokkeerd.
          </p>
        )}

        <div className="space-y-3">
          {def.slots.map((slot) => {
            const waarde = slots[slot.name] ?? "";
            const effectief = waarde.trim() ? waarde : slot.default;
            return (
              <div key={slot.name} className="space-y-1">
                <Label className="text-xs">{slot.label}</Label>
                {slot.hint && <p className="text-[11px] text-muted-foreground">{slot.hint}</p>}
                {slot.multiline ? (
                  <Textarea
                    rows={3}
                    value={waarde}
                    placeholder={slot.default}
                    onFocus={() => { laatsteFocus.current = slot.name; }}
                    onChange={(e) => zetSlot(slot.name, e.target.value)}
                    className="text-sm"
                  />
                ) : (
                  <Input
                    value={waarde}
                    placeholder={slot.default}
                    onFocus={() => { laatsteFocus.current = slot.name; }}
                    onChange={(e) => zetSlot(slot.name, e.target.value)}
                    className="text-sm"
                  />
                )}
                <p className="text-[11px] text-muted-foreground">
                  <span className="font-medium">Voorbeeld:</span> {preview(effectief, def.sample)}
                </p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export function EmailTemplatesTab() {
  const groepen: TemplateGroup[] = ["klant", "intern", "intake"];
  return (
    <div className="space-y-6">
      <Card className="portal-card">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <h2 className="text-base font-semibold">Standaardteksten voor uitgaande e-mail</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Je past hier de teksten aan; de vormgeving, het logo en de knoppen liggen vast zodat een mail
                er altijd goed uitziet. Laat je een veld leeg, dan gebruikt het systeem de standaardtekst die
                eronder staat. Placeholders tussen dubbele accolades worden bij het verzenden ingevuld.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {groepen.map((groep) => {
        const items = EMAIL_TEMPLATES.filter((t) => t.group === groep);
        if (!items.length) return null;
        return (
          <div key={groep} className="space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              {GROUP_LABELS[groep]}
            </p>
            {items.map((def) => <TemplateEditor key={def.key} def={TEMPLATES_BY_KEY[def.key]} />)}
          </div>
        );
      })}
    </div>
  );
}
