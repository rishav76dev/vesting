#![allow(clippy::result_large_err)]

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{ self, Mint, TokenAccount, TokenInterface, TransferChecked };
declare_id!("FqzkXZdwYjurnUKetJCAvaUw5WAqbwzU6gZEwydeEfqS");

#[program]
pub mod vesting {
 
    use super::*;

    pub fn create_vesting_account(ctx: Context<CreateVestingAccount>, company_name: String) -> Result<()>{
        *ctx.accounts.vesting_account = VestingAccount{// * -> derefering operater here dereference vesting_account to modify it  means we are dealing with actual data not just refrences /
            owner: ctx.accounts.signer.key(),
            mint: ctx.accounts.mint.key(),
            treasury_token_account: ctx.accounts.treasury_token_account.key(),
            company_name,
            treasury_bump: ctx.bumps.treasury_token_account,
            bump: ctx.bumps.vesting_account,
        };

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(company_name:String)] //means pulling value from instruciton
pub struct CreateVestingAccount<'info>{
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        init,
        space = 8+ VestingAccount::INIT_SPACE,
        payer = signer,
        seeds = [company_name.as_ref()],
        bump
    )]
    pub vesting_account: Account<'info, VestingAccount>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        token::mint = mint,
        token::authority = treasury_token_account,
        payer = signer,
        seeds = [b"vesting_treasury", company_name.as_bytes()],  // AS company_name is string so we cannot use as_ref so we are going to use as bytes
        //this is token account not ata  it is specified just for vesting contract we wanna create seed for pda which will be easy to derive
        bump,
    )]
    pub treasury_token_account: InterfaceAccount<'info, TokenAccount>,



    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,

}

#[account]
#[derive(InitSpace)]
pub struct VestingAccount{
    pub owner: Pubkey,
    pub mint: Pubkey,  //mint for spl token just storing state
    pub treasury_token_account :Pubkey  ,//it is also a token account which is actually storing token  2)it is teasury of employer's tokens theat are going to be allocated to emplooyes that are working and recieves vested token
    #[max_len(50)]
    pub company_name: String,
    pub treasury_bump: u8,
    pub bump: u8,
}
