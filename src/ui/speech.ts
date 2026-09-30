import { isNative, nativeSpeak } from '../native'

// 読み上げ（読みはカタカナで渡す）。ブラウザは Web Speech API、アプリは端末の読み上げ
export function speak(text: string) {
  if (isNative) return nativeSpeak(text)
  try {
    const s = window.speechSynthesis
    if (!s) return
    s.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'ja-JP'
    u.rate = 1
    s.speak(u)
  } catch {
    /* 非対応環境では何もしない */
  }
}
