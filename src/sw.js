/*
 * Service worker of the hosted phone build (registered in src/main.js, never on the Mac):
 * FocusFrog opens without a connection. The build injects the list of its files into
 * self.__WB_MANIFEST. Firebase traffic is never touched; Firestore keeps its own offline
 * copy and queue.
 */
import { clientsClaim } from 'workbox-core';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();

// dark.css is requested with ?focusfrog=<time>; the precached copy is the build's own.
precacheAndRoute(self.__WB_MANIFEST, { ignoreURLParametersMatching: [/^focusfrog$/] });
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')));

// Backgrounds, icons and frog pictures: kept once shown.
registerRoute(
  ({ request, url }) => url.origin === self.location.origin && request.destination === 'image',
  new CacheFirst({ cacheName: 'focusfrog-images' })
);
