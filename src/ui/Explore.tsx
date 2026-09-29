import { useMemo, useState } from 'react'
import { type Move, applyMove, moveToUsi, toSfen, usiToMove } from '../shogi/core'
import { moveToJa } from '../shogi/notation'
import {
  type Book, addChild, deleteSubtree, findChild, pathTo, positionAt, promoteToMain, transpositionIndex,
} from '../book/book'
import { Board } from './Board'
import { TreeView } from './TreeView'
import { Sheets, type SheetOpen } from './Sheets'
import { metaLine } from './Forms'
import { exportKif } from '../kifu/export'

interface Props {
  book: Book
  rev: number
  nodeId: string
  setNodeId: (id: string) => void
  onChange: () => void
  onBack: () => void
  onDrill: (fromNode: string) => void
  onImport: () => void
  onEditPosition: (sfen: string) => void
  onSearch: (sfen: string) => void
  /** 検索結果から開いた時：虫眼鏡を使えなくし、戻る先を検索元にする */
  fromSearch?: boolean
  /** 一致した局面から開いた時だけ：検索元とマージ */
  onMerge?: () => void
  toast: (s: string) => void
}

export function Explore({ book, rev, nodeId, setNodeId, onChange, onBack, onDrill, onImport, onEditPosition, onSearch, fromSearch, onMerge, toast }: Props) {
  // 空の本は最初から編集モード
  const [edit, setEdit] = useState(() => book.nodes[book.rootId].children.length === 0)
  const [flipped, setFlipped] = useState(false)
  const [sheet, setSheet] = useState<SheetOpen>('none')

  const node = book.nodes[nodeId] ?? book.nodes[book.rootId]
  const { pos, prevTo } = useMemo(() => positionAt(book, node.id), [book, node.id, rev])
  const lastMove = node.move ? usiToMove(node.move) : null

  const path = useMemo(() => pathTo(book, node.id), [book, node.id, rev])
  const pathLabels = useMemo(() => {
    const out: { id: string; label: string }[] = []
    let st = positionAt(book, book.rootId)
    for (const id of path.slice(1)) {
      const m = usiToMove(book.nodes[id].move!)
      out.push({ id, label: moveToJa(st.pos, m, st.prevTo) })
      st = { pos: applyMove(st.pos, m), prevTo: m.to }
    }
    return out
  }, [book, path])

  const children = node.children.map((c) => {
    const m = usiToMove(book.nodes[c].move!)
    return { id: c, label: moveToJa(pos, m, prevTo), comment: book.nodes[c].comment }
  })

  const transposed = useMemo(() => {
    const idx = transpositionIndex(book)
    return (idx.get(toSfen(pos)) ?? []).filter((id) => id !== node.id)
  }, [book, pos, node.id, rev])

  const onMove = (m: Move) => {
    const exist = findChild(book, node.id, moveToUsi(m))
    if (exist) return setNodeId(exist)
    if (!edit) {
      toast('定跡にない手')
      return
    }
    const r = addChild(book, node.id, m)
    onChange()
    setNodeId(r.id)
  }

  const goFirstChild = () => node.children[0] && setNodeId(node.children[0])
  const goLeaf = () => {
    let cur = node
    while (cur.children[0]) cur = book.nodes[cur.children[0]]
    setNodeId(cur.id)
  }

  const download = () => {
    try {
      const kif = exportKif(book)
      const blob = new Blob([kif], { type: 'text/plain;charset=utf-8' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${book.name.replace(/[\\/:*?"<>|]/g, '_')}.kifu`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (e) {
      toast((e as Error).message)
    }
  }

  const screen = (
    <div className="screen fit">
      <header className="bar">
        <button className="btn ghost" onClick={onBack}>{fromSearch ? '‹ 戻る' : '‹ 一覧'}</button>
        <h1
          className="bar-title"
          onClick={() => {
            const name = prompt('本の名前', book.name)
            if (name?.trim()) { book.name = name.trim(); onChange() }
          }}
        >{book.name}</h1>
        {onMerge
          ? <button className="btn primary" onClick={onMerge}>マージ</button>
          : <button className="btn primary" onClick={() => onDrill(node.id)}>練習</button>}
      </header>
      {metaLine(book.meta) && <p className="meta-line">{metaLine(book.meta)}</p>}

      <div className="stage">
      <Board
        pos={pos}
        flipped={flipped}
        lastTo={lastMove?.to ?? null}
        lastFrom={lastMove?.from ?? null}
        onMove={onMove}
        onTapSide={edit ? undefined : (side) => (side === 'right' ? goFirstChild() : node.parent && setNodeId(node.parent))}
      />

      <div className="nav">
        <button className="btn" onClick={() => setNodeId(book.rootId)} aria-label="最初へ">⏮</button>
        <button className="btn" onClick={() => node.parent && setNodeId(node.parent)} aria-label="1手戻る">◀</button>
        <span className="nav-now">{node.move ? pathLabels.at(-1)?.label : '開始局面'}<small>{path.length - 1}手目</small></span>
        <button className="btn" onClick={goFirstChild} aria-label="本線で1手進む">▶</button>
        <button className="btn" onClick={goLeaf} aria-label="本線の最後へ">⏭</button>
        <button className="icon-btn" onClick={() => onSearch(toSfen(pos))} aria-label="この局面を検索" disabled={fromSearch}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M15 15l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </button>
        <span className="nav-gap" />
        <button className={`icon-btn ${edit ? 'on' : ''}`} onClick={() => setEdit(!edit)} aria-label="編集" aria-pressed={edit}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z M14 6l4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" /></svg>
        </button>
        <button className={`icon-btn ${flipped ? 'on' : ''}`} onClick={() => setFlipped(!flipped)} aria-label="盤反転" aria-pressed={flipped}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M8 20V5M4 9l4-4 4 4M16 4v15M12 15l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" /></svg>
        </button>
      </div>
      </div>

      <section className="panel next-panel">
          <div className="choices">
            {children.map((c, i) => (
              <button key={c.id} className={`choice ${i === 0 ? 'main' : ''}`} onClick={() => setNodeId(c.id)}>
                {c.label}
                {i === 0 && children.length > 1 && <small>本線</small>}
              </button>
            ))}
          </div>
          {transposed.length > 0 && (
            <button className="chip" onClick={() => setNodeId(transposed[0])}>⇄ 合流 {transposed.length}</button>
          )}
          {edit && (
            <div className="row gap wrap">
              <button className="btn" onClick={() => onEditPosition(toSfen(pos))}>この局面から盤面編集</button>
            </div>
          )}
          {node.move && edit && (
            <div className="row gap wrap">
              {book.nodes[node.parent!].children[0] !== node.id && (
                <button className="btn" onClick={() => { promoteToMain(book, node.id); onChange() }}>この手を本線にする</button>
              )}
              <button
                className="btn danger"
                onClick={() => {
                  if (!confirm('この手以降をすべて削除しますか？')) return
                  const p = node.parent!
                  deleteSubtree(book, node.id)
                  onChange()
                  setNodeId(p)
                }}
              >この手以降を削除</button>
            </div>
          )}
      </section>
    </div>
  )

  const panel = (
    <div className="drawer-body">
      <div className="drawer-head">
        <span>定跡ツリー</span>
      </div>
      <TreeView book={book} rev={rev} currentId={node.id} onSelect={setNodeId} />
      <div className="row gap">
        <button className="chip" onClick={onImport}>棋譜を取込</button>
        <button className="chip" onClick={download}>KIF書出</button>
      </div>
    </div>
  )

  const memo = (
    <div className="memo-body">
      <div className="memo-grab" />
      <div className="memo-head">
        <span>メモ</span>
        <small>{node.move ? pathLabels.at(-1)?.label : '開始局面'}　{path.length - 1}手目</small>
      </div>
      <textarea
        key={node.id}
        className="memo-text"
        placeholder="メモ"
        defaultValue={node.comment ?? ''}
        onBlur={(e) => {
          const v = e.target.value.trim()
          if ((node.comment ?? '') !== v) {
            node.comment = v || undefined
            onChange()
          }
        }}
      />
    </div>
  )

  return <Sheets open={sheet} onOpenChange={setSheet} area={screen} tree={panel} memo={memo} memoFilled={!!node.comment} />
}
