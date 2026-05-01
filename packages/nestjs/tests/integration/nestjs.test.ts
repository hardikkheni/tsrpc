import 'reflect-metadata';
import { Injectable } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { JsonRpcHandler, JsonRpcModule, JsonRpcProvider } from '../../src';

// ---------------------------------------------------------------------------
// Test service
// ---------------------------------------------------------------------------

const events: string[] = [];

@Injectable()
@JsonRpcProvider()
class MathService {
  @JsonRpcHandler('add', {
    input: z.object({ a: z.number(), b: z.number() }),
    output: z.number(),
  })
  add(input: { a: number; b: number }): number {
    return input.a + input.b;
  }

  @JsonRpcHandler('greet', {
    input: z.object({ name: z.string() }),
    output: z.string(),
  })
  greet(input: { name: string }): string {
    return `Hello, ${input.name}!`;
  }

  @JsonRpcHandler('logEvent', {
    input: z.object({ name: z.string() }),
  })
  logEvent(input: { name: string }): void {
    events.push(input.name);
  }
}

// ---------------------------------------------------------------------------
// Suite (bodyParser: false — raw stream path)
// ---------------------------------------------------------------------------

describe('JsonRpcModule (raw body path)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        JsonRpcModule.forRoot({
          path: '/rpc',
        }),
      ],
      providers: [MathService],
    }).compile();

    app = moduleRef.createNestApplication({ bodyParser: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // -------------------------------------------------------------------------
  // 1. Basic calls
  // -------------------------------------------------------------------------

  it('add — returns sum', async () => {
    const res = await supertest(app.getHttpServer())
      .post('/rpc')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ jsonrpc: '2.0', method: 'add', params: { a: 10, b: 32 }, id: 1 }));
    expect(res.status).toBe(200);
    expect(res.body.result).toBe(42);
  });

  it('greet — returns greeting', async () => {
    const res = await supertest(app.getHttpServer())
      .post('/rpc')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ jsonrpc: '2.0', method: 'greet', params: { name: 'World' }, id: 2 }));
    expect(res.status).toBe(200);
    expect(res.body.result).toBe('Hello, World!');
  });

  // -------------------------------------------------------------------------
  // 2. JSON-RPC 1.0 shape
  // -------------------------------------------------------------------------

  it('JSON-RPC 1.0 call — result/error fields (no jsonrpc)', async () => {
    const res = await supertest(app.getHttpServer())
      .post('/rpc')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ method: 'add', params: { a: 5, b: 3 }, id: 99 }));
    expect(res.status).toBe(200);
    expect(res.body.result).toBe(8);
    expect(res.body.error).toBeNull();
    expect(res.body.id).toBe(99);
    expect(res.body.jsonrpc).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // 3. Batch
  // -------------------------------------------------------------------------

  it('batch request — all results returned', async () => {
    const batch = [
      { jsonrpc: '2.0', method: 'add', params: { a: 1, b: 2 }, id: 10 },
      { jsonrpc: '2.0', method: 'add', params: { a: 3, b: 4 }, id: 11 },
    ];
    const res = await supertest(app.getHttpServer())
      .post('/rpc')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(batch));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    const byId = Object.fromEntries(
      (res.body as Array<{ id: number; result: number }>).map((r) => [r.id, r.result]),
    );
    expect(byId[10]).toBe(3);
    expect(byId[11]).toBe(7);
  });

  // -------------------------------------------------------------------------
  // 4. Notification — 204, side-effect runs
  // -------------------------------------------------------------------------

  it('notification — 204 No Content, handler runs', async () => {
    events.length = 0;
    const res = await supertest(app.getHttpServer())
      .post('/rpc')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ jsonrpc: '2.0', method: 'logEvent', params: { name: 'ping' } }));
    expect(res.status).toBe(204);
    await new Promise((r) => setTimeout(r, 50));
    expect(events).toContain('ping');
  });

  // -------------------------------------------------------------------------
  // 5. Method not found → -32601
  // -------------------------------------------------------------------------

  it('method not found — error code -32601', async () => {
    const res = await supertest(app.getHttpServer())
      .post('/rpc')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ jsonrpc: '2.0', method: 'nonexistent', params: {}, id: 5 }));
    expect(res.status).toBe(200);
    expect(res.body.error.code).toBe(-32601);
  });

  // -------------------------------------------------------------------------
  // 6. Invalid JSON → -32700
  // -------------------------------------------------------------------------

  it('invalid JSON body — parse error -32700', async () => {
    const res = await supertest(app.getHttpServer())
      .post('/rpc')
      .set('Content-Type', 'application/json')
      .send('not valid json{{{');
    expect(res.status).toBe(200);
    expect(res.body.error.code).toBe(-32700);
  });

  // -------------------------------------------------------------------------
  // 7. Concurrent requests
  // -------------------------------------------------------------------------

  it('concurrent requests — all resolve correctly', async () => {
    const server = app.getHttpServer();
    const [r1, r2, r3] = await Promise.all([
      supertest(server)
        .post('/rpc')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ jsonrpc: '2.0', method: 'add', params: { a: 1, b: 1 }, id: 1 })),
      supertest(server)
        .post('/rpc')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ jsonrpc: '2.0', method: 'add', params: { a: 2, b: 2 }, id: 2 })),
      supertest(server)
        .post('/rpc')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ jsonrpc: '2.0', method: 'add', params: { a: 3, b: 3 }, id: 3 })),
    ]);
    expect(r1.body.result).toBe(2);
    expect(r2.body.result).toBe(4);
    expect(r3.body.result).toBe(6);
  });

  // -------------------------------------------------------------------------
  // 8. maxMessageSize → 413
  // -------------------------------------------------------------------------

  it('oversized body — 413 response', async () => {
    const m = await Test.createTestingModule({
      imports: [
        JsonRpcModule.forRoot({
          path: '/rpc',
          maxMessageSize: 10,
        }),
      ],
      providers: [MathService],
    }).compile();
    const tinyApp = m.createNestApplication({ bodyParser: false });
    await tinyApp.init();
    try {
      const res = await supertest(tinyApp.getHttpServer())
        .post('/rpc')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ jsonrpc: '2.0', method: 'add', params: { a: 1, b: 2 }, id: 1 }));
      expect(res.status).toBe(413);
    } finally {
      await tinyApp.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Suite (bodyParser: true — req.body pre-parsed path)
// ---------------------------------------------------------------------------

describe('JsonRpcModule (body-parser enabled)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        JsonRpcModule.forRoot({
          path: '/rpc',
        }),
      ],
      providers: [MathService],
    }).compile();

    app = moduleRef.createNestApplication(); // bodyParser: true (default)
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('add — returns sum with body-parser enabled', async () => {
    const res = await supertest(app.getHttpServer())
      .post('/rpc')
      .send({ jsonrpc: '2.0', method: 'add', params: { a: 7, b: 3 }, id: 1 });
    expect(res.status).toBe(200);
    expect(res.body.result).toBe(10);
  });
});
