# LocalKit

Your local toolbox for Windows: images, video, audio, PDF, OCR, Markdown, transcription that can tell voices apart, screen recording, passwords and QR codes. Everything runs on your computer and nothing is uploaded.

**[Download the latest version](https://github.com/FSichi/localkit/releases/latest)**

> Formerly known as Transcriptor. Releases also include `Transcriptor-Setup-…`, the same installer under its old name, because versions up to 0.2.0 look for it to update themselves.

The app's interface is in Spanish.

## Features

| Tool | What it does |
|---|---|
| **Home** | Drop any file and it suggests what to do with it |
| **Images** | Optimize, convert (WebP, AVIF, JPG, PNG), resize and strip metadata, in batches, with a before/after comparison. Reads HEIC |
| **Video and audio** | Compress by quality or to a target size, convert, extract audio, trim and add subtitles (burned in, as a track or as an .srt file). Uses the GPU (NVIDIA, AMD or Intel) when available |
| **PDF** | Merge, split, compress, create from images, and reorder, rotate, delete or export pages as images |
| **Extract text** | OCR for images, screenshots and scanned PDFs, with three engines. Saves a text file or a searchable PDF |
| **Markdown reader** | Reads `.md` files with an outline, search, highlighted code and PDF export. Documents can't run scripts or load anything from the internet. Can open `.md` files from Windows |
| **Transcribe** | Audio and video to text with Whisper, in four quality levels. Optionally tells voices apart (experimental), with names you choose |
| **Record** | PC sound and microphone on separate channels, to tell who said what, with or without the screen or a window. Writes to disk as it records and recovers if the app closes |
| **Library** | Search by what was said, a player that follows the text, names for each voice, and export to TXT, Markdown, PDF and SRT |
| **Passwords** | Cryptographic generator with a strength meter. Nothing is saved to disk |
| **QR codes** | Text, Wi-Fi, contact, WhatsApp and email, with colors and a logo, or in batches from a list or a range |

## Privacy

The internet is only used to download the AI models from Hugging Face (transcription, text extraction and voices, each once) and to check this repository's releases (which can be turned off in Settings). Let people know before recording them: it is good practice and, depending on where you are, it may be required.

## Development

```bash
npm install
npm run dev
```

npm doesn't run every package's install scripts: if FFmpeg or Electron are missing, run `node node_modules/ffmpeg-static/install.js` and `node node_modules/electron/install.js`. The AI engines and the PDF viewer's assets are copied to `src/renderer/public/engine/lib` by `node scripts/copy-engine.mjs`, which `npm install` runs on its own.

| Command | What it does |
|---|---|
| `npm run typecheck` | Checks the types |
| `npm test` | Unit tests |
| `npm run test:tools` | End-to-end test of the tools, checking the files they generate |
| `npm run test:transcription -- <voice1.wav> <voice2.wav>` | End-to-end test of transcription, recording and the library |
| `node test/e2e/migration.mjs` | Opens the app over data from 0.1.0 |
| `node test/e2e/voices.mjs <folder>` | Telling voices apart, on a conversation made by `test/e2e/make-dialogue.ps1` |
| `node test/e2e/organize-pdf.mjs` | PDF page editor |
| `node test/e2e/ocr.mjs` | Text extraction with the real engines |
| `node test/e2e/markdown.mjs` | Markdown reader, including a hostile document |
| `node test/e2e/subtitles.mjs <voice.wav>` | Subtitles in video, with a real transcription |
| `node test/e2e/screen.mjs` | Screen recording of the app's own window, with real system sound |
| `node test/e2e/loopback.mjs <voice.wav>` | Real Windows sound capture (plays the voice at low volume) |
| `node test/e2e/update.mjs` | New-version notice against the real releases, with an app built with an old version |
| `npm run installer` | Builds `dist/LocalKit-Setup-<version>.exe` and its `.sha256` |

To run the tool tests on the packaged app: `E2E_EXE=dist/win-unpacked/LocalKit.exe node test/e2e/tools.mjs`.

## Architecture

The code is in English and organized by feature. All user-facing text lives in `src/shared/i18n/es.ts`.

```
src/
  shared/      Pure logic and contracts, with no Electron or DOM
    ipc.ts       Single contract between the main process and the UI
    jobs.ts      File jobs: requests and results
    i18n/        Text catalog
  main/        Main process
    index.ts     Composition root: wires everything together
    app/         Window, protocol, settings, migrations, updates
    core/        Shared services: FFmpeg, jobs, output files
    features/    One module per area: images, media, pdf, ocr, markdown, transcription, library, recording, files
  preload/     Generic, typed bridge
  renderer/
    public/engine/  Whisper and OCR workers, outside the bundler
    src/
      app/       Structure: global store, sidebar, tool registry
      lib/       UI-less utilities
      ui/        Reusable components
      styles/    Design tokens, base, components and layout
      features/  One module per tool
```

### Patterns

- **Typed IPC contract** (`shared/ipc.ts`): each channel is declared once, with its arguments and result. The preload is generic, so adding a channel touches nothing else, and the compiler validates both sides.
- **Job processors** (`main/core/jobs.ts`): each job type has its processor. `JobProcessors` requires one per type, so a new job without an implementation doesn't compile.
- **Tool registry** (`renderer/src/app/tools.ts`): each tool declares its name, icon, page and file actions. The sidebar and the home screen are built from it.
- **Reusable batches** (`features/file-batch`): `createBatch` and `BatchTool` handle the list, concurrency, progress, cancellation and summary. Each tool only brings its options and how to build the request.
- **Strategies**: hardware video encoders with automatic fallback to the CPU (`video-encoders.ts`), plus image encoders and exporters per format.
- **Downloadable models** (`shared/model-catalog.ts`): Whisper, OCR and voice models declare their files and where they come from. One store downloads them with resume, serves them to the workers and lists them in Settings.
- **Untrusted documents**: Markdown is sanitized and can only reach images next to it; a document never runs scripts or loads anything remote.
- **Typed errors** (`shared/errors.ts`): the main process throws a code and the UI turns it into a message from the catalog.
- **Safe outputs** (`core/output-files.ts`): nothing is written over an existing file, and a failed or cancelled job leaves no partial files behind.
- **Migrations** (`app/migrations.ts`): data from older versions is translated on launch, with pure, tested functions (`app/legacy-schema.ts`).

### Adding a tool

1. If it processes files, add the request to `JobRequest` in `shared/jobs.ts` and its processor in `main/index.ts`.
2. Create `renderer/src/features/<tool>/` with its page and a `tool.ts`.
3. Add it to `TOOLS` in `renderer/src/app/tools.ts` and its text to `shared/i18n/es.ts`.

### Publishing a version

1. Bump `version` in `package.json` and add `## [X.Y.Z]` to `CHANGELOG.md`.
2. Merge it to `main`.
3. `git tag vX.Y.Z && git push origin vX.Y.Z`

The workflow runs the tests, builds the installer, installs and tests it, and publishes the release with the notes from `CHANGELOG.md`. Installed apps find it on their own.

## License

[MIT](LICENSE). The installer includes FFmpeg (GPL v3) and other components: see [THIRD_PARTY.md](THIRD_PARTY.md).
