// ==========================================
// Service Worker - Aline Ramos
// Versão com suporte a Push Notifications
// ==========================================

const CACHE_NAME = 'salao-cache-v14';
const urlsToCache = [
  './',
  './index.html',
  './css/style.css',
  './css/ui-components.css',
  './js/vendor/neon-js-0.10.2.min.js',
  './js/config.js',
  './js/config-render.js',
  './js/db.js',
  './js/auth.js',
  './js/auth-ui.js',
  './js/agendamento.js',
  './js/meus_agendamentos.js',
  './js/admin.js',
  './js/router.js',
  './js/ui-components.js',
  './img/icon-192.png',
  './img/icon-512.png',
  './img/agendai-icon.png'
];

// --- Install ---
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

// --- Activate ---
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (!cacheWhitelist.includes(cacheName)) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// --- Fetch (rede primeiro, cache se estiver offline) ---
self.addEventListener('fetch', event => {
  // Ignora requisições externas (banco de dados, etc)
  if (event.request.url.startsWith('http') && !event.request.url.includes(location.origin)) {
    return;
  }

  // Rede primeiro: assim cada atualização do site chega na hora.
  // O cache só é usado quando o celular está sem internet.
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (event.request.method === 'GET' && response.ok) {
          const copia = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copia));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// ==========================================
// PUSH NOTIFICATIONS
// ==========================================

/**
 * Evento 'push': disparado quando o servidor envia uma notificação.
 * O payload contém os dados do novo agendamento.
 */
self.addEventListener('push', event => {
  console.log('[SW] Push recebido!', event);

  let data = {
    title: '🆕 Novo Agendamento!',
    body: 'Um novo agendamento foi realizado.',
    icon: './img/icon-192.png',
    badge: './img/icon-192.png',
    tag: 'novo-agendamento',
    data: { url: './index.html#admin' }
  };

  // Tentar parsear o payload enviado pelo servidor
  if (event.data) {
    try {
      const payload = event.data.json();
      data = {
        title: payload.title || data.title,
        body: payload.body || data.body,
        icon: './img/icon-192.png',
        badge: './img/icon-192.png',
        tag: 'novo-agendamento',
        // Vibração no celular: padrão [vibra, pausa, vibra]
        vibrate: [200, 100, 200],
        // Dados extras para o click handler
        data: {
          url: payload.url || './index.html#admin',
          agendamento: payload.agendamento || null
        },
        // Ações rápidas (aparece nos botões da notificação no Android)
        actions: [
          { action: 'abrir', title: '📋 Ver Painel' },
          { action: 'fechar', title: '✕ Fechar' }
        ],
        requireInteraction: true // Notificação fica visível até o usuário interagir
      };
    } catch (e) {
      console.warn('[SW] Falha ao parsear payload:', e);
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, data)
  );
});

/**
 * Evento 'notificationclick': ação quando usuário clica na notificação.
 */
self.addEventListener('notificationclick', event => {
  console.log('[SW] Notificação clicada:', event.action);
  event.notification.close();

  if (event.action === 'fechar') return;

  // Abrir ou focar a aba do painel admin
  const urlToOpen = event.notification.data?.url || './index.html#admin';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // Se já há uma aba aberta do site, focar nela
      for (const client of windowClients) {
        if (client.url.includes(location.origin) && 'focus' in client) {
          client.focus();
          client.navigate(urlToOpen);
          return;
        }
      }
      // Caso contrário, abrir nova aba
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
