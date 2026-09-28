// 間隔反復（SM-2簡易版）とドリルの出題重み
import type { Book, Srs } from './book'

const DAY = 86400000

export function grade(prev: Srs | undefined, ok: boolean, now = Date.now()): Srs {
  const s: Srs = prev ? { ...prev } : { reps: 0, interval: 0, ease: 2.5, due: now, lapses: 0, last: now }
  s.last = now
  if (ok) {
    s.reps++
    s.interval = s.reps === 1 ? 1 : s.reps === 2 ? 3 : Math.round(s.interval * s.ease)
    s.ease = Math.min(2.8, s.ease + 0.05)
    s.due = now + s.interval * DAY
  } else {
    s.reps = 0
    s.interval = 0
    s.ease = Math.max(1.3, s.ease - 0.2)
    s.lapses++
    s.due = now + 10 * 60 * 1000
  }
  return s
}

/** そのノードの手番（0=先手）。平手なら深さの偶奇 */
export function turnAt(book: Book, id: string): 0 | 1 {
  const rootTurn = book.rootSfen.split(' ')[1] === 'w' ? 1 : 0
  let d = 0
  let cur = book.nodes[id].parent
  while (cur) { d++; cur = book.nodes[cur].parent }
  return ((rootTurn + d) % 2) as 0 | 1
}

export type NodeStatus = 'new' | 'due' | 'learning' | 'good'

export function statusOf(book: Book, id: string, now = Date.now()): NodeStatus {
  const s = book.srs[id]
  if (!s) return 'new'
  if (s.due <= now) return 'due'
  return s.interval >= 3 ? 'good' : 'learning'
}

/** side が答える局面（子を持つ・side の手番）の一覧 */
export function quizNodes(book: Book, side: 0 | 1, from = book.rootId): string[] {
  const out: string[] = []
  const walk = (id: string, turn: number) => {
    const n = book.nodes[id]
    if (n.children.length && turn === side) out.push(id)
    for (const c of n.children) walk(c, 1 - turn)
  }
  walk(from, turnAt(book, from))
  return out
}

/** 部分木ごとの「要復習・未学習」数。相手の手を選ぶ重みに使う */
export function weights(book: Book, side: 0 | 1, now = Date.now()): Map<string, number> {
  const w = new Map<string, number>()
  const walk = (id: string, turn: number): number => {
    const n = book.nodes[id]
    let sum = 0
    if (n.children.length && turn === side) {
      const st = statusOf(book, id, now)
      sum += st === 'due' ? 4 : st === 'new' ? 3 : st === 'learning' ? 1 : 0
    }
    for (const c of n.children) sum += walk(c, 1 - turn)
    w.set(id, sum)
    return sum
  }
  walk(book.rootId, turnAt(book, book.rootId))
  return w
}

export function pickWeighted(ids: string[], w: Map<string, number>, rnd = Math.random): string {
  const ws = ids.map((id) => 1 + 3 * (w.get(id) ?? 0))
  let r = rnd() * ws.reduce((a, b) => a + b, 0)
  for (let i = 0; i < ids.length; i++) {
    r -= ws[i]
    if (r <= 0) return ids[i]
  }
  return ids[ids.length - 1]
}

export function bookStats(book: Book, side: 0 | 1, now = Date.now()) {
  const q = quizNodes(book, side)
  let due = 0, fresh = 0, good = 0
  for (const id of q) {
    const s = statusOf(book, id, now)
    if (s === 'due') due++
    else if (s === 'new') fresh++
    else if (s === 'good') good++
  }
  return { total: q.length, due, fresh, good }
}
