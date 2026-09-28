// IndexedDB 保存（サーバー無し・端末内完結）
import { openDB, type IDBPDatabase } from 'idb'
import type { Book } from './book'

let dbp: Promise<IDBPDatabase> | null = null
const db = () =>
  (dbp ??= openDB('shogi-zyoseki', 1, {
    upgrade(d) {
      d.createObjectStore('books', { keyPath: 'id' })
    },
  }))

export async function loadBooks(): Promise<Book[]> {
  const all = (await (await db()).getAll('books')) as Book[]
  return all.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function saveBook(book: Book) {
  book.updatedAt = Date.now()
  await (await db()).put('books', structuredClone(book))
}

export async function deleteBook(id: string) {
  await (await db()).delete('books', id)
}

const FLAG = 'zyoseki.sampleInstalled'
export const sampleInstalled = () => {
  try { return localStorage.getItem(FLAG) === '1' } catch { return true }
}
export const markSampleInstalled = () => {
  try { localStorage.setItem(FLAG, '1') } catch { /* noop */ }
}
