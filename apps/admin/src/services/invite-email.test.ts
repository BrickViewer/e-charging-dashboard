import { describe, it, expect } from "vitest";
// De Deno edge-template (renderInviteEmail) gebruikt geen Deno-globals — alleen
// template strings + escapeHtml — dus importeerbaar in vitest. Deze test pint de
// scope-bewuste, begeleidende copy vast: installatie+beheer wordt nu DIRECT na
// tekenen uitgenodigd (vóór het koppelen) en krijgt een "maak alvast je account
// aan; wij koppelen straks je palen"-tekst; alleen-beheer houdt "portaal staat klaar".
import { renderInviteEmail } from "../../../../supabase/functions/send-client-invitation/email-template";

const base = {
  companyName: "Acme BV",
  contactName: "Jan Jansen",
  inviteUrl: "https://e-charging.nl/uitnodiging/abc123",
  expiresInDays: 14,
  fromName: "E-Charging",
  heroUrl: "https://dashboard.e-charging.nl/email/e-charging-invite-hero-v2.png",
  clientNumber: 42,
};

describe("renderInviteEmail — scope-bewuste begeleiding", () => {
  it("installatie+beheer (needsInstallation) → 'maak alvast je account aan' + palen koppelen straks", () => {
    const { subject, html, text } = renderInviteEmail({ ...base, needsInstallation: true });
    expect(subject).toBe("Maak alvast uw E-Charging account aan");
    // Begeleidende intro: account nu alvast, palen volgen.
    expect(html).toContain("u kunt nu alvast uw E-Charging account aanmaken");
    expect(text).toContain("u kunt nu alvast uw E-Charging account aanmaken");
    // Stap 3 gaat over de palen, niet over bestaande locaties.
    expect(html).toContain("Wij plaatsen en koppelen binnenkort uw laadpalen");
    expect(text).toContain("Wij plaatsen en koppelen binnenkort uw laadpalen");
    expect(html).not.toContain("E-Charging koppelt de juiste locaties");
  });

  it("alleen-beheer (geen installatie) → standaard 'portaal staat klaar' + locaties koppelen", () => {
    const { subject, html, text } = renderInviteEmail({ ...base, needsInstallation: false });
    expect(subject).toBe("Activeer uw E-Charging klantportaal");
    expect(html).toContain("het E-Charging klantportaal voorbereid");
    // Stap 3 gaat over bestaande locaties, niet over palen plaatsen.
    expect(html).toContain("E-Charging koppelt de juiste locaties aan uw klantprofiel");
    expect(text).toContain("E-Charging koppelt de juiste locaties aan uw klantprofiel");
    expect(html).not.toContain("Wij plaatsen en koppelen binnenkort uw laadpalen");
  });

  it("needsInstallation weggelaten → standaard (niet-begeleidende) tekst", () => {
    const { subject } = renderInviteEmail(base);
    expect(subject).toBe("Activeer uw E-Charging klantportaal");
  });

  it("particulier (bedrijfsnaam == contactnaam), alleen-beheer → neutrale intro zonder naamherhaling", () => {
    const { html } = renderInviteEmail({ ...base, companyName: "Jan Jansen", contactName: "Jan Jansen", needsInstallation: false });
    expect(html).toContain("Uw E-Charging klantportaal staat klaar");
    expect(html).not.toContain("Voor Jan Jansen is het E-Charging klantportaal voorbereid");
  });

  it("klantnummer ontbreekt → 'Wordt gekoppeld'-placeholder", () => {
    const { html } = renderInviteEmail({ ...base, clientNumber: null, needsInstallation: true });
    expect(html).toContain("Wordt gekoppeld");
  });
});
