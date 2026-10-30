# Componentes de terceros

El código de Transcriptor es MIT. El instalador incluye además estos componentes, cada uno con su licencia:

| Componente | Para qué se usa | Licencia |
|---|---|---|
| [FFmpeg](https://ffmpeg.org) (binario de [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static), compilación *essentials* de gyan.dev) | Decodificar audio y video, generar MP3 | GPL v3. El programa se ejecuta como un proceso separado y sin modificar. El código fuente está en [ffmpeg.org/download.html](https://ffmpeg.org/download.html) |
| [Electron](https://www.electronjs.org) | Aplicación de escritorio | MIT |
| [Transformers.js](https://github.com/huggingface/transformers.js) | Correr los modelos de IA | Apache 2.0 |
| [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) | Motor de inferencia | MIT |
| [React](https://react.dev) | Interfaz | MIT |

Los modelos no van en el instalador: la app descarga los modelos [Whisper](https://github.com/openai/whisper) de OpenAI (licencia MIT), convertidos por [onnx-community](https://huggingface.co/onnx-community), desde Hugging Face.
