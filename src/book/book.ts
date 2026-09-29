// 定跡ツリー（本）のデータモデルと操作
import { type Move, type Pos, START_SFEN, applyMove, moveToUsi, parseSfen, toSfen, usiToMove } from '../shogi/core'

export interface Srs {
  reps: number
  interval: number // 日
  ease: number
  due: number // epoch ms
  lapses: number
  last: number
}

export interface BookNode {
  id: string
  parent: string | null
  move: string | null // USI。root は null
  children: string[] // 先頭が本線
  comment?: string
  label?: string
}

export interface Folder {
  id: string
  name: string
  createdAt: number
}

/** 対局情報（棋譜のヘッダーから取り込む／手で編集） */
export interface GameMeta {
  sente?: string
  gote?: string
  date?: string
  event?: string
  result?: string // 先手勝ち / 後手勝ち / 引き分け など
}

export interface Book {
  id: string
  name: string
  folderId?: string // 未指定 = フォルダに入れない（一覧の直下）
  tags?: string[]
  meta?: GameMeta
  rootSfen: string
  rootId: string
  nodes: Record<string, BookNode>
  srs: Record<string, Srs> // key = 自分が指す局面のノードID
  createdAt: number
  updatedAt: number
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

export function newBook(name: string, rootSfen = START_SFEN, folderId?: string): Book {
  const rootId = uid()
  const now = Date.now()
  return {
    id: uid(), name, rootSfen, rootId, folderId,
    nodes: { [rootId]: { id: rootId, parent: null, move: null, children: [] } },
    srs: {}, createdAt: now, updatedAt: now,
  }
}

export function pathTo(book: Book, id: string): string[] {
  const out: string[] = []
  let cur: string | null = id
  while (cur) {
    out.push(cur)
    cur = book.nodes[cur]?.parent ?? null
  }
  return out.reverse()
}

export const depthOf = (book: Book, id: string) => pathTo(book, id).length - 1

export interface NodeState {
  pos: Pos
  prevTo: number | null
}

/** ノードの局面を再生して求める */
export function positionAt(book: Book, id: string): NodeState {
  let pos = parseSfen(book.rootSfen)
  let prevTo: number | null = null
  for (const nid of pathTo(book, id).slice(1)) {
    const m = usiToMove(book.nodes[nid].move!)
    pos = applyMove(pos, m)
    prevTo = m.to
  }
  return { pos, prevTo }
}

export function findChild(book: Book, id: string, usi: string): string | null {
  return book.nodes[id].children.find((c) => book.nodes[c].move === usi) ?? null
}

/** 子を追加（既にあればそのID）。本は破壊的に更新する */
export function addChild(book: Book, id: string, move: Move): { id: string; created: boolean } {
  const usi = moveToUsi(move)
  const exist = findChild(book, id, usi)
  if (exist) return { id: exist, created: false }
  const nid = uid()
  book.nodes[nid] = { id: nid, parent: id, move: usi, children: [] }
  book.nodes[id].children.push(nid)
  return { id: nid, created: true }
}

export function deleteSubtree(book: Book, id: string) {
  const node = book.nodes[id]
  if (!node.parent) return
  const stack = [id]
  while (stack.length) {
    const cur = stack.pop()!
    stack.push(...book.nodes[cur].children)
    delete book.nodes[cur]
    delete book.srs[cur]
  }
  const p = book.nodes[node.parent]
  p.children = p.children.filter((c) => c !== id)
}

/** この手を親の本線（先頭）にする */
export function promoteToMain(book: Book, id: string) {
  const p = book.nodes[id].parent
  if (!p) return
  const ch = book.nodes[p].children
  book.nodes[p].children = [id, ...ch.filter((c) => c !== id)]
}

// ---------- 取り込み用の中間ツリー ----------
export interface ImportNode {
  move: string | null
  comment?: string
  children: ImportNode[]
}
export interface ImportTree {
  rootSfen: string
  root: ImportNode
  title?: string
  meta?: GameMeta
}

export function mergeImport(book: Book, tree: ImportTree, atNode?: string): { added: number } {
  if (!atNode && toSfen(parseSfen(tree.rootSfen)) !== toSfen(parseSfen(book.rootSfen))) {
    throw new Error('開始局面が本と異なるため統合できません')
  }
  let added = 0
  const walk = (src: ImportNode, dst: string) => {
    if (src.comment) {
      const n = book.nodes[dst]
      if (!n.comment) n.comment = src.comment
      else if (!n.comment.includes(src.comment)) n.comment += '\n' + src.comment
    }
    for (const ch of src.children) {
      const r = addChild(book, dst, usiToMove(ch.move!))
      if (r.created) added++
      walk(ch, r.id)
    }
  }
  walk(tree.root, atNode ?? book.rootId)
  book.updatedAt = Date.now()
  return { added }
}

/** 本の手順を一本の手順列（USI）で辿り、外れた地点を返す */
export function followLine(book: Book, usis: string[]): { matched: number; nodeId: string } {
  let cur = book.rootId
  let matched = 0
  for (const u of usis) {
    const next = findChild(book, cur, u)
    if (!next) break
    cur = next
    matched++
  }
  return { matched, nodeId: cur }
}

/** 局面キー → ノードID一覧（合流＝手順前後の検出） */
export function transpositionIndex(book: Book): Map<string, string[]> {
  const map = new Map<string, string[]>()
  const walk = (id: string, pos: Pos) => {
    const key = toSfen(pos)
    const arr = map.get(key)
    if (arr) arr.push(id)
    else map.set(key, [id])
    for (const c of book.nodes[id].children) {
      walk(c, applyMove(pos, usiToMove(book.nodes[c].move!)))
    }
  }
  walk(book.rootId, parseSfen(book.rootSfen))
  return map
}

export function countNodes(book: Book) {
  return Object.keys(book.nodes).length - 1
}
