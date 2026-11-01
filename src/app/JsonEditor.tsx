import { json, jsonParseLinter } from '@codemirror/lang-json';
import { foldAll, HighlightStyle, syntaxHighlighting, unfoldAll } from '@codemirror/language';
import { linter, lintGutter } from '@codemirror/lint';
import { Annotation } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import { basicSetup } from 'codemirror';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { palette } from '../engine/palette';

// JSON editor with colours, folding, bracket matching, search (Ctrl+F) and syntax errors marked inline.

const theme = EditorView.theme({
  '&': { height: '100%', fontSize: '12.5px', background: '#0a0c0e', color: '#dfe6ee' },
  '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', lineHeight: '1.55' },
  '.cm-gutters': { background: '#0d1013', color: '#4b5560', border: 'none' },
  '.cm-activeLine, .cm-activeLineGutter': { background: '#ffffff08' },
  '.cm-foldPlaceholder': { background: '#1c2329', border: '1px solid #2f3840', color: palette.cyan, padding: '0 6px' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { background: '#3ef0ff33 !important' },
  '.cm-cursor': { borderLeftColor: palette.cyan },
  '.cm-matchingBracket': { background: '#3ef0ff22', outline: '1px solid #3ef0ff66' },
  '.cm-tooltip': { background: '#13171b', border: '1px solid #2f3840' },
}, { dark: true });

const colours = HighlightStyle.define([
  { tag: t.propertyName, color: palette.cyan },
  { tag: t.string, color: palette.yellow },
  { tag: t.number, color: palette.orange },
  { tag: [t.bool, t.null], color: palette.pink },
  { tag: [t.brace, t.squareBracket, t.punctuation, t.separator], color: '#7d8994' },
]);

/** Marks changes that came from outside the editor, so they aren't reported back as edits. */
const external = Annotation.define<boolean>();

export interface JsonEditorHandle {
  foldAll(): void;
  unfoldAll(): void;
}

export const JsonEditor = forwardRef<JsonEditorHandle, { value: string; onChange: (v: string) => void }>(function JsonEditor({ value, onChange }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const changed = useRef(onChange);
  changed.current = onChange;

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      doc: value,
      extensions: [
        basicSetup,
        json(),
        linter(jsonParseLinter()),
        lintGutter(),
        theme,
        syntaxHighlighting(colours),
        EditorView.updateListener.of((u) => {
          if (u.docChanged && !u.transactions.some((tr) => tr.annotation(external))) changed.current(u.state.doc.toString());
        }),
      ],
    });
    view.current = v;
    return () => v.destroy();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Changes made elsewhere (board, undo) replace the text but keep the cursor where it was.
  useEffect(() => {
    const v = view.current;
    if (!v || v.state.doc.toString() === value) return;
    const head = Math.min(v.state.selection.main.head, value.length);
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value }, selection: { anchor: head }, annotations: external.of(true) });
  }, [value]);

  useImperativeHandle(ref, () => ({
    foldAll: () => view.current && foldAll(view.current),
    unfoldAll: () => view.current && unfoldAll(view.current),
  }));

  return <div className="code" ref={host} />;
});
