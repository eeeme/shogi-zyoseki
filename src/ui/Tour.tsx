import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export interface TourStep {
  /** 光らせる要素（CSSセレクタ）。見つからない手順は飛ばす。省略時は画面中央に説明だけ出す */
  sel?: string
  title: string
  text: string
}

const KEY = (id: string) => `zyoseki.tour.${id}`
const seen = (id: string) => {
  try { return localStorage.getItem(KEY(id)) === '1' } catch { return true }
}
const markSeen = (id: string) => {
  try { localStorage.setItem(KEY(id), '1') } catch { /* noop */ }
}

/** すべての案内をもう一度出すようにする */
export function resetTours() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('zyoseki.tour.')) localStorage.removeItem(k)
  } catch { /* noop */ }
}

interface Rect { x: number; y: number; w: number; h: number }

/**
 * 初めてその画面を開いた時だけ出る案内。
 * 画面を暗くして説明する部品だけを光らせ、タップで次へ進む。
 */
export function Tour({ id, steps, when = true }: { id: string; steps: TourStep[]; when?: boolean }) {
  const [active, setActive] = useState(false)
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)

  // 画面の描画が落ち着いてから開始
  useEffect(() => {
    if (!when || seen(id)) return
    const t = window.setTimeout(() => setActive(true), 450)
    return () => window.clearTimeout(t)
  }, [id, when])

  const visible = steps.filter((s) => !s.sel || document.querySelector(s.sel))
  const step = active ? visible[i] : undefined

  const measure = useCallback(() => {
    if (!step?.sel) return setRect(null)
    const el = document.querySelector(step.sel) as HTMLElement | null
    if (!el) return setRect(null)
    const r = el.getBoundingClientRect()
    setRect({ x: r.left, y: r.top, w: r.width, h: r.height })
  }, [step])

  useLayoutEffect(() => {
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure])

  const finish = () => {
    markSeen(id)
    setActive(false)
  }
  const next = () => (i + 1 < visible.length ? setI(i + 1) : finish())

  if (!active || !step) return null

  const pad = 6
  const vh = window.innerHeight
  // 光らせる部品が画面の上半分なら説明は下に、下半分なら上に
  const below = rect ? rect.y + rect.h / 2 < vh / 2 : true
  const bubbleStyle: React.CSSProperties = rect
    ? below
      ? { top: Math.min(rect.y + rect.h + pad + 14, vh - 200) }
      : { bottom: Math.min(vh - rect.y + pad + 14, vh - 200) }
    : { top: '50%', transform: 'translateY(-50%)' }

  return createPortal(
    <div
      className="tour"
      onClick={(e) => { e.stopPropagation(); next() }}
      onPointerDown={(e) => e.stopPropagation()}
      role="dialog"
      aria-label={step.title}
    >
      {rect ? (
        <div className="tour-hole" style={{ left: rect.x - pad, top: rect.y - pad, width: rect.w + pad * 2, height: rect.h + pad * 2 }} />
      ) : (
        <div className="tour-dim" />
      )}
      <div className="tour-bubble" style={bubbleStyle} key={i}>
        <p className="tour-title">{step.title}</p>
        <p className="tour-text">{step.text}</p>
        <div className="tour-foot">
          <span className="tour-count">{i + 1} / {visible.length}</span>
          <button className="tour-skip" onClick={(e) => { e.stopPropagation(); finish() }}>スキップ</button>
          <span className="tour-next">{i + 1 < visible.length ? 'タップで次へ' : 'タップで始める'}</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
