import { create } from 'zustand'

interface PipState {
  win: Window | null
  set: (w: Window | null) => void
}
export const usePip = create<PipState>((set) => ({ win: null, set: (win) => set({ win }) }))

declare global {
  interface Window {
    documentPictureInPicture?: { requestWindow: (o: { width: number; height: number }) => Promise<Window>; window: Window | null }
  }
}

export const pipSupported = () => typeof window !== 'undefined' && 'documentPictureInPicture' in window

function copyStyles(target: Window) {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const css = Array.from(sheet.cssRules).map((r) => r.cssText).join('\n')
      const style = target.document.createElement('style')
      style.textContent = css
      target.document.head.appendChild(style)
    } catch {
      if (sheet.href) {
        const link = target.document.createElement('link')
        link.rel = 'stylesheet'
        link.href = sheet.href
        target.document.head.appendChild(link)
      }
    }
  }
  target.document.documentElement.className = document.documentElement.className
  target.document.documentElement.dataset.accent = document.documentElement.dataset.accent
  target.document.title = 'Mini · Work Assistant'
}

/** Always-on-top mini window (Chrome/Edge). Falls back to a small popup. */
export async function openMini() {
  const { win, set } = usePip.getState()
  if (win) {
    win.focus()
    return
  }
  if (pipSupported()) {
    const w = await window.documentPictureInPicture!.requestWindow({ width: 340, height: 300 })
    copyStyles(w)
    w.document.body.style.margin = '0'
    w.addEventListener('pagehide', () => set(null))
    set(w)
    return
  }
  window.open(`${location.pathname}#/mini`, 'mwa-mini', 'popup,width=360,height=320')
}

export function closeMini() {
  usePip.getState().win?.close()
  usePip.getState().set(null)
}

/** keep PiP theme in sync with the main window */
if (typeof window !== 'undefined') {
  new MutationObserver(() => {
    const w = usePip.getState().win
    if (w) {
      w.document.documentElement.className = document.documentElement.className
      w.document.documentElement.dataset.accent = document.documentElement.dataset.accent
    }
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-accent'] })
}
