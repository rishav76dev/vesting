import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeAccount2Instruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  getMinimumBalanceForRentExemptMint,
  MINT_SIZE,
  TOKEN_2022_PROGRAM_ID
} from "@solana/spl-token";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction
} from "@solana/web3.js";
import { BN } from "bn.js";
import * as fs from "fs";
import { randomBytes } from "crypto";
import { Vesting } from "../target/types/vesting";

describe("Vesting Smart Contract Tests", () => {
  const companyName = "Company";
  let beneficiary: Keypair;
  let vestingAccountKey: PublicKey;
  let treasuryTokenAccount: PublicKey;
  let employeeAccount: PublicKey;
  let provider: anchor.AnchorProvider;
  let program: Program<Vesting>;
  let owner: Keypair; // Changed from employer to owner to match Rust code
  let mint: PublicKey;
  let mintKeypair: Keypair;
  let beneficiaryProvider: anchor.AnchorProvider;
  let program2: Program<Vesting>;

  beforeAll(async () => {
    // Configure the client to use the local cluster
    anchor.setProvider(anchor.AnchorProvider.env());
    provider = anchor.getProvider() as anchor.AnchorProvider;

    // Load the program
    const idl = JSON.parse(fs.readFileSync("../target/idl/vesting.json", "utf8"));
    program = new Program<Vesting>(idl, provider);

    beneficiary = Keypair.generate();
    owner = provider.wallet.payer; // This is the owner/signer, not employer
    mintKeypair = Keypair.generate();
    mint = mintKeypair.publicKey;

    // Airdrop SOL to beneficiary
    const signature = await provider.connection.requestAirdrop(
      beneficiary.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(signature);

    // Create beneficiary provider
    const beneficiaryWallet = new anchor.Wallet(beneficiary);
    beneficiaryProvider = new anchor.AnchorProvider(
      provider.connection,
      beneficiaryWallet,
      anchor.AnchorProvider.defaultOptions()
    );
    program2 = new Program<Vesting>(idl, beneficiaryProvider);

    // Derive PDAs
    [vestingAccountKey] = PublicKey.findProgramAddressSync(
      [Buffer.from(companyName)],
      program.programId
    );

    [treasuryTokenAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("vesting_treasury"), Buffer.from(companyName)],
      program.programId
    );

    [employeeAccount] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("employee_vesting"),
        beneficiary.publicKey.toBuffer(),
        vestingAccountKey.toBuffer(),
      ],
      program.programId
    );
  });

  it("should create mint", async () => {
    const rentExemptBalance = await getMinimumBalanceForRentExemptMint(provider.connection);

    const transaction = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: owner.publicKey,
        newAccountPubkey: mint,
        space: MINT_SIZE,
        lamports: rentExemptBalance,
        programId: TOKEN_2022_PROGRAM_ID,
      }),
      createInitializeMint2Instruction(
        mint,
        2, // decimals
        owner.publicKey, // mint authority
        owner.publicKey, // freeze authority
        TOKEN_2022_PROGRAM_ID
      )
    );

    const tx = await provider.sendAndConfirm(transaction, [mintKeypair]);
    console.log("Create Mint Transaction Signature:", tx);
  });

  it("should create a vesting account", async () => {
    const tx = await program.methods
      .createVestingAccount(companyName)
      .accounts({
        signer: owner.publicKey,
        mint,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const vestingAccountData = await program.account.vestingAccount.fetch(
      vestingAccountKey
    );
    console.log(
      "Vesting Account Data:",
      JSON.stringify(vestingAccountData, null, 2)
    );

    console.log("Create Vesting Account Transaction Signature:", tx);
  });

  it("should fund the treasury token account", async () => {
    const amount = 10_000 * 100; // 10,000 tokens with 2 decimals

    const transaction = new Transaction().add(
      createMintToInstruction(
        mint,
        treasuryTokenAccount,
        owner.publicKey,
        amount,
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );

    const tx = await provider.sendAndConfirm(transaction, []);
    console.log("Mint to Treasury Transaction Signature:", tx);
  });

  it("should create an employee vesting account", async () => {
    const currentTime = Math.floor(Date.now() / 1000);
    const startTime = currentTime;
    const endTime = currentTime + 3600; // 1 hour from now
    const totalAmount = 1000 * 100; // 1000 tokens with 2 decimals
    const cliffTime = currentTime; // No cliff for testing

    const tx2 = await program.methods
      .createEmployeeVesting(
        new BN(startTime),
        new BN(endTime),
        new BN(totalAmount),
        new BN(cliffTime)
      )
      .accounts({
        owner: owner.publicKey,
        beneficiary: beneficiary.publicKey,
        vestingAccount: vestingAccountKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ skipPreflight: true });

    console.log("Create Employee Account Transaction Signature:", tx2);
    console.log("Employee account", employeeAccount.toBase58());

    // Fetch and log employee account data
    const employeeAccountData = await program.account.employeeAccount.fetch(employeeAccount);
    console.log("Employee Account Data:", JSON.stringify(employeeAccountData, null, 2));
  });

  it("should claim tokens", async () => {
    // Wait for some time to pass (simulate vesting period)
    await new Promise((resolve) => setTimeout(resolve, 2000));

    console.log("Employee account", employeeAccount.toBase58());
    console.log("Beneficiary", beneficiary.publicKey.toBase58());

    // Get the employee's associated token account
    const employeeTokenAccount = getAssociatedTokenAddressSync(
      mint,
      beneficiary.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    const tx3 = await program2.methods
      .claimToken(companyName) // Note: method name is claimToken, not claimTokens
      .accounts({
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    console.log("Claim Token transaction signature", tx3);

    // Check the employee's token balance
    const employeeTokenAccountInfo = await provider.connection.getTokenAccountBalance(employeeTokenAccount);
    console.log("Employee token balance:", employeeTokenAccountInfo.value.amount);

    // Check updated employee account data
    const updatedEmployeeAccount = await program.account.employeeAccount.fetch(employeeAccount);
    console.log("Updated Employee Account Data:", JSON.stringify(updatedEmployeeAccount, null, 2));
  });
});
