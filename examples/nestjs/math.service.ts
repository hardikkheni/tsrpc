import 'reflect-metadata';
import { createRouter, procedure } from '@jsontpc/core';
import { JsonRpcHandler, JsonRpcProvider } from '@jsontpc/nestjs';
import { z } from 'zod';

const addInput = z.object({ a: z.number(), b: z.number() });
const greetInput = z.object({ name: z.string() });
const logEventInput = z.object({ name: z.string() });

// Exported for typed client — mirrors @JsonRpcHandler declarations below
export const router = createRouter({
  add: procedure
    .input(addInput)
    .output(z.number())
    .handler(({ input }) => input.a + input.b),
  greet: procedure
    .input(greetInput)
    .output(z.string())
    .handler(({ input }) => `Hello, ${input.name}!`),
  logEvent: procedure.input(logEventInput).handler(() => {}),
});

@JsonRpcProvider()
export class MathService {
  @JsonRpcHandler('add', { input: addInput, output: z.number() })
  add(input: { a: number; b: number }): number {
    return input.a + input.b;
  }

  @JsonRpcHandler('greet', { input: greetInput, output: z.string() })
  greet(input: { name: string }): string {
    return `Hello, ${input.name}!`;
  }

  @JsonRpcHandler('logEvent', { input: logEventInput })
  logEvent(input: { name: string }): void {
    console.log(`[server] event received: ${input.name}`);
  }
}
