import { Phone, MapPin, Mail } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ReactNode } from "react";

interface ContactIconBarProps {
  phone?: string | null;
  email?: string | null;
  whatsappPhone?: string | null;
  mapsUrl?: string | null;
}

interface IconTileProps {
  icon: ReactNode;
  label: string;
  tooltip: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
}

function IconTile({ icon, label, tooltip, href, onClick, disabled }: IconTileProps) {
  const content = (
    <div
      className={`group flex flex-col items-center gap-2 transition-opacity ${
        disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
      }`}
    >
      <div
        className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center transition-all
          ${disabled
            ? "bg-card border border-border"
            : "bg-card border border-border group-hover:border-primary/50 group-hover:bg-card/80 group-active:scale-95"}
        `}
      >
        {icon}
      </div>
      <span className="text-[10px] uppercase tracking-widest font-medium text-muted-foreground/80">
        {label}
      </span>
    </div>
  );

  const wrapped = href && !disabled ? (
    <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
      {content}
    </a>
  ) : onClick && !disabled ? (
    <button onClick={onClick} type="button">{content}</button>
  ) : content;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div>{wrapped}</div>
      </TooltipTrigger>
      <TooltipContent side="bottom">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.198-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.501-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12.05 21.785h-.005a9.87 9.87 0 0 1-5.031-1.378l-.36-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884zm8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
  </svg>
);

export function ContactIconBar({ phone, email, whatsappPhone, mapsUrl }: ContactIconBarProps) {
  const phoneClean = phone?.replace(/\s+/g, "");
  const whatsClean = (whatsappPhone ?? phone)?.replace(/[^0-9+]/g, "");

  return (
    <div className="flex items-center justify-center gap-6 sm:gap-10">
      <IconTile
        icon={<Phone className="w-6 h-6 text-primary" strokeWidth={1.8} />}
        label="Telefoon"
        tooltip={phoneClean ? `Bel ons: ${phone}` : "Telefoonnummer niet ingesteld"}
        href={phoneClean ? `tel:${phoneClean}` : undefined}
        disabled={!phoneClean}
      />
      <IconTile
        icon={<MapPin className="w-6 h-6 text-primary" strokeWidth={1.8} />}
        label="Maps"
        tooltip={mapsUrl ? "Bekijk locaties op Google Maps" : "Geen locatie beschikbaar"}
        href={mapsUrl ?? undefined}
        disabled={!mapsUrl}
      />
      <IconTile
        icon={<WhatsAppIcon className="w-6 h-6 text-[hsl(140_70%_55%)]" />}
        label="WhatsApp"
        tooltip={whatsClean ? `Stuur een WhatsApp naar ${whatsappPhone ?? phone}` : "WhatsApp niet beschikbaar"}
        href={whatsClean ? `https://wa.me/${whatsClean.replace(/^\+/, "")}` : undefined}
        disabled={!whatsClean}
      />
      <IconTile
        icon={<Mail className="w-6 h-6 text-primary" strokeWidth={1.8} />}
        label="Berichten"
        tooltip={email ? `Stuur een mail naar ${email}` : "E-mail niet ingesteld"}
        href={email ? `mailto:${email}` : undefined}
        disabled={!email}
      />
    </div>
  );
}
