import { useEffect, useRef, useState } from 'react'

const TRIGGER = 72

/** 押せる「‹」ボタン（画面左上の戻る）を探す */
export function backButton(): HTMLButtonElement | null {
  const btns = document.querySelectorAll<HTMLButtonElement>('header.bar > .btn.ghost')
  for (const b of btns) if (b.textContent?.trim().startsWith('‹') && b.offsetParent) return b
  return null
}

/** 他のものが開いていて、右スワイプをそちらに任せるべきとき */
function blocked(target: Element | null): boolean {
  if (document.querySelector('.sheet-backdrop, .tour')) return true
  if (document.querySelector('.sheets-area:not([data-open="none"])')) return true // ツリー・メモが開いている → それを閉じるだけ
  if (target?.closest('.hscroll, textarea, input, select, .tree-box')) return true
  return false
}

/**
 * 左から右へのスワイプで、画面左上の「‹」ボタンを押したことにする。
 * 指に合わせて左端に矢印を出し、十分引いたら色が変わる。
 */
export function SwipeBack() {
  const s = useRef<{ x: number; y: number; t: number; on: boolean | null } | null>(null)
  const [dx, setDx] = useState(0)

  useEffect(() => {
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1 || blocked(e.target as Element) || !backButton()) { s.current = null; return }
      const t = e.touches[0]
      s.current = { x: t.clientX, y: t.clientY, t: performance.now(), on: null }
    }
    const move = (e: TouchEvent) => {
      const g = s.current
      if (!g) return
      const t = e.touches[0]
      const x = t.clientX - g.x
      const y = t.clientY - g.y
      if (g.on === null) {
        if (Math.hypot(x, y) < 10) return
        g.on = x > 0 && Math.abs(x) > Math.abs(y) * 1.5
        if (!g.on) { s.current = null; return }
      }
      setDx(Math.max(0, x))
    }
    const end = (e: TouchEvent) => {
      const g = s.current
      s.current = null
      setDx(0)
      if (!g?.on) return
      const t = e.changedTouches[0]
      const x = t.clientX - g.x
      const y = t.clientY - g.y
      const fast = x > 40 && x / Math.max(1, performance.now() - g.t) > 0.6
      if ((x >= TRIGGER || fast) && Math.abs(y) < Math.max(60, x * 0.7)) backButton()?.click()
    }
    const cancel = () => { s.current = null; setDx(0) }
    window.addEventListener('touchstart', start, { passive: true })
    window.addEventListener('touchmove', move, { passive: true })
    window.addEventListener('touchend', end)
    window.addEventListener('touchcancel', cancel)
    return () => {
      window.removeEventListener('touchstart', start)
      window.removeEventListener('touchmove', move)
      window.removeEventListener('touchend', end)
      window.removeEventListener('touchcancel', cancel)
    }
  }, [])

  if (dx <= 0) return null
  const p = Math.min(1, dx / TRIGGER)
  return (
    <div className={`swipe-back ${p >= 1 ? 'ready' : ''}`} style={{ transform: `translateX(${-44 + p * 60}px)`, opacity: 0.3 + p * 0.7 }}>‹</div>
  )
}
