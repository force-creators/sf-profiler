import type { Monaco } from '@monaco-editor/react';

export const RAW_LOG_LANGUAGE_ID = 'apex-debug-log';
export const RAW_LOG_THEME_LIGHT_ID = 'sfdc-profiler-apex-log-theme-light';
export const RAW_LOG_THEME_DARK_ID = 'sfdc-profiler-apex-log-theme-dark';

let monacoConfigured = false;

export function ensureRawLogMonacoSetup(monaco: Monaco) {
  if (monacoConfigured) {
    return;
  }

  monaco.languages.register({ id: RAW_LOG_LANGUAGE_ID });
  monaco.languages.setMonarchTokensProvider(RAW_LOG_LANGUAGE_ID, {
    tokenizer: {
      root: [
        [/^\d+\.\d+\s+[A-Z_]+(?:,[A-Z]+)?(?:;[A-Z_]+(?:,[A-Z]+)?)*$/, 'log.banner'],
        [/\b(EXCEPTION_THROWN|FATAL_ERROR|ASSERT_FAIL|FATAL_EXCEPTION)\b/, 'event.error'],
        [
          /\b(SOQL_EXECUTE_BEGIN|SOQL_EXECUTE_END|SOQL_EXECUTE_EXPLAIN|DML_BEGIN|DML_END)\b/,
          'event.db',
        ],
        [
          /\b(VF_[A-Z_]+|FLOW_[A-Z_]+|WF_[A-Z_]+|VISUALFORCE_[A-Z_]+)\b/,
          'event.vf',
        ],
        [/\b(SYSTEM_MODE_ENTER|SYSTEM_MODE_EXIT)\b/, 'event.system'],
        [
          /\b(USER_INFO|EXECUTION_STARTED|EXECUTION_FINISHED|CODE_UNIT_STARTED|CODE_UNIT_FINISHED|METHOD_ENTRY|METHOD_EXIT)\b/,
          'event.core',
        ],
        [/\b(LIMIT_USAGE|CUMULATIVE_LIMIT_USAGE)\b/, 'event.limit'],
        [/\b(HEAP_ALLOCATE|STATEMENT_EXECUTE)\b/, 'event.noise'],
        [/^\s*(Number of|Maximum)\b/, 'field.summary'],
        [/^\d{2}:\d{2}:\d{2}\.\d+/, 'log.time'],
        [/\(\d+\)/, 'log.nano'],
        [/\|/, 'delimiter.pipe'],
        [/\[[^\]]+\]/, 'meta.bracket'],
        [/(Bytes|Rows|Op|Type|Aggregations|relativeCost|cardinality|sobjectCardinality):/, 'field.key'],
        [/\b(SELECT|FROM|WHERE|ORDER\s+BY|GROUP\s+BY|LIMIT|AND|OR|NOT|IN|LIKE|HAVING)\b/i, 'query.keyword'],
        [/\b[A-Za-z0-9]{15,18}\b/, 'identifier.sfid'],
        [/\b\d+(?:\.\d+)?\b/, 'number'],
      ],
    },
  });

  monaco.editor.defineTheme(RAW_LOG_THEME_LIGHT_ID, {
    base: 'vs',
    inherit: true,
    colors: {
      'editor.background': '#ffffff',
      'editor.foreground': '#172033',
      'editorLineNumber.foreground': '#617086',
      'editorLineNumber.activeForeground': '#154caa',
      'editor.selectionBackground': '#d9e8ff',
      'editor.inactiveSelectionBackground': '#edf3ff',
      'editor.lineHighlightBackground': '#f7f9fc',
      'editorCursor.foreground': '#154caa',
    },
    rules: [
      { token: 'log.banner', foreground: '5C6B80', fontStyle: 'bold' },
      { token: 'log.time', foreground: '0F376F' },
      { token: 'log.nano', foreground: '617086' },
      { token: 'delimiter.pipe', foreground: 'B8C0CC' },
      { token: 'event.error', foreground: 'B42318', fontStyle: 'bold' },
      { token: 'event.db', foreground: '0F3D2A', fontStyle: 'bold' },
      { token: 'event.vf', foreground: '43276F', fontStyle: 'bold' },
      { token: 'event.system', foreground: '154CAA', fontStyle: 'bold' },
      { token: 'event.core', foreground: '154CAA' },
      { token: 'event.limit', foreground: '5C2D0D', fontStyle: 'bold' },
      { token: 'event.noise', foreground: '8A97AB' },
      { token: 'meta.bracket', foreground: '617086' },
      { token: 'field.key', foreground: '154CAA' },
      { token: 'field.summary', foreground: '5C2D0D', fontStyle: 'bold' },
      { token: 'identifier.sfid', foreground: '0F376F' },
      { token: 'query.keyword', foreground: '154CAA', fontStyle: 'bold' },
      { token: 'number', foreground: '0F376F' },
    ],
  });

  monaco.editor.defineTheme(RAW_LOG_THEME_DARK_ID, {
    base: 'vs-dark',
    inherit: true,
    colors: {
      'editor.background': '#252526',
      'editor.foreground': '#d4d4d4',
      'editorLineNumber.foreground': '#9da9bc',
      'editorLineNumber.activeForeground': '#4da3ff',
      'editor.selectionBackground': '#2b3b52',
      'editor.inactiveSelectionBackground': '#1f2a3a',
      'editor.lineHighlightBackground': '#2d2d30',
      'editorCursor.foreground': '#4da3ff',
    },
    rules: [
      { token: 'log.banner', foreground: '9da9bc', fontStyle: 'bold' },
      { token: 'log.time', foreground: '9cdcfe' },
      { token: 'log.nano', foreground: '9da9bc' },
      { token: 'delimiter.pipe', foreground: '616b7a' },
      { token: 'event.error', foreground: 'f48771', fontStyle: 'bold' },
      { token: 'event.db', foreground: '73c991', fontStyle: 'bold' },
      { token: 'event.vf', foreground: 'c586c0', fontStyle: 'bold' },
      { token: 'event.system', foreground: '4da3ff', fontStyle: 'bold' },
      { token: 'event.core', foreground: '3794ff' },
      { token: 'event.limit', foreground: 'd7ba7d', fontStyle: 'bold' },
      { token: 'event.noise', foreground: '7e8799' },
      { token: 'meta.bracket', foreground: '9da9bc' },
      { token: 'field.key', foreground: '4da3ff' },
      { token: 'field.summary', foreground: 'd7ba7d', fontStyle: 'bold' },
      { token: 'identifier.sfid', foreground: '9cdcfe' },
      { token: 'query.keyword', foreground: '569cd6', fontStyle: 'bold' },
      { token: 'number', foreground: '9cdcfe' },
    ],
  });

  monacoConfigured = true;
}
