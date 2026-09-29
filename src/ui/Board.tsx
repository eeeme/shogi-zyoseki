import { type ReactNode, useMemo, useState } from 'react'
import {
  type Color, type HandType, type Move, type Pos, HAND_TYPES, fileOf, generateMoves, idx, rankOf,
} from '../shogi/core'
import { PIECE_CHAR, fileJa, rankJa } from '../shogi/notation'

interface Props {
  pos: Pos
  flipped?: boolean
  lastTo?: number | null
  lastFrom?: number | null
  hint?: Move | null
  hidePieces?: boolean
  interactive?: boolean
  onMove?: (m: Move) => void
  /** 参照用：指定すると盤のタップは指し手ではなく、盤の左右どちら側かを渡す */
  onTapSide?: (side: 'left' | 'right') => void
  /** 下の持駒欄の右端に置くボタン類 */
  toolbar?: ReactNode
  /** 盤面編集用：指定すると指し手のルールを使わず、タップをそのまま渡す */
  edit?: {
    onSquare: (sq: number) => void
    onHandPiece: (c: Color, t: HandType) => void
    onHandArea: (c: Color) => void
    selectedSq: number | null
    selectedHand: { c: Color; t: HandType } | null
  }
}

type Sel = { kind: 'sq'; sq: number } | { kind: 'hand'; t: HandType } | null

export function Board({ pos, flipped = false, lastTo, lastFrom, hint, hidePieces, interactive = true, onMove, edit, onTapSide, toolbar }: Props) {
  const [sel, setSel] = useState<Sel>(null)
  const [promo, setPromo] = useState<Move[] | null>(null)
  const [prevPos, setPrevPos] = useState(pos)
  if (prevPos !== pos) {
    setPrevPos(pos)
    setSel(null)
    setPromo(null)
  }
  const legal = useMemo(() => generateMoves(pos), [pos])

  const targets = useMemo(() => {
    if (!sel || hidePieces) return new Set<number>()
    return new Set(
      legal
        .filter((m) => (sel.kind === 'sq' ? m.from === sel.sq : m.drop === sel.t))
        .map((m) => m.to),
    )
  }, [sel, legal, hidePieces])

  const commit = (cands: Move[]) => {
    setSel(null)
    if (cands.length === 1) onMove?.(cands[0])
    else if (cands.length > 1) setPromo(cands)
  }

  const tapSquare = (sq: number) => {
    if (edit) return edit.onSquare(sq)
    if (!interactive || promo) return
    const p = pos.board[sq]
    if (sel?.kind === 'hand') {
      const c = legal.filter((m) => m.drop === sel.t && m.to === sq)
      if (c.length) return commit(c)
      setSel(null)
      return
    }
    if (sel?.kind === 'sq') {
      if (sel.sq === sq) return setSel(null)
      const c = legal.filter((m) => m.from === sel.sq && m.to === sq)
      if (c.length) return commit(c)
      if (!hidePieces && p && p.c === pos.turn) return setSel({ kind: 'sq', sq })
      if (hidePieces) return setSel({ kind: 'sq', sq })
      return setSel(null)
    }
    if (hidePieces || (p && p.c === pos.turn)) setSel({ kind: 'sq', sq })
  }

  const tapHand = (c: Color, t: HandType) => {
    if (edit) return edit.onHandPiece(c, t)
    if (!interactive || c !== pos.turn || promo) return
    setSel(sel?.kind === 'hand' && sel.t === t ? null : { kind: 'hand', t })
  }

  const files = flipped ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : [9, 8, 7, 6, 5, 4, 3, 2, 1]
  const ranks = flipped ? [9, 8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8, 9]
  const bottom: Color = flipped ? 1 : 0

  const hand = (c: Color) => (
    <div
      className={`hand ${c === bottom ? 'hand-bottom' : 'hand-top'} ${edit ? 'hand-edit' : ''}`}
      onClick={edit ? (e) => { if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('hand-empty')) edit.onHandArea(c) } : undefined}
    >
      <span className="hand-mark">{c === 0 ? '☗' : '☖'}</span>
      {HAND_TYPES.filter((t) => pos.hands[c][t] > 0).map((t) => (
        <button
          key={t}
          className={`hand-piece ${(edit ? edit.selectedHand?.c === c && edit.selectedHand.t === t : sel?.kind === 'hand' && sel.t === t && c === pos.turn) ? 'selected' : ''} ${hint?.drop === t && c === pos.turn ? 'hint' : ''}`}
          onClick={(e) => { e.stopPropagation(); tapHand(c, t) }}
        >
          {PIECE_CHAR[t]}
          {pos.hands[c][t] > 1 && <small>{pos.hands[c][t]}</small>}
        </button>
      ))}
      {HAND_TYPES.every((t) => pos.hands[c][t] === 0) && <span className="hand-empty">{edit ? '＋' : ''}</span>}
    </div>
  )

  return (
    <div className="board-wrap">
      {hand(bottom === 0 ? 1 : 0)}
      <div className="board-frame">
        <div className="board-files">
          {files.map((f) => <span key={f}>{fileJa(f)}</span>)}
        </div>
        <div className="board-row">
          <div className={`board ${hidePieces ? 'blind' : ''}`}>
            {ranks.map((r) =>
              files.map((f) => {
                const sq = idx(f, r)
                const p = pos.board[sq]
                const cls = [
                  'sq',
                  (edit ? edit.selectedSq === sq : sel?.kind === 'sq' && sel.sq === sq) ? 'selected' : '',
                  targets.has(sq) ? 'target' : '',
                  lastTo === sq ? 'last' : '',
                  lastFrom === sq ? 'last-from' : '',
                  hint && (hint.to === sq || hint.from === sq) ? 'hint' : '',
                  // 星は 3|4筋・6|7筋 と 3|4段・6|7段 の交点（マスの右下角に描く）
                  (flipped ? (f === 3 || f === 6) && (r === 4 || r === 7) : (f === 4 || f === 7) && (r === 3 || r === 6)) ? 'star' : '',
                ].join(' ')
                return (
                  <button
                    key={sq}
                    className={cls}
                    onClick={(e) => {
                      if (onTapSide) {
                        const r = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect()
                        return onTapSide(e.clientX < r.left + r.width / 2 ? 'left' : 'right')
                      }
                      tapSquare(sq)
                    }}
                    aria-label={`${fileOf(sq)}${rankOf(sq)}`}
                  >
                    {p && !hidePieces && (
                      <span className={`piece ${p.c !== bottom ? 'up' : ''} ${['TO', 'NY', 'NK', 'NG', 'UM', 'RY'].includes(p.t) ? 'promoted' : ''}`}>
                        {PIECE_CHAR[p.t]}
                      </span>
                    )}
                  </button>
                )
              }),
            )}
          </div>
          <div className="board-ranks">
            {ranks.map((r) => <span key={r}>{rankJa(r)}</span>)}
          </div>
        </div>
        {promo && (
          <div className="promo">
            <span>成りますか？</span>
            <button className="btn primary" onClick={() => { const m = promo.find((x) => x.promote)!; setPromo(null); onMove?.(m) }}>成</button>
            <button className="btn" onClick={() => { const m = promo.find((x) => !x.promote)!; setPromo(null); onMove?.(m) }}>不成</button>
          </div>
        )}
      </div>
      {toolbar ? <div className="hand-row">{hand(bottom)}<div className="board-tools">{toolbar}</div></div> : hand(bottom)}
    </div>
  )
}
