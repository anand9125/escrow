use anchor_lang::prelude::*;
mod contexts;
use contexts::*;
mod states;
declare_id!("8d4qfn4fqq9EdVTNVWoD27sQPHqHhvmqvAHUm9Z4tbtw");

#[program]
pub mod escrow {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        seed:u64,
        initalizar_amount:u64,
        taker_amount:u64
    ) -> Result<()>{
        ctx.accounts.initalize_escrow(
            seed,
            &ctx.bumps,
            initalizar_amount,
            taker_amount
        )?;
        ctx.accounts.deposit(initalizar_amount)
    }
}
