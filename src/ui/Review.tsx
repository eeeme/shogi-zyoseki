import { useEffect, useMemo, useRef, useState } from 'react'
import { Tour } from './Tour'
import { type Move, moveToUsi, usiToMove } from '../shogi/core'
import { moveToJa } from '../shogi/notation'
import { type Book, depthOf, findChild, positionAt } from '../book/book'
import { type DueItem, grade, pickWeighted, turnAt, weights } from '../book/srs'
import { Board } from './Board'
import { Feedback, useFeedback } from './Feedback'

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

/**
 * 復習：復習日が来た局面から始めて、その変化を最後まで通して指す。
 * 相手の手は自動（要復習の多い変化を優先）、自分の手番はすべて出題。
 */
export function Review({ books, items, onChange, onBack }: Props) {
  const [queue, setQueue] = useState<DueItem[]>(items)
  const [qi, setQi] = useState(0)
  const [nodeId, setNodeId] = useState(items[0]?.nodeId ?? '')
  const [wrong, setWrong] = useState(false)
  const [hint, setHint] = useState<Move | null>(null)
  const [msg, setMsg] = useState('')
  const [lineDone, setLineDone] = useState(false)
  const [tally, setTally] = useState({ ok: 0, ng: 0, lines: 0 })
  const graded = useRef(new Set<string>()) // この回で採点済みの局面
  const { fb, fire } = useFeedback()

  const item = queue[qi]
  const book = item ? books.find((b) => b.id === item.bookId) : undefined
  const node = book?.nodes[nodeId]
  const side = book && item ? turnAt(book, item.nodeId) : 0
  const st = useMemo(() => (book && node ? positionAt(book, node.id) : null), [book, node])
  const last = node?.move ? usiToMove(node.move) : null
  const myTurn = book && node ? turnAt(book, node.id) === side : false
  const w = useMemo(() => (book ? weights(book, side as 0 | 1) : new Map()), [book, side, qi])

  // 相手番は自動で指す／末端に来たら完走
  useEffect(() => {
    if (!book || !node || lineDone) return
    if (node.children.length === 0) {
      setLineDone(true)
      setTally((t) => ({ ...t, lines: t.lines + 1 }))
      fire('done')
      return
    }
    if (!myTurn) {
      const t = window.setTimeout(() => {
        setMsg('')
        setNodeId(pickWeighted(node.children, w))
      }, 650)
      return () => window.clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, node, myTurn, lineDone])

  const record = (ok: boolean) => {
    if (!book || !node || graded.current.has(`${book.id}:${node.id}`)) return null
    graded.current.add(`${book.id}:${node.id}`)
    book.srs[node.id] = grade(book.srs[node.id], ok)
    onChange(book)
    return book.srs[node.id].due
  }

  const onMove = (m: Move) => {
    if (!book || !node || !st || !myTurn || lineDone) return
    const hit = findChild(book, node.id, moveToUsi(m))
    if (hit) {
      if (!wrong && !hint) {
        const due = record(true)
        setTally((t) => ({ ...t, ok: t.ok + 1 }))
        setMsg(due ? `正解　次は${nextLabel(due)}` : '正解')
        fire('ok')
      } else {
        setMsg('正解')
      }
      setWrong(false)
      setHint(null)
      setNodeId(hit)
      return
    }
    if (!wrong && !hint) {
      record(false)
      setTally((t) => ({ ...t, ng: t.ng + 1 }))
      setQueue((q) => [...q, { bookId: book.id, nodeId: node.id, due: 0 }]) // この回の最後にもう一度
    }
    setWrong(true)
    setMsg(`${moveToJa(st.pos, m, st.prevTo)} ではありません`)
    fire('ng')
  }

  const showAnswer = () => {
    if (!book || !node || !st) return
    if (!wrong && !hint) {
      record(false)
      setTally((t) => ({ ...t, ng: t.ng + 1 }))
      setQueue((q) => [...q, { bookId: book.id, nodeId: node.id, due: 0 }])
    }
    setHint(usiToMove(book.nodes[node.children[0]].move!))
    setMsg(`正解は ${node.children.map((c) => moveToJa(st.pos, usiToMove(book.nodes[c].move!), st.prevTo)).join(' / ')}`)
  }

  const nextLine = () => {
    // この回で既に通った局面から始まる問題は飛ばす（間違えて戻した分は出す）
    let i = qi + 1
    while (i < queue.length && queue[i].due !== 0 && graded.current.has(`${queue[i].bookId}:${queue[i].nodeId}`)) i++
    setQi(i)
    setNodeId(queue[i]?.nodeId ?? '')
    setWrong(false)
    setHint(null)
    setMsg('')
    setLineDone(false)
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
          <p className="tally">◯{tally.ok}　✕{tally.ng}　{tally.lines}変化</p>
          <button className="btn primary wide" onClick={onBack}>一覧へ</button>
        </section>
      </div>
    )
  }

  const remaining = queue.length - qi

  return (
    <div className="screen fit">
      <header className="bar">
        <button className="btn ghost" onClick={onBack}>‹ 終了</button>
        <h1 className="bar-title">復習 <small>残り{remaining}</small></h1>
        <span className="tally">◯{tally.ok} ✕{tally.ng}</span>
      </header>
      <p className="review-book muted">{book.name}　{depthOf(book, node.id)}手目</p>
      <div className="stage">
        <div className="board-fb">
          <Board
            key={`${item.bookId}-${qi}`}
            pos={st.pos}
            flipped={side === 1}
            lastTo={last?.to ?? null}
            lastFrom={last?.from ?? null}
            hint={hint}
            interactive={myTurn && !lineDone}
            onMove={onMove}
          />
          <Feedback kind={fb.kind} seq={fb.seq} />
        </div>
      </div>
      <Tour
        id="review"
        steps={[
          { title: '今日の復習', text: '忘れかけた局面から始めて、その変化を最後まで通して指します。相手の手は自動、あなたの番はすべて出題です。' },
          { sel: '.board', title: '正解すると間隔が伸びる', text: '正解した局面は次の復習日が先に伸び、間違えた局面はこの回の最後にもう一度出ます。' },
        ]}
      />
      <section className="panel drill-status">
        <p className={`msg ${wrong ? 'bad' : msg.startsWith('正解') ? 'good' : ''}`}>
          {lineDone ? 'この変化を最後まで指しました' : msg || (myTurn ? `${side === 0 ? '☗' : '☖'}の番です` : '相手が指します…')}
        </p>
        {lineDone
          ? <button className="btn primary wide" onClick={nextLine}>{remaining > 1 ? '次の変化へ' : '終わる'}</button>
          : myTurn && <button className="btn" onClick={showAnswer}>答え</button>}
      </section>
    </div>
  )
}
