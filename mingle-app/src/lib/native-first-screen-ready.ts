type NativeFirstScreenReadyBridgeWindow = Window & {
  ReactNativeWebView?: {
    postMessage?: (message: string) => void
  }
}

// The native app keeps its startup splash up until this arrives, so the user goes
// straight from the splash to the first real screen instead of seeing the blank
// frame between document load and hydration. Waits two frames so the screen that
// triggered it has actually been painted before the splash is dropped.
export function postNativeFirstScreenReady(): () => void {
  if (typeof window === 'undefined') return () => {}

  const bridgeWindow = window as NativeFirstScreenReadyBridgeWindow
  if (typeof bridgeWindow.ReactNativeWebView?.postMessage !== 'function') return () => {}

  let innerFrame = 0
  const outerFrame = window.requestAnimationFrame(() => {
    innerFrame = window.requestAnimationFrame(() => {
      try {
        bridgeWindow.ReactNativeWebView?.postMessage?.(JSON.stringify({ type: 'native_first_screen_ready' }))
      } catch {
        // Ignore bridge errors; the native splash falls back to its own timeout.
      }
    })
  })

  return () => {
    window.cancelAnimationFrame(outerFrame)
    window.cancelAnimationFrame(innerFrame)
  }
}
