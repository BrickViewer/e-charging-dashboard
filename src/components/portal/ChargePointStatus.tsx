import { Wrench, Clock } from "lucide-react";

interface ChargePointStatusProps {
  onlineCount: number;
  offlineCount: number;
  totalCount: number;
}

export function ChargePointStatus({ onlineCount, offlineCount, totalCount }: ChargePointStatusProps) {
  return (
    <div className="flex items-center justify-center gap-6 sm:gap-12">
      <div className="flex items-center gap-3">
        <div className={`w-11 h-11 rounded-full flex items-center justify-center border ${
          offlineCount > 0
            ? "bg-[hsl(350_88%_62%/0.12)] border-[hsl(350_88%_62%/0.4)] text-[hsl(350_88%_70%)]"
            : "bg-card border-border text-muted-foreground"
        }`}>
          <Wrench className="w-5 h-5" strokeWidth={1.8} />
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest font-medium text-muted-foreground/80">
            Laadpaal off-line
          </p>
          <p className="text-lg font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>
            {offlineCount}
            <span className="text-xs text-muted-foreground/60 ml-1.5">/ {totalCount}</span>
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className={`w-11 h-11 rounded-full flex items-center justify-center border ${
          onlineCount > 0
            ? "bg-[hsl(140_70%_55%/0.12)] border-[hsl(140_70%_55%/0.4)] text-[hsl(140_70%_60%)]"
            : "bg-card border-border text-muted-foreground"
        }`}>
          <Clock className="w-5 h-5" strokeWidth={1.8} />
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest font-medium text-muted-foreground/80">
            Laadpalen on-line
          </p>
          <p className="text-lg font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>
            {onlineCount}
            <span className="text-xs text-muted-foreground/60 ml-1.5">/ {totalCount}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
