import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuoteById, useOrganization } from "@/hooks/useAdminData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Download, UserPlus } from "lucide-react";
import { formatEuro } from "@/services/calculations";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logoFullColorSvg from "@/assets/logo-full-color.svg";

const fmtRound = (v: number) => `€${v.toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export default function AdminQuoteDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: quote, isLoading } = useQuoteById(id);
  const { data: org } = useOrganization();
  const queryClient = useQueryClient();
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const snap = (quote?.calculation_snapshot || {}) as any;

  const handleCreateClientFromQuote = () => {
    if (!quote) return;
    navigate("/admin/klanten/nieuw", {
      state: {
        fromQuote: true,
        quoteId: quote.id,
        prospectCompany: quote.prospect_company || "",
        prospectContact: quote.prospect_contact || "",
        prospectEmail: quote.prospect_email || "",
        numChargePoints: quote.num_charge_points || 0,
        chargePointType: quote.charge_point_type || "ac",
        chargeRate: Number(quote.charge_rate_per_kwh || 0.45),
        energyCost: Number(quote.energy_cost_per_kwh || 0.25),
        revenueShare: Number(quote.revenue_share_pct || 50),
        ereRate: Number(quote.ere_rate_per_kwh || 0.10),
      },
    });
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!id) return;
    setUpdatingStatus(true);
    try {
      const updateData: any = { status: newStatus };
      if (newStatus === "getekend") updateData.signed_at = new Date().toISOString();
      const { error } = await supabase.from("quotes").update(updateData).eq("id", id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["admin-quote", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-quotes"] });
      toast.success(`Status gewijzigd naar ${newStatus}`);
    } catch (err: any) {
      toast.error(err.message || "Fout bij bijwerken");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleExportPDF = () => {
    if (!quote) return;
    const doc = new jsPDF();
    const orgName = org?.name || "E-Charging";
    const company = quote.prospect_company || (quote as any).clients?.company_name || "—";

    // Header — logo
    const logoImg = new Image();
    logoImg.src = logoFullColorSvg;
    try {
      doc.addImage(logoImg, "SVG", 14, 10, 50, 20);
    } catch {
      doc.setFontSize(20);
      doc.setTextColor(4, 127, 0);
      doc.text(orgName, 14, 22);
    }
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(org?.address || "", 14, 32);

    // Title
    doc.setFontSize(16);
    doc.setTextColor(0);
    doc.text(`Offerte ${quote.quote_number || ""}`, 14, 44);

    // Prospect info
    doc.setFontSize(10);
    doc.setTextColor(80);
    doc.text(`Bedrijf: ${company}`, 14, 56);
    if (quote.prospect_contact) doc.text(`Contact: ${quote.prospect_contact}`, 14, 62);
    if (quote.prospect_email) doc.text(`E-mail: ${quote.prospect_email}`, 14, 68);
    doc.text(`Datum: ${new Date(quote.created_at).toLocaleDateString("nl-NL")}`, 14, 74);
    if (quote.valid_until) doc.text(`Geldig tot: ${new Date(quote.valid_until).toLocaleDateString("nl-NL")}`, 14, 80);

    // Parameters table
    autoTable(doc, {
      startY: 90,
      head: [["Parameter", "Waarde"]],
      body: [
        ["Aantal laadpunten", String(quote.num_charge_points || "—")],
        ["Type", (quote.charge_point_type || "ac").toUpperCase()],
        ["kWh/punt/maand", String(quote.estimated_kwh_per_point || "—")],
        ["Laadtarief (€/kWh)", formatEuro(Number(quote.charge_rate_per_kwh || 0))],
        ["Energiekost (€/kWh)", formatEuro(Number(quote.energy_cost_per_kwh || 0))],
        ["Klantaandeel", `${quote.revenue_share_pct || 50}%`],
        ["ERE-tarief (€/kWh)", formatEuro(Number(quote.ere_rate_per_kwh || 0))],
        ["Zonnepanelen", quote.has_solar ? `Ja (${quote.solar_percentage}%)` : "Nee"],
      ],
      theme: "grid",
      headStyles: { fillColor: [4, 127, 0] },
    });

    // Calculation results
    const calcY = (doc as any).lastAutoTable?.finalY + 10 || 180;
    autoTable(doc, {
      startY: calcY,
      head: [["Berekening (jaarbasis)", "Bedrag"]],
      body: [
        ["Bruto laadopbrengst", fmtRound(snap.grossRevenueYear || 0)],
        ["Stroomkosten", `-${fmtRound(snap.energyCostYear || 0)}`],
        ["Platformkosten", `-${fmtRound(snap.efluxCostYear || 0)}`],
        ["Netto marge", fmtRound(snap.netMarginYear || 0)],
        [`Klantaandeel (${quote.revenue_share_pct || 50}%)`, fmtRound(snap.clientShareYear || 0)],
        ["ERE-schatting", fmtRound(snap.ereEstimateYear || 0)],
        ["Totaal klant/jaar", fmtRound(snap.clientTotalYear || 0)],
      ],
      theme: "grid",
      headStyles: { fillColor: [4, 127, 0] },
    });

    // Notes
    if (quote.notes) {
      const notesY = (doc as any).lastAutoTable?.finalY + 10 || 260;
      doc.setFontSize(10);
      doc.setTextColor(80);
      doc.text("Notities:", 14, notesY);
      doc.text(quote.notes, 14, notesY + 6);
    }

    doc.save(`Offerte-${quote.quote_number || "concept"}.pdf`);
    toast.success("PDF gedownload");
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Offerte niet gevonden</p>
        <Link to="/admin/offertes"><Button variant="link">Terug naar offertes</Button></Link>
      </div>
    );
  }

  const company = quote.prospect_company || (quote as any).clients?.company_name || "—";

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/admin/offertes">
            <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold">{quote.quote_number || "Offerte"}</h1>
            <p className="text-muted-foreground">{company}</p>
          </div>
          <StatusBadge status={quote.status || "concept"} />
        </div>
        <div className="flex items-center gap-2">
          <Select value={quote.status || "concept"} onValueChange={handleStatusChange} disabled={updatingStatus}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="concept">Concept</SelectItem>
              <SelectItem value="verstuurd">Verstuurd</SelectItem>
              <SelectItem value="getekend">Getekend</SelectItem>
              <SelectItem value="verlopen">Verlopen</SelectItem>
              <SelectItem value="afgewezen">Afgewezen</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handleExportPDF}>
            <Download className="w-4 h-4 mr-2" />PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Details */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Prospect</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Bedrijf</span><span>{company}</span></div>
              {quote.prospect_contact && <div className="flex justify-between"><span className="text-muted-foreground">Contact</span><span>{quote.prospect_contact}</span></div>}
              {quote.prospect_email && <div className="flex justify-between"><span className="text-muted-foreground">E-mail</span><span>{quote.prospect_email}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">Datum</span><span>{new Date(quote.created_at).toLocaleDateString("nl-NL")}</span></div>
              {quote.valid_until && <div className="flex justify-between"><span className="text-muted-foreground">Geldig tot</span><span>{new Date(quote.valid_until).toLocaleDateString("nl-NL")}</span></div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Parameters</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Laadpunten</span><span>{quote.num_charge_points}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span>{(quote.charge_point_type || "ac").toUpperCase()}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">kWh/punt/maand</span><span>{quote.estimated_kwh_per_point}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Laadtarief</span><span>{formatEuro(Number(quote.charge_rate_per_kwh || 0))}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Energiekost</span><span>{formatEuro(Number(quote.energy_cost_per_kwh || 0))}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Klantaandeel</span><span>{quote.revenue_share_pct}%</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">ERE-tarief</span><span>{formatEuro(Number(quote.ere_rate_per_kwh || 0))}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Zonnepanelen</span><span>{quote.has_solar ? `Ja (${quote.solar_percentage}%)` : "Nee"}</span></div>
            </CardContent>
          </Card>

          {quote.notes && (
            <Card>
              <CardHeader><CardTitle className="text-base">Notities</CardTitle></CardHeader>
              <CardContent><p className="text-sm text-muted-foreground whitespace-pre-wrap">{quote.notes}</p></CardContent>
            </Card>
          )}
        </div>

        {/* Right: Calculation */}
        <div className="space-y-4">
          <Card className="border-primary/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-primary text-base">Berekening — Jaarbasis</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span>Bruto laadopbrengst</span><span>{fmtRound(snap.grossRevenueYear || 0)}</span></div>
              <div className="flex justify-between"><span>Stroomkosten</span><span className="text-destructive">-{fmtRound(snap.energyCostYear || 0)}</span></div>
              <div className="flex justify-between"><span>Platformkosten</span><span className="text-destructive">-{fmtRound(snap.efluxCostYear || 0)}</span></div>
              <div className="border-t border-border my-2" />
              <div className="flex justify-between font-medium"><span>Netto marge</span><span>{fmtRound(snap.netMarginYear || 0)}</span></div>
              <div className="border-t border-border my-2" />
              <div className="flex justify-between font-semibold"><span>Klantaandeel ({quote.revenue_share_pct || 50}%)</span><span>{fmtRound(snap.clientShareYear || 0)}</span></div>
              <div className="flex justify-between"><span>ERE-schatting</span><span>{fmtRound(snap.ereEstimateYear || 0)}</span></div>
              <div className="border-t border-border my-2" />
              <div className="flex justify-between text-lg font-bold text-primary">
                <span>Totaal klant/jaar</span><span>{fmtRound(snap.clientTotalYear || 0)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">E-Charging resultaat</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span>E-Charging marge</span><span>{fmtRound(snap.echargingShareYear || 0)}</span></div>
              <div className="flex justify-between"><span>Platformkosten</span><span>{fmtRound(snap.efluxCostYear || 0)}</span></div>
              <div className="border-t border-border my-2" />
              <div className="flex justify-between font-bold"><span>E-Charging omzet/jaar</span><span>{fmtRound(snap.echargingTotalYear || 0)}</span></div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
