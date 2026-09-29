import { useMemo, useState } from 'react'
import { type Move, moveToUsi, usiToMove } from '../shogi/core'
import { moveToJa } from '../shogi/notation'
import { type Book, findChild, positionAt } from '../book/book'
import { type DueItem, grade, turnAt } from '../book/srs'
import { Board } from './Board'

interface Props {
  books: Book[]
  items: DueItem[]
  onChange: (b: Book) => void
  onBack: () => void
}

const DAY = 86400000
const nextLabel = (due: number) => {
  const d = Math.round((due - Date.now()) / DAY)
  return d <= 0 ? '10分後' : `${d}日後`
}

/** 復習日が来た局面だけを1問ずつ出す。間違えた局面はこの回の最後にもう一度出す */
export function Review({ books, items, onChange, onBack }: Props) {
  const [queue, setQueue] = useState<DueItem[]>(items)
  const [i, setI] = useState(0)
  const [wrong, setWrong] = useState(false)
  const [hint, setHint] = useState<Move | null>(null)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [tally, setTally] = useState({ ok: 0, ng: 0 })

  const item = queue[i]
  const book = item ? books.find((b) => b.id === item.bookId) : undefined
  const node = book && item ? book.nodes[item.nodeId] : undefined
  const st = useMemo(() => (book && node ? positionAt(book, node.id) : null), [book, node])
  const last = node?.move ? usiToMove(node.move) : null

  const answer = (ok: boolean) => {
    if (!book || !node) return
    book.srs[node.id] = grade(book.srs[node.id], ok)
    onChange(book)
    return book.srs[node.id].due
  }

  const next = () => {
    setWrong(false)
    setHint(null)
    setResult(null)
    setI((n) => n + 1)
  }

  const onMove = (m: Move) => {
    if (!book || !node || !st || result) return
    const hit = findChild(book, node.id, moveToUsi(m))
    if (hit) {
      const first = !wrong && !hint
      if (first) {
        const due = answer(true)!
        setTally((t) => ({ ...t, ok: t.ok + 1 }))
        setResult({ ok: true, text: `正解　次は${nextLabel(due)}` })
      } else {
        setResult({ ok: true, text: 'もう一度出ます' })
      }
      window.setTimeout(next, 900)
      return
    }
    if (!wrong && !hint) {
      answer(false)
      setTally((t) => ({ ...t, ng: t.ng + 1 }))
      setQueue((q) => [...q, item])
    }
    setWrong(true)
  }

  const showAnswer = () => {
    if (!book || !node || !st) return
    if (!wrong && !hint) {
      answer(false)
      setTally((t) => ({ ...t, ng: t.ng + 1 }))
      setQueue((q) => [...q, item])
    }
    setHint(usiToMove(book.nodes[node.children[0]].move!))
  }

  if (!item || !book || !node || !st) {
    return (
      <div className="screen">
        <header className="bar">
          <button className="btn ghost" onClick={onBack}>‹ 一覧</button>
          <h1 className="bar-title">復習</h1>
          <span />
        </header>
        <section className="panel review-done">
          <p className="big">完了</p>
          <p className="tally">○{tally.ok}　×{tally.ng}</p>
          <button className="btn primary wide" onClick={onBack}>一覧へ</button>
        </section>
      </div>
    )
  }

  const side = turnAt(book, node.id)
  const answers = node.children.map((c) => moveToJa(st.pos, usiToMove(book.nodes[c].move!), st.prevTo))

  return (
    <div className="screen">
      <header className="bar">
        <button className="btn ghost" onClick={onBack}>‹ 終了</button>
        <h1 className="bar-title">復習 <small>{i + 1} / {queue.length}</small></h1>
        <span className="tally">○{tally.ok} ×{tally.ng}</span>
      </header>
      <p className="review-book muted">{book.name}</p>
      <Board
        key={`${item.bookId}-${item.nodeId}-${i}`}
        pos={st.pos}
        flipped={side === 1}
        lastTo={last?.to ?? null}
        lastFrom={last?.from ?? null}
        hint={hint}
        interactive={!result}
        onMove={onMove}
      />
      <section className="panel drill-status">
        <p className={`msg ${result?.ok ? 'good' : wrong ? 'bad' : ''}`}>
          {result ? result.text : hint ? answers.join(' / ') : wrong ? '違います' : `${side === 0 ? '☗' : '☖'}の番`}
        </p>
        {!result && (hint
          ? <button className="btn primary" onClick={next}>次へ</button>
          : <button className="btn" onClick={showAnswer}>答え</button>)}
      </section>
    </div>
  )
}
