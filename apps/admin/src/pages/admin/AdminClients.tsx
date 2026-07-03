import { useAllClients } from "@/hooks/useAdminData";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { KpiTile } from "@/components/admin/KpiTile";
import {
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Mail,
  MailCheck,
  MailWarning,
  MailX,
  Users,
  Building2,
  Landmark,
  CheckCircle,
  ExternalLink,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import type { ClientWithRelations } from "@/types/db";

const PAGE_SIZE = 20;

// "Actief" = statuskolom 'actief', waarbij een lege/ontbrekende status óók als 'actief' telt —
// net als de rij-badge (die `status || "actief"` toont). Deze ene regel wordt gedeeld door de
// Actief-KPI, het Actief-filter én de badge, zodat ze nooit uiteenlopen.
const isActiveClient = (c: ClientWithRelations) => (c.status || "actief") === "actief";

function PortalStatus({ client }: { client: ClientWithRelations }) {
  if (client.portal_user_id) {
    return (
      <span title="Account actief — klant kan inloggen" className="inline-flex">
        <MailCheck className="w-4 h-4 text-primary" />
      </span>
    );
  }
  const inv = client.latest_invitation;
  if (!inv) {
    return (
      <span title="Nog geen uitnodiging verstuurd" className="inline-flex">
        <MailX className="w-4 h-4 text-muted-foreground" />
      </span>
    );
  }
  const isExpired =
    inv.status === "pending" && new Date(inv.expires_at).getTime() < Date.now();
  if (inv.status === "accepted") {
    return (
      <span title="Uitnodiging geaccepteerd" className="inline-flex">
        <MailCheck className="w-4 h-4 text-primary" />
      </span>
    );
  }
  if (inv.status === "expired" || isExpired) {
    return (
      <span title="Uitnodiging verlopen — stuur opnieuw" className="inline-flex">
        <MailWarning className="w-4 h-4 text-destructive" />
      </span>
    );
  }
  if (inv.status === "revoked") {
    return (
      <span title="Uitnodiging ingetrokken" className="inline-flex">
        <MailX className="w-4 h-4 text-muted-foreground" />
      </span>
    );
  }
  return (
    <span
      title={`Uitnodiging verstuurd, vervalt ${new Date(
        inv.expires_at,
      ).toLocaleDateString("nl-NL")}`}
      className="inline-flex"
    >
      <Mail className="w-4 h-4 text-[hsl(var(--status-amber))]" />
    </span>
  );
}

function PaymentStatus({ client }: { client: ClientWithRelations }) {
  const status = client.payment_onboarding_status;
  if (status === "saved") {
    return (
      <span title="Betaalgegevens opgeslagen" className="inline-flex">
        <CheckCircle className="w-4 h-4 text-primary" />
      </span>
    );
  }
  return (
    <span title="Betaalgegevens ontbreken" className="inline-flex">
      <Landmark className="w-4 h-4 text-muted-foreground/50" />
    </span>
  );
}

export default function AdminClients() {
  const { data: clients, isLoading, isError, refetch } = useAllClients();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("zichtbaar");
  const [page, setPage] = useState(0);
  const debouncedSearch = useDebouncedValue(search, 300);

  const filtered = useMemo(() => {
    return (clients || []).filter((c) => {
      const q = debouncedSearch.trim().toLowerCase();
      const isDeleted = c.status === "verwijderd";
      const clientNumber = c.client_number ? String(c.client_number) : "";
      const matchesSearch =
        !q ||
        Boolean(clientNumber && `#${clientNumber}`.includes(q)) ||
        Boolean(clientNumber && clientNumber.includes(q)) ||
        c.company_name.toLowerCase().includes(q) ||
        (c.contact_name || "").toLowerCase().includes(q) ||
        (c.contact_email || "").toLowerCase().includes(q);
      const matchesStatus =
        statusFilter === "zichtbaar"
          ? !isDeleted
          : statusFilter === "alle"
          ? true
          : statusFilter === "actief"
          ? isActiveClient(c)
          : c.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [clients, debouncedSearch, statusFilter]);

  const kpis = useMemo(() => {
    const list = (clients || []).filter((c) => c.status !== "verwijderd");
    const active = list.filter(isActiveClient).length;
    const paymentReady = list.filter((c) => c.payment_onboarding_status === "saved").length;
    const pendingInvites = list.filter((c) => {
      const inv = c.latest_invitation;
      if (c.portal_user_id) return false;
      if (!inv) return false;
      // Alleen écht-open uitnodigingen: pending én nog niet verlopen. Een verlopen pending
      // markeert de rij-indicator als "verlopen", dus die telt hier niet als open mee.
      return (
        inv.status === "pending" &&
        new Date(inv.expires_at).getTime() >= Date.now()
      );
    }).length;
    return {
      total: list.length,
      active,
      paymentReady,
      pendingInvites,
    };
  }, [clients]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // Klem de pagina-index als de gefilterde set onder de huidige pagina krimpt (bijv. na een
  // filter/refetch), zodat we niet op een lege pagina blijven hangen.
  const currentPage = Math.min(page, totalPages - 1);
  useEffect(() => {
    if (page !== currentPage) setPage(currentPage);
  }, [page, currentPage]);
  const paginated = filtered.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  );

  const handleSearch = (v: string) => {
    setSearch(v);
    setPage(0);
  };
  const handleStatus = (v: string) => {
    setStatusFilter(v);
    setPage(0);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Klanten</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Vastgoedeigenaren met laadpunten via E-Charging
          </p>
        </div>
        <Link to="/admin/klanten/nieuw">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Klant toevoegen
          </Button>
        </Link>
      </div>

      {isError ? (
        <Card className="border-destructive/25 bg-destructive/5">
          <CardContent className="p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-destructive" />
              <div className="flex-1">
                <p className="font-medium">Kon klanten niet laden</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  De klantgegevens konden niet worden opgehaald. Probeer het opnieuw.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => refetch()}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Opnieuw proberen
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile
          label="Totaal klanten"
          value={String(kpis.total)}
          icon={<Users className="w-4 h-4" />}
        />
        <KpiTile
          label="Actief"
          value={String(kpis.active)}
          subtitle={
            kpis.total > 0
              ? `${Math.round((kpis.active / kpis.total) * 100)}% van portfolio`
              : undefined
          }
          icon={<Building2 className="w-4 h-4" />}
          accent="primary"
        />
        <KpiTile
          label="Betaalgegevens"
          value={`${kpis.paymentReady} / ${kpis.total}`}
          subtitle={
            kpis.total > 0 && kpis.paymentReady < kpis.total
                ? `${kpis.total - kpis.paymentReady} ontbreken nog`
                : "Alle gegevens opgeslagen"
          }
          icon={<Landmark className="w-4 h-4" />}
          accent="blue"
        />
        <KpiTile
          label="Open uitnodigingen"
          value={String(kpis.pendingInvites)}
          subtitle={
            kpis.pendingInvites > 0 ? "Wachten op acceptatie" : "Geen pending"
          }
          icon={<Mail className="w-4 h-4" />}
          accent={kpis.pendingInvites > 0 ? "amber" : "muted"}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Zoek op klantnummer, naam, contact, e-mail…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9 portal-card"
          />
        </div>
        <Select value={statusFilter} onValueChange={handleStatus}>
          <SelectTrigger className="w-full sm:w-[170px] portal-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="zichtbaar">Zichtbare klanten</SelectItem>
            <SelectItem value="actief">Actief</SelectItem>
            <SelectItem value="inactief">Inactief</SelectItem>
            <SelectItem value="verwijderd">Verwijderde klantprofielen</SelectItem>
            <SelectItem value="alle">Alle klanten</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabel */}
      <Card className="portal-card">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left p-3 cockpit-section-label">Klant</th>
                  <th className="text-left p-3 cockpit-section-label">Contact</th>
                  <th className="text-right p-3 cockpit-section-label">Locaties</th>
                  <th className="text-right p-3 cockpit-section-label">Laadpunten</th>
                  <th className="text-left p-3 cockpit-section-label">Status</th>
                  <th className="text-center p-3 cockpit-section-label" title="Portal account">
                    Portal
                  </th>
                  <th className="text-center p-3 cockpit-section-label" title="Betaalgegevens">
                    Bank
                  </th>
                  <th className="text-left p-3 cockpit-section-label">Aangemaakt</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {isLoading &&
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-border">
                      {Array.from({ length: 9 }).map((_, j) => (
                        <td key={j} className="p-3">
                          <Skeleton className="h-4 w-full" />
                        </td>
                      ))}
                    </tr>
                  ))}
                {!isLoading &&
                  paginated.map((c) => {
                    const locs = c.locations || [];
                    const cps = locs.flatMap((l) => l.charge_points || []);
                    const isDeleted = c.status === "verwijderd";
                    const cpsOnline = cps.filter(
                      (cp) => cp.status === "online" || cp.status === "in_use",
                    ).length;
                    return (
                      <tr
                        key={c.id}
                        role="button"
                        tabIndex={0}
                        aria-label={`Open klant ${c.company_name}`}
                        className={`border-b border-border last:border-0 hover:bg-accent/40 focus-visible:bg-accent/60 focus-visible:outline-none cursor-pointer transition-colors group ${
                          isDeleted ? "opacity-60" : ""
                        }`}
                        onClick={() => navigate(`/admin/klanten/${c.id}`)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            navigate(`/admin/klanten/${c.id}`);
                          }
                        }}
                      >
                        <td className="p-3">
                          <p className="font-medium text-foreground">
                            {c.client_number && (
                              <span className="mr-2 text-xs font-semibold tabular-nums text-primary">
                                #{c.client_number}
                              </span>
                            )}
                            {c.companies?.name ?? c.company_name}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {(c.companies?.kvk ?? c.kvk) && (
                              <span className="text-xs text-muted-foreground">KvK {c.companies?.kvk ?? c.kvk}</span>
                            )}
                            {c.company_id && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); navigate(`/sales/contacten?company=${c.company_id}`); }}
                                className="text-xs text-primary/80 hover:text-primary hover:underline focus-visible:outline-none focus-visible:underline"
                                title="Open bedrijfsdossier"
                              >
                                → Bedrijfsdossier
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-muted-foreground">
                          <div>{c.persons?.full_name ?? c.contact_name ?? "—"}</div>
                          {(c.persons?.email ?? c.contact_email) && (
                            <div className="text-xs text-muted-foreground/70 mt-0.5">
                              {c.persons?.email ?? c.contact_email}
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          {locs.length || "—"}
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          {cps.length > 0 ? (
                            <span>
                              <span
                                className={
                                  cpsOnline === cps.length
                                    ? "text-primary"
                                    : cpsOnline === 0
                                    ? "text-muted-foreground"
                                    : "text-foreground"
                                }
                              >
                                {cpsOnline}
                              </span>
                              <span className="text-muted-foreground/60">
                                {" "}
                                / {cps.length}
                              </span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-3">
                          <StatusBadge status={c.status || "actief"} />
                        </td>
                        <td className="p-3 text-center">
                          <PortalStatus client={c} />
                        </td>
                        <td className="p-3 text-center">
                          <PaymentStatus client={c} />
                        </td>
                        <td className="p-3 text-muted-foreground text-xs">
                          {new Date(c.created_at).toLocaleDateString("nl-NL")}
                        </td>
                        <td className="p-3">
                          <ExternalLink className="w-4 h-4 text-muted-foreground/40 group-hover:text-foreground transition-colors" />
                        </td>
                      </tr>
                    );
                  })}
                {!isLoading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-12 text-center text-muted-foreground">
                      Geen klanten gevonden voor deze filters
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between p-3 border-t border-border">
              <span className="text-xs text-muted-foreground tracking-wide">
                {filtered.length} klanten · pagina {currentPage + 1} van {totalPages}
              </span>
              <div className="flex gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === 0}
                  onClick={() => setPage(currentPage - 1)}
                  className="portal-card"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages - 1}
                  onClick={() => setPage(currentPage + 1)}
                  className="portal-card"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
        </>
      )}
    </div>
  );
}
