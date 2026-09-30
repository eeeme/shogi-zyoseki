import { isNative, nativeCopy } from '../native'
// AIなどに渡すための局面テキスト（局面図＋SFEN＋ここまでの手順＋メモ）
import { applyMove, parseSfen, usiToMove } from '../shogi/core'
import { moveToJa } from '../shogi/notation'
import { type Book, pathTo, positionAt } from '../book/book'
import { toBod } from './bod'
import { toSfen } from '../shogi/core'

export function positionText(book: Book, nodeId: string): string {
  const { pos } = positionAt(book, nodeId)
  const path = pathTo(book, nodeId).slice(1)
  const moves: string[] = []
  let p = parseSfen(book.rootSfen)
  let prev: number | null = null
  for (const id of path) {
    const m = usiToMove(book.nodes[id].move!)
    moves.push(moveToJa(p, m, prev))
    p = applyMove(p, m)
    prev = m.to
  }
  const title = `${book.name}　${path.length}手目${moves.length ? `（${moves.at(-1)}まで）` : '（開始局面）'}`
  const lines = [
    `局面：${title}`,
    ...(book.meta?.sente || book.meta?.gote ? [`対局者：☗${book.meta?.sente ?? ''} ☖${book.meta?.gote ?? ''}`] : []),
    '',
    ...toBod(toSfen(pos)),
    ...(pos.turn === 0 ? ['先手番'] : []),
    '',
    `SFEN：sfen ${toSfen(pos)} 1`,
  ]
  if (moves.length) lines.push('', `手順：${moves.join(' ')}`)
  const memo = book.nodes[nodeId].comment
  if (memo) lines.push('', `メモ：${memo}`)
  return lines.join('\n')
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (isNative) {
      await nativeCopy(text)
      return true
    }
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}
