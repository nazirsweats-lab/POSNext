// public/sw.js  — POSNext Custom Service Worker
// Strategy:
//   • App shell (HTML/JS/CSS)  → Cache-first (safe: hashed filenames)
//   • Navigation to /pos        → Network-first, fallback to cache
//   • API calls (/api, /method) → Network-only (never cache live data)
//   • Product images (/files/)  → Stale-while-revalidate
//   • Everything else           → Network-first with cache fallback

const CACHE_VERSION = "posnext-v1"
const SHELL_URLS = ["/pos", "/pos/"]

// ── INSTALL ──────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
	event.waitUntil(
		caches.open(CACHE_VERSION).then((cache) => {
			console.log("[SW] Installing — caching app shell")
			// Don't fail install if shell fetch fails (e.g. first offline deploy)
			return cache.addAll(SHELL_URLS).catch((err) => {
				console.warn("[SW] Shell pre-cache partial failure:", err)
			})
		})
	)
	self.skipWaiting()
})

// ── ACTIVATE ─────────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches.keys().then((keys) =>
			Promise.all(
				keys
					.filter((key) => key !== CACHE_VERSION)
					.map((key) => {
						console.log("[SW] Deleting stale cache:", key)
						return caches.delete(key)
					})
			)
		)
	)
	self.clients.claim() // control all open tabs immediately
})

// ── FETCH ─────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
	const { request } = event
	const url = new URL(request.url)

	// 1. Non-GET (POST/PUT/DELETE) → always go to network (API writes)
	if (request.method !== "GET") return

	// 2. API / Frappe RPC → Network-only, never cache
	if (
		url.pathname.startsWith("/api/") ||
		url.pathname.startsWith("/method/") ||
		url.pathname.startsWith("/resource/")
	) {
		return // browser default: network, fail offline
	}

	// 3. Hashed JS/CSS/font assets → Cache-first (safe because filenames are content-hashed)
	if (
		url.pathname.startsWith("/assets/") ||
		url.pathname.match(/\.(js|css|woff2?|ttf|eot)(\?.*)?$/)
	) {
		event.respondWith(cacheFirst(request))
		return
	}

	// 4. Product / file images → Stale-while-revalidate
	if (url.pathname.startsWith("/files/")) {
		event.respondWith(staleWhileRevalidate(request))
		return
	}

	// 5. Page navigations → Network-first, fall back to cached /pos shell
	if (request.mode === "navigate") {
		event.respondWith(networkFirstNavigation(request))
		return
	}

	// 6. Default → Network-first with cache fallback
	event.respondWith(networkFirstWithFallback(request))
})

// ── STRATEGIES ───────────────────────────────────────────────────────────────

/** Cache-first: serve from cache; fetch + store if missing */
async function cacheFirst(request) {
	const cached = await caches.match(request)
	if (cached) return cached

	try {
		const response = await fetch(request)
		if (response.ok) {
			const cache = await caches.open(CACHE_VERSION)
			cache.put(request, response.clone())
		}
		return response
	} catch (err) {
		console.warn("[SW] cacheFirst fetch failed:", request.url, err)
		return new Response("Offline — asset not cached", { status: 503 })
	}
}

/** Network-first for navigations: try network, fall back to cached shell */
async function networkFirstNavigation(request) {
	try {
		const response = await fetch(request)
		if (response.ok) {
			const cache = await caches.open(CACHE_VERSION)
			cache.put(request, response.clone())
		}
		return response
	} catch {
		// Offline: serve the cached /pos shell so Vue router can take over
		const cached =
			(await caches.match(request)) ||
			(await caches.match("/pos")) ||
			(await caches.match("/pos/"))
		if (cached) return cached
		return new Response("<h2>POSNext is offline</h2><p>Please load the app once while online.</p>", {
			status: 503,
			headers: { "Content-Type": "text/html" },
		})
	}
}

/** Network-first with cache fallback (generic) */
async function networkFirstWithFallback(request) {
	try {
		const response = await fetch(request)
		if (response.ok) {
			const cache = await caches.open(CACHE_VERSION)
			cache.put(request, response.clone())
		}
		return response
	} catch {
		const cached = await caches.match(request)
		return cached || new Response("Offline", { status: 503 })
	}
}

/** Stale-while-revalidate: serve cache immediately, refresh in background */
async function staleWhileRevalidate(request) {
	const cache = await caches.open(CACHE_VERSION)
	const cached = await cache.match(request)

	const fetchPromise = fetch(request)
		.then((response) => {
			if (response.ok) cache.put(request, response.clone())
			return response
		})
		.catch(() => null)

	return cached || fetchPromise
}
