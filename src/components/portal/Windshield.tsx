import { SkyBackdrop } from "./world/SkyBackdrop";
import { HorizonLine } from "./world/HorizonLine";
import { ChargePointBuilding } from "./world/ChargePointBuilding";
import { PersonFigure } from "./world/PersonFigure";
import { MailboxIcon } from "./world/MailboxIcon";
import { CoinPillar } from "./world/CoinPillar";

// "Voorruit" — het uitzicht boven het stuur. Bevat sky, horizon en
// vier interactieve wereld-objecten die navigeren naar sub-pagina's.
export function Windshield() {
  return (
    <div
      className="relative w-full overflow-hidden rounded-t-[3rem] border border-b-0 border-border/60"
      style={{ height: "clamp(280px, 38vh, 420px)" }}
    >
      <SkyBackdrop />
      <HorizonLine />

      {/* Wereld-objecten — absolute geplaatst op het canvas */}
      {/* Voorgrond links: laadpaal */}
      <ChargePointBuilding className="bottom-2 left-[10%] sm:left-[14%]" />

      {/* Voorgrond rechts: persoon */}
      <PersonFigure className="bottom-4 right-[12%] sm:right-[16%]" />

      {/* Achter-mid links: postbus */}
      <MailboxIcon className="bottom-[24%] left-[36%] hidden sm:block" />

      {/* Achter-mid rechts: munt */}
      <CoinPillar className="bottom-[26%] right-[38%] hidden sm:block" />
    </div>
  );
}
