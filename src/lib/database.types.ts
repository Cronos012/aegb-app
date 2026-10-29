// Généré depuis la base Supabase (generate_typescript_types). Ne pas modifier à la main.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
          edited_at: string | null
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
          edited_at?: string | null
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
          edited_at?: string | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_comment: {
        Args: { p_body: string; p_parent?: string; p_post: string }
        Returns: string
      }
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
      create_post: {
        Args: { p_body: string; p_id: string; p_media?: Json }
        Returns: undefined
      }
      delete_announcement: { Args: { p_id: string }; Returns: string[] }
      delete_comment: { Args: { p_id: string }; Returns: undefined }
      delete_post: { Args: { p_id: string }; Returns: string[] }
      mark_seen: { Args: { p_ids: string[] }; Returns: undefined }
      moderate: {
        Args: {
          p_comment: string
          p_decision: Database["public"]["Enums"]["moderation_decision"]
          p_post: string
          p_reason?: Database["public"]["Enums"]["report_reason"]
        }
        Returns: undefined
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
      react: {
        Args: {
          p_comment: string
          p_kind: Database["public"]["Enums"]["reaction_kind"]
          p_post: string
        }
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
      storage_used: { Args: never; Returns: number }
      unpin_announcement: { Args: { p_id: string }; Returns: undefined }
      update_comment: {
        Args: { p_body: string; p_id: string }
        Returns: undefined
      }
      update_post: {
        Args: { p_body: string; p_id: string }
        Returns: undefined
      }
      accept_charter: { Args: { p_version: number }; Returns: undefined }
      assign_role: {
        Args: { p_member: string; p_role: string }
        Returns: undefined
      }
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
      clear_journal: { Args: never; Returns: number }
      clear_role: { Args: { p_role: string }; Returns: undefined }
      discreet_authors: {
        Args: { p_ids: number[] }
        Returns: {
          actor_name: string
          log_id: number
        }[]
      }
      is_active_member: { Args: never; Returns: boolean }
      is_bureau: { Args: never; Returns: boolean }
      journal_locked: { Args: never; Returns: boolean }
      lock_journal: { Args: never; Returns: undefined }
      mark_welcomed: { Args: never; Returns: undefined }
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
      my_access: {
        Args: { p_screen: string }
        Returns: Database["public"]["Enums"]["access_level"]
      }
      my_bureau: { Args: never; Returns: Json }
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
      reactivate_member: { Args: { p_member: string }; Returns: undefined }
      refuse_member: {
        Args: { p_member: string; p_reason: string }
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
          p_level: Database["public"]["Enums"]["access_level"] | null
          p_role: string
          p_screen: string
        }
        Returns: undefined
      }
      suspend_member: {
        Args: { p_member: string; p_reason: string }
        Returns: undefined
      }
      transfer_guarantor: { Args: { p_member: string }; Returns: undefined }
      validate_member: { Args: { p_member: string }; Returns: undefined }
      warn_member: {
        Args: { p_member: string; p_reason: string }
        Returns: undefined
      }
    }
    Enums: {
      access_level: "lecture" | "complet"
      member_status: "en_attente" | "actif" | "refuse" | "suspendu"
      member_type: "etudiant" | "alumni" | "sympathisant" | "honneur"
      moderation_decision: "garder" | "masquer" | "masquer_avertir"
      post_audience: "tous" | "etudiants" | "alumni" | "bureau"
      reaction_kind: "jaime" | "jadore" | "rire" | "wouah" | "triste" | "soutien"
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
