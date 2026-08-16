import Foundation
import Photos
import React
import UIKit

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
