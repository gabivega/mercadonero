import { createSlice } from '@reduxjs/toolkit'

const initialTheme = (() => {
  try {
    const saved = localStorage.getItem('theme')
    return saved || 'dark'
  } catch (e) {
    return 'dark'
  }
})()

const themeSlice = createSlice({
  name: 'theme',
  initialState: { mode: initialTheme },
  reducers: {
    toggleTheme(state) {
      state.mode = state.mode === 'light' ? 'dark' : 'light'
      try {
        localStorage.setItem('theme', state.mode)
      } catch (e) {}
    },
    setTheme(state, action) {
      state.mode = action.payload
      try {
        localStorage.setItem('theme', state.mode)
      } catch (e) {}
    },
  },
})

export const { toggleTheme, setTheme } = themeSlice.actions
export default themeSlice.reducer
