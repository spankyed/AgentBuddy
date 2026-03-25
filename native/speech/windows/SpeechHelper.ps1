Add-Type -AssemblyName System.Speech

function Write-Event($obj) {
    $json = $obj | ConvertTo-Json -Compress
    [Console]::Out.WriteLine($json)
    [Console]::Out.Flush()
}

$recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine
$recognizer.SetInputToDefaultAudioDevice()
$recognizer.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))

$recognizer.Add_SpeechHypothesized({
    param($sender, $e)
    Write-Event @{ event = "partial"; text = $e.Result.Text }
})

$recognizer.Add_SpeechRecognized({
    param($sender, $e)
    Write-Event @{ event = "final"; text = $e.Result.Text }
})

$recognizer.Add_RecognizeCompleted({
    param($sender, $e)
    if ($e.Error) {
        Write-Event @{ event = "error"; code = "recognition_error"; message = $e.Error.Message }
    }
    Write-Event @{ event = "stopped" }
})

Write-Event @{ event = "ready" }

# Read JSON commands from stdin
while ($line = [Console]::In.ReadLine()) {
    if (-not $line) { continue }
    try {
        $cmd = $line | ConvertFrom-Json
        switch ($cmd.command) {
            "start" {
                $recognizer.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)
                Write-Event @{ event = "started" }
            }
            "stop" {
                $recognizer.RecognizeAsyncStop()
            }
        }
    } catch {
        Write-Event @{ event = "error"; code = "command_parse_error"; message = $_.Exception.Message }
    }
}

$recognizer.Dispose()
