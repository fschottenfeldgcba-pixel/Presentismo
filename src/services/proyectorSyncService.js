/**
 * Servicio de sincronización en tiempo real para la Segunda Pantalla / Proyector
 * Soporta:
 * 1. BroadcastChannel API (comunicación instantánea local entre pestañas en <1ms)
 * 2. Fallback de localStorage (eventos de almacenamiento cross-window)
 */

const CHANNEL_NAME = 'presentismo_proyector_sync';

export const PROYECTOR_EVENTS = {
  SPEAKER_CALL: 'SPEAKER_CALL',
  SPEAKER_CLEARED: 'SPEAKER_CLEARED',
  TIMER_TICK: 'TIMER_TICK',
  QUEUE_UPDATE: 'QUEUE_UPDATE',
  TAGS_UPDATE: 'TAGS_UPDATE',
  DEVOLUCION_START: 'DEVOLUCION_START',
  DEVOLUCION_CLEAR: 'DEVOLUCION_CLEAR'
};

let broadcastChannel = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
  }
} catch (e) {
  console.warn('BroadcastChannel no soportado o bloqueado:', e);
}

/**
 * Emite un evento desde el panel de moderación hacia la segunda pantalla
 * Soporta firmas: emitProyectorEvent(type, { reunionId, ... }) o emitProyectorEvent(reunionId, eventData)
 */
export function emitProyectorEvent(arg1, arg2) {
  let reunionId = null;
  let eventData = {};

  if (typeof arg1 === 'string' && (arg1.startsWith('SPEAKER_') || arg1.startsWith('TIMER_') || arg1.startsWith('QUEUE_') || arg1.startsWith('TAGS_') || arg1.startsWith('ACTIVE_') || arg1.startsWith('DEVOLUCION_'))) {
    const type = arg1;
    eventData = { type, ...(arg2 || {}) };
    reunionId = eventData.reunionId;
  } else {
    reunionId = arg1;
    eventData = arg2 || {};
  }

  if (!reunionId) return;

  const payload = {
    ...eventData,
    reunionId: String(reunionId),
    _timestamp: Date.now()
  };

  // 1. BroadcastChannel para sincronización inmediata
  if (broadcastChannel) {
    try {
      broadcastChannel.postMessage(payload);
    } catch (err) {
      console.warn('Error enviando por BroadcastChannel:', err);
    }
  }

  // 2. LocalStorage para persistencia y eventos cross-window
  try {
    localStorage.setItem(`presentismo_proyector_${reunionId}`, JSON.stringify(payload));
  } catch (err) {
    // ignorar quota o restricción
  }
}

/**
 * Suscribe a la segunda pantalla a los eventos emitidos por el moderador
 */
export function subscribeProyector(reunionId, onEvent) {
  if (!reunionId || !onEvent) return () => {};

  const targetId = String(reunionId);

  // 1. Handler para BroadcastChannel
  const handleBroadcast = (event) => {
    if (event?.data && String(event.data.reunionId) === targetId) {
      onEvent(event.data);
    }
  };

  if (broadcastChannel) {
    broadcastChannel.addEventListener('message', handleBroadcast);
  }

  // 2. Handler para storage events (fallback)
  const handleStorage = (event) => {
    if (event.key === `presentismo_proyector_${targetId}` && event.newValue) {
      try {
        const parsed = JSON.parse(event.newValue);
        onEvent(parsed);
      } catch (e) {
        // ignorar json inválido
      }
    }
  };

  window.addEventListener('storage', handleStorage);

  // Retornar función de limpieza
  return () => {
    if (broadcastChannel) {
      broadcastChannel.removeEventListener('message', handleBroadcast);
    }
    window.removeEventListener('storage', handleStorage);
  };
}

/**
 * Obtiene el último estado emitido guardado en localStorage (para inicializar inmediatamente)
 */
export function getLastProyectorState(reunionId) {
  if (!reunionId) return null;
  try {
    const raw = localStorage.getItem(`presentismo_proyector_${reunionId}`);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}
