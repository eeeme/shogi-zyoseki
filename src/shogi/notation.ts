// 日本語表記（KI2風の表示・解析）と読み上げ用カタカナ
import {
  type Color, type HandType, type Move, type Pos, type PType,
  PROMOTE, fileOf, generateMoves, idx, rankOf,
} from './core'

export const PIECE_JA: Record<PType, string> = {
  FU: '歩', KY: '香', KE: '桂', GI: '銀', KI: '金', KA: '角', HI: '飛', OU: '玉',
  TO: 'と', NY: '成香', NK: '成桂', NG: '成銀', UM: '馬', RY: '龍',
}
/** 盤上1文字表示用 */
export const PIECE_CHAR: Record<PType, string> = {
  FU: '歩', KY: '香', KE: '桂', GI: '銀', KI: '金', KA: '角', HI: '飛', OU: '玉',
  TO: 'と', NY: '杏', NK: '圭', NG: '全', UM: '馬', RY: '龍',
}
const JA_PIECE: Record<string, PType> = {
  歩: 'FU', 香: 'KY', 桂: 'KE', 銀: 'GI', 金: 'KI', 角: 'KA', 飛: 'HI', 玉: 'OU', 王: 'OU',
  と: 'TO', 成香: 'NY', 杏: 'NY', 成桂: 'NK', 圭: 'NK', 成銀: 'NG', 全: 'NG',
  馬: 'UM', 龍: 'RY', 竜: 'RY',
}

const ZEN = '０１２３４５６７８９'
const KAN = '〇一二三四五六七八九'
export const fileJa = (f: number) => ZEN[f]
export const rankJa = (r: number) => KAN[r]
export const colorMark = (c: Color) => (c === 0 ? '▲' : '△')

const digit = (ch: string): number => {
  for (const s of [ZEN, KAN, '0123456789']) {
    const i = s.indexOf(ch)
    if (i >= 0) return i
  }
  return NaN
}

const pieceAt = (pos: Pos, m: Move): PType => (m.drop ? m.drop : pos.board[m.from!]!.t)

/** 指し手を「▲７六歩」「△同　角成」「▲５八金右」の形で表示 */
export function moveToJa(pos: Pos, m: Move, prevTo: number | null, withMark = true): string {
  const t = pieceAt(pos, m)
  const dest = m.to === prevTo ? '同　' : `${fileJa(fileOf(m.to))}${rankJa(rankOf(m.to))}`
  let s = `${withMark ? colorMark(pos.turn) : ''}${dest}${PIECE_JA[t]}`
  if (m.drop) {
    // 盤上の同種駒がそのマスに行けるときだけ「打」が必要だが、分かりやすさ優先で常に付ける
    return s + '打'
  }
  s += disambiguate(pos, m, t)
  const fr = rankOf(m.from!)
  const tr = rankOf(m.to)
  const zone = (r: number) => (pos.turn === 0 ? r <= 3 : r >= 7)
  if (m.promote) s += '成'
  else if (PROMOTE[t] && (zone(fr) || zone(tr))) s += '不成'
  return s
}

// 先手視点の相対値：dy>0 = 上（前進）
const dyOf = (c: Color, from: number, to: number) =>
  c === 0 ? rankOf(from) - rankOf(to) : rankOf(to) - rankOf(from)
// 先手視点の「右」は筋が小さい方
const rightness = (c: Color, sq: number) => (c === 0 ? -fileOf(sq) : fileOf(sq))

function disambiguate(pos: Pos, m: Move, t: PType): string {
  const cands = generateMoves(pos).filter(
    (x) => x.from !== null && x.to === m.to && !x.promote && pos.board[x.from]!.t === t,
  )
  const froms = [...new Set(cands.map((x) => x.from!))]
  if (froms.length <= 1) return ''
  const c = pos.turn
  const from = m.from!
  const vert = (f: number) => {
    const dy = dyOf(c, f, m.to)
    return dy > 0 ? '上' : dy < 0 ? '引' : '寄'
  }
  const v = vert(from)
  const sameV = froms.filter((f) => vert(f) === v)
  if (sameV.length === 1) return v
  // 直
  if (v === '上' && fileOf(from) === fileOf(m.to) && sameV.filter((f) => fileOf(f) === fileOf(m.to)).length === 1 && t !== 'UM' && t !== 'RY') {
    return '直'
  }
  const pool = sameV
  const rs = pool.map((f) => rightness(c, f))
  const me = rightness(c, from)
  const maxR = Math.max(...rs)
  const minR = Math.min(...rs)
  const tag = (me === maxR && rs.filter((x) => x === maxR).length === 1) ? '右'
    : (me === minR && rs.filter((x) => x === minR).length === 1) ? '左' : ''
  if (!tag) return `(${fileOf(from)}${rankOf(from)})`
  // 横の区別だけで足りるなら縦を省く
  const rsAll = froms.map((f) => rightness(c, f))
  const uniqueAll = rsAll.filter((x) => x === me).length === 1 &&
    (tag === '右' ? me === Math.max(...rsAll) : me === Math.min(...rsAll))
  return uniqueAll ? tag : tag + v
}

// ---------- 日本語表記の解析 ----------
const JA_RE =
  /^([▲△☗☖])?\s*(同\s*|[1-9１-９][1-9１-９一二三四五六七八九])\s*(成香|成桂|成銀|[歩香桂銀金角飛玉王と馬龍竜全圭杏])(右|左|直)?(上|引|寄|行|入)?(右|左|直)?(不成|生|成|打)?\s*(?:\((\d)(\d)\))?$/

export interface ParsedJa {
  move: Move
}

/** 「７六歩(77)」「同　歩」「５八金右」「５五角打」などを現局面で解決する */
export function parseJaMove(pos: Pos, text: string, prevTo: number | null): Move {
  const s = text.replace(/　/g, ' ').trim()
  const m = JA_RE.exec(s)
  if (!m) throw new Error(`指し手を読めません: ${text}`)
  const [, , dst, pc, h1, vt, h2, suffix, sf, sr] = m
  let to: number
  if (dst.startsWith('同')) {
    if (prevTo === null) throw new Error(`「同」の直前の手がありません: ${text}`)
    to = prevTo
  } else {
    to = idx(digit(dst[0]), digit(dst[1]))
  }
  const t = JA_PIECE[pc]
  const horiz = h1 || h2 || ''
  const promote = suffix === '成'

  if (sf && sr) {
    const from = idx(Number(sf), Number(sr))
    if (Number(sf) === 0) {
      // KIFで(00)は打
      return { from: null, to, drop: t as HandType, promote: false }
    }
    return { from, to, drop: null, promote }
  }

  const all = generateMoves(pos)
  let cands = all.filter(
    (x) => x.from !== null && x.to === to && pos.board[x.from]!.t === t && x.promote === promote,
  )
  if (suffix === '打' || (cands.length === 0 && !horiz && !vt)) {
    const drop = all.find((x) => x.drop === t && x.to === to)
    if (drop) return drop
    if (suffix === '打') throw new Error(`その駒は打てません: ${text}`)
  }
  const c = pos.turn
  if (vt) {
    const want = vt === '行' || vt === '入' ? '上' : vt
    cands = cands.filter((x) => {
      const dy = dyOf(c, x.from!, to)
      return want === '上' ? dy > 0 : want === '引' ? dy < 0 : dy === 0
    })
  }
  if (horiz === '直') {
    cands = cands.filter((x) => fileOf(x.from!) === fileOf(to) && dyOf(c, x.from!, to) > 0)
  } else if (horiz) {
    const rs = cands.map((x) => rightness(c, x.from!))
    const target = horiz === '右' ? Math.max(...rs) : Math.min(...rs)
    cands = cands.filter((x) => rightness(c, x.from!) === target)
  }
  if (cands.length === 1) return cands[0]
  if (cands.length === 0) throw new Error(`指せない手です: ${text}`)
  throw new Error(`どの駒か特定できません（右・左・上・引などを付けてください）: ${text}`)
}

// ---------- 読み上げ（カタカナ。ひらがなだと助詞読みされるため） ----------
const NUM_KANA = ['', 'イチ', 'ニー', 'サン', 'ヨン', 'ゴー', 'ロク', 'ナナ', 'ハチ', 'キュウ']
const PIECE_KANA: Record<PType, string> = {
  FU: 'フ', KY: 'キョウ', KE: 'ケイ', GI: 'ギン', KI: 'キン', KA: 'カク', HI: 'ヒシャ', OU: 'ギョク',
  TO: 'ト', NY: 'ナリキョウ', NK: 'ナリケイ', NG: 'ナリギン', UM: 'ウマ', RY: 'リュウ',
}

export function moveToKana(pos: Pos, m: Move, prevTo: number | null): string {
  const t = pieceAt(pos, m)
  const side = pos.turn === 0 ? 'センテ' : 'ゴテ'
  const dest = m.to === prevTo ? 'ドウ' : `${NUM_KANA[fileOf(m.to)]} ${NUM_KANA[rankOf(m.to)]}`
  const ja = moveToJa(pos, m, prevTo, false)
  let tail = ''
  if (ja.endsWith('打')) tail = ' ウツ'
  else if (ja.endsWith('不成')) tail = ' ナラズ'
  else if (ja.endsWith('成')) tail = ' ナリ'
  return `${side}、${dest} ${PIECE_KANA[t]}${tail}`
}
