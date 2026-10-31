// Commit format: `type: <emoji> description` (see CONTRIBUTING.md). release-please reads the type.
export default {
  parserPreset: {
    parserOpts: {
      headerPattern: /^(\w+)(?:\((.*)\))?(!)?: \p{Extended_Pictographic}\S* (.+)$/u,
      headerCorrespondence: ['type', 'scope', 'breaking', 'subject'],
    },
  },
  rules: {
    'type-empty': [2, 'never'],
    'subject-empty': [2, 'never'],
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'hotfix', 'style', 'refactor', 'docs', 'revert', 'test', 'ci', 'build', 'chore'],
    ],
  },
}
