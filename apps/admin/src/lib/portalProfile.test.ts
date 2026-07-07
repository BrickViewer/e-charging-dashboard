import { describe, it, expect } from "vitest";

import { validateBankForm, type BankFormState } from "./portalProfile";

const validForm: BankFormState = {
  payoutAccountHolderName: "Jan Jansen",
  payoutIban: "NL91ABNA0417164300", // geldig test-IBAN
  payoutBic: "",
  currentPassword: "",
};

describe("validateBankForm — wachtwoord alleen bij wijzigen", () => {
  it("eist GEEN wachtwoord bij de eerste keer (requirePassword=false)", () => {
    const errors = validateBankForm(validForm, false);
    expect(errors.currentPassword).toBeUndefined();
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it("eist WEL een wachtwoord bij wijzigen (requirePassword=true) als het leeg is", () => {
    const errors = validateBankForm(validForm, true);
    expect(errors.currentPassword).toBe("Dit veld is verplicht");
  });

  it("accepteert bij wijzigen zodra het wachtwoord is ingevuld", () => {
    const errors = validateBankForm({ ...validForm, currentPassword: "mijn-wachtwoord" }, true);
    expect(errors.currentPassword).toBeUndefined();
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it("blijft IBAN/rekeninghouder valideren in beide modi", () => {
    const badIban = { ...validForm, payoutIban: "NL00BANK0123456789" };
    expect(validateBankForm(badIban, false).payoutIban).toBe("Vul een geldig IBAN in");
    expect(validateBankForm(badIban, true).payoutIban).toBe("Vul een geldig IBAN in");

    const badHolder = { ...validForm, payoutAccountHolderName: "" };
    expect(validateBankForm(badHolder, false).payoutAccountHolderName).toBe("Dit veld is verplicht");
  });
});
