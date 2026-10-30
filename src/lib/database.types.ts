// Généré depuis la base Supabase (generate_typescript_types). Ne pas modifier à la main.

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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string
          category: string
          created_at: string
          details: Json
          id: number
          subject_id: string | null
          subject_name: string | null
          summary: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name: string
          category: string
          created_at?: string
          details?: Json
          id?: never
          subject_id?: string | null
          subject_name?: string | null
          summary: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string
          category?: string
          created_at?: string
          details?: Json
          id?: never
          subject_id?: string | null
          subject_name?: string | null
          summary?: string
        }
        Relationships: []
      }
      aegb_replies: {
        Row: {
          message_id: string
          written_by: string | null
          written_by_name: string
        }
        Insert: {
          message_id: string
          written_by?: string | null
          written_by_name: string
        }
        Update: {
          message_id?: string
          written_by?: string | null
          written_by_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "aegb_replies_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: true
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aegb_replies_written_by_fkey"
            columns: ["written_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      aegb_settings: {
        Row: {
          announce_arrival: boolean
          id: boolean
          updated_at: string | null
          updated_by_name: string | null
          welcome_actions: string[]
          welcome_text: string
        }
        Insert: {
          announce_arrival?: boolean
          id?: boolean
          updated_at?: string | null
          updated_by_name?: string | null
          welcome_actions?: string[]
          welcome_text: string
        }
        Update: {
          announce_arrival?: boolean
          id?: boolean
          updated_at?: string | null
          updated_by_name?: string | null
          welcome_actions?: string[]
          welcome_text?: string
        }
        Relationships: []
      }
      announcement_authors: {
        Row: {
          post_id: string
          written_by: string | null
          written_by_name: string
        }
        Insert: {
          post_id: string
          written_by?: string | null
          written_by_name: string
        }
        Update: {
          post_id?: string
          written_by?: string | null
          written_by_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_authors_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: true
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_authors_written_by_fkey"
            columns: ["written_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bureau_roles: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          code: string
          description: string
          holder_id: string | null
          label: string
          locked: boolean
          sort_order: number
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          code: string
          description: string
          holder_id?: string | null
          label: string
          locked?: boolean
          sort_order: number
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          code?: string
          description?: string
          holder_id?: string | null
          label?: string
          locked?: boolean
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "bureau_roles_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bureau_roles_holder_id_fkey"
            columns: ["holder_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bureau_screens: {
        Row: {
          code: string
          description: string
          label: string
          sort_order: number
        }
        Insert: {
          code: string
          description: string
          label: string
          sort_order: number
        }
        Update: {
          code?: string
          description?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      charter_versions: {
        Row: {
          published_at: string
          rules: Json
          version: number
        }
        Insert: {
          published_at?: string
          rules: Json
          version: number
        }
        Update: {
          published_at?: string
          rules?: Json
          version?: number
        }
        Relationships: []
      }
      comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          edited_at: string | null
          hidden_at: string | null
          hidden_reason: string | null
          id: string
          parent_id: string | null
          post_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          edited_at?: string | null
          hidden_at?: string | null
          hidden_reason?: string | null
          id?: string
          parent_id?: string | null
          post_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          edited_at?: string | null
          hidden_at?: string | null
          hidden_reason?: string | null
          id?: string
          parent_id?: string | null
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_members: {
        Row: {
          conversation_id: string
          is_manager: boolean
          joined_at: string
          last_read_at: string
          member_id: string
        }
        Insert: {
          conversation_id: string
          is_manager?: boolean
          joined_at?: string
          last_read_at?: string
          member_id: string
        }
        Update: {
          conversation_id?: string
          is_manager?: boolean
          joined_at?: string
          last_read_at?: string
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_members_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_members_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          changed_at: string
          created_at: string
          created_by: string | null
          id: string
          kind: Database["public"]["Enums"]["conversation_kind"]
          last_message_at: string | null
          member_id: string | null
          pair_key: string | null
          photo_path: string | null
          title: string | null
        }
        Insert: {
          changed_at?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind: Database["public"]["Enums"]["conversation_kind"]
          last_message_at?: string | null
          member_id?: string | null
          pair_key?: string | null
          photo_path?: string | null
          title?: string | null
        }
        Update: {
          changed_at?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["conversation_kind"]
          last_message_at?: string | null
          member_id?: string | null
          pair_key?: string | null
          photo_path?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dues_coverage: {
        Row: {
          amount_cents: number
          member_id: string
          month: string
          payment_id: string
        }
        Insert: {
          amount_cents: number
          member_id: string
          month: string
          payment_id: string
        }
        Update: {
          amount_cents?: number
          member_id?: string
          month?: string
          payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dues_coverage_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dues_coverage_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "dues_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      dues_payments: {
        Row: {
          amount_cents: number
          cancelled_at: string | null
          checkout_intent_id: number | null
          confirmed_at: string | null
          created_at: string
          id: string
          ledger_id: number | null
          member_id: string | null
          member_name: string
          method: Database["public"]["Enums"]["pay_method"]
          monthly_cents: number
          months: string[]
          note: string | null
          paid_on: string | null
          receipt_number: string | null
          reference: string | null
          status: Database["public"]["Enums"]["payment_status"]
        }
        Insert: {
          amount_cents: number
          cancelled_at?: string | null
          checkout_intent_id?: number | null
          confirmed_at?: string | null
          created_at?: string
          id?: string
          ledger_id?: number | null
          member_id?: string | null
          member_name: string
          method: Database["public"]["Enums"]["pay_method"]
          monthly_cents: number
          months: string[]
          note?: string | null
          paid_on?: string | null
          receipt_number?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Update: {
          amount_cents?: number
          cancelled_at?: string | null
          checkout_intent_id?: number | null
          confirmed_at?: string | null
          created_at?: string
          id?: string
          ledger_id?: number | null
          member_id?: string | null
          member_name?: string
          method?: Database["public"]["Enums"]["pay_method"]
          monthly_cents?: number
          months?: string[]
          note?: string | null
          paid_on?: string | null
          receipt_number?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "dues_payments_ledger_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dues_payments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dues_receipts: {
        Row: {
          amount_cents: number
          cancelled_at: string | null
          issued_at: string
          member_id: string | null
          member_name: string
          member_type: Database["public"]["Enums"]["member_type"]
          method: Database["public"]["Enums"]["pay_method"]
          monthly_cents: number
          months: string[]
          number: string
          paid_on: string
          payment_id: string
          reference: string | null
        }
        Insert: {
          amount_cents: number
          cancelled_at?: string | null
          issued_at?: string
          member_id?: string | null
          member_name: string
          member_type: Database["public"]["Enums"]["member_type"]
          method: Database["public"]["Enums"]["pay_method"]
          monthly_cents: number
          months: string[]
          number: string
          paid_on: string
          payment_id: string
          reference?: string | null
        }
        Update: {
          amount_cents?: number
          cancelled_at?: string | null
          issued_at?: string
          member_id?: string | null
          member_name?: string
          member_type?: Database["public"]["Enums"]["member_type"]
          method?: Database["public"]["Enums"]["pay_method"]
          monthly_cents?: number
          months?: string[]
          number?: string
          paid_on?: string
          payment_id?: string
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dues_receipts_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dues_receipts_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: true
            referencedRelation: "dues_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      dues_settings: {
        Row: {
          id: boolean
          monthly_cents: number
          org_address: string | null
          org_rna: string | null
          paying_types: Database["public"]["Enums"]["member_type"][]
          reminders: boolean
          start_month: string
          updated_at: string | null
          updated_by_name: string | null
        }
        Insert: {
          id?: boolean
          monthly_cents?: number
          org_address?: string | null
          org_rna?: string | null
          paying_types?: Database["public"]["Enums"]["member_type"][]
          reminders?: boolean
          start_month?: string
          updated_at?: string | null
          updated_by_name?: string | null
        }
        Update: {
          id?: boolean
          monthly_cents?: number
          org_address?: string | null
          org_rna?: string | null
          paying_types?: Database["public"]["Enums"]["member_type"][]
          reminders?: boolean
          start_month?: string
          updated_at?: string | null
          updated_by_name?: string | null
        }
        Relationships: []
      }
      ledger_entries: {
        Row: {
          amount_cents: number
          category: string
          created_at: string
          created_by: string | null
          created_by_name: string
          entry_date: string
          id: number
          label: string
          member_id: string | null
          member_name: string | null
          method: string
          note: string | null
          number: number
          payment_id: string | null
          reason: string | null
          reverses: number | null
        }
        Insert: {
          amount_cents: number
          category: string
          created_at?: string
          created_by?: string | null
          created_by_name: string
          entry_date: string
          id?: never
          label: string
          member_id?: string | null
          member_name?: string | null
          method: string
          note?: string | null
          number: number
          payment_id?: string | null
          reason?: string | null
          reverses?: number | null
        }
        Update: {
          amount_cents?: number
          category?: string
          created_at?: string
          created_by?: string | null
          created_by_name?: string
          entry_date?: string
          id?: never
          label?: string
          member_id?: string | null
          member_name?: string | null
          method?: string
          note?: string | null
          number?: number
          payment_id?: string | null
          reason?: string | null
          reverses?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "dues_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_reverses_fkey"
            columns: ["reverses"]
            isOneToOne: true
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      member_contacts: {
        Row: {
          email: string
          id: string
          phone: string | null
        }
        Insert: {
          email: string
          id: string
          phone?: string | null
        }
        Update: {
          email?: string
          id?: string
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_contacts_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      member_warnings: {
        Row: {
          created_at: string
          given_by: string | null
          given_by_name: string
          id: number
          member_id: string
          reason: string
        }
        Insert: {
          created_at?: string
          given_by?: string | null
          given_by_name: string
          id?: never
          member_id: string
          reason: string
        }
        Update: {
          created_at?: string
          given_by?: string | null
          given_by_name?: string
          id?: never
          member_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_warnings_given_by_fkey"
            columns: ["given_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_warnings_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_files: {
        Row: {
          duration: number | null
          height: number | null
          kind: string
          message_id: string
          mime: string | null
          name: string | null
          path: string
          position: number
          size: number | null
          width: number | null
        }
        Insert: {
          duration?: number | null
          height?: number | null
          kind: string
          message_id: string
          mime?: string | null
          name?: string | null
          path: string
          position: number
          size?: number | null
          width?: number | null
        }
        Update: {
          duration?: number | null
          height?: number | null
          kind?: string
          message_id?: string
          mime?: string | null
          name?: string | null
          path?: string
          position?: number
          size?: number | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "message_files_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          kind: Database["public"]["Enums"]["reaction_kind"]
          member_id: string
          message_id: string
        }
        Insert: {
          created_at?: string
          kind: Database["public"]["Enums"]["reaction_kind"]
          member_id: string
          message_id: string
        }
        Update: {
          created_at?: string
          kind?: Database["public"]["Enums"]["reaction_kind"]
          member_id?: string
          message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reports: {
        Row: {
          created_at: string
          id: number
          message_id: string
          reason: Database["public"]["Enums"]["report_reason"]
          reporter_id: string
          resolved_at: string | null
        }
        Insert: {
          created_at?: string
          id?: never
          message_id: string
          reason: Database["public"]["Enums"]["report_reason"]
          reporter_id: string
          resolved_at?: string | null
        }
        Update: {
          created_at?: string
          id?: never
          message_id?: string
          reason?: Database["public"]["Enums"]["report_reason"]
          reporter_id?: string
          resolved_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_reports_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          as_aegb: boolean
          blocked_for: string | null
          body: string | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          hidden_at: string | null
          hidden_reason: string | null
          id: string
          kind: string
          meta: Json
          post_id: string | null
          reply_to: string | null
          sender_id: string | null
        }
        Insert: {
          as_aegb?: boolean
          blocked_for?: string | null
          body?: string | null
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          hidden_at?: string | null
          hidden_reason?: string | null
          id?: string
          kind?: string
          meta?: Json
          post_id?: string | null
          reply_to?: string | null
          sender_id?: string | null
        }
        Update: {
          as_aegb?: boolean
          blocked_for?: string | null
          body?: string | null
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          hidden_at?: string | null
          hidden_reason?: string | null
          id?: string
          kind?: string
          meta?: Json
          post_id?: string | null
          reply_to?: string | null
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_blocked_for_fkey"
            columns: ["blocked_for"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_fkey"
            columns: ["reply_to"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_decisions: {
        Row: {
          author_id: string | null
          author_name: string
          comment_id: string | null
          created_at: string
          decided_by: string | null
          decided_by_name: string
          decision: Database["public"]["Enums"]["moderation_decision"]
          excerpt: string
          id: number
          message_id: string | null
          post_id: string | null
          reason: Database["public"]["Enums"]["report_reason"] | null
          reports: number
        }
        Insert: {
          author_id?: string | null
          author_name: string
          comment_id?: string | null
          created_at?: string
          decided_by?: string | null
          decided_by_name: string
          decision: Database["public"]["Enums"]["moderation_decision"]
          excerpt: string
          id?: never
          message_id?: string | null
          post_id?: string | null
          reason?: Database["public"]["Enums"]["report_reason"] | null
          reports?: number
        }
        Update: {
          author_id?: string | null
          author_name?: string
          comment_id?: string | null
          created_at?: string
          decided_by?: string | null
          decided_by_name?: string
          decision?: Database["public"]["Enums"]["moderation_decision"]
          excerpt?: string
          id?: never
          message_id?: string | null
          post_id?: string | null
          reason?: Database["public"]["Enums"]["report_reason"] | null
          reports?: number
        }
        Relationships: [
          {
            foreignKeyName: "moderation_decisions_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_decisions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_decisions_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_decisions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_decisions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_media: {
        Row: {
          height: number | null
          kind: string
          path: string
          position: number
          post_id: string
          width: number | null
        }
        Insert: {
          height?: number | null
          kind: string
          path: string
          position: number
          post_id: string
          width?: number | null
        }
        Update: {
          height?: number | null
          kind?: string
          path?: string
          position?: number
          post_id?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "post_media_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_views: {
        Row: {
          member_id: string
          post_id: string
          seen_at: string
        }
        Insert: {
          member_id: string
          post_id: string
          seen_at?: string
        }
        Update: {
          member_id?: string
          post_id?: string
          seen_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_views_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_views_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          audience: Database["public"]["Enums"]["post_audience"]
          author_id: string | null
          body: string
          created_at: string
          document_id: string | null
          edited_at: string | null
          event_id: string | null
          hidden_at: string | null
          hidden_reason: string | null
          id: string
          official: boolean
          pinned_until: string | null
          published_at: string
          title: string | null
        }
        Insert: {
          audience?: Database["public"]["Enums"]["post_audience"]
          author_id?: string | null
          body?: string
          created_at?: string
          document_id?: string | null
          edited_at?: string | null
          event_id?: string | null
          hidden_at?: string | null
          hidden_reason?: string | null
          id: string
          official?: boolean
          pinned_until?: string | null
          published_at?: string
          title?: string | null
        }
        Update: {
          audience?: Database["public"]["Enums"]["post_audience"]
          author_id?: string | null
          body?: string
          created_at?: string
          document_id?: string | null
          edited_at?: string | null
          event_id?: string | null
          hidden_at?: string | null
          hidden_reason?: string | null
          id?: string
          official?: boolean
          pinned_until?: string | null
          published_at?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          bio: string | null
          charter_accepted_at: string | null
          charter_version: number | null
          city: string | null
          cover_path: string | null
          created_at: string
          email_confirmed_at: string | null
          first_name: string
          formation: string | null
          id: string
          last_name: string
          member_type: Database["public"]["Enums"]["member_type"]
          refusal_reason: string | null
          refused_at: string | null
          refused_by: string | null
          school: string | null
          status: Database["public"]["Enums"]["member_status"]
          suspended_at: string | null
          suspended_by: string | null
          suspension_reason: string | null
          updated_at: string
          validated_at: string | null
          validated_by: string | null
          welcomed_at: string | null
        }
        Insert: {
          avatar_path?: string | null
          bio?: string | null
          charter_accepted_at?: string | null
          charter_version?: number | null
          city?: string | null
          cover_path?: string | null
          created_at?: string
          email_confirmed_at?: string | null
          first_name: string
          formation?: string | null
          id: string
          last_name: string
          member_type?: Database["public"]["Enums"]["member_type"]
          refusal_reason?: string | null
          refused_at?: string | null
          refused_by?: string | null
          school?: string | null
          status?: Database["public"]["Enums"]["member_status"]
          suspended_at?: string | null
          suspended_by?: string | null
          suspension_reason?: string | null
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
          welcomed_at?: string | null
        }
        Update: {
          avatar_path?: string | null
          bio?: string | null
          charter_accepted_at?: string | null
          charter_version?: number | null
          city?: string | null
          cover_path?: string | null
          created_at?: string
          email_confirmed_at?: string | null
          first_name?: string
          formation?: string | null
          id?: string
          last_name?: string
          member_type?: Database["public"]["Enums"]["member_type"]
          refusal_reason?: string | null
          refused_at?: string | null
          refused_by?: string | null
          school?: string | null
          status?: Database["public"]["Enums"]["member_status"]
          suspended_at?: string | null
          suspended_by?: string | null
          suspension_reason?: string | null
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
          welcomed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_charter_version_fkey"
            columns: ["charter_version"]
            isOneToOne: false
            referencedRelation: "charter_versions"
            referencedColumns: ["version"]
          },
          {
            foreignKeyName: "profiles_refused_by_fkey"
            columns: ["refused_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_suspended_by_fkey"
            columns: ["suspended_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_validated_by_fkey"
            columns: ["validated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reactions: {
        Row: {
          comment_id: string | null
          created_at: string
          id: number
          kind: Database["public"]["Enums"]["reaction_kind"]
          member_id: string
          post_id: string | null
        }
        Insert: {
          comment_id?: string | null
          created_at?: string
          id?: never
          kind: Database["public"]["Enums"]["reaction_kind"]
          member_id: string
          post_id?: string | null
        }
        Update: {
          comment_id?: string | null
          created_at?: string
          id?: never
          kind?: Database["public"]["Enums"]["reaction_kind"]
          member_id?: string
          post_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reactions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reactions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          comment_id: string | null
          created_at: string
          id: number
          post_id: string | null
          reason: Database["public"]["Enums"]["report_reason"]
          reporter_id: string
          resolved_at: string | null
        }
        Insert: {
          comment_id?: string | null
          created_at?: string
          id?: never
          post_id?: string | null
          reason: Database["public"]["Enums"]["report_reason"]
          reporter_id: string
          resolved_at?: string | null
        }
        Update: {
          comment_id?: string | null
          created_at?: string
          id?: never
          post_id?: string | null
          reason?: Database["public"]["Enums"]["report_reason"]
          reporter_id?: string
          resolved_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          level: Database["public"]["Enums"]["access_level"]
          role_code: string
          screen_code: string
        }
        Insert: {
          level: Database["public"]["Enums"]["access_level"]
          role_code: string
          screen_code: string
        }
        Update: {
          level?: Database["public"]["Enums"]["access_level"]
          role_code?: string
          screen_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_role_code_fkey"
            columns: ["role_code"]
            isOneToOne: false
            referencedRelation: "bureau_roles"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "role_permissions_screen_code_fkey"
            columns: ["screen_code"]
            isOneToOne: false
            referencedRelation: "bureau_screens"
            referencedColumns: ["code"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_charter: { Args: { p_version: number }; Returns: undefined }
      add_comment: {
        Args: { p_body: string; p_parent?: string; p_post: string }
        Returns: string
      }
      add_group_members: {
        Args: { p_conversation: string; p_members: string[] }
        Returns: undefined
      }
      add_ledger_entry: {
        Args: {
          p_amount_cents: number
          p_category: string
          p_date: string
          p_label: string
          p_member?: string
          p_method: string
          p_note?: string
        }
        Returns: number
      }
      add_paper_candidacy: {
        Args: { p_assembly: string; p_member: string; p_role: string; p_statement: string }
        Returns: string
      }
      aegb_inbox: {
        Args: never
        Returns: {
          avatar_path: string
          city: string
          first_name: string
          id: string
          last_at: string
          last_from_member: boolean
          last_name: string
          last_preview: string
          member_id: string
          member_type: Database["public"]["Enums"]["member_type"]
          replied_by_name: string
          validated_at: string
        }[]
      }
      aegb_pending: { Args: never; Returns: number }
      announcements_overview: {
        Args: never
        Returns: {
          audience: Database["public"]["Enums"]["post_audience"]
          id: string
          pinned_until: string
          published_at: string
          title: string
          views: number
          written_by_name: string
        }[]
      }
      assembly_admin: { Args: { p_id?: string }; Returns: Json }
      assembly_view: { Args: { p_id?: string }; Returns: Json }
      assign_role: {
        Args: { p_member: string; p_role: string }
        Returns: undefined
      }
      block_member: { Args: { p_member: string }; Returns: undefined }
      bureau_counts: {
        Args: never
        Returns: {
          active: number
          new_this_month: number
          pending: number
          pending_unconfirmed: number
          roles_filled: number
          roles_total: number
        }[]
      }
      can: {
        Args: {
          p_level?: Database["public"]["Enums"]["access_level"]
          p_screen: string
        }
        Returns: boolean
      }
      can_read_conversation: { Args: { p_conv: string }; Returns: boolean }
      can_read_document_file: { Args: { p_name: string }; Returns: boolean }
      can_read_message_file: { Args: { p_name: string }; Returns: boolean }
      can_read_post: {
        Args: {
          p_audience: Database["public"]["Enums"]["post_audience"]
          p_author: string
          p_hidden: string
          p_official: boolean
          p_published: string
        }
        Returns: boolean
      }
      cancel_assembly: { Args: { p_id: string; p_reason?: string }; Returns: undefined }
      cancel_event: {
        Args: {
          p_id: string
          p_reason?: string
        }
        Returns: number
      }
      cast_vote: { Args: { p_ballot: string; p_choices: Json }; Returns: string }
      check_in: {
        Args: {
          p_event: string
          p_member: string
          p_present: boolean
        }
        Returns: undefined
      }
      clear_elections: { Args: never; Returns: number }
      clear_events: { Args: never; Returns: number }
      clear_finances: { Args: never; Returns: number }
      clear_journal: { Args: never; Returns: number }
      clear_role: { Args: { p_role: string }; Returns: undefined }
      close_vote: { Args: { p_ballot: string }; Returns: string }
      confirm_handover: { Args: { p_assembly: string }; Returns: number }
      convene_second_assembly: {
        Args: {
          p_first: string
          p_held_at: string
          p_place: string
          p_vote_closes_at: string
          p_vote_opens_at: string
        }
        Returns: string
      }
      conversation_info: { Args: { p_conversation: string }; Returns: Json }
      conversation_messages: {
        Args: { p_before?: string; p_conversation: string; p_limit?: number }
        Returns: {
          as_aegb: boolean
          body: string
          created_at: string
          deleted: boolean
          files: Json
          hidden: boolean
          hidden_reason: string
          id: string
          kind: string
          meta: Json
          post_id: string
          reactions: Json
          reply: Json
          reported: boolean
          sender_avatar_path: string
          sender_first_name: string
          sender_id: string
          sender_last_name: string
          written_by_name: string
        }[]
      }
      create_group: {
        Args: { p_members: string[]; p_title: string }
        Returns: string
      }
      create_post: {
        Args: { p_body: string; p_id: string; p_media?: Json }
        Returns: undefined
      }
      decide_candidacy: {
        Args: { p_id: string; p_reason?: string; p_valid: boolean }
        Returns: undefined
      }
      delete_announcement: { Args: { p_id: string }; Returns: string[] }
      delete_comment: { Args: { p_id: string }; Returns: undefined }
      delete_document: { Args: { p_id: string }; Returns: string[] }
      delete_document_category: { Args: { p_id: string }; Returns: undefined }
      delete_message: { Args: { p_id: string }; Returns: string[] }
      delete_post: { Args: { p_id: string }; Returns: string[] }
      discreet_authors: {
        Args: { p_ids: number[] }
        Returns: {
          actor_name: string
          log_id: number
        }[]
      }
      discreet_ledger_authors: {
        Args: { p_ids: number[] }
        Returns: {
          actor_name: string
          ledger_id: number
        }[]
      }
      documents_list: { Args: never; Returns: Json }
      dues_matrix: {
        Args: never
        Returns: {
          avatar_path: string
          dues: Json
          first_name: string
          last_name: string
          member_id: string
          member_type: Database["public"]["Enums"]["member_type"]
          status: Database["public"]["Enums"]["member_status"]
        }[]
      }
      event_admin: { Args: { p_id: string }; Returns: Json }
      event_payment_status: { Args: { p_payment: string }; Returns: Json }
      event_people: { Args: { p_id: string }; Returns: Json }
      event_view: { Args: { p_id: string }; Returns: Json }
      events_admin: { Args: never; Returns: Json }
      events_list: { Args: never; Returns: Json }
      helloasso_attach: {
        Args: { p_intent: number; p_payment: string }
        Returns: undefined
      }
      helloasso_confirm: {
        Args: { p_paid_on: string; p_payment: string; p_reference: string }
        Returns: Json
      }
      helloasso_fail: { Args: { p_payment: string }; Returns: undefined }
      helloasso_payment: { Args: { p_payment: string }; Returns: Json }
      is_active_member: { Args: never; Returns: boolean }
      is_bureau: { Args: never; Returns: boolean }
      is_public_event_photo: { Args: { p_name: string }; Returns: boolean }
      join_event: { Args: { p_id: string }; Returns: Json }
      journal_locked: { Args: never; Returns: boolean }
      leave_event: { Args: { p_id: string }; Returns: undefined }
      leave_group: { Args: { p_conversation: string }; Returns: undefined }
      lock_journal: { Args: never; Returns: undefined }
      mark_read: { Args: { p_conversation: string }; Returns: undefined }
      mark_seen: { Args: { p_ids: string[] }; Returns: undefined }
      mark_welcomed: { Args: never; Returns: undefined }
      member_dues: { Args: { p_member: string }; Returns: Json }
      member_history: {
        Args: { p_member: string }
        Returns: {
          action: string
          actor_id: string | null
          actor_name: string
          category: string
          created_at: string
          details: Json
          id: number
          subject_id: string | null
          subject_name: string | null
          summary: string
        }[]
        SetofOptions: {
          from: "*"
          to: "activity_log"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      moderate: {
        Args: {
          p_comment: string
          p_decision: Database["public"]["Enums"]["moderation_decision"]
          p_post: string
          p_reason?: Database["public"]["Enums"]["report_reason"]
        }
        Returns: undefined
      }
      moderate_message: {
        Args: {
          p_decision: Database["public"]["Enums"]["moderation_decision"]
          p_id: string
          p_reason?: Database["public"]["Enums"]["report_reason"]
        }
        Returns: undefined
      }
      moderation_messages: {
        Args: never
        Returns: {
          author_avatar_path: string
          author_first_name: string
          author_id: string
          author_last_name: string
          body: string
          created_at: string
          hidden: boolean
          last_reported_at: string
          last_warning_at: string
          last_warning_reason: string
          media_duration: number
          media_kind: string
          media_path: string
          message_id: string
          place: string
          reasons: Json
          reports: number
          warnings: number
        }[]
      }
      moderation_pending: { Args: never; Returns: number }
      moderation_queue: {
        Args: never
        Returns: {
          author_avatar_path: string
          author_first_name: string
          author_id: string
          author_last_name: string
          body: string
          comment_id: string
          created_at: string
          hidden: boolean
          last_reported_at: string
          last_warning_at: string
          last_warning_reason: string
          media_kind: string
          media_path: string
          parent_author_name: string
          parent_post_id: string
          post_id: string
          reasons: Json
          reports: number
          warnings: number
        }[]
      }
      my_access: {
        Args: { p_screen: string }
        Returns: Database["public"]["Enums"]["access_level"]
      }
      my_aegb: { Args: never; Returns: string }
      my_bureau: { Args: never; Returns: Json }
      my_conversations: {
        Args: never
        Returns: {
          blocked: boolean
          faces: Json
          id: string
          kind: Database["public"]["Enums"]["conversation_kind"]
          last_as_aegb: boolean
          last_at: string
          last_kind: string
          last_preview: string
          last_sender_id: string
          last_sender_name: string
          members: number
          other_avatar_path: string
          other_first_name: string
          other_id: string
          other_last_name: string
          photo_path: string
          title: string
          unread: number
        }[]
      }
      my_dues: { Args: never; Returns: Json }
      open_private: { Args: { p_member: string }; Returns: string }
      open_second_round: { Args: { p_assembly: string }; Returns: string }
      open_vote: { Args: { p_assembly: string }; Returns: string }
      pending_handovers: { Args: never; Returns: Json }
      public_bureau: {
        Args: never
        Returns: {
          code: string
          first_name: string
          label: string
          last_name: string
          sort_order: number
        }[]
      }
      public_documents: { Args: never; Returns: Json }
      public_events: { Args: never; Returns: Json }
      publish_announcement: {
        Args: {
          p_audience: Database["public"]["Enums"]["post_audience"]
          p_body: string
          p_id: string
          p_media?: Json
          p_pin: boolean
          p_publish_at?: string
          p_title: string
        }
        Returns: undefined
      }
      publish_results: { Args: { p_assembly: string }; Returns: string }
      react: {
        Args: {
          p_comment: string
          p_kind: Database["public"]["Enums"]["reaction_kind"]
          p_post: string
        }
        Returns: undefined
      }
      react_message: {
        Args: {
          p_id: string
          p_kind: Database["public"]["Enums"]["reaction_kind"]
        }
        Returns: undefined
      }
      reactivate_member: { Args: { p_member: string }; Returns: undefined }
      record_event_payment: {
        Args: {
          p_event: string
          p_member: string
          p_method?: Database["public"]["Enums"]["pay_method"]
        }
        Returns: Json
      }
      record_payment: {
        Args: {
          p_member: string
          p_method: Database["public"]["Enums"]["pay_method"]
          p_note?: string
          p_paid_on?: string
          p_send?: boolean
          p_until: string
        }
        Returns: Json
      }
      refuse_member: {
        Args: { p_member: string; p_reason: string }
        Returns: undefined
      }
      remind_voters: { Args: { p_ballot: string }; Returns: number }
      remove_group_member: {
        Args: { p_conversation: string; p_member: string }
        Returns: undefined
      }
      report_content: {
        Args: {
          p_comment: string
          p_post: string
          p_reason: Database["public"]["Enums"]["report_reason"]
        }
        Returns: boolean
      }
      report_message: {
        Args: {
          p_id: string
          p_reason: Database["public"]["Enums"]["report_reason"]
        }
        Returns: boolean
      }
      reverse_ledger_entry: {
        Args: {
          p_entry: number
          p_note?: string
          p_notify?: boolean
          p_reason: string
        }
        Returns: number
      }
      save_assembly: {
        Args: {
          p_candidacy_until: string | null
          p_held_at: string
          p_id: string | null
          p_items: Json
          p_kind: string
          p_mandate_start: string | null
          p_place: string
          p_vote_closes_at: string
          p_vote_opens_at: string
        }
        Returns: string
      }
      save_document: {
        Args: {
          p_id: string
          p_category: string
          p_title: string
          p_visibility: string
          p_file?: Json
          p_announce?: boolean
        }
        Returns: Json
      }
      save_document_category: {
        Args: {
          p_id: string | null
          p_name: string
        }
        Returns: string
      }
      save_dues_settings: {
        Args: {
          p_monthly_cents: number
          p_org_address?: string
          p_org_rna?: string
          p_paying: Database["public"]["Enums"]["member_type"][]
          p_reminders: boolean
          p_start_month: string
        }
        Returns: undefined
      }
      save_event: {
        Args: {
          p_id: string
          p_data: Json
          p_publish?: boolean
        }
        Returns: Json
      }
      save_welcome: {
        Args: { p_actions: string[]; p_announce: boolean; p_text: string }
        Returns: undefined
      }
      send_convocation: { Args: { p_force?: boolean; p_id: string }; Returns: number }
      send_message: {
        Args: {
          p_body: string
          p_conversation: string
          p_files?: Json
          p_id: string
          p_post?: string
          p_reply_to?: string
        }
        Returns: undefined
      }
      send_welcome_test: { Args: never; Returns: string }
      set_group_manager: {
        Args: { p_conversation: string; p_manager: boolean; p_member: string }
        Returns: undefined
      }
      set_member_type: {
        Args: {
          p_member: string
          p_type: Database["public"]["Enums"]["member_type"]
        }
        Returns: undefined
      }
      set_role_permission: {
        Args: {
          p_level: Database["public"]["Enums"]["access_level"]
          p_role: string
          p_screen: string
        }
        Returns: undefined
      }
      start_card_payment: { Args: { p_until: string }; Returns: Json }
      start_event_payment: { Args: { p_id: string }; Returns: Json }
      storage_used: { Args: never; Returns: number }
      submit_candidacy: {
        Args: { p_assembly: string; p_role: string; p_statement: string }
        Returns: string
      }
      suspend_member: {
        Args: { p_member: string; p_reason: string }
        Returns: undefined
      }
      transfer_guarantor: { Args: { p_member: string }; Returns: undefined }
      unblock_member: { Args: { p_member: string }; Returns: undefined }
      unpin_announcement: { Args: { p_id: string }; Returns: undefined }
      update_comment: {
        Args: { p_body: string; p_id: string }
        Returns: undefined
      }
      update_group: {
        Args: { p_conversation: string; p_photo?: string; p_title: string }
        Returns: string
      }
      update_post: {
        Args: { p_body: string; p_id: string }
        Returns: undefined
      }
      validate_member: { Args: { p_member: string }; Returns: undefined }
      warn_member: {
        Args: { p_member: string; p_reason: string }
        Returns: undefined
      }
      withdraw_candidacy: { Args: { p_id: string }; Returns: undefined }
    }
    Enums: {
      access_level: "lecture" | "complet"
      conversation_kind: "prive" | "groupe" | "grand_groupe" | "aegb"
      member_status: "en_attente" | "actif" | "refuse" | "suspendu"
      member_type: "etudiant" | "alumni" | "sympathisant" | "honneur"
      moderation_decision: "garder" | "masquer" | "masquer_avertir"
      pay_method: "carte" | "especes" | "virement" | "cheque"
      payment_status: "en_attente" | "confirme" | "echec" | "annule"
      post_audience: "tous" | "etudiants" | "alumni" | "bureau"
      reaction_kind:
        | "jaime"
        | "jadore"
        | "rire"
        | "wouah"
        | "triste"
        | "soutien"
      report_reason: "irrespect" | "fausse_info" | "spam" | "choquant" | "autre"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database["public"]

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"]
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T]
