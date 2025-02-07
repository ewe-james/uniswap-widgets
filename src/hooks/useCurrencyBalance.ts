import { Interface } from '@ethersproject/abi'
import { BigNumber } from '@ethersproject/bignumber'
import { Contract } from '@ethersproject/contracts'
import { Currency, CurrencyAmount, Token } from '@uniswap/sdk-core'
import { useWeb3React } from '@web3-react/core'
import ERC20ABI from 'abis/erc20.json'
import MulticallABI from 'abis/multicall.json'
import { Erc20Interface } from 'abis/types/Erc20'
import { MULTICALL_ADDRESS } from 'constants/addresses'
import { SupportedChainId } from 'constants/chains'
import { nativeOnChain } from 'constants/tokens'
import { useMultipleContractSingleData, useSingleContractMultipleData } from 'hooks/multicall'
import { useInterfaceMulticall } from 'hooks/useContract'
import JSBI from 'jsbi'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isAddress } from 'utils'

/**
 * Returns a map of the given addresses to their eventually consistent ETH balances.
 */
export function useNativeCurrencyBalances(uncheckedAddresses?: (string | undefined)[]): {
  [address: string]: CurrencyAmount<Currency> | undefined
} {
  const { chainId, provider } = useWeb3React()
  const multicallContract = useInterfaceMulticall()
  const [bscBalances, setBscBalances] = useState<BigNumber[]>([])
  const counter = useRef(0)

  const validAddressInputs: [string][] = useMemo(
    () =>
      uncheckedAddresses
        ? uncheckedAddresses
            .map(isAddress)
            .filter((a): a is string => a !== false)
            .sort()
            .map((addr) => [addr])
        : [],
    [uncheckedAddresses]
  )

  const results = useSingleContractMultipleData(multicallContract, 'getEthBalance', validAddressInputs)

  const fetchBscBalances = useCallback(async () => {
    if (chainId === SupportedChainId.BNB && uncheckedAddresses && provider) {
      try {
        const multicallAddress = MULTICALL_ADDRESS[SupportedChainId.BNB]
        const multicallContract = new Contract(multicallAddress, MulticallInterface, provider)
        const callData = uncheckedAddresses.map((address) => ({
          target: multicallAddress,
          callData: MulticallInterface.encodeFunctionData('getEthBalance', [address]),
        }))
        const { returnData } = await multicallContract?.aggregate(callData)

        const toReturn = returnData?.map((result: any) => {
          return MulticallInterface.decodeFunctionResult('getEthBalance', result)
        })
        setBscBalances(toReturn)
      } catch (error) {
        console.error('Error fetchin balance', error)
      }
    }
  }, [uncheckedAddresses, provider, chainId])

  useEffect(() => {
    if (counter.current % 5 === 0) {
      fetchBscBalances()
    }
    counter.current++
  })

  return useMemo(
    () =>
      validAddressInputs.reduce<{ [address: string]: CurrencyAmount<Currency> }>((memo, [address], i) => {
        const value = results?.[i]?.result?.[0] || bscBalances[i]
        if (value && chainId)
          memo[address] = CurrencyAmount.fromRawAmount(nativeOnChain(chainId), JSBI.BigInt(value.toString()))
        return memo
      }, {}),
    [validAddressInputs, chainId, results, bscBalances]
  )
}

const ERC20Interface = new Interface(ERC20ABI) as Erc20Interface
const tokenBalancesGasRequirement = { gasRequired: 185_000 }
const MulticallInterface = new Interface(MulticallABI)

/**
 * Returns a map of token addresses to their eventually consistent token balances for a single account.
 */
export function useTokenBalancesWithLoadingIndicator(
  address?: string,
  tokens?: (Token | undefined)[]
): [{ [tokenAddress: string]: CurrencyAmount<Token> | undefined }, boolean] {
  const { provider } = useWeb3React()
  const validatedTokens: Token[] = useMemo(
    () => tokens?.filter((t?: Token): t is Token => isAddress(t?.address) !== false) ?? [],
    [tokens]
  )
  const validatedTokenAddresses = useMemo(() => validatedTokens.map((vt) => vt.address), [validatedTokens])
  const [bscBalances, setBscBalances] = useState([])
  const counter = useRef(0)

  const balances = useMultipleContractSingleData(
    validatedTokenAddresses,
    ERC20Interface,
    'balanceOf',
    useMemo(() => [address], [address]),
    tokenBalancesGasRequirement
  )

  const fetchBscBalances = useCallback(async () => {
    if (tokens && tokens[0]?.chainId === SupportedChainId.BNB && address && provider) {
      try {
        const multicallAddress = MULTICALL_ADDRESS[SupportedChainId.BNB]
        const multicallContract = new Contract(multicallAddress, MulticallInterface, provider)
        const data = validatedTokenAddresses.map((tokenAddress) => ({
          target: tokenAddress,
          callData: ERC20Interface.encodeFunctionData('balanceOf', [address]),
        }))

        const { returnData } = await multicallContract?.aggregate(data)
        const toReturn = returnData?.map((result: any) => {
          return ERC20Interface.decodeFunctionResult('balanceOf', result)
        })
        setBscBalances(toReturn)
      } catch (error) {
        console.error('Error fetching token balances', error)
      }
    }
  }, [tokens, address, validatedTokenAddresses, provider])

  useEffect(() => {
    if (counter.current % 10 === 0) {
      fetchBscBalances()
    }
    counter.current++
  })

  const anyLoading: boolean = useMemo(() => balances.some((callState) => callState.loading), [balances])

  return useMemo(
    () => [
      address && validatedTokens.length > 0
        ? validatedTokens.reduce<{ [tokenAddress: string]: CurrencyAmount<Token> | undefined }>((memo, token, i) => {
            const value = balances?.[i]?.result?.[0] || bscBalances[i]?.[0]
            const amount = value ? JSBI.BigInt(value.toString()) : undefined
            if (amount) {
              memo[token.address] = CurrencyAmount.fromRawAmount(token, amount)
            }
            return memo
          }, {})
        : {},
      anyLoading,
    ],
    [address, validatedTokens, anyLoading, balances, bscBalances]
  )
}

export function useTokenBalances(
  address?: string,
  tokens?: (Token | undefined)[]
): { [tokenAddress: string]: CurrencyAmount<Token> | undefined } {
  return useTokenBalancesWithLoadingIndicator(address, tokens)[0]
}

// get the balance for a single token/account combo
export function useTokenBalance(account?: string, token?: Token): CurrencyAmount<Token> | undefined {
  const tokenBalances = useTokenBalances(
    account,
    useMemo(() => [token], [token])
  )
  if (!token) return undefined
  return tokenBalances[token.address]
}

export function useCurrencyBalances(
  account?: string,
  currencies?: (Currency | undefined)[]
): (CurrencyAmount<Currency> | undefined)[] {
  const tokens = useMemo(
    () => currencies?.filter((currency): currency is Token => currency?.isToken ?? false) ?? [],
    [currencies]
  )

  const tokenBalances = useTokenBalances(account, tokens)
  const containsETH: boolean = useMemo(() => currencies?.some((currency) => currency?.isNative) ?? false, [currencies])
  const ethBalance = useNativeCurrencyBalances(useMemo(() => (containsETH ? [account] : []), [containsETH, account]))
  return useMemo(
    () =>
      currencies?.map((currency) => {
        if (!account || !currency) return undefined
        if (currency.isToken) return tokenBalances[currency.address]
        if (currency.isNative) return ethBalance[account]
        return undefined
      }) ?? [],
    [account, currencies, ethBalance, tokenBalances]
  )
}

export default function useCurrencyBalance(
  account?: string,
  currency?: Currency
): CurrencyAmount<Currency> | undefined {
  return useCurrencyBalances(
    account,
    useMemo(() => [currency], [currency])
  )[0]
}
