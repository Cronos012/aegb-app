/* Le service worker de l'appli AEGB, le petit programme qui tourne même
 * quand l'appli est fermée.
 * - Il garde l'appli (la page et ses fichiers) pour l'ouvrir sans réseau.
 *   Les données des membres ne passent jamais par ce cache : elles viennent
 *   de Supabase, sur un autre domaine.
 * - Il reçoit les notifications et ouvre le bon écran au toucher.
 * - Une nouvelle version attend que le membre appuie sur « Recharger ».
 * Ce fichier est un modèle : la construction de l'appli (vite.config.ts)
 * y met le numéro de version et la liste des fichiers à garder. */

const VERSION = "8890d7bc65a5"
const PRECACHE = ["index.html","manifest.webmanifest","logo-rond.webp","favicon.png","icons/icon-192.png","icons/badge-96.png","assets/Avatar-B3nytZWo.js","assets/Button-CwYls6lH.js","assets/Dialog-ohFcniJL.js","assets/DocParts-B5O34gv4.js","assets/EventParts-BeHHw_8U.js","assets/Field-Bez0o2c3.js","assets/Hero-RPKy79ob.js","assets/Logo-I-hkVf7a.js","assets/Pill-D9irJrRW.js","assets/Toast-CDNvCei1.js","assets/ban-D48343Ik.js","assets/bell-ring-CFy2HFLP.js","assets/calendar-days-Do_b-uNj.js","assets/check-BBNSNJyS.js","assets/chevron-right-Bi3rUTW0.js","assets/circle-dollar-sign-CXBwBihZ.js","assets/documents-v0RIXqTA.js","assets/dues-CslqkPwB.js","assets/elections-DxUHlc7H.js","assets/events-C4zz4wRb.js","assets/feed-D0-xwzM8.js","assets/file-text-CggSDmhx.js","assets/format-DRfmCyes.js","assets/index-Bg5Y_5Ow.css","assets/index-BoDmz_Sj.js","assets/loader-circle-B1rd45Qi.js","assets/message-circle-iI-EfFW0.js","assets/message-square-CZ4PqD-_.js","assets/photos-D4arZvwA.js","assets/preload-helper-BLdHbfdN.js","assets/pvPdf-ku9vfskE.js","assets/rolldown-runtime-WkwZ5CU-.js","assets/user-Czwqt4rL.js","assets/vote-C9Ynaexk.js","assets/x-8_CaRfC3.js"]
const CACHE = 'aegb-' + VERSION
const SCOPE = self.registration.scope
const SHELL = new URL('index.html', SCOPE).href

function inScope(path) {
  return new URL(String(path).replace(/^\//, ''), SCOPE).href
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE.map(inScope))))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith('aegb-') && key !== CACHE) await caches.delete(key)
      }
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})

// La page : du réseau d'abord, la dernière version gardée sans réseau.
async function page(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(CACHE)
      await cache.put(SHELL, response.clone())
    }
    return response
  } catch {
    return (await caches.match(SHELL)) || Response.error()
  }
}

// Les fichiers de l'appli portent leur version dans leur nom : ils ne changent jamais.
async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) {
    const cache = await caches.open(CACHE)
    await cache.put(request, response.clone())
  }
  return response
}

async function staleWhileRevalidate(request, event) {
  const cached = await caches.match(request)
  const fresh = fetch(request)
    .then(async (response) => {
      if (response.ok) {
        const cache = await caches.open(CACHE)
        await cache.put(request, response.clone())
      }
      return response
    })
    .catch(() => cached || Response.error())
  if (cached) {
    event.waitUntil(fresh.catch(() => undefined))
    return cached
  }
  return fresh
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || !url.href.startsWith(SCOPE)) return
  if (url.pathname.endsWith('/sw.js')) return
  if (request.mode === 'navigate') {
    event.respondWith(page(request))
  } else if (url.pathname.includes('/assets/')) {
    event.respondWith(cacheFirst(request))
  } else {
    event.respondWith(staleWhileRevalidate(request, event))
  }
})

// Une notification arrive. Le nombre sur l'icône suit, sur les téléphones
// qui le permettent. Si l'appli est déjà ouverte sur cet écran, rien ne sonne.
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(show(data))
})

async function show(data) {
  const link = typeof data.link === 'string' && data.link.startsWith('/') ? data.link : '/app/notifications'
  if (typeof data.badge === 'number' && self.navigator.setAppBadge) {
    try {
      if (data.badge > 0) await self.navigator.setAppBadge(data.badge)
      else await self.navigator.clearAppBadge()
    } catch {
      // Pas de pastille sur cet appareil.
    }
  }
  const target = inScope(link)
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  if (windows.some((w) => w.focused && w.visibilityState === 'visible' && w.url === target)) return
  await self.registration.showNotification(data.title || 'AEGB', {
    body: data.body || '',
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    icon: inScope('icons/icon-192.png'),
    badge: inScope('icons/badge-96.png'),
    lang: 'fr',
    data: { link },
  })
}

// Un appui ouvre le bon écran : dans l'appli déjà ouverte, sinon dans une nouvelle.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const link = (event.notification.data && event.notification.data.link) || '/app/fil'
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const open = windows.find((w) => w.url.startsWith(SCOPE))
      if (open) {
        await open.focus()
        open.postMessage({ type: 'ouvrir', link })
        return
      }
      await self.clients.openWindow(inScope(link))
    })(),
  )
})

// Le navigateur a changé l'abonnement : l'appli le renverra à sa prochaine ouverture.
self.addEventListener('pushsubscriptionchange', () => {
  // Rien à faire ici : sans session, le service worker ne peut pas parler à la base.
})

void VERSION
