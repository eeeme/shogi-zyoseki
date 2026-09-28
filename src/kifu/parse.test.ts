import { describe, expect, it } from 'vitest'
import { applyMove, generateMoves, parseSfen, START_SFEN, startPos, toSfen, usiToMove } from '../shogi/core'
import { moveToJa, parseJaMove } from '../shogi/notation'
import { parseKifu, mainLine } from './parse'
import { exportKif } from './export'
import { SAMPLE_KIF } from '../book/sample'
import { followLine, mergeImport, newBook, positionAt, transpositionIndex, countNodes } from '../book/book'

describe('core', () => {
  it('初期局面の合法手は30手', () => {
    expect(generateMoves(startPos()).length).toBe(30)
  })
  it('SFEN往復', () => {
    expect(toSfen(parseSfen(START_SFEN))).toBe(START_SFEN.replace(/ 1$/, ''))
  })
})

describe('notation', () => {
  it('７六歩を解決・表示', () => {
    const p = startPos()
    const m = parseJaMove(p, '▲７六歩', null)
    expect(moveToJa(p, m, null)).toBe('▲７六歩')
  })
  it('金の右左を付ける', () => {
    let p = startPos()
    for (const u of ['7g7f', '3c3d', '5i6h', '4a3b']) p = applyMove(p, usiToMove(u))
    const m = usiToMove('4i5h')
    expect(moveToJa(p, m, null)).toBe('▲５八金右')
    expect(parseJaMove(p, '５八金左', null)).toEqual(usiToMove('6i5h'))
  })
})

describe('import', () => {
  it('サンプルKIF（変化付き）を読める', () => {
    const t = parseKifu(SAMPLE_KIF)
    expect(t.format).toBe('KIF')
    expect(t.root.children.length).toBe(1) // 初手は７六歩のみ
    const b = newBook('t')
    const r = mergeImport(b, t)
    expect(r.added).toBe(countNodes(b))
    expect(countNodes(b)).toBe(16 + 3 + 10 + 4)
    expect(b.nodes[b.rootId].comment).toContain('サンプル')
  })
  it('KI2', () => {
    const t = parseKifu('▲７六歩　△３四歩　▲２六歩\n△８四歩 ▲２五歩 △８五歩')
    expect(t.format).toBe('KI2')
    expect(mainLine(t)).toEqual(['7g7f', '3c3d', '2g2f', '8c8d', '2f2e', '8d8e'])
  })
  it('CSA', () => {
    const t = parseKifu('V2.2\nN+a\nN-b\nPI\n+\n+7776FU\n-3334FU\n+8822UM\n-3122GI\n+0045KA\n%TORYO')
    expect(t.format).toBe('CSA')
    expect(mainLine(t)).toEqual(['7g7f', '3c3d', '8h2b+', '3a2b', 'B*4e'])
  })
  it('USI', () => {
    const t = parseKifu('position startpos moves 7g7f 3c3d 8h2b+')
    expect(mainLine(t)).toEqual(['7g7f', '3c3d', '8h2b+'])
  })
  it('照合：外れた手数', () => {
    const b = newBook('t')
    mergeImport(b, parseKifu(SAMPLE_KIF))
    const r = followLine(b, ['7g7f', '3c3d', '2g2f', '8c8d', '2f2e', '4c4d'])
    expect(r.matched).toBe(5)
  })
  it('KIF書き出し→再取込で同じ木になる', () => {
    const b = newBook('t')
    mergeImport(b, parseKifu(SAMPLE_KIF))
    const kif = exportKif(b)
    const b2 = newBook('t2')
    mergeImport(b2, parseKifu(kif))
    expect(countNodes(b2)).toBe(countNodes(b))
    // 全ノードの局面が再現できる
    for (const id of Object.keys(b2.nodes)) positionAt(b2, id)
    expect(transpositionIndex(b2).size).toBeGreaterThan(0)
  })
})
