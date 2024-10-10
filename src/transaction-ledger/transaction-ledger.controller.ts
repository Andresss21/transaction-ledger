import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { TransactionLedgerService } from './transaction-ledger.service';
import * as ExcelJS from 'exceljs';

@Controller('transaction-ledger')
export class TransactionLedgerController {
  constructor(private readonly transactionLedgerService: TransactionLedgerService) {}

  @Get('download')
  async downloadLedgerReport(
    @Query('identifier') identifier: string,
    @Query('type') type: 'email' | 'phone' | 'userId',
    @Res() res: Response
  ) {
    // Get the user by identifier (email, phone, or userId)
    const user = await this.transactionLedgerService.getUserByIdentifier(identifier, type);
    if (!user) {
      return res.status(404).send('User not found');
    }

    // Get the user's grouped transactions and current balances by currency
    const { groupedTransactions, currentBalances } = await this.transactionLedgerService.getGroupedTransactionsAndBalances(
      user.UserProfileId
    );

    // List of all currency types to ensure they are all displayed
    const allCurrencies = ['Cash', 'Procurrency', 'Bitcoin', 'Stellar', 'Ethereum', 'Litecoin', 'Cosmos', 'USDC', 'BAT'];

    // Generate the Excel report
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Ledger Report');

    // Adjust column widths for better readability
    worksheet.getColumn(1).width = 15;  // Date
    worksheet.getColumn(2).width = 15;  // Time
    worksheet.getColumn(3).width = 30;  // Description
    worksheet.getColumn(4).width = 15;  // Debit
    worksheet.getColumn(5).width = 15;  // Credit
    worksheet.getColumn(6).width = 15;  // Status
    worksheet.getColumn(7).width = 15;  // Balance

    // Add user details at the top of the sheet
    worksheet.addRow(['User Details']);
    worksheet.addRow(['Full Name:', `${user.FirstName} ${user.LastName}`]);
    worksheet.addRow(['Email:', user.Email]);
    worksheet.addRow(['Phone:', user.Phone]);
    
   // Add current balances for all currencies (set to 0 if no transactions)
worksheet.addRow([]);
allCurrencies.forEach(currency => {
  const balance = currentBalances[currency] || 0; // Use 0 if no balance exists
  worksheet.addRow([`${currency}:`, balance.toFixed(currency === 'Cash' ? 2 : 10)]);
});
worksheet.addRow([]); // Empty row for spacing

// Loop through each currency and create a ledger table for it
for (const currency in groupedTransactions) {
  const transactions = groupedTransactions[currency];
  let runningBalance = currentBalances[currency]; // Start with the current balance as the topmost balance

  // Add currency type header and table headers (apply bold style)
  const currencyHeaderRow = worksheet.addRow([`${currency} Ledger`]);
  const tableHeaderRow = worksheet.addRow(['Date', 'Time', 'Description', 'Debit', 'Credit', 'Status', 'Balance']);

  // Apply bold styling to currency header and table headers
  currencyHeaderRow.font = { bold: true };
  tableHeaderRow.font = { bold: true };

  // Set the appropriate decimal precision for each currency's balance
  const decimalPlaces = currency === 'Cash' ? 2 : 10;

  // Iterate through transactions in reverse order (most recent transaction first)
  transactions.forEach((tx) => {
    const factor = tx.TransactionTypes.Factor || 1;  // Get the factor for addition or subtraction
    const amount = tx.Amount.toNumber();
    const status = tx.TransactionStatus.Description;

    // Only process the balance update for "Completed" transactions
    let debit = '', credit = '';
    if (status === 'Completed' || status == 'Authorize') {
      if (factor < 0) {
        debit = amount; // Debit if factor is negative
      } else {
        credit = amount; // Credit if factor is positive
      }

      // The balance is displayed first, then the transaction is applied afterward
      const balanceFormatted = (Math.abs(runningBalance) < 0.000001) ? '0.00' : runningBalance.toFixed(decimalPlaces);

      // Add the transaction details to the worksheet
      const row = worksheet.addRow([
        tx.Date.toISOString().split('T')[0],  // Date
        tx.Date.toISOString().split('T')[1],  // Time
        tx.Description,  // Use the description directly from the service
        debit,  // Debit if negative factor
        credit,  // Credit if positive factor
        status,  // Status
        balanceFormatted  // Running balance before the next transaction
      ]);

      // Apply color formatting
      if (debit) {
        row.getCell(4).font = { color: { argb: 'FFFF0000' } }; // Red for debit
      }
      if (credit) {
        row.getCell(5).font = { color: { argb: 'FF00FF00' } }; // Green for credit
      }

      // Bold the balance column
      row.getCell(7).font = { bold: true };

      // Apply the transaction to the balance for the next iteration
      runningBalance -= amount * factor;
    }
  });

  worksheet.addRow([]); // Add an empty row between currency tables
}


    // Set headers for the file download
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename=ledger_report.xlsx');

    // Send the file
    await workbook.xlsx.write(res);
    res.end();
  }

  @Get('check-transactions')
  async checkUserTransactions(
    @Query('identifier') identifier: string,
    @Query('type') type: 'email' | 'phone' | 'userId',
    @Res() res: Response
  ) {
    // Get the user by identifier (email, phone, or userId)
    const user = await this.transactionLedgerService.getUserByIdentifier(identifier, type);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const { groupedTransactions } = await this.transactionLedgerService.getGroupedTransactionsAndBalances(
      user.UserProfileId
    );
    
    // Check if there are any transactions
    const transactionCount = Object.values(groupedTransactions).flat().length;
    
    if (transactionCount > 0) {
      return res.status(200).json({ hasTransactions: true, transactionCount });
    } else {
      return res.status(200).json({ hasTransactions: false, transactionCount: 0 });
    }
  }
}
