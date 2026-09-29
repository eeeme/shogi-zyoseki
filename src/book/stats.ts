// 次の手の出現率・勝率：全部の本から「同じ局面（盤・持駒・手番）」の次の手を集計する
import { applyMove, parseSfen, toSfen, usiToMove, type Pos } from '../shogi/core'
import type { Book } from './book'

interface MoveAgg {
  books: Set<string>
  decided: number // 勝敗のある本の数
  wins: number // そのうち、この手を指した側が勝った本の数
}
interface PosAgg {
  books: Set<string> // この局面から次の手がある本
  moves: Map<string, MoveAgg>
}
export type StatsIndex = Map<string, PosAgg>

export function buildStatsIndex(books: Book[]): StatsIndex {
  const idx: StatsIndex = new Map()
  for (const book of books) {
    const r = book.meta?.result
    const winner = r === '先手勝ち' ? 0 : r === '後手勝ち' ? 1 : null
    const walk = (id: string, pos: Pos) => {
      const n = book.nodes[id]
      if (n.children.length) {
        const key = toSfen(pos)
        let agg = idx.get(key)
        if (!agg) idx.set(key, (agg = { books: new Set(), moves: new Map() }))
        agg.books.add(book.id)
        for (const c of n.children) {
          const usi = book.nodes[c].move!
          let m = agg.moves.get(usi)
          if (!m) agg.moves.set(usi, (m = { books: new Set(), decided: 0, wins: 0 }))
          if (!m.books.has(book.id)) {
            m.books.add(book.id)
            if (winner !== null) {
              m.decided++
              if (winner === pos.turn) m.wins++
            }
          }
        }
      }
      for (const c of n.children) walk(c, applyMove(pos, usiToMove(book.nodes[c].move!)))
    }
    walk(book.rootId, parseSfen(book.rootSfen))
  }
  return idx
}

export interface MoveStat {
  usi: string
  count: number // この手が指された本の数
  rate: number // 出現率 0〜1
  winRate: number | null // 勝敗のある本が2局以上ある時だけ
}

/** 2局未満の局面は null（表示しない） */
export function nextMoveStats(idx: StatsIndex, pos: Pos): MoveStat[] | null {
  const agg = idx.get(toSfen(pos))
  if (!agg || agg.books.size < 2) return null
  const total = agg.books.size
  return [...agg.moves.entries()]
    .map(([usi, m]) => ({
      usi,
      count: m.books.size,
      rate: m.books.size / total,
      winRate: m.decided >= 2 ? m.wins / m.decided : null,
    }))
    .sort((a, b) => b.count - a.count)
}
