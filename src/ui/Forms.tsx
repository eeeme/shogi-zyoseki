import { useState, type ReactNode } from 'react'
import type { GameMeta } from '../book/book'

function FormSheet({ title, children, onSave, onClose }: { title: string; children: ReactNode; onSave: () => void; onClose: () => void }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet form" onClick={(e) => e.stopPropagation()}>
        <p className="sheet-title">{title}</p>
        {children}
        <div className="row gap">
          <button className="btn grow" onClick={onClose}>キャンセル</button>
          <button className="btn primary grow" onClick={() => { onSave(); onClose() }}>保存</button>
        </div>
      </div>
    </div>
  )
}

export function TagSheet({ title, tags, allTags, onSave, onClose }: {
  title: string
  tags: string[]
  allTags: string[]
  onSave: (tags: string[]) => void
  onClose: () => void
}) {
  const [sel, setSel] = useState<string[]>(tags)
  const [input, setInput] = useState('')
  const known = [...new Set([...allTags, ...sel])].sort((a, b) => a.localeCompare(b, 'ja'))
  const toggle = (t: string) => setSel((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]))
  const add = () => {
    const t = input.trim().replace(/^#/, '')
    if (t && !sel.includes(t)) setSel((s) => [...s, t])
    setInput('')
  }
  return (
    <FormSheet title={title} onClose={onClose} onSave={() => onSave(sel)}>
      {known.length > 0 && (
        <div className="tag-list">
          {known.map((t) => (
            <button key={t} className={`tag ${sel.includes(t) ? 'on' : ''}`} onClick={() => toggle(t)}>#{t}</button>
          ))}
        </div>
      )}
      <div className="row gap">
        <input
          placeholder="新しいタグ"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button className="btn" onClick={add} aria-label="追加">＋</button>
      </div>
    </FormSheet>
  )
}

const RESULTS = ['', '先手勝ち', '後手勝ち', '引き分け']

export function MetaSheet({ title, meta, onSave, onClose }: {
  title: string
  meta: GameMeta | undefined
  onSave: (m: GameMeta | undefined) => void
  onClose: () => void
}) {
  const [m, setM] = useState<GameMeta>({ ...meta })
  const set = (k: keyof GameMeta) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setM({ ...m, [k]: e.target.value })
  return (
    <FormSheet
      title={title}
      onClose={onClose}
      onSave={() => {
        const clean: GameMeta = {}
        for (const [k, v] of Object.entries(m)) if (typeof v === 'string' && v.trim()) clean[k as keyof GameMeta] = v.trim()
        onSave(Object.keys(clean).length ? clean : undefined)
      }}
    >
      <div className="meta-grid">
        <label>☗</label><input placeholder="先手" value={m.sente ?? ''} onChange={set('sente')} />
        <label>☖</label><input placeholder="後手" value={m.gote ?? ''} onChange={set('gote')} />
        <label>日</label><input placeholder="日付" value={m.date ?? ''} onChange={set('date')} />
        <label>戦</label><input placeholder="棋戦" value={m.event ?? ''} onChange={set('event')} />
        <label>結</label>
        <select value={m.result ?? ''} onChange={set('result')}>
          {RESULTS.map((r) => <option key={r} value={r}>{r || '結果なし'}</option>)}
        </select>
      </div>
    </FormSheet>
  )
}

/** 一覧・閲覧で使う1行の対局情報 */
export function metaLine(meta: GameMeta | undefined): string {
  if (!meta) return ''
  const parts: string[] = []
  if (meta.sente || meta.gote) parts.push(`☗${meta.sente ?? '？'}　☖${meta.gote ?? '？'}`)
  if (meta.date) parts.push(meta.date.split(/[\sT]/)[0])
  if (meta.result) parts.push(meta.result)
  return parts.join('・')
}
