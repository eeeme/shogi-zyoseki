// Android アプリ（Capacitor）でだけ必要な処理。ブラウザ版では何もしない。
import { Capacitor } from '@capacitor/core'
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

/** 毎月の応援（定期購入）。Play Console の「定期購入」に同じ ID・基本プラン ID で作る */
export const MONTHLY_ID = 'support_monthly'
export const MONTHLY_PLAN = 'monthly'

export interface Monthly { price: string; offerToken?: string }

export async function loadMonthly(): Promise<Monthly | null> {
  if (!isNative) return null
  try {
    const { products } = await NativePurchases.getProducts({ productIdentifiers: [MONTHLY_ID], productType: PURCHASE_TYPE.SUBS })
    const p = products.find((x) => x.identifier === MONTHLY_PLAN) ?? products[0]
    return p ? { price: p.priceString, offerToken: p.offerToken } : null
  } catch {
    return null
  }
}

/** いま毎月の応援をしてくれているか */
export async function monthlyActive(): Promise<boolean> {
  if (!isNative) return false
  try {
    const { purchases } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.SUBS })
    return purchases.some((t) => t.productIdentifier === MONTHLY_ID && (t.purchaseState === undefined || t.purchaseState === '1'))
  } catch {
    return false
  }
}

export async function buyMonthly(m: Monthly): Promise<boolean> {
  try {
    await NativePurchases.purchaseProduct({ productIdentifier: MONTHLY_ID, planIdentifier: MONTHLY_PLAN, offerToken: m.offerToken, productType: PURCHASE_TYPE.SUBS })
    return true
  } catch {
    return false
  }
}

/** Google Play の定期購入の管理画面（解約もここ） */
export async function manageMonthly() {
  await NativePurchases.manageSubscriptions().catch(() =>
    AppLauncher.openUrl({ url: `https://play.google.com/store/account/subscriptions?sku=${MONTHLY_ID}&package=${APP_ID}` }).catch(() => {}),
  )
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

export const HASHTAG = '定跡帳アプリ'

/** X の投稿画面を開く（ハッシュタグ入り）。アプリが入っていれば X アプリで開く */
export async function postToX() {
  // 本文はハッシュタグだけ（X アプリは hashtags= を無視するので本文に入れる）
  const url = `https://x.com/intent/post?text=${encodeURIComponent(`#${HASHTAG} `)}`
  if (isNative) { await AppLauncher.openUrl({ url }).catch(() => {}); return }
  window.open(url, '_blank', 'noopener')
}
