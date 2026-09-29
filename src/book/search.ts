// 局面検索：完全一致と、駒の配置の重なり具合（一致度）で似た局面を探す
import { type Pos, applyMove, HAND_TYPES, parseSfen, toSfen, usiToMove, type Color } from '../shogi/core'
import type { Book } from './book'

export interface Hit {
  bookId: string
  nodeId: string
  sfen: string
  score: number // 1 = 完全一致
  ply: number
}

/**
 * 盤上81マスと持駒を「同じ駒が同じ場所にあるか」で比べる。
 * どちらかに駒があるマスのうち、両方で同じ駒のマスの割合（持駒も同様に数える）。
 * 手番が違えば少し下げる。
 */
export function similarity(a: Pos, b: Pos): number {
  let inter = 0
  let union = 0
  for (let i = 0; i < 81; i++) {
    const x = a.board[i]
    const y = b.board[i]
    if (!x && !y) continue
    union++
    if (x && y && x.t === y.t && x.c === y.c) inter++
  }
  for (const c of [0, 1] as Color[]) {
    for (const t of HAND_TYPES) {
      const p = a.hands[c][t]
      const q = b.hands[c][t]
      inter += Math.min(p, q)
      union += Math.max(p, q)
    }
  }
  const s = union ? inter / union : 1
  return a.turn === b.turn ? s : s * 0.95
}

export function searchPositions(books: Book[], query: Pos, opts: { limit?: number; min?: number } = {}) {
  const limit = opts.limit ?? 30
  const min = opts.min ?? 0.6
  const qKey = toSfen(query)
  const exact: Hit[] = []
  const similar: Hit[] = []
  for (const book of books) {
    const seen = new Set<string>() // 同じ本の中の合流は1件にまとめる
    const walk = (id: string, pos: Pos, ply: number) => {
      const key = toSfen(pos)
      if (!seen.has(key)) {
        seen.add(key)
        if (key === qKey) exact.push({ bookId: book.id, nodeId: id, sfen: key, score: 1, ply })
        else {
          const s = similarity(query, pos)
          if (s >= min) similar.push({ bookId: book.id, nodeId: id, sfen: key, score: s, ply })
        }
      }
      for (const c of book.nodes[id].children) walk(c, applyMove(pos, usiToMove(book.nodes[c].move!)), ply + 1)
    }
    walk(book.rootId, parseSfen(book.rootSfen), 0)
  }
  similar.sort((a, b) => b.score - a.score || a.ply - b.ply)
  return { exact, similar: similar.slice(0, limit) }
}
