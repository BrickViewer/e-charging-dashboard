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
          created_at: string
          eflux_evse_controller_id: string | null
          eflux_evse_id: string | null
          id: string
          is_mid_certified: boolean
          last_heartbeat_at: string | null
          location_id: string
          max_power: number | null
          model: string | null
          monthly_platform_cost: number | null
          name: string | null
          num_connectors: number | null
          serial_number: string | null
          status: string | null
          type: string | null
          updated_at: string | null
        }
        Insert: {
          brand?: string | null
          connectivity_state?: string | null
          created_at?: string
          eflux_evse_controller_id?: string | null
          eflux_evse_id?: string | null
          id?: string
          is_mid_certified?: boolean
          last_heartbeat_at?: string | null
          location_id: string
          max_power?: number | null
          model?: string | null
          monthly_platform_cost?: number | null
          name?: string | null
          num_connectors?: number | null
          serial_number?: string | null
          status?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          brand?: string | null
          connectivity_state?: string | null
          created_at?: string
          eflux_evse_controller_id?: string | null
          eflux_evse_id?: string | null
          id?: string
          is_mid_certified?: boolean
          last_heartbeat_at?: string | null
          location_id?: string
          max_power?: number | null
          model?: string | null
          monthly_platform_cost?: number | null
          name?: string | null
          num_connectors?: number | null
          serial_number?: string | null
          status?: string | null
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
          client_id: string
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
          kwh_delivered: number | null
          location_id: string
          net_margin: number | null
          power_type: string | null
          start_costs: number | null
          started_at: string
          status: string | null
          time_costs: number | null
          total_price: number | null
          transaction_fee: number
          updated_at: string | null
        }
        Insert: {
          charge_point_id: string
          client_id: string
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
          kwh_delivered?: number | null
          location_id: string
          net_margin?: number | null
          power_type?: string | null
          start_costs?: number | null
          started_at: string
          status?: string | null
          time_costs?: number | null
          total_price?: number | null
          transaction_fee?: number
          updated_at?: string | null
        }
        Update: {
          charge_point_id?: string
          client_id?: string
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
          kwh_delivered?: number | null
          location_id?: string
          net_margin?: number | null
          power_type?: string | null
          start_costs?: number | null
          started_at?: string
          status?: string | null
          time_costs?: number | null
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
      clients: {
        Row: {
          auto_renew: boolean
          billing_address: string | null
          billing_address_city: string | null
          billing_address_postal: string | null
          billing_address_street: string | null
          btw_number: string | null
          charge_rate_per_kwh: number | null
          company_name: string
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          contract_duration_months: number | null
          contract_start_date: string | null
          created_at: string
          eflux_account_id: string | null
          energy_cost_per_kwh: number | null
          ere_rate_per_kwh: number | null
          id: string
          kvk: string | null
          monthly_platform_surcharge: number | null
          notes: string | null
          notice_period_months: number
          organization_id: string
          portal_user_id: string | null
          revenue_share_percentage: number | null
          status: string | null
          stripe_connected_account_id: string | null
          stripe_onboarding_status: string | null
          updated_at: string
        }
        Insert: {
          auto_renew?: boolean
          billing_address?: string | null
          billing_address_city?: string | null
          billing_address_postal?: string | null
          billing_address_street?: string | null
          btw_number?: string | null
          charge_rate_per_kwh?: number | null
          company_name: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contract_duration_months?: number | null
          contract_start_date?: string | null
          created_at?: string
          eflux_account_id?: string | null
          energy_cost_per_kwh?: number | null
          ere_rate_per_kwh?: number | null
          id?: string
          kvk?: string | null
          monthly_platform_surcharge?: number | null
          notes?: string | null
          notice_period_months?: number
          organization_id: string
          portal_user_id?: string | null
          revenue_share_percentage?: number | null
          status?: string | null
          stripe_connected_account_id?: string | null
          stripe_onboarding_status?: string | null
          updated_at?: string
        }
        Update: {
          auto_renew?: boolean
          billing_address?: string | null
          billing_address_city?: string | null
          billing_address_postal?: string | null
          billing_address_street?: string | null
          btw_number?: string | null
          charge_rate_per_kwh?: number | null
          company_name?: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contract_duration_months?: number | null
          contract_start_date?: string | null
          created_at?: string
          eflux_account_id?: string | null
          energy_cost_per_kwh?: number | null
          ere_rate_per_kwh?: number | null
          id?: string
          kvk?: string | null
          monthly_platform_surcharge?: number | null
          notes?: string | null
          notice_period_months?: number
          organization_id?: string
          portal_user_id?: string | null
          revenue_share_percentage?: number | null
          status?: string | null
          stripe_connected_account_id?: string | null
          stripe_onboarding_status?: string | null
          updated_at?: string
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
      locations: {
        Row: {
          address: string | null
          city: string | null
          client_id: string | null
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
          solar_capacity_kwp: number | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          client_id?: string | null
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
          solar_capacity_kwp?: number | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          client_id?: string | null
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
          created_at: string
          default_charge_rate_per_kwh: number | null
          default_eflux_cost_ac: number | null
          default_eflux_cost_dc: number | null
          default_energy_cost_per_kwh: number | null
          default_ere_rate_per_kwh: number | null
          default_revenue_share_pct: number | null
          eflux_api_key: string | null
          eflux_master_account_id: string | null
          eflux_provider_id: string | null
          email: string | null
          id: string
          kvk: string | null
          logo_url: string | null
          name: string
          phone: string | null
          stripe_account_id: string | null
          stripe_publishable_key: string | null
          stripe_secret_key: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          default_charge_rate_per_kwh?: number | null
          default_eflux_cost_ac?: number | null
          default_eflux_cost_dc?: number | null
          default_energy_cost_per_kwh?: number | null
          default_ere_rate_per_kwh?: number | null
          default_revenue_share_pct?: number | null
          eflux_api_key?: string | null
          eflux_master_account_id?: string | null
          eflux_provider_id?: string | null
          email?: string | null
          id?: string
          kvk?: string | null
          logo_url?: string | null
          name: string
          phone?: string | null
          stripe_account_id?: string | null
          stripe_publishable_key?: string | null
          stripe_secret_key?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          default_charge_rate_per_kwh?: number | null
          default_eflux_cost_ac?: number | null
          default_eflux_cost_dc?: number | null
          default_energy_cost_per_kwh?: number | null
          default_ere_rate_per_kwh?: number | null
          default_revenue_share_pct?: number | null
          eflux_api_key?: string | null
          eflux_master_account_id?: string | null
          eflux_provider_id?: string | null
          email?: string | null
          id?: string
          kvk?: string | null
          logo_url?: string | null
          name?: string
          phone?: string | null
          stripe_account_id?: string | null
          stripe_publishable_key?: string | null
          stripe_secret_key?: string | null
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
      quarterly_settlements: {
        Row: {
          client_id: string
          client_payout: number
          created_at: string
          echarging_revenue: number
          ere_commission: number
          ere_estimate: number
          gross_revenue: number
          id: string
          net_margin: number
          paid_at: string | null
          period_end: string
          period_start: string
          quarter: number
          status: string
          stripe_charge_id: string | null
          stripe_transfer_id: string | null
          total_energy_cost: number
          total_kwh: number
          total_platform_fee: number
          total_sessions: number
          total_transaction_fees: number
          updated_at: string
          year: number
        }
        Insert: {
          client_id: string
          client_payout?: number
          created_at?: string
          echarging_revenue?: number
          ere_commission?: number
          ere_estimate?: number
          gross_revenue?: number
          id?: string
          net_margin?: number
          paid_at?: string | null
          period_end: string
          period_start: string
          quarter: number
          status?: string
          stripe_charge_id?: string | null
          stripe_transfer_id?: string | null
          total_energy_cost?: number
          total_kwh?: number
          total_platform_fee?: number
          total_sessions?: number
          total_transaction_fees?: number
          updated_at?: string
          year: number
        }
        Update: {
          client_id?: string
          client_payout?: number
          created_at?: string
          echarging_revenue?: number
          ere_commission?: number
          ere_estimate?: number
          gross_revenue?: number
          id?: string
          net_margin?: number
          paid_at?: string | null
          period_end?: string
          period_start?: string
          quarter?: number
          status?: string
          stripe_charge_id?: string | null
          stripe_transfer_id?: string | null
          total_energy_cost?: number
          total_kwh?: number
          total_platform_fee?: number
          total_sessions?: number
          total_transaction_fees?: number
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "quarterly_settlements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
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
      get_client_id_for_user: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_internal: { Args: { _user_id: string }; Returns: boolean }
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
