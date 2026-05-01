const CLASS_HANDLERS_KEY = 'jsontpc:handlers';
export const JSON_RPC_PROVIDER_META = 'jsontpc:provider';

interface Schema<T> {
  parse(data: unknown): T;
}

export interface JsonRpcHandlerOptions {
  input?: Schema<unknown>;
  output?: Schema<unknown>;
}

export interface HandlerMeta {
  method: string;
  propertyKey: string | symbol;
  options?: JsonRpcHandlerOptions;
}

export function JsonRpcProvider(): ClassDecorator {
  return (target: object): void => {
    Reflect.defineMetadata(JSON_RPC_PROVIDER_META, true, target);
  };
}

export function JsonRpcHandler(method: string, options?: JsonRpcHandlerOptions): MethodDecorator {
  return (target: object, propertyKey: string | symbol): void => {
    const existing: HandlerMeta[] =
      Reflect.getMetadata(CLASS_HANDLERS_KEY, (target as { constructor: object }).constructor) ??
      [];
    Reflect.defineMetadata(
      CLASS_HANDLERS_KEY,
      [...existing, { method, propertyKey, options }],
      (target as { constructor: object }).constructor,
    );
  };
}

export function getHandlerMeta(ctor: object): HandlerMeta[] {
  return Reflect.getMetadata(CLASS_HANDLERS_KEY, ctor) ?? [];
}
