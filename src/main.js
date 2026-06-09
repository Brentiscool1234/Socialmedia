'use strict';

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// Simple local settings store (saved in the user's app-data folder).
// Keeps the API key and a few preferences between launches.
// ---------------------------------------------------------------------------
function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
  } catch {
    return {};
  }
}

function saveSettings(settings) {
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), 'utf8');
}

const DEFAULTS = {
  apiKey: '',
  chatModel: 'gpt-4o-mini',
  imageModel: 'gpt-image-1'
};

function getSettings() {
  return { ...DEFAULTS, ...loadSettings() };
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#0f1116',
    title: 'Social Image Studio',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.removeMenu();
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---------------------------------------------------------------------------
// OpenAI helpers
// ---------------------------------------------------------------------------
const OPENAI_BASE = 'https://api.openai.com/v1';

function mimeFromExt(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'image/png';
}

function fileToBlob(filePath) {
  const buffer = fs.readFileSync(filePath);
  return new Blob([buffer], { type: mimeFromExt(filePath) });
}

async function openAiError(response) {
  let detail = `HTTP ${response.status}`;
  try {
    const body = await response.json();
    if (body && body.error && body.error.message) detail = body.error.message;
  } catch {
    /* ignore parse errors */
  }
  return new Error(detail);
}

// ---------------------------------------------------------------------------
// IPC: settings
// ---------------------------------------------------------------------------
ipcMain.handle('settings:get', () => getSettings());

ipcMain.handle('settings:save', (_evt, partial) => {
  const merged = { ...getSettings(), ...partial };
  saveSettings(merged);
  return merged;
});

// ---------------------------------------------------------------------------
// IPC: pick images (returns path + data URL for preview)
// ---------------------------------------------------------------------------
function readPreview(filePath) {
  const buffer = fs.readFileSync(filePath);
  const mime = mimeFromExt(filePath);
  return {
    path: filePath,
    name: path.basename(filePath),
    dataUrl: `data:${mime};base64,${buffer.toString('base64')}`
  };
}

ipcMain.handle('files:pickImages', async (_evt, { multi }) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: multi ? 'Select reference images' : 'Select a logo',
    properties: multi ? ['openFile', 'multiSelections'] : ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
  });
  if (result.canceled) return [];
  return result.filePaths.map(readPreview);
});

// ---------------------------------------------------------------------------
// IPC: chat (conversational prompt refinement)
// ---------------------------------------------------------------------------
ipcMain.handle('ai:chat', async (_evt, { messages }) => {
  const { apiKey, chatModel } = getSettings();
  if (!apiKey) throw new Error('No API key set. Add your OpenAI API key in Settings first.');

  const systemPrompt = {
    role: 'system',
    content:
      "You are a creative director that helps the user design social media images. " +
      "Have a short, friendly conversation to understand the goal, platform, mood, text overlay, " +
      "colours and how the logo / reference images should be used. Ask at most one or two concise " +
      "clarifying questions at a time. When you have enough to work with, write a single, detailed, " +
      "vivid image-generation prompt and wrap ONLY that final prompt between the markers <PROMPT> and " +
      "</PROMPT> so the app can detect it. The prompt should describe composition, style, lighting, " +
      "colours, where any logo sits, and leave space for text if the user wants text. Keep your chat " +
      "replies brief."
  };

  const response = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: chatModel,
      messages: [systemPrompt, ...messages]
    })
  });

  if (!response.ok) throw await openAiError(response);
  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? '';
});

// ---------------------------------------------------------------------------
// IPC: generate images
// ---------------------------------------------------------------------------
ipcMain.handle('ai:generate', async (_evt, opts) => {
  const { prompt, logoPath, referencePaths = [], size, quality, count } = opts;
  const { apiKey, imageModel } = getSettings();

  if (!apiKey) throw new Error('No API key set. Add your OpenAI API key in Settings first.');
  if (!prompt || !prompt.trim()) throw new Error('Please enter or generate a prompt first.');

  const images = [];
  if (logoPath) images.push(logoPath);
  for (const p of referencePaths) images.push(p);

  let response;

  if (images.length > 0) {
    // Use the image-edit endpoint so the logo + references guide the result.
    const form = new FormData();
    form.append('model', imageModel);
    form.append('prompt', prompt);
    form.append('size', size || 'auto');
    if (quality && quality !== 'auto') form.append('quality', quality);
    form.append('n', String(count || 1));
    for (const filePath of images) {
      form.append('image[]', fileToBlob(filePath), path.basename(filePath));
    }

    response = await fetch(`${OPENAI_BASE}/images/edits`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form
    });
  } else {
    // No references: plain generation.
    response = await fetch(`${OPENAI_BASE}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: imageModel,
        prompt,
        size: size || 'auto',
        ...(quality && quality !== 'auto' ? { quality } : {}),
        n: count || 1
      })
    });
  }

  if (!response.ok) throw await openAiError(response);
  const data = await response.json();
  return (data.data || [])
    .map((item) => item.b64_json)
    .filter(Boolean)
    .map((b64) => `data:image/png;base64,${b64}`);
});

// ---------------------------------------------------------------------------
// IPC: save a generated image to disk
// ---------------------------------------------------------------------------
ipcMain.handle('files:saveImage', async (_evt, { dataUrl }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save image',
    defaultPath: `social-image-${Date.now()}.png`,
    filters: [{ name: 'PNG image', extensions: ['png'] }]
  });
  if (result.canceled || !result.filePath) return { saved: false };

  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
  fs.writeFileSync(result.filePath, Buffer.from(base64, 'base64'));
  return { saved: true, path: result.filePath };
});
