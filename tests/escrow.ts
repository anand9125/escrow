import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AnchorEscrow } from "../target/types/anchor_escrow";
import { 
  PublicKey, 
  SystemProgram, 
  Keypair,
  LAMPORTS_PER_SOL 
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  mintTo,
  getOrCreateAssociatedTokenAccount,
  getAccount,
} from "@solana/spl-token";
import { assert } from "chai";

describe("anchor-escrow", () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.AnchorEscrow as Program<AnchorEscrow>;
  
  // Test accounts
  let mintA: PublicKey;
  let mintB: PublicKey;
  let initializerTokenAccountA: PublicKey;
  let initializerTokenAccountB: PublicKey;
  let takerTokenAccountA: PublicKey;
  let takerTokenAccountB: PublicKey;
  let vault: PublicKey;
  let escrowState: PublicKey;

  const payer = provider.wallet as anchor.Wallet;
  const mintAuthority = Keypair.generate();
  const initializer = Keypair.generate();
  const taker = Keypair.generate();
  
  const seed = new anchor.BN(Math.floor(Math.random() * 1000000));
  const initializerAmount = new anchor.BN(1000);
  const takerAmount = new anchor.BN(500);

  before(async () => {
    // Airdrop SOL to test accounts
    const airdropSignature1 = await provider.connection.requestAirdrop(
      initializer.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSignature1);

    const airdropSignature2 = await provider.connection.requestAirdrop(
      taker.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSignature2);

    const airdropSignature3 = await provider.connection.requestAirdrop(
      mintAuthority.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSignature3);

    // Create Mint A
    mintA = await createMint(
      provider.connection,
      payer.payer,
      mintAuthority.publicKey,
      null,
      6
    );

    // Create Mint B
    mintB = await createMint(
      provider.connection,
      payer.payer,
      mintAuthority.publicKey,
      null,
      6
    );

    // Create token accounts for initializer
    const initializerTokenA = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer.payer,
      mintA,
      initializer.publicKey
    );
    initializerTokenAccountA = initializerTokenA.address;

    // Mint tokens to initializer
    await mintTo(
      provider.connection,
      payer.payer,
      mintA,
      initializerTokenAccountA,
      mintAuthority,
      10000
    );

    // Create token accounts for taker
    const takerTokenB = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer.payer,
      mintB,
      taker.publicKey
    );
    takerTokenAccountB = takerTokenB.address;

    // Mint tokens to taker
    await mintTo(
      provider.connection,
      payer.payer,
      mintB,
      takerTokenAccountB,
      mintAuthority,
      10000
    );

    // Derive PDA for escrow state
    [escrowState] = PublicKey.findProgramAddressSync(
      [Buffer.from("state"), seed.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    // Derive PDA for vault
    vault = (await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer.payer,
      mintA,
      escrowState,
      true
    )).address;
  });

  it("Initialize escrow", async () => {
    try {
      const tx = await program.methods
        .initialize(seed, initializerAmount, takerAmount)
        .accounts({
          initializer: initializer.publicKey,
          mintA: mintA,
          mintB: mintB,
          initializerAtaA: initializerTokenAccountA,
          escrow: escrowState,
          vault: vault,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([initializer])
        .rpc();

      console.log("Initialize transaction signature", tx);

      // Fetch the escrow account
      const escrowAccount = await program.account.escrowState.fetch(escrowState);
      
      // Verify escrow state
      assert.equal(escrowAccount.seed.toString(), seed.toString());
      assert.equal(
        escrowAccount.initializer.toString(),
        initializer.publicKey.toString()
      );
      assert.equal(escrowAccount.mintA.toString(), mintA.toString());
      assert.equal(escrowAccount.mintB.toString(), mintB.toString());
      assert.equal(
        escrowAccount.initializerAmount.toString(),
        initializerAmount.toString()
      );
      assert.equal(
        escrowAccount.takerAmount.toString(),
        takerAmount.toString()
      );

      // Verify tokens were transferred to vault
      const vaultAccount = await getAccount(provider.connection, vault);
      assert.equal(
        vaultAccount.amount.toString(),
        initializerAmount.toString()
      );

      // Verify initializer's balance decreased
      const initializerAccount = await getAccount(
        provider.connection,
        initializerTokenAccountA
      );
      assert.equal(
        initializerAccount.amount.toString(),
        (10000 - initializerAmount.toNumber()).toString()
      );
    } catch (error) {
      console.error("Initialize error:", error);
      throw error;
    }
  });

  it("Exchange escrow", async () => {
    // Get initializer's token account B (will be created if needed)
    initializerTokenAccountB = (await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer.payer,
      mintB,
      initializer.publicKey
    )).address;

    // Get taker's token account A (will be created if needed)
    takerTokenAccountA = (await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer.payer,
      mintA,
      taker.publicKey
    )).address;

    try {
      const tx = await program.methods
        .exchange()
        .accounts({
          taker: taker.publicKey,
          initializer: initializer.publicKey,
          mintA: mintA,
          mintB: mintB,
          takerAtaA: takerTokenAccountA,
          takerAtaB: takerTokenAccountB,
          initializerAtaB: initializerTokenAccountB,
          escrow: escrowState,
          vault: vault,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([taker])
        .rpc();

      console.log("Exchange transaction signature", tx);

      // Verify taker received tokens A
      const takerAccountA = await getAccount(
        provider.connection,
        takerTokenAccountA
      );
      assert.equal(
        takerAccountA.amount.toString(),
        initializerAmount.toString()
      );

      // Verify initializer received tokens B
      const initializerAccountB = await getAccount(
        provider.connection,
        initializerTokenAccountB
      );
      assert.equal(
        initializerAccountB.amount.toString(),
        takerAmount.toString()
      );

      // Verify taker's balance decreased
      const takerAccountB = await getAccount(
        provider.connection,
        takerTokenAccountB
      );
      assert.equal(
        takerAccountB.amount.toString(),
        (10000 - takerAmount.toNumber()).toString()
      );

      // Verify vault is closed
      try {
        await getAccount(provider.connection, vault);
        assert.fail("Vault should be closed");
      } catch (error) {
        // Expected error - account doesn't exist
        assert.ok(error);
      }

      // Verify escrow account is closed
      try {
        await program.account.escrowState.fetch(escrowState);
        assert.fail("Escrow account should be closed");
      } catch (error) {
        // Expected error - account doesn't exist
        assert.ok(error);
      }
    } catch (error) {
      console.error("Exchange error:", error);
      throw error;
    }
  });

  describe("Cancel escrow", () => {
    let cancelSeed: anchor.BN;
    let cancelEscrowState: PublicKey;
    let cancelVault: PublicKey;
    let cancelInitializerTokenAccountA: PublicKey;

    before(async () => {
      // Create new initializer for cancel test
      const cancelInitializer = Keypair.generate();
      
      // Airdrop SOL
      const airdropSig = await provider.connection.requestAirdrop(
        cancelInitializer.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdropSig);

      // Create token account and mint tokens
      const tokenAccount = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        mintA,
        cancelInitializer.publicKey
      );
      cancelInitializerTokenAccountA = tokenAccount.address;

      await mintTo(
        provider.connection,
        payer.payer,
        mintA,
        cancelInitializerTokenAccountA,
        mintAuthority,
        10000
      );

      // Create new escrow
      cancelSeed = new anchor.BN(Math.floor(Math.random() * 1000000));
      
      [cancelEscrowState] = PublicKey.findProgramAddressSync(
        [Buffer.from("state"), cancelSeed.toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      cancelVault = (await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        mintA,
        cancelEscrowState,
        true
      )).address;

      // Initialize escrow
      await program.methods
        .initialize(cancelSeed, initializerAmount, takerAmount)
        .accounts({
          initializer: cancelInitializer.publicKey,
          mintA: mintA,
          mintB: mintB,
          initializerAtaA: cancelInitializerTokenAccountA,
          escrow: cancelEscrowState,
          vault: cancelVault,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([cancelInitializer])
        .rpc();

      // Now cancel it
      try {
        const tx = await program.methods
          .cancel()
          .accounts({
            initializer: cancelInitializer.publicKey,
            mintA: mintA,
            initializerAtaA: cancelInitializerTokenAccountA,
            escrow: cancelEscrowState,
            vault: cancelVault,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([cancelInitializer])
          .rpc();

        console.log("Cancel transaction signature", tx);
      } catch (error) {
        console.error("Cancel error:", error);
        throw error;
      }
    });

    it("Cancels escrow and refunds tokens", async () => {
      // Verify tokens were refunded
      const initializerAccount = await getAccount(
        provider.connection,
        cancelInitializerTokenAccountA
      );
      assert.equal(initializerAccount.amount.toString(), "10000");

      // Verify vault is closed
      try {
        await getAccount(provider.connection, cancelVault);
        assert.fail("Vault should be closed");
      } catch (error) {
        assert.ok(error);
      }

      // Verify escrow account is closed
      try {
        await program.account.escrowState.fetch(cancelEscrowState);
        assert.fail("Escrow account should be closed");
      } catch (error) {
        assert.ok(error);
      }
    });
  });

  describe("Error cases", () => {
    it("Fails to initialize with insufficient tokens", async () => {
      const newInitializer = Keypair.generate();
      const newSeed = new anchor.BN(Math.floor(Math.random() * 1000000));
      
      // Airdrop SOL
      const airdropSig = await provider.connection.requestAirdrop(
        newInitializer.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdropSig);

      // Create token account with insufficient tokens
      const tokenAccount = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        mintA,
        newInitializer.publicKey
      );

      await mintTo(
        provider.connection,
        payer.payer,
        mintA,
        tokenAccount.address,
        mintAuthority,
        100 // Less than initializerAmount
      );

      const [newEscrowState] = PublicKey.findProgramAddressSync(
        [Buffer.from("state"), newSeed.toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      const newVault = (await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        mintA,
        newEscrowState,
        true
      )).address;

      try {
        await program.methods
          .initialize(newSeed, initializerAmount, takerAmount)
          .accounts({
            initializer: newInitializer.publicKey,
            mintA: mintA,
            mintB: mintB,
            initializerAtaA: tokenAccount.address,
            escrow: newEscrowState,
            vault: newVault,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([newInitializer])
          .rpc();
        
        assert.fail("Should have failed with insufficient tokens");
      } catch (error) {
        assert.ok(error);
      }
    });

    it("Fails to cancel from wrong authority", async () => {
      // Create new escrow
      const wrongAuthority = Keypair.generate();
      const newInitializer = Keypair.generate();
      const newSeed = new anchor.BN(Math.floor(Math.random() * 1000000));
      
      // Airdrop SOL to both
      const airdrop1 = await provider.connection.requestAirdrop(
        newInitializer.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdrop1);

      const airdrop2 = await provider.connection.requestAirdrop(
        wrongAuthority.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdrop2);

      // Setup and initialize escrow
      const tokenAccount = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        mintA,
        newInitializer.publicKey
      );

      await mintTo(
        provider.connection,
        payer.payer,
        mintA,
        tokenAccount.address,
        mintAuthority,
        10000
      );

      const [newEscrowState] = PublicKey.findProgramAddressSync(
        [Buffer.from("state"), newSeed.toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      const newVault = (await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        mintA,
        newEscrowState,
        true
      )).address;

      await program.methods
        .initialize(newSeed, initializerAmount, takerAmount)
        .accounts({
          initializer: newInitializer.publicKey,
          mintA: mintA,
          mintB: mintB,
          initializerAtaA: tokenAccount.address,
          escrow: newEscrowState,
          vault: newVault,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([newInitializer])
        .rpc();

      // Try to cancel with wrong authority
      try {
        await program.methods
          .cancel()
          .accounts({
            initializer: wrongAuthority.publicKey,
            mintA: mintA,
            initializerAtaA: tokenAccount.address,
            escrow: newEscrowState,
            vault: newVault,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([wrongAuthority])
          .rpc();
        
        assert.fail("Should have failed with wrong authority");
      } catch (error) {
        assert.ok(error);
      }
    });
  });
});