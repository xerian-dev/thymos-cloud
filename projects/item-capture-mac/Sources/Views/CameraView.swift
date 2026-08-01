import SwiftUI
import AVFoundation
import AppKit

/// Live camera viewfinder with a capture button.
/// Uses AVCaptureSession to display real-time video from the Mac's camera.
struct CameraView: View {
    @State private var cameraManager = CameraManager()
    @State private var capturedImage: NSImage?

    var body: some View {
        VStack(spacing: 12) {
            // Viewfinder
            ZStack {
                if cameraManager.isRunning {
                    CameraPreviewRepresentable(session: cameraManager.session)
                        .aspectRatio(4/3, contentMode: .fit)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(Color.secondary.opacity(0.3), lineWidth: 1)
                        )
                } else {
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color.black.opacity(0.05))
                        .aspectRatio(4/3, contentMode: .fit)
                        .overlay {
                            VStack(spacing: 8) {
                                Image(systemName: "camera.fill")
                                    .font(.title)
                                    .foregroundStyle(.tertiary)
                                Text(cameraManager.errorMessage ?? "Starting camera...")
                                    .font(.caption)
                                    .foregroundStyle(.tertiary)
                            }
                        }
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(Color.secondary.opacity(0.2), lineWidth: 1)
                        )
                }

                // Show captured image flash overlay
                if capturedImage != nil {
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color.white)
                        .opacity(0.6)
                        .aspectRatio(4/3, contentMode: .fit)
                        .transition(.opacity)
                        .animation(.easeOut(duration: 0.15), value: capturedImage)
                }
            }

            // Capture button
            Button(action: capturePhoto) {
                Label("Capture", systemImage: "camera.shutter.button.fill")
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(!cameraManager.isRunning)
            .keyboardShortcut(" ", modifiers: [])
            .accessibilityLabel("Capture photo")
            .accessibilityHint("Takes a photo of the item")
        }
        .onAppear {
            cameraManager.start()
        }
        .onDisappear {
            cameraManager.stop()
        }
    }

    private func capturePhoto() {
        cameraManager.capturePhoto { image in
            capturedImage = image
            // Reset the flash after a short delay
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                capturedImage = nil
            }
        }
    }
}

// MARK: - Camera Manager

@Observable
final class CameraManager: NSObject {
    let session = AVCaptureSession()
    private let photoOutput = AVCapturePhotoOutput()
    private var photoCompletion: ((NSImage?) -> Void)?

    private(set) var isRunning = false
    private(set) var errorMessage: String?

    func start() {
        guard !isRunning else { return }

        session.beginConfiguration()
        session.sessionPreset = .photo

        guard let device = AVCaptureDevice.default(for: .video) else {
            errorMessage = "No camera available"
            session.commitConfiguration()
            return
        }

        do {
            let input = try AVCaptureDeviceInput(device: device)
            if session.canAddInput(input) {
                session.addInput(input)
            }
            if session.canAddOutput(photoOutput) {
                session.addOutput(photoOutput)
            }
        } catch {
            errorMessage = "Camera access denied"
            session.commitConfiguration()
            return
        }

        session.commitConfiguration()

        Task.detached { [weak self] in
            self?.session.startRunning()
            await MainActor.run {
                self?.isRunning = true
            }
        }
    }

    func stop() {
        guard isRunning else { return }
        session.stopRunning()
        isRunning = false
    }

    func capturePhoto(completion: @escaping (NSImage?) -> Void) {
        photoCompletion = completion
        let settings = AVCapturePhotoSettings()
        photoOutput.capturePhoto(with: settings, delegate: self)
    }
}

extension CameraManager: AVCapturePhotoCaptureDelegate {
    func photoOutput(
        _ output: AVCapturePhotoOutput,
        didFinishProcessingPhoto photo: AVCapturePhoto,
        error: Error?
    ) {
        guard let data = photo.fileDataRepresentation(),
              let image = NSImage(data: data) else {
            photoCompletion?(nil)
            return
        }
        photoCompletion?(image)
    }
}

// MARK: - NSView Representable for Camera Preview

struct CameraPreviewRepresentable: NSViewRepresentable {
    let session: AVCaptureSession

    func makeNSView(context: Context) -> CameraPreviewNSView {
        let view = CameraPreviewNSView()
        view.session = session
        return view
    }

    func updateNSView(_ nsView: CameraPreviewNSView, context: Context) {}
}

final class CameraPreviewNSView: NSView {
    var session: AVCaptureSession? {
        didSet {
            guard let session else { return }
            let previewLayer = AVCaptureVideoPreviewLayer(session: session)
            previewLayer.videoGravity = .resizeAspectFill
            previewLayer.frame = bounds
            previewLayer.autoresizingMask = [.layerWidthSizable, .layerHeightSizable]
            layer = previewLayer
            wantsLayer = true
        }
    }

    override func layout() {
        super.layout()
        layer?.frame = bounds
    }
}
