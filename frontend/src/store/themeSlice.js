import { createSlice } from '@reduxjs/toolkit'

// ⚠️ Light theme DESHABILITADO temporalmente. Solo queda dark.
// Toda la infraestructura se conserva para reactivarlo en el futuro
// (cuando un diseñador encare el tema claro). Mientras tanto:
//  - Siempre arranca en dark.
//  - NO recuerda la preferencia del usuario.
const FORCED_THEME = 'dark'

const initialTheme = (() => {
  try {
    // Ignoramos cualquier preferencia guardada y forzamos dark.
    // Limpiamos el valor viejo para que no quede un "light" colgado.
    localStorage.setItem('theme', FORCED_THEME)
  } catch (e) {}
  return FORCED_THEME
})()

const themeSlice = createSlice({
  name: 'theme',
  initialState: { mode: initialTheme },
  reducers: {
    // No-op mientras el light esté deshabilitado: el modo queda fijo en dark.
    toggleTheme(state) {
      state.mode = FORCED_THEME
    },
    setTheme(state) {
      state.mode = FORCED_THEME
    },
  },
})

export const { toggleTheme, setTheme } = themeSlice.actions
export default themeSlice.reducer

