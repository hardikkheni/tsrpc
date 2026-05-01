import { Module } from '@nestjs/common';
import { JsonRpcModule } from '@jsontpc/nestjs';
import { MathService } from './math.service';

@Module({
  imports: [
    JsonRpcModule.forRoot({
      path: '/rpc',
    }),
  ],
  providers: [MathService],
})
export class AppModule {}
