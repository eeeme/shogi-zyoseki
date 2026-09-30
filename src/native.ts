// Android アプリ（Capacitor）でだけ必要な処理。ブラウザ版では何もしない。
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { Clipboard } from '@capacitor/clipboard'
import { TextToSpeech } from '@capacitor-community/text-to-speech'
import { backButton } from './ui/SwipeBack'

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
