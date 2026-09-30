import { useEffect, useState } from 'react'

export type FeedbackKind = 'ok' | 'ng' | 'done'

/** 正解・不正解・完走を盤の上に大きく出す（約0.9秒で消える） */
export function Feedback({ kind, seq }: { kind: FeedbackKind | null; seq: number }) {
  const [shown, setShown] = useState<{ kind: FeedbackKind; seq: number } | null>(null)
  const [prevSeq, setPrevSeq] = useState(seq)
  if (seq !== prevSeq) {
    setPrevSeq(seq)
    if (kind) setShown({ kind, seq })
  }
  useEffect(() => {
    if (!shown) return
    const t = window.setTimeout(() => setShown(null), shown.kind === 'done' ? 1400 : 900)
    return () => window.clearTimeout(t)
  }, [shown])
  if (!shown) return null
  return (
    <div className={`fb fb-${shown.kind}`} key={shown.seq} aria-live="polite">
      <div className="fb-ring" />
      <div className="fb-mark">{shown.kind === 'ok' ? '◯' : shown.kind === 'ng' ? '✕' : '完'}</div>
      {shown.kind === 'ok' && Array.from({ length: 8 }, (_, i) => <i key={i} className="fb-spark" style={{ ['--a' as string]: `${i * 45}deg` }} />)}
    </div>
  )
}

/** 連続正解などで使う、seq を増やしながら種類を渡すための小さなフック */
export function useFeedback() {
  const [fb, setFb] = useState<{ kind: FeedbackKind | null; seq: number }>({ kind: null, seq: 0 })
  const fire = (kind: FeedbackKind) => setFb((f) => ({ kind, seq: f.seq + 1 }))
  return { fb, fire }
}
