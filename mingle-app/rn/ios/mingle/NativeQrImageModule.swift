import Foundation
import Photos
import React
import UIKit
import Vision

@objc(NativeQrImageModule)
class NativeQrImageModule: NSObject {
    @objc
    static func requiresMainQueueSetup() -> Bool {
        false
    }

    @objc(savePng:fileName:resolver:rejecter:)
    func savePng(
        _ dataUrl: String,
        fileName _: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let encodedImage = dataUrl.range(of: "base64,")
            .map({ String(dataUrl[$0.upperBound...]) }),
              let imageData = Data(
                base64Encoded: encodedImage,
                options: [.ignoreUnknownCharacters]
              ),
              let image = UIImage(data: imageData)
        else {
            reject("native_qr_invalid_image", "Could not decode the QR image.", nil)
            return
        }

        let saveImage = { [weak self] in
            self?.performPhotoSave(image: image, resolve: resolve, reject: reject)
        }

        let authorizationStatus = PHPhotoLibrary.authorizationStatus(for: .addOnly)
        if authorizationStatus == .notDetermined {
            PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
                guard status == .authorized || status == .limited else {
                    reject("native_qr_photo_permission_denied", "Photo library access was denied.", nil)
                    return
                }
                saveImage()
            }
            return
        }

        guard authorizationStatus == .authorized || authorizationStatus == .limited else {
            reject("native_qr_photo_permission_denied", "Photo library access was denied.", nil)
            return
        }
        saveImage()
    }

    /// Saves a chat photo exactly as sent (JPEG, PNG or WebP) to Photos, without re-encoding it.
    @objc(saveImage:fileName:resolver:rejecter:)
    func saveImage(
        _ dataUrl: String,
        fileName _: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let encodedImage = dataUrl.range(of: "base64,")
            .map({ String(dataUrl[$0.upperBound...]) }),
              let imageData = Data(
                base64Encoded: encodedImage,
                options: [.ignoreUnknownCharacters]
              ),
              UIImage(data: imageData) != nil
        else {
            reject("native_image_invalid", "Could not decode the photo.", nil)
            return
        }

        let saveData = {
            PHPhotoLibrary.shared().performChanges({
                PHAssetCreationRequest.forAsset().addResource(with: .photo, data: imageData, options: nil)
            }) { success, error in
                DispatchQueue.main.async {
                    if success {
                        resolve(["ok": true])
                    } else {
                        reject("native_image_photo_save_failed", error?.localizedDescription ?? "Could not save the photo.", error)
                    }
                }
            }
        }

        let authorizationStatus = PHPhotoLibrary.authorizationStatus(for: .addOnly)
        if authorizationStatus == .notDetermined {
            PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
                guard status == .authorized || status == .limited else {
                    reject("native_image_photo_permission_denied", "Photo library permission was denied.", nil)
                    return
                }
                saveData()
            }
            return
        }

        guard authorizationStatus == .authorized || authorizationStatus == .limited else {
            reject("native_image_photo_permission_denied", "Photo library permission was denied.", nil)
            return
        }
        saveData()
    }

    /// Looks for faces in a photo on the phone (Vision); the photo never leaves it.
    /// Resolves the number of faces and the width of the largest one as a share of the photo's width.
    @objc(detectFaces:resolver:rejecter:)
    func detectFaces(
        _ dataUrl: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let encodedImage = dataUrl.range(of: "base64,")
            .map({ String(dataUrl[$0.upperBound...]) }),
              let imageData = Data(base64Encoded: encodedImage, options: [.ignoreUnknownCharacters]),
              let image = UIImage(data: imageData),
              let cgImage = image.cgImage
        else {
            reject("native_face_invalid_image", "Could not decode the photo.", nil)
            return
        }
        DispatchQueue.global(qos: .userInitiated).async {
            let request = VNDetectFaceRectanglesRequest()
            let handler = VNImageRequestHandler(
                cgImage: cgImage,
                orientation: Self.visionOrientation(image.imageOrientation),
                options: [:]
            )
            do {
                try handler.perform([request])
                let faces = request.results ?? []
                // Bounding boxes are normalized to the (oriented) photo, so width is already a share.
                let largest = faces.map { Double($0.boundingBox.width) }.max() ?? 0
                resolve(["faces": faces.count, "largestFaceWidth": largest])
            } catch {
                reject("native_face_check_failed", error.localizedDescription, error)
            }
        }
    }

    private static func visionOrientation(_ orientation: UIImage.Orientation) -> CGImagePropertyOrientation {
        switch orientation {
        case .up: return .up
        case .down: return .down
        case .left: return .left
        case .right: return .right
        case .upMirrored: return .upMirrored
        case .downMirrored: return .downMirrored
        case .leftMirrored: return .leftMirrored
        case .rightMirrored: return .rightMirrored
        @unknown default: return .up
        }
    }

    private func performPhotoSave(
        image: UIImage,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        PHPhotoLibrary.shared().performChanges({
            PHAssetChangeRequest.creationRequestForAsset(from: image)
        }) { success, error in
            DispatchQueue.main.async {
                if success {
                    resolve(["ok": true])
                } else {
                    reject(
                        "native_qr_photo_save_failed",
                        error?.localizedDescription ?? "Could not save the QR image.",
                        error
                    )
                }
            }
        }
    }
}
