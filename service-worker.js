self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Check if the request is for PDF files in the 'public/notes' directory
  if (url.pathname.startsWith('/public/notes')) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request);
      })
    );
  } else {
    // For other requests, serve from cache or network as needed
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request);
      })
    );
  }
});

// Cache the entire 'public' folder when the service worker is installed
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('static-cache').then((cache) => {
      return cache.addAll([
        '/',
        '/index.html',
        '/service-worker.js', // Make sure to cache the service worker itself
        '/public/note/jss1.pdf', // Cache specific PDF files if needed
        // Add other assets from the 'public' folder as needed
      ]);
    })
  );
});
