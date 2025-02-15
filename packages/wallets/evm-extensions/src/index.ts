import {
  Chain,
  ChainToHexChainId,
  type ConnectWalletParams,
  type EVMChain,
  type EthereumWindowProvider,
  SwapKitError,
  WalletOption,
  addEVMWalletNetwork,
  prepareNetworkSwitch,
  setRequestClientConfig,
} from "@swapkit/helpers";
import {
  type AVAXToolbox,
  type BrowserProvider,
  type Eip1193Provider,
  getToolboxByChain,
} from "@swapkit/toolbox-evm";

declare const window: {
  ethereum: EthereumWindowProvider;
  trustwallet: EthereumWindowProvider;
  coinbaseWalletExtension: EthereumWindowProvider;
  braveSolana: Todo;
} & Window;

export type EVMWalletOptions =
  | WalletOption.BRAVE
  | WalletOption.OKX_MOBILE
  | WalletOption.METAMASK
  | WalletOption.TRUSTWALLET_WEB
  | WalletOption.COINBASE_WEB
  | WalletOption.EIP6963;

const getWalletForType = (
  walletType:
    | WalletOption.BRAVE
    | WalletOption.OKX_MOBILE
    | WalletOption.METAMASK
    | WalletOption.TRUSTWALLET_WEB
    | WalletOption.COINBASE_WEB,
) => {
  switch (walletType) {
    case WalletOption.BRAVE:
    case WalletOption.METAMASK:
    case WalletOption.OKX_MOBILE:
      return window.ethereum;
    case WalletOption.COINBASE_WEB:
      return window.coinbaseWalletExtension;
    case WalletOption.TRUSTWALLET_WEB:
      return window.trustwallet;
  }
};

export const getWeb3WalletMethods = async ({
  ethereumWindowProvider,
  chain,
  covalentApiKey,
  ethplorerApiKey,
  provider,
}: {
  ethereumWindowProvider: Eip1193Provider | undefined;
  chain: Chain;
  covalentApiKey?: string;
  ethplorerApiKey?: string;
  provider: BrowserProvider;
}) => {
  if (!ethereumWindowProvider) throw new Error("Requested web3 wallet is not installed");

  if (
    (chain !== Chain.Ethereum && !covalentApiKey) ||
    (chain === Chain.Ethereum && !ethplorerApiKey)
  ) {
    throw new SwapKitError({
      errorKey: "wallet_missing_api_key",
      info: {
        missingKey: chain === Chain.Ethereum ? "ethplorerApiKey" : "covalentApiKey",
        chain,
      },
    });
  }

  const toolboxParams = {
    provider,
    signer: await provider.getSigner(),
    ethplorerApiKey: ethplorerApiKey as string,
    covalentApiKey: covalentApiKey as string,
  };

  const toolbox = getToolboxByChain(chain as EVMChain)(toolboxParams);

  try {
    chain !== Chain.Ethereum &&
      (await addEVMWalletNetwork(
        provider,
        (toolbox as ReturnType<typeof AVAXToolbox>).getNetworkParams(),
      ));
  } catch (_error) {
    throw new Error(`Failed to add/switch ${chain} network: ${chain}`);
  }

  return prepareNetworkSwitch<typeof toolbox>({
    toolbox: { ...toolbox },
    chainId: ChainToHexChainId[chain],
    provider,
  });
};

function connectEVMWallet({
  addChain,
  config: { covalentApiKey, ethplorerApiKey, thorswapApiKey },
}: ConnectWalletParams) {
  return async function connectEVMWallet(
    chains: EVMChain[],
    walletType: EVMWalletOptions = WalletOption.METAMASK,
    eip1193Provider?: Eip1193Provider,
  ) {
    setRequestClientConfig({ apiKey: thorswapApiKey });

    const promises = chains.map(async (chain) => {
      const { BrowserProvider, getProvider } = await import("@swapkit/toolbox-evm");

      if (walletType === WalletOption.EIP6963) {
        if (!eip1193Provider) throw new Error("Missing provider");
        const provider = new BrowserProvider(eip1193Provider, "any");
        await provider.send("eth_requestAccounts", []);
        const address = await (await provider.getSigner()).getAddress();

        const walletMethods = await getWeb3WalletMethods({
          chain,
          ethplorerApiKey,
          covalentApiKey,
          ethereumWindowProvider: eip1193Provider,
          provider,
        });

        const getBalance = async (potentialScamFilter = true) =>
          walletMethods.getBalance(address, potentialScamFilter, getProvider(chain));

        addChain({
          ...walletMethods,
          chain,
          address,
          getBalance,
          balance: [],
          walletType,
        });
        return;
      }

      const web3provider = new BrowserProvider(getWalletForType(walletType), "any");
      await web3provider.send("eth_requestAccounts", []);
      const address = await (await web3provider.getSigner()).getAddress();

      const walletMethods = await getWeb3WalletMethods({
        chain,
        ethplorerApiKey,
        covalentApiKey,
        ethereumWindowProvider: getWalletForType(walletType),
        provider: web3provider,
      });

      const getBalance = async (potentialScamFilter = true) =>
        walletMethods.getBalance(address, potentialScamFilter, getProvider(chain));

      addChain({
        ...walletMethods,
        chain,
        address,
        getBalance,
        balance: [],
        walletType,
      });
    });

    await Promise.all(promises);

    return true;
  };
}

export const evmWallet = { connectEVMWallet } as const;
