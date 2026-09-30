import { type ReactNode, useEffect, useRef, useState } from 'react'

export type SheetOpen = 'none' | 'tree' | 'memo'

interface Props {
  open: SheetOpen
  onOpenChange: (v: SheetOpen) => void
  area: ReactNode
  tree: ReactNode
  memo: ReactNode
  memoFilled: boolean
}

type Mode = 'none' | 'tree' | 'memo' | 'ignore'

/**
 * 画面に重なる2枚のパネル。
 *  - ツリー：左へスワイプで右から出る／右へスワイプで閉じる
 *  - メモ：上へスワイプで下から出る／下へスワイプで閉じる
 *  - 何も開いていないときの右スワイプは「戻る」（SwipeBack）
 * どちらかが開いている間は、もう片方は開かない。後ろの画面は動かない。
 */
export function Sheets({ open, onOpenChange, area, tree, memo, memoFilled }: Props) {
  const treeRef = useRef<HTMLElement>(null)
  const memoRef = useRef<HTMLElement>(null)
  const g = useRef<{ x: number; y: number; t: number; id: number; mode: Mode; size: number } | null>(null)
  const dragged = useRef(false)
  const [off, setOffState] = useState<{ which: 'tree' | 'memo'; px: number } | null>(null)
  const offRef = useRef<typeof off>(null)
  const setOff = (v: typeof off) => { offRef.current = v; setOffState(v) }

  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    g.current = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, mode: 'none', size: 0 }
    dragged.current = false
  }

  const onMove = (e: React.PointerEvent) => {
    const s = g.current
    if (!s || s.id !== e.pointerId || s.mode === 'ignore') return
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    if (s.mode === 'none') {
      if (Math.hypot(dx, dy) < 10) return
      const horiz = Math.abs(dx) > Math.abs(dy) * 1.2
      const vert = Math.abs(dy) > Math.abs(dx) * 1.2
      let m: Mode = 'ignore'
      // 横スクロールする行（次の手など）の上での横の動きは、その行のスクロールに任せる
      if (horiz && (e.target as HTMLElement).closest('.hscroll')) { s.mode = 'ignore'; return }
      if (open === 'none') {
        // 右へのスワイプは「戻る」（SwipeBack が処理）
        m = horiz && dx < 0 ? 'tree' : vert && dy < 0 ? 'memo' : 'ignore'
      }
      else if (open === 'tree') m = horiz && dx > 0 ? 'tree' : 'ignore'
      else if (open === 'memo') m = vert && dy > 0 && !(e.target as HTMLElement).closest('textarea:focus') ? 'memo' : 'ignore'
      s.mode = m
      if (m === 'ignore') return
      s.size = (m === 'tree' ? treeRef.current?.getBoundingClientRect().width : memoRef.current?.getBoundingClientRect().height) ?? 320
      dragged.current = true
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    }
    if (s.mode === 'tree') {
      const base = open === 'tree' ? 0 : s.size
      setOff({ which: 'tree', px: Math.min(s.size, Math.max(0, base + dx)) })
    } else if (s.mode === 'memo') {
      const base = open === 'memo' ? 0 : s.size
      setOff({ which: 'memo', px: Math.min(s.size, Math.max(0, base + dy)) })
    }
  }

  const onUp = (e: React.PointerEvent) => {
    const s = g.current
    g.current = null
    const cur = offRef.current
    if (!s || (s.mode !== 'tree' && s.mode !== 'memo') || !cur) { setOff(null); return }
    const d = s.mode === 'tree' ? e.clientX - s.x : e.clientY - s.y
    const v = d / Math.max(1, performance.now() - s.t)
    // 4分の1以上動かせば、開く／閉じる方向に確定させる
    let show = open === s.mode ? cur.px < s.size * 0.25 : cur.px < s.size * 0.75
    if (v < -0.5) show = true
    if (v > 0.5) show = false
    setOff(null)
    onOpenChange(show ? s.mode : 'none')
  }

  const onClickCapture = (e: React.MouseEvent) => {
    if (dragged.current) {
      e.stopPropagation()
      e.preventDefault()
      dragged.current = false
    }
  }

  // 閉じたら入力中のメモを確定させる
  useEffect(() => {
    if (open !== 'memo') (document.activeElement as HTMLElement | null)?.blur?.()
  }, [open])

  useEffect(() => {
    if (open === 'none') return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onOpenChange('none')
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  const style = (which: 'tree' | 'memo') => {
    const axis = which === 'tree' ? 'X' : 'Y'
    const dragging = off?.which === which
    const transform = dragging ? `translate${axis}(${off!.px}px)` : open === which ? `translate${axis}(0)` : `translate${axis}(100%)`
    return { transform, transition: dragging ? 'none' : 'transform .26s cubic-bezier(.2,.8,.2,1)' }
  }
  const progress = (() => {
    if (off) {
      const el = off.which === 'tree' ? treeRef.current : memoRef.current
      const size = (off.which === 'tree' ? el?.getBoundingClientRect().width : el?.getBoundingClientRect().height) ?? 320
      return 1 - off.px / size
    }
    return open === 'none' ? 0 : 1
  })()

  return (
    <div className="sheets-area" data-open={open} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onClickCapture={onClickCapture}>
      {area}
      <div className="drawer-backdrop" style={{ opacity: progress * 0.45, pointerEvents: open !== 'none' ? 'auto' : 'none' }} onClick={() => onOpenChange('none')} />
      {open === 'none' && !off && (
        <>
          <div className="drawer-handle" onClick={() => onOpenChange('tree')} aria-label="ツリーを開く"><span>ツリー</span></div>
          <div className={`memo-handle ${memoFilled ? 'filled' : ''}`} onClick={() => onOpenChange('memo')} aria-label="メモを開く">
            <i />メモ
          </div>
        </>
      )}
      <aside ref={treeRef} className="drawer" style={style('tree')} aria-hidden={open !== 'tree'}>{tree}</aside>
      <aside ref={memoRef} className="memo-sheet" style={style('memo')} aria-hidden={open !== 'memo'}>{memo}</aside>
    </div>
  )
}
