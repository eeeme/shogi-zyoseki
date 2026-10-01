// Android アプリ（Capacitor）でだけ必要な処理。ブラウザ版では何もしない。
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { App } from '@capacitor/app'
import { Clipboard } from '@capacitor/clipboard'
import { TextToSpeech } from '@capacitor-community/text-to-speech'
import { backButton } from './ui/SwipeBack'
import { NativePurchases, PURCHASE_TYPE } from '@capgo/native-purchases'
import { Share } from '@capacitor/share'
import { AppLauncher } from '@capacitor/app-launcher'

export const isNative = Capacitor.isNativePlatform()

/** 端末の「戻る」：開いているものを閉じる → 画面の「‹」→ 一覧ならアプリを閉じる */
export function setupNative() {
  if (!isNative) return
  App.addListener('backButton', () => {
    const skip = document.querySelector<HTMLElement>('.tour-skip')
    if (skip) return skip.click()
    const backdrop = document.querySelector<HTMLElement>('.sheet-backdrop')
    if (backdrop) return backdrop.click()
    if (document.querySelector('.sheets-area:not([data-open="none"])')) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      return
    }
    const b = backButton()
    if (b) return b.click()
    App.exitApp()
  })
}

export async function nativeCopy(text: string) {
  await Clipboard.write({ string: text })
}

export function nativeSpeak(text: string) {
  TextToSpeech.stop()
    .catch(() => {})
    .then(() => TextToSpeech.speak({ text, lang: 'ja-JP', rate: 1, category: 'ambient' }))
    .catch(() => {})
}

// ---- 応援（Google Play の買い切り・消費型。機能は変わらない） ----

export const APP_ID = 'com.meisme.jousekichou'
export const PLAY_URL = `https://play.google.com/store/apps/details?id=${APP_ID}`
export const WEB_URL = 'https://eeeme.github.io/shogi-zyoseki/'
/** Play Console の「アプリ内アイテム」に同じ ID で作る（小・中・大） */
export const TIP_IDS = ['support_small', 'support_medium', 'support_large']

export interface Tip { id: string; price: string; amount: number }

export async function loadTips(): Promise<Tip[]> {
  if (!isNative) return []
  try {
    const { isBillingSupported } = await NativePurchases.isBillingSupported()
    if (!isBillingSupported) return []
    const { products } = await NativePurchases.getProducts({ productIdentifiers: TIP_IDS, productType: PURCHASE_TYPE.INAPP })
    return products
      .map((p) => ({ id: p.identifier, price: p.priceString, amount: p.price }))
      .sort((a, b) => a.amount - b.amount)
  } catch {
    return []
  }
}

/** true=完了 / false=キャンセル・失敗 */
export async function buyTip(id: string): Promise<boolean> {
  try {
    await NativePurchases.purchaseProduct({ productIdentifier: id, productType: PURCHASE_TYPE.INAPP, isConsumable: true })
    return true
  } catch {
    return false
  }
}

export async function openStorePage() {
  if (isNative) {
    try { await AppLauncher.openUrl({ url: `market://details?id=${APP_ID}` }); return } catch { /* Play が無い端末 */ }
    await AppLauncher.openUrl({ url: PLAY_URL }).catch(() => {})
    return
  }
  window.open(PLAY_URL, '_blank', 'noopener')
}

export async function shareApp(): Promise<'shared' | 'copied' | 'none'> {
  const text = '将棋の定跡を分岐のツリーで覚えるアプリ「定跡帳」'
  const url = isNative ? PLAY_URL : WEB_URL
  try {
    if (isNative) { await Share.share({ title: '定跡帳', text, url }); return 'shared' }
    if (navigator.share) { await navigator.share({ title: '定跡帳', text, url }); return 'shared' }
  } catch {
    return 'none'
  }
  await navigator.clipboard?.writeText(`${text}\n${url}`).catch(() => {})
  return 'copied'
}

/**
 * 応援メッセージの送り先（Google Apps Script のウェブアプリ URL）。
 * スプレッドシートに1行追加し、メールで通知する（gas/Code.gs）。空なら送信欄を出さない。
 */
export const MESSAGE_ENDPOINT = ''

export async function sendSupportMessage(d: { tier: string; name: string; message: string }): Promise<boolean> {
  if (!MESSAGE_ENDPOINT) return false
  const body = JSON.stringify({ ...d, app: `定跡帳 ${import.meta.env.VITE_APP_VERSION ?? ''}` })
  try {
    if (isNative) {
      const r = await CapacitorHttp.request({ url: MESSAGE_ENDPOINT, method: 'POST', headers: { 'Content-Type': 'text/plain' }, data: body })
      return r.status >= 200 && r.status < 400
    }
    // ブラウザは応答を読めない送り方（CORS の都合）。届いたものとして扱う
    await fetch(MESSAGE_ENDPOINT, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body })
    return true
  } catch {
    return false
  }
}
