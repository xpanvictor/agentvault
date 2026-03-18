/**
 * One-time setup: deposit USDFC into the Synapse payment contract.
 *
 * The Synapse SDK requires a lockup balance in its on-chain payment rail
 * before you can create a storage context. This script deposits 5 USDFC
 * (plenty for many demo uploads) using a permit signature — no separate
 * approve tx needed.
 *
 * Run once:
 *   npx tsx scripts/setup-synapse.ts
 */

import { Synapse, calibration } from '@filoz/synapse-sdk';
import { privateKeyToAccount } from 'viem/accounts';
import { webSocket } from 'viem';

const PK = process.env.STORAGE_PRIVATE_KEY ?? '0xdaf21fb2c258adcf4a4f6d28183ba7c6e0a5f1ad889588c49ac47c34be20b6e6';
const RPC = process.env.FILECOIN_RPC_URL ?? 'wss://wss.calibration.node.glif.io/apigw/lotus/rpc/v1';
const DEPOSIT_USDFC = 5n; // 5 USDFC

const account = privateKeyToAccount(PK as `0x${string}`);

console.log(`\nSynapse payment setup`);
console.log(`Wallet : ${account.address}`);
console.log(`Network: Filecoin Calibration testnet`);
console.log(`Deposit: ${DEPOSIT_USDFC} USDFC\n`);

const synapse = Synapse.create({
  chain: calibration,
  account,
  transport: webSocket(RPC),
});

// Check current balances
const walletBal = await synapse.payments.walletBalance();
const lockupBal = await synapse.payments.balance();
const decimals  = synapse.payments.decimals();

console.log(`Wallet USDFC balance : ${Number(walletBal) / 10 ** decimals} USDFC`);
console.log(`Lockup USDFC balance : ${Number(lockupBal) / 10 ** decimals} USDFC`);

if (lockupBal >= DEPOSIT_USDFC * BigInt(10 ** decimals)) {
  console.log(`\n✓ Already have sufficient lockup balance. No deposit needed.`);
  process.exit(0);
}

const amountWei = DEPOSIT_USDFC * BigInt(10 ** decimals);

if (walletBal < amountWei) {
  console.error(`\n✗ Insufficient wallet USDFC. Have ${Number(walletBal) / 10 ** decimals}, need ${DEPOSIT_USDFC}`);
  process.exit(1);
}

console.log(`\nDepositing ${DEPOSIT_USDFC} USDFC into Synapse payment contract...`);
console.log(`(This requires a tFIL transaction — submitting now)`);

try {
  const txHash = await synapse.payments.depositWithPermitAndApproveOperator({
    amount: amountWei,
    lockupAllowance: amountWei,
    rateAllowance: amountWei,
  });

  console.log(`\n✓ Transaction submitted: ${txHash}`);
  console.log(`  View on Filfox: https://calibration.filfox.info/en/tx/${txHash}`);
  console.log(`\nWaiting for confirmation...`);

  // Poll for receipt
  const client = synapse.client;
  let receipt = null;
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 5000));
    try {
      receipt = await client.getTransactionReceipt({ hash: txHash });
      if (receipt) break;
    } catch {
      // not yet
    }
    process.stdout.write('.');
  }

  if (receipt?.status === 'success') {
    const newBal = await synapse.payments.balance();
    console.log(`\n\n✓ Confirmed! Lockup balance: ${Number(newBal) / 10 ** decimals} USDFC`);
    console.log(`\nYou can now run: npm run dev  then  npm run demo`);
  } else {
    console.log(`\nTransaction submitted. Run 'npm run demo' once it confirms.`);
    console.log(`Check: https://calibration.filfox.info/en/tx/${txHash}`);
  }
} catch (err) {
  console.error(`\n✗ Deposit failed:`, err instanceof Error ? err.message : err);
  process.exit(1);
}
