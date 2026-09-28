import { useEffect, useMemo, useRef } from 'react'
import { applyMove, parseSfen, toSfen, usiToMove, type Pos } from '../shogi/core'
import { moveToJa } from '../shogi/notation'
import { type Book, pathTo } from '../book/book'
import { statusOf } from '../book/srs'

interface Props {
  book: Book
  currentId: string
  rev: number
  onSelect: (id: string) => void
}

interface LNode {
  id: string
  col: number
  row: number
  label: string
  parentCol: number | null
  comment: boolean
  transposed: boolean
}

const W = 78
const H = 28
const CX = 86 // 列の間隔
const RY = 40 // 行（手数）の間隔
const PAD = 8

/** 縦方向（手数）に伸び、分岐は右の列へフォークする定跡フローチャート */
export function TreeView({ book, currentId, rev, onSelect }: Props) {
  const layout = useMemo(() => {
    const out: LNode[] = []
    const keyOf = new Map<string, string>()
    const seen = new Map<string, number>()
    let nextCol = 0
    const walk = (id: string, pos: Pos, prevTo: number | null, col: number, row: number, parentCol: number | null) => {
      const n = book.nodes[id]
      let label = '開始局面'
      let nextPos = pos
      let nextPrev = prevTo
      if (n.move) {
        const m = usiToMove(n.move)
        label = moveToJa(pos, m, prevTo)
        nextPos = applyMove(pos, m)
        nextPrev = m.to
      }
      const key = toSfen(nextPos)
      keyOf.set(id, key)
      seen.set(key, (seen.get(key) ?? 0) + 1)
      out.push({ id, col, row, label, parentCol, comment: !!n.comment, transposed: false })
      n.children.forEach((c, i) => {
        // 本線は同じ列、分岐は新しい列へ（先に出た分岐の部分木を書き終えてから割り当てるので線が交差しない）
        const cc = i === 0 ? col : ++nextCol
        walk(c, nextPos, nextPrev, cc, row + 1, col)
      })
    }
    walk(book.rootId, parseSfen(book.rootSfen), null, 0, 0, null)
    for (const n of out) n.transposed = (seen.get(keyOf.get(n.id)!) ?? 0) > 1
    return { nodes: out, cols: nextCol + 1, rows: Math.max(...out.map((n) => n.row)) + 1 }
    // rev で本の変更を検知する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, rev])

  const onPath = useMemo(() => new Set(pathTo(book, currentId)), [book, currentId, rev])
  const byId = useMemo(() => new Map(layout.nodes.map((n) => [n.id, n])), [layout])
  const boxRef = useRef<HTMLDivElement>(null)

  const cx = (col: number) => PAD + col * CX + W / 2
  const cy = (row: number) => PAD + row * RY + H / 2

  useEffect(() => {
    const n = byId.get(currentId)
    const el = boxRef.current
    if (!n || !el) return
    // 縦は中央へ。横は見えていない時だけ動かす（左端にいればページのスワイプがそのまま効く）
    const y = cy(n.row) - el.clientHeight / 2
    const nx = cx(n.col)
    const visible = nx - W / 2 >= el.scrollLeft && nx + W / 2 <= el.scrollLeft + el.clientWidth
    const x = visible ? el.scrollLeft : nx - el.clientWidth / 2
    el.scrollTo({ left: Math.max(0, x), top: Math.max(0, y), behavior: 'smooth' })
  }, [currentId, byId])

  const width = PAD * 2 + (layout.cols - 1) * CX + W
  const height = PAD * 2 + (layout.rows - 1) * RY + H

  return (
    <div className="tree-box" ref={boxRef}>
      <svg width={width} height={height} className="tree-svg" role="img" aria-label="定跡ツリー">
        {layout.nodes.map((n) => {
          if (n.parentCol === null) return null
          const x1 = cx(n.parentCol)
          const y1 = cy(n.row - 1) + H / 2
          const x2 = cx(n.col)
          const y2 = cy(n.row) - H / 2
          const mid = y1 + (y2 - y1) / 2
          const d = x1 === x2 ? `M${x1} ${y1}V${y2}` : `M${x1} ${y1}V${mid}H${x2}V${y2}`
          return <path key={`e-${n.id}`} d={d} className={`tree-edge ${onPath.has(n.id) ? 'on' : ''}`} />
        })}
        {layout.nodes.map((n) => {
          const st = n.row === 0 ? null : statusOf(book, book.nodes[n.id].parent!)
          return (
            <g key={n.id} className={`tree-node ${n.id === currentId ? 'current' : ''} ${onPath.has(n.id) ? 'on' : ''}`} onClick={() => onSelect(n.id)}>
              <rect x={cx(n.col) - W / 2} y={cy(n.row) - H / 2} width={W} height={H} rx={6} />
              <text x={cx(n.col)} y={cy(n.row) + 4.5} textAnchor="middle">{n.label}</text>
              {st && st !== 'new' && <circle cx={cx(n.col) - W / 2 + 7} cy={cy(n.row) - H / 2 + 7} r={3} className={`dot ${st}`} />}
              {n.comment && <text x={cx(n.col) + W / 2 - 7} y={cy(n.row) - H / 2 + 10} className="mark" textAnchor="middle">＊</text>}
              {n.transposed && <text x={cx(n.col) + W / 2 - 7} y={cy(n.row) + H / 2 - 3} className="mark" textAnchor="middle">⇄</text>}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
