/* DiTo Attendance - background sender.
 *
 * Its only job: when the page is shut and the phone is locked, hand whatever is still in the outbox to
 * Android, which sends it the moment a signal comes back. It caches NOTHING - the page is always fetched
 * fresh from GitHub, so nobody is ever looking at yesterday's page.
 *
 * It cannot read the reply (the Apps Script address is on another domain), so it only fires the request.
 * That is safe: every mark carries a nonce, and the server answers a repeat with the row it already has
 * instead of writing a second one. The page confirms and clears the outbox the next time it is opened.
 */
self.addEventListener('install', function (e) { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

function openDb() {
  return new Promise(function (res, rej) {
    var rq = indexedDB.open('dito-att', 1);
    rq.onupgradeneeded = function () { try { rq.result.createObjectStore('outbox', { keyPath: 'id' }); } catch (e) { } };
    rq.onsuccess = function () { res(rq.result); };
    rq.onerror = function () { rej(rq.error); };
  });
}
function all(db) {
  return new Promise(function (res) {
    try {
      var r = db.transaction('outbox').objectStore('outbox').getAll();
      r.onsuccess = function () { res(r.result || []); };
      r.onerror = function () { res([]); };
    } catch (e) { res([]); }
  });
}
function sendAll() {
  return openDb().then(all).then(function (items) {
    if (!items.length) return;
    // oldest first, one at a time: on a weak line a queue of parallel requests is worse than a single one
    return items.sort(function (a, b) { return (a.at || 0) - (b.at || 0); }).reduce(function (chain, it) {
      return chain.then(function () {
        if (!it.url) return;
        // a visit photo is a POST with the picture in the body; everything else is a tiny GET
        if (it.body) {
          return fetch(it.url, { method: 'POST', mode: 'no-cors', cache: 'no-store', credentials: 'omit',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: it.body }).catch(function () { });
        }
        return fetch(it.url + '&bg=1&_=' + Date.now(), { mode: 'no-cors', cache: 'no-store', credentials: 'omit' })
          .catch(function () { });
      });
    }, Promise.resolve());
  }).catch(function () { });
}
self.addEventListener('sync', function (e) { if (e.tag === 'dito-att') e.waitUntil(sendAll()); });
self.addEventListener('periodicsync', function (e) { if (e.tag === 'dito-att') e.waitUntil(sendAll()); });
self.addEventListener('message', function (e) { if (e.data === 'flush') e.waitUntil(sendAll()); });
