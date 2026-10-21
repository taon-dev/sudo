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
  config: {
    superUsers: () =>
      `$$$TAON_ENCRYPTED_START$$$v1:600000:XllB7CTa16PS43e7YPk6pg==:iUf438sKj0vUa2Ko:rfeNQUzZTnO21E/tW+2sP0p1FJKgv8ntEEzhO1dbEuuTHw==$$$TAON_ENCRYPTED_END$$$`,
    googleSecret: () =>
      `$$$TAON_ENCRYPTED_START$$$v1:600000:lR2UvhpncUctehVe+9DXQw==:AHzXpUL09Z+lyTG0:DpJs+Rizz2ICGCyx1QJuL019OiMW8GHCLV4n4tkipmP/cpFLAlxEPVXmGOZMbWgAIqeS$$$TAON_ENCRYPTED_END$$$`,
    googleClientId:
      '289576612173-2mh31b67pmq2qdes5jedno9tr1m542es.apps.googleusercontent.com',
    ACCESS_TOKEN_SECRET: () =>
      `$$$TAON_ENCRYPTED_START$$$v1:600000:5a31R2W+h57UoaXoPU460Q==:zDZxZ7NO8ib9oWxC:MiRzfSOIx738QHDE+fEbnlA3ynxKdHgf9rWngYi8Hyl8Z790W8hFVNNDo8ZjfH2oFYGfRdkxyKfzVPRgVGqmjDluXReKSOKB1GgFxWjsVsVFmDUbK/TZtL8XgpAilg==$$$TAON_ENCRYPTED_END$$$`,
    REFRESH_TOKEN_SECRET: () =>
      `$$$TAON_ENCRYPTED_START$$$v1:600000:m+stQNALO4sxeArssRtttg==:z/qYJR/szXd0v2Sp:mQ3SpcQrJ05nw3aGjtGyz9gRcRlZLoDQJEbl5wa6NauKWwOU7iBqaF0VIT/twFUJpKk8wHwcHpsvyPmQ8KfW1u91xrELvhHy+iLT2ygzQ4U4LJEYWUJMTAW+sQxbUf0=$$$TAON_ENCRYPTED_END$$$`,
  },
};
export default env;
