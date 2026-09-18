#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(NativeQrImageModule, NSObject)

RCT_EXTERN_METHOD(savePng:(NSString *)dataUrl
                  fileName:(NSString *)fileName
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
