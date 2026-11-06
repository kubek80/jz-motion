// Editing an element's text, label or title in place on the board: the state and actions
// (useInlineText) and the text box drawn over the board where the text was (InlineTextEditor).
import { useState } from 'react';
import type { Stage } from '../../engine';
import { updateElement, type Raw, type RawDoc } from './doc';

/** The text of an element that can be edited in place on the board. */
const TEXT_FIELD: Record<string, 'text' | 'label' | 'title'> = { text: 'text', icon: 'label', box: 'label', arrow: 'label', iso: 'label', chart: 'title' };

export interface InlineEdit {
  id: string;
  field: 'text' | 'label' | 'title';
  value: string;
  /** Position inside the board frame, and how the text looks there. */
  left: number;
  top: number;
  width: number;
  height: number;
  fontPx: number;
  color: string;
  align: 'start' | 'middle' | 'end';
  family: string;
  weight: string;
  /** Code and text with several lines are edited in a box that takes new lines. */
  multiline: boolean;
}

interface InlineTextOptions {
  stage: React.RefObject<Stage | null>;
  stageFrame: React.RefObject<HTMLDivElement | null>;
  doc: RawDoc | null;
  sceneIndex: number;
  elements: Raw[] | undefined;
  editable: Set<string>;
  setPicked: (ids: string[]) => void;
  update: (next: RawDoc) => void;
}

/** Text being edited in place on the board, with the actions that open and close the editor. */
export function useInlineText({ stage, stageFrame, doc, sceneIndex, elements, editable, setPicked, update }: InlineTextOptions) {
  const [inline, setInline] = useState<InlineEdit | null>(null);

  /** Opens a text box over an element's text, label or title, in the same handwriting and size. */
  const startInline = (id: string) => {
    const s = stage.current;
    const el = elements?.find((x) => x.id === id);
    const frame = stageFrame.current?.getBoundingClientRect();
    if (!s || !el || !frame || !editable.has(id)) return;
    const field = TEXT_FIELD[el.type];
    const spot = field && s.textField(id, field);
    if (!spot) return;
    s.setTextHidden(id, field, true);
    setPicked([id]);
    setInline({
      id, field, value: String(el[field] ?? ''),
      left: spot.left - frame.left, top: spot.top - frame.top, width: spot.width, height: spot.height,
      fontPx: spot.fontPx, color: spot.color, align: spot.align, family: spot.family, weight: spot.weight,
      multiline: el.type === 'text' && (el.style === 'code' || String(el.text).includes('\n')),
    });
  };

  const finishInline = (save: boolean) => {
    const edit = inline;
    if (!edit) return;
    setInline(null);
    stage.current?.setTextHidden(edit.id, edit.field, false);
    const el = elements?.find((x) => x.id === edit.id);
    if (!save || !doc || !el) return;
    const value = inline?.multiline ? edit.value.replace(/\s+$/, '') : edit.value.trim();
    if (value === String(el[edit.field] ?? '')) return;
    // A text element keeps its words if emptied; an empty label or title is removed.
    if (!value && edit.field === 'text') return;
    update(updateElement(doc, sceneIndex, edit.id, { [edit.field]: value || undefined }));
  };

  return { inline, setInline, startInline, finishInline };
}

/** The text box over the board, anchored and styled like the text it replaces. */
export function InlineTextEditor({ inline, setInline, finishInline }: {
  inline: InlineEdit;
  setInline: (next: InlineEdit) => void;
  finishInline: (save: boolean) => void;
}) {
  const style: React.CSSProperties = {
    // Anchored like the text it replaces: centred, or from its left or right edge.
    top: inline.top + inline.height / 2,
    left: inline.align === 'start' ? inline.left : inline.align === 'end' ? inline.left + inline.width : inline.left + inline.width / 2,
    transform: `translate(${inline.align === 'start' ? '0' : inline.align === 'end' ? '-100%' : '-50%'}, -50%)`,
    fontSize: inline.fontPx, color: inline.color, fontFamily: inline.family, fontWeight: inline.weight as React.CSSProperties['fontWeight'],
    textAlign: inline.align === 'middle' ? 'center' : inline.align === 'end' ? 'right' : 'left',
  };
  const common = {
    className: inline.multiline ? 'inline-edit multiline' : 'inline-edit',
    autoFocus: true,
    value: inline.value,
    style,
    placeholder: inline.field,
    onBlur: () => finishInline(true),
    onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
  };
  // Several lines (code): Enter starts a new line; Ctrl+Enter or clicking away keeps it.
  return inline.multiline ? (
    <textarea
      {...common}
      rows={inline.value.split('\n').length}
      style={{ ...style, minWidth: inline.width + inline.fontPx * 2 }}
      onChange={(e) => setInline({ ...inline, value: e.target.value })}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) finishInline(true);
        else if (e.key === 'Escape') finishInline(false);
        e.stopPropagation();
      }}
    />
  ) : (
    <input
      {...common}
      onChange={(e) => setInline({ ...inline, value: e.target.value })}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finishInline(true);
        else if (e.key === 'Escape') finishInline(false);
        e.stopPropagation();
      }}
    />
  );
}
