import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  calculatePricing,
  defaultConfiguratorSettings,
  type ConfiguratorSettings,
  type LocationType,
  type PricingInput,
} from "@echarging/pricing-engine";
import { configuratorApi } from "../api";
import { useWizardStore } from "./store";

const stepLabels = ["Klant", "Gebruik", "Service", "Tarieven", "Samenvatting"];
const serviceItems = [
  "Dashboard met live sessies en afrekeningen",
  "Transactieafhandeling en uitbetaling",
  "Doorlopende tariefoptimalisatie",
  "24/7 klantenservice voor gebruikers",
  "Monitoring en kosteloos on-site support",
  "Reparatie-mandaat voor snelle opvolging",
  "ERE-onboarding en commerciële begeleiding",
];

function euro(value: number, digits = 0) {
  return value.toLocaleString("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function number(value: number, digits = 0) {
  return value.toLocaleString("nl-NL", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function parseNumber(value: string, fallback = 0) {
  const normalized = value.replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function Progress({ step }: { step: number }) {
  return (
    <header className="configurator-progress">
      <div className="mx-auto flex h-full max-w-[1440px] items-center gap-8 px-5 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-[#0b1a10] text-sm font-black text-[#7ab829]">
            E
          </div>
          <span className="hidden text-sm font-semibold text-[#1a1a1a] sm:inline">E-Charging configurator</span>
        </div>
        <div className="hidden flex-1 items-center justify-center gap-3 lg:flex">
          {stepLabels.map((label, index) => {
            const current = index + 1;
            const isDone = current < step;
            const isActive = current === step;
            return (
              <div key={label} className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className={[
                      "grid h-7 w-7 place-items-center rounded-full border text-xs font-bold",
                      isDone ? "border-[#7ab829] bg-[#7ab829] text-white" : "",
                      isActive ? "border-[#7ab829] bg-white text-[#1a1a1a]" : "",
                      !isDone && !isActive ? "border-[#d8dccf] bg-white text-[#8b9083]" : "",
                    ].join(" ")}
                  >
                    {current}
                  </span>
                  <span className={isActive ? "text-sm font-bold text-[#1a1a1a]" : "text-sm font-medium text-[#777d70]"}>
                    {label}
                  </span>
                </div>
                {current < stepLabels.length && <span className="h-px w-10 bg-[#dfe3d8]" />}
              </div>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-2 text-sm font-semibold text-[#6b6b6b] lg:hidden">
          <span>Stap {step} / 5</span>
          <div className="flex gap-1">
            {stepLabels.map((label, index) => (
              <span key={label} className={`h-1.5 w-1.5 rounded-full ${index + 1 <= step ? "bg-[#7ab829]" : "bg-[#d7dbd2]"}`} />
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label>
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

function PricingSidebar({
  input,
  settings,
  sellerMode,
  setSellerMode,
}: {
  input: PricingInput;
  settings: ConfiguratorSettings;
  sellerMode: boolean;
  setSellerMode: (value: boolean) => void;
}) {
  const pricing = useMemo(() => calculatePricing(input, settings), [input, settings]);
  const nextTier = pricing.nextTier;
  const basisAnnual = pricing.totals.customerPerMonth * 12;
  const lowerTariffLoss = Math.max(0, calculatePricing({
    ...input,
    tariffs: { ...input.tariffs, chargeTariffPerKwh: Math.max(0, input.tariffs.chargeTariffPerKwh - 0.09) },
  }, settings).totals.customerPerYear - pricing.totals.customerPerYear);

  return (
    <aside className="configurator-sidebar">
      <div>
        <p className="field-label mb-2">Klant verdient per maand</p>
        <div className="flex items-end gap-2">
          <strong className="text-[48px] font-black leading-none tracking-[-0.03em] text-[#1a1a1a] tabular-nums">
            {euro(pricing.totals.customerPerMonth)}
          </strong>
          <span className="pb-1 text-lg text-[#6b6b6b]">/mnd</span>
        </div>
      </div>

      <div className="mt-7 flex items-center justify-between rounded-2xl bg-white p-4 shadow-[inset_3px_0_0_#7ab829]">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#6b6b6b]">Preview voor klant</p>
          <p className="mt-1 text-sm text-[#3f3f3f]">Verberg interne fee en tierinformatie.</p>
        </div>
        <button
          type="button"
          className="secondary-button min-h-10"
          onClick={() => setSellerMode(!sellerMode)}
        >
          {sellerMode ? "Aan" : "Uit"}
        </button>
      </div>

      {sellerMode && (
        <div className="mt-5 rounded-2xl border border-[#dbe8cc] bg-[#f2f8e8] p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="field-label mb-1">Onze fee</p>
              <p className="text-2xl font-black text-[#1a1a1a]">{number(pricing.serviceFeePct * 100, 1)}%</p>
            </div>
            <p className="mono text-lg font-bold text-[#297b23]">{euro(pricing.totals.echargingNetPerMonth)}</p>
          </div>
          {pricing.status === "blocked" && (
            <p className="mt-3 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-[#9a3412]">
              {pricing.blockingReasons[0] ?? "Deze configuratie kan nog niet worden afgerond."}
            </p>
          )}
        </div>
      )}

      <div className="mt-8">
        <p className="field-label mb-4">Breakdown</p>
        <div className="space-y-3 text-sm">
          {[
            ["Netto rendement", pricing.totals.netReturnPerMonth],
            ["Target E-Charging", pricing.targetNetEchargingPerChargePointMonth * input.hardware.chargePoints],
            ["E-Flux kosten", pricing.totals.efluxCostPerMonth],
            ["Klant ontvangt", pricing.totals.customerPerMonth],
            ["E-Charging netto", pricing.totals.echargingNetPerMonth],
          ].map(([label, amount]) => (
            <div key={String(label)} className="grid grid-cols-[auto_1fr_auto] items-baseline gap-2">
              <span className="text-[#535850]">{label}</span>
              <span className="border-b border-dotted border-[#c7ccc1]" />
              <span className="mono font-semibold text-[#1a1a1a]">{euro(Number(amount), 2)}</span>
            </div>
          ))}
        </div>
      </div>

      {sellerMode && (
        <div className="mt-8 rounded-2xl border border-[#e5e7e0] bg-white p-4">
          <p className="field-label mb-2">Verkoper-modus</p>
          <p className="text-sm text-[#3f3f3f]">
            Huidige staffel: <strong>{euro(pricing.targetNetEchargingPerChargePointMonth)}</strong> netto per paal per maand.
          </p>
          {nextTier ? (
            <p className="mt-2 text-sm text-[#6b6b6b]">
              Nog {euro(Math.max(0, nextTier.minNetReturnPerChargePointMonth - pricing.netReturnPerChargePointMonth), 2)} netto per paal nodig voor de volgende tier.
            </p>
          ) : (
            <p className="mt-2 text-sm text-[#6b6b6b]">Dit zit in de hoogste staffel.</p>
          )}
          {lowerTariffLoss > 0 && (
            <p className="mt-3 text-sm font-semibold text-[#9a3412]">
              Bij het vriendelijke tarief loopt de klant ongeveer {euro(lowerTariffLoss)} per jaar mis.
            </p>
          )}
        </div>
      )}

      <div className="mt-10">
        <p className="mb-4 text-sm text-[#6b6b6b]">Over 12 maanden contract: {euro(basisAnnual)}</p>
        <a href="#next-step" className="primary-button flex items-center justify-center no-underline">
          Volgende stap
        </a>
      </div>
    </aside>
  );
}

function MobilePricing({ input, settings }: { input: PricingInput; settings: ConfiguratorSettings }) {
  const pricing = useMemo(() => calculatePricing(input, settings), [input, settings]);
  return (
    <div className="mobile-pricing-bar">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#6b6b6b]">Klant per maand</p>
        <p className="text-2xl font-black text-[#1a1a1a]">{euro(pricing.totals.customerPerMonth)}</p>
      </div>
      <div className="text-right">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#6b6b6b]">Fee</p>
        <p className="font-bold text-[#297b23]">{number(pricing.serviceFeePct * 100, 1)}%</p>
      </div>
    </div>
  );
}

function StepOne({
  input,
  settings,
  updateInput,
  setLocationType,
}: {
  input: PricingInput;
  settings: ConfiguratorSettings;
  updateInput: (recipe: (input: PricingInput) => void) => void;
  setLocationType: (locationType: LocationType) => void;
}) {
  return (
    <div className="space-y-8">
      <div>
        <p className="field-label">Stap 1</p>
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[#1a1a1a]">Wie is de klant?</h1>
        <p className="mt-3 max-w-xl text-[15px] leading-7 text-[#5f655c]">
          We beginnen met de basis. Op basis van de locatie schatten we straks het rendement.
        </p>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Bedrijfsnaam">
          <input className="text-input" value={input.customer.companyName} onChange={(event) => updateInput((draft) => { draft.customer.companyName = event.target.value; })} />
        </Field>
        <Field label="Contactpersoon">
          <input className="text-input" value={input.customer.contactName} onChange={(event) => updateInput((draft) => { draft.customer.contactName = event.target.value; })} />
        </Field>
        <Field label="E-mail">
          <input className="text-input" type="email" value={input.customer.contactEmail} onChange={(event) => updateInput((draft) => { draft.customer.contactEmail = event.target.value; })} />
        </Field>
        <Field label="Telefoon">
          <input className="text-input" value={input.customer.contactPhone} onChange={(event) => updateInput((draft) => { draft.customer.contactPhone = event.target.value; })} />
        </Field>
      </div>
      <div className="grid gap-5 md:grid-cols-3">
        <Field label="Straat en huisnummer">
          <input className="text-input" value={input.customer.locationAddress} onChange={(event) => updateInput((draft) => { draft.customer.locationAddress = event.target.value; })} />
        </Field>
        <Field label="Postcode">
          <input className="text-input" value={input.customer.postalCode} onChange={(event) => updateInput((draft) => { draft.customer.postalCode = event.target.value; })} />
        </Field>
        <Field label="Plaats">
          <input className="text-input" value={input.customer.city} onChange={(event) => updateInput((draft) => { draft.customer.city = event.target.value; })} />
        </Field>
      </div>
      <div className="grid gap-5 md:grid-cols-3">
        <Field label="Locatietype">
          <select className="select-input" value={input.customer.locationType} onChange={(event) => setLocationType(event.target.value as LocationType)}>
            <option value="workplace">Werkplek/kantoor</option>
            <option value="destination">Bestemming</option>
            <option value="fleet">Vlootlocatie/depot</option>
            <option value="public">Publieke straat</option>
            <option value="other">Anders</option>
          </select>
        </Field>
        <Field label="Aantal palen">
          <input className="text-input" inputMode="numeric" value={input.hardware.chargePoints} onChange={(event) => updateInput((draft) => { draft.hardware.chargePoints = parseNumber(event.target.value, draft.hardware.chargePoints); })} />
        </Field>
        <Field label="Sockets per paal">
          <input className="text-input" inputMode="numeric" value={input.hardware.socketsPerChargePoint} onChange={(event) => updateInput((draft) => { draft.hardware.socketsPerChargePoint = parseNumber(event.target.value, draft.hardware.socketsPerChargePoint); })} />
        </Field>
      </div>
    </div>
  );
}

function StepTwo({ input, updateInput }: { input: PricingInput; updateInput: (recipe: (input: PricingInput) => void) => void }) {
  return (
    <div className="space-y-8">
      <div>
        <p className="field-label">Stap 2</p>
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[#1a1a1a]">Gebruikspatroon</h1>
        <p className="mt-3 max-w-xl text-[15px] leading-7 text-[#5f655c]">Samen bepalen we hoeveel de locatie naar verwachting gebruikt wordt.</p>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Sessies per paal per maand">
          <input className="text-input" inputMode="decimal" value={input.usage.sessionsPerChargePointMonth} onChange={(event) => updateInput((draft) => { draft.usage.sessionsPerChargePointMonth = parseNumber(event.target.value, draft.usage.sessionsPerChargePointMonth); })} />
        </Field>
        <Field label="kWh per paal per maand">
          <input className="text-input" inputMode="decimal" value={input.usage.kwhPerChargePointMonth} onChange={(event) => updateInput((draft) => { draft.usage.kwhPerChargePointMonth = parseNumber(event.target.value, draft.usage.kwhPerChargePointMonth); })} />
        </Field>
        <Field label="Gemiddelde sessieduur in uren">
          <input className="text-input" inputMode="decimal" value={input.usage.averageSessionDurationHours} onChange={(event) => updateInput((draft) => { draft.usage.averageSessionDurationHours = parseNumber(event.target.value, draft.usage.averageSessionDurationHours); })} />
        </Field>
        <Field label="Effectief laadvermogen in kW">
          <input className="text-input" inputMode="decimal" value={input.usage.effectiveChargingPowerKw} onChange={(event) => updateInput((draft) => { draft.usage.effectiveChargingPowerKw = parseNumber(event.target.value, draft.usage.effectiveChargingPowerKw); })} />
        </Field>
      </div>
    </div>
  );
}

function StepThree({ input, updateInput }: { input: PricingInput; updateInput: (recipe: (input: PricingInput) => void) => void }) {
  return (
    <div className="space-y-8">
      <div>
        <p className="field-label">Stap 3</p>
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[#1a1a1a]">Looptijd en service</h1>
        <p className="mt-3 max-w-xl text-[15px] leading-7 text-[#5f655c]">De servicebasis staat vast. De looptijd bepaalt de commerciële samenvatting.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {[12, 24].map((months) => (
          <button
            key={months}
            type="button"
            className="card-toggle"
            data-active={input.contract.durationMonths === months}
            onClick={() => updateInput((draft) => { draft.contract.durationMonths = months; })}
          >
            <div>
              <p className="text-base font-bold text-[#1a1a1a]">{months} maanden</p>
              <p className="mt-1 text-sm text-[#6b6b6b]">Opzegtermijn {input.contract.noticePeriodMonths} maanden</p>
            </div>
            <span className="text-2xl font-black text-[#7ab829]">{input.contract.durationMonths === months ? "✓" : ""}</span>
          </button>
        ))}
      </div>
      <div className="rounded-3xl border border-[#e5e7e0] bg-white p-6">
        <h2 className="text-lg font-semibold text-[#1a1a1a]">Wat E-Charging levert</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {serviceItems.map((item) => (
            <div key={item} className="flex gap-3 text-sm text-[#3f3f3f]">
              <span className="mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full bg-[#f2f8e8] text-xs font-black text-[#7ab829]">✓</span>
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ToggleCard({
  title,
  description,
  active,
  delta,
  onClick,
}: {
  title: string;
  description: string;
  active: boolean;
  delta: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="card-toggle" data-active={active} onClick={onClick}>
      <div>
        <p className="text-base font-bold text-[#1a1a1a]">{title}</p>
        <p className="mt-1 text-sm text-[#6b6b6b]">{description}</p>
      </div>
      <div className="text-right">
        <div className="switch-track" data-active={active}>
          <div className="switch-thumb" />
        </div>
        {active && <p className="mt-2 text-xs font-black text-[#7ab829]">{delta}</p>}
      </div>
    </button>
  );
}

function StepFour({ input, updateInput, settings }: { input: PricingInput; updateInput: (recipe: (input: PricingInput) => void) => void; settings: ConfiguratorSettings }) {
  const base = useMemo(() => calculatePricing(input, settings), [input, settings]);
  const market = Math.max(0, settings.defaultChargeTariffPerKwh - 0.03);
  const premium = settings.defaultChargeTariffPerKwh + 0.07;
  return (
    <div className="space-y-8">
      <div>
        <p className="field-label">Stap 4</p>
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[#1a1a1a]">Tariefkeuzes</h1>
        <p className="mt-3 max-w-xl text-[15px] leading-7 text-[#5f655c]">Hier ontstaat het rendement. Iedere wijziging rekent direct door.</p>
      </div>
      <div className="rounded-3xl border border-[#e5e7e0] bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="field-label">Laadtarief per kWh</p>
            <h2 className="text-lg font-semibold text-[#1a1a1a]">Advies: {euro(input.tariffs.chargeTariffPerKwh, 2)}/kWh</h2>
          </div>
          <p className="text-sm font-bold text-[#297b23]">Klant verdient {euro(base.totals.customerPerMonth)}/mnd</p>
        </div>
        <input
          className="range-input mt-8"
          type="range"
          min={0.39}
          max={0.79}
          step={0.01}
          value={input.tariffs.chargeTariffPerKwh}
          onChange={(event) => updateInput((draft) => { draft.tariffs.chargeTariffPerKwh = parseNumber(event.target.value, draft.tariffs.chargeTariffPerKwh); })}
        />
        <div className="mt-5 flex flex-wrap gap-2">
          {[
            ["Marktconform", market],
            ["Aanbevolen", settings.defaultChargeTariffPerKwh],
            ["Premium", premium],
          ].map(([label, value]) => (
            <button
              key={String(label)}
              type="button"
              className="secondary-button min-h-10 rounded-full"
              onClick={() => updateInput((draft) => { draft.tariffs.chargeTariffPerKwh = Number(value); })}
            >
              {label} {euro(Number(value), 2)}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-4">
        <ToggleCard
          title="Starttarief per sessie"
          description="Eenmalig per sessie. Dekt transactiekosten en ontmoedigt korte sessies."
          active={input.tariffs.startFeeEnabled}
          delta={`+${euro(input.tariffs.startFeePerSession * input.usage.sessionsPerChargePointMonth * input.hardware.chargePoints)}/mnd`}
          onClick={() => updateInput((draft) => { draft.tariffs.startFeeEnabled = !draft.tariffs.startFeeEnabled; })}
        />
        <ToggleCard
          title="Blokkeertarief per minuut"
          description={`Start pas na ${input.tariffs.idleGraceMinutes} minuten. Beschermt laadplekken tegen langparkeren.`}
          active={input.tariffs.idleFeeEnabled}
          delta="Rendement stijgt direct"
          onClick={() => updateInput((draft) => { draft.tariffs.idleFeeEnabled = !draft.tariffs.idleFeeEnabled; })}
        />
      </div>
      <div className="grid gap-5 md:grid-cols-3">
        <Field label="Stroom-inkoop per kWh">
          <input className="text-input" inputMode="decimal" value={input.tariffs.energyCostPerKwh} onChange={(event) => updateInput((draft) => { draft.tariffs.energyCostPerKwh = parseNumber(event.target.value, draft.tariffs.energyCostPerKwh); })} />
        </Field>
        <Field label="Starttarief">
          <input className="text-input" inputMode="decimal" value={input.tariffs.startFeePerSession} onChange={(event) => updateInput((draft) => { draft.tariffs.startFeePerSession = parseNumber(event.target.value, draft.tariffs.startFeePerSession); })} />
        </Field>
        <Field label="Blokkeertarief">
          <input className="text-input" inputMode="decimal" value={input.tariffs.idleFeePerMinute} onChange={(event) => updateInput((draft) => { draft.tariffs.idleFeePerMinute = parseNumber(event.target.value, draft.tariffs.idleFeePerMinute); })} />
        </Field>
      </div>
    </div>
  );
}

function StepFive({
  input,
  settings,
  onFinalize,
  finalizing,
  finalizeError,
}: {
  input: PricingInput;
  settings: ConfiguratorSettings;
  onFinalize: () => void;
  finalizing: boolean;
  finalizeError: string | null;
}) {
  const pricing = useMemo(() => calculatePricing(input, settings), [input, settings]);
  const validUntil = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toLocaleDateString("nl-NL");
  return (
    <div className="space-y-8">
      <div>
        <p className="field-label">Stap 5</p>
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[#1a1a1a]">Samenvatting</h1>
        <p className="mt-3 max-w-xl text-[15px] leading-7 text-[#5f655c]">Controleer de configuratie en maak direct een klant aan.</p>
      </div>
      <div className="rounded-3xl border border-[#dbe8cc] bg-[#f2f8e8] p-7">
        <p className="field-label">Wat dit oplevert</p>
        <p className="mt-3 text-[42px] font-black leading-none tracking-[-0.04em] text-[#1a1a1a]">{euro(pricing.totals.customerPerMonth)}</p>
        <p className="mt-2 text-lg text-[#3f3f3f]">per maand, {euro(pricing.totals.customerPerYear)} per jaar</p>
        <p className="mt-4 text-sm text-[#6b6b6b]">Service-fee: {number(pricing.serviceFeePct * 100, 1)}%</p>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="rounded-3xl border border-[#e5e7e0] bg-white p-6">
          <h2 className="text-lg font-semibold text-[#1a1a1a]">Uw configuratie</h2>
          <div className="mt-4 space-y-2 text-sm text-[#3f3f3f]">
            <p>{input.hardware.chargePoints} palen, {input.hardware.socketsPerChargePoint} socket(s) per paal</p>
            <p>{number(input.usage.kwhPerChargePointMonth)} kWh per paal per maand</p>
            <p>{euro(input.tariffs.chargeTariffPerKwh, 2)} per kWh, stroominkoop {euro(input.tariffs.energyCostPerKwh, 2)}</p>
          </div>
        </div>
        <div className="rounded-3xl border border-[#e5e7e0] bg-white p-6">
          <h2 className="text-lg font-semibold text-[#1a1a1a]">Wat E-Charging doet</h2>
          <ul className="mt-4 space-y-2 text-sm text-[#3f3f3f]">
            {serviceItems.slice(0, 5).map((item) => <li key={item}>✓ {item}</li>)}
          </ul>
        </div>
      </div>
      {pricing.status === "blocked" && (
        <div className="rounded-2xl border border-[#fdba74] bg-[#fff7ed] p-4 text-sm font-semibold text-[#9a3412]">
          {pricing.blockingReasons.join(" ")}
        </div>
      )}
      {finalizeError && (
        <div className="rounded-2xl border border-[#fecaca] bg-[#fef2f2] p-4 text-sm font-semibold text-[#991b1b]">
          {finalizeError}
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <button className="primary-button" disabled={pricing.status === "blocked" || finalizing} onClick={onFinalize}>
          {finalizing ? "Klant aanmaken..." : "Akkoord & maak klant aan"}
        </button>
        <button className="secondary-button" disabled>Stuur per mail, fase 2</button>
        <button className="secondary-button" disabled>Genereer offerte, fase 2</button>
      </div>
      <p className="text-sm text-[#6b6b6b]">Configuratie geldig tot {validUntil}.</p>
    </div>
  );
}

export default function WizardPage() {
  const params = useParams({ strict: false }) as { sessionId?: string; step?: string };
  const navigate = useNavigate();
  const sessionId = params.sessionId ?? "local-preview";
  const step = Math.min(5, Math.max(1, Number(params.step ?? 1) || 1));
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const { input, settings, settingsVersion, sellerMode, applySettings, updateInput, setLocationType, setSellerMode } = useWizardStore();

  const settingsQuery = useQuery({
    queryKey: ["configurator-settings", sessionId],
    queryFn: async () => {
      try {
        return await configuratorApi.getSettings(sessionId);
      } catch {
        return { version: 1, settings: defaultConfiguratorSettings };
      }
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    if (settingsQuery.data) {
      applySettings(settingsQuery.data.settings, settingsQuery.data.version);
    }
  }, [applySettings, settingsQuery.data]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSaveState("saving");
      configuratorApi
        .saveDraft(sessionId, { input, step })
        .then(() => setSaveState("saved"))
        .catch(() => setSaveState("idle"));
    }, 2_000);

    return () => window.clearTimeout(timeout);
  }, [input, sessionId, step]);

  const finalizeMutation = useMutation({
    mutationFn: () => configuratorApi.finalizeClient(sessionId, { input, settingsVersion }),
    onSuccess: (result) => {
      setFinalizeError(null);
      alert(`Klant aangemaakt: #${result.clientNumber ?? result.clientId}`);
    },
    onError: (error) => {
      setFinalizeError(error instanceof Error ? error.message : "Klant aanmaken mislukt.");
    },
  });

  const goToStep = (nextStep: number) => {
    void navigate({
      to: "/s/$sessionId/stap/$step",
      params: { sessionId, step: String(Math.min(5, Math.max(1, nextStep))) } as never,
    });
  };

  const stepContent = (
    <AnimatePresence mode="wait">
      <motion.div
        key={step}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      >
        {step === 1 && <StepOne input={input} settings={settings} updateInput={updateInput} setLocationType={setLocationType} />}
        {step === 2 && <StepTwo input={input} updateInput={updateInput} />}
        {step === 3 && <StepThree input={input} updateInput={updateInput} />}
        {step === 4 && <StepFour input={input} updateInput={updateInput} settings={settings} />}
        {step === 5 && (
          <StepFive
            input={input}
            settings={settings}
            onFinalize={() => finalizeMutation.mutate()}
            finalizing={finalizeMutation.isPending}
            finalizeError={finalizeError}
          />
        )}
      </motion.div>
    </AnimatePresence>
  );

  return (
    <div className="configurator-shell">
      <Progress step={step} />
      <div className="configurator-grid">
        <main className="configurator-main">
          <div className="configurator-card">
            {stepContent}
            <div className="mt-12 flex items-center justify-between gap-3 border-t border-[#e5e7e0] pt-6">
              <button type="button" className="secondary-button" disabled={step === 1} onClick={() => goToStep(step - 1)}>
                Vorige
              </button>
              <span className="text-sm text-[#6b6b6b]">{saveState === "saving" ? "Concept opslaan..." : saveState === "saved" ? "Concept opgeslagen" : "Concept"}</span>
              {step < 5 ? (
                <button id="next-step" type="button" className="primary-button" onClick={() => goToStep(step + 1)}>
                  Volgende stap
                </button>
              ) : (
                <button type="button" className="secondary-button" onClick={() => goToStep(1)}>
                  Aanpassen
                </button>
              )}
            </div>
          </div>
        </main>
        <PricingSidebar input={input} settings={settings} sellerMode={sellerMode} setSellerMode={setSellerMode} />
      </div>
      <MobilePricing input={input} settings={settings} />
    </div>
  );
}
