import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  handleLabel: string
  children: ReactNode
  /** ジェスチャーを拾う画面全体 */
  area: ReactNode
}

/**
 * 右から画面に重なって出てくるパネル。画面のどこでも左へスワイプで開き、右へスワイプで閉じる。
 * 指に追従し、離した位置と速さで開閉を決める。後ろの画面は動かない。
 */
export function SideDrawer({ open, onOpenChange, handleLabel, children, area }: Props) {
  const panelRef = useRef<HTMLElement>(null)
  const g = useRef<{ x: number; y: number; t: number; id: number; mode: 'none' | 'drag' | 'scroll'; width: number } | null>(null)
  const dragged = useRef(false)
  const [tx, setTxState] = useState<number | null>(null) // ドラッグ中の translateX(px)。null = 開閉状態に従う
  const txRef = useRef<number | null>(null)
  const setTx = (v: number | null) => { txRef.current = v; setTxState(v) }

  const width = () => panelRef.current?.getBoundingClientRect().width ?? 320

  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    g.current = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, mode: 'none', width: width() }
    dragged.current = false
  }

  const onMove = (e: React.PointerEvent) => {
    const s = g.current
    if (!s || s.id !== e.pointerId) return
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    if (s.mode === 'none') {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { s.mode = 'scroll'; return }
      // 閉じている時は左へ、開いている時は右へのスワイプだけを拾う
      const want = open ? dx > 10 : dx < -10
      if (want && Math.abs(dx) > Math.abs(dy) * 1.2) {
        s.mode = 'drag'
        dragged.current = true
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      } else return
    }
    if (s.mode !== 'drag') return
    const base = open ? 0 : s.width
    setTx(Math.min(s.width, Math.max(0, base + dx)))
  }

  const onUp = (e: React.PointerEvent) => {
    const s = g.current
    g.current = null
    const cur = txRef.current
    if (!s || s.mode !== 'drag' || cur === null) { setTx(null); return }
    const dx = e.clientX - s.x
    const v = dx / Math.max(1, performance.now() - s.t) // px/ms
    let next = cur < s.width / 2
    if (v < -0.5) next = true
    if (v > 0.5) next = false
    setTx(null)
    onOpenChange(next)
  }

  // ドラッグ直後のクリック（盤のマス等）を無効化
  const onClickCapture = (e: React.MouseEvent) => {
    if (dragged.current) {
      e.stopPropagation()
      e.preventDefault()
      dragged.current = false
    }
  }

  const close = useCallback(() => onOpenChange(false), [onOpenChange])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  const w = panelRef.current?.getBoundingClientRect().width ?? 320
  const progress = tx === null ? (open ? 1 : 0) : 1 - tx / w
  const transform = tx === null ? (open ? 'translateX(0)' : 'translateX(100%)') : `translateX(${tx}px)`

  return (
    <div
      className="drawer-area"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onClickCapture={onClickCapture}
    >
      {area}
      <div
        className="drawer-backdrop"
        style={{ opacity: progress * 0.45, pointerEvents: open ? 'auto' : 'none' }}
        onClick={close}
      />
      {!open && tx === null && (
        <div className="drawer-handle" onClick={() => onOpenChange(true)} aria-label={`${handleLabel}を開く`}>
          <span>{handleLabel}</span>
        </div>
      )}
      <aside
        ref={panelRef}
        className="drawer"
        style={{ transform, transition: tx === null ? 'transform .26s cubic-bezier(.2,.8,.2,1)' : 'none' }}
        aria-hidden={!open}
      >
        {children}
      </aside>
    </div>
  )
}
