# @jsontpc/nestjs

NestJS dynamic module + decorator adapter for `@jsontpc/core`.

## Install

```bash
pnpm add @jsontpc/nestjs @jsontpc/core
pnpm add @nestjs/common @nestjs/core reflect-metadata rxjs  # peers
```

## Quick Start

**`math.service.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { JsonRpcHandler, JsonRpcProvider } from '@jsontpc/nestjs';
import { z } from 'zod';

@Injectable()
@JsonRpcProvider()
export class MathService {
  @JsonRpcHandler('add', {
    input: z.object({ a: z.number(), b: z.number() }),
    output: z.number(),
  })
  add(input: { a: number; b: number }): number {
    return input.a + input.b;
  }
}
```

**`app.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { JsonRpcModule } from '@jsontpc/nestjs';
import { MathService } from './math.service';

@Module({
  imports: [
    JsonRpcModule.forRoot({ path: '/rpc' }),
  ],
  providers: [MathService],
})
export class AppModule {}
```

**`main.ts`**

```ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

const app = await NestFactory.create(AppModule);
await app.listen(3000);
```

**Client** — use `HttpClientTransport` from `@jsontpc/http`

```ts
import { createClient } from '@jsontpc/core';
import { HttpClientTransport } from '@jsontpc/http';

const client = createClient<typeof router>(
  new HttpClientTransport('http://localhost:3000/rpc'),
);
const result = await client.add({ a: 10, b: 5 }); // → 15
```

---

## API

### `JsonRpcModule.forRoot(options)`

Returns a NestJS `DynamicModule` that registers a `@Post(options.path)` controller and `JsonRpcService`.
Uses `DiscoveryService` to auto-discover all providers decorated with `@JsonRpcProvider()` at startup.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `path` | `string` | required | HTTP path for the JSON-RPC endpoint |
| `maxMessageSize` | `number` | `1_048_576` | Max request body in bytes (raw stream path only) |

Exports `JsonRpcService` so other modules can inject it.

### `@JsonRpcProvider()`

Class decorator that marks an `@Injectable()` service for auto-discovery by `JsonRpcModule`.
Services decorated with `@JsonRpcProvider()` are registered in the parent `AppModule`'s
`providers` array — `forRoot()` discovers them automatically via NestJS `DiscoveryService`.

```ts
@Injectable()
@JsonRpcProvider()
export class MathService {
  @JsonRpcHandler('math.add', { ... })
  add(input: { a: number; b: number }): number { ... }
}
```

### `@JsonRpcHandler(method, options?)`

Method decorator that registers the method as a JSON-RPC handler.

| Parameter | Type | Description |
|-----------|------|-------------|
| `method` | `string` | JSON-RPC method name (e.g. `'math.add'`) |
| `options.input` | `Schema<unknown>` | Zod schema (or any object with `parse()`) for params validation |
| `options.output` | `Schema<unknown>` | Zod schema for output validation (dev-mode warning only) |

The decorated method receives the **validated** input directly (not wrapped in `{ input }`).

### `JsonRpcService`

Injectable that holds the `JsonRpcServer`. Exported by `JsonRpcModule`.

```ts
import { JsonRpcService } from '@jsontpc/nestjs';

@Injectable()
export class SomeOtherService {
  constructor(private rpc: JsonRpcService) {}

  getServer() {
    return this.rpc.getServer(); // → JsonRpcServer
  }
}
```

---

## Notes

- **`reflect-metadata`** must be imported once at your app entry point (`main.ts`) before any NestJS module is loaded.
- **Auto-discovery**: `JsonRpcModule` uses NestJS `DiscoveryService` to find all providers marked with `@JsonRpcProvider()`. Register your services in the parent module's `providers` array as usual — no manual listing in `forRoot()`.
- Body-parser: the adapter reads `req.body` if already parsed (NestJS default), or reads the raw stream directly. No extra configuration needed.
- The adapter uses `createRequestHandler` from `@jsontpc/core` internally — no reimplemented dispatch loop.

---

See [docs/ARCHITECTURE.md §7.3](../../docs/ARCHITECTURE.md) for the full design.
