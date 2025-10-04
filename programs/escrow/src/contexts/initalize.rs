use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{transfer_checked, Mint, Token, TokenAccount, TransferChecked},
};
use crate::states::*;

#[derive(Accounts)]
//Inside it, each field is an account or program that Anchor expects as part of this instruction
#[instruction(seed:u64,initalizar_amount:u64)]
pub struct Initialize<'info>{   //'info is a lifetime parameter used by Anchor to ensure accounts live as long as the instruction execution.
    #[account(mut)]  //this account will be modified
    pub initializer:Signer<'info>,
    pub mint_a:Account<'info,Mint>,
    pub mint_b:Account<'info,Mint>,
    #[account(
        mut, //will change (because tokens are transferred out).
        constraint = initializer_ata_a.amount >=initalizar_amount, //should have enough tokens to transfer
        associated_token::mint = mint_a, //mint of initializer_ata_a should be the same as mint_a
        associated_token::authority = initializer   //initializer_ata_a should be owned by initializer
    )]
    pub initializer_ata_a:Account<'info,TokenAccount>,  //Initializer’s Token Account (ATA)
     #[account(
        init_if_needed,
        payer = initializer,
        space = Escrow::INIT_SPACE,
        seeds = [
            b"state".as_ref(),  //b"state" is a byte string literal of type [u8; 5] .as_ref() converts [u8; 5] into &[u8].
            &seed.to_le_bytes(),  //seed.to_le_bytes() produces [u8; 8] Rust automatically coerces &[u8; 8] into &[u8]
        ],
        bump
     )]
     pub escrow:Account<'info,Escrow>,  //pda account of escorw it can not hold token directly because only tokenAccount can hold token
     //instead it holds the data of the escorw deal (who is initializer, what amount, which mint, expiration time, bump, etc.). think of the pda as state brain ofthe escorw
     #[account(
        init_if_needed,
        payer = initializer,
        associated_token::mint = mint_a,  //This tells Anchor which token this ATA (Associated Token Account) is for.(each ATA is for one specific mint and one authority)
        associated_token::authority = escrow,
    )]
    pub vault:Account<'info,TokenAccount>,  //initializer_ata_b is the ATA of initializer
    pub associated_token_program: Program<'info, AssociatedToken>,  //reference to the Associated Token Program job to create ATA
    pub token_program: Program<'info, Token>, //reference to the SPL Token Program which is the core program that handles token operations transfer  mint burn
     //this is ATA which is owned by ATA store actual token (tokens cannot be deposit init a pda directly)So we create an Associated Token Account (ATA) where the owner is the PDA.
     //This “vault” ATA is where the initializer’s tokens are transferred into during escrow.When the trade completes (or cancels), your program moves tokens from vault → other user’s ATA.
     pub system_program:Program<'info,System>,
}

impl<'info>Initialize<'info>{
    pub fn initalize_escrow(
        &mut self,
        seed:u64,
        bumps: &InitializeBumps,
        initalizer_amount:u64,
        taker_amount:u64
    )->Result<()>{
        self.escrow.set_inner(Escrow {  //set_inner is an Anchor helper method that overwrites the inner data of an account.
            seed,
            bump:bumps.escrow,
            initializer :self.initializer.key(),
            mint_a:self.mint_a.key(),
            mint_b:self.mint_b.key(),
            initalizer_amount,
            taker_amount,
        });
       Ok(())
    }
    pub fn deposit(
        &mut self,
        initalizer_amount:u64
    )->Result<()>{
        transfer_checked(  //Anchor wrapper around SPL Token Program’s TransferChecked instruction.
            //Unlike a normal transfer, it verifies the amount against the token’s decimals to prevent mistakes
           self.into_deposit_contenxt(),  //the context, which contains all accounts needed for transfer
           initalizer_amount,
           self.mint_a.decimals
        )
    }
    pub fn into_deposit_contenxt(&self)->CpiContext<'_, '_, '_, 'info, TransferChecked<'info>>{ //Returns a CPI Context (CpiContext) for the SPL Token Program’s TransferChecked instruction.
        let cpi_accounts = TransferChecked{  //in Anchor each CPI call has a corrosponding struct that describe required accounts
            from:self.initializer_ata_a.to_account_info(), //(to_account_info())is the raw representation of an account in Solana:
            mint:self.mint_a.to_account_info(),  //The mint account of the token being transferred
            to:self.vault.to_account_info(),
            authority:self.initializer.to_account_info(),
        };
       return  CpiContext::new(self.token_program.to_account_info(), cpi_accounts);
    }
     
}

