import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const supabaseUrl = 'https://xbtfzkeavhhbdgljdmya.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhidGZ6a2VhdmhoYmRnbGpkbXlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MzI2MTIsImV4cCI6MjA5MDAwODYxMn0.INEDXFqdPpM5Mn5ixv22U3AnTlECVylvUPZlrJ3z7zA'

export const supabase = createClient(supabaseUrl, supabaseKey)