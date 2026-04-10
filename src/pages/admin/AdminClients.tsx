import { useAllClients } from "@/hooks/useAdminData";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Plus, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

const PAGE_SIZE = 20;

export default function AdminClients() {
  const { data: clients, isLoading } = useAllClients();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("alle");
  const [page, setPage] = useState(0);
  const debouncedSearch = useDebouncedValue(search, 300);

  const filtered = (clients || []).filter(c => {
    const matchesSearch =
      c.company_name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      (c.contact_name || "").toLowerCase().includes(debouncedSearch.toLowerCase());
    const matchesStatus = statusFilter === "alle" || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Reset page when filters change
  const handleSearch = (v: string) => { setSearch(v); setPage(0); };
  const handleStatus = (v: string) => { setStatusFilter(v); setPage(0); };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Klanten</h1>
        <Link to="/admin/klanten/nieuw">
          <Button><Plus className="w-4 h-4 mr-2" />Klant toevoegen</Button>
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Zoek klant..." value={search} onChange={e => handleSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={handleStatus}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle statussen</SelectItem>
            <SelectItem value="prospect">Prospect</SelectItem>
            <SelectItem value="offerte">Offerte</SelectItem>
            <SelectItem value="actief">Actief</SelectItem>
            <SelectItem value="inactief">Inactief</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3 font-medium text-muted-foreground">Bedrijf</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Contact</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Locaties</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Laadpunten</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Aangemaakt</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="p-3"><Skeleton className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))}
                {!isLoading && paginated.map((c: any) => {
                  const locs = c.locations || [];
                  const cps = locs.flatMap((l: any) => l.charge_points || []);
                  return (
                    <tr
                      key={c.id}
                      className="border-b border-border last:border-0 hover:bg-accent/50 cursor-pointer"
                      onClick={() => navigate(`/admin/klanten/${c.id}`)}
                    >
                      <td className="p-3 font-medium">{c.company_name}</td>
                      <td className="p-3 text-muted-foreground">{c.contact_name}</td>
                      <td className="p-3 text-right">{locs.length}</td>
                      <td className="p-3 text-right">{cps.length}</td>
                      <td className="p-3"><StatusBadge status={c.status || "prospect"} /></td>
                      <td className="p-3 text-muted-foreground">
                        {new Date(c.created_at).toLocaleDateString("nl-NL")}
                      </td>
                    </tr>
                  );
                })}
                {!isLoading && filtered.length === 0 && (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Geen klanten gevonden</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between p-3 border-t border-border">
              <span className="text-sm text-muted-foreground">
                {filtered.length} klanten — pagina {page + 1} van {totalPages}
              </span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
