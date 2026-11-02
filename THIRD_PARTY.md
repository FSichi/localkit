# Componentes de terceros

El código de LocalKit es MIT. El instalador incluye además estos componentes, cada uno con su licencia:

| Componente | Para qué se usa | Licencia |
|---|---|---|
| [FFmpeg](https://ffmpeg.org) (binario de [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static), compilación *essentials* de gyan.dev) | Video y audio: decodificar, comprimir, convertir, cortar, MP3 | GPL v3. El programa se ejecuta como un proceso separado y sin modificar. El código fuente está en [ffmpeg.org/download.html](https://ffmpeg.org/download.html) |
| [sharp](https://sharp.pixelplumbing.com) y [libvips](https://www.libvips.org) | Imágenes | Apache 2.0 y LGPL 3.0 |
| [heic-decode](https://github.com/catdad-experiments/heic-decode) y libheif | Leer fotos HEIC | ISC y LGPL 3.0 |
| [pdf-lib](https://pdf-lib.js.org) | PDF | MIT |
| [node-qrcode](https://github.com/soldair/node-qrcode) | Códigos QR | MIT |
| [marked](https://marked.js.org) | Leer Markdown | MIT |
| [DOMPurify](https://github.com/cure53/DOMPurify) | Sanitizar documentos | Apache 2.0 o MPL 2.0 |
| [highlight.js](https://highlightjs.org) | Resaltar código | BSD 3-Clause |
| [Electron](https://www.electronjs.org) | Aplicación de escritorio | MIT |
| [Transformers.js](https://github.com/huggingface/transformers.js) | Correr los modelos de IA | Apache 2.0 |
| [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) | Motor de inferencia | MIT |
| [React](https://react.dev) | Interfaz | MIT |

Los modelos no van en el instalador: la app descarga los modelos [Whisper](https://github.com/openai/whisper) de OpenAI (licencia MIT), convertidos por [onnx-community](https://huggingface.co/onnx-community), desde Hugging Face.
