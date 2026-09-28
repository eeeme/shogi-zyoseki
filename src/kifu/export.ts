// 本 → KIF（変化付き）書き出し
import { applyMove, fileOf, rankOf, usiToMove, type Pos } from '../shogi/core'
import { moveToJa } from '../shogi/notation'
import { type Book, positionAt } from '../book/book'

function kifMove(pos: Pos, usi: string, prevTo: number | null): string {
  const m = usiToMove(usi)
  let s = moveToJa(pos, m, prevTo, false)
  // KIFは移動元(筋段)を付け、KI2の右左上引は付けない
  s = s.replace(/(右|左|直|上|引|寄)+|\(\d\d\)/g, '')
  if (m.from !== null) s += `(${fileOf(m.from)}${rankOf(m.from)})`
  return s.replace('同　', '同　')
}

export function exportKif(book: Book): string {
  if (book.rootSfen.split(' ')[0] !== 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL') {
    throw new Error('平手以外の開始局面はKIF書き出しに未対応です')
  }
  const out: string[] = [
    '# KIF形式棋譜ファイル',
    `棋戦：${book.name}`,
    '手合割：平手',
    '先手：',
    '後手：',
    '手数----指手---------消費時間--',
  ]
  const commentLines = (c?: string) => (c ? c.split('\n').map((l) => `*${l}`) : [])
  out.push(...commentLines(book.nodes[book.rootId].comment))

  const writeLine = (startId: string) => {
    // startId から本線を末端まで書き、その後、深い方から順に変化を書く
    const line: string[] = []
    let cur: string | undefined = startId
    while (cur) {
      line.push(cur)
      cur = book.nodes[cur].children[0]
    }
    const first = positionAt(book, book.nodes[startId].parent!)
    let pos = first.pos
    let prevTo = first.prevTo
    let ply = line.length ? pathLen(startId) : 0
    for (const id of line) {
      const n = book.nodes[id]
      out.push(`${String(ply).padStart(4, ' ')} ${kifMove(pos, n.move!, prevTo).padEnd(12, '　')}`)
      out.push(...commentLines(n.comment))
      const m = usiToMove(n.move!)
      pos = applyMove(pos, m)
      prevTo = m.to
      ply++
    }
    for (let i = line.length - 1; i >= 0; i--) {
      const n = book.nodes[line[i]]
      const sibs = book.nodes[n.parent!].children.filter((c) => c !== n.id)
      // line[0] の兄弟は呼び出し元が扱う
      if (i === 0) continue
      for (const s of sibs) {
        out.push('', `変化：${pathLen(s)}手`)
        writeLine(s)
      }
    }
  }
  const pathLen = (id: string) => {
    let d = 0
    let cur = book.nodes[id].parent
    while (cur) { d++; cur = book.nodes[cur].parent }
    return d
  }
  const root = book.nodes[book.rootId]
  if (root.children.length) {
    writeLine(root.children[0])
    for (const s of root.children.slice(1)) {
      out.push('', `変化：1手`)
      writeLine(s)
    }
  }
  return out.join('\r\n') + '\r\n'
}
