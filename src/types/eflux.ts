// Road.io (e-Flux) API Types
// Gebaseerd op de officiële OpenAPI 3.0 specificatie van api.road.io v2

export interface RoadCPOSession {
  id: string;
  providerId: string;
  externalId: string;
  externalUniqueId: string;
  accountId: string;
  userId: string;
  evseControllerId: string;
  locationId: string;
  connectorId: string;
  providerContext: 'cpo' | 'msp';
  currency: string;
  externalCalculatedPrice: number;
  calculatedPrice: number;
  energyCosts: number;
  timeCosts: number;
  startCosts: number;
  idleCosts: number;
  totalPrice: number;
  kwh: number;
  durationSeconds: number;
  startedAt: string;
  endedAt: string;
  chargingFinishedAt?: string;
  status: 'ACTIVE' | 'COMPLETED';
  powerType: 'ac' | 'dc';
  connectorType?: string;
  tokenType?: string;
  tokenUid?: string;
  excluded: boolean;
  excludedReason?: string;
  authType?: 'AUTH_REQUEST' | 'COMMAND' | 'WHITELIST';
  paymentFlow?: 'charge-card' | 'tap-to-pay' | 'scan-to-pay';
  stateOfCharge?: number;
  reimbursement?: Record<string, unknown>;
  vatInfo?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface RoadEVSEController {
  id: string;
  providerId: string;
  accountId: string;
  locationId: string;
  evseId: string;
  normalizedEvseId: string;
  ocppIdentity: string;
  serialNumber: string;
  simpleSerialNumber: string;
  numericIdentity: number;
  numConnectors: number;
  maxPower: number;
  status: string;
  connectivityState: 'connected' | 'maybe-connected' | 'disconnected' | 'access-denied' | 'unknown' | 'pending-first-connection';
  heartbeatReceivedAt?: string;
  tokenAuthorizeReceivedAt?: string;
  activatedAt?: string;
  setupFinished: boolean;
  deleted: boolean;
  isDisabled: boolean;
  enablePublicCharging: boolean;
  enablePublicFreeCharging: boolean;
  tariffProfileId: string;
  billingPlanId: string;
  maintenanceAccountId: string;
  evseOperationalStatusId: string;
  accessGroupIds: string[];
  connectors: RoadConnector[];
  costSettings: RoadCostSetting[];
  connectorStatus?: Record<string, unknown>;
  smartCharging?: {
    method: 'none' | 'stekker';
    pairingCode?: string;
    paired?: boolean;
  };
  setupProgress?: {
    state: 'ATTACH_ENTITIES' | 'CONFIGURE_ENERGY_COSTS' | 'CONFIGURE_CONNECTOR_INFO' | 'CONFIGURE_NUMBER_OF_CONNECTORS' | 'COMPLETED';
    currentStep: number;
  };
  description?: string;
  createdAt: string;
}

export interface RoadConnector {
  connectorId: number;
  evseId: string;
  maxPower: number;
  amperage: number;
  standard: string;
  format: string;
  powerType?: string;
  maxVoltage?: number;
  maxAmperage?: number;
}

export interface RoadCostSetting {
  connectorId: number;
  pricePerKwh: number;
}

export interface RoadLocation {
  id: string;
  providerId: string;
  accountId: string;
  name: string;
  address: string;
  city: string;
  postal_code?: string;
  postalCode?: string;
  country: string;
  countryCode?: string;
  status: string;
  evseIds: string[];
  connectorTypes: string[];
  maxPower: number;
  minPower?: number;
  powerType: string;
  type?: string;
  parking_type?: string;
  isPublished: boolean;
  publishingMode?: 'public' | 'private';
  accessPolicy?: 'businessReimburse' | 'employeeReimburse' | 'communityReimburse' | 'noReimburse' | 'splitReimburse';
  facilitatorAccountId?: string;
  geoLocation: {
    type: string;
    coordinates: [number, number];
  };
  coordinates?: Record<string, unknown>;
  evses: RoadEVSEController[];
  facilities: string[];
  timezone?: string;
  energyDeliveryArea?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RoadProvider {
  id: string;
  slug: string;
  name: string;
  logoUrl?: string;
  invertedLogoUrl?: string;
  primaryColorHex?: string;
  supportEmail?: string;
  supportPhoneNo?: string;
  supportUrl?: string;
  enableSplitBilling?: boolean;
  enableApiAccess?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RoadEvseOperationalStatus {
  id: string;
  name: string;
  type: 'custom' | 'system';
  isInitial: boolean;
  description: string;
  badgeColor: 'red' | 'orange' | 'yellow' | 'olive' | 'green' | 'teal' | 'blue' | 'violet' | 'purple' | 'pink' | 'brown' | 'grey' | 'black';
  roamingStatus: 'none' | 'blocked' | 'inoperative' | 'outOfOrder' | 'planned' | 'removed' | 'reserved';
  chargingStationStatus: 'none' | 'operative' | 'inoperative';
  billingStatus: 'none' | 'enabled' | 'disabled';
  canonicalStatus?: 'onboarding' | 'activation' | 'live' | 'outOfService' | 'archived';
  deleted: boolean;
  available?: boolean;
  createdAt: string;
  updatedAt: string;
}

// API Request/Response types

export interface RoadSearchParams {
  skip?: number;
  limit?: number;
  sort?: { field: string; order: 'asc' | 'desc' };
  format?: 'json' | 'csv';
  from?: string;
  to?: string;
}

export interface RoadSessionSearchParams extends RoadSearchParams {
  locationId?: string;
  evseControllerId?: string;
  connectorId?: string;
  status?: 'ACTIVE' | 'COMPLETED';
  excluded?: boolean;
  endedAt?: { $gte?: string; $lte?: string };
  createdAt?: { $gte?: string; $lte?: string };
  updatedAt?: { $gte?: string; $lte?: string };
}

export interface RoadEVSESearchParams extends RoadSearchParams {
  accountId?: string;
  locationIds?: string[];
  connectivityStates?: string[];
  connectorStatuses?: string[];
  powerType?: 'AC' | 'DC' | 'ACDC';
  setupInProgress?: boolean;
  searchPhrase?: string;
  evseOperationalStatusIds?: string[];
}

export interface RoadPaginationMeta {
  total: number;
  limit: number;
  skip: number;
  approx?: number;
}

export interface RoadApiResponse<T> {
  data: T;
  meta?: RoadPaginationMeta;
}

export interface RoadApiError {
  error: {
    type?: string;
    message: string;
    status?: number;
    details?: Array<{
      message: string;
      path: string[];
      type: string;
      context: Record<string, unknown>;
    }>;
  };
}

// Mapping helpers: Road.io → E-Charging internal types

export function mapRoadSessionToInternal(session: RoadCPOSession, clientId: string) {
  return {
    eflux_session_id: session.id,
    charge_point_id: null as string | null,
    location_id: null as string | null,
    client_id: clientId,
    status: session.status,
    started_at: session.startedAt,
    ended_at: session.endedAt,
    duration_seconds: session.durationSeconds,
    kwh_delivered: session.kwh,
    currency: session.currency,
    external_calculated_price: session.externalCalculatedPrice,
    energy_costs: session.energyCosts,
    time_costs: session.timeCosts,
    start_costs: session.startCosts,
    idle_costs: session.idleCosts,
    total_price: session.totalPrice,
    power_type: session.powerType,
    connector_id: session.connectorId,
    excluded: session.excluded,
  };
}

export function mapRoadEVSEToInternal(evse: RoadEVSEController, locationId: string) {
  return {
    eflux_evse_controller_id: evse.id,
    eflux_evse_id: evse.evseId,
    location_id: locationId,
    name: evse.evseId || `LP-${evse.numericIdentity}`,
    type: evse.maxPower && evse.maxPower > 22 ? 'dc' : evse.maxPower > 11 ? 'ac_22' : 'ac_11',
    serial_number: evse.serialNumber,
    connectivity_state: evse.connectivityState,
    last_heartbeat_at: evse.heartbeatReceivedAt,
    num_connectors: evse.numConnectors,
    max_power: evse.maxPower,
    has_mid_meter: true,
  };
}
