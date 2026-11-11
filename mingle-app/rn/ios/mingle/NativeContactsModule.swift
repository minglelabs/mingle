import Contacts
import Foundation
import React

/// Reads the address book for the contact-sync screen (invite friends by text
/// message). Contacts go to the web page only; this module sends nothing.
@objc(NativeContactsModule)
class NativeContactsModule: NSObject {
    private let store = CNContactStore()
    private let queue = DispatchQueue(label: "com.minglelabs.mingle.contacts", qos: .userInitiated)

    @objc
    static func requiresMainQueueSetup() -> Bool {
        false
    }

    private func permissionString() -> String {
        switch CNContactStore.authorizationStatus(for: .contacts) {
        case .authorized:
            return "granted"
        case .notDetermined:
            return "not_determined"
        case .denied, .restricted:
            // iOS never shows the prompt again: only Settings can change it.
            return "blocked"
        default:
            // iOS 18 "limited": the person picked which contacts to share.
            return "granted"
        }
    }

    @objc(checkPermission:rejecter:)
    func checkPermission(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter _: @escaping RCTPromiseRejectBlock
    ) {
        resolve(["permission": permissionString()])
    }

    @objc(requestPermission:rejecter:)
    func requestPermission(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter _: @escaping RCTPromiseRejectBlock
    ) {
        guard CNContactStore.authorizationStatus(for: .contacts) == .notDetermined else {
            resolve(["permission": permissionString()])
            return
        }
        store.requestAccess(for: .contacts) { [weak self] _, _ in
            resolve(["permission": self?.permissionString() ?? "unavailable"])
        }
    }

    @objc(getContacts:rejecter:)
    func getContacts(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        guard permissionString() == "granted" else {
            reject("contacts_permission", "Contacts permission is not granted", nil)
            return
        }
        queue.async { [store] in
            let keys: [CNKeyDescriptor] = [
                CNContactIdentifierKey as CNKeyDescriptor,
                CNContactPhoneNumbersKey as CNKeyDescriptor,
                CNContactOrganizationNameKey as CNKeyDescriptor,
                CNContactFormatter.descriptorForRequiredKeys(for: .fullName),
            ]
            let request = CNContactFetchRequest(keysToFetch: keys)
            var contacts: [[String: Any]] = []
            do {
                try store.enumerateContacts(with: request) { contact, _ in
                    let phones = contact.phoneNumbers.map { $0.value.stringValue }
                    guard !phones.isEmpty else { return }
                    let fullName = CNContactFormatter.string(from: contact, style: .fullName) ?? ""
                    let name = fullName.isEmpty ? contact.organizationName : fullName
                    contacts.append([
                        "id": contact.identifier,
                        "name": name,
                        "phones": phones,
                    ])
                }
                resolve(contacts)
            } catch {
                reject("contacts_failed", error.localizedDescription, error)
            }
        }
    }
}
