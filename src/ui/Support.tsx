import { useEffect, useState } from 'react'
import { MESSAGE_ENDPOINT, type Tip, buyTip, isNative, loadTips, openStorePage, sendSupportMessage, shareApp } from '../native'

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
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState<'no' | 'sending' | 'done'>('no')

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
      setSent('no')
      setMessage('')
    }
  }

  const send = async () => {
    if (!thanks || !message.trim() || sent !== 'no') return
    setSent('sending')
    const ok = await sendSupportMessage({ tier: `${thanks.label}（${thanks.tip.price}〜）`, name: name.trim(), message: message.trim() })
    if (ok) setSent('done')
    else { setSent('no'); toast('送れませんでした。電波のよいところでもう一度') }
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
              {MESSAGE_ENDPOINT && sent !== 'done' && (
                <>
                  <input className="thanks-name" placeholder="ニックネーム（任意）" maxLength={30} value={name} onChange={(e) => setName(e.target.value)} />
                  <textarea className="thanks-msg" placeholder="ひとことメッセージ（任意）" maxLength={300} rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
                  <button className="btn primary wide" disabled={!message.trim() || sent === 'sending'} onClick={send}>
                    {sent === 'sending' ? '送信中…' : '開発者に送る'}
                  </button>
                  <p className="muted small">メッセージは開発者だけが読みます。公開されません。</p>
                </>
              )}
              {sent === 'done' && <p className="muted">メッセージを受け取りました。</p>}
            </div>
          )}
        </section>
      )}

      <p className="muted small credit">ME IS ME{VERSION && `　v${VERSION}`}</p>
    </div>
  )
}
