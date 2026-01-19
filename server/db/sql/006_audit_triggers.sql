BEGIN;

-- Generic audit trigger function
-- This function will be called by triggers on each table to log changes to audit tables
CREATE OR REPLACE FUNCTION audit.audit_trigger_function()
RETURNS TRIGGER AS $$
DECLARE
  audit_schema_name TEXT := 'audit';
  audit_table_name TEXT;
  old_data JSONB;
  new_data JSONB;
  user_id_val UUID;
  column_list TEXT;
  value_list TEXT;
BEGIN
  -- Determine the audit table name from the triggering table
  audit_table_name := TG_TABLE_NAME || '_audit';
  
  -- Try to get user_id from current_setting if available (set by application)
  -- This allows the application to pass the current user ID
  BEGIN
    user_id_val := current_setting('app.current_user_id', TRUE)::UUID;
  EXCEPTION WHEN OTHERS THEN
    user_id_val := NULL;
  END;
  
  -- Get column list for the table
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
  INTO column_list
  FROM information_schema.columns
  WHERE table_schema = TG_TABLE_SCHEMA
    AND table_name = TG_TABLE_NAME;
  
  -- Handle INSERT operation
  IF (TG_OP = 'INSERT') THEN
    new_data := to_jsonb(NEW);
    
    -- Build INSERT using jsonb_populate_record to extract values from NEW
    EXECUTE format('
      INSERT INTO %I.%I (
        audit_operation,
        audit_timestamp,
        audit_user_id,
        audit_old_values,
        audit_new_values,
        %s
      )
      SELECT 
        %L,
        NOW(),
        %L,
        NULL,
        %L,
        r.*
      FROM jsonb_populate_record(NULL::%I.%I, %L) AS r',
      audit_schema_name,
      audit_table_name,
      column_list,
      TG_OP,
      user_id_val,
      new_data,
      TG_TABLE_SCHEMA,
      TG_TABLE_NAME,
      new_data
    );
    RETURN NEW;
  
  -- Handle UPDATE operation
  ELSIF (TG_OP = 'UPDATE') THEN
    old_data := to_jsonb(OLD);
    new_data := to_jsonb(NEW);
    
    -- Build INSERT using jsonb_populate_record to extract values from NEW
    EXECUTE format('
      INSERT INTO %I.%I (
        audit_operation,
        audit_timestamp,
        audit_user_id,
        audit_old_values,
        audit_new_values,
        %s
      )
      SELECT 
        %L,
        NOW(),
        %L,
        %L,
        %L,
        r.*
      FROM jsonb_populate_record(NULL::%I.%I, %L) AS r',
      audit_schema_name,
      audit_table_name,
      column_list,
      TG_OP,
      user_id_val,
      old_data,
      new_data,
      TG_TABLE_SCHEMA,
      TG_TABLE_NAME,
      new_data
    );
    RETURN NEW;
  
  -- Handle DELETE operation
  ELSIF (TG_OP = 'DELETE') THEN
    old_data := to_jsonb(OLD);
    
    -- Build INSERT using jsonb_populate_record to extract values from OLD
    EXECUTE format('
      INSERT INTO %I.%I (
        audit_operation,
        audit_timestamp,
        audit_user_id,
        audit_old_values,
        audit_new_values,
        %s
      )
      SELECT 
        %L,
        NOW(),
        %L,
        %L,
        NULL,
        r.*
      FROM jsonb_populate_record(NULL::%I.%I, %L) AS r',
      audit_schema_name,
      audit_table_name,
      column_list,
      TG_OP,
      user_id_val,
      old_data,
      TG_TABLE_SCHEMA,
      TG_TABLE_NAME,
      old_data
    );
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for all public schema tables

-- Trigger for users table
DROP TRIGGER IF EXISTS trg_users_audit ON public.users;
CREATE TRIGGER trg_users_audit
AFTER INSERT OR UPDATE OR DELETE ON public.users
FOR EACH ROW EXECUTE FUNCTION audit.audit_trigger_function();

-- Trigger for roles table
DROP TRIGGER IF EXISTS trg_roles_audit ON public.roles;
CREATE TRIGGER trg_roles_audit
AFTER INSERT OR UPDATE OR DELETE ON public.roles
FOR EACH ROW EXECUTE FUNCTION audit.audit_trigger_function();

-- Trigger for permissions table
DROP TRIGGER IF EXISTS trg_permissions_audit ON public.permissions;
CREATE TRIGGER trg_permissions_audit
AFTER INSERT OR UPDATE OR DELETE ON public.permissions
FOR EACH ROW EXECUTE FUNCTION audit.audit_trigger_function();

-- Trigger for user_roles table
DROP TRIGGER IF EXISTS trg_user_roles_audit ON public.user_roles;
CREATE TRIGGER trg_user_roles_audit
AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION audit.audit_trigger_function();

-- Trigger for role_permissions table
DROP TRIGGER IF EXISTS trg_role_permissions_audit ON public.role_permissions;
CREATE TRIGGER trg_role_permissions_audit
AFTER INSERT OR UPDATE OR DELETE ON public.role_permissions
FOR EACH ROW EXECUTE FUNCTION audit.audit_trigger_function();

-- Trigger for sessions table
DROP TRIGGER IF EXISTS trg_sessions_audit ON public.sessions;
CREATE TRIGGER trg_sessions_audit
AFTER INSERT OR UPDATE OR DELETE ON public.sessions
FOR EACH ROW EXECUTE FUNCTION audit.audit_trigger_function();

-- Trigger for password_resets table
DROP TRIGGER IF EXISTS trg_password_resets_audit ON public.password_resets;
CREATE TRIGGER trg_password_resets_audit
AFTER INSERT OR UPDATE OR DELETE ON public.password_resets
FOR EACH ROW EXECUTE FUNCTION audit.audit_trigger_function();

-- Trigger for auth_providers table
DROP TRIGGER IF EXISTS trg_auth_providers_audit ON public.auth_providers;
CREATE TRIGGER trg_auth_providers_audit
AFTER INSERT OR UPDATE OR DELETE ON public.auth_providers
FOR EACH ROW EXECUTE FUNCTION audit.audit_trigger_function();

-- Trigger for quotes table
DROP TRIGGER IF EXISTS trg_quotes_audit ON public.quotes;
CREATE TRIGGER trg_quotes_audit
AFTER INSERT OR UPDATE OR DELETE ON public.quotes
FOR EACH ROW EXECUTE FUNCTION audit.audit_trigger_function();

-- Trigger for loads table
DROP TRIGGER IF EXISTS trg_loads_audit ON public.loads;
CREATE TRIGGER trg_loads_audit
AFTER INSERT OR UPDATE OR DELETE ON public.loads
FOR EACH ROW EXECUTE FUNCTION audit.audit_trigger_function();

COMMIT;

