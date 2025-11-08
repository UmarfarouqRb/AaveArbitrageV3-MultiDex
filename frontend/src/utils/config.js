import { networks } from './networks';

const networkName = process.env.NODE_ENV === 'production' ? 'mainnet' : 'sepolia';

export const config = networks[networkName];
