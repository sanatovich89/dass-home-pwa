/* Service worker: DASS HOME — единое приложение (владелец + менеджер).
   Кэширует только оболочку и обе подстраницы (HTML/манифест), чтобы приложение
   открывалось офлайн и мгновенно при плохой связи. Все обращения к
   Apps Script API (script.google.com) всегда идут в сеть — данные заказов,
   остатков и касс не должны раздаваться из кэша.

   v2: критически важно — fetch(event.request) без явного cache:'no-store'
   может тихо вернуть response из HTTP-кэша браузера (не из Cache Storage),
   из-за чего "network-first" на деле отдавал устаревший index.html/manager.html/
   owner.html даже при рабочей сети (баг, из-за которого не работал вход).
   Теперь запрос оболочки всегда идёт в сеть с явным обходом HTTP-кэша. */

var CACHE_NAME = 'dass-home-shell-v6';
var SHELL_FILES = [
  './',
  './index.html',
  './owner.html',
  './manager.html',
  './manifest.json',
  './icons/brand-mark.png',
  './icons/brand-wordmark.png',
  './icons/brand-mark-dark.png',
  './icons/brand-wordmark-dark.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) { return cache.addAll(SHELL_FILES); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names.filter(function (n) { return n !== CACHE_NAME; })
             .map(function (n) { return caches.delete(n); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);

  /* API-запросы и всё стороннее — не трогаем, идём в сеть напрямую. */
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  /* Оболочка приложения: network-first с явным обходом HTTP-кэша браузера
     (cache: 'no-store'), чтобы новая версия подхватывалась сразу при наличии
     связи, а при офлайне — отдаём из Cache Storage. */
  var freshRequest = new Request(event.request.url, {
    method: 'GET',
    headers: event.request.headers,
    mode: 'same-origin',
    credentials: event.request.credentials,
    redirect: 'follow',
    cache: 'no-store'
  });

  event.respondWith(
    fetch(freshRequest)
      .then(function (resp) {
        var copy = resp.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, copy); });
        return resp;
      })
      .catch(function () {
        return caches.match(event.request).then(function (cached) {
          return cached || caches.match('./index.html');
        });
      })
  );
});
