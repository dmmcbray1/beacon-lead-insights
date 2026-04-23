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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      agencies: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      call_events: {
        Row: {
          agency_id: string
          call_date: string | null
          call_direction: string | null
          call_duration_seconds: number | null
          call_status: string | null
          call_type: string | null
          created_at: string
          current_status: string | null
          id: string
          is_bad_phone: boolean | null
          is_callback: boolean | null
          is_contact: boolean | null
          is_quote: boolean | null
          is_voicemail: boolean | null
          lead_id: string
          source_raw_row_id: string | null
          source_upload_id: string | null
          staff_id: string | null
          vendor_name: string | null
        }
        Insert: {
          agency_id: string
          call_date?: string | null
          call_direction?: string | null
          call_duration_seconds?: number | null
          call_status?: string | null
          call_type?: string | null
          created_at?: string
          current_status?: string | null
          id?: string
          is_bad_phone?: boolean | null
          is_callback?: boolean | null
          is_contact?: boolean | null
          is_quote?: boolean | null
          is_voicemail?: boolean | null
          lead_id: string
          source_raw_row_id?: string | null
          source_upload_id?: string | null
          staff_id?: string | null
          vendor_name?: string | null
        }
        Update: {
          agency_id?: string
          call_date?: string | null
          call_direction?: string | null
          call_duration_seconds?: number | null
          call_status?: string | null
          call_type?: string | null
          created_at?: string
          current_status?: string | null
          id?: string
          is_bad_phone?: boolean | null
          is_callback?: boolean | null
          is_contact?: boolean | null
          is_quote?: boolean | null
          is_voicemail?: boolean | null
          lead_id?: string
          source_raw_row_id?: string | null
          source_upload_id?: string | null
          staff_id?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_events_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_events_source_upload_id_fkey"
            columns: ["source_upload_id"]
            isOneToOne: false
            referencedRelation: "uploads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_events_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      call_type_mappings: {
        Row: {
          call_type_value: string
          created_at: string
          direction: string
          id: string
          is_active: boolean | null
          is_callback_type: boolean | null
        }
        Insert: {
          call_type_value: string
          created_at?: string
          direction: string
          id?: string
          is_active?: boolean | null
          is_callback_type?: boolean | null
        }
        Update: {
          call_type_value?: string
          created_at?: string
          direction?: string
          id?: string
          is_active?: boolean | null
          is_callback_type?: boolean | null
        }
        Relationships: []
      }
      callback_events: {
        Row: {
          call_type: string
          callback_date: string
          created_at: string
          id: string
          lead_id: string
          source_upload_id: string | null
          staff_id: string | null
        }
        Insert: {
          call_type: string
          callback_date: string
          created_at?: string
          id?: string
          lead_id: string
          source_upload_id?: string | null
          staff_id?: string | null
        }
        Update: {
          call_type?: string
          callback_date?: string
          created_at?: string
          id?: string
          lead_id?: string
          source_upload_id?: string | null
          staff_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "callback_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "callback_events_source_upload_id_fkey"
            columns: ["source_upload_id"]
            isOneToOne: false
            referencedRelation: "uploads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "callback_events_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      disposition_mappings: {
        Row: {
          category: string
          created_at: string
          id: string
          is_active: boolean | null
          status_value: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          status_value: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          status_value?: string
        }
        Relationships: []
      }
      import_errors: {
        Row: {
          created_at: string
          error_message: string
          error_type: string
          id: string
          raw_data: Json | null
          row_number: number | null
          upload_id: string
        }
        Insert: {
          created_at?: string
          error_message: string
          error_type: string
          id?: string
          raw_data?: Json | null
          row_number?: number | null
          upload_id: string
        }
        Update: {
          created_at?: string
          error_message?: string
          error_type?: string
          id?: string
          raw_data?: Json | null
          row_number?: number | null
          upload_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_errors_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_identity_links: {
        Row: {
          created_at: string
          id: string
          identity_type: string
          identity_value: string
          lead_id: string
          source_upload_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          identity_type: string
          identity_value: string
          lead_id: string
          source_upload_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          identity_type?: string
          identity_value?: string
          lead_id?: string
          source_upload_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_identity_links_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_identity_links_source_upload_id_fkey"
            columns: ["source_upload_id"]
            isOneToOne: false
            referencedRelation: "uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_requote_events: {
        Row: {
          agency_id: string
          batch_id: string | null
          campaign: string | null
          created_at: string
          id: string
          lead_cost: number | null
          lead_date: string | null
          lead_id: string
          raw_row_id: string | null
          upload_id: string
          was_overwritten: boolean
        }
        Insert: {
          agency_id: string
          batch_id?: string | null
          campaign?: string | null
          created_at?: string
          id?: string
          lead_cost?: number | null
          lead_date?: string | null
          lead_id: string
          raw_row_id?: string | null
          upload_id: string
          was_overwritten?: boolean
        }
        Update: {
          agency_id?: string
          batch_id?: string | null
          campaign?: string | null
          created_at?: string
          id?: string
          lead_cost?: number | null
          lead_date?: string | null
          lead_id?: string
          raw_row_id?: string | null
          upload_id?: string
          was_overwritten?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "lead_requote_events_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_requote_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_requote_events_raw_row_id_fkey"
            columns: ["raw_row_id"]
            isOneToOne: false
            referencedRelation: "raw_ricochet_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_requote_events_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_staff_history: {
        Row: {
          created_at: string
          first_seen_date: string
          id: string
          lead_id: string
          source_type: string
          source_upload_id: string | null
          staff_id: string
        }
        Insert: {
          created_at?: string
          first_seen_date?: string
          id?: string
          lead_id: string
          source_type: string
          source_upload_id?: string | null
          staff_id: string
        }
        Update: {
          created_at?: string
          first_seen_date?: string
          id?: string
          lead_id?: string
          source_type?: string
          source_upload_id?: string | null
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_staff_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_staff_history_source_upload_id_fkey"
            columns: ["source_upload_id"]
            isOneToOne: false
            referencedRelation: "uploads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_staff_history_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          agency_id: string
          calls_at_first_quote: number | null
          calls_at_first_sold: number | null
          campaign: string | null
          city: string | null
          created_at: string
          current_lead_type: string | null
          current_status: string | null
          dwelling_value: number | null
          email: string | null
          first_callback_date: string | null
          first_contact_date: string | null
          first_daily_call_date: string | null
          first_deer_dama_date: string | null
          first_name: string | null
          first_quote_date: string | null
          first_seen_date: string | null
          first_sold_date: string | null
          has_bad_phone: boolean | null
          home_value: number | null
          id: string
          last_name: string | null
          latest_call_date: string | null
          latest_callback_date: string | null
          latest_contact_date: string | null
          latest_quote_date: string | null
          latest_vendor_name: string | null
          lead_cost: number | null
          lead_date: string | null
          lead_id_external: string | null
          normalized_phone: string
          raw_phone: string | null
          ricochet_source_upload_id: string | null
          state: string | null
          street_address: string | null
          total_call_attempts: number | null
          total_callbacks: number | null
          total_voicemails: number | null
          updated_at: string
          zip: string | null
        }
        Insert: {
          agency_id: string
          calls_at_first_quote?: number | null
          calls_at_first_sold?: number | null
          campaign?: string | null
          city?: string | null
          created_at?: string
          current_lead_type?: string | null
          current_status?: string | null
          dwelling_value?: number | null
          email?: string | null
          first_callback_date?: string | null
          first_contact_date?: string | null
          first_daily_call_date?: string | null
          first_deer_dama_date?: string | null
          first_name?: string | null
          first_quote_date?: string | null
          first_seen_date?: string | null
          first_sold_date?: string | null
          has_bad_phone?: boolean | null
          home_value?: number | null
          id?: string
          last_name?: string | null
          latest_call_date?: string | null
          latest_callback_date?: string | null
          latest_contact_date?: string | null
          latest_quote_date?: string | null
          latest_vendor_name?: string | null
          lead_cost?: number | null
          lead_date?: string | null
          lead_id_external?: string | null
          normalized_phone: string
          raw_phone?: string | null
          ricochet_source_upload_id?: string | null
          state?: string | null
          street_address?: string | null
          total_call_attempts?: number | null
          total_callbacks?: number | null
          total_voicemails?: number | null
          updated_at?: string
          zip?: string | null
        }
        Update: {
          agency_id?: string
          calls_at_first_quote?: number | null
          calls_at_first_sold?: number | null
          campaign?: string | null
          city?: string | null
          created_at?: string
          current_lead_type?: string | null
          current_status?: string | null
          dwelling_value?: number | null
          email?: string | null
          first_callback_date?: string | null
          first_contact_date?: string | null
          first_daily_call_date?: string | null
          first_deer_dama_date?: string | null
          first_name?: string | null
          first_quote_date?: string | null
          first_seen_date?: string | null
          first_sold_date?: string | null
          has_bad_phone?: boolean | null
          home_value?: number | null
          id?: string
          last_name?: string | null
          latest_call_date?: string | null
          latest_callback_date?: string | null
          latest_contact_date?: string | null
          latest_quote_date?: string | null
          latest_vendor_name?: string | null
          lead_cost?: number | null
          lead_date?: string | null
          lead_id_external?: string | null
          normalized_phone?: string
          raw_phone?: string | null
          ricochet_source_upload_id?: string | null
          state?: string | null
          street_address?: string | null
          total_call_attempts?: number | null
          total_callbacks?: number | null
          total_voicemails?: number | null
          updated_at?: string
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_ricochet_source_upload_id_fkey"
            columns: ["ricochet_source_upload_id"]
            isOneToOne: false
            referencedRelation: "uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      match_audit_log: {
        Row: {
          agency_id: string | null
          created_at: string
          id: string
          lead_id_used: string | null
          match_rule: string
          matched_lead_id: string | null
          notes: string | null
          phone_used: string | null
          raw_row_id: string
          raw_table: string
          upload_id: string
        }
        Insert: {
          agency_id?: string | null
          created_at?: string
          id?: string
          lead_id_used?: string | null
          match_rule: string
          matched_lead_id?: string | null
          notes?: string | null
          phone_used?: string | null
          raw_row_id: string
          raw_table: string
          upload_id: string
        }
        Update: {
          agency_id?: string | null
          created_at?: string
          id?: string
          lead_id_used?: string | null
          match_rule?: string
          matched_lead_id?: string | null
          notes?: string | null
          phone_used?: string | null
          raw_row_id?: string
          raw_table?: string
          upload_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_audit_log_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_audit_log_matched_lead_id_fkey"
            columns: ["matched_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_audit_log_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_events: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          quote_date: string
          quote_status: string
          source_upload_id: string | null
          staff_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          quote_date: string
          quote_status: string
          source_upload_id?: string | null
          staff_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          quote_date?: string
          quote_status?: string
          source_upload_id?: string | null
          staff_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_events_source_upload_id_fkey"
            columns: ["source_upload_id"]
            isOneToOne: false
            referencedRelation: "uploads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_events_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_daily_call_rows: {
        Row: {
          call_duration: string | null
          call_duration_seconds: number | null
          call_status: string | null
          call_type: string | null
          created_at: string
          current_status: string | null
          date: string | null
          error_message: string | null
          from_number: string | null
          full_name: string | null
          id: string
          match_rule: string | null
          matched_lead_id: string | null
          normalized_phone: string | null
          processing_status: string | null
          raw_data: Json
          raw_phone: string | null
          resolved_lead_phone: string | null
          row_number: number | null
          team: string | null
          to_number: string | null
          upload_id: string
          user_name: string | null
          vendor_name: string | null
        }
        Insert: {
          call_duration?: string | null
          call_duration_seconds?: number | null
          call_status?: string | null
          call_type?: string | null
          created_at?: string
          current_status?: string | null
          date?: string | null
          error_message?: string | null
          from_number?: string | null
          full_name?: string | null
          id?: string
          match_rule?: string | null
          matched_lead_id?: string | null
          normalized_phone?: string | null
          processing_status?: string | null
          raw_data: Json
          raw_phone?: string | null
          resolved_lead_phone?: string | null
          row_number?: number | null
          team?: string | null
          to_number?: string | null
          upload_id: string
          user_name?: string | null
          vendor_name?: string | null
        }
        Update: {
          call_duration?: string | null
          call_duration_seconds?: number | null
          call_status?: string | null
          call_type?: string | null
          created_at?: string
          current_status?: string | null
          date?: string | null
          error_message?: string | null
          from_number?: string | null
          full_name?: string | null
          id?: string
          match_rule?: string | null
          matched_lead_id?: string | null
          normalized_phone?: string | null
          processing_status?: string | null
          raw_data?: Json
          raw_phone?: string | null
          resolved_lead_phone?: string | null
          row_number?: number | null
          team?: string | null
          to_number?: string | null
          upload_id?: string
          user_name?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "raw_daily_call_rows_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_deer_dama_rows: {
        Row: {
          address: string | null
          created_at: string
          created_at_source: string | null
          email: string | null
          error_message: string | null
          first_call_date: string | null
          first_name: string | null
          full_name: string | null
          id: string
          last_call_date: string | null
          last_name: string | null
          last_status_date: string | null
          lead_id_external: string | null
          lead_main_state: string | null
          lead_owner: string | null
          lead_status: string | null
          match_rule: string | null
          matched_lead_id: string | null
          normalized_phone: string | null
          phone_main: string | null
          processing_status: string | null
          raw_data: Json
          raw_phone: string | null
          row_number: number | null
          second_driver_first: string | null
          second_driver_last: string | null
          total_calls: number | null
          upload_id: string
          vendor: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_at_source?: string | null
          email?: string | null
          error_message?: string | null
          first_call_date?: string | null
          first_name?: string | null
          full_name?: string | null
          id?: string
          last_call_date?: string | null
          last_name?: string | null
          last_status_date?: string | null
          lead_id_external?: string | null
          lead_main_state?: string | null
          lead_owner?: string | null
          lead_status?: string | null
          match_rule?: string | null
          matched_lead_id?: string | null
          normalized_phone?: string | null
          phone_main?: string | null
          processing_status?: string | null
          raw_data: Json
          raw_phone?: string | null
          row_number?: number | null
          second_driver_first?: string | null
          second_driver_last?: string | null
          total_calls?: number | null
          upload_id: string
          vendor?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          created_at_source?: string | null
          email?: string | null
          error_message?: string | null
          first_call_date?: string | null
          first_name?: string | null
          full_name?: string | null
          id?: string
          last_call_date?: string | null
          last_name?: string | null
          last_status_date?: string | null
          lead_id_external?: string | null
          lead_main_state?: string | null
          lead_owner?: string | null
          lead_status?: string | null
          match_rule?: string | null
          matched_lead_id?: string | null
          normalized_phone?: string | null
          phone_main?: string | null
          processing_status?: string | null
          raw_data?: Json
          raw_phone?: string | null
          row_number?: number | null
          second_driver_first?: string | null
          second_driver_last?: string | null
          total_calls?: number | null
          upload_id?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "raw_deer_dama_rows_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_ricochet_rows: {
        Row: {
          agency_id: string
          batch_id: string | null
          campaign: string | null
          city: string | null
          created_at: string
          dwelling_value: number | null
          email: string | null
          first_name: string | null
          home_value: number | null
          id: string
          last_name: string | null
          lead_cost: number | null
          lead_date: string | null
          normalized_phone: string | null
          payload: Json | null
          phone_raw: string | null
          row_number: number | null
          state: string | null
          street_address: string | null
          upload_id: string
          zip: string | null
        }
        Insert: {
          agency_id: string
          batch_id?: string | null
          campaign?: string | null
          city?: string | null
          created_at?: string
          dwelling_value?: number | null
          email?: string | null
          first_name?: string | null
          home_value?: number | null
          id?: string
          last_name?: string | null
          lead_cost?: number | null
          lead_date?: string | null
          normalized_phone?: string | null
          payload?: Json | null
          phone_raw?: string | null
          row_number?: number | null
          state?: string | null
          street_address?: string | null
          upload_id: string
          zip?: string | null
        }
        Update: {
          agency_id?: string
          batch_id?: string | null
          campaign?: string | null
          city?: string | null
          created_at?: string
          dwelling_value?: number | null
          email?: string | null
          first_name?: string | null
          home_value?: number | null
          id?: string
          last_name?: string | null
          lead_cost?: number | null
          lead_date?: string | null
          normalized_phone?: string | null
          payload?: Json | null
          phone_raw?: string | null
          row_number?: number | null
          state?: string | null
          street_address?: string | null
          upload_id?: string
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "raw_ricochet_rows_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_ricochet_rows_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_members: {
        Row: {
          agency_id: string | null
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          agency_id?: string | null
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          agency_id?: string | null
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_members_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      status_events: {
        Row: {
          created_at: string
          event_date: string
          id: string
          lead_id: string
          lead_type: string | null
          source_type: string
          source_upload_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          event_date?: string
          id?: string
          lead_id: string
          lead_type?: string | null
          source_type: string
          source_upload_id?: string | null
          status: string
        }
        Update: {
          created_at?: string
          event_date?: string
          id?: string
          lead_id?: string
          lead_type?: string | null
          source_type?: string
          source_upload_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "status_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "status_events_source_upload_id_fkey"
            columns: ["source_upload_id"]
            isOneToOne: false
            referencedRelation: "uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      upload_templates: {
        Row: {
          column_mapping: Json
          created_at: string
          id: string
          name: string
          report_type: string
        }
        Insert: {
          column_mapping?: Json
          created_at?: string
          id?: string
          name: string
          report_type: string
        }
        Update: {
          column_mapping?: Json
          created_at?: string
          id?: string
          name?: string
          report_type?: string
        }
        Relationships: []
      }
      uploads: {
        Row: {
          agency_id: string
          batch_id: string | null
          created_at: string
          error_count: number | null
          file_hash: string | null
          file_name: string
          id: string
          matched_count: number | null
          notes: string | null
          report_type: string
          row_count: number | null
          status: string
          unmatched_count: number | null
          upload_date: string
          uploaded_by: string | null
        }
        Insert: {
          agency_id: string
          batch_id?: string | null
          created_at?: string
          error_count?: number | null
          file_hash?: string | null
          file_name: string
          id?: string
          matched_count?: number | null
          notes?: string | null
          report_type: string
          row_count?: number | null
          status?: string
          unmatched_count?: number | null
          upload_date: string
          uploaded_by?: string | null
        }
        Update: {
          agency_id?: string
          batch_id?: string | null
          created_at?: string
          error_count?: number | null
          file_hash?: string | null
          file_name?: string
          id?: string
          matched_count?: number | null
          notes?: string | null
          report_type?: string
          row_count?: number | null
          status?: string
          unmatched_count?: number | null
          upload_date?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "uploads_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          agency_id: string | null
          approval_status: string
          created_at: string
          email: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agency_id?: string | null
          approval_status?: string
          created_at?: string
          email: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agency_id?: string | null
          approval_status?: string
          created_at?: string
          email?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
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
      get_user_agency_id: { Args: { _user_id: string }; Returns: string }
      get_user_approval_status: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "customer"
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
      app_role: ["admin", "customer"],
    },
  },
} as const
