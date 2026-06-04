// Gauge-max met RONDE kwart-ticks. De gauge zet labels op 0/¼/½/¾/1 van de max,
// dus de max moet 4× een ronde stap zijn (anders worden ¼/¾ lelijk: 375/1125 e.d.).
// Kies een ronde stap S ∈ {1,2,2.5,5,10}×10ⁿ zó dat 4·S ≥ value×1.15 (kop-ruimte),
// en geef max = 4·S. Zo zijn alle 5 ticks ronde getallen.
//   97,55  -> 200  (0/50/100/150/200)
//   775,06 -> 1000 (0/250/500/750/1000)
//   1614   -> 2000 (0/500/1000/1500/2000)
//   0      -> 100
export function niceQuarterMax(value: number, hint?: number): number {
  const target = Math.max(value, hint ?? 0, 0) * 1.15;
  if (target <= 0) return 100;
  const rough = target / 4; // de kwart-stap moet rond zijn
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / magnitude;
  let step: number;
  if (norm <= 1) step = 1;
  else if (norm <= 2) step = 2;
  else if (norm <= 2.5) step = 2.5;
  else if (norm <= 5) step = 5;
  else step = 10;
  return 4 * step * magnitude;
}

// Bereken een visueel "nice" gauge-max op basis van waarde en (optioneel) historisch gemiddelde.
export function niceGaugeMax(value: number, hint?: number): number {
  const candidate = Math.max(value, hint ?? 0) * 1.3;
  if (candidate <= 0) return 100;
  const magnitude = Math.pow(10, Math.floor(Math.log10(candidate)));
  const normalized = candidate / magnitude;
  let nice;
  if (normalized <= 1) nice = 1;
  else if (normalized <= 1.5) nice = 1.5;
  else if (normalized <= 2) nice = 2;
  else if (normalized <= 2.5) nice = 2.5;
  else if (normalized <= 3) nice = 3;
  else if (normalized <= 5) nice = 5;
  else if (normalized <= 7.5) nice = 7.5;
  else nice = 10;
  return nice * magnitude;
}
