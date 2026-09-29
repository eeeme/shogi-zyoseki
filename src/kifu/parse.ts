// 棋譜の取り込み：KIF / KI2（変化対応）・CSA・USI/SFEN
import {
  type Move, type Pos, START_SFEN, applyMove, idx, isLegalish, moveToUsi, parseSfen, usiToMove,
  type HandType, type PType, PROMOTE,
} from '../shogi/core'
import { parseJaMove } from '../shogi/notation'
import type { GameMeta, ImportNode, ImportTree } from '../book/book'
import { hasBod, parseBod } from './bod'

export type KifuFormat = 'KIF' | 'KI2' | 'CSA' | 'USI'

export function detectFormat(text: string): KifuFormat {
  if (/^\s*[+-]\d{4}[A-Z]{2}/m.test(text) || /^\s*PI\s*$/m.test(text) || /^V2/m.test(text)) return 'CSA'
  if (/^\s*\d+\s+(同|[１-９1-9][一二三四五六七八九])/m.test(text) || /手数[-－―ー]+指手/.test(text) || hasBod(text)) return 'KIF'
  if (/[▲△☗☖]\s*(同|[１-９1-9][一二三四五六七八九])/.test(text)) return 'KI2'
  if (/(^|\s)(position|startpos|sfen)(\s|$)/.test(text) || /(^|\s)([1-9][a-i][1-9][a-i]\+?|[PLNSGBR]\*[1-9][a-i])(\s|$)/.test(text)) return 'USI'
  throw new Error('棋譜の形式を判別できません（KIF / KI2 / CSA / USI に対応）')
}

export function parseKifu(text: string): ImportTree & { format: KifuFormat } {
  const format = detectFormat(text)
  const tree = format === 'CSA' ? parseCsa(text) : format === 'USI' ? parseUsi(text) : parseJapanese(text)
  return { ...tree, format }
}

// ---------- 内部：局面付きの構築用ノード ----------
interface BNode {
  node: ImportNode
  parent: BNode | null
  ply: number
  pos: Pos
  prevTo: number | null
}

function builder(rootSfen: string) {
  const rootNode: ImportNode = { move: null, children: [] }
  const root: BNode = { node: rootNode, parent: null, ply: 0, pos: parseSfen(rootSfen), prevTo: null }
  let cur = root
  return {
    root: rootNode,
    get cur() { return cur },
    play(m: Move, label: string) {
      if (!isLegalish(cur.pos, m)) throw new Error(`${cur.ply + 1}手目が指せない手です: ${label}`)
      const usi = moveToUsi(m)
      let child = cur.node.children.find((c) => c.move === usi)
      if (!child) {
        child = { move: usi, children: [] }
        cur.node.children.push(child)
      }
      cur = { node: child, parent: cur, ply: cur.ply + 1, pos: applyMove(cur.pos, m), prevTo: m.to }
    },
    comment(s: string) {
      const n = cur.node
      n.comment = n.comment ? `${n.comment}\n${s}` : s
    },
    backTo(ply: number) {
      // 「変化：N手」→ N-1手目の局面まで戻る
      while (cur.ply > ply - 1 && cur.parent) cur = cur.parent
      if (cur.ply !== ply - 1) throw new Error(`変化の分岐元が見つかりません: ${ply}手`)
    },
  }
}

// ---------- KIF / KI2 ----------
const END_WORDS = /^(投了|中断|千日手|詰み|持将棋|切れ負け|反則勝ち|反則負け|入玉勝ち|不戦勝|不戦敗|封じ手|まで)/

export function parseJapanese(text: string): ImportTree {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  let title: string | undefined
  const withBoard = hasBod(text)
  for (const l of lines) {
    const h = /^(手合割|開始局面)[：:](.*)$/.exec(l.trim())
    if (h && !/平手/.test(h[2]) && !withBoard) throw new Error('駒落ちの手合割は局面図付きの棋譜で取り込んでください')
    const t = /^(棋戦|表題|戦型)[：:](.*)$/.exec(l.trim())
    if (t && !title) title = t[2].trim()
  }
  const rootSfen = withBoard ? parseBod(text) : START_SFEN
  const meta: GameMeta = {}
  for (const l of lines) {
    const m = /^(先手|下手|後手|上手|開始日時|対局日|棋戦)[：:](.*)$/.exec(l.trim())
    if (!m || !m[2].trim()) continue
    const v = m[2].trim()
    if (m[1] === '先手' || m[1] === '下手') meta.sente ??= v
    else if (m[1] === '後手' || m[1] === '上手') meta.gote ??= v
    else if (m[1] === '棋戦') meta.event ??= v
    else meta.date ??= v
  }
  const rootTurn = rootSfen.split(' ')[1] === 'w' ? 1 : 0
  const b = builder(rootSfen)
  let ended = false
  let inVariation = false
  const setResultByResign = (ply: number) => {
    // ply 手目に投了した側（その手番）が負け
    const loser = (rootTurn + ply - 1) % 2
    meta.result ??= loser === 0 ? '後手勝ち' : '先手勝ち'
  }
  for (const raw of lines) {
    const line = raw.trim().replace(/同[\s　]+/g, '同')
    if (!line) continue
    const v = /^変化[：:]\s*(\d+)手/.exec(line)
    if (v) {
      b.backTo(Number(v[1]))
      ended = false
      inVariation = true
      continue
    }
    const r = /^まで\d+手で(先手|後手|下手|上手)の(反則)?勝ち/.exec(line)
    if (r && !inVariation) { meta.result = r[1] === '先手' || r[1] === '下手' ? '先手勝ち' : '後手勝ち'; ended = true; continue }
    if (/^まで\d+手で(千日手|持将棋)/.test(line) && !inVariation) { meta.result = '引き分け'; ended = true; continue }
    if (line.startsWith('*')) {
      const c = line.slice(1).trim()
      if (c) b.comment(c)
      continue
    }
    if (line.startsWith('#') || /^[^\s]+[：:]/.test(line) || line.startsWith('&') || line.startsWith('|') || line.startsWith('+-') || /^(後手|上手|先手|下手)番/.test(line)) continue
    if (ended) continue
    // KIF: "  12 ７六歩(77)   ( 0:01/00:00:03)"
    const k = /^(\d+)\s+(\S+)/.exec(line)
    if (k) {
      const mv = k[2].replace(/\(\s*\d+:\d+.*$/, '')
      if (END_WORDS.test(mv)) {
        if (!inVariation && /^投了/.test(mv)) setResultByResign(Number(k[1]))
        if (!inVariation && /^(千日手|持将棋)/.test(mv)) meta.result ??= '引き分け'
        ended = true
        continue
      }
      if (Number(k[1]) !== b.cur.ply + 1) throw new Error(`手数が連続していません: ${line}`)
      const m = parseJaMove(b.cur.pos, mv, b.cur.prevTo)
      b.play(m, mv)
      continue
    }
    // KI2: "▲７六歩    △３四歩"
    const toks = line.match(/[▲△☗☖][^▲△☗☖\s]+/g)
    if (toks) {
      for (const tk of toks) {
        const m = parseJaMove(b.cur.pos, tk, b.cur.prevTo)
        b.play(m, tk)
      }
      continue
    }
    if (END_WORDS.test(line)) ended = true
  }
  return { rootSfen, root: b.root, title, meta: Object.keys(meta).length ? meta : undefined }
}

// ---------- CSA ----------
const CSA_PIECE: Record<string, PType> = {
  FU: 'FU', KY: 'KY', KE: 'KE', GI: 'GI', KI: 'KI', KA: 'KA', HI: 'HI', OU: 'OU',
  TO: 'TO', NY: 'NY', NK: 'NK', NG: 'NG', UM: 'UM', RY: 'RY',
}

export function parseCsa(text: string): ImportTree {
  const stmts = text.replace(/\r\n?/g, '\n').split('\n').flatMap((l) => (l.startsWith("'") ? [l] : l.split(',')))
  const b = builder(START_SFEN)
  let title: string | undefined
  const meta: GameMeta = {}
  for (const raw of stmts) {
    const s = raw.trim()
    if (!s) continue
    if (s.startsWith('N+')) { meta.sente = s.slice(2); continue }
    if (s.startsWith('N-')) { meta.gote = s.slice(2); continue }
    if (s.startsWith('$START_TIME:')) { meta.date = s.slice(12); continue }
    if (s === '%TORYO') { meta.result = b.cur.pos.turn === 0 ? '後手勝ち' : '先手勝ち'; break }
    if (s === '%KACHI') { meta.result = b.cur.pos.turn === 0 ? '先手勝ち' : '後手勝ち'; break }
    if (s === '%SENNICHITE' || s === '%JISHOGI') { meta.result = '引き分け'; break }
    if (s.startsWith("'*")) { const c = s.slice(2).trim(); if (c) b.comment(c); continue }
    if (s.startsWith("'")) continue
    if (/^P[1-9]/.test(s) || /^P[+-]/.test(s)) throw new Error('途中局面からのCSAにはまだ対応していません')
    if (s.startsWith('$EVENT:')) { title = s.slice(7); meta.event = title; continue }
    if (s.startsWith('%')) break
    const m = /^([+-])(\d)(\d)(\d)(\d)([A-Z]{2})/.exec(s)
    if (!m) continue
    const [, , ff, fr, tf, tr, pc] = m
    const to = idx(Number(tf), Number(tr))
    const t = CSA_PIECE[pc]
    if (!t) throw new Error(`CSAの駒が不明です: ${s}`)
    let mv: Move
    if (ff === '0') {
      mv = { from: null, to, drop: t as HandType, promote: false }
    } else {
      const from = idx(Number(ff), Number(fr))
      const p = b.cur.pos.board[from]
      if (!p) throw new Error(`CSA: 移動元に駒がありません: ${s}`)
      mv = { from, to, drop: null, promote: p.t !== t && PROMOTE[p.t] === t }
    }
    b.play(mv, s)
  }
  return { rootSfen: START_SFEN, root: b.root, title, meta: Object.keys(meta).length ? meta : undefined }
}

// ---------- USI / SFEN ----------
export function parseUsi(text: string): ImportTree {
  const toks = text.trim().split(/\s+/)
  let i = 0
  let rootSfen = START_SFEN
  if (toks[i] === 'position') i++
  if (toks[i] === 'startpos') i++
  else if (toks[i] === 'sfen') {
    rootSfen = toks.slice(i + 1, i + 5).join(' ')
    parseSfen(rootSfen)
    i += 5
  }
  if (toks[i] === 'moves') i++
  const b = builder(rootSfen)
  for (; i < toks.length; i++) b.play(usiToMove(toks[i]), toks[i])
  return { rootSfen, root: b.root }
}

/** 一本道の棋譜（照合用）を USI 列にする。分岐があれば本線を採用 */
export function mainLine(tree: ImportTree): string[] {
  const out: string[] = []
  let n = tree.root
  while (n.children.length) {
    n = n.children[0]
    out.push(n.move!)
  }
  return out
}

/** Shift_JIS の .kif にも対応した読み込み */
export async function readKifuFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const utf8 = new TextDecoder('utf-8').decode(buf)
  if (!utf8.includes('�')) return utf8.replace(/^﻿/, '')
  return new TextDecoder('shift_jis').decode(buf)
}
