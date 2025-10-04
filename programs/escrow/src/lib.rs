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
        initalizer_amount:u64,
        taker_amount:u64
    ) -> Result<()>{
      ctx.accounts.initialize_escrow(
        seed,
        &ctx.bumps,
        initalizer_amount,
        taker_amount
      )?;
      ctx.accounts.deposit( initalizer_amount)
    }
    pub fn cancel(ctx:Context<Cancel>)->Result<()>{
        ctx.accounts.refund_and_close_vault()
    }
    pub fn exchange(ctx:Context<Exchange>)->Result<()>{
        ctx.accounts.deposit()?;
        ctx.accounts.withdraw_and_close_vault()
    }
 
}
