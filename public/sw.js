// Service worker: guarda os arquivos do aplicativo no aparelho para ele abrir
// sem internet. Com internet, sempre busca a versão mais nova.

const CACHE = 'estudio-aberto-v3';
const EXTRAS = ['captura.worklet.js', 'manifest.webmanifest', 'icone-192.png', 'icone-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    fetch('arquivos.json')
      .then((r) => r.json())
      .then((arquivos) => caches.open(CACHE).then((c) => c.addAll([...arquivos, ...EXTRAS])))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
  const pedido = e.request;
  if (pedido.method !== 'GET' || new URL(pedido.url).origin !== location.origin) return;
  e.respondWith(
    fetch(pedido)
      .then((resposta) => {
        if (resposta.ok) {
          const copia = resposta.clone();
          caches.open(CACHE).then((c) => c.put(pedido, copia));
        }
        return resposta;
      })
      .catch(() => caches.match(pedido, { ignoreSearch: true }).then((r) => r || caches.match('./'))),
  );
});
