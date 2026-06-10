# Social Image Studio

A simple Windows desktop app that turns a **logo**, some **reference images**, and a
**conversation** into ready-to-post **social media images** — powered by the OpenAI
image API. Built with Electron.

![layout](https://img.shields.io/badge/platform-Windows-blue)

## What it does

- 💬 **Talk to it.** Describe the image you want in plain English. The built-in
  creative-director chat asks a couple of questions and writes a polished image prompt
  for you (it lands in the **Final prompt** box automatically).
- 🖼 **Use your brand.** Drop in your **logo** and any **reference images** — they are
  sent along to guide the look.
- 📐 **Pick the format.** Square (feed), portrait (story/reel) or landscape (banner),
  plus quality and how many to make.
- 💾 **Save** any result as a PNG with one click.
- 🔑 **Your key, your control.** Paste your OpenAI API key once in **Settings**; it's
  stored only on your PC and used for every request the app makes.

## Logo vs. References vs. Products — the three image slots

The app sends your images to the engine with a clear, distinct role for each, so you
get the result you expect:

| Slot | Role | Use it for |
| --- | --- | --- |
| **Logo** | Placed on the design (not distorted or recoloured) | Your brand logo |
| **Reference images** | **Style & mood inspiration only** — the *look* is copied, not the actual objects | A flyer/photo whose colours, layout or vibe you like |
| **Product images** | **Your real product, reproduced faithfully** as the hero of the image | Photos of the actual item you're advertising |

Product images are opt-in: tick **"Include product images"** to reveal that uploader.

**Example (a bounce-house rental flyer):** put a flyer whose style you like under
**References**, and photos of *your actual inflatables* under **Products**. The result
copies the style you liked while featuring your real units accurately — instead of
inventing different-looking ones.

## For non-technical users (the easy path)

Once someone hands you the built **`Social Image Studio Setup.exe`**:

1. Double-click it and install like any other Windows program.
2. Launch the app, click **⚙ Settings**, paste your OpenAI API key, click **Save**.
3. Add a logo / reference images on the left, chat about your idea in the middle,
   then hit **✦ Generate images**.

You can get an OpenAI API key from <https://platform.openai.com/api-keys>. Image
generation uses your own OpenAI account/credit.

## Easiest: let GitHub build the installer for you (no Node.js needed)

This repo includes a GitHub Actions workflow that builds the Windows `.exe`
automatically on GitHub's servers.

**To download a fresh installer:**

1. Push to the repo (any push to `main` or a `claude/**` branch triggers a build), or
   go to the **Actions** tab → **Build Windows installer** → **Run workflow**.
2. Open the finished run, scroll to **Artifacts**, and download
   **`Social-Image-Studio-Windows`** — it contains the `Setup.exe`.

**To get a permanent download link (a Release):** push a version tag and the workflow
attaches the `.exe` to a GitHub Release:

```bash
git tag v1.0.0
git push origin v1.0.0
```

The Release then appears under the repo's **Releases** with the installer attached.

## Building the installer yourself (on a machine with Node.js)

You need [Node.js 18+](https://nodejs.org) installed.

```bash
npm install        # download dependencies
npm start          # (optional) run the app to try it
npm run dist       # build the Windows installer
```

The installer appears in the **`dist/`** folder as
**`Social Image Studio Setup <version>.exe`**. Share that file — anyone on Windows can
install it without needing Node.js or any setup.

### Optional: app icon

Drop a `assets/icon.ico` file in the project and add `"icon": "assets/icon.ico"` under
`build.win` in `package.json` to brand the installer and window. Without it, the default
Electron icon is used.

## How the AI calls work

- **Chat / prompt refinement** → OpenAI Chat Completions (`gpt-4o-mini` by default).
- **Image generation** → OpenAI Images API using `gpt-image-1`.
  - With a logo and/or reference images, the app uses the **image edits** endpoint so
    those images guide the result.
  - With no references, it uses the plain **generations** endpoint.

Both models are editable in **Settings** if you want to use different ones.

## Project layout

```
src/
  main.js              Electron main process — settings store + all OpenAI calls
  preload.js           Secure bridge between the UI and main process
  renderer/
    index.html         The UI
    styles.css         Styling
    renderer.js        UI logic (chat, asset pickers, generate, save)
package.json           App + electron-builder (Windows installer) config
```

## Notes

- The API key and model preferences are saved to `settings.json` in your Windows
  user-app-data folder (`%APPDATA%/Social Image Studio`).
- Network access to `api.openai.com` is required.
