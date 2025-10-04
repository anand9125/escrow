use anchor_lang::prelude::*;
#[account]
pub struct EscrowState{
    pub seed :u64,
    pub bump :u8,
    pub initializer :Pubkey,
    pub mint_a :Pubkey,
    pub mint_b :Pubkey,
    pub initializer_amount:u64,
    pub taker_amount:u64,
}

impl Space for EscrowState{
    const INIT_SPACE : usize = 8 + 8 + 1 + 32 + 32 + 32 + 8 + 8;
}