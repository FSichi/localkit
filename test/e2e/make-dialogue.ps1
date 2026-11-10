<#
  Writes the turns of a three-person conversation for test/e2e/voices.mjs, with the Windows voices.
  Windows only brings one Spanish voice, so B and C reuse it at other speeds, and the test changes their
  pitch so they sound like other people. English voices reading Spanish don't get transcribed.
  Usage: powershell -File test/e2e/make-dialogue.ps1 -Folder test/output/dialogue
#>
param([Parameter(Mandatory)][string]$Folder)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$null = New-Item -ItemType Directory -Force -Path $Folder
$turns = @(
  @('A', 'Buenos dias a todos, arrancamos con la revision del presupuesto del trimestre.'),
  @('B', 'Perfecto, yo traje los numeros de ventas de septiembre y octubre.'),
  @('C', 'Antes de eso quiero comentar que el proveedor nuevo confirmo la entrega.'),
  @('A', 'Buenisimo, entonces dejamos la entrega para el final de la reunion.'),
  @('B', 'Las ventas crecieron un doce por ciento respecto del mes anterior.'),
  @('C', 'Eso coincide con lo que vimos en la campana de redes sociales.'),
  @('A', 'Si, aunque el costo por cliente tambien subio bastante este mes.'),
  @('B', 'Puedo preparar un informe con el detalle por canal para el jueves.'),
  @('C', 'Me parece bien, y yo le pido al proveedor la factura actualizada.'),
  @('A', 'Listo, nos vemos el jueves con todo eso resuelto. Gracias a todos.')
)
$rates = @{ A = 0; B = 1; C = -2 }
for ($index = 0; $index -lt $turns.Count; $index++) {
  $voice, $text = $turns[$index]
  $synthesizer = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $synthesizer.SelectVoice('Microsoft Sabina Desktop')
  $synthesizer.Rate = $rates[$voice]
  $synthesizer.SetOutputToWaveFile((Join-Path $Folder ('turn-{0:D2}-{1}.wav' -f $index, $voice)))
  $synthesizer.Speak($text)
  $synthesizer.Dispose()
}
