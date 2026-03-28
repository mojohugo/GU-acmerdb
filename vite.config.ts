import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages project path, e.g. https://<user>.github.io/GU-acmerdb/
const repoName = 'GU-acmerdb'

export default defineConfig({
  plugins: [react()],
  base: process.env.NODE_ENV === 'production' ? `/${repoName}/` : '/',
})
