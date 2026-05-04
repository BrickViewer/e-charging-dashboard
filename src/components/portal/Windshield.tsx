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
      className="relative w-full overflow-hidden rounded-t-[3rem]"
      style={{
        height: "clamp(300px, 40vh, 440px)",
        boxShadow: "inset 0 0 0 1px hsl(var(--border) / 0.5), inset 0 -60px 80px -40px hsl(var(--background) / 0.85)",
      }}
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
