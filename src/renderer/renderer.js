'use strict';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const state = {
  logo: null,          // { path, name, dataUrl }
  refs: [],            // [{ path, name, dataUrl }] — style inspiration only
  products: [],        // [{ path, name, dataUrl }] — actual products to reproduce
  chat: []             // [{ role, content }]
};

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
async function loadSettings() {
  const s = await window.api.getSettings();
  $('apiKey').value = s.apiKey || '';
  $('chatModel').value = s.chatModel || 'gpt-4o-mini';
  $('imageModel').value = s.imageModel || 'gpt-image-1';
}

$('settingsToggle').addEventListener('click', () => {
  $('settingsPanel').classList.toggle('hidden');
});

$('toggleKey').addEventListener('click', () => {
  const input = $('apiKey');
  input.type = input.type === 'password' ? 'text' : 'password';
});

$('saveSettings').addEventListener('click', async () => {
  await window.api.saveSettings({
    apiKey: $('apiKey').value.trim(),
    chatModel: $('chatModel').value.trim() || 'gpt-4o-mini',
    imageModel: $('imageModel').value.trim() || 'gpt-image-1'
  });
  const status = $('settingsStatus');
  status.textContent = 'Saved ✓';
  status.className = 'status ok';
  setTimeout(() => (status.textContent = ''), 2500);
});

// ---------------------------------------------------------------------------
// Asset pickers
// ---------------------------------------------------------------------------
function renderLogo() {
  const el = $('logoPreview');
  if (!state.logo) {
    el.className = 'thumb-row empty';
    el.textContent = 'No logo selected';
    return;
  }
  el.className = 'thumb-row';
  el.innerHTML = '';
  el.appendChild(makeThumb(state.logo.dataUrl, () => { state.logo = null; renderLogo(); }));
}

function renderRefs() {
  const el = $('refsPreview');
  if (state.refs.length === 0) {
    el.className = 'thumb-row empty';
    el.textContent = 'No reference images';
    return;
  }
  el.className = 'thumb-row';
  el.innerHTML = '';
  state.refs.forEach((ref, i) => {
    el.appendChild(makeThumb(ref.dataUrl, () => { state.refs.splice(i, 1); renderRefs(); }));
  });
}

function makeThumb(dataUrl, onRemove) {
  const wrap = document.createElement('div');
  wrap.className = 'thumb';
  const img = document.createElement('img');
  img.src = dataUrl;
  const btn = document.createElement('button');
  btn.className = 'remove';
  btn.textContent = '×';
  btn.title = 'Remove';
  btn.addEventListener('click', onRemove);
  wrap.append(img, btn);
  return wrap;
}

$('pickLogo').addEventListener('click', async () => {
  const picked = await window.api.pickImages(false);
  if (picked.length) { state.logo = picked[0]; renderLogo(); }
});

$('pickRefs').addEventListener('click', async () => {
  const picked = await window.api.pickImages(true);
  if (picked.length) { state.refs.push(...picked); renderRefs(); }
});

// Product images (opt-in via checkbox)
function renderProducts() {
  const el = $('productsPreview');
  if (state.products.length === 0) {
    el.className = 'thumb-row empty';
    el.textContent = 'No product images';
    return;
  }
  el.className = 'thumb-row';
  el.innerHTML = '';
  state.products.forEach((p, i) => {
    el.appendChild(makeThumb(p.dataUrl, () => { state.products.splice(i, 1); renderProducts(); }));
  });
}

$('useProducts').addEventListener('change', (e) => {
  $('productSection').classList.toggle('hidden', !e.target.checked);
  if (!e.target.checked) { state.products = []; renderProducts(); }
});

$('pickProducts').addEventListener('click', async () => {
  const picked = await window.api.pickImages(true);
  if (picked.length) { state.products.push(...picked); renderProducts(); }
});

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------
function addMessage(role, content) {
  const log = $('chatLog');
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.textContent = content;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  return div;
}

// Pull the final prompt out of <PROMPT>…</PROMPT> markers, if present.
function extractPrompt(text) {
  const match = text.match(/<PROMPT>([\s\S]*?)<\/PROMPT>/i);
  return match ? match[1].trim() : null;
}

// Hide the marker block from what we show in the chat bubble.
function stripPromptMarkers(text) {
  return text.replace(/<PROMPT>[\s\S]*?<\/PROMPT>/i, '').trim() ||
    'Done — I\'ve put the prompt in the Final prompt box on the right. Tweak it or hit Generate.';
}

async function sendChat() {
  const box = $('chatBox');
  const text = box.value.trim();
  if (!text) return;

  box.value = '';
  addMessage('user', text);
  state.chat.push({ role: 'user', content: text });

  const sendBtn = $('sendChat');
  sendBtn.disabled = true;
  const typing = addMessage('assistant typing', 'Thinking…');

  try {
    const reply = await window.api.chat(state.chat);
    state.chat.push({ role: 'assistant', content: reply });

    const prompt = extractPrompt(reply);
    typing.className = 'msg assistant';
    typing.textContent = prompt ? stripPromptMarkers(reply) : reply;

    if (prompt) {
      $('promptBox').value = prompt;
      $('promptBox').focus();
    }
  } catch (err) {
    typing.className = 'msg assistant';
    typing.textContent = `⚠ ${err.message}`;
  } finally {
    sendBtn.disabled = false;
  }
}

$('sendChat').addEventListener('click', sendChat);
$('chatBox').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
});

// ---------------------------------------------------------------------------
// Generate
// ---------------------------------------------------------------------------
async function generate() {
  const status = $('genStatus');
  const btn = $('generate');
  const prompt = $('promptBox').value.trim();

  if (!prompt) {
    status.className = 'status error';
    status.textContent = 'Enter a prompt (or build one in the chat) first.';
    return;
  }

  btn.disabled = true;
  status.className = 'status';
  status.innerHTML = '<span class="spinner"></span>Generating… this can take 10–30s.';

  try {
    const images = await window.api.generate({
      prompt,
      logoPath: state.logo ? state.logo.path : null,
      referencePaths: state.refs.map((r) => r.path),
      productPaths: $('useProducts').checked ? state.products.map((p) => p.path) : [],
      size: $('size').value,
      quality: $('quality').value,
      count: Number($('count').value)
    });

    if (!images.length) throw new Error('No images returned.');
    renderGallery(images);
    status.className = 'status ok';
    status.textContent = `Done — ${images.length} image(s) created.`;
  } catch (err) {
    status.className = 'status error';
    status.textContent = `⚠ ${err.message}`;
  } finally {
    btn.disabled = false;
  }
}

function renderGallery(images) {
  const gallery = $('gallery');
  gallery.innerHTML = '';
  images.forEach((dataUrl) => {
    const card = document.createElement('div');
    card.className = 'card';

    const img = document.createElement('img');
    img.src = dataUrl;

    const actions = document.createElement('div');
    actions.className = 'card-actions';
    const save = document.createElement('button');
    save.className = 'ghost-btn small';
    save.textContent = '⬇ Save';
    save.addEventListener('click', async () => {
      const res = await window.api.saveImage(dataUrl);
      if (res.saved) { save.textContent = 'Saved ✓'; setTimeout(() => (save.textContent = '⬇ Save'), 2000); }
    });

    actions.appendChild(save);
    card.append(img, actions);
    gallery.appendChild(card);
  });
}

$('generate').addEventListener('click', generate);

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
loadSettings();
renderLogo();
renderRefs();
renderProducts();
