import type { EnvOptions } from 'tnp/src';

const env: Partial<EnvOptions> = {
  website: {
    domain: 'sudo.example.domain.com',
    title: 'Sudo',
    useDomain: true,
  },
  loading: {
    preAngularBootstrap: {
      background: '#fdebed',
      loader: { name: 'lds-default' },
    },
  },
};
export default env;
