import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  base: '/my-work-assistant/',
  build: { chunkSizeWarningLimit: 1600 },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'My Work Assistant',
        short_name: 'Work Assistant',
        description: 'Trợ lý công việc cá nhân: AI tách task, lịch, habit, streak, Pomodoro',
        lang: 'vi',
        theme_color: '#7c3aed',
        background_color: '#0b0b10',
        display: 'standalone',
        start_url: '/my-work-assistant/',
        scope: '/my-work-assistant/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Nhập việc nhanh', short_name: 'Nhập việc', url: '/my-work-assistant/?action=capture', icons: [{ src: 'pwa-192.png', sizes: '192x192' }] },
          { name: 'Bắt đầu ngày', short_name: 'Sáng', url: '/my-work-assistant/?action=morning', icons: [{ src: 'pwa-192.png', sizes: '192x192' }] },
          { name: 'Tổng kết ngày', short_name: 'Tối', url: '/my-work-assistant/?action=evening', icons: [{ src: 'pwa-192.png', sizes: '192x192' }] },
          { name: 'Tập trung', short_name: 'Tập trung', url: '/my-work-assistant/?action=focus', icons: [{ src: 'pwa-192.png', sizes: '192x192' }] },
        ],
        share_target: { action: '/my-work-assistant/', method: 'GET', params: { title: 'title', text: 'text', url: 'url' } },
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        importScripts: ['sw-notify.js'],
      },
    }),
  ],
})
