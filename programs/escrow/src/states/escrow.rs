use anchor_lang::prelude::*;

#[account]
pub struct Escrow {
    pub seed:u64,
    pub bump:u8,  //Helps later when PDA needs to sign transactions and Allows anyone reading the account to reconstruct the PDA info
    pub initalizer:Pubkey,
    pub mint_a:Pubkey,
    pub mint_b:Pubkey,
    pub initalizer_amount:u64,
    pub taker_amount:u64,
}

impl Space for Escrow{
    const INIT_SPACE: usize =  8 + 8 + 1 + 32 + 32 + 32 + 8 + 8;
}