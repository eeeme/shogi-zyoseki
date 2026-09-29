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

describe('局面図', () => {
  it('BOD付きKIFを読み、書き出し→再取込で同じ局面・手順になる', async () => {
    const { toBod, parseBod } = await import('./bod')
    // 後手番・持駒ありの自由配置
    const sfen = '4k4/9/4G4/9/9/9/9/9/4K4 w G2Pr 1'
    const bod = toBod(sfen).join('\n')
    expect(bod).toContain('後手番')
    expect(bod).toContain('先手の持駒：金　歩二')
    expect(parseBod(bod)).toBe(toSfen(parseSfen(sfen)))

    const kif = `${bod}\n手数----指手---------消費時間--\n   1 ４一玉(51)\n   2 ５二金打\n`
    const t = parseKifu(kif)
    expect(t.format).toBe('KIF')
    expect(toSfen(parseSfen(t.rootSfen))).toBe(toSfen(parseSfen(sfen)))
    expect(mainLine(t)).toEqual(['5a4a', 'G*5b'])

    const b = newBook('bod', t.rootSfen)
    mergeImport(b, t)
    const again = parseKifu(exportKif(b))
    expect(mainLine(again)).toEqual(['5a4a', 'G*5b'])
    expect(toSfen(parseSfen(again.rootSfen))).toBe(toSfen(parseSfen(sfen)))
  })
})

describe('忘却曲線', () => {
  it('正解で1日→3日→伸びる、間違いで10分後、期限切れだけが復習に出る', async () => {
    const { grade, dueItems } = await import('../book/srs')
    const t0 = Date.UTC(2026, 0, 1)
    let s = grade(undefined, true, t0)
    expect(s.interval).toBe(1)
    s = grade(s, true, t0)
    expect(s.interval).toBe(3)
    s = grade(s, true, t0)
    expect(s.interval).toBeGreaterThanOrEqual(7)
    const miss = grade(s, false, t0)
    expect(miss.due - t0).toBe(10 * 60 * 1000)

    const b = newBook('t')
    mergeImport(b, parseKifu(SAMPLE_KIF))
    const first = b.rootId
    b.srs[first] = grade(undefined, true, t0) // 1日後
    expect(dueItems([b], t0).length).toBe(0)
    expect(dueItems([b], t0 + 2 * 86400000).map((x) => x.nodeId)).toEqual([first])
  })
})

describe('対局情報', () => {
  it('KIFのヘッダーと「まで」行から対局者・日付・結果を読む', () => {
    const t = parseKifu('開始日時：2026/09/01 10:00\n棋戦：将棋ウォーズ\n先手：めめ\n後手：相手\n手数----指手--\n   1 ７六歩(77)\n   2 ３四歩(33)\n   3 投了\nまで2手で後手の勝ち\n')
    expect(t.meta).toEqual({ date: '2026/09/01 10:00', event: '将棋ウォーズ', sente: 'めめ', gote: '相手', result: '後手勝ち' })
  })
  it('「まで」行が無くても投了の手数から勝者を決める', () => {
    const t = parseKifu('先手：A\n後手：B\n   1 ７六歩(77)\n   2 投了\n')
    expect(t.meta?.result).toBe('先手勝ち')
  })
  it('CSAの対局者と投了', () => {
    const t = parseKifu('N+A\nN-B\n$START_TIME:2026/01/02 09:00:00\nPI\n+\n+7776FU\n%TORYO')
    expect(t.meta).toMatchObject({ sente: 'A', gote: 'B', result: '先手勝ち' })
  })
})

describe('局面検索', () => {
  it('一致と似た局面を返す', async () => {
    const { searchPositions } = await import('../book/search')
    const b = newBook('t')
    mergeImport(b, parseKifu(SAMPLE_KIF))
    let q = startPos()
    for (const u of ['7g7f', '3c3d']) q = applyMove(q, usiToMove(u))
    const r = searchPositions([b], q)
    expect(r.exact.length).toBe(1)
    expect(r.exact[0].ply).toBe(2)
    expect(r.similar.length).toBeGreaterThan(0)
    expect(r.similar[0].score).toBeLessThan(1)
    expect(r.similar[0].score).toBeGreaterThan(0.9)
  })
})

describe('マージ', () => {
  it('同じ局面の先の手順とメモを、元の本のその局面に追記する', async () => {
    const { extractSubtree } = await import('../book/book')
    const a = newBook('a')
    mergeImport(a, parseKifu('   1 ７六歩(77)\n   2 ３四歩(33)\n*元のメモ\n   3 ２六歩(27)\n'))
    const b = newBook('b')
    mergeImport(b, parseKifu('   1 ７六歩(77)\n   2 ３四歩(33)\n*別のメモ\n   3 ６六歩(67)\n   4 ８四歩(83)\n'))
    const aNode = followLine(a, ['7g7f', '3c3d']).nodeId
    const bNode = followLine(b, ['7g7f', '3c3d']).nodeId
    const r = mergeImport(a, extractSubtree(b, bNode), aNode)
    expect(r.added).toBe(2)
    expect(a.nodes[aNode].children.length).toBe(2)
    expect(a.nodes[aNode].comment).toBe('元のメモ\n別のメモ')
  })
})

describe('次の手の出現率', () => {
  it('本ごとに数え、2局未満は出さず、勝率は勝敗のある本だけで計算する', async () => {
    const { buildStatsIndex, nextMoveStats } = await import('../book/stats')
    const g = (moves: string, result?: string) => {
      const b = newBook('g')
      const t = parseKifu(moves)
      mergeImport(b, t)
      if (result) b.meta = { result }
      return b
    }
    const books = [
      g('   1 ７六歩(77)\n   2 ３四歩(33)\n', '先手勝ち'),
      g('   1 ７六歩(77)\n   2 ８四歩(83)\n', '先手勝ち'),
      g('   1 ７六歩(77)\n   2 ３四歩(33)\n', '先手勝ち'),
      g('   1 ２六歩(27)\n'), // 研究用（勝敗なし）
    ]
    const idx = buildStatsIndex(books)
    const root = nextMoveStats(idx, startPos())!
    expect(root[0]).toMatchObject({ usi: '7g7f', count: 3, rate: 0.75, winRate: 1 })
    expect(root[1]).toMatchObject({ usi: '2g2f', count: 1, winRate: null })
    const after = nextMoveStats(idx, applyMove(startPos(), usiToMove('7g7f')))!
    // 後手の手：先手勝ちの本なので勝率0
    expect(after[0]).toMatchObject({ usi: '3c3d', count: 2, winRate: 0 })
    // 1局しかない局面は出さない
    let p = startPos()
    for (const u of ['7g7f', '8c8d']) p = applyMove(p, usiToMove(u))
    expect(nextMoveStats(idx, applyMove(startPos(), usiToMove('2g2f')))).toBeNull()
    expect(nextMoveStats(idx, p)).toBeNull()
  })
})
