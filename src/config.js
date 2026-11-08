// Public Supabase settings. The anon key is designed to be public: row-level security
// in supabase/schema.sql is what keeps each user's notes private.
// Never put the service_role key here.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://itfpvppsiryiaukrdhoz.supabase.co';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0ZnB2cHBzaXJ5aWF1a3JkaG96Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQxMTg3MTEsImV4cCI6MjEwOTY5NDcxMX0.bQKbR3pKY_1I9z-J1yDsxxAITUPUuL8J83jKCb-tqds';
