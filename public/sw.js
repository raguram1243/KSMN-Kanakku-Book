/*
 * Read-only offline mode, part 2: the app itself.
 *
 * Caches the page shell and the built JS/CSS so the app opens with no network;
 * the data it shows comes from the saved query cache (src/lib/offlineCache.ts).
 * Only same-origin GETs are handled: Supabase calls are never cached here.
 *
 * - Page loads: network first (so a deploy shows up straight away), the saved
 *   shell when the network is down or slow.
 * - /assets/*: file names carry a content hash, so cache first is safe.
 * - Everything else (icons, manifest): network first, saved copy as fallback.
 *
 * Pages that were never opened on this device can't be loaded offline: their
 * code is only fetched the first time they are visited.
 */
const CACHE = 'ksmn-shell-v1'
const SHELL = '/index.html'
const NAV_TIMEOUT_MS = 4000

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

async function networkFirst(request, cacheKey, timeoutMs) {
  const cache = await caches.open(CACHE)
  try {
    const ctrl = new AbortController()
    const timer = timeoutMs ? setTimeout(() => ctrl.abort(), timeoutMs) : null
    const response = await fetch(request, timeoutMs ? { signal: ctrl.signal } : undefined)
    if (timer) clearTimeout(timer)
    if (response.ok) cache.put(cacheKey, response.clone())
    return response
  } catch (err) {
    const saved = await cache.match(cacheKey)
    if (saved) return saved
    throw err
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, SHELL, NAV_TIMEOUT_MS))
    return
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const saved = await cache.match(request)
        if (saved) return saved
        const response = await fetch(request)
        if (response.ok) cache.put(request, response.clone())
        return response
      }),
    )
    return
  }

  event.respondWith(networkFirst(request, request))
})
