import {
  AssetValue,
  type EVMWallets,
  ProviderName,
  type QuoteResponseRoute,
  type SubstrateWallets,
  SwapKitError,
  type SwapKitPluginParams,
  type SwapParams,
  type UTXOWallets,
} from "@swapkit/helpers";

type SupportedChain = keyof (EVMWallets & SubstrateWallets & UTXOWallets);

export async function confirmSwap({
  buyAsset,
  sellAsset,
  recipient,
  brokerEndpoint,
}: {
  buyAsset: AssetValue;
  sellAsset: AssetValue;
  recipient: string;
  brokerEndpoint: string;
}) {
  try {
    const response = await fetch(brokerEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        buyAsset: buyAsset.toString(),
        sellAsset: sellAsset.toString(),
        destinationAddress: recipient,
      }),
    }).then((res) => res.json());

    return response as { channelId: string; depositAddress: string; chain: string };
  } catch (error) {
    throw new SwapKitError("chainflip_channel_error", error);
  }
}

function plugin({
  getWallet,
  config: { chainflipBrokerUrl },
}: SwapKitPluginParams<{ chainflipBrokerUrl: string }>) {
  async function swap(swapParams: SwapParams<"chainflip">) {
    if (
      !(
        "route" in swapParams &&
        (swapParams.route as QuoteResponseRoute)?.buyAsset &&
        chainflipBrokerUrl
      )
    ) {
      throw new SwapKitError("core_swap_invalid_params", { ...swapParams, chainflipBrokerUrl });
    }

    const {
      route: {
        buyAsset: buyString,
        sellAsset: sellString,
        sellAmount,
        destinationAddress: recipient,
      },
    } = swapParams;
    if (!(sellString && buyString)) {
      throw new SwapKitError("core_swap_asset_not_recognized");
    }

    const sellAsset = await AssetValue.from({ asyncTokenLookup: true, asset: sellString });
    const wallet = getWallet(sellAsset.chain as SupportedChain);

    if (!wallet) {
      throw new SwapKitError("core_wallet_connection_not_found");
    }

    const buyAsset = await AssetValue.from({ asyncTokenLookup: true, asset: buyString });
    const assetValue = sellAsset.set(sellAmount);

    const { depositAddress } = await confirmSwap({
      brokerEndpoint: chainflipBrokerUrl,
      buyAsset,
      recipient,
      sellAsset,
    });

    const tx = await wallet.transfer({
      assetValue,
      from: wallet.address,
      recipient: depositAddress,
    });

    return tx as string;
  }

  return {
    swap,
    supportedSwapkitProviders: [ProviderName.CHAINFLIP],
  };
}

export const ChainflipPlugin = { chainflip: { plugin } } as const;

/**
 * @deprecated Use import { ChainflipPlugin } from "@swapkit/plugin-chainflip" instead
 */
export const ChainflipProvider = ChainflipPlugin;
