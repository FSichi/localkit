# Changelog

Los cambios de cada versión de LocalKit. La app muestra esta lista en Ajustes › App, y las novedades de cada versión cuando se actualiza. Las notas de cada release de GitHub salen de acá.

## [0.4.0] - 2026-11-02

### Nuevo
- **Lector de Markdown**: leé documentos .md con índice, búsqueda y código resaltado, y exportalos a PDF. Si querés, Windows también puede abrirlos directamente con LocalKit. Los documentos no ejecutan nada ni cargan contenido de internet.
- **Grabar la pantalla**: grabá una pantalla o una ventana junto con el sonido de la PC y tu micrófono. El video queda en tu biblioteca y se puede transcribir como cualquier grabación.
- **Subtítulos en tus videos**: LocalKit transcribe el video y agrega los subtítulos en la imagen, como una pista que se puede apagar o en un archivo .srt. Si el video ya estaba transcripto, reutiliza ese texto.

### Mejoras
- Los subtítulos SRT exportados desde la biblioteca ahora parten las frases largas para que se lean mejor.

### Correcciones
- Cancelar una transcripción ya no deja un error escondido cuando Windows tarda en liberar los archivos temporales.

## [0.3.0] - 2026-11-02

### Mejoras
- **LocalKit en todos lados**: el instalador, el programa y la carpeta de datos dejan de llamarse Transcriptor. Tus ajustes, tu biblioteca y tus modelos pasan solos, y tus grabaciones quedan donde estaban.
- Si tenías la app anclada a la barra de tareas, puede que tengas que volver a anclarla.

### Correcciones
- Lo que borrabas de la biblioteca podía volver a aparecer si venía de la primera versión.

## [0.2.0] - 2026-11-02

### Nuevo
- **Ahora es LocalKit**: Transcriptor se convirtió en una caja de herramientas. Todo sigue procesándose en tu computadora.
- **Inicio**: soltá cualquier archivo y la app te ofrece qué hacer con él.
- **Imágenes**: optimizá, convertí (WebP, AVIF, JPG, PNG) y redimensioná por lotes, con tamaño estimado y comparación antes/después. También lee fotos HEIC.
- **Video y audio**: comprimí por calidad o hasta un tamaño final, convertí, extraé el audio y cortá. Usa la placa de video si está disponible.
- **PDF**: uní, separá, comprimí y creá un PDF desde imágenes.
- **Contraseñas**: generador seguro con medidor de fuerza. Nada se guarda en disco.
- **Códigos QR**: texto, Wi-Fi, contacto, WhatsApp y email, con colores y logo, o cientos de una vez desde una lista o un rango.

### Mejoras
- Tus ajustes, tu biblioteca y tus modelos pasan solos a la versión nueva.

## [0.1.0] - 2026-10-30

### Nuevo
- **Transcribir**: convertí audio o video en texto con IA que corre en tu computadora, con cuatro calidades, de Rápida a Máxima. Varios archivos a la vez, en cola.
- **Grabar**: grabá lo que suena en tu PC (Discord, Meet, Zoom, navegador) y tu micrófono, y distinguí lo que dijiste vos de lo que dijeron los demás. Se guarda en disco a medida que avanza y, si la app se cierra, la grabación se recupera.
- **Biblioteca**: buscá por título o por lo que se dijo, escuchá el audio siguiendo el texto y saltá a cualquier parte con un clic.
- **Exportar**: TXT, Markdown, PDF, subtítulos SRT y el audio en MP3.
- **Actualizaciones**: la app avisa cuando hay una versión nueva y se actualiza con un clic.
