// IndexedDB 保存（サーバー無し・端末内完結）
import { openDB, type IDBPDatabase } from 'idb'
import type { Book, Folder } from './book'

let dbp: Promise<IDBPDatabase> | null = null
const db = () =>
  (dbp ??= openDB('shogi-zyoseki', 2, {
    upgrade(d) {
      if (!d.objectStoreNames.contains('books')) d.createObjectStore('books', { keyPath: 'id' })
      if (!d.objectStoreNames.contains('folders')) d.createObjectStore('folders', { keyPath: 'id' })
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

export async function loadFolders(): Promise<Folder[]> {
  const all = (await (await db()).getAll('folders')) as Folder[]
  return all.sort((a, b) => a.name.localeCompare(b.name, 'ja'))
}

export async function saveFolder(f: Folder) {
  await (await db()).put('folders', structuredClone(f))
}

export async function deleteFolder(id: string) {
  await (await db()).delete('folders', id)
}

const FLAG = 'zyoseki.sampleInstalled'
export const sampleInstalled = () => {
  try { return localStorage.getItem(FLAG) === '1' } catch { return true }
}
export const markSampleInstalled = () => {
  try { localStorage.setItem(FLAG, '1') } catch { /* noop */ }
}
