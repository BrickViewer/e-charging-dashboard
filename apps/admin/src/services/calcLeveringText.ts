// Genereert de "Levering en installatie"-tekst voor de offerte uit de
// calculatie-samenvatting. Volgt het model van DEFAULT_LEVERING_TEXT
// (offerTemplate.ts) maar met de echte aantallen/modellen — en zonder
// uren of kostprijzen (intern!).

import type { CalcSummary } from "./calcTypes";

const stuks = (n: number) => `${n} ${n === 1 ? "stuk" : "stuks"}`;

export function generateLeveringText(summary: CalcSummary): string {
  const paras: string[] = [];

  const sockets = summary.numSockets ?? 0;
  const poles = summary.numPoles ?? 0;
  const model = (summary.chargerModel ?? "").trim();

  if (sockets > 0 && model) {
    if (poles > 0) {
      paras.push(
        `Het leveren, monteren en aansluiten van ${stuks(sockets)} ${model} gemonteerd op ${stuks(poles)} ${poles === 1 ? "nieuwe laadpaal" : "nieuwe laadpalen"}.`,
      );
    } else {
      paras.push(`Het leveren, monteren en aansluiten van ${stuks(sockets)} ${model}.`);
    }
  }

  const lb = (summary.loadBalancerModel ?? "").trim();
  if (lb) {
    paras.push(
      `T.b.v. de load balancing wordt er in de meterkast ${lb} geplaatst. Deze regelt het vermogen wat voor de laadpaal beschikbaar wordt gesteld t.o.v. het totaal afgenomen vermogen van de aansluiting. Tevens kan hiermee ook bij een dynamisch energiecontract op de voordeligste momenten van de dag worden geladen. Ook met opgewekte zonne-energie kan geladen worden.`,
    );
  }

  const groepen = summary.eindgroepen ?? 0;
  if (groepen > 0) {
    const amp = summary.eindgroepAmperage ? ` van ${summary.eindgroepAmperage}A` : "";
    paras.push(
      groepen === 1
        ? `Meterkast wordt uitgebreid met 1 eindgroep${amp}.`
        : `Meterkast wordt uitgebreid met ${groepen} eindgroepen${amp}.`,
    );
  }

  return paras.join("\n\n");
}
