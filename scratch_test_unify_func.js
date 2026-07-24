import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://fthgkbphepxwdjoxvoyf.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0aGdrYnBoZXB4d2Rqb3h2b3lmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3MjQ4MTAsImV4cCI6MjA5ODMwMDgxMH0.BokMuy1QlMV9iY9oBDDlkyfjxPo3g7gYI_wMNNjwNb0';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testUnifyFunction() {
  console.log("Creating 2 test duplicate records in vecinos...");
  const masterDni = '999000111';
  const dupDni = '1544791761';

  // Insert master vecino (missing email and barrio)
  await supabase.from('vecinos').upsert({
    dni: masterDni,
    nombre: 'Ariel',
    apellido: 'Rota',
    celular: '',
    email: '',
    barrio: '',
    comuna: 'Comuna 7'
  });

  // Insert duplicate vecino (has email, phone, and barrio)
  await supabase.from('vecinos').upsert({
    dni: dupDni,
    nombre: 'Ariel',
    apellido: 'Rota',
    celular: '1144791761',
    email: 'arielrota@gmail.com',
    barrio: 'Flores',
    comuna: 'Comuna 7'
  });

  console.log("Running consolidation logic...");

  // Simulate unify logic
  const { data: duplicateVecino } = await supabase.from('vecinos').select('*').eq('dni', dupDni).single();
  const { data: masterVecino } = await supabase.from('vecinos').select('*').eq('dni', masterDni).single();

  const overrideFields = { email: 'arielrota@gmail.com', phone: '1144791761', barrio: 'Flores' };

  const baseNombre = overrideFields.nombre || masterVecino?.nombre || duplicateVecino?.nombre || 'Vecino';
  const baseApellido = overrideFields.apellido || masterVecino?.apellido || duplicateVecino?.apellido || '';
  const baseCelular = overrideFields.phone || overrideFields.celular || masterVecino?.celular || duplicateVecino?.celular || '';
  const baseEmail = overrideFields.email || masterVecino?.email || duplicateVecino?.email || '';
  const baseBarrio = overrideFields.barrio || masterVecino?.barrio || duplicateVecino?.barrio || '';
  const baseComuna = overrideFields.comuna || masterVecino?.comuna || duplicateVecino?.comuna || '';

  const { data: updatedMaster } = await supabase.from('vecinos').upsert({
    dni: masterDni,
    nombre: baseNombre,
    apellido: baseApellido,
    celular: baseCelular,
    email: baseEmail,
    barrio: baseBarrio,
    comuna: baseComuna
  }).select().single();

  await supabase.from('vecinos').delete().eq('dni', dupDni);

  console.log("Consolidated Master Record:", updatedMaster);

  // Clean up master test record
  await supabase.from('vecinos').delete().eq('dni', masterDni);
  console.log("Test completed cleanly!");
}

testUnifyFunction();
