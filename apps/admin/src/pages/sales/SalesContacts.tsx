import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Building2, Plus, Search, User, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  useCompanies,
  usePersons,
  useCreateCompany,
  useCreatePerson,
  splitName,
  type Company,
  type Person,
} from "@/hooks/useContacts";
import { CompanyDetailSheet } from "@/components/contacts/CompanyDetailSheet";
import { PersonDetailSheet } from "@/components/contacts/PersonDetailSheet";

type Tab = "bedrijven" | "personen";

function Kpi({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-xs">{label}</span>
      </div>
      <p className="mt-1 text-xl font-bold text-foreground">{value}</p>
    </div>
  );
}

export default function SalesContacts() {
  const companies = useCompanies();
  const persons = usePersons();
  const createCompany = useCreateCompany();
  const createPerson = useCreatePerson();

  const [tab, setTab] = useState<Tab>("bedrijven");
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search, 200).trim().toLowerCase();

  const [selCompany, setSelCompany] = useState<Company | null>(null);
  const [selPerson, setSelPerson] = useState<Person | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");

  const allCompanies = useMemo(() => companies.data ?? [], [companies.data]);
  const allPersons = useMemo(() => persons.data ?? [], [persons.data]);

  // Deep-link vanuit Beheer/klantdetail: ?company=<id> of ?person=<id> opent het dossier.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const cid = searchParams.get("company");
    const pid = searchParams.get("person");
    if (!cid && !pid) return;
    if (cid && allCompanies.length) {
      const c = allCompanies.find((x) => x.id === cid);
      if (c) { setSelCompany(c); setTab("bedrijven"); }
      setSearchParams({}, { replace: true });
    }
    if (pid && allPersons.length) {
      const p = allPersons.find((x) => x.id === pid);
      if (p) { setSelPerson(p); setTab("personen"); }
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, allCompanies, allPersons, setSearchParams]);

  const filteredCompanies = useMemo(
    () => allCompanies.filter((c) => !q || [c.name, c.kvk, c.city].filter(Boolean).join(" ").toLowerCase().includes(q)),
    [allCompanies, q],
  );
  const filteredPersons = useMemo(
    () => allPersons.filter((p) => !q || [p.full_name, p.email, p.phone].filter(Boolean).join(" ").toLowerCase().includes(q)),
    [allPersons, q],
  );

  const submitAdd = async () => {
    const name = addName.trim();
    if (!name) return;
    try {
      if (tab === "bedrijven") {
        const c = await createCompany.mutateAsync({ name });
        toast.success("Bedrijf toegevoegd");
        setSelCompany(c);
      } else {
        const { first_name, last_name } = splitName(name);
        const p = await createPerson.mutateAsync({ first_name, last_name });
        toast.success("Persoon toegevoegd");
        setSelPerson(p);
      }
      setAddOpen(false);
      setAddName("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Toevoegen mislukt");
    }
  };

  const loading = companies.isLoading || persons.isLoading;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Contacten</h1>
          <p className="mt-1 text-sm text-muted-foreground">Eén centrale database van bedrijven en personen.</p>
        </div>
        <Button onClick={() => { setAddName(""); setAddOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> {tab === "bedrijven" ? "Nieuw bedrijf" : "Nieuw persoon"}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:max-w-md">
        <Kpi icon={Building2} label="Bedrijven" value={String(allCompanies.length)} />
        <Kpi icon={User} label="Personen" value={String(allPersons.length)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
          {(["bedrijven", "personen"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder={tab === "bedrijven" ? "Zoek bedrijf…" : "Zoek persoon…"} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-80 w-full rounded-xl" />
      ) : tab === "bedrijven" ? (
        <div className="overflow-hidden rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Bedrijf</th>
                <th className="px-4 py-2.5 font-medium">KvK</th>
                <th className="px-4 py-2.5 font-medium">Plaats</th>
                <th className="px-4 py-2.5 text-right font-medium">Personen</th>
                <th className="px-4 py-2.5 text-right font-medium">Leads</th>
              </tr>
            </thead>
            <tbody>
              {filteredCompanies.map((c) => (
                <tr key={c.id} className="cursor-pointer border-b last:border-0 hover:bg-muted/40" onClick={() => setSelCompany(c)}>
                  <td className="px-4 py-2.5 font-medium text-foreground">{c.name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{c.kvk || "—"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{c.city || "—"}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">{c.company_persons?.[0]?.count ?? 0}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">{c.leads?.[0]?.count ?? 0}</td>
                </tr>
              ))}
              {filteredCompanies.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Geen bedrijven.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Naam</th>
                <th className="px-4 py-2.5 font-medium">E-mail</th>
                <th className="px-4 py-2.5 font-medium">Telefoon</th>
                <th className="px-4 py-2.5 text-right font-medium">Bedrijven</th>
                <th className="px-4 py-2.5 text-right font-medium">Leads</th>
              </tr>
            </thead>
            <tbody>
              {filteredPersons.map((p) => (
                <tr key={p.id} className="cursor-pointer border-b last:border-0 hover:bg-muted/40" onClick={() => setSelPerson(p)}>
                  <td className="px-4 py-2.5 font-medium text-foreground">{p.full_name || "(naamloos)"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{p.email || "—"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{p.phone || "—"}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">{p.company_persons?.[0]?.count ?? 0}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">{p.leads?.[0]?.count ?? 0}</td>
                </tr>
              ))}
              {filteredPersons.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Geen personen.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{tab === "bedrijven" ? "Nieuw bedrijf" : "Nieuw persoon"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>{tab === "bedrijven" ? "Bedrijfsnaam" : "Naam"}</Label>
            <Input
              autoFocus
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitAdd(); }}
              placeholder={tab === "bedrijven" ? "Bv. Acme Vastgoed BV" : "Bv. Jan de Vries"}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Annuleren</Button>
            <Button onClick={submitAdd} disabled={!addName.trim() || createCompany.isPending || createPerson.isPending}>Toevoegen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CompanyDetailSheet company={selCompany} open={!!selCompany} onOpenChange={(v) => !v && setSelCompany(null)} />
      <PersonDetailSheet person={selPerson} open={!!selPerson} onOpenChange={(v) => !v && setSelPerson(null)} />
    </div>
  );
}
