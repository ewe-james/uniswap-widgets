import { Interface } from '@ethersproject/abi'
import { Contract } from '@ethersproject/contracts'
import { PERMIT2_ADDRESS } from '@uniswap/permit2-sdk'
import { Token } from '@uniswap/sdk-core'
import { useWeb3React } from '@web3-react/core'
import ERC20ABI from 'abis/erc20.json'
import PERMIT2_ABI from 'abis/permit2.json'
import { Erc20Interface } from 'abis/types/Erc20'
import { SupportedChainId } from 'constants/chains'
import { useEffect, useState } from 'react'

const ERC20Interface = new Interface(ERC20ABI) as Erc20Interface
const Permit2Interface = new Interface(PERMIT2_ABI)

export const useBscTokenAllowance = (token?: Token, owner?: string, spender?: string) => {
  const { chainId, provider } = useWeb3React()
  const [allowance, setAllowance] = useState(0)

  useEffect(() => {
    const getAllowance = async () => {
      if (chainId === SupportedChainId.BNB && provider && token && owner && spender) {
        try {
          const tokenContract = new Contract(token.address, ERC20Interface, provider)
          const allowance = await tokenContract?.allowance(owner, spender)
          setAllowance(allowance)
        } catch (error) {
          console.error('Error fetchin allowance', error)
        }
      }
    }

    getAllowance()
  }, [chainId, provider, token, owner, spender])

  return allowance
}

export const useBscPermit2Allowance = (token?: Token, owner?: string, spender?: string) => {
  const { chainId, provider } = useWeb3React()
  const [allowance, setAllowance] = useState({ amount: 0, expiration: 0, nonce: 0 })

  useEffect(() => {
    const getAllowance = async () => {
      if (chainId === SupportedChainId.BNB && provider && token && owner && spender) {
        try {
          const permit2Contract = new Contract(PERMIT2_ADDRESS, Permit2Interface, provider)
          const allowance = await permit2Contract?.allowance(owner, token.address, spender)
          allowance && setAllowance({ amount: allowance[0], expiration: allowance[1], nonce: allowance[2] })
        } catch (error) {
          console.error('Error fetchin allowance', error)
        }
      }
    }

    getAllowance()
  }, [chainId, provider, token, owner, spender])

  return allowance
}
