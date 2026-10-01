import { useEffect, useState } from 'react'
import { HASHTAG, type Tip, buyTip, isNative, loadTips, openStorePage, postToX, shareApp } from '../native'

const LABELS = ['ちょっと応援', '応援', 'たくさん応援']
const VERSION = import.meta.env.VITE_APP_VERSION ?? ''

interface Props {
  onBack: () => void
  toast: (s: string) => void
}

/** 応援：レビュー・紹介（無料）と、Google Play での応援（アプリ版のみ・機能は変わらない） */
export function Support({ onBack, toast }: Props) {
  const [tips, setTips] = useState<Tip[] | null>(isNative ? null : [])
  const [busy, setBusy] = useState(false)
  const [thanks, setThanks] = useState<{ tip: Tip; label: string } | null>(null)

  useEffect(() => {
    if (isNative) loadTips().then(setTips)
  }, [])

  const buy = async (t: Tip) => {
    if (busy) return
    setBusy(true)
    const ok = await buyTip(t.id)
    setBusy(false)
    if (ok) {
      setThanks({ tip: t, label: LABELS[tips?.indexOf(t) ?? 0] ?? '応援' })
    }
  }

  const share = async () => {
    const r = await shareApp()
    if (r === 'copied') toast('紹介文をコピーしました')
  }

  return (
    <div className="screen">
      <header className="bar">
        <button className="btn ghost" onClick={onBack}>‹ 一覧</button>
        <h1 className="bar-title">応援する</h1>
        <span />
      </header>

      <section className="panel support">
        <p className="support-lead">定跡帳は無料・広告なしです。<br />気に入ったら応援をお願いします。</p>

        <div className="support-free">
          {isNative && <button className="btn wide" onClick={openStorePage}>★ Google Play で評価する</button>}
          <button className="btn wide" onClick={share}>友だちに紹介する</button>
          <button className="btn wide" onClick={() => postToX('定跡帳を使っています')}>X で感想を書く（#{HASHTAG}）</button>
        </div>
      </section>

      {isNative && (
        <section className="panel support">
          <p className="support-head">開発を応援する</p>
          {tips === null && <p className="muted">読み込み中…</p>}
          {tips && tips.length === 0 && <p className="muted">いまは利用できません</p>}
          {tips && tips.length > 0 && (
            <div className="tips">
              {tips.map((t, i) => (
                <button key={t.id} className="tip" disabled={busy} onClick={() => buy(t)}>
                  <span className="tip-label">{LABELS[i] ?? '応援'}</span>
                  <span className="tip-price">{t.price}{t.id === 'support_large' && <small>〜</small>}</span>
                  {t.id === 'support_large' && <span className="tip-note">口数を選べます</span>}
                </button>
              ))}
            </div>
          )}
          <p className="muted small">1回きりのお支払いです。「たくさん応援」は支払い画面で口数（×2、×3…）を選べます。応援しても機能は変わりません。</p>
          {thanks && (
            <div className={`thanks-card tier-${thanks.tip.id}`}>
              <p className="support-thanks">ありがとうございます！<br />大切に使わせていただきます。</p>
              <button className="btn wide" onClick={() => postToX(`定跡帳を${thanks.label}しました！`)}>X でひとこと（#{HASHTAG}）</button>
            </div>
          )}
        </section>
      )}

      <p className="muted small credit">ME IS ME{VERSION && `　v${VERSION}`}</p>
    </div>
  )
}
