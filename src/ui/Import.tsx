import { useState } from 'react'
import { type Book, followLine, mergeImport, newBook, positionAt } from '../book/book'
import { mainLine, parseKifu, readKifuFile } from '../kifu/parse'
import { usiToMove } from '../shogi/core'
import { moveToJa } from '../shogi/notation'

interface Props {
  books: Book[]
  initialTarget?: string
  onCreate: (b: Book) => void
  onChange: (b: Book) => void
  onOpen: (bookId: string, nodeId: string) => void
  onBack: () => void
}

type Mode = 'import' | 'check'

export function Import({ books, initialTarget, onCreate, onChange, onOpen, onBack }: Props) {
  const [mode, setMode] = useState<Mode>('import')
  const [text, setText] = useState('')
  const [target, setTarget] = useState<string>(initialTarget ?? (books[0]?.id ?? 'new'))
  const [name, setName] = useState('')
  const [result, setResult] = useState<{ ok: boolean; text: string; open?: { book: string; node: string } } | null>(null)

  const onFile = async (f: File | undefined) => {
    if (!f) return
    const s = await readKifuFile(f)
    setText(s)
    if (!name) setName(f.name.replace(/\.[^.]+$/, ''))
  }

  const run = () => {
    try {
      const tree = parseKifu(text)
      if (mode === 'import') {
        if (target === 'new') {
          const b = newBook(name.trim() || tree.title || '新しい定跡', tree.rootSfen)
          const r = mergeImport(b, tree)
          onCreate(b)
          setResult({ ok: true, text: `${tree.format}形式を読み込み、新しい本に${r.added}手を追加しました。`, open: { book: b.id, node: b.rootId } })
        } else {
          const b = books.find((x) => x.id === target)!
          const r = mergeImport(b, tree)
          onChange(b)
          setResult({ ok: true, text: r.added ? `${tree.format}形式を読み込み、「${b.name}」に${r.added}手を追加しました（既にある手は統合）。` : 'すべて既に登録済みの手でした。', open: { book: b.id, node: b.rootId } })
        }
      } else {
        const b = books.find((x) => x.id === target)
        if (!b) throw new Error('照合する本を選んでください')
        const line = mainLine(tree)
        const r = followLine(b, line)
        if (r.matched === line.length) {
          setResult({ ok: true, text: `最後の${line.length}手目まで、すべて定跡どおりでした。`, open: { book: b.id, node: r.nodeId } })
        } else {
          const st = positionAt(b, r.nodeId)
          const played = moveToJa(st.pos, usiToMove(line[r.matched]), st.prevTo)
          const book = b.nodes[r.nodeId].children.map((c) => moveToJa(st.pos, usiToMove(b.nodes[c].move!), st.prevTo))
          const txt = r.matched === 0 && !book.length
            ? 'この本には手が登録されていません。'
            : `${r.matched + 1}手目 ${played} で定跡を外れました。` +
              (book.length ? `定跡は ${book.join(' / ')}。` : `（定跡はここで終わり）`)
          setResult({ ok: false, text: txt, open: { book: b.id, node: r.nodeId } })
        }
      }
    } catch (e) {
      setResult({ ok: false, text: (e as Error).message })
    }
  }

  const bookPreview = (id: string) => {
    const b = books.find((x) => x.id === id)
    if (!b) return ''
    return `${Object.keys(b.nodes).length - 1}手`
  }

  return (
    <div className="screen">
      <header className="bar">
        <button className="btn ghost" onClick={onBack}>‹ 戻る</button>
        <h1 className="bar-title">棋譜</h1>
        <span />
      </header>
      <section className="panel setup">
        <div className="seg">
          <button className={mode === 'import' ? 'on' : ''} onClick={() => { setMode('import'); setResult(null) }}>取り込む</button>
          <button className={mode === 'check' ? 'on' : ''} onClick={() => { setMode('check'); setResult(null) }}>照合</button>
        </div>

        <label>{mode === 'import' ? '取り込み先' : '照合する本'}</label>
        <select value={target} onChange={(e) => setTarget(e.target.value)}>
          {mode === 'import' && <option value="new">＋ 新しい本を作る</option>}
          {books.map((b) => <option key={b.id} value={b.id}>{b.name}（{bookPreview(b.id)}）</option>)}
        </select>
        {mode === 'import' && target === 'new' && (
          <input placeholder="名前" value={name} onChange={(e) => setName(e.target.value)} />
        )}

        <label>棋譜</label>
        <textarea
          className="kifu-input"
          rows={8}
          placeholder="棋譜を貼り付け"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <label className="btn file">
          ファイルを選ぶ
          <input type="file" accept=".kif,.kifu,.ki2,.ki2u,.csa,.txt,.sfen,.usi" onChange={(e) => onFile(e.target.files?.[0])} hidden />
        </label>
        <button className="btn primary wide" disabled={!text.trim()} onClick={run}>
          {mode === 'import' ? '取り込む' : '照合する'}
        </button>
        {result && (
          <div className={`result ${result.ok ? 'good' : 'bad'}`}>
            <p>{result.text}</p>
            {result.open && (
              <button className="btn" onClick={() => onOpen(result.open!.book, result.open!.node)}>
                {mode === 'check' ? 'その局面を開く' : '本を開く'}
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

