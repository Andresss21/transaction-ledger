import { Module } from '@nestjs/common';
import { TransactionLedgerService } from './transaction-ledger.service';
import { TransactionLedgerController } from './transaction-ledger.controller';
import { PrismaModule } from '../prisma/prisma.module'; 

@Module({
  imports: [PrismaModule],
  controllers: [TransactionLedgerController],
  providers: [TransactionLedgerService],
})
export class TransactionLedgerModule {}
