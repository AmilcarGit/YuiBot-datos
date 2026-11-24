// Detalles kawaii: pétalos que caen y botón activo en la barra inferior. Sin dependencias.
(function () {
  try {
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      var capa = document.createElement('div'); capa.className = 'petalos'; capa.setAttribute('aria-hidden', 'true');
      var formas = ['🌸', '✨', '💗', '🌷', '⭐'];
      for (var i = 0; i < 14; i++) {
        var p = document.createElement('i'); p.textContent = formas[i % formas.length];
        p.style.left = (i * 7.3 + (i % 3) * 2) % 100 + '%';
        p.style.fontSize = 12 + (i * 5) % 14 + 'px';
        p.style.animationDuration = 14 + (i * 3) % 12 + 's';
        p.style.animationDelay = -((i * 4) % 20) + 's';
        capa.appendChild(p);
      }
      document.body.insertBefore(capa, document.body.firstChild);
    }
  } catch (e) {}
  var ruta = location.pathname.replace(/\/$/, '') || '/';
  var enlaces = document.querySelectorAll('.dock a');
  for (var j = 0; j < enlaces.length; j++) {
    var h = enlaces[j].getAttribute('href');
    if (h === ruta || (h === '/yui' && ruta === '/yui')) enlaces[j].setAttribute('aria-current', 'page');
  }
})();
