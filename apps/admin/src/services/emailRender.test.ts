// Rooktest op de e-mailrendering. Draait volledig in het geheugen: geen database, geen Resend,
// geen enkele echte mail. Bewaakt de twee dingen die stuk kunnen gaan bij het instelbaar maken:
// (1) zonder ingesteld sjabloon moet er LETTERLIJK hetzelfde uitkomen als voorheen, en
// (2) mét sjabloon moeten de placeholders correct en veilig ingevuld worden.
import { describe, it, expect } from "vitest";
import { renderSlots, fillPlaceholders, escapeHtml } from "../../../../supabase/functions/_shared/emailRender";
import { renderInviteEmail } from "../../../../supabase/functions/send-client-invitation/email-template";
import { renderClientMessageEmail } from "../../../../supabase/functions/send-client-message/message-email";
import { renderFaultEmail } from "../../../../supabase/functions/send-fault-notification/email-template";

/** Nep-Supabase-client. `row` = wat email_templates zou teruggeven; null = geen sjabloon ingesteld. */
function fakeSb(row: { slots: Record<string, string>; enabled: boolean } | null, faal = false) {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => {
                  if (faal) throw new Error("database onbereikbaar");
                  return { data: row };
                },
              };
            },
          };
        },
      };
    },
  };
}

describe("placeholders invullen", () => {
  it("vult bekende placeholders en escapet HTML", () => {
    expect(fillPlaceholders("Beste {{naam}},", { naam: "Jan & Co <B.V.>" }))
      .toBe("Beste Jan &amp; Co &lt;B.V.&gt;,");
  });

  it("escapet niet wanneer dat uit staat (tekstversie van een mail)", () => {
    expect(fillPlaceholders("Beste {{naam}},", { naam: "Jan & Co" }, false)).toBe("Beste Jan & Co,");
  });

  // Stil leegmaken zou een half afgemaakte zin opleveren zonder dat iemand het merkt.
  it("laat een onbekende placeholder ongemoeid staan", () => {
    expect(fillPlaceholders("Hoi {{bestaatniet}}", { naam: "x" })).toBe("Hoi {{bestaatniet}}");
  });

  it("escapeHtml dekt alle vijf de tekens", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });
});

describe("renderSlots", () => {
  it("geeft de standaardteksten als er geen sjabloon is ingesteld", async () => {
    const slots = await renderSlots(fakeSb(null), "klant-portaaluitnodiging", { contactnaam: "Jan" });
    expect(slots.onderwerp_standaard).toBe("Activeer uw E-Charging klantportaal");
    expect(slots.aanhef).toBe("Beste Jan,");
  });

  it("gebruikt het ingestelde slot en laat de rest op standaard", async () => {
    const slots = await renderSlots(
      fakeSb({ slots: { aanhef: "Hallo {{contactnaam}}!" }, enabled: true }),
      "klant-portaaluitnodiging",
      { contactnaam: "Jan" },
    );
    expect(slots.aanhef).toBe("Hallo Jan!");
    expect(slots.knoptekst).toBe("Account activeren");
  });

  it("negeert een uitgeschakeld sjabloon", async () => {
    const slots = await renderSlots(
      fakeSb({ slots: { aanhef: "Mag niet gebruikt worden" }, enabled: false }),
      "klant-portaaluitnodiging",
      { contactnaam: "Jan" },
    );
    expect(slots.aanhef).toBe("Beste Jan,");
  });

  // Een mail mag nooit blijven hangen op een instellingenprobleem.
  it("valt terug op de standaard als de database faalt", async () => {
    const slots = await renderSlots(fakeSb(null, true), "klant-portaaluitnodiging", { contactnaam: "Jan" });
    expect(slots.aanhef).toBe("Beste Jan,");
  });

  it("geeft een leeg object voor een onbekende sleutel", async () => {
    expect(await renderSlots(fakeSb(null), "bestaat-niet", {})).toEqual({});
  });
});

const inviteParams = {
  companyName: "Hofstede Vastgoed B.V.",
  contactName: "Jan de Vries",
  inviteUrl: "https://dashboard.e-charging.nl/uitnodiging/tok",
  expiresInDays: 14,
  fromName: "E-Charging",
  heroUrl: "https://dashboard.e-charging.nl/email/hero.png",
  clientNumber: 104,
};

describe("klantuitnodiging", () => {
  it("levert zonder sjabloon exact de oorspronkelijke tekst", () => {
    const m = renderInviteEmail(inviteParams);
    expect(m.subject).toBe("Activeer uw E-Charging klantportaal");
    expect(m.html).toContain("Beste Jan de Vries,");
    expect(m.html).toContain("Account activeren");
    expect(m.text).toContain("1. U kiest een wachtwoord en activeert het account.");
  });

  it("gebruikt de scope-variant bij installatie en beheer", () => {
    const m = renderInviteEmail({ ...inviteParams, needsInstallation: true });
    expect(m.subject).toBe("Maak alvast uw E-Charging account aan");
    expect(m.html).toContain("Wij plaatsen en koppelen binnenkort uw laadpalen");
  });

  it("neemt ingestelde teksten over in HTML én tekstversie", () => {
    const slots = { aanhef: "Hallo Jan!", knoptekst: "Nu starten", onderwerp_standaard: "Welkom bij E-Charging" };
    const m = renderInviteEmail(inviteParams, slots, slots);
    expect(m.subject).toBe("Welkom bij E-Charging");
    expect(m.html).toContain("Hallo Jan!");
    expect(m.html).toContain("Nu starten");
    expect(m.text).toContain("Hallo Jan!");
  });

  // De activatielink zit structureel in de HTML en mag niet weg te bewerken zijn.
  it("houdt de activatielink ook bij volledig overschreven teksten", () => {
    const slots = Object.fromEntries(
      ["aanhef", "knoptekst", "intro_zakelijk", "stap1", "stap2", "stap3_beheer", "voettekst"].map((n) => [n, "x"]),
    );
    const m = renderInviteEmail(inviteParams, slots, slots);
    expect(m.html).toContain(inviteParams.inviteUrl);
    expect(m.text).toContain(inviteParams.inviteUrl);
  });
});

describe("portaalbericht", () => {
  const p = {
    companyName: "Hofstede Vastgoed B.V.",
    contactName: "Jan",
    subject: "Uw afrekening van juni",
    message: "Hierbij uw afrekening.\nMet vriendelijke groet.",
    portalUrl: "https://dashboard.e-charging.nl/portal/berichten",
    logoUrl: "https://dashboard.e-charging.nl/email/logo.png",
    fromName: "Wessel",
  };

  it("houdt onderwerp en berichttekst van de medewerker intact", () => {
    const m = renderClientMessageEmail(p, { aanhef: "Hoi Jan!" }, { aanhef: "Hoi Jan!" });
    expect(m.subject).toBe("Uw afrekening van juni");
    expect(m.html).toContain("Hierbij uw afrekening.");
    expect(m.html).toContain("Hoi Jan!");
  });

  it("levert zonder sjabloon de oorspronkelijke omlijsting", () => {
    const m = renderClientMessageEmail(p);
    expect(m.html).toContain("Beste Jan,");
    expect(m.html).toContain("Bekijk in je portaal");
    expect(m.text).toContain("Met vriendelijke groet,");
  });
});

describe("storingsmelding", () => {
  const item = {
    chargePointName: "ZPG083357", clientName: "Hofstede", clientNumber: "#104",
    locationName: "Dwarsweg 10", locationAddress: "Dwarsweg 10, Zaltbommel",
    reason: "Offline", identifiers: "NLEFLEV9369311", contactName: "Jan", contactPhone: "0612345678",
    detailUrl: "https://dashboard.e-charging.nl/admin/storingen/1",
  };
  const base = { locationName: "Dwarsweg 10", overviewUrl: "https://dashboard.e-charging.nl/admin/storingen", logoUrl: "x" };

  it("gebruikt de enkelvoudskop bij één laadpunt", () => {
    const m = renderFaultEmail({ ...base, items: [item] });
    expect(m.subject).toBe("Storing gedetecteerd: ZPG083357");
    expect(m.html).toContain("Een laadpunt heeft een storing");
  });

  it("gebruikt de meervoudskop bij meerdere laadpunten", () => {
    const m = renderFaultEmail({ ...base, items: [item, { ...item, chargePointName: "ZPG083351" }] });
    expect(m.subject).toBe("Storing: 2 laadpunten op Dwarsweg 10");
  });

  it("neemt ingestelde teksten over", () => {
    const slots = { onderwerp_enkel: "Let op: storing", kop_enkel: "Er is een storing", knoptekst_overzicht: "Naar overzicht" };
    const m = renderFaultEmail({ ...base, items: [item] }, slots, slots);
    expect(m.subject).toBe("Let op: storing");
    expect(m.html).toContain("Er is een storing");
    expect(m.html).toContain("Naar overzicht");
  });
});
