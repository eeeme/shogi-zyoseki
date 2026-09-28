import { useCallback, useEffect, useState } from 'react'
import { type Book, mergeImport, newBook } from './book/book'
import { deleteBook, loadBooks, markSampleInstalled, sampleInstalled, saveBook } from './book/storage'
import { bookStats } from './book/srs'
import { SAMPLE_KIF, SAMPLE_NAME } from './book/sample'
import { parseKifu } from './kifu/parse'
import { Explore } from './ui/Explore'
import { Drill } from './ui/Drill'
import { Import } from './ui/Import'

type Screen =
  | { kind: 'home' }
  | { kind: 'explore'; bookId: string; nodeId: string }
  | { kind: 'drill'; bookId: string; nodeId: string }
  | { kind: 'import'; target?: string; back: Screen }

export default function App() {
  const [books, setBooks] = useState<Book[] | null>(null)
  const [screen, setScreen] = useState<Screen>({ kind: 'home' })
  const [rev, setRev] = useState(0)
  const [toastMsg, setToastMsg] = useState('')

  useEffect(() => {
    ;(async () => {
      let list = await loadBooks()
      if (list.length === 0 && !sampleInstalled()) {
        const b = newBook(SAMPLE_NAME)
        mergeImport(b, parseKifu(SAMPLE_KIF))
        await saveBook(b)
        markSampleInstalled()
        list = [b]
      }
      setBooks(list)
    })()
  }, [])

  const toast = useCallback((s: string) => {
    setToastMsg(s)
    window.setTimeout(() => setToastMsg(''), 2600)
  }, [])

  const touch = useCallback((b: Book) => {
    saveBook(b)
    setRev((r) => r + 1)
    setBooks((bs) => (bs ? [b, ...bs.filter((x) => x.id !== b.id)] : [b]))
  }, [])

  if (!books) return <div className="screen center muted">読み込み中…</div>

  const bookOf = (id: string) => books.find((b) => b.id === id)

  let body: React.ReactNode
  if (screen.kind === 'explore' && bookOf(screen.bookId)) {
    const book = bookOf(screen.bookId)!
    body = (
      <Explore
        book={book}
        rev={rev}
        nodeId={book.nodes[screen.nodeId] ? screen.nodeId : book.rootId}
        setNodeId={(id) => setScreen({ ...screen, nodeId: id })}
        onChange={() => touch(book)}
        onBack={() => setScreen({ kind: 'home' })}
        onDrill={(nodeId) => setScreen({ kind: 'drill', bookId: book.id, nodeId })}
        onImport={() => setScreen({ kind: 'import', target: book.id, back: screen })}
        toast={toast}
      />
    )
  } else if (screen.kind === 'drill' && bookOf(screen.bookId)) {
    const book = bookOf(screen.bookId)!
    body = (
      <Drill
        key={`${book.id}-${screen.nodeId}`}
        book={book}
        startNode={screen.nodeId}
        onChange={() => touch(book)}
        onBack={() => setScreen({ kind: 'explore', bookId: book.id, nodeId: screen.nodeId })}
      />
    )
  } else if (screen.kind === 'import') {
    body = (
      <Import
        books={books}
        initialTarget={screen.target}
        onCreate={(b) => touch(b)}
        onChange={(b) => touch(b)}
        onOpen={(bookId, nodeId) => setScreen({ kind: 'explore', bookId, nodeId })}
        onBack={() => setScreen(screen.back)}
      />
    )
  } else {
    body = (
      <Home
        books={books}
        onOpen={(b) => setScreen({ kind: 'explore', bookId: b.id, nodeId: b.rootId })}
        onDrill={(b) => setScreen({ kind: 'drill', bookId: b.id, nodeId: b.rootId })}
        onNew={() => {
          const name = prompt('本の名前', '新しい定跡')
          if (!name?.trim()) return
          const b = newBook(name.trim())
          touch(b)
          setScreen({ kind: 'explore', bookId: b.id, nodeId: b.rootId })
          toast('「編集」をオンにして盤で指すと手が登録されます')
        }}
        onImport={() => setScreen({ kind: 'import', back: { kind: 'home' } })}
        onDelete={async (b) => {
          if (!confirm(`「${b.name}」を削除しますか？（元に戻せません）`)) return
          await deleteBook(b.id)
          setBooks(books.filter((x) => x.id !== b.id))
        }}
      />
    )
  }

  return (
    <>
      {body}
      {toastMsg && <div className="toast">{toastMsg}</div>}
    </>
  )
}

function Home({ books, onOpen, onDrill, onNew, onImport, onDelete }: {
  books: Book[]
  onOpen: (b: Book) => void
  onDrill: (b: Book) => void
  onNew: () => void
  onImport: () => void
  onDelete: (b: Book) => void
}) {
  return (
    <div className="screen">
      <header className="hero">
        <h1>定跡帳</h1>
        <p className="muted">分岐をたどって覚える、将棋の定跡ノート</p>
      </header>
      <div className="row gap">
        <button className="btn primary grow" onClick={onNew}>＋ 新しい本</button>
        <button className="btn grow" onClick={onImport}>棋譜を取り込む・照合</button>
      </div>
      {books.length === 0 && <p className="muted center">本がありません。棋譜を取り込むか、新しい本を作ってください。</p>}
      <ul className="books">
        {books.map((b) => {
          const s0 = bookStats(b, 0)
          const s1 = bookStats(b, 1)
          const due = s0.due + s1.due
          return (
            <li key={b.id} className="book">
              <button className="book-main" onClick={() => onOpen(b)}>
                <span className="book-name">{b.name}</span>
                <span className="book-meta">
                  {Object.keys(b.nodes).length - 1}手 ・ 定着 ☗{s0.good}/{s0.total} ☖{s1.good}/{s1.total}
                  {due > 0 && <em className="due"> ・ 要復習 {due}</em>}
                </span>
              </button>
              <div className="book-actions">
                <button className="btn small primary" onClick={() => onDrill(b)}>練習</button>
                <button className="btn small ghost" onClick={() => onDelete(b)} aria-label="削除">削除</button>
              </div>
            </li>
          )
        })}
      </ul>
      <footer className="foot muted">データはこの端末内だけに保存されます。ME IS ME</footer>
    </div>
  )
}
