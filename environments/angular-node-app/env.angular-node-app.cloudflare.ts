import type { EnvOptions } from 'tnp/src';
import baseEnv from './env.angular-node-app.__';

const env: Partial<EnvOptions> = {
  ...baseEnv,
  build: {
    ...baseEnv.build,
    pwa: {
      disableServiceWorker: true,
    },
  },
  website: {
    ...baseEnv.website,
    useDomain: false,
  },
};
export default env;
