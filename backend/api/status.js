import { getNetworkConfig } from '../utils/network.js';
export default function handler(req, res) {
  const cfg = getNetworkConfig(process.env);
  res.status(200).json({ ok: true, network: cfg.name, contract: cfg.contract });
}
