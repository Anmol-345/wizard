/** @type {import('next').NextConfig} */
const nextConfig = {
  // Stub out optional peer deps from @coinbase/cdp-sdk and walletconnect
  // (transitive deps via wagmi connectors — not used in generated dApps)
  webpack: (config, { isServer }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@x402/evm/upto/client": false,
      "@x402/evm/exact/client": false,
      "@x402/core/client": false,
      "@x402/svm/exact/client": false,
      "@x402/evm": false,
      "pino-pretty": false,
      "lokijs": false,
      "encoding": false,
      "@react-native-async-storage/async-storage": false,
    };
    return config;
  },
};

export default nextConfig;
