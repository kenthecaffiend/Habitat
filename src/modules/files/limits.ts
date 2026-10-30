// Shared development storage/recovery contract. HTTP uploads remain disabled.
export const RECEIPT_LIMITS={uploadBytes:20_000_000,originalBytes:20*1024*1024,previewBytes:4*1024*1024,totalBytes:64*1024*1024,files:1000,stores:1000,metadataBytes:8*1024*1024,metadataRows:50000,plaintextBytes:96*1024*1024,archiveBytes:128*1024*1024} as const;
