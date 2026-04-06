export interface IMediaConverter {
  voice(content: Buffer): Promise<Buffer>;
  video(content: Buffer): Promise<Buffer>;
}

export class CoreMediaConverter implements IMediaConverter {
  async video(content: Buffer): Promise<Buffer> {
    // Passthrough without conversion
    return content;
  }

  async voice(content: Buffer): Promise<Buffer> {
    // Passthrough without conversion
    return content;
  }
}
