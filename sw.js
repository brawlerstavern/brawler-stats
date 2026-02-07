const CACHE_NAME = 'brawler-cdn-v1';
const CDN_ORIGIN = 'https://cdn.brawlerstavern.com';
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());

self.addEventListener('fetch', (event) => {
    const url = event.request.url;

    // Only cache CDN image requests
    if (!url.startsWith(CDN_ORIGIN)) return;

    event.respondWith(
        caches.open(CACHE_NAME).then(async (cache) => {
            const cached = await cache.match(event.request);

            if (cached) {
                // Check if cache entry is still fresh
                const cachedTime = cached.headers.get('x-cached-at');
                if (cachedTime && (Date.now() - parseInt(cachedTime)) < CACHE_DURATION) {
                    return cached;
                }
            }

            // Fetch from network
            try {
                const response = await fetch(event.request);
                if (response.ok) {
                    // Clone and store with a timestamp header
                    const headers = new Headers(response.headers);
                    headers.set('x-cached-at', Date.now().toString());
                    const stamped = new Response(await response.clone().blob(), {
                        status: response.status,
                        statusText: response.statusText,
                        headers,
                    });
                    cache.put(event.request, stamped);
                }
                return response;
            } catch (err) {
                // Network failed, return stale cache if available
                if (cached) return cached;
                throw err;
            }
        })
    );
});
