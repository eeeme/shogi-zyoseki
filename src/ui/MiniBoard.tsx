import { HAND_TYPES, idx, parseSfen, type Color } from '../shogi/core'
import { PIECE_CHAR } from '../shogi/notation'

const PROMOTED = new Set(['TO', 'NY', 'NK', 'NG', 'UM', 'RY'])

/** 一覧用の小さな盤面（SVG・操作なし） */
export function MiniBoard({ sfen, size = 112 }: { sfen: string; size?: number }) {
  const pos = parseSfen(sfen)
  const cell = size / 9
  const hand = (c: Color) =>
    HAND_TYPES.filter((t) => pos.hands[c][t] > 0)
      .map((t) => PIECE_CHAR[t] + (pos.hands[c][t] > 1 ? pos.hands[c][t] : ''))
      .join('')
  const top = hand(1)
  const bottom = hand(0)
  const H = size + 28
  return (
    <svg className="mini-board" width={size} height={H} viewBox={`0 0 ${size} ${H}`} role="img" aria-label="局面">
      <text x={2} y={10} className="mini-hand">☖{top}</text>
      <g transform="translate(0,14)">
        <rect x={0} y={0} width={size} height={size} className="mini-bg" />
        {Array.from({ length: 8 }, (_, i) => (
          <g key={i}>
            <line x1={(i + 1) * cell} y1={0} x2={(i + 1) * cell} y2={size} className="mini-line" />
            <line x1={0} y1={(i + 1) * cell} x2={size} y2={(i + 1) * cell} className="mini-line" />
          </g>
        ))}
        {Array.from({ length: 81 }, (_, k) => {
          const f = 9 - (k % 9)
          const r = Math.floor(k / 9) + 1
          const p = pos.board[idx(f, r)]
          if (!p) return null
          const cx = (k % 9) * cell + cell / 2
          const cy = (r - 1) * cell + cell / 2
          return (
            <text
              key={k}
              x={cx}
              y={cy + cell * 0.3}
              textAnchor="middle"
              className={`mini-piece ${PROMOTED.has(p.t) ? 'promoted' : ''}`}
              fontSize={cell * 0.82}
              transform={p.c === 1 ? `rotate(180 ${cx} ${cy})` : undefined}
            >
              {PIECE_CHAR[p.t]}
            </text>
          )
        })}
      </g>
      <text x={size - 2} y={H - 3} textAnchor="end" className="mini-hand">☗{bottom}</text>
    </svg>
  )
}
