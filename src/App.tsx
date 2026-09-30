import { useCallback, useEffect, useMemo, useState } from 'react'
import { Tour, resetTours } from './ui/Tour'
import { type Book, type Folder, cloneBook, extractSubtree, mergeImport, newBook, uid } from './book/book'
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
import { Search } from './ui/Search'
import { buildStatsIndex } from './book/stats'
import { MiniBoard } from './ui/MiniBoard'
import { depthOf, positionAt } from './book/book'
import { toSfen } from './shogi/core'
import { MetaSheet, TagSheet, metaLine } from './ui/Forms'

interface Origin { bookId: string; nodeId: string }
/** 検索結果から開いた時の情報（戻り先・マージ元） */
interface Via { search: Screen; origin?: Origin; hitNodeId: string; exact: boolean }

type Screen =
  | { kind: 'home' }
  | { kind: 'explore'; bookId: string; nodeId: string; via?: Via }
  | { kind: 'drill'; bookId: string; nodeId: string }
  | { kind: 'import'; target?: string; back: Screen }
  | { kind: 'editor'; sfen?: string; back: Screen; forSearch?: boolean }
  | { kind: 'search'; sfen: string; back: Screen; origin?: Origin }
  | { kind: 'review'; items: DueItem[] }

export default function App() {
  const [books, setBooks] = useState<Book[] | null>(null)
  const [folders, setFolders] = useState<Folder[]>([])
  const [folderId, setFolderId] = useState<string | null>(null) // 一覧で開いているフォルダ
  const [screen, setScreen] = useState<Screen>({ kind: 'home' })
  const [rev, setRev] = useState(0)
  const [toastMsg, setToastMsg] = useState('')
  const [appSheet, setAppSheet] = useState<{ title: string; items: SheetItem[] } | null>(null)

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

  // 次の手の出現率の集計（本が変わるたびに作り直す）
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stats = useMemo(() => buildStatsIndex(books ?? []), [books, rev])

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
        onBack={() => {
          const via = screen.via
          if (via?.origin) return setScreen({ kind: 'explore', bookId: via.origin.bookId, nodeId: via.origin.nodeId })
          if (via) return setScreen(via.search)
          setFolderId(book.folderId ?? null)
          setScreen({ kind: 'home' })
        }}
        fromSearch={!!screen.via}
        stats={stats}
        onMerge={screen.via?.exact ? () => {
          const via = screen.via!
          const tree = extractSubtree(book, via.hitNodeId)
          const originBook = via.origin ? bookOf(via.origin.bookId) : undefined
          const items: SheetItem[] = []
          if (originBook && via.origin) {
            const at = via.origin.nodeId
            items.push({
              label: `「${originBook.name}」に取り込む`,
              onClick: () => {
                const r = mergeImport(originBook, tree, at)
                touch(originBook)
                setScreen({ kind: 'explore', bookId: originBook.id, nodeId: at })
                toast(r.added ? `${r.added}手を追加` : '追加する手はありません')
              },
            })
            items.push({
              label: '新しい本にする',
              onClick: () => {
                const c = cloneBook(originBook, `${originBook.name}＋${book.name}`)
                const r = mergeImport(c, tree, at)
                touch(c)
                setScreen({ kind: 'explore', bookId: c.id, nodeId: at })
                toast(`${r.added}手を追加`)
              },
            })
          } else {
            items.push({
              label: '新しい本にする',
              onClick: () => {
                const c = newBook(`${book.name}（局面から）`, tree.rootSfen, book.folderId)
                mergeImport(c, tree)
                touch(c)
                setScreen({ kind: 'explore', bookId: c.id, nodeId: c.rootId })
              },
            })
          }
          setAppSheet({ title: 'マージ', items })
        } : undefined}
        onDrill={(nodeId) => setScreen({ kind: 'drill', bookId: book.id, nodeId })}
        onImport={() => setScreen({ kind: 'import', target: book.id, back: screen })}
        onEditPosition={(sfen) => setScreen({ kind: 'editor', sfen, back: screen })}
        onSearch={(sfen) => setScreen({ kind: 'search', sfen, back: screen, origin: { bookId: book.id, nodeId: screen.nodeId } })}
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
  } else if (screen.kind === 'search') {
    body = (
      <Search
        books={books}
        sfen={screen.sfen}
        exclude={screen.origin}
        onOpen={(bookId, nodeId, exact) => setScreen({ kind: 'explore', bookId, nodeId, via: { search: screen, origin: screen.origin, hitNodeId: nodeId, exact } })}
        onEditQuery={() => setScreen({ kind: 'editor', sfen: screen.sfen, back: screen.back, forSearch: true })}
        onBack={() => setScreen(screen.back)}
      />
    )
  } else if (screen.kind === 'editor') {
    body = (
      <BoardEditor
        initialSfen={screen.sfen}
        toast={toast}
        forSearch={screen.forSearch}
        onBack={() => setScreen(screen.back)}
        onCreate={(name, sfen) => {
          if (screen.forSearch) return setScreen({ kind: 'search', sfen, back: screen.back })
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
        onOpenAt={(b, nodeId) => setScreen({ kind: 'explore', bookId: b.id, nodeId })}
        onDrill={(b) => setScreen({ kind: 'drill', bookId: b.id, nodeId: b.rootId })}
        onNew={() => {
          const name = prompt('名前', '新しい定跡')
          if (!name?.trim()) return
          const b = newBook(name.trim(), undefined, inFolder)
          touch(b)
          setScreen({ kind: 'explore', bookId: b.id, nodeId: b.rootId })
        }}
        onEditor={() => setScreen({ kind: 'editor', back: { kind: 'home' } })}
        onSearch={() => setScreen({ kind: 'editor', back: { kind: 'home' }, forSearch: true })}
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
        onToggleReview={async (f) => {
          const n = { ...f, review: !f.review || undefined }
          await saveFolder(n)
          setFolders((fs) => fs.map((x) => (x.id === f.id ? n : x)))
          toast(n.review ? '今日の復習に使います' : '今日の復習から外しました')
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
      {appSheet && <ActionSheet title={appSheet.title} items={appSheet.items} onClose={() => setAppSheet(null)} />}
    </>
  )
}

interface HomeProps {
  books: Book[]
  folders: Folder[]
  folderId: string | null
  setFolderId: (id: string | null) => void
  onOpen: (b: Book) => void
  onOpenAt: (b: Book, nodeId: string) => void
  onDrill: (b: Book) => void
  onNew: () => void
  onEditor: () => void
  onSearch: () => void
  onReview: (items: DueItem[]) => void
  onImport: () => void
  onChangeBook: (b: Book) => void
  onDeleteBook: (b: Book) => void
  onNewFolder: () => void
  onRenameFolder: (f: Folder) => void
  onToggleReview: (f: Folder) => void
  onDeleteFolder: (f: Folder) => void
}

function Home(p: HomeProps) {
  const { books, folders, folderId } = p
  const [sheet, setSheet] = useState<{ title: string; items: SheetItem[] } | null>(null)
  const [form, setForm] = useState<{ kind: 'tags' | 'meta'; book: Book } | null>(null)
  const [tag, setTag] = useState<string | null>(null)
  const folder = folders.find((f) => f.id === folderId) ?? null
  const inView = books.filter((b) => (folder ? b.folderId === folder.id : true))
  const allTags = [...new Set(books.flatMap((b) => b.tags ?? []))].sort((a, b) => a.localeCompare(b, 'ja'))
  const viewTags = [...new Set(inView.flatMap((b) => b.tags ?? []))].sort((a, b) => a.localeCompare(b, 'ja'))
  const activeTag = tag && viewTags.includes(tag) ? tag : null
  // しおり（表示中の範囲の本から、更新が新しい順）
  const marks = inView.flatMap((b) => (b.bookmarks ?? []).filter((id) => b.nodes[id]).map((nodeId) => ({ book: b, nodeId })))
  // タグで絞り込み中は、一覧の直下でもフォルダをまたいで表示する
  const shown = activeTag
    ? inView.filter((b) => b.tags?.includes(activeTag))
    : books.filter((b) => (folder ? b.folderId === folder.id : !b.folderId || !folders.some((f) => f.id === b.folderId)))
  // 復習の対象は「復習に使う」フォルダの本だけ（フォルダ内ではそのフォルダ分）
  const reviewFolders = new Set(folders.filter((f) => f.review).map((f) => f.id))
  const due = dueItems((folder ? inView : books).filter((b) => b.folderId && reviewFolders.has(b.folderId)))

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
      { label: 'タグ', onClick: () => setForm({ kind: 'tags', book: b }) },
      { label: '対局情報', onClick: () => setForm({ kind: 'meta', book: b }) },
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
          <h1 className="bar-title">📁 {folder.name}{folder.review && <em className="review-tag">復習</em>}</h1>
          <button
            className="btn ghost"
            onClick={() => setSheet({
              title: folder.name,
              items: [
                { label: folder.review ? '今日の復習から外す' : '今日の復習に使う', onClick: () => p.onToggleReview(folder) },
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
          <span className="hero-tools">
          <button className="icon-btn search-btn" onClick={() => { resetTours(); location.reload() }} aria-label="使い方">?</button>
          <button className="icon-btn search-btn" onClick={p.onSearch} aria-label="局面検索">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M15 15l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
          </span>
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
       data-tour="new">＋ 新規作成</button>
      {due.length > 0 && (
        <button className="btn review-btn wide" onClick={() => p.onReview(due)}>
          今日の復習<span className="count">{due.length}</span>
        </button>
      )}

      {viewTags.length > 0 && (
        <div className="tag-list filter">
          {viewTags.map((t) => (
            <button key={t} className={`tag ${activeTag === t ? 'on' : ''}`} onClick={() => setTag(activeTag === t ? null : t)}>#{t}</button>
          ))}
        </div>
      )}

      {marks.length > 0 && (
        <div className="marks">
          {marks.map(({ book: b, nodeId }) => (
            <button key={`${b.id}-${nodeId}`} className="mark-card" onClick={() => p.onOpenAt(b, nodeId)}>
              <MiniBoard sfen={toSfen(positionAt(b, nodeId).pos)} size={84} />
              <span>{depthOf(b, nodeId)}手目</span>
              <span>{b.name}</span>
            </button>
          ))}
        </div>
      )}

      {!folder && !activeTag && folders.length > 0 && (
        <ul className="books">
          {folders.map((f) => {
            const n = books.filter((b) => b.folderId === f.id).length
            return (
              <li key={f.id} className="book folder">
                <button className="book-main" onClick={() => p.setFolderId(f.id)}>
                  <span className="book-name">📁 {f.name}{f.review && <em className="review-tag">復習</em>}</span>
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
                {metaLine(b.meta) && <span className="book-meta players">{metaLine(b.meta)}</span>}
                {(b.tags?.length ?? 0) > 0 && <span className="book-tags">{b.tags!.map((t) => <i key={t}>#{t}</i>)}</span>}
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
      {!folder && (
        <Tour
          id="home"
          steps={[
            { title: '定跡帳へようこそ', text: '定跡を「本」として記録し、分岐をたどって覚えるアプリです。まずは使い方を少しだけ案内します。' },
            { sel: '[data-tour="new"]', title: '本を作る', text: '初手から指して作る、盤面を並べて作る、棋譜を貼り付けて作る、フォルダを作る、がここにまとまっています。' },
            { sel: '.books .book:not(.folder) .book-main', title: '本を開く', text: 'タップすると盤が開き、手順を進めたり戻したりして確認できます。サンプルの本を用意してあります。' },
            { sel: '.books .book:not(.folder) .btn.primary', title: '練習', text: '相手の手は自動で指され、あなたの番で定跡の手を答えます。間違えた局面は後日また出題されます。' },
            { sel: '.books .book:not(.folder) [aria-label="メニュー"]', title: '本のメニュー', text: '名前の変更、タグ、対局情報、フォルダへの移動、削除ができます。' },
            { sel: '[aria-label="局面検索"]', title: '局面検索', text: '盤面を並べて、同じ局面や似た局面がどの本に出てくるかを探せます。' },
            { sel: '[aria-label="使い方"]', title: '使い方をもう一度', text: 'この案内はいつでもここからもう一度見られます。' },
          ]}
        />
      )}
      {sheet && <ActionSheet title={sheet.title} items={sheet.items} onClose={() => setSheet(null)} />}
      {form?.kind === 'tags' && (
        <TagSheet
          title={form.book.name}
          tags={form.book.tags ?? []}
          allTags={allTags}
          onSave={(tags) => { form.book.tags = tags.length ? tags : undefined; p.onChangeBook(form.book) }}
          onClose={() => setForm(null)}
        />
      )}
      {form?.kind === 'meta' && (
        <MetaSheet
          title={form.book.name}
          meta={form.book.meta}
          onSave={(m) => { form.book.meta = m; p.onChangeBook(form.book) }}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  )
}
