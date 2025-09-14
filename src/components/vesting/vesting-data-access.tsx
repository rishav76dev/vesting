'use client'

import { getVestingProgram, getVestingProgramId } from '@project/anchor'
import { useConnection } from '@solana/wallet-adapter-react'
import { Cluster, Keypair, PublicKey } from '@solana/web3.js'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useCluster } from '../cluster/cluster-data-access'
import { useAnchorProvider } from '../solana/solana-provider'
import { useTransactionToast } from '../use-transaction-toast'
import { toast } from 'sonner'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import BN from 'bn.js'

interface CreateVestingArgs {
  companyName: string;
  mint: string;
}

interface CreateEmployeeArgs {
  startTime: number;
  endTime: number;
  totalAmount: number;
  cliffTime: number;
  beneficiary: string,
}


export function useVestingProgram() {
  const { connection } = useConnection()
  const { cluster } = useCluster()
  const transactionToast = useTransactionToast()
  const provider = useAnchorProvider()
  const programId = useMemo(() => getVestingProgramId(cluster.network as Cluster), [cluster])
  const program = useMemo(() => getVestingProgram(provider, programId), [provider, programId])


  const accounts = useQuery({
    queryKey: ['vesting', 'all', { cluster }],
    queryFn: () => program.account.vestingAccount.all(),
  })

  const getProgramAccount = useQuery({
    queryKey: ['get-program-account', { cluster }],
    queryFn: () => connection.getParsedAccountInfo(programId),
  })

  const createVestingAccount = useMutation<string, Error, CreateVestingArgs>({
  mutationKey: ["vestingAccount", "create", { cluster }],
  mutationFn: ({ companyName, mint }) => {
    console.log('Creating Vesting Account');
    console.log('Cluster:', cluster.network);
    console.log('Program ID:', program.programId.toBase58());

    return program.methods
      .createVestingAccount(companyName)
      .accounts({ mint: new PublicKey(mint), tokenProgram: TOKEN_PROGRAM_ID })
      .rpc();
  },
  onSuccess: (signature) => {
    transactionToast(signature);
    return accounts.refetch();
  },
  onError: () => toast.error("Failed to initialize account"),
});



  return {
    program,
    programId,
    accounts,
    getProgramAccount,
    createVestingAccount
  }
}

export function useVestingProgramAccount({ account }: { account: PublicKey }) {
  const { cluster } = useCluster()
  const transactionToast = useTransactionToast()
  const { program, accounts } = useVestingProgram()

  const accountQuery = useQuery({
    queryKey: ['vesting', 'fetch', { cluster, account }],
    queryFn: () => program.account.vestingAccount.fetch(account),
  })

 const createEmployeeVesting = useMutation<string, Error, CreateEmployeeArgs>({
  mutationKey: ["vesting", "create", { cluster, account }],
  mutationFn: ({ startTime, endTime, totalAmount, cliffTime, beneficiary }) =>
    program.methods
      .createEmployeeVesting(
        new BN(startTime),
        new BN(endTime),
        new BN(totalAmount),
        new BN(cliffTime)
    )
      .accounts({
      beneficiary: new PublicKey(beneficiary),
vestingAccount: account
      })
      .rpc(),
  onSuccess: (tx) => {
    transactionToast(tx);
    return accounts.refetch();
  },
});



  return {
    accountQuery,
   createEmployeeVesting,
  }
}
