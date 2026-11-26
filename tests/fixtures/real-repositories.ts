export const snapshots = {
  'JetBrains/MPS': {
    branch: 'master',
    commit: '1cbf7f783dbc5c74c8e5231d31f61b02829143de',
    skills: {
      '.agents/skills/mps-aspect-generator/SKILL.md': mpsGenerator(),
      '.claude/skills/mps-aspect-generator/SKILL.md': mpsGenerator(),
    },
    otherFiles: [
      '.agents/skills/mps-aspect-generator/references/algorithm.md',
      '.claude/skills/mps-aspect-generator/references/algorithm.md',
      'plugins/mcp-tools/resources/jetbrains/mps/agents/mcp/skills/mps-aspect-generator/SKILL.md',
    ],
  },
  'JetBrains/android': {
    branch: 'master',
    commit: '4d9ec3e52b338aa1c962c1ff0421cc62db5c73af',
    skills: {
      'agent/skills/writing-lint-checks/SKILL.md': [
        '---',
        'name: writing-lint-checks',
        'description: Helps to write a new lint check under `/tools/base/lint/libs/lint-checks`.',
        '---',
        '',
        '## Writing a new lint check',
        '',
      ].join('\n'),
    },
    otherFiles: [
      'agent/skills/writing-lint-checks/final-steps.md',
      'agent/skills/writing-lint-checks/more-examples.md',
    ],
  },
  'JetBrains/koog': {
    branch: 'develop',
    commit: '709079e4a34d6c9234583352550e6a2b88a0bb85',
    skills: {
      '.claude/skills/split-jvm-nonjvm/SKILL.md': [
        '---',
        'name: split-jvm-nonjvm',
        'description: |',
        '    Splits a class or several classes in the common source set commonMain into JVM and non-JVM parts into jvmCommonMain and nonJvmCommonMain.',
        '    This is used to provide some JVM-specific functionality for a class on JVM targets (e.g. Kotlin/JVM or Java backend or Android).',
        '---',
        '',
      ].join('\n'),
    },
    otherFiles: [
      'integration-tests/src/jvmTest/resources/skills/arithmetic-evaluator/SKILL.md',
      'integration-tests/src/jvmTest/resources/skills/weather-retrieval/SKILL.md',
    ],
  },
};

function mpsGenerator(): string {
  return [
    '---',
    'name: mps-aspect-generator',
    'description: Use when defining or modifying MPS generators — author a generator module, add or edit root/reduction/weaving/pattern mapping rules, attach template macros ($COPY_SRC, $LOOP, $IF, $PROPERTY, $REF, $SWITCH, $MAP_SRC, $WEAVE, $INSERT, $LABEL, $TRACE, $VAR), wire mapping labels, build template switches, write pre/post mapping scripts, navigate `genContext`, formalize the expected output as a `GeneratorTest`, inspect transient step models and trace nodes forward or back to see what a generator does, or debug "rule didn\'t fire", missing references, empty output, infinite reduction loops, and generated-Java compile failures.',
    'type: reference',
    '---',
    '',
    '# MPS Generator Aspect',
    '',
  ].join('\n');
}