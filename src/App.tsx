import { useCallback, useEffect, useState } from 'react'
import { type Book, type Folder, mergeImport, newBook, uid } from './book/book'
import {
  deleteBook, deleteFolder, loadBooks, loadFolders, markSampleInstalled, sampleInstalled, saveBook, saveFolder,
} from './book/storage'
import { type DueItem, bookStats, dueItems } from './book/srs'
import { SAMPLE_KIF, SAMPLE_NAME } from './book/sample'
import { parseKifu } from './kifu/parse'
import { Explore } from './ui/Explore'
import { Drill } from './ui/Drill'
import { Import } from './ui/Import'
import { BoardEditor } from './ui/BoardEditor'
import { ActionSheet, type SheetItem } from './ui/ActionSheet'
import { Review } from './ui/Review'

type Screen =
  | { kind: 'home' }
  | { kind: 'explore'; bookId: string; nodeId: string }
  | { kind: 'drill'; bookId: string; nodeId: string }
  | { kind: 'import'; target?: string; back: Screen }
  | { kind: 'editor'; sfen?: string; back: Screen }
  | { kind: 'review'; items: DueItem[] }

export default function App() {
  const [books, setBooks] = useState<Book[] | null>(null)
  const [folders, setFolders] = useState<Folder[]>([])
  const [folderId, setFolderId] = useState<string | null>(null) // 一覧で開いているフォルダ
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
      setFolders(await loadFolders())
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
  const inFolder = folderId && folders.some((f) => f.id === folderId) ? folderId : undefined

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
        onBack={() => { setFolderId(book.folderId ?? null); setScreen({ kind: 'home' }) }}
        onDrill={(nodeId) => setScreen({ kind: 'drill', bookId: book.id, nodeId })}
        onImport={() => setScreen({ kind: 'import', target: book.id, back: screen })}
        onEditPosition={(sfen) => setScreen({ kind: 'editor', sfen, back: screen })}
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
        onCreate={(b) => { b.folderId = inFolder; touch(b) }}
        onChange={(b) => touch(b)}
        onOpen={(bookId, nodeId) => setScreen({ kind: 'explore', bookId, nodeId })}
        onBack={() => setScreen(screen.back)}
      />
    )
  } else if (screen.kind === 'review') {
    body = <Review books={books} items={screen.items} onChange={touch} onBack={() => setScreen({ kind: 'home' })} />
  } else if (screen.kind === 'editor') {
    body = (
      <BoardEditor
        initialSfen={screen.sfen}
        toast={toast}
        onBack={() => setScreen(screen.back)}
        onCreate={(name, sfen) => {
          const folder = screen.back.kind === 'explore' ? bookOf(screen.back.bookId)?.folderId : inFolder
          const b = newBook(name, sfen, folder)
          touch(b)
          setScreen({ kind: 'explore', bookId: b.id, nodeId: b.rootId })
        }}
      />
    )
  } else {
    body = (
      <Home
        books={books}
        folders={folders}
        folderId={inFolder ?? null}
        setFolderId={setFolderId}
        onOpen={(b) => setScreen({ kind: 'explore', bookId: b.id, nodeId: b.rootId })}
        onDrill={(b) => setScreen({ kind: 'drill', bookId: b.id, nodeId: b.rootId })}
        onNew={() => {
          const name = prompt('名前', '新しい定跡')
          if (!name?.trim()) return
          const b = newBook(name.trim(), undefined, inFolder)
          touch(b)
          setScreen({ kind: 'explore', bookId: b.id, nodeId: b.rootId })
        }}
        onEditor={() => setScreen({ kind: 'editor', back: { kind: 'home' } })}
        onReview={(items) => setScreen({ kind: 'review', items })}
        onImport={() => setScreen({ kind: 'import', back: { kind: 'home' } })}
        onChangeBook={touch}
        onDeleteBook={async (b) => {
          if (!confirm(`「${b.name}」を削除しますか？（元に戻せません）`)) return
          await deleteBook(b.id)
          setBooks(books.filter((x) => x.id !== b.id))
        }}
        onNewFolder={async () => {
          const name = prompt('フォルダ名', '')
          if (!name?.trim()) return
          const f: Folder = { id: uid(), name: name.trim(), createdAt: Date.now() }
          await saveFolder(f)
          setFolders((fs) => [...fs, f].sort((a, b) => a.name.localeCompare(b.name, 'ja')))
        }}
        onRenameFolder={async (f) => {
          const name = prompt('フォルダ名', f.name)
          if (!name?.trim()) return
          const n = { ...f, name: name.trim() }
          await saveFolder(n)
          setFolders((fs) => fs.map((x) => (x.id === f.id ? n : x)))
        }}
        onDeleteFolder={async (f) => {
          const inside = books.filter((b) => b.folderId === f.id)
          if (!confirm(`フォルダ「${f.name}」を削除しますか？${inside.length ? `\n中の${inside.length}冊は一覧の直下に移します。` : ''}`)) return
          for (const b of inside) { b.folderId = undefined; await saveBook(b) }
          await deleteFolder(f.id)
          setFolders((fs) => fs.filter((x) => x.id !== f.id))
          setFolderId(null)
          setRev((r) => r + 1)
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

interface HomeProps {
  books: Book[]
  folders: Folder[]
  folderId: string | null
  setFolderId: (id: string | null) => void
  onOpen: (b: Book) => void
  onDrill: (b: Book) => void
  onNew: () => void
  onEditor: () => void
  onReview: (items: DueItem[]) => void
  onImport: () => void
  onChangeBook: (b: Book) => void
  onDeleteBook: (b: Book) => void
  onNewFolder: () => void
  onRenameFolder: (f: Folder) => void
  onDeleteFolder: (f: Folder) => void
}

function Home(p: HomeProps) {
  const { books, folders, folderId } = p
  const [sheet, setSheet] = useState<{ title: string; items: SheetItem[] } | null>(null)
  const folder = folders.find((f) => f.id === folderId) ?? null
  const shown = books.filter((b) => (folder ? b.folderId === folder.id : !b.folderId || !folders.some((f) => f.id === b.folderId)))
  // 一覧の直下では全部の本、フォルダ内ではそのフォルダの本が復習の対象
  const due = dueItems(folder ? shown : books)

  const bookMenu = (b: Book) => setSheet({
    title: b.name,
    items: [
      {
        label: '名前を変更',
        onClick: () => {
          const name = prompt('本の名前', b.name)
          if (name?.trim()) { b.name = name.trim(); p.onChangeBook(b) }
        },
      },
      {
        label: 'フォルダへ移動',
        onClick: () => setSheet({
          title: `「${b.name}」の移動先`,
          items: [
            { label: '一覧の直下（フォルダなし）', current: !b.folderId, onClick: () => { b.folderId = undefined; p.onChangeBook(b) } },
            ...folders.map((f) => ({ label: `📁 ${f.name}`, current: b.folderId === f.id, onClick: () => { b.folderId = f.id; p.onChangeBook(b) } })),
            ...(folders.length === 0 ? [{ label: '＋ 新しいフォルダを作る', onClick: p.onNewFolder }] : []),
          ],
        }),
      },
      { label: '削除', danger: true, onClick: () => p.onDeleteBook(b) },
    ],
  })

  return (
    <div className="screen">
      {folder ? (
        <header className="bar">
          <button className="btn ghost" onClick={() => p.setFolderId(null)}>‹ 一覧</button>
          <h1 className="bar-title">📁 {folder.name}</h1>
          <button
            className="btn ghost"
            onClick={() => setSheet({
              title: folder.name,
              items: [
                { label: 'フォルダ名を変更', onClick: () => p.onRenameFolder(folder) },
                { label: 'フォルダを削除', danger: true, onClick: () => p.onDeleteFolder(folder) },
              ],
            })}
            aria-label="フォルダのメニュー"
          >⋯</button>
        </header>
      ) : (
        <header className="hero">
          <h1>定跡帳</h1>
        </header>
      )}

      <button
        className="btn primary wide"
        onClick={() => setSheet({
          title: '新規作成',
          items: [
            { label: '初手から', onClick: p.onNew },
            { label: '盤面を並べて', onClick: p.onEditor },
            { label: '棋譜から', onClick: p.onImport },
            ...(folder ? [] : [{ label: 'フォルダ', onClick: p.onNewFolder }]),
          ],
        })}
      >＋ 新規作成</button>
      {due.length > 0 && (
        <button className="btn review-btn wide" onClick={() => p.onReview(due)}>
          今日の復習<span className="count">{due.length}</span>
        </button>
      )}

      {!folder && folders.length > 0 && (
        <ul className="books">
          {folders.map((f) => {
            const n = books.filter((b) => b.folderId === f.id).length
            return (
              <li key={f.id} className="book folder">
                <button className="book-main" onClick={() => p.setFolderId(f.id)}>
                  <span className="book-name">📁 {f.name}</span>
                  <span className="book-meta">{n}冊</span>
                </button>
                <span className="chev">›</span>
              </li>
            )
          })}
        </ul>
      )}

      <ul className="books">
        {shown.map((b) => {
          const s0 = bookStats(b, 0)
          const s1 = bookStats(b, 1)
          const bookDue = s0.due + s1.due
          return (
            <li key={b.id} className="book">
              <button className="book-main" onClick={() => p.onOpen(b)}>
                <span className="book-name">{b.name}</span>
                <span className="book-meta">
                  {Object.keys(b.nodes).length - 1}手 ・ 定着 {s0.good + s1.good}/{s0.total + s1.total}
                  {bookDue > 0 && <em className="due"> ・ 復習 {bookDue}</em>}
                </span>
              </button>
              <div className="book-actions">
                <button className="btn small primary" onClick={() => p.onDrill(b)}>練習</button>
                <button className="btn small ghost" onClick={() => bookMenu(b)} aria-label="メニュー">⋯</button>
              </div>
            </li>
          )
        })}
      </ul>
      <footer className="foot muted">ME IS ME</footer>
      {sheet && <ActionSheet title={sheet.title} items={sheet.items} onClose={() => setSheet(null)} />}
    </div>
  )
}
