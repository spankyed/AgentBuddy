import Foundation
import Speech
import AVFoundation

class SpeechHelper: NSObject, AVCaptureAudioDataOutputSampleBufferDelegate {
    private var captureSession: AVCaptureSession?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var speechRecognizer: SFSpeechRecognizer?
    private let captureQueue = DispatchQueue(label: "speech.capture")

    func emitEvent(_ dict: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: dict),
              let json = String(data: data, encoding: .utf8) else { return }
        print(json)
        fflush(stdout)
    }

    func requestAuthorization(completion: @escaping (Bool) -> Void) {
        SFSpeechRecognizer.requestAuthorization { status in
            switch status {
            case .authorized:
                AVCaptureDevice.requestAccess(for: .audio) { granted in
                    completion(granted)
                }
            default:
                completion(false)
            }
        }
    }

    func start(lang: String) {
        speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: lang))

        guard let speechRecognizer = speechRecognizer, speechRecognizer.isAvailable else {
            emitEvent(["event": "error", "code": "not_available", "message": "Speech recognizer not available for language: \(lang)"])
            return
        }

        // Stop any existing session
        stopRecognition()

        recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
        guard let recognitionRequest = recognitionRequest else {
            emitEvent(["event": "error", "code": "request_failed", "message": "Could not create recognition request"])
            return
        }

        recognitionRequest.shouldReportPartialResults = true

        // Prefer on-device recognition when available
        if #available(macOS 13.0, *) {
            recognitionRequest.requiresOnDeviceRecognition = false
            if speechRecognizer.supportsOnDeviceRecognition {
                recognitionRequest.requiresOnDeviceRecognition = true
            }
        }

        // Use AVCaptureSession instead of AVAudioEngine to avoid interrupting
        // other audio (YouTube, TTS, etc.). AVCaptureSession only touches the
        // input path and doesn't reconfigure the output audio hardware.
        let session = AVCaptureSession()

        guard let mic = AVCaptureDevice.default(for: .audio),
              let input = try? AVCaptureDeviceInput(device: mic) else {
            emitEvent(["event": "error", "code": "mic_failed", "message": "Could not access microphone"])
            return
        }

        guard session.canAddInput(input) else {
            emitEvent(["event": "error", "code": "mic_failed", "message": "Could not add microphone input to capture session"])
            return
        }
        session.addInput(input)

        let output = AVCaptureAudioDataOutput()
        output.setSampleBufferDelegate(self, queue: captureQueue)

        guard session.canAddOutput(output) else {
            emitEvent(["event": "error", "code": "capture_failed", "message": "Could not add audio output to capture session"])
            return
        }
        session.addOutput(output)

        session.startRunning()
        captureSession = session

        recognitionTask = speechRecognizer.recognitionTask(with: recognitionRequest) { [weak self] result, error in
            guard let self = self else { return }

            if let result = result {
                let text = result.bestTranscription.formattedString
                if result.isFinal {
                    self.emitEvent(["event": "final", "text": text])
                } else {
                    self.emitEvent(["event": "partial", "text": text])
                }
            }

            if let error = error {
                // Don't emit error if we intentionally cancelled
                let nsError = error as NSError
                if nsError.domain == "kAFAssistantErrorDomain" && nsError.code == 216 {
                    // Recognition cancelled — expected on stop
                    return
                }
                self.emitEvent(["event": "error", "code": "recognition_error", "message": error.localizedDescription])
                self.stopRecognition()
            }
        }

        emitEvent(["event": "started"])
    }

    // AVCaptureAudioDataOutputSampleBufferDelegate
    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        recognitionRequest?.appendAudioSampleBuffer(sampleBuffer)
    }

    func stopRecognition() {
        captureSession?.stopRunning()
        captureSession = nil
        recognitionRequest?.endAudio()
        recognitionTask?.finish()
        recognitionRequest = nil
        recognitionTask = nil
        emitEvent(["event": "stopped"])
    }

    func run() {
        requestAuthorization { [weak self] authorized in
            guard let self = self else { return }
            if !authorized {
                self.emitEvent(["event": "error", "code": "not_authorized", "message": "Microphone or speech recognition permission denied"])
                exit(1)
            }
            self.emitEvent(["event": "ready"])
        }

        // Read JSON commands from stdin
        let stdinSource = DispatchSource.makeReadSource(fileDescriptor: STDIN_FILENO, queue: .global())
        var buffer = ""

        stdinSource.setEventHandler {
            let data = FileHandle.standardInput.availableData
            if data.isEmpty {
                // EOF — parent process closed stdin
                exit(0)
            }
            guard let str = String(data: data, encoding: .utf8) else { return }
            buffer += str
            while let newlineRange = buffer.range(of: "\n") {
                let line = String(buffer[buffer.startIndex..<newlineRange.lowerBound])
                buffer = String(buffer[newlineRange.upperBound...])

                guard let lineData = line.data(using: .utf8),
                      let json = try? JSONSerialization.jsonObject(with: lineData) as? [String: Any],
                      let command = json["command"] as? String else { continue }

                DispatchQueue.main.async { [weak self] in
                    switch command {
                    case "start":
                        let lang = json["lang"] as? String ?? "en-US"
                        self?.start(lang: lang)
                    case "stop":
                        self?.stopRecognition()
                    default:
                        break
                    }
                }
            }
        }

        stdinSource.setCancelHandler {
            exit(0)
        }

        stdinSource.resume()

        // Keep the run loop alive
        RunLoop.main.run()
    }
}

let helper = SpeechHelper()
helper.run()
