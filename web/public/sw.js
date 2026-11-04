// =====================================================================
// Service worker do site dos clientes.
// Só cuida do lembrete "seu horário é daqui a 30 minutos" (Web Push).
// Nada de cache: o site sempre mostra os horários direto do banco.
// =====================================================================

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (evento) => evento.waitUntil(self.clients.claim()))

self.addEventListener('push', (evento) => {
  let dados = {}
  try {
    dados = evento.data ? evento.data.json() : {}
  } catch {
    dados = { corpo: evento.data ? evento.data.text() : '' }
  }

  // O iPhone exige mostrar um aviso para cada push recebido.
  evento.waitUntil(
    self.registration.showNotification(dados.titulo || 'Barbearia Arte 10', {
      body: dados.corpo || 'Seu horário está chegando.',
      icon: '/icon-192.png',
      badge: '/favicon-32.png',
      tag: dados.tag || undefined,
      data: { url: dados.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close()
  const pedido = new URL(evento.notification.data?.url || '/', self.location.origin)
  // O aviso só abre páginas do próprio site, nunca um endereço de fora.
  const destino = pedido.origin === self.location.origin ? pedido.href : `${self.location.origin}/`

  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((janelas) => {
      for (const janela of janelas) {
        if (janela.url.startsWith(self.location.origin) && !janela.url.includes('/admin')) {
          return janela.focus()
        }
      }
      return self.clients.openWindow(destino)
    }),
  )
})
