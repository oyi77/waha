import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import esm from '@waha/vendor/esm';

@Injectable()
export class BufferJsonReplacerInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => {
        if (typeof data !== 'object' || data === null) {
          return data;
        }
        // Express Response returned from @Res() handlers — never serialize it
        // (circular structure). Pass through untouched.
        if (typeof data?.status === 'function' && typeof data?.json === 'function') {
          return data;
        }

        if (Buffer.isBuffer(data) || data?.data || data?.url) {
          return data;
        }

        // StreamableFile
        if (data instanceof StreamableFile) {
          return data;
        }

        return JSON.parse(JSON.stringify(data, esm.b.BufferJSON.replacer));
      }),
    );
  }
}
