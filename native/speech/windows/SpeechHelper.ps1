Add-Type -AssemblyName System.Speech

function Write-Event($obj) {
    $json = $obj | ConvertTo-Json -Compress
    [Console]::Out.WriteLine($json)
    [Console]::Out.Flush()
}

$recognizer = $null

function Remove-Recognizer {
    if ($script:recognizer) {
        try { $script:recognizer.RecognizeAsyncCancel() } catch {}
        try { $script:recognizer.Dispose() } catch {}
        $script:recognizer = $null
    }
}

function New-Recognizer($lang) {
    $culture = [System.Globalization.CultureInfo]::new($lang)
    $rec = New-Object System.Speech.Recognition.SpeechRecognitionEngine($culture)
    $rec.SetInputToDefaultAudioDevice()
    $rec.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))

    $rec.Add_SpeechHypothesized({
        param($sender, $e)
        Write-Event @{ event = "partial"; text = $e.Result.Text }
    })

    $rec.Add_SpeechRecognized({
        param($sender, $e)
        Write-Event @{ event = "final"; text = $e.Result.Text }
    })

    $rec.Add_RecognizeCompleted({
        param($sender, $e)
        if ($e.Error) {
            Write-Event @{ event = "error"; code = "recognition_error"; message = $e.Error.Message }
        }
        Write-Event @{ event = "stopped" }
    })

    return $rec
}

Write-Event @{ event = "ready" }

# Read JSON commands from stdin
while ($line = [Console]::In.ReadLine()) {
    if (-not $line) { continue }
    try {
        $cmd = $line | ConvertFrom-Json
        switch ($cmd.command) {
            "start" {
                $lang = if ($cmd.lang) { $cmd.lang } else { "en-US" }

                try {
                    Remove-Recognizer
                    $recognizer = New-Recognizer $lang
                    $recognizer.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)
                    Write-Event @{ event = "started" }
                } catch {
                    Remove-Recognizer
                    Write-Event @{ event = "error"; code = "not_available"; message = "Speech recognizer not available for language: $lang" }
                }
            }
            "stop" {
                if ($recognizer) {
                    $recognizer.RecognizeAsyncStop()
                }
            }
        }
    } catch {
        Write-Event @{ event = "error"; code = "command_parse_error"; message = $_.Exception.Message }
    }
}

Remove-Recognizer
