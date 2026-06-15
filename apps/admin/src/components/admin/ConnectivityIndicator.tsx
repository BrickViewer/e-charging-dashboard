interface ConnectivityIndicatorProps {
  state: string;
  showLabel?: boolean;
}

const stateConfig: Record<string, { color: string; label: string }> = {
  connected: { color: 'bg-green-500', label: 'Connected' },
  'maybe-connected': { color: 'bg-yellow-500', label: 'Mogelijk verbonden' },
  disconnected: { color: 'bg-muted-foreground', label: 'Niet verbonden' },
  'access-denied': { color: 'bg-red-500', label: 'Toegang geweigerd' },
  'pending-first-connection': { color: 'bg-blue-500', label: 'Wacht op eerste verbinding' },
  unknown: { color: 'bg-foreground/75', label: 'Onbekend' },
};

export function ConnectivityIndicator({ state, showLabel = true }: ConnectivityIndicatorProps) {
  const config = stateConfig[state] || stateConfig.unknown;

  return (
    <div className="flex items-center gap-2">
      <span className={`inline-block w-2.5 h-2.5 rounded-full ${config.color}`} />
      {showLabel && <span className="text-sm">{config.label}</span>}
    </div>
  );
}
