function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * The page the browser lands on after the OAuth redirect. It auto-triggers the
 * `yato://` deep link to refocus Electron and shows a manual "Abrir Yato Life"
 * fallback. Served from the callback route — no separate web project needed.
 *
 * The deep link is injected only as an escaped href attribute (never inline JS),
 * so an attacker-controlled error reason can't break out into script.
 */
export function renderCallbackPage(opts: {
  ok: boolean
  deepLink: string
  title: string
  message: string
}): string {
  const icon = opts.ok ? '✅' : '⚠️'
  const href = escapeHtml(opts.deepLink)
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Yato Life</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh;
    display: grid; place-items: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif;
    background: radial-gradient(1200px 600px at 50% -10%, #1b2030 0%, #0f1115 60%);
    color: #e6e8ee;
  }
  .card {
    text-align: center; max-width: 420px; padding: 2.5rem 2rem; margin: 1rem;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 18px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
  }
  .icon { font-size: 3.25rem; line-height: 1; margin-bottom: .5rem; }
  h1 { font-size: 1.4rem; margin: .25rem 0 .5rem; }
  p { color: #aab0bf; margin: .25rem 0 1.5rem; font-size: .95rem; }
  a.btn {
    display: inline-block; text-decoration: none;
    background: #4f7cff; color: #fff;
    padding: .7rem 1.4rem; border-radius: 12px; font-weight: 600;
    transition: background .15s ease;
  }
  a.btn:hover { background: #3d68ef; }
  .hint { margin-top: 1.25rem; font-size: .8rem; color: #6b7384; }
</style>
</head>
<body>
  <main class="card">
    <div class="icon">${icon}</div>
    <h1>${escapeHtml(opts.title)}</h1>
    <p>${escapeHtml(opts.message)}</p>
    <a id="open" class="btn" href="${href}">Abrir Yato Life</a>
    <div class="hint">Ya puedes cerrar esta pestaña.</div>
  </main>
  <script>
    // Reabrir la app automáticamente; el botón es el fallback manual.
    setTimeout(function () {
      var el = document.getElementById('open');
      if (el) window.location.href = el.getAttribute('href');
    }, 400);
  </script>
</body>
</html>`
}
