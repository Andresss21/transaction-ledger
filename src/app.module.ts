import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { TransactionLedgerModule } from './transaction-ledger/transaction-ledger.module';

@Module({
  imports: [
    PrismaModule,
    TransactionLedgerModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
