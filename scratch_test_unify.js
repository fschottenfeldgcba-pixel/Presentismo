import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://fthgkbphepxwdjoxvoyf.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0aGdrYnBoZXB4d2Rqb3h2b3lmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3MjQ4MTAsImV4cCI6MjA5ODMwMDgxMH0.BokMuy1QlMV9iY9oBDDlkyfjxPo3g7gYI_wMNNjwNb0';

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectPreguntasQr() {
  console.log("Checking columns of preguntas_qr table...");
  const { data: qData, error: qErr } = await supabase
    .from('preguntas_qr')
    .select('*')
    .limit(1);

  if (qErr) console.error("Error fetching preguntas_qr:", qErr);
  else console.log("Sample preguntas_qr columns:", Object.keys(qData[0] || {}));
}

inspectPreguntasQr();
