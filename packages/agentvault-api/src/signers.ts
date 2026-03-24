import { randomBytes } from "node:crypto";
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type {
  AgentCard,
  Payment,
  PaymentRequirements,
  PaymentSigner,
  RegisterAgentRequest,
} from "./types.js";

export interface RegistrationSignatureResult {
  address: string;
  message: string;
  signature: Hex;
}

export interface ViemPaymentSignerOptions {
  tokenName?: string;
  tokenVersion?: string;
  validForSeconds?: number;
  validAfter?: bigint;
}

/** Build the canonical registration message expected by AgentVault. */
export function createRegistrationMessage(address: string): string {
  return `AgentVault registration: ${address.toLowerCase()}`;
}

/**
 * Sign the registration message with a private key (EIP-191 personal_sign).
 * Useful for tests and manual register-agent flows.
 */
export async function signRegistrationMessage(
  privateKey: `0x${string}`,
): Promise<RegistrationSignatureResult> {
  const account = privateKeyToAccount(privateKey);
  const message = createRegistrationMessage(account.address);
  const signature = await account.signMessage({ message });

  return {
    address: account.address,
    message,
    signature,
  };
}

/** Create a full register payload with a valid signature for tests/scripts. */
export async function createSignedRegisterAgentRequest(
  privateKey: `0x${string}`,
  agentCard: AgentCard,
): Promise<RegisterAgentRequest> {
  const { address, signature } = await signRegistrationMessage(privateKey);
  return {
    address,
    agentCard,
    signature,
  };
}

/** Convert a payment object to the exact x-payment header string. */
export function toPaymentHeader(payment: Payment): string {
  return JSON.stringify(payment);
}

/**
 * Sign an x402 payment using EIP-3009 TransferWithAuthorization via viem.
 * Defaults align with AgentVault/ClawVault server expectations.
 */
export async function signX402Payment(
  requirements: PaymentRequirements,
  privateKey: `0x${string}`,
  options: ViemPaymentSignerOptions = {},
): Promise<Payment> {
  const account = privateKeyToAccount(privateKey);
  const nonce = (`0x${randomBytes(32).toString("hex")}` as Hex);
  const validAfter = options.validAfter ?? 0n;
  const validForSeconds = options.validForSeconds ?? 300;
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + validForSeconds);

  const signature = await account.signTypedData({
    domain: {
      name: options.tokenName ?? "USD FileCoin",
      version: options.tokenVersion ?? "1",
      chainId: requirements.chainId,
      verifyingContract: requirements.tokenAddress as `0x${string}`,
    },
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization",
    message: {
      from: account.address,
      to: requirements.payTo as `0x${string}`,
      value: BigInt(requirements.maxAmountRequired),
      validAfter,
      validBefore,
      nonce,
    },
  });

  return {
    from: account.address,
    to: requirements.payTo,
    value: requirements.maxAmountRequired,
    validAfter: Number(validAfter),
    validBefore: Number(validBefore),
    nonce,
    signature,
    token: requirements.tokenAddress,
  };
}

/** Drop-in payment signer for AgentVaultClient config. */
export class ViemX402PaymentSigner implements PaymentSigner {
  private readonly privateKey: `0x${string}`;
  private readonly options: ViemPaymentSignerOptions;

  constructor(
    privateKey: `0x${string}`,
    options: ViemPaymentSignerOptions = {},
  ) {
    this.privateKey = privateKey;
    this.options = options;
  }

  async signPayment(requirements: PaymentRequirements): Promise<Payment> {
    return signX402Payment(requirements, this.privateKey, this.options);
  }
}
