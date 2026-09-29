// KIF の局面図（BOD形式）の読み書き。途中局面・詰将棋・自由配置の本に使う
import { type Color, type Hand, type HandType, type Pos, type PType, HAND_TYPES, idx, toSfen, parseSfen, START_SFEN } from '../shogi/core'
import { PIECE_CHAR } from '../shogi/notation'

const CHAR_PIECE: Record<string, PType> = {
  歩: 'FU', 香: 'KY', 桂: 'KE', 銀: 'GI', 金: 'KI', 角: 'KA', 飛: 'HI', 玉: 'OU', 王: 'OU',
  と: 'TO', 杏: 'NY', 圭: 'NK', 全: 'NG', 馬: 'UM', 龍: 'RY', 竜: 'RY',
}
const HAND_CHAR: Record<HandType, string> = { HI: '飛', KA: '角', KI: '金', GI: '銀', KE: '桂', KY: '香', FU: '歩' }
const KAN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十']

const kanNum = (n: number) => (n <= 10 ? KAN[n] : `十${KAN[n - 10]}`)
function parseKanNum(s: string): number {
  if (!s) return 1
  if (/^\d+$/.test(s)) return Number(s)
  if (s.startsWith('十')) return 10 + (s.length > 1 ? KAN.indexOf(s[1]) : 0)
  return KAN.indexOf(s)
}

export const hasBod = (text: string) => /^\s*\|/m.test(text) && /^\s*\+-{5,}/m.test(text)

function parseHand(s: string): Hand {
  const h: Hand = { FU: 0, KY: 0, KE: 0, GI: 0, KI: 0, KA: 0, HI: 0 }
  const body = s.replace(/^.*?[：:]/, '').trim()
  if (!body || body === 'なし') return h
  for (const tok of body.split(/[\s　]+/)) {
    if (!tok) continue
    const t = CHAR_PIECE[tok[0]]
    if (!t || t === 'OU') throw new Error(`持駒を読めません: ${tok}`)
    h[t as HandType] += parseKanNum(tok.slice(1))
  }
  return h
}

/** 局面図 → SFEN（手番込み） */
export function parseBod(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const rows = lines.filter((l) => /^\s*\|/.test(l)).slice(0, 9)
  if (rows.length !== 9) throw new Error('局面図の段数が9ではありません')
  const pos: Pos = parseSfen('9/9/9/9/9/9/9/9/9 b -')
  rows.forEach((raw, r) => {
    const body = raw.trim().slice(1)
    for (let i = 0; i < 9; i++) {
      const cell = body.slice(i * 2, i * 2 + 2)
      const ch = cell[1]
      if (!ch || ch === '・' || ch === ' ' || ch === '　') continue
      const t = CHAR_PIECE[ch]
      if (!t) throw new Error(`局面図の駒を読めません: ${cell}`)
      pos.board[idx(9 - i, r + 1)] = { t, c: cell[0] === 'v' ? 1 : 0 }
    }
  })
  let turn: Color = 0
  for (const l of lines) {
    const s = l.trim()
    if (/^(先手|下手)の持駒/.test(s)) pos.hands[0] = parseHand(s)
    else if (/^(後手|上手)の持駒/.test(s)) pos.hands[1] = parseHand(s)
    else if (/^(後手|上手)番/.test(s)) turn = 1
  }
  pos.turn = turn
  return toSfen(pos)
}

const handLine = (label: string, h: Hand) => {
  const parts = HAND_TYPES.filter((t) => h[t] > 0).map((t) => HAND_CHAR[t] + (h[t] > 1 ? kanNum(h[t]) : ''))
  return `${label}の持駒：${parts.length ? parts.join('　') : 'なし'}`
}

/** SFEN → 局面図の行（KIFヘッダーに入れる） */
export function toBod(sfen: string): string[] {
  const pos = parseSfen(sfen)
  const out = [handLine('後手', pos.hands[1]), '  ９ ８ ７ ６ ５ ４ ３ ２ １', '+---------------------------+']
  const KANR = '一二三四五六七八九'
  for (let r = 1; r <= 9; r++) {
    let row = '|'
    for (let f = 9; f >= 1; f--) {
      const p = pos.board[idx(f, r)]
      row += p ? (p.c === 1 ? 'v' : ' ') + PIECE_CHAR[p.t] : ' ・'
    }
    out.push(`${row}|${KANR[r - 1]}`)
  }
  out.push('+---------------------------+', handLine('先手', pos.hands[0]))
  if (pos.turn === 1) out.push('後手番')
  return out
}

export const isStartSfen = (sfen: string) => toSfen(parseSfen(sfen)) === toSfen(parseSfen(START_SFEN))
