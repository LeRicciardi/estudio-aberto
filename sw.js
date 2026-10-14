// Service worker: guarda os arquivos do aplicativo no aparelho para ele abrir
// sem internet. Com internet, sempre busca a versão mais nova.

const CACHE = 'estudio-aberto-v4';
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
  // Áudio enviado pelo "compartilhar" do celular (por exemplo, do WhatsApp):
  // fica guardado e a página o recolhe ao abrir.
  if (pedido.method === 'POST' && new URL(pedido.url).pathname.endsWith('/compartilhar')) {
    e.respondWith((async () => {
      const dados = await pedido.formData();
      const arquivo = dados.get('audio');
      if (arquivo && typeof arquivo !== 'string') {
        const guardado = await caches.open('estudio-aberto-recebido');
        await guardado.put('recebido', new Response(arquivo, { headers: { 'content-type': arquivo.type || 'audio/ogg', 'x-nome': encodeURIComponent(arquivo.name || 'audio') } }));
      }
      return Response.redirect('./?recebido=1', 303);
    })());
    return;
  }
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
