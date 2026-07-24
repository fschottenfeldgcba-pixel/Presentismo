import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://fthgkbphepxwdjoxvoyf.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0aGdrYnBoZXB4d2Rqb3h2b3lmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3MjQ4MTAsImV4cCI6MjA5ODMwMDgxMH0.BokMuy1QlMV9iY9oBDDlkyfjxPo3g7gYI_wMNNjwNb0';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkUsers() {
  console.log("Checking perfiles_usuarios for holzeribe@gmail.com and mario.omicucci@gmail.com...");
  const { data, error } = await supabase
    .from('perfiles_usuarios')
    .select('*')
    .or('email.ilike.%holzeribe%,email.ilike.%mario.omicucci%');

  if (error) {
    console.error("Error querying perfiles_usuarios:", error);
  } else {
    console.log("Profiles found:", data);
  }
}

checkUsers();
