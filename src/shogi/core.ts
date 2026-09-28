// 将棋の最小コア：局面・指し手生成（王手放置は判定しない擬似合法手）・適用・SFEN
export type Color = 0 | 1 // 0 = 先手, 1 = 後手
export type HandType = 'FU' | 'KY' | 'KE' | 'GI' | 'KI' | 'KA' | 'HI'
export type BaseType = HandType | 'OU'
export type PromotedType = 'TO' | 'NY' | 'NK' | 'NG' | 'UM' | 'RY'
export type PType = BaseType | PromotedType

export interface Piece {
  t: PType
  c: Color
}

export type Hand = Record<HandType, number>

export interface Pos {
  board: (Piece | null)[] // index = (rank-1)*9 + (file-1)
  hands: [Hand, Hand]
  turn: Color
}

export interface Move {
  from: number | null // null = 打
  to: number
  drop: HandType | null
  promote: boolean
}

export const HAND_TYPES: HandType[] = ['HI', 'KA', 'KI', 'GI', 'KE', 'KY', 'FU']

export const PROMOTE: Partial<Record<PType, PromotedType>> = {
  FU: 'TO', KY: 'NY', KE: 'NK', GI: 'NG', KA: 'UM', HI: 'RY',
}
export const UNPROMOTE: Record<PType, BaseType> = {
  FU: 'FU', KY: 'KY', KE: 'KE', GI: 'GI', KI: 'KI', KA: 'KA', HI: 'HI', OU: 'OU',
  TO: 'FU', NY: 'KY', NK: 'KE', NG: 'GI', UM: 'KA', RY: 'HI',
}

export const idx = (file: number, rank: number) => (rank - 1) * 9 + (file - 1)
export const fileOf = (i: number) => (i % 9) + 1
export const rankOf = (i: number) => Math.floor(i / 9) + 1

const emptyHand = (): Hand => ({ FU: 0, KY: 0, KE: 0, GI: 0, KI: 0, KA: 0, HI: 0 })

export const START_SFEN = 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1'

// ---------- SFEN ----------
const SFEN_CHAR: Record<BaseType, string> = {
  FU: 'P', KY: 'L', KE: 'N', GI: 'S', KI: 'G', KA: 'B', HI: 'R', OU: 'K',
}
const CHAR_SFEN: Record<string, BaseType> = Object.fromEntries(
  Object.entries(SFEN_CHAR).map(([k, v]) => [v, k as BaseType]),
)

export function parseSfen(sfen: string): Pos {
  const [boardStr, turnStr, handStr] = sfen.trim().split(/\s+/)
  if (!boardStr || !turnStr) throw new Error('SFENの形式が正しくありません')
  const board: (Piece | null)[] = new Array(81).fill(null)
  const ranks = boardStr.split('/')
  if (ranks.length !== 9) throw new Error('SFENの段数が9ではありません')
  ranks.forEach((row, r) => {
    let file = 9
    let promoted = false
    for (const ch of row) {
      if (ch === '+') { promoted = true; continue }
      if (/\d/.test(ch)) { file -= Number(ch); continue }
      const base = CHAR_SFEN[ch.toUpperCase()]
      if (!base) throw new Error(`SFENの駒文字が不明です: ${ch}`)
      const t: PType = promoted ? (PROMOTE[base] ?? base) : base
      board[idx(file, r + 1)] = { t, c: ch === ch.toUpperCase() ? 0 : 1 }
      promoted = false
      file--
    }
  })
  const hands: [Hand, Hand] = [emptyHand(), emptyHand()]
  if (handStr && handStr !== '-') {
    let n = ''
    for (const ch of handStr) {
      if (/\d/.test(ch)) { n += ch; continue }
      const base = CHAR_SFEN[ch.toUpperCase()]
      if (!base || base === 'OU') throw new Error(`SFENの持ち駒が不明です: ${ch}`)
      hands[ch === ch.toUpperCase() ? 0 : 1][base] += n ? Number(n) : 1
      n = ''
    }
  }
  return { board, hands, turn: turnStr === 'w' ? 1 : 0 }
}

/** 手数を含まない局面キー（合流判定に使う） */
export function toSfen(pos: Pos): string {
  const rows: string[] = []
  for (let r = 1; r <= 9; r++) {
    let row = ''
    let empty = 0
    for (let f = 9; f >= 1; f--) {
      const p = pos.board[idx(f, r)]
      if (!p) { empty++; continue }
      if (empty) { row += empty; empty = 0 }
      const base = UNPROMOTE[p.t]
      const ch = (p.t !== base ? '+' : '') + SFEN_CHAR[base]
      row += p.c === 0 ? ch : ch.toLowerCase()
    }
    if (empty) row += empty
    rows.push(row)
  }
  let hand = ''
  for (const c of [0, 1] as Color[]) {
    for (const t of HAND_TYPES) {
      const n = pos.hands[c][t]
      if (!n) continue
      const ch = c === 0 ? SFEN_CHAR[t] : SFEN_CHAR[t].toLowerCase()
      hand += (n > 1 ? n : '') + ch
    }
  }
  return `${rows.join('/')} ${pos.turn === 0 ? 'b' : 'w'} ${hand || '-'}`
}

export const startPos = () => parseSfen(START_SFEN)

export function clonePos(p: Pos): Pos {
  return {
    board: p.board.map((x) => (x ? { ...x } : null)),
    hands: [{ ...p.hands[0] }, { ...p.hands[1] }],
    turn: p.turn,
  }
}

// ---------- 指し手生成 ----------
type Vec = [number, number] // [dfile, drank] 先手から見て前進 = drank -1
const GOLD: Vec[] = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [0, 1]]
const KING: Vec[] = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]
const DIAG: Vec[] = [[-1, -1], [1, -1], [-1, 1], [1, 1]]
const ORTHO: Vec[] = [[0, -1], [-1, 0], [1, 0], [0, 1]]

const STEPS: Record<PType, Vec[]> = {
  FU: [[0, -1]], KY: [], KE: [[-1, -2], [1, -2]],
  GI: [[-1, -1], [0, -1], [1, -1], [-1, 1], [1, 1]],
  KI: GOLD, TO: GOLD, NY: GOLD, NK: GOLD, NG: GOLD,
  OU: KING, KA: [], HI: [], UM: ORTHO, RY: DIAG,
}
const SLIDES: Partial<Record<PType, Vec[]>> = {
  KY: [[0, -1]], KA: DIAG, HI: ORTHO, UM: DIAG, RY: ORTHO,
}

const inZone = (c: Color, rank: number) => (c === 0 ? rank <= 3 : rank >= 7)

/** 行き所のない駒になるか（その段に置けない） */
export function deadEnd(t: PType, c: Color, rank: number): boolean {
  const rel = c === 0 ? rank : 10 - rank
  if (t === 'FU' || t === 'KY') return rel === 1
  if (t === 'KE') return rel <= 2
  return false
}

function pushBoardMove(out: Move[], p: Piece, from: number, to: number) {
  const fr = rankOf(from)
  const tr = rankOf(to)
  const canPromote = PROMOTE[p.t] !== undefined && (inZone(p.c, fr) || inZone(p.c, tr))
  if (canPromote) out.push({ from, to, drop: null, promote: true })
  if (!deadEnd(p.t, p.c, tr)) out.push({ from, to, drop: null, promote: false })
}

export function generateMoves(pos: Pos): Move[] {
  const out: Move[] = []
  const c = pos.turn
  const sign = c === 0 ? 1 : -1
  for (let i = 0; i < 81; i++) {
    const p = pos.board[i]
    if (!p || p.c !== c) continue
    const f = fileOf(i)
    const r = rankOf(i)
    for (const [df, dr] of STEPS[p.t]) {
      const nf = f + df * sign
      const nr = r + dr * sign
      if (nf < 1 || nf > 9 || nr < 1 || nr > 9) continue
      const t = pos.board[idx(nf, nr)]
      if (t && t.c === c) continue
      pushBoardMove(out, p, i, idx(nf, nr))
    }
    for (const [df, dr] of SLIDES[p.t] ?? []) {
      let nf = f + df * sign
      let nr = r + dr * sign
      while (nf >= 1 && nf <= 9 && nr >= 1 && nr <= 9) {
        const t = pos.board[idx(nf, nr)]
        if (t && t.c === c) break
        pushBoardMove(out, p, i, idx(nf, nr))
        if (t) break
        nf += df * sign
        nr += dr * sign
      }
    }
  }
  // 打つ手
  const pawnFiles = new Set<number>()
  for (let i = 0; i < 81; i++) {
    const p = pos.board[i]
    if (p && p.c === c && p.t === 'FU') pawnFiles.add(fileOf(i))
  }
  for (const t of HAND_TYPES) {
    if (!pos.hands[c][t]) continue
    for (let i = 0; i < 81; i++) {
      if (pos.board[i]) continue
      if (deadEnd(t, c, rankOf(i))) continue
      if (t === 'FU' && pawnFiles.has(fileOf(i))) continue // 二歩
      out.push({ from: null, to: i, drop: t, promote: false })
    }
  }
  return out
}

export function applyMove(pos: Pos, m: Move): Pos {
  const n = clonePos(pos)
  const c = pos.turn
  if (m.drop) {
    n.hands[c][m.drop]--
    n.board[m.to] = { t: m.drop, c }
  } else if (m.from !== null) {
    const p = n.board[m.from]
    if (!p) throw new Error('移動元に駒がありません')
    const cap = n.board[m.to]
    if (cap) {
      const base = UNPROMOTE[cap.t]
      if (base !== 'OU') n.hands[c][base]++
    }
    n.board[m.from] = null
    n.board[m.to] = { t: m.promote ? (PROMOTE[p.t] ?? p.t) : p.t, c }
  }
  n.turn = c === 0 ? 1 : 0
  return n
}

export const sameMove = (a: Move, b: Move) =>
  a.from === b.from && a.to === b.to && a.drop === b.drop && a.promote === b.promote

export function isLegalish(pos: Pos, m: Move): boolean {
  return generateMoves(pos).some((x) => sameMove(x, m))
}

// ---------- USI ----------
const RANK_CH = 'abcdefghi'
const sqUsi = (i: number) => `${fileOf(i)}${RANK_CH[rankOf(i) - 1]}`

export function moveToUsi(m: Move): string {
  if (m.drop) return `${SFEN_CHAR[m.drop]}*${sqUsi(m.to)}`
  return `${sqUsi(m.from!)}${sqUsi(m.to)}${m.promote ? '+' : ''}`
}

function usiSq(s: string): number {
  const f = Number(s[0])
  const r = RANK_CH.indexOf(s[1]) + 1
  if (!(f >= 1 && f <= 9) || r < 1) throw new Error(`USIのマス指定が不正です: ${s}`)
  return idx(f, r)
}

export function usiToMove(u: string): Move {
  const s = u.trim()
  if (/^[PLNSGBR]\*[1-9][a-i]$/.test(s)) {
    return { from: null, to: usiSq(s.slice(2)), drop: CHAR_SFEN[s[0]] as HandType, promote: false }
  }
  if (/^[1-9][a-i][1-9][a-i]\+?$/.test(s)) {
    return { from: usiSq(s.slice(0, 2)), to: usiSq(s.slice(2, 4)), drop: null, promote: s.endsWith('+') }
  }
  throw new Error(`USIの指し手が不正です: ${u}`)
}
