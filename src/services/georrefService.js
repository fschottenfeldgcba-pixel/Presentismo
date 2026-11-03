/**
 * Servicio de Georreferenciación y Callejero Oficial de la Ciudad de Buenos Aires.
 * Conecta con las APIs públicas de USIG (Normalizador de Direcciones) y EPOK (Puntos de Interés / Lugares Notables).
 */

const USIG_NORMALIZAR_URL = 'https://servicios.usig.buenosaires.gob.ar/normalizar/';
const EPOK_BUSCAR_URL = 'https://epok.buenosaires.gob.ar/buscar/';
const EPOK_OBJECT_URL = 'https://epok.buenosaires.gob.ar/getObjectContent/';
const GEOREF_UBICACION_URL = 'https://apis.datos.gob.ar/georef/api/ubicacion';
const GEOREF_DIRECCIONES_URL = 'https://apis.datos.gob.ar/georef/api/direcciones';
const GEOREF_CALLES_URL = 'https://apis.datos.gob.ar/georef/api/calles';

/**
 * Helper con timeout estricto para evitar bloqueos por servicios caídos de GCBA (ej. USIG 502)
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 350) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: options.signal || controller.signal
    });
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Normaliza y limpia textos de direcciones tipeados a mano para asegurar
 * que esquinas con paréntesis, cruces o formatos coloquiales sean resueltos al 100%.
 * Ej: "AV INDEPENDENCIA (ESQUINA QUINTINO BOCAYUVA)" -> "AV INDEPENDENCIA y QUINTINO BOCAYUVA"
 */
export function limpiarTextoDireccion(texto) {
  if (!texto) return '';
  let str = String(texto).trim();
  // 1. Quitar prefijos comunes
  str = str.replace(/^(?:ubicaci[oó]n|direcci[oó]n|calle|en)\s*:\s*/i, '');
  // 2. Extraer o transformar paréntesis con esquinas: (esquina Quintino Bocayuva) o (Quintino Bocayuva)
  str = str.replace(/\s*\((?:esquina|esq\.?|cruce)?\s*([^)]+)\)/gi, ' y $1');
  // 3. Palabras explícitas de cruce
  str = str.replace(/\b(?:esquina|esq\.?|cruce)\b/gi, ' y ');
  // 4. Normalizar diagonales o guiones de cruce
  str = str.replace(/\s*[/]\s*/g, ' y ');
  // 5. Normalizar repeticiones de 'y' y espacios
  str = str.replace(/\s+y(?:\s+y)+\s+/gi, ' y ');
  str = str.replace(/\s+/g, ' ');
  // 6. Correcciones comunes de calles de CABA
  str = str.replace(/\bzabalia\b/gi, 'Zavalía');
  return str.trim();
}

/**
 * Normaliza y geocodifica una dirección puntual con Georef y USIG.
 * Ultra rápido y tolerante a direcciones tipeadas a mano o sin seleccionar del desplegable.
 */
export async function normalizarDireccionUsig(texto) {
  if (!texto || String(texto).trim().length < 3) return null;
  const clean = limpiarTextoDireccion(texto);

  // 1. Verificación instantánea en catálogo de Lugares Notables de CABA (0ms)
  if (Array.isArray(LUGARES_CABA_NOTABLES)) {
    const qNorm = clean.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const matchNotable = LUGARES_CABA_NOTABLES.find(item => {
      const nom = (item.label || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const dir = (item.direccionNormalizada || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return nom.includes(qNorm) || qNorm.includes(nom) || (dir && (dir.includes(qNorm) || qNorm.includes(dir)));
    });
    if (matchNotable && matchNotable.lat && matchNotable.lng) {
      return {
        direccion: matchNotable.label,
        lat: matchNotable.lat,
        lng: matchNotable.lng,
        comuna: matchNotable.comuna || null,
        altura: null,
        cruce: null
      };
    }
  }

  // 2. Georef API (apis.datos.gob.ar): ultra rápida (~30ms), soporte para esquinas y números exactos
  try {
    const url = `${GEOREF_DIRECCIONES_URL}?direccion=${encodeURIComponent(clean)}&provincia=${encodeURIComponent('Ciudad Autónoma de Buenos Aires')}&max=1`;
    const res = await fetchWithTimeout(url, {}, 1200);
    if (res.ok) {
      const data = await res.json();
      if (data && data.direcciones && data.direcciones.length > 0) {
        const item = data.direcciones[0];
        if (item.ubicacion && item.ubicacion.lat && item.ubicacion.lon) {
          const lat = parseFloat(item.ubicacion.lat);
          const lng = parseFloat(item.ubicacion.lon);
          const dirNom = item.nomenclatura ? item.nomenclatura.split(',')[0].trim() : clean;
          return {
            direccion: dirNom,
            lat,
            lng,
            comuna: item.departamento ? item.departamento.nombre : null,
            altura: item.altura?.valor || null,
            cruce: item.calle_cruce_1?.nombre || null
          };
        }
      }
    }
  } catch (e) {
    // Continuar a fallback USIG
  }

  // 3. Fallback USIG GCBA (con timeout estricto de 350ms para no demorar al usuario)
  try {
    const params = new URLSearchParams({
      direccion: clean,
      geocodificar: 'TRUE',
      maxOptions: '1'
    });
    const res = await fetchWithTimeout(`${USIG_NORMALIZAR_URL}?${params.toString()}`, {}, 350);
    if (res.ok) {
      const data = await res.json();
      if (data && data.direccionesNormalizadas && data.direccionesNormalizadas.length > 0) {
        const item = data.direccionesNormalizadas[0];
        let lat = null;
        let lng = null;
        if (item.coordenadas && item.coordenadas.x && item.coordenadas.y) {
          lng = parseFloat(item.coordenadas.x);
          lat = parseFloat(item.coordenadas.y);
        }
        if (lat && lng) {
          return {
            direccion: item.direccion,
            lat,
            lng,
            comuna: null,
            altura: item.altura || null,
            cruce: item.nombre_calle_cruce || null
          };
        }
      }
    }
  } catch (e) {}

  // 4. Fallback de altura aproximada si Georef no indexó la puerta exacta pero existe la calle
  const matchNum = clean.match(/^([a-záéíóúñ\s\.]+?)\s+(\d{1,5})\b/i);
  if (matchNum) {
    const calleStr = matchNum[1].trim();
    const altStr = matchNum[2].trim();
    try {
      const resCalles = await fetchWithTimeout(`${GEOREF_CALLES_URL}?nombre=${encodeURIComponent(calleStr)}&provincia=${encodeURIComponent('Ciudad Autónoma de Buenos Aires')}&max=1`, {}, 800);
      if (resCalles.ok) {
        const dataCalles = await resCalles.json();
        if (dataCalles?.calles?.length > 0) {
          const c = dataCalles.calles[0];
          return {
            direccion: `${c.nombre} ${altStr}`,
            lat: null,
            lng: null,
            comuna: c.departamento?.nombre || null,
            altura: parseInt(altStr, 10),
            cruce: null
          };
        }
      }
    } catch (e) {}
  }

  return null;
}

/**
 * Consulta la Comuna oficial de CABA a partir de coordenadas lat/lng utilizando la API de Georef.
 */
export async function obtenerComunaPorCoordenadas(lat, lng) {
  if (!lat || !lng) return null;
  try {
    const res = await fetch(`${GEOREF_UBICACION_URL}?lat=${lat}&lon=${lng}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.ubicacion && data.ubicacion.departamento && data.ubicacion.departamento.nombre) {
      return data.ubicacion.departamento.nombre; // Ej: "Comuna 7", "Comuna 5"
    }
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Búsqueda de direcciones y calles en Georef API oficial cuando USIG no responde
 */
async function buscarDireccionesGeoref(texto, maxOpciones = 5, signal = null) {
  if (!texto || texto.trim().length < 3) return [];
  try {
    const clean = texto.trim().replace(/\bzabalia\b/gi, 'Zavalia');
    const tieneNumero = /\b\d{1,5}\b/.test(clean);
    const results = [];
    const seen = new Set();

    if (tieneNumero) {
      // Si el usuario escribió un número de altura (ej: "Monroe 1454" o "AV MONROE 1454"),
      // consultamos directamente la API de Direcciones exactas de CABA
      const fetchOpts = signal ? { signal } : {};
      const resDirs = await fetch(
        `${GEOREF_DIRECCIONES_URL}?direccion=${encodeURIComponent(clean)}&provincia=${encodeURIComponent('Ciudad Autónoma de Buenos Aires')}&max=${maxOpciones}`,
        fetchOpts
      ).then(r => r.ok ? r.json() : null).catch(() => null);

      if (resDirs && resDirs.direcciones && resDirs.direcciones.length > 0) {
        resDirs.direcciones.forEach(d => {
          const nomCorta = d.nomenclatura ? d.nomenclatura.split(',')[0].trim() : clean;
          if (!seen.has(nomCorta)) {
            seen.add(nomCorta);
            results.push({
              id: `georef_dir_${d.calle?.id || ''}_${d.altura?.valor || Math.random()}`,
              tipo: 'calle',
              label: nomCorta,
              direccionNormalizada: nomCorta,
              calle: d.calle?.nombre || '',
              cruce: d.calle_cruce_1?.nombre || null,
              altura: d.altura?.valor || null,
              partido: 'CABA',
              localidad: 'CABA',
              lat: d.ubicacion?.lat ? parseFloat(d.ubicacion.lat) : null,
              lng: d.ubicacion?.lon ? parseFloat(d.ubicacion.lon) : null,
              comuna: d.departamento?.nombre || null,
              fuente: 'Callejero Oficial (Georef)'
            });
          }
        });
      }

      // Si no devolvió puerta exacta pero el usuario ingresó calle y número,
      // buscamos la calle en CABA y armamos la sugerencia con la altura para no perder el número
      if (results.length === 0) {
        const match = clean.match(/^([a-záéíóúñ\s\.]+?)\s+(\d{1,5})\b/i);
        if (match) {
          const callePura = match[1].trim();
          const altPura = match[2].trim();
          const resCalles = await fetch(
            `${GEOREF_CALLES_URL}?nombre=${encodeURIComponent(callePura)}&provincia=${encodeURIComponent('Ciudad Autónoma de Buenos Aires')}&max=3`,
            fetchOpts
          ).then(r => r.ok ? r.json() : null).catch(() => null);

          if (resCalles && resCalles.calles) {
            resCalles.calles.forEach(c => {
              const nomFinal = `${c.nombre} ${altPura}`;
              if (!seen.has(nomFinal)) {
                seen.add(nomFinal);
                results.push({
                  id: `georef_calle_${c.id}_alt_${altPura}`,
                  tipo: 'calle',
                  label: nomFinal,
                  direccionNormalizada: nomFinal,
                  calle: c.nombre,
                  cruce: null,
                  altura: parseInt(altPura, 10),
                  partido: 'CABA',
                  localidad: 'CABA',
                  lat: null,
                  lng: null,
                  comuna: c.departamento?.nombre || null,
                  fuente: 'Callejero Oficial (Georef)'
                });
              }
            });
          }
        }
      }

      return results;
    }

    // Búsqueda general de calles e intersecciones sin número
    const fetchOpts = signal ? { signal } : {};
    const [resDirs, resCalles] = await Promise.all([
      fetch(`${GEOREF_DIRECCIONES_URL}?direccion=${encodeURIComponent(clean)}&provincia=${encodeURIComponent('Ciudad Autónoma de Buenos Aires')}&max=${maxOpciones}`, fetchOpts)
        .then(r => r.ok ? r.json() : null)
        .catch(() => null),
      fetch(`${GEOREF_CALLES_URL}?nombre=${encodeURIComponent(clean)}&provincia=${encodeURIComponent('Ciudad Autónoma de Buenos Aires')}&max=3`, fetchOpts)
        .then(r => r.ok ? r.json() : null)
        .catch(() => null)
    ]);

    if (resDirs && resDirs.direcciones) {
      resDirs.direcciones.forEach(d => {
        const nomCorta = d.nomenclatura ? d.nomenclatura.split(',')[0].trim() : clean;
        if (!seen.has(nomCorta)) {
          seen.add(nomCorta);
          results.push({
            id: `georef_dir_${d.calle?.id || ''}_${d.altura?.valor || d.calle_cruce_1?.id || Math.random()}`,
            tipo: 'calle',
            label: nomCorta,
            direccionNormalizada: nomCorta,
            calle: d.calle?.nombre || '',
            cruce: d.calle_cruce_1?.nombre || null,
            altura: d.altura?.valor || null,
            partido: 'CABA',
            localidad: 'CABA',
            lat: d.ubicacion?.lat ? parseFloat(d.ubicacion.lat) : null,
            lng: d.ubicacion?.lon ? parseFloat(d.ubicacion.lon) : null,
            comuna: d.departamento?.nombre || null,
            fuente: 'Callejero Oficial (Georef)'
          });
        }
      });
    }

    if (resCalles && resCalles.calles) {
      resCalles.calles.forEach(c => {
        const nomCorta = c.nombre ? c.nombre.trim() : clean;
        if (!seen.has(nomCorta)) {
          seen.add(nomCorta);
          results.push({
            id: `georef_calle_${c.id}`,
            tipo: 'calle',
            label: nomCorta,
            direccionNormalizada: nomCorta,
            calle: c.nombre,
            cruce: null,
            altura: null,
            partido: 'CABA',
            localidad: 'CABA',
            lat: null,
            lng: null,
            comuna: c.departamento?.nombre || null,
            fuente: 'Callejero Oficial (Georef)'
          });
        }
      });
    }

    return results;
  } catch (e) {
    return [];
  }
}

/**
 * Busca direcciones (calles, alturas, esquinas) en el Callejero Oficial de CABA (USIG + fallback Georef).
 */
export async function buscarDireccionesUsig(texto, maxOpciones = 5, signal = null) {
  if (!texto || String(texto).trim().length < 3) return [];
  const clean = limpiarTextoDireccion(texto);

  // Si tiene número O cruce/esquina ('y'), Georef responde en ~30ms y es 100% confiable
  const tieneNumero = /\b\d{1,5}\b/.test(clean);
  const tieneCruce = /\s+y\s+/i.test(clean);
  if (tieneNumero || tieneCruce) {
    return await buscarDireccionesGeoref(clean, maxOpciones, signal);
  }

  try {
    const params = new URLSearchParams({
      direccion: clean,
      geocodificar: 'TRUE',
      maxOptions: String(maxOpciones)
    });

    const res = await fetchWithTimeout(`${USIG_NORMALIZAR_URL}?${params.toString()}`, signal ? { signal } : {}, 300);
    if (res.ok) {
      const data = await res.json();
      if (data && data.direccionesNormalizadas && data.direccionesNormalizadas.length > 0) {
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
            comuna: null,
            fuente: 'USIG GCBA'
          };
        });
      }
    }
  } catch (err) {
    // Si USIG está caído (502) o superó los 300ms, el flujo continúa de inmediato a Georef
  }

  // Fallback con Georef API oficial
  return await buscarDireccionesGeoref(clean, maxOpciones, signal);
}

/**
 * Helper para realizar peticiones JSONP a servicios de GCBA que no habilitan CORS (como EPOK).
 */
function fetchJsonp(url) {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      fetch(url)
        .then(r => r.json())
        .then(resolve)
        .catch(reject);
      return;
    }

    const callbackName = 'epok_cb_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
    const delimiter = url.includes('?') ? '&' : '?';
    const script = document.createElement('script');
    script.src = `${url}${delimiter}callback=${callbackName}`;
    script.async = true;

    let timeoutId = null;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      try {
        delete window[callbackName];
      } catch (e) {
        window[callbackName] = undefined;
      }
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };

    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('Petición JSONP a EPOK superó el tiempo de espera'));
    }, 7000);

    window[callbackName] = (data) => {
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error('Error de red al invocar JSONP EPOK'));
    };

    document.head.appendChild(script);
  });
}

/**
 * Convierte coordenadas métricas GKBA (Buenos Aires Gauss-Krüger / EPSG:22185) a WGS84 (Lat, Lng).
 */
export function gkbaToWgs84(x, y) {
  const latRef = -34.62935;
  const lonRef = -58.46328;
  const xRef = 100000;
  const yRef = 100000;
  const mPerLat = 110950;
  const mPerLon = 91600;
  return {
    lat: latRef + (y - yRef) / mPerLat,
    lng: lonRef + (x - xRef) / mPerLon
  };
}

/**
 * Catálogo instantáneo de puntos de interés y lugares notables emblemáticos de CABA.
 * Garantiza respuesta ultra rápida y 100% resiliente aun con servidores de GCBA caídos.
 */
export const LUGARES_CABA_NOTABLES = [
  // Universidades y Educación Superior
  {
    id: 'lugar_cu_fadu',
    tipo: 'lugar',
    label: 'Ciudad Universitaria (CABA - Belgrano)',
    clase: 'Campus Universitario',
    direccionNormalizada: 'Av. Costanera Rafael Obligado e Int. Güiraldes s/n',
    lat: -34.5428,
    lng: -58.4441,
    comuna: 'Comuna 13',
    fuente: 'Lugares Notables CABA'
  },
  {
    id: 'lugar_cu_pab3',
    tipo: 'lugar',
    label: 'Ciudad Universitaria - FADU / Pabellón 3',
    clase: 'Facultad de Arquitectura, Diseño y Urbanismo (UBA)',
    direccionNormalizada: 'Intendente Güiraldes 2160',
    lat: -34.5412,
    lng: -58.4438,
    comuna: 'Comuna 13',
    fuente: 'Lugares Notables CABA'
  },
  {
    id: 'lugar_cu_pab2',
    tipo: 'lugar',
    label: 'Ciudad Universitaria - Pabellón 2 (Exactas)',
    clase: 'Facultad de Ciencias Exactas y Naturales (UBA)',
    direccionNormalizada: 'Intendente Güiraldes 2160',
    lat: -34.5425,
    lng: -58.4428,
    comuna: 'Comuna 13',
    fuente: 'Lugares Notables CABA'
  },
  {
    id: 'lugar_cu_pab1',
    tipo: 'lugar',
    label: 'Ciudad Universitaria - Pabellón 1',
    clase: 'Edificio Universitario (UBA)',
    direccionNormalizada: 'Intendente Güiraldes 2160',
    lat: -34.5450,
    lng: -58.4402,
    comuna: 'Comuna 13',
    fuente: 'Lugares Notables CABA'
  },
  {
    id: 'lugar_uba_derecho',
    tipo: 'lugar',
    label: 'Facultad de Derecho (UBA)',
    clase: 'Facultad',
    direccionNormalizada: 'Av. Figueroa Alcorta 2263',
    lat: -34.5828,
    lng: -58.3917,
    comuna: 'Comuna 2',
    fuente: 'Lugares Notables CABA'
  },
  {
    id: 'lugar_uba_medicina',
    tipo: 'lugar',
    label: 'Facultad de Medicina (UBA)',
    clase: 'Facultad',
    direccionNormalizada: 'Paraguay 2155',
    lat: -34.5994,
    lng: -58.3986,
    comuna: 'Comuna 2',
    fuente: 'Lugares Notables CABA'
  },
  {
    id: 'lugar_uba_ingenieria',
    tipo: 'lugar',
    label: 'Facultad de Ingeniería (UBA - Sede Paseo Colón)',
    clase: 'Facultad',
    direccionNormalizada: 'Av. Paseo Colón 850',
    lat: -34.6178,
    lng: -58.3686,
    comuna: 'Comuna 1',
    fuente: 'Lugares Notables CABA'
  },

  // Centros de Salud (CeSACs emblemáticos y hospitales)
  {
    id: 'lugar_cesac_38',
    tipo: 'lugar',
    label: 'CeSAC N° 38 (Centro de Salud - Almagro)',
    clase: 'Centro de Salud y Acción Comunitaria',
    direccionNormalizada: 'Av. Medrano 350',
    lat: -34.6067,
    lng: -58.4214,
    comuna: 'Comuna 5',
    fuente: 'Lugares Notables CABA'
  },
  {
    id: 'lugar_hosp_ramos',
    tipo: 'lugar',
    label: 'Hospital Ramos Mejía',
    clase: 'Hospital General de Agudos',
    direccionNormalizada: 'Gral. Urquiza 609',
    lat: -34.6178,
    lng: -58.4111,
    comuna: 'Comuna 3',
    fuente: 'Lugares Notables CABA'
  },
  {
    id: 'lugar_hosp_alvarez',
    tipo: 'lugar',
    label: 'Hospital Álvarez',
    clase: 'Hospital General de Agudos',
    direccionNormalizada: 'Dr. Juan Felipe Aranguren 2701',
    lat: -34.6267,
    lng: -58.4686,
    comuna: 'Comuna 7',
    fuente: 'Lugares Notables CABA'
  },
  {
    id: 'lugar_hosp_pinero',
    tipo: 'lugar',
    label: 'Hospital Piñero',
    clase: 'Hospital General de Agudos',
    direccionNormalizada: 'Varela 1301',
    lat: -34.6417,
    lng: -58.4489,
    comuna: 'Comuna 7',
    fuente: 'Lugares Notables CABA'
  },
  {
    id: 'lugar_hosp_durand',
    tipo: 'lugar',
    label: 'Hospital Durand',
    clase: 'Hospital General de Agudos',
    direccionNormalizada: 'Av. Díaz Vélez 5044',
    lat: -34.6083,
    lng: -58.4386,
    comuna: 'Comuna 6',
    fuente: 'Lugares Notables CABA'
  },
  {
    id: 'lugar_hosp_fernandez',
    tipo: 'lugar',
    label: 'Hospital Fernández',
    clase: 'Hospital General de Agudos',
    direccionNormalizada: 'Cerviño 3356',
    lat: -34.5828,
    lng: -58.4078,
    comuna: 'Comuna 14',
    fuente: 'Lugares Notables CABA'
  },
  {
    id: 'lugar_hosp_argerich',
    tipo: 'lugar',
    label: 'Hospital Argerich',
    clase: 'Hospital General de Agudos',
    direccionNormalizada: 'Pi y Margall 750',
    lat: -34.6294,
    lng: -58.3639,
    comuna: 'Comuna 4',
    fuente: 'Lugares Notables CABA'
  },
  {
    id: 'lugar_hosp_tornu',
    tipo: 'lugar',
    label: 'Hospital Tornú',
    clase: 'Hospital General de Agudos',
    direccionNormalizada: 'Combatientes de Malvinas 3002',
    lat: -34.5861,
    lng: -58.4739,
    comuna: 'Comuna 15',
    fuente: 'Lugares Notables CABA'
  },
  {
    id: 'lugar_hosp_pirovano',
    tipo: 'lugar',
    label: 'Hospital Pirovano',
    clase: 'Hospital General de Agudos',
    direccionNormalizada: 'Av. Monroe 3555',
    lat: -34.5661,
    lng: -58.4719,
    comuna: 'Comuna 12',
    fuente: 'Lugares Notables CABA'
  },
  {
    id: 'lugar_hosp_santojanni',
    tipo: 'lugar',
    label: 'Hospital Santojanni',
    clase: 'Hospital General de Agudos',
    direccionNormalizada: 'Pilar 950',
    lat: -34.6508,
    lng: -58.5133,
    comuna: 'Comuna 9',
    fuente: 'Lugares Notables CABA'
  },
  {
    id: 'lugar_hosp_elizalde',
    tipo: 'lugar',
    label: 'Hospital Pedro de Elizalde (Casa Cuna)',
    clase: 'Hospital Pediátrico',
    direccionNormalizada: 'Av. Montes de Oca 40',
    lat: -34.6278,
    lng: -58.3789,
    comuna: 'Comuna 1',
    fuente: 'Lugares Notables CABA'
  },
  {
    id: 'lugar_hosp_gutierrez',
    tipo: 'lugar',
    label: 'Hospital de Niños Ricardo Gutiérrez',
    clase: 'Hospital Pediátrico',
    direccionNormalizada: 'Gallo 1330',
    lat: -34.5956,
    lng: -58.4117,
    comuna: 'Comuna 2',
    fuente: 'Lugares Notables CABA'
  },

  // Parques y Plazas
  {
    id: 'lugar_pq_chacabuco',
    tipo: 'lugar',
    label: 'Parque Chacabuco',
    clase: 'Espacio Verde Público',
    direccionNormalizada: 'Av. Asamblea y Emilio Mitre',
    lat: -34.6322,
    lng: -58.4404,
    comuna: 'Comuna 7',
    fuente: 'Lugares Notables CABA'
  },
  {
    id: 'lugar_pq_patricios',
    tipo: 'lugar',
    label: 'Parque Patricios',
    clase: 'Espacio Verde Público',
    direccionNormalizada: 'Av. Caseros y Monteagudo',
    lat: -34.6366,
    lng: -58.4057,
    comuna: 'Comuna 4',
    fuente: 'Lugares Notables CABA'
  },
  {
    id: 'lugar_pq_centenario',
    tipo: 'lugar',
    label: 'Parque Centenario',
    clase: 'Espacio Verde Público',
    direccionNormalizada: 'Av. Díaz Vélez y Patricias Argentinas',
    lat: -34.6063,
    lng: -58.4355,
    comuna: 'Comuna 6',
    fuente: 'Lugares Notables CABA'
  },
  {
    id: 'lugar_pq_rivadavia',
    tipo: 'lugar',
    label: 'Parque Rivadavia',
    clase: 'Espacio Verde Público',
    direccionNormalizada: 'Av. Rivadavia 4900',
    lat: -34.6186,
    lng: -58.4328,
    comuna: 'Comuna 6',
    fuente: 'Lugares Notables CABA'
  },
  {
    id: 'lugar_pq_lezama',
    tipo: 'lugar',
    label: 'Parque Lezama',
    clase: 'Espacio Verde Público',
    direccionNormalizada: 'Defensa y Brasil',
    lat: -34.6283,
    lng: -58.3702,
    comuna: 'Comuna 1',
    fuente: 'Lugares Notables CABA'
  },
  {
    id: 'lugar_pq_avellaneda',
    tipo: 'lugar',
    label: 'Parque Avellaneda',
    clase: 'Espacio Verde Público',
    direccionNormalizada: 'Av. Directorio y Lacarra',
    lat: -34.6477,
    lng: -58.4786,
    comuna: 'Comuna 9',
    fuente: 'Lugares Notables CABA'
  },
  {
    id: 'lugar_pq_saavedra',
    tipo: 'lugar',
    label: 'Parque Saavedra',
    clase: 'Espacio Verde Público',
    direccionNormalizada: 'García del Río y Pinto',
    lat: -34.5513,
    lng: -58.4842,
    comuna: 'Comuna 12',
    fuente: 'Lugares Notables CABA'
  },
  {
    id: 'lugar_pl_irlanda',
    tipo: 'lugar',
    label: 'Plaza Irlanda',
    clase: 'Espacio Verde Público',
    direccionNormalizada: 'Av. Gaona y Donato Álvarez',
    lat: -34.6163,
    lng: -58.4552,
    comuna: 'Comuna 6',
    fuente: 'Lugares Notables CABA'
  },
  {
    id: 'lugar_pl_flores',
    tipo: 'lugar',
    label: 'Plaza Flores (Plaza Pueyrredón)',
    clase: 'Espacio Verde Público',
    direccionNormalizada: 'Av. Rivadavia y Artigas',
    lat: -34.6292,
    lng: -58.4632,
    comuna: 'Comuna 7',
    fuente: 'Lugares Notables CABA'
  },
  {
    id: 'lugar_pl_mayo',
    tipo: 'lugar',
    label: 'Plaza de Mayo',
    clase: 'Espacio Histórico',
    direccionNormalizada: 'Av. Hipólito Yrigoyen y Bolívar',
    lat: -34.6083,
    lng: -58.3712,
    comuna: 'Comuna 1',
    fuente: 'Lugares Notables CABA'
  },
  {
    id: 'lugar_pq_estacion',
    tipo: 'lugar',
    label: 'Parque de la Estación (Balvanera)',
    clase: 'Espacio Verde Público',
    direccionNormalizada: 'Tte. Gral. Juan Domingo Perón 3326',
    lat: -34.6067,
    lng: -58.4103,
    comuna: 'Comuna 3',
    fuente: 'Lugares Notables CABA'
  },
  {
    id: 'lugar_reserva_eco',
    tipo: 'lugar',
    label: 'Reserva Ecológica Costanera Sur',
    clase: 'Reserva Natural',
    direccionNormalizada: 'Av. Tristán Achával Rodríguez 1550',
    lat: -34.6111,
    lng: -58.3542,
    comuna: 'Comuna 1',
    fuente: 'Lugares Notables CABA'
  },

  // Terminales y puntos neurálgicos
  {
    id: 'lugar_aeroparque',
    tipo: 'lugar',
    label: 'Aeroparque Jorge Newbery',
    clase: 'Aeropuerto',
    direccionNormalizada: 'Av. Costanera Rafael Obligado s/n',
    lat: -34.5589,
    lng: -58.4167,
    comuna: 'Comuna 14',
    fuente: 'Lugares Notables CABA'
  },
  {
    id: 'lugar_term_retiro',
    tipo: 'lugar',
    label: 'Terminal de Ómnibus Retiro',
    clase: 'Terminal de Transporte',
    direccionNormalizada: 'Av. Antártida Argentina y Calle 10',
    lat: -34.5867,
    lng: -58.3739,
    comuna: 'Comuna 1',
    fuente: 'Lugares Notables CABA'
  },
  {
    id: 'lugar_est_constitucion',
    tipo: 'lugar',
    label: 'Estación Plaza Constitución',
    clase: 'Estación de Ferrocarril',
    direccionNormalizada: 'Av. Brasil 1128',
    lat: -34.6278,
    lng: -58.3817,
    comuna: 'Comuna 1',
    fuente: 'Lugares Notables CABA'
  },
  {
    id: 'lugar_est_once',
    tipo: 'lugar',
    label: 'Estación Once de Septiembre (Plaza Miserere)',
    clase: 'Estación de Ferrocarril',
    direccionNormalizada: 'Bartolomé Mitre 2815',
    lat: -34.6089,
    lng: -58.4072,
    comuna: 'Comuna 3',
    fuente: 'Lugares Notables CABA'
  }
];

/**
 * Busca lugares notables y puntos de interés (Hospitales, CeSACs, Plazas, Escuelas, Clubes, Teatros)
 * en el catálogo integrado de CABA y en EPOK GCBA, garantizando coordenadas precisas.
 */
export async function buscarLugaresEpok(texto, maxOpciones = 5) {
  if (!texto || texto.trim().length < 3) return [];
  const clean = texto.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const results = [];
  const seenIds = new Set();

  // 1. Búsqueda instantánea en catálogo local de Lugares Notables de CABA
  for (const item of LUGARES_CABA_NOTABLES) {
    const itemNorm = (item.label + ' ' + (item.clase || '') + ' ' + (item.direccionNormalizada || ''))
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    
    // Si contiene la consulta del usuario
    if (itemNorm.includes(clean) || clean.includes(item.label.toLowerCase())) {
      seenIds.add(item.id);
      results.push({ ...item });
      if (results.length >= maxOpciones) return results;
    }
  }

  // Si busca un CeSAC con número específico (ej: "cesac 38", "cesac 12", "cesac n° 5")
  const matchCesacNum = clean.match(/cesac\s*(?:n[°º]?\s*)?(\d{1,2})/i);
  if (matchCesacNum && !results.some(r => r.label.toLowerCase().includes(`cesac n° ${matchCesacNum[1]}`))) {
    const num = matchCesacNum[1];
    if (num === '38') {
      const cesac38 = LUGARES_CABA_NOTABLES.find(l => l.id === 'lugar_cesac_38');
      if (cesac38 && !seenIds.has(cesac38.id)) {
        seenIds.add(cesac38.id);
        results.unshift({ ...cesac38 });
      }
    }
  }

  // 2. Consulta en vivo a la API oficial EPOK GCBA
  try {
    const params = new URLSearchParams({
      texto: texto.trim()
    });

    let data = null;
    try {
      data = await fetchJsonp(`${EPOK_BUSCAR_URL}?${params.toString()}`);
    } catch (e) {
      // Fallback a fetch directo
      const res = await fetch(`${EPOK_BUSCAR_URL}?${params.toString()}`);
      if (res.ok) data = await res.json();
    }

    if (data && data.instancias && Array.isArray(data.instancias)) {
      const items = data.instancias.slice(0, maxOpciones + 2);

      const detallesPromises = items.map(async (inst) => {
        const uniqueId = `epok_${inst.id}`;
        if (seenIds.has(uniqueId)) return null;

        let direccion = '';
        let lat = null;
        let lng = null;
        let comuna = null;

        try {
          let objData = null;
          try {
            objData = await fetchJsonp(`${EPOK_OBJECT_URL}?id=${encodeURIComponent(inst.id)}`);
          } catch (e) {
            const objRes = await fetch(`${EPOK_OBJECT_URL}?id=${encodeURIComponent(inst.id)}`);
            if (objRes.ok) objData = await objRes.json();
          }

          if (objData) {
            if (objData.direccionNormalizada && typeof objData.direccionNormalizada === 'string') {
              direccion = objData.direccionNormalizada.trim();
            } else if (objData.contenido && Array.isArray(objData.contenido)) {
              const dirItem = objData.contenido.find(c => 
                c.nombreId === 'direccion' || 
                c.nombre === 'Dirección' ||
                c.nombreId === 'direccion_cueanexo' ||
                c.nombre === 'Dirección del Cueanexo' ||
                c.nombreId === 'ubicacion'
              );
              if (dirItem && dirItem.valor) direccion = dirItem.valor.trim();

              const comItem = objData.contenido.find(c => c.nombreId === 'comuna' || c.nombre === 'Comuna');
              if (comItem && comItem.valor) comuna = comItem.valor.trim();
            }

            // Extracción de coordenadas desde centroide GKBA (EPSG:22185)
            if (objData.ubicacion && objData.ubicacion.centroide) {
              const ptMatch = String(objData.ubicacion.centroide).match(/POINT\s*\(\s*([\d\.]+)\s+([\d\.]+)\s*\)/i);
              if (ptMatch) {
                const x = parseFloat(ptMatch[1]);
                const y = parseFloat(ptMatch[2]);
                const wgs = gkbaToWgs84(x, y);
                lat = wgs.lat;
                lng = wgs.lng;
              }
            }
          }
        } catch (e) {}

        // Geocodificar la dirección del lugar con USIG si no obtuvimos lat/lng de centroide
        if ((!lat || !lng) && direccion) {
          const geo = await normalizarDireccionUsig(direccion);
          if (geo && geo.lat && geo.lng) {
            lat = geo.lat;
            lng = geo.lng;
            if (!comuna) comuna = geo.comuna;
          }
        }

        if (!comuna && lat && lng) {
          try {
            comuna = await obtenerComunaPorCoordenadas(lat, lng);
          } catch (e) {}
        }

        return {
          id: uniqueId,
          tipo: 'lugar',
          label: inst.nombre,
          clase: inst.clase || 'Punto de Interés',
          direccionNormalizada: direccion || inst.nombre,
          lat,
          lng,
          comuna,
          fuente: 'Lugares Notables GCBA'
        };
      });

      const epokParsed = (await Promise.all(detallesPromises)).filter(Boolean);
      for (const p of epokParsed) {
        if (!seenIds.has(p.id) && results.length < maxOpciones) {
          seenIds.add(p.id);
          results.push(p);
        }
      }
    }
  } catch (err) {
    console.warn('Error en búsqueda de lugares EPOK:', err);
  }

  return results.slice(0, maxOpciones);
}

/**
 * Búsqueda combinada unificada: Callejero Oficial (USIG/Georef) + Lugares Notables (EPOK y Catálogo CABA).
 */
export async function buscarUbicacionCaba(texto, options = {}) {
  if (!texto || String(texto).trim().length < 3) return [];
  const clean = limpiarTextoDireccion(texto);
  const signal = options.signal || null;

  try {
    // 1. Verificación preliminar inmediata en catálogo local de Lugares Notables (0ms)
    const lugaresLocales = [];
    if (Array.isArray(LUGARES_CABA_NOTABLES)) {
      const qNorm = clean.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      LUGARES_CABA_NOTABLES.forEach(item => {
        const nom = (item.label || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const dir = (item.direccionNormalizada || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (nom.includes(qNorm) || qNorm.includes(nom) || (dir && (dir.includes(qNorm) || qNorm.includes(dir)))) {
          lugaresLocales.push(item);
        }
      });
    }

    // Detección de si es búsqueda de un lugar físico (ej: "cesac 38", "escuela 15", "plaza irlanda", "ciudad universitaria")
    const esLugar = /\b(cesac|ce\.?s\.?a\.?c\.?|escuela|colegio|jardin|jardín|hospital|comisaria|comisaría|plaza|parque|club|facultad|universidad|universitaria|teatro|museo|estacion|estación|terminal|centro|sede|instituto|polideportivo)\b/i.test(clean);
    
    // Si tiene número puro sin palabras de lugares (ej: "Monroe 1454"), busca directo en Georef/USIG con altura
    const tieneNumeroPuro = /\b\d{1,5}\b/.test(clean) && !esLugar;
    if (tieneNumeroPuro) {
      const dirs = await buscarDireccionesUsig(clean, 5, signal);
      return [...lugaresLocales, ...dirs];
    }

    const [calles, lugares] = await Promise.all([
      buscarDireccionesUsig(clean, 5, signal),
      buscarLugaresEpok(clean, 5)
    ]);

    // Combinar sin duplicados
    const combined = [...lugaresLocales, ...lugares, ...calles];
    const seen = new Set();
    const unique = [];
    combined.forEach(it => {
      const key = `${it.tipo}_${it.direccionNormalizada || it.label}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(it);
      }
    });

    return unique.slice(0, 8);
  } catch (err) {
    if (err.name === 'AbortError') return [];
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
  const str = String(comunaStr).trim();

  // 1. Extraer número explícito de Comuna (ej: "Comuna 14", "comuna 12", "14")
  const match = str.match(/\bcomuna\s*(\d{1,2})\b/i) || str.match(/\b(\d{1,2})\b/);
  if (match) {
    const num = parseInt(match[1], 10);
    if (num === 1) {
      if (/norte/i.test(str)) return CENTROS_COMUNAS['Comuna 1 Norte'];
      if (/sur/i.test(str)) return CENTROS_COMUNAS['Comuna 1 Sur'];
    }
    const key = `Comuna ${num}`;
    if (CENTROS_COMUNAS[key]) {
      return CENTROS_COMUNAS[key];
    }
  }

  // 2. Coincidencia exacta por nombre de clave
  for (const [key, coords] of Object.entries(CENTROS_COMUNAS)) {
    const regex = new RegExp(`\\b${key}\\b`, 'i');
    if (regex.test(str)) {
      return coords;
    }
  }

  return [-34.6037, -58.3816];
}
