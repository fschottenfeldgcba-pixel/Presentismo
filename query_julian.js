import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://fthgkbphepxwdjoxvoyf.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0aGdrYnBoZXB4d2Rqb3h2b3lmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3MjQ4MTAsImV4cCI6MjA5ODMwMDgxMH0.BokMuy1QlMV9iY9oBDDlkyfjxPo3g7gYI_wMNNjwNb0';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("Querying perfiles_usuarios for 'julian'...");
  const { data, error } = await supabase
    .from('perfiles_usuarios')
    .select('*')
    .ilike('email', '%julian%');

  if (error) {
    console.error('Error fetching perfiles_usuarios:', error);
  } else {
    console.log('Results in perfiles_usuarios:', JSON.stringify(data, null, 2));
  }
}

run();
