// The one place edge functions import supabase-js from. Pinned to an exact
// version so a deploy never silently picks up a new release. Bump it here,
// deliberately, after reading the changelog.
export { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.2'
export type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.117.2'
