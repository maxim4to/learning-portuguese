/** Test stub for `virtual:pwa-register/react` (vite-plugin-pwa virtual module). Tests can flip `needRefresh`. */
import { useState } from 'react'

export const pwaStub = { needRefresh: false, offlineReady: false, updateCalls: 0 }

export function useRegisterSW(_opts?: unknown) {
  const needRefresh = useState(pwaStub.needRefresh)
  const offlineReady = useState(pwaStub.offlineReady)
  return {
    needRefresh,
    offlineReady,
    updateServiceWorker: async (_reload?: boolean) => {
      pwaStub.updateCalls++
    },
  }
}
