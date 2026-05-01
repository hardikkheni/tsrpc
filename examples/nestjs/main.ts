import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

const app = await NestFactory.create(AppModule);
await app.listen(3500, () => {
  console.log('NestJS JSON-RPC server listening on http://localhost:3500/rpc');
  console.log('Press Ctrl+C to stop.');
});
