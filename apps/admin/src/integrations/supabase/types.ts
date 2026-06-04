export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string | null
          client_id: string | null
          created_at: string
          description: string | null
          details: Json | null
          id: string
          metadata: Json | null
          organization_id: string | null
          user_id: string | null
        }
        Insert: {
          action?: string | null
          client_id?: string | null
          created_at?: string
          description?: string | null
          details?: Json | null
          id?: string
          metadata?: Json | null
          organization_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string | null
          client_id?: string | null
          created_at?: string
          description?: string | null
          details?: Json | null
          id?: string
          metadata?: Json | null
          organization_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      charge_points: {
        Row: {
          brand: string | null
          connectivity_state: string | null
          cost_settings: Json | null
          created_at: string
          current_price_per_kwh: number | null
          eflux_evse_controller_id: string | null
          eflux_evse_id: string | null
          evse_id_global: string | null
          firmware_version: string | null
          id: string
          is_disabled: boolean | null
          is_mid_certified: boolean
          last_heartbeat_at: string | null
          location_id: string
          max_power: number | null
          model: string | null
          monthly_platform_cost: number | null
          name: string | null
          num_connectors: number | null
          operational_status: string | null
          serial_number: string | null
          status: string | null
          tariff_profile_id: string | null
          type: string | null
          updated_at: string | null
        }
        Insert: {
          brand?: string | null
          connectivity_state?: string | null
          cost_settings?: Json | null
          created_at?: string
          current_price_per_kwh?: number | null
          eflux_evse_controller_id?: string | null
          eflux_evse_id?: string | null
          evse_id_global?: string | null
          firmware_version?: string | null
          id?: string
          is_disabled?: boolean | null
          is_mid_certified?: boolean
          last_heartbeat_at?: string | null
          location_id: string
          max_power?: number | null
          model?: string | null
          monthly_platform_cost?: number | null
          name?: string | null
          num_connectors?: number | null
          operational_status?: string | null
          serial_number?: string | null
          status?: string | null
          tariff_profile_id?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          brand?: string | null
          connectivity_state?: string | null
          cost_settings?: Json | null
          created_at?: string
          current_price_per_kwh?: number | null
          eflux_evse_controller_id?: string | null
          eflux_evse_id?: string | null
          evse_id_global?: string | null
          firmware_version?: string | null
          id?: string
          is_disabled?: boolean | null
          is_mid_certified?: boolean
          last_heartbeat_at?: string | null
          location_id?: string
          max_power?: number | null
          model?: string | null
          monthly_platform_cost?: number | null
          name?: string | null
          num_connectors?: number | null
          operational_status?: string | null
          serial_number?: string | null
          status?: string | null
          tariff_profile_id?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "charge_points_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      charging_sessions: {
        Row: {
          charge_point_id: string
          client_id: string | null
          client_share: number | null
          connector_id: string | null
          created_at: string
          currency: string | null
          duration_minutes: number | null
          duration_seconds: number | null
          echarging_share: number | null
          eflux_session_id: string | null
          ended_at: string | null
          energy_cost: number | null
          energy_costs: number | null
          ere_estimate: number | null
          excluded: boolean | null
          external_calculated_price: number | null
          gross_revenue: number | null
          id: string
          idle_costs: number | null
          is_roaming: boolean | null
          kwh_delivered: number | null
          location_id: string
          net_margin: number | null
          payment_flow: string | null
          power_type: string | null
          reimbursement_amount: number | null
          reimbursement_synced_at: string | null
          start_costs: number | null
          started_at: string
          status: string | null
          time_costs: number | null
          token_issuer_name: string | null
          token_party_id: string | null
          token_uid: string | null
          total_price: number | null
          transaction_fee: number
          updated_at: string | null
        }
        Insert: {
          charge_point_id: string
          client_id?: string | null
          client_share?: number | null
          connector_id?: string | null
          created_at?: string
          currency?: string | null
          duration_minutes?: number | null
          duration_seconds?: number | null
          echarging_share?: number | null
          eflux_session_id?: string | null
          ended_at?: string | null
          energy_cost?: number | null
          energy_costs?: number | null
          ere_estimate?: number | null
          excluded?: boolean | null
          external_calculated_price?: number | null
          gross_revenue?: number | null
          id?: string
          idle_costs?: number | null
          is_roaming?: boolean | null
          kwh_delivered?: number | null
          location_id: string
          net_margin?: number | null
          payment_flow?: string | null
          power_type?: string | null
          reimbursement_amount?: number | null
          reimbursement_synced_at?: string | null
          start_costs?: number | null
          started_at: string
          status?: string | null
          time_costs?: number | null
          token_issuer_name?: string | null
          token_party_id?: string | null
          token_uid?: string | null
          total_price?: number | null
          transaction_fee?: number
          updated_at?: string | null
        }
        Update: {
          charge_point_id?: string
          client_id?: string | null
          client_share?: number | null
          connector_id?: string | null
          created_at?: string
          currency?: string | null
          duration_minutes?: number | null
          duration_seconds?: number | null
          echarging_share?: number | null
          eflux_session_id?: string | null
          ended_at?: string | null
          energy_cost?: number | null
          energy_costs?: number | null
          ere_estimate?: number | null
          excluded?: boolean | null
          external_calculated_price?: number | null
          gross_revenue?: number | null
          id?: string
          idle_costs?: number | null
          is_roaming?: boolean | null
          kwh_delivered?: number | null
          location_id?: string
          net_margin?: number | null
          payment_flow?: string | null
          power_type?: string | null
          reimbursement_amount?: number | null
          reimbursement_synced_at?: string | null
          start_costs?: number | null
          started_at?: string
          status?: string | null
          time_costs?: number | null
          token_issuer_name?: string | null
          token_party_id?: string | null
          token_uid?: string | null
          total_price?: number | null
          transaction_fee?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "charging_sessions_charge_point_id_fkey"
            columns: ["charge_point_id"]
            isOneToOne: false
            referencedRelation: "charge_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charging_sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charging_sessions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_erasure_log: {
        Row: {
          activity_log_scrubbed: number
          auth_user_deleted: boolean
          client_id: string | null
          client_number: number
          created_at: string
          erased_client_label: string
          id: string
          invitations_deleted: number
          locations_unlinked: number
          metadata: Json
          notifications_deleted: number
          payment_details_deleted: number
          performed_by: string | null
          profiles_deleted: number
          quotes_scrubbed: number
          reason: string
          tariff_profiles_deleted: number
        }
        Insert: {
          activity_log_scrubbed?: number
          auth_user_deleted?: boolean
          client_id?: string | null
          client_number: number
          created_at?: string
          erased_client_label: string
          id?: string
          invitations_deleted?: number
          locations_unlinked?: number
          metadata?: Json
          notifications_deleted?: number
          payment_details_deleted?: number
          performed_by?: string | null
          profiles_deleted?: number
          quotes_scrubbed?: number
          reason: string
          tariff_profiles_deleted?: number
        }
        Update: {
          activity_log_scrubbed?: number
          auth_user_deleted?: boolean
          client_id?: string | null
          client_number?: number
          created_at?: string
          erased_client_label?: string
          id?: string
          invitations_deleted?: number
          locations_unlinked?: number
          metadata?: Json
          notifications_deleted?: number
          payment_details_deleted?: number
          performed_by?: string | null
          profiles_deleted?: number
          quotes_scrubbed?: number
          reason?: string
          tariff_profiles_deleted?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_erasure_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_invitations: {
        Row: {
          accepted_at: string | null
          client_id: string
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_at: string
          invited_by: string | null
          last_resend_at: string | null
          resend_count: number
          status: string
          token_hash: string
          token_last4: string | null
        }
        Insert: {
          accepted_at?: string | null
          client_id: string
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_at?: string
          invited_by?: string | null
          last_resend_at?: string | null
          resend_count?: number
          status?: string
          token_hash: string
          token_last4?: string | null
        }
        Update: {
          accepted_at?: string | null
          client_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_at?: string
          invited_by?: string | null
          last_resend_at?: string | null
          resend_count?: number
          status?: string
          token_hash?: string
          token_last4?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_invitations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_payment_details: {
        Row: {
          account_holder_confirmed: boolean
          client_id: string
          created_at: string
          invoice_email: string
          payout_account_holder_name: string | null
          payout_bic: string | null
          payout_iban: string | null
          payout_iban_last4: string | null
          rejected_at: string | null
          rejection_reason: string | null
          status: string
          submitted_at: string
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          account_holder_confirmed?: boolean
          client_id: string
          created_at?: string
          invoice_email: string
          payout_account_holder_name?: string | null
          payout_bic?: string | null
          payout_iban?: string | null
          payout_iban_last4?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          status?: string
          submitted_at?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          account_holder_confirmed?: boolean
          client_id?: string
          created_at?: string
          invoice_email?: string
          payout_account_holder_name?: string | null
          payout_bic?: string | null
          payout_iban?: string | null
          payout_iban_last4?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          status?: string
          submitted_at?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_payment_details_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          auto_renew: boolean
          billing_address: string | null
          billing_address_city: string | null
          billing_address_postal: string | null
          billing_address_street: string | null
          btw_number: string | null
          calculate_ere_enabled: boolean
          charge_rate_per_kwh: number | null
          client_number: number | null
          company_name: string
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          contract_duration_months: number | null
          contract_start_date: string | null
          created_at: string
          echarging_fee_per_kwh: number | null
          eflux_account_id: string | null
          energy_cost_per_kwh: number | null
          erased_at: string | null
          erased_by: string | null
          erasure_reason: string | null
          ere_rate_per_kwh: number | null
          id: string
          kvk: string | null
          monthly_platform_surcharge: number | null
          notes: string | null
          notice_period_months: number
          organization_id: string
          payment_onboarding_status: string
          payment_onboarding_submitted_at: string | null
          payment_onboarding_verified_at: string | null
          portal_user_id: string | null
          revenue_share_percentage: number | null
          status: string | null
          updated_at: string
          vat_liable: boolean
        }
        Insert: {
          auto_renew?: boolean
          billing_address?: string | null
          billing_address_city?: string | null
          billing_address_postal?: string | null
          billing_address_street?: string | null
          btw_number?: string | null
          calculate_ere_enabled?: boolean
          charge_rate_per_kwh?: number | null
          client_number?: number | null
          company_name: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contract_duration_months?: number | null
          contract_start_date?: string | null
          created_at?: string
          echarging_fee_per_kwh?: number | null
          eflux_account_id?: string | null
          energy_cost_per_kwh?: number | null
          erased_at?: string | null
          erased_by?: string | null
          erasure_reason?: string | null
          ere_rate_per_kwh?: number | null
          id?: string
          kvk?: string | null
          monthly_platform_surcharge?: number | null
          notes?: string | null
          notice_period_months?: number
          organization_id: string
          payment_onboarding_status?: string
          payment_onboarding_submitted_at?: string | null
          payment_onboarding_verified_at?: string | null
          portal_user_id?: string | null
          revenue_share_percentage?: number | null
          status?: string | null
          updated_at?: string
          vat_liable?: boolean
        }
        Update: {
          auto_renew?: boolean
          billing_address?: string | null
          billing_address_city?: string | null
          billing_address_postal?: string | null
          billing_address_street?: string | null
          btw_number?: string | null
          calculate_ere_enabled?: boolean
          charge_rate_per_kwh?: number | null
          client_number?: number | null
          company_name?: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contract_duration_months?: number | null
          contract_start_date?: string | null
          created_at?: string
          echarging_fee_per_kwh?: number | null
          eflux_account_id?: string | null
          energy_cost_per_kwh?: number | null
          erased_at?: string | null
          erased_by?: string | null
          erasure_reason?: string | null
          ere_rate_per_kwh?: number | null
          id?: string
          kvk?: string | null
          monthly_platform_surcharge?: number | null
          notes?: string | null
          notice_period_months?: number
          organization_id?: string
          payment_onboarding_status?: string
          payment_onboarding_submitted_at?: string | null
          payment_onboarding_verified_at?: string | null
          portal_user_id?: string | null
          revenue_share_percentage?: number | null
          status?: string | null
          updated_at?: string
          vat_liable?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      eflux_invoices: {
        Row: {
          account_name: string | null
          billing_run_id: string | null
          created_at: string | null
          currency: string | null
          eflux_account_id: string | null
          eflux_invoice_id: string
          has_error: boolean | null
          id: string
          identifier: string | null
          is_paid: boolean | null
          is_ready: boolean | null
          month: number | null
          raw_data: Json | null
          road_created_at: string | null
          road_updated_at: string | null
          synced_at: string | null
          total_amount_with_vat: number | null
          total_credit_amount_with_vat: number | null
          type: string | null
          updated_at: string | null
          year: number | null
        }
        Insert: {
          account_name?: string | null
          billing_run_id?: string | null
          created_at?: string | null
          currency?: string | null
          eflux_account_id?: string | null
          eflux_invoice_id: string
          has_error?: boolean | null
          id?: string
          identifier?: string | null
          is_paid?: boolean | null
          is_ready?: boolean | null
          month?: number | null
          raw_data?: Json | null
          road_created_at?: string | null
          road_updated_at?: string | null
          synced_at?: string | null
          total_amount_with_vat?: number | null
          total_credit_amount_with_vat?: number | null
          type?: string | null
          updated_at?: string | null
          year?: number | null
        }
        Update: {
          account_name?: string | null
          billing_run_id?: string | null
          created_at?: string | null
          currency?: string | null
          eflux_account_id?: string | null
          eflux_invoice_id?: string
          has_error?: boolean | null
          id?: string
          identifier?: string | null
          is_paid?: boolean | null
          is_ready?: boolean | null
          month?: number | null
          raw_data?: Json | null
          road_created_at?: string | null
          road_updated_at?: string | null
          synced_at?: string | null
          total_amount_with_vat?: number | null
          total_credit_amount_with_vat?: number | null
          type?: string | null
          updated_at?: string | null
          year?: number | null
        }
        Relationships: []
      }
      eflux_sync_log: {
        Row: {
          created_at: string | null
          entity_type: string
          error_message: string | null
          id: string
          last_synced_at: string | null
          records_synced: number | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          entity_type: string
          error_message?: string | null
          id?: string
          last_synced_at?: string | null
          records_synced?: number | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          entity_type?: string
          error_message?: string | null
          id?: string
          last_synced_at?: string | null
          records_synced?: number | null
          status?: string | null
        }
        Relationships: []
      }
      eflux_sync_state: {
        Row: {
          cursor: string | null
          last_synced_at: string
          resource_type: string
          updated_at: string
        }
        Insert: {
          cursor?: string | null
          last_synced_at: string
          resource_type: string
          updated_at?: string
        }
        Update: {
          cursor?: string | null
          last_synced_at?: string
          resource_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      locations: {
        Row: {
          address: string | null
          city: string | null
          client_assigned_at: string | null
          client_id: string | null
          country_code: string | null
          created_at: string
          ean_code: string | null
          eflux_location_id: string | null
          grid_connection_amps: number | null
          has_solar: boolean | null
          id: string
          latitude: number | null
          longitude: number | null
          name: string | null
          parking_spots: number | null
          postal_code: string | null
          property_type: string | null
          road_synced_at: string | null
          solar_capacity_kwp: number | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          client_assigned_at?: string | null
          client_id?: string | null
          country_code?: string | null
          created_at?: string
          ean_code?: string | null
          eflux_location_id?: string | null
          grid_connection_amps?: number | null
          has_solar?: boolean | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string | null
          parking_spots?: number | null
          postal_code?: string | null
          property_type?: string | null
          road_synced_at?: string | null
          solar_capacity_kwp?: number | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          client_assigned_at?: string | null
          client_id?: string | null
          country_code?: string | null
          created_at?: string
          ean_code?: string | null
          eflux_location_id?: string | null
          grid_connection_amps?: number | null
          has_solar?: boolean | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string | null
          parking_spots?: number | null
          postal_code?: string | null
          property_type?: string | null
          road_synced_at?: string | null
          solar_capacity_kwp?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "locations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          message: string | null
          read: boolean | null
          recipient_id: string
          title: string | null
          type: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          read?: boolean | null
          recipient_id: string
          title?: string | null
          type?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          read?: boolean | null
          recipient_id?: string
          title?: string | null
          type?: string | null
        }
        Relationships: []
      }
      organizations: {
        Row: {
          address: string | null
          bic: string | null
          btw_number: string | null
          created_at: string
          dashboard_url: string | null
          default_charge_rate_per_kwh: number | null
          default_echarging_fee_per_kwh: number
          default_eflux_connection_fee_ac: number | null
          default_eflux_connection_fee_dc: number | null
          default_eflux_cost_ac: number | null
          default_eflux_cost_dc: number | null
          default_energy_cost_per_kwh: number | null
          default_ere_rate_per_kwh: number | null
          default_revenue_share_pct: number | null
          eflux_master_account_id: string | null
          eflux_provider_id: string | null
          email: string | null
          iban: string | null
          id: string
          kvk: string | null
          logo_url: string | null
          name: string
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          bic?: string | null
          btw_number?: string | null
          created_at?: string
          dashboard_url?: string | null
          default_charge_rate_per_kwh?: number | null
          default_echarging_fee_per_kwh?: number
          default_eflux_connection_fee_ac?: number | null
          default_eflux_connection_fee_dc?: number | null
          default_eflux_cost_ac?: number | null
          default_eflux_cost_dc?: number | null
          default_energy_cost_per_kwh?: number | null
          default_ere_rate_per_kwh?: number | null
          default_revenue_share_pct?: number | null
          eflux_master_account_id?: string | null
          eflux_provider_id?: string | null
          email?: string | null
          iban?: string | null
          id?: string
          kvk?: string | null
          logo_url?: string | null
          name: string
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          bic?: string | null
          btw_number?: string | null
          created_at?: string
          dashboard_url?: string | null
          default_charge_rate_per_kwh?: number | null
          default_echarging_fee_per_kwh?: number
          default_eflux_connection_fee_ac?: number | null
          default_eflux_connection_fee_dc?: number | null
          default_eflux_cost_ac?: number | null
          default_eflux_cost_dc?: number | null
          default_energy_cost_per_kwh?: number | null
          default_ere_rate_per_kwh?: number | null
          default_revenue_share_pct?: number | null
          eflux_master_account_id?: string | null
          eflux_provider_id?: string | null
          email?: string | null
          iban?: string | null
          id?: string
          kvk?: string | null
          logo_url?: string | null
          name?: string
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          organization_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id?: string
          organization_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          organization_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          calculation_data: Json | null
          calculation_snapshot: Json | null
          charge_point_type: string | null
          charge_rate_per_kwh: number | null
          client_id: string | null
          created_at: string
          energy_cost_per_kwh: number | null
          ere_rate_per_kwh: number | null
          estimated_kwh_per_point: number | null
          has_solar: boolean | null
          id: string
          locations_data: Json | null
          monthly_projection: Json | null
          notes: string | null
          num_charge_points: number | null
          organization_id: string
          prospect_company: string | null
          prospect_contact: string | null
          prospect_email: string | null
          quote_number: string | null
          revenue_share_pct: number | null
          signed_at: string | null
          solar_percentage: number | null
          status: string | null
          tariff_data: Json | null
          total_hardware_cost: number | null
          total_installation_cost: number | null
          updated_at: string | null
          valid_until: string | null
        }
        Insert: {
          calculation_data?: Json | null
          calculation_snapshot?: Json | null
          charge_point_type?: string | null
          charge_rate_per_kwh?: number | null
          client_id?: string | null
          created_at?: string
          energy_cost_per_kwh?: number | null
          ere_rate_per_kwh?: number | null
          estimated_kwh_per_point?: number | null
          has_solar?: boolean | null
          id?: string
          locations_data?: Json | null
          monthly_projection?: Json | null
          notes?: string | null
          num_charge_points?: number | null
          organization_id: string
          prospect_company?: string | null
          prospect_contact?: string | null
          prospect_email?: string | null
          quote_number?: string | null
          revenue_share_pct?: number | null
          signed_at?: string | null
          solar_percentage?: number | null
          status?: string | null
          tariff_data?: Json | null
          total_hardware_cost?: number | null
          total_installation_cost?: number | null
          updated_at?: string | null
          valid_until?: string | null
        }
        Update: {
          calculation_data?: Json | null
          calculation_snapshot?: Json | null
          charge_point_type?: string | null
          charge_rate_per_kwh?: number | null
          client_id?: string | null
          created_at?: string
          energy_cost_per_kwh?: number | null
          ere_rate_per_kwh?: number | null
          estimated_kwh_per_point?: number | null
          has_solar?: boolean | null
          id?: string
          locations_data?: Json | null
          monthly_projection?: Json | null
          notes?: string | null
          num_charge_points?: number | null
          organization_id?: string
          prospect_company?: string | null
          prospect_contact?: string | null
          prospect_email?: string | null
          quote_number?: string | null
          revenue_share_pct?: number | null
          signed_at?: string | null
          solar_percentage?: number | null
          status?: string | null
          tariff_data?: Json | null
          total_hardware_cost?: number | null
          total_installation_cost?: number | null
          updated_at?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      settlements: {
        Row: {
          client_id: string
          client_payout: number
          created_at: string
          echarging_fee_per_kwh: number
          echarging_revenue: number
          eflux_reimbursed_at: string | null
          ere_estimate: number
          gross_revenue: number
          id: string
          invoice_sent_at: string | null
          month: number
          paid_at: string | null
          period_end: string
          period_start: string
          status: string
          total_kwh: number
          total_sessions: number
          updated_at: string
          vat_rate: number
          year: number
        }
        Insert: {
          client_id: string
          client_payout?: number
          created_at?: string
          echarging_fee_per_kwh?: number
          echarging_revenue?: number
          eflux_reimbursed_at?: string | null
          ere_estimate?: number
          gross_revenue?: number
          id?: string
          invoice_sent_at?: string | null
          month: number
          paid_at?: string | null
          period_end: string
          period_start: string
          status?: string
          total_kwh?: number
          total_sessions?: number
          updated_at?: string
          vat_rate?: number
          year: number
        }
        Update: {
          client_id?: string
          client_payout?: number
          created_at?: string
          echarging_fee_per_kwh?: number
          echarging_revenue?: number
          eflux_reimbursed_at?: string | null
          ere_estimate?: number
          gross_revenue?: number
          id?: string
          invoice_sent_at?: string | null
          month?: number
          paid_at?: string | null
          period_end?: string
          period_start?: string
          status?: string
          total_kwh?: number
          total_sessions?: number
          updated_at?: string
          vat_rate?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "settlements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      tariff_profiles: {
        Row: {
          charge_rate_per_kwh: number | null
          client_id: string
          created_at: string
          energy_cost_per_kwh: number | null
          ere_rate_per_kwh: number | null
          id: string
          idle_tariff_per_min: number
          location_id: string | null
          start_tariff: number
          valid_from: string | null
        }
        Insert: {
          charge_rate_per_kwh?: number | null
          client_id: string
          created_at?: string
          energy_cost_per_kwh?: number | null
          ere_rate_per_kwh?: number | null
          id?: string
          idle_tariff_per_min?: number
          location_id?: string | null
          start_tariff?: number
          valid_from?: string | null
        }
        Update: {
          charge_rate_per_kwh?: number | null
          client_id?: string
          created_at?: string
          energy_cost_per_kwh?: number | null
          ere_rate_per_kwh?: number | null
          id?: string
          idle_tariff_per_min?: number
          location_id?: string | null
          start_tariff?: number
          valid_from?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tariff_profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tariff_profiles_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_client_invitation: {
        Args: { accepted_user_id: string; invitation_token_hash: string }
        Returns: {
          client_id: string
          email: string
          invitation_id: string
        }[]
      }
      admin_get_cron_status: {
        Args: never
        Returns: {
          active: boolean
          jobid: number
          jobname: string
          last_duration_ms: number
          last_run: string
          last_status: string
          schedule: string
        }[]
      }
      approve_settlements: {
        Args: { settlement_ids: string[] }
        Returns: {
          approved_count: number
        }[]
      }
      create_activity_log: {
        Args: {
          action: string
          client_id: string
          description: string
          metadata?: Json
        }
        Returns: {
          action: string | null
          client_id: string | null
          created_at: string
          description: string | null
          details: Json | null
          id: string
          metadata: Json | null
          organization_id: string | null
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "activity_log"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      erase_client_for_privacy: {
        Args: { p_client_id: string; p_performed_by: string; p_reason: string }
        Returns: Json
      }
      get_portal_dashboard_kpis: {
        Args: never
        Returns: {
          co2_kg_avoided: number
          ere_estimate: number
          estimated_client_yield: number
          gross_revenue: number
          is_final: boolean
          month: number
          period_end: string
          period_start: string
          status: string
          total_customer_cashflow: number
          total_kwh: number
          year: number
        }[]
      }
      get_portal_payment_details: {
        Args: never
        Returns: {
          account_holder_confirmed: boolean
          client_id: string
          invoice_email: string
          payout_account_holder_name: string
          payout_bic: string
          payout_iban_last4: string
          payout_iban_masked: string
          status: string
          updated_at: string
        }[]
      }
      invoke_edge_function: {
        Args: { body?: Json; fn_name: string }
        Returns: number
      }
      mark_settlements_eflux_reimbursed: {
        Args: { settlement_ids: string[] }
        Returns: {
          reimbursed_count: number
        }[]
      }
      mark_settlements_invoice_paid: {
        Args: { settlement_ids: string[] }
        Returns: {
          paid_count: number
        }[]
      }
      mark_settlements_invoice_sent: {
        Args: { settlement_ids: string[] }
        Returns: {
          sent_count: number
        }[]
      }
      mark_settlements_paid: {
        Args: { settlement_ids: string[] }
        Returns: {
          paid_count: number
        }[]
      }
      set_location_client: {
        Args: { client_id: string; location_id: string }
        Returns: Json
      }
      update_portal_company_details: {
        Args: {
          p_billing_address_city: string
          p_billing_address_postal: string
          p_billing_address_street: string
          p_btw_number: string
          p_calculate_ere_enabled?: boolean
          p_company_name: string
          p_contact_country_code: string
          p_contact_email: string
          p_contact_first_name: string
          p_contact_last_name: string
          p_contact_phone: string
          p_invoice_email: string
          p_kvk: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "viewer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "manager", "viewer"],
    },
  },
} as const
