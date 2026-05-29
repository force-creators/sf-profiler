import { useCallback, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import type { AppTheme } from '../../types';
import {
  ensureRawLogMonacoSetup,
  RAW_LOG_LANGUAGE_ID,
  RAW_LOG_THEME_DARK_ID,
  RAW_LOG_THEME_LIGHT_ID,
} from './rawLogMonaco';

type RawLogJumpRequest = {
  lineNumber: number;
  nonce: number;
};

const PULSE_DURATION_MS = 700;
const FADE_DURATION_MS = 2200;

export function RawLogView({
  jumpRequest,
  rawText,
  theme,
}: {
  jumpRequest?: RawLogJumpRequest;
  rawText: string;
  theme: AppTheme;
}) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const lineDecorationIdsRef = useRef<string[]>([]);
  const pulseTimeoutRef = useRef<number | undefined>(undefined);
  const clearTimeoutRef = useRef<number | undefined>(undefined);

  const clearLineHighlightTimers = useCallback(() => {
    if (pulseTimeoutRef.current !== undefined) {
      window.clearTimeout(pulseTimeoutRef.current);
      pulseTimeoutRef.current = undefined;
    }

    if (clearTimeoutRef.current !== undefined) {
      window.clearTimeout(clearTimeoutRef.current);
      clearTimeoutRef.current = undefined;
    }
  }, []);

  const clearLineHighlight = useCallback(() => {
    const instance = editorRef.current;
    clearLineHighlightTimers();

    if (!instance) {
      lineDecorationIdsRef.current = [];
      return;
    }

    lineDecorationIdsRef.current = instance.deltaDecorations(
      lineDecorationIdsRef.current,
      []
    );
  }, [clearLineHighlightTimers]);

  const applyLineHighlight = useCallback(
    (lineNumber: number) => {
      const instance = editorRef.current;

      if (!instance) {
        return;
      }

      clearLineHighlightTimers();

      lineDecorationIdsRef.current = instance.deltaDecorations(
        lineDecorationIdsRef.current,
        [
          {
            range: {
              startLineNumber: lineNumber,
              startColumn: 1,
              endLineNumber: lineNumber,
              endColumn: 1,
            },
            options: {
              isWholeLine: true,
              className: 'raw-log-line-highlight-pulse',
              linesDecorationsClassName: 'raw-log-line-gutter-highlight',
            },
          },
        ]
      );

      pulseTimeoutRef.current = window.setTimeout(() => {
        if (!editorRef.current) {
          return;
        }

        lineDecorationIdsRef.current = editorRef.current.deltaDecorations(
          lineDecorationIdsRef.current,
          [
            {
              range: {
                startLineNumber: lineNumber,
                startColumn: 1,
                endLineNumber: lineNumber,
                endColumn: 1,
              },
              options: {
                isWholeLine: true,
                className: 'raw-log-line-highlight-fade',
                linesDecorationsClassName: 'raw-log-line-gutter-highlight',
              },
            },
          ]
        );

        clearTimeoutRef.current = window.setTimeout(() => {
          if (!editorRef.current) {
            return;
          }

          lineDecorationIdsRef.current = editorRef.current.deltaDecorations(
            lineDecorationIdsRef.current,
            []
          );
        }, FADE_DURATION_MS);
      }, PULSE_DURATION_MS);
    },
    [clearLineHighlightTimers]
  );

  const jumpToLine = useCallback((lineNumber: number) => {
    const instance = editorRef.current;
    const model = instance?.getModel();

    if (!instance || !model) {
      return undefined;
    }

    const targetLine = Math.min(
      Math.max(Math.trunc(lineNumber), 1),
      model.getLineCount()
    );

    instance.setSelection({
      startLineNumber: targetLine,
      startColumn: 1,
      endLineNumber: targetLine,
      endColumn: 1,
    });
    instance.revealLineInCenter(targetLine);
    instance.focus();
    applyLineHighlight(targetLine);

    return targetLine;
  }, [applyLineHighlight]);

  useEffect(() => {
    if (!jumpRequest?.lineNumber) {
      return;
    }

    jumpToLine(jumpRequest.lineNumber);
  }, [jumpRequest?.nonce, jumpRequest?.lineNumber, jumpToLine]);

  useEffect(() => {
    return () => {
      clearLineHighlight();
    };
  }, [clearLineHighlight]);

  return (
    <section className="panel raw-log">
      <div className="raw-log-editor" role="region" aria-label="Raw log text">
        <Editor
          height="100%"
          beforeMount={ensureRawLogMonacoSetup}
          language={RAW_LOG_LANGUAGE_ID}
          onMount={(editorInstance) => {
            editorRef.current = editorInstance;

            if (jumpRequest?.lineNumber) {
              jumpToLine(jumpRequest.lineNumber);
            }
          }}
          theme={
            theme === 'dark' ? RAW_LOG_THEME_DARK_ID : RAW_LOG_THEME_LIGHT_ID
          }
          value={rawText}
          options={{
            readOnly: true,
            minimap: { enabled: false },
            wordWrap: 'on',
            fontSize: 12,
            lineNumbersMinChars: 4,
            glyphMargin: false,
            folding: false,
            scrollBeyondLastLine: false,
            automaticLayout: true,
          }}
        />
      </div>
    </section>
  );
}
