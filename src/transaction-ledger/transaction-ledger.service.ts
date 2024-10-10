import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserWithProfileDto } from './dto/transaction-ledgerDTO';

// Function for Bankers' Rounding (used for cash)
function bankersRounding(value: number, precision: number): number {
  const factor = Math.pow(10, precision);
  const rounded = Math.round(value * factor) / factor;
  const fractional = (value * factor) % 1;

  // If exactly halfway, round to the nearest even number
  if (fractional === 0.5) {
    return (Math.floor(value * factor) % 2 === 0) ? Math.floor(value * factor) / factor : rounded;
  }

  return rounded;
}

@Injectable()
export class TransactionLedgerService {
  constructor(private prisma: PrismaService) {}

  // Get user by identifier (email, phone, or userId)
  async getUserByIdentifier(identifier: string, type: 'email' | 'phone' | 'userId'): Promise<UserWithProfileDto> {
    let user;
    const sanitizedIdentifier = identifier.replace(/\s+/g, ''); // Sanitize phone by removing spaces

    if (type === 'email') {
      user = await this.prisma.userAccounts.findFirst({
        where: { Email: sanitizedIdentifier },
        include: { UserProfiles: true },
      });
    } else if (type === 'phone') {
      user = await this.prisma.userAccounts.findFirst({
        where: { Phone: sanitizedIdentifier },
        include: { UserProfiles: true },
      });
    } else {
      user = await this.prisma.userProfiles.findFirst({
        where: { UserProfileId: BigInt(identifier) },
        include: { UserAccounts: true },
      });
    }

    if (user && user.UserProfiles) {
      return {
        UserAccountId: user.UserAccountId,
        UserProfileId: user.UserProfileId,
        Email: user.Email,
        Phone: user.Phone,
        FirstName: user.UserProfiles.FirstName,
        LastName: user.UserProfiles.LastName,
      };
    }
    return null;
  }

  // Get grouped transactions by currency type and also calculate current balances
  async getGroupedTransactionsAndBalances(userProfileId: bigint) {
    const transactions = await this.prisma.transactions.findMany({
      where: { UserProfileId: userProfileId },
      include: {
        TransactionMean: true,
        TransactionStatus: true,
        TransactionTypes: true,
      },
      orderBy: { Date: 'desc' },
    });

    const groupedTransactions: Record<string, any[]> = {};
    const currentBalances: Record<string, number> = {};

    for (const tx of transactions) {
      const currency = tx.TransactionMean?.Description || 'Unknown Currency';
      const factor = tx.TransactionTypes?.Factor || 1; // Use Factor to determine adding/subtracting

      if (!groupedTransactions[currency]) {
        groupedTransactions[currency] = [];
        currentBalances[currency] = 0; // Initialize balance for the currency
      }

      const decimalPlaces = currency === 'Cash' ? 2 : 10; // Set decimal precision

      if (!['Pending', 'Declined', 'Expired'].includes(tx.TransactionStatus.Description)) {
        // Apply bankers' rounding only for cash transactions
        const transactionAmount = currency === 'Cash'
          ? bankersRounding(factor * tx.Amount.toNumber(), decimalPlaces)
          : Number((factor * tx.Amount.toNumber()).toFixed(decimalPlaces)); // Regular rounding for other currencies
          
        currentBalances[currency] += transactionAmount; // Calculate balance
      }

      let relatedUserName = 'Unknown User';
      
      // If transaction involves a RelatedUserProfileId, fetch their name
      if (tx.RelatedUserProfileId) {
        const relatedUser = await this.prisma.userProfiles.findFirst({
          where: { UserProfileId: tx.RelatedUserProfileId },
          select: { FirstName: true, LastName: true },
        });

        if (relatedUser) {
          relatedUserName = `${relatedUser.FirstName} ${relatedUser.LastName}`;
        }
      }

      // Adjust description for 'Send Money' or 'Send Crypto' transactions
      const description = (tx.TransactionTypes?.Description === 'Send Money' || tx.TransactionTypes?.Description === 'Send Crypto')
      ? (factor < 0 
          ? `to ${relatedUserName}` 
          : `from ${relatedUserName}`)
      : tx.TransactionTypes?.Description || 'N/A';    

      groupedTransactions[currency].push({
        ...tx,
        Description: description,  // Overwrite or add the modified description
      });
    }

    return { groupedTransactions, currentBalances };
  }
}
