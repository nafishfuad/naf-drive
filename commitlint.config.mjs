export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      ['web', 'api', 'shared', 'providers', 'infra', 'ci', 'docs', 'deps', 'repo'],
    ],
  },
};
