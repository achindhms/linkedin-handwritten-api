const { FONTS, INKS, PAPERS } = require('./fonts');

const BASE_STYLE = `
  :root{ --ink:#24314a; --bg:#f7f6f2; --card:#fff; --border:#e3e0d6; --muted:#83806f; }
  *{ box-sizing:border-box; }
  body{ font-family:-apple-system,'Segoe UI',sans-serif; background:var(--bg); color:#1c1c1a; margin:0; padding:40px 20px; }
  .wrap{ max-width:640px; margin:0 auto; }
  h1{ font-size:22px; margin:0 0 6px; }
  p.sub{ color:var(--muted); margin:0 0 28px; font-size:14px; }
  .card{ background:var(--card); border:1px solid var(--border); border-radius:12px; padding:24px; margin-bottom:20px; }
  label{ display:block; font-size:12.5px; color:var(--muted); margin:14px 0 5px; font-weight:600; }
  label:first-child{ margin-top:0; }
  input[type=text], input[type=email], textarea, select{
    width:100%; padding:9px 11px; border:1px solid var(--border); border-radius:8px;
    font-size:14px; font-family:inherit; background:#fff;
  }
  textarea{ min-height:90px; resize:vertical; }
  button{
    background:var(--ink); color:#fff; border:none; padding:11px 18px; border-radius:8px;
    font-weight:600; font-size:14px; cursor:pointer; margin-top:16px;
  }
  button:hover{ background:#1b2740; }
  button:disabled{ opacity:.5; cursor:not-allowed; }
  .row{ display:flex; gap:10px; }
  .row > div{ flex:1; }
  .keybox{
    background:#eef1f6; border:1px solid #c9d3e3; border-radius:8px; padding:14px;
    font-family:ui-monospace,monospace; font-size:13.5px; word-break:break-all; margin-top:12px;
  }
  .note{ font-size:12.5px; color:var(--muted); margin-top:10px; line-height:1.5; }
  a{ color:var(--ink); }
  img.preview{ max-width:100%; border-radius:8px; border:1px solid var(--border); margin-top:16px; display:block; }
  pre.err{ background:#fdeceb; border:1px solid #f3c8c4; color:#8a2e24; padding:10px 12px; border-radius:8px; font-size:12.5px; white-space:pre-wrap; margin-top:12px; }
  pre.debug{ background:#f4f4f0; border:1px solid var(--border); padding:10px 12px; border-radius:8px; font-size:12px; overflow:auto; margin-top:10px; }
`;

function signupForm({ error } = {}) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Get an API key</title>
  <style>${BASE_STYLE}</style></head><body><div class="wrap">
  <h1>Postcard API — get your key</h1>
  <p class="sub">Self-serve. No approval step — this just issues you a key you can use right away.</p>
  <div class="card">
    ${error ? `<pre class="err">${error}</pre>` : ''}
    <form method="POST" action="/signup">
      <label>Your name</label>
      <input type="text" name="name" required>
      <label>Email (just for your own reference, not verified)</label>
      <input type="email" name="email" required>
      <button type="submit">Create my API key</button>
    </form>
  </div>
  <p class="note">Already have a key? <a href="/try">Jump to the try-it tool →</a></p>
  </div></body></html>`;
}

function signupResult({ key }) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Your API key</title>
  <style>${BASE_STYLE}</style></head><body><div class="wrap">
  <h1>You're set</h1>
  <p class="sub">Copy this now — it won't be shown again.</p>
  <div class="card">
    <div class="keybox">${key}</div>
    <p class="note">
      Use it as the <code>x-api-key</code> header on <code>/generate</code> and <code>/generate/bulk</code>,
      or paste it into the <a href="/try">try-it tool</a> to test without writing any code.
    </p>
  </div>
  </div></body></html>`;
}

function tryPage() {
  const fontOptions = FONTS.map((f) => `<option value="${f.name}">${f.name}</option>`).join('');
  const paperOptions = PAPERS.map((p) => `<option value="${p.id}">${p.id}</option>`).join('');
  const inkOptions = INKS.map((c) => `<option value="${c}">${c}</option>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Try the Postcard API</title>
  <style>${BASE_STYLE}</style></head><body><div class="wrap">
  <h1>Try it</h1>
  <p class="sub">Fills in a real request, calls the live API, and shows you exactly what was sent — useful for debugging n8n workflows too.</p>

  <div class="card">
    <label>API key</label>
    <input type="text" id="apiKey" placeholder="pk_...">
    <p class="note">No key yet? <a href="/signup">Get one here</a>. Saved in your browser only, never sent anywhere but this API.</p>

    <div class="row">
      <div><label>Name</label><input type="text" id="name" value="Nicolas"></div>
      <div><label>Company</label><input type="text" id="company" value="Atom11"></div>
    </div>

    <label>Message (use {{name}} / {{company}})</label>
    <textarea id="message">Hey {{name}}, good morning!

I came across {{company}} recently and wanted to reach out.</textarea>

    <div class="row">
      <div><label>Layout</label>
        <select id="layout"><option value="note">Plain note</option><option value="postcard">Postcard</option></select>
      </div>
      <div><label>Font</label><select id="font">${fontOptions}</select></div>
    </div>
    <div class="row">
      <div><label>Ink</label><select id="ink">${inkOptions}</select></div>
      <div><label>Paper</label><select id="paper">${paperOptions}</select></div>
    </div>

    <button id="go">Generate</button>

    <div id="result"></div>
  </div>
  </div>

  <script>
    const $ = (id) => document.getElementById(id);
    const savedKey = localStorage.getItem('postcard_api_key');
    if (savedKey) $('apiKey').value = savedKey;

    $('go').onclick = async () => {
      const btn = $('go');
      const resultEl = $('result');
      resultEl.innerHTML = '';
      const key = $('apiKey').value.trim();
      if (!key) { resultEl.innerHTML = '<pre class="err">Paste an API key first.</pre>'; return; }
      localStorage.setItem('postcard_api_key', key);

      const body = {
        name: $('name').value,
        company: $('company').value,
        message: $('message').value,
        layout: $('layout').value,
        font: $('font').value,
        ink: $('ink').value,
        paper: $('paper').value,
      };

      btn.disabled = true; btn.textContent = 'Generating...';
      try {
        const res = await fetch('/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': key },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Request failed (' + res.status + ')' }));
          resultEl.innerHTML = '<pre class="err">' + (err.error || 'Unknown error') + '</pre>'
            + '<pre class="debug">Sent: ' + JSON.stringify(body, null, 2) + '</pre>';
        } else {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          resultEl.innerHTML = '<img class="preview" src="' + url + '">'
            + '<pre class="debug">Sent: ' + JSON.stringify(body, null, 2) + '</pre>';
        }
      } catch (e) {
        resultEl.innerHTML = '<pre class="err">Network error: ' + e.message + '</pre>';
      }
      btn.disabled = false; btn.textContent = 'Generate';
    };
  </script>
  </body></html>`;
}

module.exports = { signupForm, signupResult, tryPage };
