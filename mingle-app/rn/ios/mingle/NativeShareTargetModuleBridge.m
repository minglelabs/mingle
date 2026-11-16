#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(NativeShareTargetModule, NSObject)

RCT_EXTERN_METHOD(donateConversation:(NSString *)conversationId
                  displayName:(NSString *)displayName
                  avatarUrl:(nullable NSString *)avatarUrl
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(removeConversation:(NSString *)conversationId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(removeAllConversations:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(consumePendingShare:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
