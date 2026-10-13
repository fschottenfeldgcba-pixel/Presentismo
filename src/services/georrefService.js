/**
 * Servicio de Georreferenciación y Callejero Oficial de la Ciudad de Buenos Aires.
 * Conecta con las APIs públicas de USIG (Normalizador de Direcciones) y EPOK (Puntos de Interés / Lugares Notables).
 */

const USIG_NORMALIZAR_URL = 'https://servicios.usig.buenosaires.gob.ar/normalizar/';
const EPOK_BUSCAR_URL = 'https://epok.buenosaires.gob.ar/buscar/';
const EPOK_OBJECT_URL = 'https://epok.buenosaires.gob.ar/getObjectContent/';

/**
 * Busca direcciones (calles, alturas, esquinas) en el Callejero Oficial de CABA (USIG).
 */
export async function buscarDireccionesUsig(texto, maxOpciones = 5) {
  if (!texto || texto.trim().length < 3) return [];
  try {
    const params = new URLSearchParams({
      direccion: texto.trim(),
      geocodificar: 'TRUE',
      maxOptions: String(maxOpciones)
    });

    const res = await fetch(`${USIG_NORMALIZAR_URL}?${params.toString()}`);
    if (!res.ok) return [];

    const data = await res.json();
    if (!data || !data.direccionesNormalizadas) return [];

    return data.direccionesNormalizadas.map((item) => {
      const coords = item.coordenadas;
      let lat = null;
      let lng = null;
      if (coords && coords.x && coords.y) {
        lng = parseFloat(coords.x);
        lat = parseFloat(coords.y);
      }

      return {
        id: `usig_${item.cod_calle}_${item.altura || item.cod_calle_cruce || 'dir'}`,
        tipo: 'calle',
        label: item.direccion,
        direccionNormalizada: item.direccion,
        calle: item.nombre_calle,
        cruce: item.nombre_calle_cruce || null,
        altura: item.altura || null,
        partido: item.nombre_partido || 'CABA',
        localidad: item.nombre_localidad || 'CABA',
        lat,
        lng,
        fuente: 'USIG GCBA'
      };
    });
  } catch (err) {
    console.warn('Error en búsqueda de direcciones USIG:', err);
    return [];
  }
}

/**
 * Busca lugares notables y puntos de interés (Hospitales, Plazas, Escuelas, Clubes, Teatros) en EPOK GCBA.
 */
export async function buscarLugaresEpok(texto, maxOpciones = 5) {
  if (!texto || texto.trim().length < 3) return [];
  try {
    const params = new URLSearchParams({
      texto: texto.trim()
    });

    const res = await fetch(`${EPOK_BUSCAR_URL}?${params.toString()}`);
    if (!res.ok) return [];

    const data = await res.json();
    if (!data || !data.instancias || !Array.isArray(data.instancias)) return [];

    const items = data.instancias.slice(0, maxOpciones);

    // Para cada lugar, intentamos obtener su dirección/ubicación
    const detallesPromises = items.map(async (inst) => {
      let direccion = '';
      try {
        const objRes = await fetch(`${EPOK_OBJECT_URL}?id=${encodeURIComponent(inst.id)}`);
        if (objRes.ok) {
          const objData = await objRes.json();
          if (objData && objData.contenido) {
            const dirItem = objData.contenido.find(c => c.nombreId === 'direccion' || c.nombre === 'Dirección');
            if (dirItem) direccion = dirItem.valor;
          }
        }
      } catch (e) {
        // Fallback silencioso
      }

      return {
        id: `epok_${inst.id}`,
        tipo: 'lugar',
        label: inst.nombre,
        clase: inst.clase || 'Punto de Interés',
        direccionNormalizada: direccion || inst.nombre,
        lat: null, // Si tiene dirección podemos georreferenciarla con USIG
        lng: null,
        fuente: 'Lugares Notables GCBA'
      };
    });

    return await Promise.all(detallesPromises);
  } catch (err) {
    console.warn('Error en búsqueda de lugares EPOK:', err);
    return [];
  }
}

/**
 * Búsqueda combinada unificada: Callejero Oficial (USIG) + Lugares Notables (EPOK).
 */
export async function buscarUbicacionCaba(texto) {
  if (!texto || texto.trim().length < 3) return [];

  try {
    const [calles, lugares] = await Promise.all([
      buscarDireccionesUsig(texto, 4),
      buscarLugaresEpok(texto, 3)
    ]);

    return [...calles, ...lugares];
  } catch (err) {
    console.error('Error combinando búsqueda de ubicaciones CABA:', err);
    return [];
  }
}

/**
 * Coordenadas aproximadas del centroide de cada Comuna de la Ciudad de Buenos Aires
 */
export const CENTROS_COMUNAS = {
  'Comuna 1': [-34.6037, -58.3816],
  'Comuna 1 Norte': [-34.5950, -58.3750],
  'Comuna 1 Sur': [-34.6150, -58.3750],
  'Comuna 2': [-34.5886, -58.3974],
  'Comuna 3': [-34.6105, -58.4061],
  'Comuna 4': [-34.6462, -58.3875],
  'Comuna 5': [-34.6186, -58.4194],
  'Comuna 6': [-34.6177, -58.4438],
  'Comuna 7': [-34.6366, -58.4475],
  'Comuna 8': [-34.6738, -58.4619],
  'Comuna 9': [-34.6533, -58.4983],
  'Comuna 10': [-34.6289, -58.4998],
  'Comuna 11': [-34.6042, -58.4947],
  'Comuna 12': [-34.5686, -58.4939],
  'Comuna 13': [-34.5558, -58.4592],
  'Comuna 14': [-34.5772, -58.4239],
  'Comuna 15': [-34.5925, -58.4594]
};

export function getCentroComuna(comunaStr) {
  if (!comunaStr) return [-34.6037, -58.3816];
  for (const [key, coords] of Object.entries(CENTROS_COMUNAS)) {
    if (comunaStr.toLowerCase().includes(key.toLowerCase())) {
      return coords;
    }
  }
  return [-34.6037, -58.3816];
}
