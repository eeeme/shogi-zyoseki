import { useMemo, useState } from 'react'
import {
  type BaseType, type Color, type HandType, type Pos, type PType,
  HAND_TYPES, PROMOTE, START_SFEN, UNPROMOTE, clonePos, deadEnd, fileOf, parseSfen, rankOf, toSfen,
} from '../shogi/core'
import { PIECE_CHAR } from '../shogi/notation'
import { Board } from './Board'

const MAX: Record<BaseType, number> = { OU: 2, HI: 2, KA: 2, KI: 4, GI: 4, KE: 4, KY: 4, FU: 18 }
const PALETTE: BaseType[] = ['OU', 'HI', 'KA', 'KI', 'GI', 'KE', 'KY', 'FU']

type Sel =
  | { kind: 'palette'; t: BaseType }
  | { kind: 'sq'; sq: number }
  | { kind: 'hand'; c: Color; t: HandType }
  | null

interface Props {
  initialSfen?: string
  onCreate: (name: string, sfen: string) => void
  onBack: () => void
  toast: (s: string) => void
  /** 検索用：名前欄を出さず、ボタンを「検索」にする */
  forSearch?: boolean
}

const emptyPos = () => parseSfen('9/9/9/9/9/9/9/9/9 b -')

/** 盤面編集：駒箱から自由に並べて、その局面から新しい本を作る */
export function BoardEditor({ initialSfen, onCreate, onBack, toast, forSearch }: Props) {
  const [pos, setPos] = useState<Pos>(() => parseSfen(initialSfen ?? START_SFEN))
  const [sel, setSel] = useState<Sel>(null)
  const [color, setColor] = useState<Color>(0)
  const [promoted, setPromoted] = useState(false)
  const [flipped, setFlipped] = useState(false)
  const [name, setName] = useState('')

  const box = useMemo(() => {
    const used: Record<BaseType, number> = { OU: 0, HI: 0, KA: 0, KI: 0, GI: 0, KE: 0, KY: 0, FU: 0 }
    for (const p of pos.board) if (p) used[UNPROMOTE[p.t]]++
    for (const c of [0, 1] as Color[]) for (const t of HAND_TYPES) used[t] += pos.hands[c][t]
    const out = {} as Record<BaseType, number>
    for (const t of PALETTE) out[t] = MAX[t] - used[t]
    return out
  }, [pos])

  const update = (f: (p: Pos) => void) => {
    const n = clonePos(pos)
    f(n)
    setPos(n)
  }

  const kingOf = (p: Pos, c: Color, except?: number) =>
    p.board.some((x, i) => x && x.t === 'OU' && x.c === c && i !== except)

  const canStand = (t: PType, c: Color, sq: number) => {
    if (deadEnd(t, c, rankOf(sq))) {
      toast('その段には置けません（行き所のない駒）')
      return false
    }
    return true
  }

  const onSquare = (sq: number) => {
    const here = pos.board[sq]
    if (sel?.kind === 'palette') {
      const base = sel.t
      const t: PType = promoted && PROMOTE[base] ? PROMOTE[base]! : base
      const freed = here && UNPROMOTE[here.t] === base ? 1 : 0
      if (box[base] + freed <= 0) return toast('駒箱にその駒が残っていません')
      if (base === 'OU' && kingOf(pos, color, sq)) return toast(`${color === 0 ? '先手' : '後手'}の玉は1枚までです`)
      if (!canStand(t, color, sq)) return
      update((p) => { p.board[sq] = { t, c: color } })
      // 駒箱が空になったら選択を外す
      if (box[base] + freed - 1 <= 0) setSel(null)
      return
    }
    if (sel?.kind === 'sq') {
      if (sel.sq === sq) return setSel(null)
      const moving = pos.board[sel.sq]!
      if (!canStand(moving.t, moving.c, sq)) return
      update((p) => { p.board[sq] = moving; p.board[sel.sq] = null })
      return setSel({ kind: 'sq', sq })
    }
    if (sel?.kind === 'hand') {
      if (!canStand(sel.t, sel.c, sq)) return
      update((p) => { p.board[sq] = { t: sel.t, c: sel.c }; p.hands[sel.c][sel.t]-- })
      return setSel(pos.hands[sel.c][sel.t] > 1 ? sel : null)
    }
    if (here) setSel({ kind: 'sq', sq })
  }

  const onHandPiece = (c: Color, t: HandType) => {
    if (sel?.kind === 'palette') return onHandArea(c)
    if (sel?.kind === 'hand' && sel.c === c && sel.t === t) return setSel(null)
    setSel({ kind: 'hand', c, t })
  }

  const onHandArea = (c: Color) => {
    if (sel?.kind === 'palette') {
      if (sel.t === 'OU') return toast('玉は持駒にできません')
      if (box[sel.t] <= 0) return toast('駒箱にその駒が残っていません')
      return update((p) => { p.hands[c][sel.t as HandType]++ })
    }
    if (sel?.kind === 'sq') {
      const piece = pos.board[sel.sq]!
      const base = UNPROMOTE[piece.t]
      if (base === 'OU') return toast('玉は持駒にできません')
      update((p) => { p.board[sel.sq] = null; p.hands[c][base as HandType]++ })
      return setSel(null)
    }
  }

  // 選択中の盤上の駒への操作
  const selPiece = sel?.kind === 'sq' ? pos.board[sel.sq] : null
  const togglePromote = () => {
    if (sel?.kind !== 'sq' || !selPiece) return
    const base = UNPROMOTE[selPiece.t]
    if (!PROMOTE[base]) return toast('この駒は成れません')
    const t: PType = selPiece.t === base ? PROMOTE[base]! : base
    if (!canStand(t, selPiece.c, sel.sq)) return
    update((p) => { p.board[sel.sq] = { t, c: selPiece.c } })
  }
  const flipColor = () => {
    if (sel?.kind !== 'sq' || !selPiece) return
    const c: Color = selPiece.c === 0 ? 1 : 0
    if (selPiece.t === 'OU' && kingOf(pos, c)) return toast('その手番の玉は既にあります')
    if (!canStand(selPiece.t, c, sel.sq)) return
    update((p) => { p.board[sel.sq] = { t: selPiece.t, c } })
  }
  const toBox = () => {
    if (sel?.kind === 'sq') update((p) => { p.board[sel.sq] = null })
    else if (sel?.kind === 'hand') update((p) => { p.hands[sel.c][sel.t]-- })
    setSel(null)
  }

  const validate = (): string | null => {
    for (const c of [0, 1] as Color[]) {
      const files = new Set<number>()
      for (let i = 0; i < 81; i++) {
        const p = pos.board[i]
        if (!p || p.c !== c || p.t !== 'FU') continue
        if (files.has(fileOf(i))) return `${c === 0 ? '先手' : '後手'}が二歩になっています（${fileOf(i)}筋）`
        files.add(fileOf(i))
      }
    }
    if (!pos.board.some(Boolean)) return '盤に駒がありません'
    return null
  }

  const [confirming, setConfirming] = useState(false)
  // 「作成」→ 手番と名前を決めてから作る
  const create = () => {
    const err = forSearch ? null : validate()
    if (err) return toast(err)
    setSel(null)
    setConfirming(true)
  }
  const finish = () => {
    setConfirming(false)
    onCreate(name.trim() || '自由配置の局面', toSfen(pos))
  }

  const selectedLabel =
    sel?.kind === 'sq' && selPiece ? `${selPiece.c === 0 ? '☗' : '☖'}${PIECE_CHAR[selPiece.t]}（${fileOf(sel.sq)}${rankOf(sel.sq)}）`
      : sel?.kind === 'hand' ? `${sel.c === 0 ? '☗' : '☖'}持駒の${PIECE_CHAR[sel.t]}` : ''

  return (
    <div className="screen">
      <header className="bar">
        <button className="btn ghost" onClick={onBack}>‹ 戻る</button>
        <h1 className="bar-title">{forSearch ? '局面検索' : '盤面編集'}</h1>
        <button className="btn primary" onClick={create}>{forSearch ? '検索' : '作成'}</button>
      </header>

      <Board
        pos={pos}
        flipped={flipped}
        edit={{
          onSquare,
          onHandPiece,
          onHandArea,
          selectedSq: sel?.kind === 'sq' ? sel.sq : null,
          selectedHand: sel?.kind === 'hand' ? { c: sel.c, t: sel.t } : null,
        }}
      />

      <section className="panel editor">
        {sel?.kind === 'sq' || sel?.kind === 'hand' ? (
          <div className="row gap wrap">
            <span className="sel-label">{selectedLabel}</span>
            {sel.kind === 'sq' && <button className="chip" onClick={togglePromote}>成／不成</button>}
            {sel.kind === 'sq' && <button className="chip" onClick={flipColor}>先後反転</button>}
            <button className="chip" onClick={toBox}>駒箱へ</button>
            <button className="chip" onClick={() => setSel(null)}>選択解除</button>
          </div>
        ) : null}

        <div className="palette-head">
          <div className="seg small">
            <button className={color === 0 ? 'on' : ''} onClick={() => setColor(0)}>☗ 先手</button>
            <button className={color === 1 ? 'on' : ''} onClick={() => setColor(1)}>☖ 後手</button>
          </div>
          <button className={`chip ${promoted ? 'on' : ''}`} onClick={() => setPromoted(!promoted)}>成駒で置く</button>
        </div>
        <div className="palette">
          {PALETTE.map((t) => {
            const shown: PType = promoted && PROMOTE[t] ? PROMOTE[t]! : t
            return (
              <button
                key={t}
                className={`pal ${sel?.kind === 'palette' && sel.t === t ? 'selected' : ''} ${color === 1 ? 'gote' : ''}`}
                disabled={box[t] <= 0 && !(sel?.kind === 'palette' && sel.t === t)}
                onClick={() => setSel(sel?.kind === 'palette' && sel.t === t ? null : { kind: 'palette', t })}
              >
                <span className={`piece-mini ${shown !== t ? 'promoted' : ''}`}>{PIECE_CHAR[shown]}</span>
                <small>{box[t]}</small>
              </button>
            )
          })}
        </div>

        <div className="row gap wrap">
          <button className={`chip ${flipped ? 'on' : ''}`} onClick={() => setFlipped(!flipped)}>盤反転</button>
          <button className="chip" onClick={() => { setPos(parseSfen(START_SFEN)); setSel(null) }}>平手に戻す</button>
          <button className="chip" onClick={() => { setPos(emptyPos()); setSel(null) }}>全部駒箱へ</button>
          <button
            className="chip"
            onClick={() => {
              // 詰将棋向け：後手玉だけ残して他は駒箱へ
              const n = emptyPos()
              const k = pos.board.findIndex((x) => x?.t === 'OU' && x.c === 1)
              if (k >= 0) n.board[k] = { t: 'OU', c: 1 }
              setPos(n)
              setSel(null)
            }}
          >後手玉だけ残す</button>
        </div>
      </section>

      {confirming && (
        <div className="sheet-backdrop" onClick={() => setConfirming(false)}>
          <div className="sheet form" onClick={(e) => e.stopPropagation()}>
            <p className="sheet-title">{forSearch ? '検索' : '作成'}</p>
            <div className="seg">
              <button className={pos.turn === 0 ? 'on' : ''} onClick={() => update((p) => { p.turn = 0 })}>☗ 先手番</button>
              <button className={pos.turn === 1 ? 'on' : ''} onClick={() => update((p) => { p.turn = 1 })}>☖ 後手番</button>
            </div>
            {!forSearch && <input placeholder="名前" value={name} onChange={(e) => setName(e.target.value)} autoFocus />}
            <div className="row gap">
              <button className="btn grow" onClick={() => setConfirming(false)}>キャンセル</button>
              <button className="btn primary grow" onClick={finish}>{forSearch ? '検索' : '作成'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
