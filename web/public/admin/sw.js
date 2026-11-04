// =====================================================================
// Service worker do painel do dono (/admin).
// Só cuida dos avisos de novo agendamento (Web Push) — nada de cache:
// o painel sempre mostra a agenda direto do banco.
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
      body: dados.corpo || 'Novo agendamento',
      icon: '/icon-192.png',
      badge: '/favicon-32.png',
      tag: dados.tag || undefined,
      renotify: Boolean(dados.tag),
      data: { url: dados.url || '/admin/' },
    }),
  )
})

// Tocar no aviso abre o painel na agenda daquele dia.
self.addEventListener('notificationclick', (evento) => {
  evento.notification.close()
  const pedido = new URL(evento.notification.data?.url || '/admin/', self.location.origin)
  // O aviso só abre páginas do próprio painel, nunca um endereço de fora.
  const destino = pedido.origin === self.location.origin ? pedido.href : `${self.location.origin}/admin/`

  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((janelas) => {
      for (const janela of janelas) {
        if (janela.url.startsWith(`${self.location.origin}/admin`)) {
          return janela.focus().then((j) => (j && 'navigate' in j ? j.navigate(destino) : j))
        }
      }
      return self.clients.openWindow(destino)
    }),
  )
})
