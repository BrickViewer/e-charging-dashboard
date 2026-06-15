import { describe, expect, it } from "vitest";
import {
  availableActions,
  classifyFault,
  isOpenStatus,
  isStaleHeartbeat,
  resolveBestContact,
} from "./faults";

describe("classifyFault", () => {
  it("markeert verbroken verbinding als storing", () => {
    expect(classifyFault({ connectivityState: "disconnected" })).toEqual({ isFault: true, reason: "connectivity" });
    expect(classifyFault({ connectivityState: "access-denied" })).toEqual({ isFault: true, reason: "connectivity" });
  });

  it("gezonde verbinding is geen storing", () => {
    expect(classifyFault({ connectivityState: "connected" }).isFault).toBe(false);
    expect(classifyFault({ connectivityState: "maybe-connected" }).isFault).toBe(false);
  });

  it("uitgeschakeld / wacht-op-eerste-verbinding / archived is nooit een storing", () => {
    expect(classifyFault({ connectivityState: "disconnected", isDisabled: true }).isFault).toBe(false);
    expect(classifyFault({ connectivityState: "pending-first-connection" }).isFault).toBe(false);
    expect(classifyFault({ connectivityState: "disconnected", operationalStatus: "archived" }).isFault).toBe(false);
  });
});

describe("isStaleHeartbeat", () => {
  const now = new Date("2026-06-15T12:00:00Z").getTime();
  it("true als hartslag ouder is dan de drempel", () => {
    expect(isStaleHeartbeat("2026-06-15T10:30:00Z", 60, now)).toBe(true); // 90 min
  });
  it("false binnen de drempel of zonder hartslag", () => {
    expect(isStaleHeartbeat("2026-06-15T11:30:00Z", 60, now)).toBe(false); // 30 min
    expect(isStaleHeartbeat(null, 60, now)).toBe(false);
    expect(isStaleHeartbeat("onzin", 60, now)).toBe(false);
  });
});

describe("workflow", () => {
  it("open statussen geven acties, gesloten niet", () => {
    expect(isOpenStatus("nieuw")).toBe(true);
    expect(isOpenStatus("opgelost")).toBe(false);
    expect(isOpenStatus("automatisch_hersteld")).toBe(false);
    expect(availableActions("nieuw").length).toBeGreaterThan(0);
    expect(availableActions("opgelost")).toEqual([]);
  });
});

describe("resolveBestContact", () => {
  it("verkiest de primaire persoon uit company_persons", () => {
    const c = resolveBestContact(
      { contact_name: "Klantveld", contact_phone: "010", contact_email: "k@x.nl" },
      [
        { is_primary: false, person: { full_name: "Tweede", phone: "020" } },
        { is_primary: true, role: "Huismeester", person: { full_name: "Jan Primair", phone: "030", email: "jan@x.nl", role: "Beheerder" } },
      ],
    );
    expect(c).toEqual({ name: "Jan Primair", email: "jan@x.nl", phone: "030", role: "Huismeester" });
  });

  it("valt terug op de klant-contactvelden", () => {
    const c = resolveBestContact({ contact_name: "Klantveld", contact_phone: "010", contact_email: "k@x.nl" }, []);
    expect(c).toEqual({ name: "Klantveld", email: "k@x.nl", phone: "010", role: null });
  });
});
