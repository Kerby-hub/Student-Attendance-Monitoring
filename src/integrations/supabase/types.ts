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
      attendance_records: {
        Row: {
          check_in_at: string | null
          check_in_lat: number | null
          check_in_lng: number | null
          check_out_at: string | null
          check_out_lat: number | null
          check_out_lng: number | null
          created_at: string
          id: string
          session_id: string
          status: Database["public"]["Enums"]["attendance_status"]
          student_id: string
          updated_at: string
        }
        Insert: {
          check_in_at?: string | null
          check_in_lat?: number | null
          check_in_lng?: number | null
          check_out_at?: string | null
          check_out_lat?: number | null
          check_out_lng?: number | null
          created_at?: string
          id?: string
          session_id: string
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id: string
          updated_at?: string
        }
        Update: {
          check_in_at?: string | null
          check_in_lat?: number | null
          check_in_lng?: number | null
          check_out_at?: string | null
          check_out_lat?: number | null
          check_out_lng?: number | null
          created_at?: string
          id?: string
          session_id?: string
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "attendance_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_sessions: {
        Row: {
          closed_at: string | null
          created_at: string
          expires_at: string | null
          id: string
          opened_at: string | null
          qr_rotated_at: string
          qr_token: string
          schedule_id: string
          status: Database["public"]["Enums"]["session_status"]
          teacher_id: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          opened_at?: string | null
          qr_rotated_at?: string
          qr_token?: string
          schedule_id: string
          status?: Database["public"]["Enums"]["session_status"]
          teacher_id: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          opened_at?: string | null
          qr_rotated_at?: string
          qr_token?: string
          schedule_id?: string
          status?: Database["public"]["Enums"]["session_status"]
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_sessions_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "class_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_sessions_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
        }
        Relationships: []
      }
      broadcasts: {
        Row: {
          audience_filter: Json
          audience_type: string
          created_at: string
          failed_count: number
          id: string
          message: string
          recipient_count: number
          sender_id: string | null
          sent_count: number
        }
        Insert: {
          audience_filter?: Json
          audience_type: string
          created_at?: string
          failed_count?: number
          id?: string
          message: string
          recipient_count?: number
          sender_id?: string | null
          sent_count?: number
        }
        Update: {
          audience_filter?: Json
          audience_type?: string
          created_at?: string
          failed_count?: number
          id?: string
          message?: string
          recipient_count?: number
          sender_id?: string | null
          sent_count?: number
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          audience: Database["public"]["Enums"]["calendar_audience"]
          created_at: string
          created_by: string | null
          description: string | null
          ends_at: string
          event_type: string | null
          id: string
          location: string | null
          starts_at: string
          title: string
          updated_at: string
        }
        Insert: {
          audience?: Database["public"]["Enums"]["calendar_audience"]
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at: string
          event_type?: string | null
          id?: string
          location?: string | null
          starts_at: string
          title: string
          updated_at?: string
        }
        Update: {
          audience?: Database["public"]["Enums"]["calendar_audience"]
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string
          event_type?: string | null
          id?: string
          location?: string | null
          starts_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      class_schedules: {
        Row: {
          created_at: string
          day: Database["public"]["Enums"]["day_of_week"]
          end_time: string
          id: string
          room: string | null
          school_year: string
          section_id: string
          semester: string
          start_time: string
          subject_id: string
          teacher_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          day: Database["public"]["Enums"]["day_of_week"]
          end_time: string
          id?: string
          room?: string | null
          school_year: string
          section_id: string
          semester: string
          start_time: string
          subject_id: string
          teacher_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          day?: Database["public"]["Enums"]["day_of_week"]
          end_time?: string
          id?: string
          room?: string | null
          school_year?: string
          section_id?: string
          semester?: string
          start_time?: string
          subject_id?: string
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_schedules_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_schedules_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_schedules_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      device_registrations: {
        Row: {
          created_at: string
          device_fingerprint: string
          device_name: string | null
          id: string
          last_login: string | null
          platform: string | null
          registration_date: string
          status: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          device_fingerprint: string
          device_name?: string | null
          id?: string
          last_login?: string | null
          platform?: string | null
          registration_date?: string
          status?: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          device_fingerprint?: string
          device_name?: string | null
          id?: string
          last_login?: string | null
          platform?: string | null
          registration_date?: string
          status?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_registrations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_logs: {
        Row: {
          body: string
          created_at: string
          id: string
          provider_response: Json | null
          recipient_email: string
          recipient_user_id: string | null
          status: string
          subject: string
          template: string | null
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          provider_response?: Json | null
          recipient_email: string
          recipient_user_id?: string | null
          status?: string
          subject: string
          template?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          provider_response?: Json | null
          recipient_email?: string
          recipient_user_id?: string | null
          status?: string
          subject?: string
          template?: string | null
        }
        Relationships: []
      }
      geofence_zones: {
        Row: {
          active: boolean
          center_lat: number
          center_lng: number
          created_at: string
          id: string
          name: string
          radius_meters: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          center_lat: number
          center_lng: number
          created_at?: string
          id?: string
          name: string
          radius_meters: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          center_lat?: number
          center_lng?: number
          created_at?: string
          id?: string
          name?: string
          radius_meters?: number
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          broadcast_id: string | null
          created_at: string
          id: string
          read: boolean
          sender_id: string | null
          title: string
          type: string | null
          user_id: string
        }
        Insert: {
          body?: string | null
          broadcast_id?: string | null
          created_at?: string
          id?: string
          read?: boolean
          sender_id?: string | null
          title: string
          type?: string | null
          user_id: string
        }
        Update: {
          body?: string | null
          broadcast_id?: string | null
          created_at?: string
          id?: string
          read?: boolean
          sender_id?: string | null
          title?: string
          type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "broadcasts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          must_change_password: boolean
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          must_change_password?: boolean
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          must_change_password?: boolean
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      schedule_geofences: {
        Row: {
          schedule_id: string
          zone_id: string
        }
        Insert: {
          schedule_id: string
          zone_id: string
        }
        Update: {
          schedule_id?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_geofences_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "class_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_geofences_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "geofence_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      sections: {
        Row: {
          created_at: string
          id: string
          name: string
          program: string | null
          school_year: string
          updated_at: string
          year_level: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          program?: string | null
          school_year: string
          updated_at?: string
          year_level?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          program?: string | null
          school_year?: string
          updated_at?: string
          year_level?: number | null
        }
        Relationships: []
      }
      sms_logs: {
        Row: {
          broadcast_id: string | null
          created_at: string
          error_message: string | null
          id: string
          message: string
          notification_type: string | null
          phone: string
          provider_response: Json | null
          recipient_user_id: string | null
          session_id: string | null
          status: Database["public"]["Enums"]["sms_status"]
          student_id: string | null
        }
        Insert: {
          broadcast_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          message: string
          notification_type?: string | null
          phone: string
          provider_response?: Json | null
          recipient_user_id?: string | null
          session_id?: string | null
          status?: Database["public"]["Enums"]["sms_status"]
          student_id?: string | null
        }
        Update: {
          broadcast_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          message?: string
          notification_type?: string | null
          phone?: string
          provider_response?: Json | null
          recipient_user_id?: string | null
          session_id?: string | null
          status?: Database["public"]["Enums"]["sms_status"]
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_logs_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "broadcasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "attendance_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_logs_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_profiles: {
        Row: {
          address: string | null
          birthdate: string | null
          created_at: string
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          gender: string | null
          student_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          birthdate?: string | null
          created_at?: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          gender?: string | null
          student_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          birthdate?: string | null
          created_at?: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          gender?: string | null
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_profiles_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          contact_number: string | null
          created_at: string
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          first_name: string | null
          full_name: string
          guardian_email: string | null
          guardian_name: string | null
          guardian_phone: string | null
          guardian_relationship: string | null
          home_address: string | null
          id: string
          last_name: string | null
          middle_name: string | null
          parent_contact: string | null
          profile_picture_url: string | null
          program: string | null
          section_id: string | null
          status: Database["public"]["Enums"]["student_status"]
          student_no: string
          updated_at: string
          user_id: string | null
          year_level: number | null
        }
        Insert: {
          contact_number?: string | null
          created_at?: string
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          first_name?: string | null
          full_name: string
          guardian_email?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          guardian_relationship?: string | null
          home_address?: string | null
          id?: string
          last_name?: string | null
          middle_name?: string | null
          parent_contact?: string | null
          profile_picture_url?: string | null
          program?: string | null
          section_id?: string | null
          status?: Database["public"]["Enums"]["student_status"]
          student_no: string
          updated_at?: string
          user_id?: string | null
          year_level?: number | null
        }
        Update: {
          contact_number?: string | null
          created_at?: string
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          first_name?: string | null
          full_name?: string
          guardian_email?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          guardian_relationship?: string | null
          home_address?: string | null
          id?: string
          last_name?: string | null
          middle_name?: string | null
          parent_contact?: string | null
          profile_picture_url?: string | null
          program?: string | null
          section_id?: string | null
          status?: Database["public"]["Enums"]["student_status"]
          student_no?: string
          updated_at?: string
          user_id?: string | null
          year_level?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "students_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          archived: boolean
          code: string
          created_at: string
          department_id: string | null
          description: string | null
          id: string
          name: string
          units: number
          updated_at: string
        }
        Insert: {
          archived?: boolean
          code: string
          created_at?: string
          department_id?: string | null
          description?: string | null
          id?: string
          name: string
          units?: number
          updated_at?: string
        }
        Update: {
          archived?: boolean
          code?: string
          created_at?: string
          department_id?: string | null
          description?: string | null
          id?: string
          name?: string
          units?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subjects_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      teacher_sections: {
        Row: {
          created_at: string
          section_id: string
          teacher_id: string
        }
        Insert: {
          created_at?: string
          section_id: string
          teacher_id: string
        }
        Update: {
          created_at?: string
          section_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_sections_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_sections_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_subjects: {
        Row: {
          created_at: string
          subject_id: string
          teacher_id: string
        }
        Insert: {
          created_at?: string
          subject_id: string
          teacher_id: string
        }
        Update: {
          created_at?: string
          subject_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_subjects_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_subjects_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      teachers: {
        Row: {
          created_at: string
          department_id: string | null
          email: string
          full_name: string
          id: string
          position: string | null
          status: Database["public"]["Enums"]["teacher_status"]
          teacher_no: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          email: string
          full_name: string
          id?: string
          position?: string | null
          status?: Database["public"]["Enums"]["teacher_status"]
          teacher_no: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          department_id?: string | null
          email?: string
          full_name?: string
          id?: string
          position?: string | null
          status?: Database["public"]["Enums"]["teacher_status"]
          teacher_no?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teachers_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      process_expired_sessions: { Args: never; Returns: Json }
      rotate_session_qr: { Args: { _session_id: string }; Returns: string }
      student_check_in: {
        Args: {
          _accuracy?: number
          _lat: number
          _lng: number
          _qr_token: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "teacher" | "student"
      attendance_status: "present" | "late" | "absent"
      calendar_audience: "all" | "teachers" | "students"
      day_of_week:
        | "monday"
        | "tuesday"
        | "wednesday"
        | "thursday"
        | "friday"
        | "saturday"
        | "sunday"
      session_status: "waiting" | "open" | "closed" | "expired"
      sms_status: "pending" | "sent" | "failed"
      student_status: "active" | "inactive" | "graduated" | "archived"
      teacher_status: "active" | "inactive"
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
      app_role: ["admin", "teacher", "student"],
      attendance_status: ["present", "late", "absent"],
      calendar_audience: ["all", "teachers", "students"],
      day_of_week: [
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
      ],
      session_status: ["waiting", "open", "closed", "expired"],
      sms_status: ["pending", "sent", "failed"],
      student_status: ["active", "inactive", "graduated", "archived"],
      teacher_status: ["active", "inactive"],
    },
  },
} as const
