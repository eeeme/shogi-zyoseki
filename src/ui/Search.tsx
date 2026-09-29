import { useMemo } from 'react'
import { parseSfen, usiToMove } from '../shogi/core'
import { moveToJa } from '../shogi/notation'
import { type Book, positionAt } from '../book/book'
import { type Hit, searchPositions } from '../book/search'
import { MiniBoard } from './MiniBoard'

interface Props {
  books: Book[]
  sfen: string
  exclude?: { bookId: string; nodeId: string }
  onOpen: (bookId: string, nodeId: string, exact: boolean) => void
  onEditQuery: () => void
  onBack: () => void
}

export function Search({ books, sfen, exclude, onOpen, onEditQuery, onBack }: Props) {
  const { exact, similar } = useMemo(() => {
    const r = searchPositions(books, parseSfen(sfen))
    // 検索元の棋譜は結果に出さない
    const keep = (h: Hit) => !(exclude && h.bookId === exclude.bookId)
    return { exact: r.exact.filter(keep), similar: r.similar.filter(keep) }
  }, [books, sfen, exclude])

  const row = (h: Hit) => {
    const book = books.find((b) => b.id === h.bookId)!
    const node = book.nodes[h.nodeId]
    let label = '開始局面'
    if (node.move && node.parent) {
      const st = positionAt(book, node.parent)
      label = moveToJa(st.pos, usiToMove(node.move), st.prevTo)
    }
    const players = book.meta?.sente || book.meta?.gote ? `☗${book.meta?.sente ?? ''} ☖${book.meta?.gote ?? ''}` : ''
    return (
      <li key={`${h.bookId}-${h.nodeId}`}>
        <button className="hit" onClick={() => onOpen(h.bookId, h.nodeId, h.score === 1)}>
          <MiniBoard sfen={h.sfen} />
          <span className="hit-info">
            <span className="hit-title">{book.name}</span>
            {players && <span className="hit-sub">{players}</span>}
            <span className="hit-sub">{h.ply}手目　{label}</span>
            <span className={`hit-score ${h.score === 1 ? 'exact' : ''}`}>{h.score === 1 ? '一致' : `${Math.round(h.score * 100)}%`}</span>
          </span>
        </button>
      </li>
    )
  }

  return (
    <div className="screen">
      <header className="bar">
        <button className="btn ghost" onClick={onBack}>‹ 戻る</button>
        <h1 className="bar-title">局面検索</h1>
        <span />
      </header>
      <button className="query" onClick={onEditQuery} aria-label="検索する局面を並べ直す">
        <MiniBoard sfen={sfen} size={150} />
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z M14 6l4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" /></svg>
      </button>

      {exact.length > 0 && (
        <>
          <h2 className="sec">一致 {exact.length}</h2>
          <ul className="hits">{exact.map(row)}</ul>
        </>
      )}
      {similar.length > 0 && (
        <>
          <h2 className="sec">似た局面</h2>
          <ul className="hits">{similar.map(row)}</ul>
        </>
      )}
      {exact.length === 0 && similar.length === 0 && <p className="muted center-text">見つかりません</p>}
    </div>
  )
}
