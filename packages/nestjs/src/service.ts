import { JsonRpcServer, createRouter, procedure } from '@jsontpc/core';
import { Inject, Injectable } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { JSON_RPC_PROVIDER_META, getHandlerMeta } from './decorator';

@Injectable()
export class JsonRpcService {
  private rpcServer: JsonRpcServer | undefined;

  constructor(@Inject(DiscoveryService) private readonly discovery: DiscoveryService) {}

  onModuleInit(): void {
    const routerDef: Parameters<typeof createRouter>[0] = {};

    const providers = this.discovery
      .getProviders()
      .filter(
        (wrapper) =>
          wrapper.metatype != null &&
          Reflect.getMetadata(JSON_RPC_PROVIDER_META, wrapper.metatype) === true,
      )
      .map((wrapper) => wrapper.instance as object);

    for (const provider of providers) {
      const meta = getHandlerMeta(provider.constructor as object);
      for (const { method, propertyKey, options } of meta) {
        const bound = (provider as Record<string | symbol, unknown>)[propertyKey] as (
          input: unknown,
        ) => unknown | Promise<unknown>;

        const withInput = options?.input ? procedure.input(options.input) : procedure;
        const withOutput = options?.output ? withInput.output(options.output) : withInput;
        routerDef[method] = withOutput.handler(({ input }) => bound.call(provider, input));
      }
    }

    this.rpcServer = new JsonRpcServer(createRouter(routerDef));
  }

  getServer(): JsonRpcServer {
    if (!this.rpcServer) throw new Error('JsonRpcService not initialized');
    return this.rpcServer;
  }
}
