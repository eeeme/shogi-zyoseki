export interface SheetItem {
  label: string
  onClick: () => void
  danger?: boolean
  current?: boolean
}

/** 画面下から出るメニュー */
export function ActionSheet({ title, items, onClose }: { title: string; items: SheetItem[]; onClose: () => void }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="menu">
        <p className="sheet-title">{title}</p>
        {items.map((it) => (
          <button
            key={it.label}
            role="menuitem"
            className={`sheet-item ${it.danger ? 'danger' : ''} ${it.current ? 'current' : ''}`}
            onClick={() => { onClose(); it.onClick() }}
          >
            {it.label}
            {it.current && <small>現在</small>}
          </button>
        ))}
        <button className="sheet-item cancel" onClick={onClose}>キャンセル</button>
      </div>
    </div>
  )
}
