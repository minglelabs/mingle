#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(NativePictureInPictureModule, RCTEventEmitter)

RCT_EXTERN_METHOD(start:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(update:(NSDictionary *)options)

RCT_EXTERN_METHOD(setPlaybackState:(NSDictionary *)options)

RCT_EXTERN_METHOD(stop:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
