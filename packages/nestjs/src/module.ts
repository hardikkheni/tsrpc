import type { IncomingMessage, ServerResponse } from 'node:http';
import { createRequestHandler } from '@jsontpc/core';
import {
  Controller,
  type DynamicModule,
  Inject,
  Module,
  Post,
  Req,
  Res,
  type Type,
} from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { JsonRpcService } from './service';

const DEFAULT_MAX_MESSAGE_SIZE = 1_048_576; // 1 MiB

export interface JsonRpcModuleOptions {
  path: string;
  maxMessageSize?: number;
}

type RequestWithBody = IncomingMessage & { body?: unknown };

function extractBody(req: RequestWithBody, maxSize: number): Promise<string> {
  // Body-parser (NestJS default) may have already parsed — re-serialize
  if (req.body !== undefined) {
    return Promise.resolve(typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
  }
  return readRawBody(req, maxSize);
}

function readRawBody(req: IncomingMessage, maxSize: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let tooLarge = false;

    req.on('data', (chunk: Buffer) => {
      if (tooLarge) return;
      totalBytes += chunk.length;
      if (totalBytes > maxSize) {
        tooLarge = true;
        reject(Object.assign(new Error('Payload too large'), { status: 413 }));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (!tooLarge) resolve(Buffer.concat(chunks).toString('utf8'));
    });

    req.on('error', reject);
  });
}

function createJsonRpcController(path: string, maxMessageSize: number): Type<unknown> {
  @Controller()
  class JsonRpcController {
    private handle: ((rawBody: string) => Promise<string | null>) | undefined;

    constructor(@Inject(JsonRpcService) private readonly service: JsonRpcService) {}

    private getHandle(): (rawBody: string) => Promise<string | null> {
      if (!this.handle) {
        this.handle = createRequestHandler(this.service.getServer());
      }
      return this.handle;
    }

    @Post(path)
    async dispatch(@Req() req: RequestWithBody, @Res() res: ServerResponse): Promise<void> {
      let rawBody: string;
      try {
        rawBody = await extractBody(req, maxMessageSize);
      } catch (err) {
        if ((err as { status?: number }).status === 413) {
          res.writeHead(413);
          res.end();
          return;
        }
        throw err;
      }

      const responseBody = await this.getHandle()(rawBody);

      if (responseBody === null) {
        res.writeHead(204);
        res.end();
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(responseBody);
      }
    }
  }

  return JsonRpcController as Type<unknown>;
}

@Module({})
export class JsonRpcModule {
  static forRoot(options: JsonRpcModuleOptions): DynamicModule {
    const maxMessageSize = options.maxMessageSize ?? DEFAULT_MAX_MESSAGE_SIZE;
    const controllerClass = createJsonRpcController(options.path, maxMessageSize);

    return {
      module: JsonRpcModule,
      imports: [DiscoveryModule],
      providers: [JsonRpcService],
      controllers: [controllerClass],
      exports: [JsonRpcService],
    };
  }
}
