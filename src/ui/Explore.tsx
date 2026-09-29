import { useMemo, useState } from 'react'
import { type Move, applyMove, moveToUsi, toSfen, usiToMove } from '../shogi/core'
import { moveToJa } from '../shogi/notation'
import {
  type Book, addChild, deleteSubtree, findChild, pathTo, positionAt, promoteToMain, transpositionIndex,
} from '../book/book'
import { Board } from './Board'
import { TreeView } from './TreeView'
import { SideDrawer } from './SideDrawer'
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
  toast: (s: string) => void
}

export function Explore({ book, rev, nodeId, setNodeId, onChange, onBack, onDrill, onImport, onEditPosition, toast }: Props) {
  const [edit, setEdit] = useState(false)
  const [flipped, setFlipped] = useState(false)
  const [drawer, setDrawer] = useState(false)

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
      toast('定跡にない手です（「編集」をオンにすると追加できます）')
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
        <button className="btn ghost" onClick={onBack}>‹ 一覧</button>
        <h1
          className="bar-title"
          onClick={() => {
            const name = prompt('本の名前', book.name)
            if (name?.trim()) { book.name = name.trim(); onChange() }
          }}
        >{book.name}</h1>
        <button className="btn primary" onClick={() => onDrill(node.id)}>練習</button>
      </header>

      <Board
        pos={pos}
        flipped={flipped}
        lastTo={lastMove?.to ?? null}
        lastFrom={lastMove?.from ?? null}
        onMove={onMove}
      />

      <div className="nav">
        <button className="btn" onClick={() => setNodeId(book.rootId)} aria-label="最初へ">⏮</button>
        <button className="btn" onClick={() => node.parent && setNodeId(node.parent)} aria-label="1手戻る">◀</button>
        <span className="nav-now">{node.move ? pathLabels.at(-1)?.label : '開始局面'}<small>{path.length - 1}手目</small></span>
        <button className="btn" onClick={goFirstChild} aria-label="本線で1手進む">▶</button>
        <button className="btn" onClick={goLeaf} aria-label="本線の最後へ">⏭</button>
      </div>

      <section className="panel next-panel">
          <div className="panel-head">
            <span>次の手 {children.length > 1 && <em className="fork">分岐 {children.length}</em>}</span>
            <div className="row gap">
              <button className={`chip ${flipped ? 'on' : ''}`} onClick={() => setFlipped(!flipped)}>盤反転</button>
              <button className={`chip ${edit ? 'on' : ''}`} onClick={() => setEdit(!edit)}>編集</button>
            </div>
          </div>
          {children.length === 0 && <p className="muted">この先の手はまだありません{edit ? '。盤で指すと追加されます。' : '。'}</p>}
          <div className="choices">
            {children.map((c, i) => (
              <button key={c.id} className={`choice ${i === 0 ? 'main' : ''}`} onClick={() => setNodeId(c.id)}>
                {c.label}
                {i === 0 && children.length > 1 && <small>本線</small>}
              </button>
            ))}
          </div>
          {transposed.length > 0 && (
            <p className="note">
              ⇄ この局面は別の手順でも出てきます（{transposed.length}箇所）
              <button className="link" onClick={() => setNodeId(transposed[0])}>移動</button>
            </p>
          )}
          {edit && (
            <div className="row gap wrap">
              <button className="btn" onClick={() => onEditPosition(toSfen(pos))}>この局面を並べ替えて新しい本に</button>
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
          <textarea
            key={node.id}
            className="comment"
            placeholder={edit ? 'メモ（狙い・注意点など）' : 'メモなし'}
            defaultValue={node.comment ?? ''}
            readOnly={!edit}
            rows={node.comment || edit ? 3 : 1}
            onBlur={(e) => {
              const v = e.target.value.trim()
              if ((node.comment ?? '') !== v) {
                node.comment = v || undefined
                onChange()
              }
            }}
          />
      </section>
    </div>
  )

  const panel = (
    <div className="drawer-body">
      <div className="drawer-head">
        <span>定跡ツリー</span>
        <span className="muted">ツリーは指で上下左右に動かせます</span>
      </div>
      <TreeView book={book} rev={rev} currentId={node.id} onSelect={setNodeId} />
      <p className="legend muted"><i className="lg due">●</i>要復習 <i className="lg learning">●</i>学習中 <i className="lg good">●</i>定着　＊メモ　⇄合流</p>
      <div className="row gap">
        <button className="chip" onClick={onImport}>棋譜を取込</button>
        <button className="chip" onClick={download}>KIF書出</button>
      </div>
    </div>
  )

  return <SideDrawer open={drawer} onOpenChange={setDrawer} handleLabel="ツリー" area={screen}>{panel}</SideDrawer>
}
