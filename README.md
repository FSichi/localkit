# LocalKit

Your local toolbox for Windows: images, video, audio, PDF, transcription, passwords and QR codes. Everything runs on your computer and nothing is uploaded.

**[Download the latest version](https://github.com/FSichi/localkit/releases/latest)**

> Formerly known as Transcriptor. The installer (`Transcriptor-Setup-…`), the executable and the data folder keep that name for now, because installed versions look for the installer by that name to update themselves.

The app's interface is in Spanish.

## Features

| Tool | What it does |
|---|---|
| **Home** | Drop any file and it suggests what to do with it |
| **Images** | Optimize, convert (WebP, AVIF, JPG, PNG), resize and strip metadata, in batches, with a before/after comparison. Reads HEIC |
| **Video and audio** | Compress by quality or to a target size, convert, extract audio and trim. Uses the GPU (NVIDIA, AMD or Intel) when available |
| **PDF** | Merge, split, compress and create from images |
| **Transcribe** | Audio and video to text with Whisper, in four quality levels |
| **Record** | PC sound and microphone on separate channels, to tell who said what. Writes to disk as it records and recovers if the app closes |
| **Library** | Search by what was said, a player that follows the text, and export to TXT, Markdown, PDF and SRT |
| **Passwords** | Cryptographic generator with a strength meter. Nothing is saved to disk |
| **QR codes** | Text, Wi-Fi, contact, WhatsApp and email, with colors and a logo, or in batches from a list or a range |

## Privacy

The internet is only used to download the AI models from Hugging Face and to check this repository's releases (which can be turned off in Settings). Let people know before recording them: it is good practice and, depending on where you are, it may be required.

## Development

```bash
npm install
npm run dev
```

npm doesn't run every package's install scripts: if FFmpeg or Electron are missing, run `node node_modules/ffmpeg-static/install.js` and `node node_modules/electron/install.js`.

| Command | What it does |
|---|---|
| `npm run typecheck` | Checks the types |
| `npm test` | Unit tests |
| `npm run test:tools` | End-to-end test of the tools, checking the files they generate |
| `npm run test:transcription -- <voice1.wav> <voice2.wav>` | End-to-end test of transcription, recording and the library |
| `node test/e2e/migration.mjs` | Opens the app over data from 0.1.0 |
| `node test/e2e/loopback.mjs <voice.wav>` | Real Windows sound capture (plays the voice at low volume) |
| `node test/e2e/update.mjs` | New-version notice against the real releases, with an app built with an old version |
| `npm run installer` | Builds `dist/Transcriptor-Setup-<version>.exe` and its `.sha256` |

To run the tool tests on the packaged app: `E2E_EXE=dist/win-unpacked/Transcriptor.exe node test/e2e/tools.mjs`.

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
    features/    One module per area: images, media, pdf, transcription, library, recording, files
  preload/     Generic, typed bridge
  renderer/
    public/engine/  Whisper worker, outside the bundler
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
