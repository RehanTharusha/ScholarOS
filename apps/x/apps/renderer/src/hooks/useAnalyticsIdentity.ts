import { useEffect } from 'react'
import posthog from 'posthog-js'

/**
 * Identifies the user in PostHog when signed into ScholarOS,
 * and sets user properties for connected OAuth providers.
 * Call once at the App level.
 */
export function useAnalyticsIdentity() {
  // On mount: check current OAuth state and identify if signed in
  useEffect(() => {
    async function init() {
      try {
        if (!window.ipc) return;
        const result = await window.ipc.invoke('oauth:getState', null)
        const config = result.config || {}

        // Identify if ScholarOS account is connected
        const scholaros = config.scholaros
        if (scholaros?.connected && scholaros?.userId) {
          posthog.identify(scholaros.userId)
        }

        // Set provider connection flags
        const providers = ['gmail', 'calendar', 'slack', 'scholaros']
        const props: Record<string, boolean> = { signed_in: !!scholaros?.connected }
        for (const p of providers) {
          props[`${p}_connected`] = !!config[p]?.connected
        }
        posthog.people.set(props)

        // Count notes for total_notes property
        try {
          const entries = await window.ipc.invoke('workspace:readdir', { path: '' })
          let totalNotes = 0
          if (entries) {
            for (const entry of entries) {
              if (entry.kind === 'dir') {
                try {
                  const sub = await window.ipc.invoke('workspace:readdir', { path: `${entry.name}` })
                  totalNotes += sub?.length ?? 0
                } catch {
                  // skip inaccessible dirs
                }
              }
            }
          }
          posthog.people.set({ total_notes: totalNotes })
        } catch {
          // workspace may not be available
        }
      } catch {
        // oauth state unavailable
      }
    }
    init()
  }, [])

  // Listen for OAuth connect/disconnect events to update identity
  useEffect(() => {
    if (!window.ipc) return;
    const cleanup = window.ipc.on('oauth:didConnect', (event) => {
      if (!event.success) return

      // If ScholarOS provider connected, identify user
      if (event.provider === 'scholaros' && event.userId) {
        posthog.identify(event.userId)
        posthog.people.set({ signed_in: true })
      }

      posthog.people.set({ [`${event.provider}_connected`]: true })
    })

    return cleanup
  }, [])
}
