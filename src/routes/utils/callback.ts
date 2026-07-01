/** Human-friendly text for the callback error page, keyed by failure reason. */
export const REASON_TEXT: Record<string, string> = {
  access_denied: 'Cancelaste el permiso en Google.',
  invalid_state: 'La sesión de conexión expiró. Vuelve a intentarlo.',
  state_mismatch: 'La sesión de conexión no es válida. Vuelve a intentarlo.',
  provider_unavailable: 'Ese proveedor no está disponible todavía.',
  redirect_not_configured: 'Falta configuración del servidor (redirect URI).',
  invalid_callback: 'La respuesta del proveedor no es válida.',
  oauth_failed: 'No se pudo completar la conexión. Vuelve a intentarlo.',
}
