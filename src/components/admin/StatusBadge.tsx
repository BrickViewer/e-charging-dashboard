interface StatusBadgeProps {
  status: string;
}

const statusConfig: Record<string, { className: string; label: string }> = {
  actief: { className: 'badge-actief', label: 'Actief' },
  prospect: { className: 'badge-prospect', label: 'Prospect' },
  offerte: { className: 'badge-offerte', label: 'Offerte' },
  getekend: { className: 'badge-prospect', label: 'Getekend' },
  inactief: { className: 'badge-inactief', label: 'Inactief' },
  // Quote statuses
  concept: { className: 'badge-inactief', label: 'Concept' },
  verstuurd: { className: 'badge-prospect', label: 'Verstuurd' },
  verlopen: { className: 'badge-error', label: 'Verlopen' },
  afgewezen: { className: 'badge-error', label: 'Afgewezen' },
  // Settlement statuses
  calculated: { className: 'badge-offerte', label: 'Berekend' },
  approved: { className: 'badge-prospect', label: 'Goedgekeurd' },
  paid: { className: 'badge-actief', label: 'Betaald' },
  overdue: { className: 'badge-error', label: 'Achterstallig' },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status] || { className: 'badge-inactief', label: status };
  return <span className={config.className}>{config.label}</span>;
}
