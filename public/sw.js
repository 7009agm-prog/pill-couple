self.addEventListener('push', function (event) {
  const data = event.data ? event.data.json() : {};
  const title = data.title || '💊 약 먹을 시간이에요!';
  const options = {
    body: data.body || '상대방이 콕 찔렀어요! 지금 약 먹고 인증샷을 올려주세요.',
    icon: '/icon.svg',
    badge: '/icon.svg',
    vibrate: [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});
