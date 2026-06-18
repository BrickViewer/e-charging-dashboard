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
      blog_posts: {
        Row: {
          author_name: string | null
          canonical_url: string | null
          category: string | null
          category_slug: string | null
          content: string | null
          cover_image_alt: string | null
          cover_image_height: number | null
          cover_image_url: string | null
          cover_image_width: number | null
          created_at: string
          created_by: string | null
          excerpt: string | null
          faq: Json
          featured: boolean
          id: string
          noindex: boolean
          organization_id: string
          published_at: string | null
          reading_minutes: number | null
          seo_description: string | null
          seo_title: string | null
          slug: string
          status: string
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          author_name?: string | null
          canonical_url?: string | null
          category?: string | null
          category_slug?: string | null
          content?: string | null
          cover_image_alt?: string | null
          cover_image_height?: number | null
          cover_image_url?: string | null
          cover_image_width?: number | null
          created_at?: string
          created_by?: string | null
          excerpt?: string | null
          faq?: Json
          featured?: boolean
          id?: string
          noindex?: boolean
          organization_id?: string
          published_at?: string | null
          reading_minutes?: number | null
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          status?: string
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          author_name?: string | null
          canonical_url?: string | null
          category?: string | null
          category_slug?: string | null
          content?: string | null
          cover_image_alt?: string | null
          cover_image_height?: number | null
          cover_image_url?: string | null
          cover_image_width?: number | null
          created_at?: string
          created_by?: string | null
          excerpt?: string | null
          faq?: Json
          featured?: boolean
          id?: string
          noindex?: boolean
          organization_id?: string
          published_at?: string | null
          reading_minutes?: number | null
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          status?: string
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blog_posts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      charge_point_faults: {
        Row: {
          id: string
          charge_point_id: string
          location_id: string | null
          client_id: string | null
          organization_id: string | null
          status: Database["public"]["Enums"]["fault_status"]
          severity: Database["public"]["Enums"]["fault_severity"]
          detected_at: string
          fault_reason: string
          road_connectivity_state: string | null
          road_operational_status: string | null
          first_status: string | null
          resolved_at: string | null
          auto_recovered: boolean
          assigned_to: string | null
          eflux_reported_at: string | null
          customer_contacted_at: string | null
          visit_scheduled_at: string | null
          visit_date: string | null
          notes: string | null
          email_sent_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          charge_point_id: string
          location_id?: string | null
          client_id?: string | null
          organization_id?: string | null
          status?: Database["public"]["Enums"]["fault_status"]
          severity?: Database["public"]["Enums"]["fault_severity"]
          detected_at?: string
          fault_reason: string
          road_connectivity_state?: string | null
          road_operational_status?: string | null
          first_status?: string | null
          resolved_at?: string | null
          auto_recovered?: boolean
          assigned_to?: string | null
          eflux_reported_at?: string | null
          customer_contacted_at?: string | null
          visit_scheduled_at?: string | null
          visit_date?: string | null
          notes?: string | null
          email_sent_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          charge_point_id?: string
          location_id?: string | null
          client_id?: string | null
          organization_id?: string | null
          status?: Database["public"]["Enums"]["fault_status"]
          severity?: Database["public"]["Enums"]["fault_severity"]
          detected_at?: string
          fault_reason?: string
          road_connectivity_state?: string | null
          road_operational_status?: string | null
          first_status?: string | null
          resolved_at?: string | null
          auto_recovered?: boolean
          assigned_to?: string | null
          eflux_reported_at?: string | null
          customer_contacted_at?: string | null
          visit_scheduled_at?: string | null
          visit_date?: string | null
          notes?: string | null
          email_sent_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      charge_point_fault_events: {
        Row: {
          id: string
          fault_id: string
          user_id: string | null
          event_type: string
          from_status: Database["public"]["Enums"]["fault_status"] | null
          to_status: Database["public"]["Enums"]["fault_status"] | null
          note: string | null
          created_at: string
        }
        Insert: {
          id?: string
          fault_id: string
          user_id?: string | null
          event_type: string
          from_status?: Database["public"]["Enums"]["fault_status"] | null
          to_status?: Database["public"]["Enums"]["fault_status"] | null
          note?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          fault_id?: string
          user_id?: string | null
          event_type?: string
          from_status?: Database["public"]["Enums"]["fault_status"] | null
          to_status?: Database["public"]["Enums"]["fault_status"] | null
          note?: string | null
          created_at?: string
        }
        Relationships: []
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
          company_id: string | null
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
          managed: boolean
          monthly_platform_surcharge: number | null
          notes: string | null
          notice_period_months: number
          organization_id: string
          payment_onboarding_status: string
          payment_onboarding_submitted_at: string | null
          payment_onboarding_verified_at: string | null
          person_id: string | null
          portal_user_id: string | null
          revenue_share_percentage: number | null
          status: string | null
          updated_at: string
          country: string
          vat_liable: boolean
          vat_status: string | null
          vat_status_confirmed_at: string | null
          vat_status_confirmed_by: string | null
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
          company_id?: string | null
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
          managed?: boolean
          monthly_platform_surcharge?: number | null
          notes?: string | null
          notice_period_months?: number
          organization_id: string
          payment_onboarding_status?: string
          payment_onboarding_submitted_at?: string | null
          payment_onboarding_verified_at?: string | null
          person_id?: string | null
          portal_user_id?: string | null
          revenue_share_percentage?: number | null
          status?: string | null
          updated_at?: string
          country?: string
          vat_liable?: boolean
          vat_status?: string | null
          vat_status_confirmed_at?: string | null
          vat_status_confirmed_by?: string | null
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
          company_id?: string | null
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
          managed?: boolean
          monthly_platform_surcharge?: number | null
          notes?: string | null
          notice_period_months?: number
          organization_id?: string
          payment_onboarding_status?: string
          payment_onboarding_submitted_at?: string | null
          payment_onboarding_verified_at?: string | null
          person_id?: string | null
          portal_user_id?: string | null
          revenue_share_percentage?: number | null
          status?: string | null
          updated_at?: string
          country?: string
          vat_liable?: boolean
          vat_status?: string | null
          vat_status_confirmed_at?: string | null
          vat_status_confirmed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address_street: string | null
          btw_number: string | null
          city: string | null
          created_at: string
          created_by: string | null
          id: string
          kvk: string | null
          name: string
          normalized_name: string | null
          notes: string | null
          organization_id: string
          postal_code: string | null
          sector: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address_street?: string | null
          btw_number?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kvk?: string | null
          name: string
          normalized_name?: string | null
          notes?: string | null
          organization_id: string
          postal_code?: string | null
          sector?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address_street?: string | null
          btw_number?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kvk?: string | null
          name?: string
          normalized_name?: string | null
          notes?: string | null
          organization_id?: string
          postal_code?: string | null
          sector?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      company_persons: {
        Row: {
          company_id: string
          created_at: string
          id: string
          is_primary: boolean
          person_id: string
          role: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          is_primary?: boolean
          person_id: string
          role?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          person_id?: string
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_persons_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_persons_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
        ]
      }
      configurator_drafts: {
        Row: {
          actor_user_id: string
          archived_at: string | null
          created_at: string
          current_step: number
          draft: Json
          expires_at: string
          id: string
          session_id: string
          updated_at: string
        }
        Insert: {
          actor_user_id: string
          archived_at?: string | null
          created_at?: string
          current_step?: number
          draft: Json
          expires_at?: string
          id?: string
          session_id: string
          updated_at?: string
        }
        Update: {
          actor_user_id?: string
          archived_at?: string | null
          created_at?: string
          current_step?: number
          draft?: Json
          expires_at?: string
          id?: string
          session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "configurator_drafts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "configurator_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      configurator_sessions: {
        Row: {
          actor_user_id: string
          created_at: string
          expires_at: string
          id: string
          last_seen_at: string
          lead_id: string | null
          organization_id: string
          scopes: string[]
          settings_id: string
          settings_version: number
          status: string
        }
        Insert: {
          actor_user_id: string
          created_at?: string
          expires_at: string
          id?: string
          last_seen_at?: string
          lead_id?: string | null
          organization_id: string
          scopes?: string[]
          settings_id: string
          settings_version: number
          status?: string
        }
        Update: {
          actor_user_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          last_seen_at?: string
          lead_id?: string | null
          organization_id?: string
          scopes?: string[]
          settings_id?: string
          settings_version?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "configurator_sessions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "configurator_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "configurator_sessions_settings_id_fkey"
            columns: ["settings_id"]
            isOneToOne: false
            referencedRelation: "configurator_settings"
            referencedColumns: ["id"]
          },
        ]
      }
      configurator_settings: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          organization_id: string
          settings: Json
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          organization_id: string
          settings: Json
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          organization_id?: string
          settings?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "configurator_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_intake_log: {
        Row: {
          created_at: string
          id: string
          ip_hash: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          ip_hash?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          ip_hash?: string | null
        }
        Relationships: []
      }
      customer_configurations: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          pricing_input: Json
          pricing_result: Json
          settings_version: number
          source_session_id: string | null
          status: string
          version: number
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          pricing_input: Json
          pricing_result: Json
          settings_version: number
          source_session_id?: string | null
          status?: string
          version: number
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          pricing_input?: Json
          pricing_result?: Json
          settings_version?: number
          source_session_id?: string | null
          status?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_configurations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_configurations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_configurations_source_session_id_fkey"
            columns: ["source_session_id"]
            isOneToOne: false
            referencedRelation: "configurator_sessions"
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
      installation_orders: {
        Row: {
          client_id: string | null
          company_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          egroup_order_id: string | null
          egroup_order_number: string | null
          external_ref: string | null
          external_status: string | null
          handoff_at: string | null
          id: string
          last_sync_error: string | null
          lead_id: string | null
          notes: string | null
          organization_id: string
          quote_id: string | null
          scheduled_date: string | null
          service_category: string
          service_summary: string | null
          site_city: string | null
          site_contact_email: string | null
          site_contact_name: string | null
          site_contact_phone: string | null
          site_house_number: string | null
          site_postal: string | null
          site_street: string | null
          status: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          egroup_order_id?: string | null
          egroup_order_number?: string | null
          external_ref?: string | null
          external_status?: string | null
          handoff_at?: string | null
          id?: string
          last_sync_error?: string | null
          lead_id?: string | null
          notes?: string | null
          organization_id: string
          quote_id?: string | null
          scheduled_date?: string | null
          service_category?: string
          service_summary?: string | null
          site_city?: string | null
          site_contact_email?: string | null
          site_contact_name?: string | null
          site_contact_phone?: string | null
          site_house_number?: string | null
          site_postal?: string | null
          site_street?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          egroup_order_id?: string | null
          egroup_order_number?: string | null
          external_ref?: string | null
          external_status?: string | null
          handoff_at?: string | null
          id?: string
          last_sync_error?: string | null
          lead_id?: string | null
          notes?: string | null
          organization_id?: string
          quote_id?: string | null
          scheduled_date?: string | null
          service_category?: string
          service_summary?: string | null
          site_city?: string | null
          site_contact_email?: string | null
          site_contact_name?: string | null
          site_contact_phone?: string | null
          site_house_number?: string | null
          site_postal?: string | null
          site_street?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "installation_orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installation_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installation_orders_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installation_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installation_orders_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_activities: {
        Row: {
          created_at: string
          description: string | null
          id: string
          lead_id: string
          metadata: Json
          organization_id: string
          type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          lead_id: string
          metadata?: Json
          organization_id: string
          type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          lead_id?: string
          metadata?: Json
          organization_id?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_stage_tasks: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          position: number
          stage_id: string
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          position?: number
          stage_id: string
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          position?: number
          stage_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_stage_tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_stage_tasks_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "lead_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_stages: {
        Row: {
          color: string
          created_at: string
          id: string
          is_default: boolean
          is_lost: boolean
          is_won: boolean
          name: string
          organization_id: string
          position: number
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_default?: boolean
          is_lost?: boolean
          is_won?: boolean
          name: string
          organization_id: string
          position?: number
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_default?: boolean
          is_lost?: boolean
          is_won?: boolean
          name?: string
          organization_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "lead_stages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_tasks: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          done: boolean
          due_date: string | null
          id: string
          lead_id: string
          organization_id: string
          position: number
          title: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          done?: boolean
          due_date?: string | null
          id?: string
          lead_id: string
          organization_id: string
          position?: number
          title: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          done?: boolean
          due_date?: string | null
          id?: string
          lead_id?: string
          organization_id?: string
          position?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          address_street: string | null
          appointment_at: string | null
          appointment_notes: string | null
          charger_type: string | null
          city: string | null
          company_id: string | null
          company_name: string
          configuration: Json | null
          configuration_updated_at: string | null
          configurator_session_id: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          contact_role: string | null
          converted_client_id: string | null
          created_at: string
          created_by: string | null
          estimated_charge_points: number | null
          estimated_kwh_per_month: number | null
          estimated_value: number | null
          expected_close_date: string | null
          grid_notes: string | null
          has_solar: boolean | null
          id: string
          kvk: string | null
          location_type: string | null
          lost_reason: string | null
          message_body: string | null
          message_subject: string | null
          notes: string | null
          organization_id: string
          owner_user_id: string | null
          owns_property: boolean | null
          parking_spaces: number | null
          person_id: string | null
          position: number
          postal_code: string | null
          priority: string
          quote_id: string | null
          sector: string | null
          source: string
          stage_id: string | null
          status: string
          updated_at: string
          website: string | null
          won_at: string | null
        }
        Insert: {
          address_street?: string | null
          appointment_at?: string | null
          appointment_notes?: string | null
          charger_type?: string | null
          city?: string | null
          company_id?: string | null
          company_name: string
          configuration?: Json | null
          configuration_updated_at?: string | null
          configurator_session_id?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_role?: string | null
          converted_client_id?: string | null
          created_at?: string
          created_by?: string | null
          estimated_charge_points?: number | null
          estimated_kwh_per_month?: number | null
          estimated_value?: number | null
          expected_close_date?: string | null
          grid_notes?: string | null
          has_solar?: boolean | null
          id?: string
          kvk?: string | null
          location_type?: string | null
          lost_reason?: string | null
          message_body?: string | null
          message_subject?: string | null
          notes?: string | null
          organization_id: string
          owner_user_id?: string | null
          owns_property?: boolean | null
          parking_spaces?: number | null
          person_id?: string | null
          position?: number
          postal_code?: string | null
          priority?: string
          quote_id?: string | null
          sector?: string | null
          source?: string
          stage_id?: string | null
          status?: string
          updated_at?: string
          website?: string | null
          won_at?: string | null
        }
        Update: {
          address_street?: string | null
          appointment_at?: string | null
          appointment_notes?: string | null
          charger_type?: string | null
          city?: string | null
          company_id?: string | null
          company_name?: string
          configuration?: Json | null
          configuration_updated_at?: string | null
          configurator_session_id?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_role?: string | null
          converted_client_id?: string | null
          created_at?: string
          created_by?: string | null
          estimated_charge_points?: number | null
          estimated_kwh_per_month?: number | null
          estimated_value?: number | null
          expected_close_date?: string | null
          grid_notes?: string | null
          has_solar?: boolean | null
          id?: string
          kvk?: string | null
          location_type?: string | null
          lost_reason?: string | null
          message_body?: string | null
          message_subject?: string | null
          notes?: string | null
          organization_id?: string
          owner_user_id?: string | null
          owns_property?: boolean | null
          parking_spaces?: number | null
          person_id?: string | null
          position?: number
          postal_code?: string | null
          priority?: string
          quote_id?: string | null
          sector?: string | null
          source?: string
          stage_id?: string | null
          status?: string
          updated_at?: string
          website?: string | null
          won_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_converted_client_id_fkey"
            columns: ["converted_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "lead_stages"
            referencedColumns: ["id"]
          },
        ]
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
          address_city: string | null
          address_postal: string | null
          address_street: string | null
          country: string
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
          fault_detection_enabled: boolean
          fault_heartbeat_grace_minutes: number
          fault_notification_email: string
          iban: string | null
          id: string
          kvk: string | null
          logo_url: string | null
          name: string
          phone: string | null
          sharepoint_drive_id: string | null
          sharepoint_root_item_id: string | null
          sharepoint_site_id: string | null
          sharepoint_site_url: string | null
          updated_at: string | null
        }
        Insert: {
          fault_detection_enabled?: boolean
          fault_heartbeat_grace_minutes?: number
          fault_notification_email?: string
          address?: string | null
          address_city?: string | null
          address_postal?: string | null
          address_street?: string | null
          bic?: string | null
          country?: string
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
          sharepoint_drive_id?: string | null
          sharepoint_root_item_id?: string | null
          sharepoint_site_id?: string | null
          sharepoint_site_url?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          address_city?: string | null
          address_postal?: string | null
          address_street?: string | null
          bic?: string | null
          country?: string
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
          fault_detection_enabled?: boolean
          fault_heartbeat_grace_minutes?: number
          fault_notification_email?: string
          iban?: string | null
          id?: string
          kvk?: string | null
          logo_url?: string | null
          name?: string
          phone?: string | null
          sharepoint_drive_id?: string | null
          sharepoint_root_item_id?: string | null
          sharepoint_site_id?: string | null
          sharepoint_site_url?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      password_reset_log: {
        Row: {
          created_at: string
          email_hash: string | null
          id: number
          ip_hash: string | null
        }
        Insert: {
          created_at?: string
          email_hash?: string | null
          id?: never
          ip_hash?: string | null
        }
        Update: {
          created_at?: string
          email_hash?: string | null
          id?: never
          ip_hash?: string | null
        }
        Relationships: []
      }
      persons: {
        Row: {
          created_at: string
          created_by: string | null
          email: string | null
          first_name: string | null
          full_name: string | null
          id: string
          last_name: string | null
          notes: string | null
          organization_id: string
          phone: string | null
          role: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          first_name?: string | null
          full_name?: string | null
          id?: string
          last_name?: string | null
          notes?: string | null
          organization_id: string
          phone?: string | null
          role?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          first_name?: string | null
          full_name?: string | null
          id?: string
          last_name?: string | null
          notes?: string | null
          organization_id?: string
          phone?: string | null
          role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "persons_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          organization_id: string | null
          signature_data_url: string | null
          signer_title: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id?: string
          organization_id?: string | null
          signature_data_url?: string | null
          signer_title?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          organization_id?: string | null
          signature_data_url?: string | null
          signer_title?: string | null
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
      project_locations: {
        Row: {
          address_street: string | null
          city: string | null
          client_id: string | null
          company_id: string | null
          created_at: string
          descriptive_label: string | null
          display_name: string
          doc_seq: number
          folder_item_id: string | null
          folder_web_url: string | null
          id: string
          lead_id: string | null
          location_number: number
          opdracht_item_id: string | null
          organization_id: string
          postal_code: string | null
          updated_at: string
        }
        Insert: {
          address_street?: string | null
          city?: string | null
          client_id?: string | null
          company_id?: string | null
          created_at?: string
          descriptive_label?: string | null
          display_name: string
          doc_seq?: number
          folder_item_id?: string | null
          folder_web_url?: string | null
          id?: string
          lead_id?: string | null
          location_number?: number
          opdracht_item_id?: string | null
          organization_id: string
          postal_code?: string | null
          updated_at?: string
        }
        Update: {
          address_street?: string | null
          city?: string | null
          client_id?: string | null
          company_id?: string | null
          created_at?: string
          descriptive_label?: string | null
          display_name?: string
          doc_seq?: number
          folder_item_id?: string | null
          folder_web_url?: string | null
          id?: string
          lead_id?: string | null
          location_number?: number
          opdracht_item_id?: string | null
          organization_id?: string
          postal_code?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      quote_acceptances: {
        Row: {
          accepted_at: string | null
          created_at: string
          expires_at: string
          id: string
          organization_id: string
          quote_id: string
          status: string
          token_hash: string
          token_last4: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          organization_id: string
          quote_id: string
          status?: string
          token_hash: string
          token_last4?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          organization_id?: string
          quote_id?: string
          status?: string
          token_hash?: string
          token_last4?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_acceptances_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_acceptances_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_internal_signings: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          organization_id: string
          quote_id: string
          signed_at: string | null
          signer_user_id: string
          status: string
          token_hash: string
          token_last4: string | null
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          organization_id: string
          quote_id: string
          signed_at?: string | null
          signer_user_id: string
          status?: string
          token_hash: string
          token_last4?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          organization_id?: string
          quote_id?: string
          signed_at?: string | null
          signer_user_id?: string
          status?: string
          token_hash?: string
          token_last4?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_internal_signings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_internal_signings_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
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
          company_id: string | null
          created_at: string
          energy_cost_per_kwh: number | null
          ere_rate_per_kwh: number | null
          estimated_kwh_per_point: number | null
          has_solar: boolean | null
          id: string
          internal_signature_data_url: string | null
          internal_signed_at: string | null
          internal_signer_function: string | null
          internal_signer_name: string | null
          internal_signer_user_id: string | null
          lead_id: string | null
          line_items: Json
          locations_data: Json | null
          monthly_projection: Json | null
          notes: string | null
          num_charge_points: number | null
          offer_details: Json
          organization_id: string
          person_id: string | null
          prospect_company: string | null
          prospect_contact: string | null
          prospect_email: string | null
          quote_number: string | null
          revenue_share_pct: number | null
          sent_at: string | null
          signed_at: string | null
          signed_pdf_path: string | null
          signer_name: string | null
          solar_percentage: number | null
          status: string | null
          tariff_data: Json | null
          total_hardware_cost: number | null
          total_installation_cost: number | null
          updated_at: string | null
          valid_until: string | null
          document_number: number | null
          off_item_id: string | null
          off_web_url: string | null
          opd_item_id: string | null
          opd_web_url: string | null
          project_location_id: string | null
          with_management: boolean
        }
        Insert: {
          calculation_data?: Json | null
          calculation_snapshot?: Json | null
          charge_point_type?: string | null
          charge_rate_per_kwh?: number | null
          client_id?: string | null
          company_id?: string | null
          created_at?: string
          energy_cost_per_kwh?: number | null
          ere_rate_per_kwh?: number | null
          estimated_kwh_per_point?: number | null
          has_solar?: boolean | null
          id?: string
          internal_signature_data_url?: string | null
          internal_signed_at?: string | null
          internal_signer_function?: string | null
          internal_signer_name?: string | null
          internal_signer_user_id?: string | null
          lead_id?: string | null
          line_items?: Json
          locations_data?: Json | null
          monthly_projection?: Json | null
          notes?: string | null
          num_charge_points?: number | null
          organization_id: string
          person_id?: string | null
          prospect_company?: string | null
          prospect_contact?: string | null
          prospect_email?: string | null
          quote_number?: string | null
          revenue_share_pct?: number | null
          sent_at?: string | null
          signed_at?: string | null
          signed_pdf_path?: string | null
          signer_name?: string | null
          solar_percentage?: number | null
          status?: string | null
          tariff_data?: Json | null
          total_hardware_cost?: number | null
          total_installation_cost?: number | null
          updated_at?: string | null
          valid_until?: string | null
          document_number?: number | null
          off_item_id?: string | null
          off_web_url?: string | null
          opd_item_id?: string | null
          opd_web_url?: string | null
          project_location_id?: string | null
          with_management?: boolean
        }
        Update: {
          calculation_data?: Json | null
          calculation_snapshot?: Json | null
          charge_point_type?: string | null
          charge_rate_per_kwh?: number | null
          client_id?: string | null
          company_id?: string | null
          created_at?: string
          energy_cost_per_kwh?: number | null
          ere_rate_per_kwh?: number | null
          estimated_kwh_per_point?: number | null
          has_solar?: boolean | null
          id?: string
          internal_signature_data_url?: string | null
          internal_signed_at?: string | null
          internal_signer_function?: string | null
          internal_signer_name?: string | null
          internal_signer_user_id?: string | null
          lead_id?: string | null
          line_items?: Json
          locations_data?: Json | null
          monthly_projection?: Json | null
          notes?: string | null
          num_charge_points?: number | null
          offer_details?: Json
          organization_id?: string
          person_id?: string | null
          prospect_company?: string | null
          prospect_contact?: string | null
          prospect_email?: string | null
          quote_number?: string | null
          revenue_share_pct?: number | null
          sent_at?: string | null
          signed_at?: string | null
          signed_pdf_path?: string | null
          signer_name?: string | null
          solar_percentage?: number | null
          status?: string | null
          tariff_data?: Json | null
          total_hardware_cost?: number | null
          total_installation_cost?: number | null
          updated_at?: string | null
          valid_until?: string | null
          document_number?: number | null
          off_item_id?: string | null
          off_web_url?: string | null
          opd_item_id?: string | null
          opd_web_url?: string | null
          project_location_id?: string | null
          with_management?: boolean
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
            foreignKeyName: "quotes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
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
          fee_waived: boolean
          invoice_number: string | null
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
          vat_status: string | null
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
          fee_waived?: boolean
          invoice_number?: string | null
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
          vat_status?: string | null
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
          fee_waived?: boolean
          invoice_number?: string | null
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
          vat_status?: string | null
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
      amsterdam_month_bounds: {
        Args: { p_month: number; p_year: number }
        Returns: {
          end_ts: string
          start_ts: string
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
      get_portal_invoice_context: {
        Args: never
        Returns: {
          org_address: string
          org_address_city: string
          org_address_postal: string
          org_address_street: string
          org_country: string
          org_bic: string
          org_btw_number: string
          org_email: string
          org_iban: string
          org_kvk: string
          org_name: string
          payout_account_holder_name: string
          payout_bic: string
          payout_iban: string
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
      get_portal_sessions: {
        Args: {
          p_charge_point_id?: string
          p_from?: string
          p_limit?: number
          p_location_id?: string
          p_to?: string
        }
        Returns: {
          charge_point_id: string
          charge_point_name: string
          duration_minutes: number
          ended_at: string
          id: string
          kwh_delivered: number
          location_name: string
          started_at: string
          vergoeding: number
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
      set_settlement_fee_waived: {
        Args: { p_settlement_id: string; p_waived: boolean }
        Returns: {
          id: string
          fee_waived: boolean
          echarging_fee_per_kwh: number
          echarging_revenue: number
          client_payout: number
        }[]
      }
      confirm_client_vat_status: {
        Args: { p_client_id: string; p_vat_status: string }
        Returns: {
          id: string
          vat_status: string
          vat_status_confirmed_at: string
        }[]
      }
      unapprove_settlements: {
        Args: { settlement_ids: string[] }
        Returns: {
          unapproved_count: number
        }[]
      }
      move_stage: { Args: { p_dir: number; p_id: string }; Returns: undefined }
      next_offer_number: { Args: never; Returns: string }
      reorder_leads: { Args: { p_updates: Json }; Returns: undefined }
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
          p_vat_status?: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "manager"
        | "viewer"
        | "superadmin"
        | "sales"
        | "marketing"
      fault_status:
        | "nieuw"
        | "eflux_gemeld"
        | "klant_gecontacteerd"
        | "bezoek_ingepland"
        | "opgelost"
        | "automatisch_hersteld"
        | "vals_alarm"
      fault_severity: "storing" | "verdacht"
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
      app_role: [
        "admin",
        "manager",
        "viewer",
        "superadmin",
        "sales",
        "marketing",
      ],
    },
  },
} as const
