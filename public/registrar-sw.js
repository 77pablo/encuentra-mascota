// Registra el service worker de la PWA. Script plano, inyectado por
// public/_worker.js (agente A) con <script src="/registrar-sw.js" defer></script>
// en TODO el HTML servido. No forma parte del bundle de Expo.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () {
      // Si el registro falla (navegador raro, SW bloqueado, etc.) la app
      // sigue funcionando normal como web sin instalar: nunca rompemos nada.
    });
  });
}
