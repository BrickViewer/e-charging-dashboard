interface StatusBadgeProps {
  status: string;
}

const statusConfig: Record<string, { className: string; label: string }> = {
  actief: { className: 'badge-actief', label: 'Actief' },
  inactief: { className: 'badge-inactief', label: 'Inactief' },
  verwijderd: { className: 'badge-error', label: 'Verwijderd' },
  // Quote statuses
  concept: { className: 'badge-inactief', label: 'Concept' },
  verstuurd: { className: 'badge-prospect', label: 'Verstuurd' },
  verlopen: { className: 'badge-error', label: 'Verlopen' },
  afgewezen: { className: 'badge-error', label: 'Afgewezen' },
  // Settlement statuses
  live: { className: 'badge-prospect', label: 'Lopend' },
  calculated: { className: 'badge-offerte', label: 'Berekend' },
  approved: { className: 'badge-actief', label: 'Goedgekeurd' },
  paid: { className: 'badge-actief', label: 'Uitbetaald' },
  invoice_sent: { className: 'badge-prospect', label: 'Factuur open' },
  invoice_paid: { className: 'badge-actief', label: 'Factuur voldaan' },
  charged_back: { className: 'badge-error', label: 'Legacy incasso' },
  overdue: { className: 'badge-error', label: 'Achterstallig' },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status] || { className: 'badge-inactief', label: status };
  return <span className={config.className}>{config.label}</span>;
}
