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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
      clear_role: { Args: { p_role: string }; Returns: undefined }
      is_active_member: { Args: never; Returns: boolean }
      is_bureau: { Args: never; Returns: boolean }
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
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database["public"]

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"]
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T]
