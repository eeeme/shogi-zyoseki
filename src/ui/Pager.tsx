import { type ReactNode, useEffect, useRef, useState } from 'react'

interface Props {
  labels: string[]
  children: ReactNode[]
  storageKey?: string
}

/** 横スワイプで切り替えるページ（CSS scroll-snap。指の動きにそのまま追従する） */
export function Pager({ labels, children, storageKey }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(() => {
    try { return Number(localStorage.getItem(storageKey ?? '') ?? 0) || 0 } catch { return 0 }
  })

  // 初期ページへ移動（アニメなし）
  useEffect(() => {
    const el = ref.current
    if (el) el.scrollLeft = page * el.clientWidth
    // 初回だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onScroll = () => {
    const el = ref.current
    if (!el) return
    const p = Math.round(el.scrollLeft / el.clientWidth)
    if (p !== page) {
      setPage(p)
      try { if (storageKey) localStorage.setItem(storageKey, String(p)) } catch { /* noop */ }
    }
  }

  const go = (i: number) => ref.current?.scrollTo({ left: i * ref.current.clientWidth, behavior: 'smooth' })

  return (
    <div className="pager">
      <div className="pager-dots" role="tablist">
        {labels.map((l, i) => (
          <span key={l} role="tab" aria-selected={i === page} className={i === page ? 'on' : ''} onClick={() => go(i)}>
            {l}
          </span>
        ))}
      </div>
      <div className="pager-track" ref={ref} onScroll={onScroll}>
        {children.map((c, i) => (
          <div className="pager-page" key={labels[i]} aria-hidden={i !== page}>{c}</div>
        ))}
      </div>
    </div>
  )
}
