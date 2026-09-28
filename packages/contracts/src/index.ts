export { matoCreditLineAbi } from "./abi/MatoCreditLine";
export { mockEarnAusdAbi } from "./abi/MockEarnAUSD";
export { testAusdAbi } from "./abi/TestAUSD";
export { monadTestnet } from "./addresses";
export { gasLimits } from "./gas";

/** Matches `DepositMethod` in CreditTypes.sol. Pass to `depositFor`. */
export const DepositMethod = { Bank: 0, Card: 1 } as const;

/** AUSD and TestAUSD both use 6 decimals. */
export const AUSD_DECIMALS = 6;
