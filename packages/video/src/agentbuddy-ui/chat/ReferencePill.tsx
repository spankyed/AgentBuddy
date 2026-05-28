import type {ReferenceCategory, ReferenceRefType} from './chatTypes';
import {referenceSvgElementsFor} from './referenceConfig';
import {cx} from '../primitives/classNames';
import './ChatComposer.module.css';
import {makeStyles} from '../primitives/makeStyles';

const styles = makeStyles('ChatComposer');

export function ReferencePill({
  label,
  mode = 'editable',
  refType,
  selected,
}: {
  label: string;
  mode?: 'editable' | 'viewer';
  refType: ReferenceRefType;
  selected?: boolean;
}) {
  return (
    <span
      className={cx(styles.referencePill, selected && styles.referencePillSelected)}
      contentEditable={false}
      data-editor-mode={mode}
      data-ref-type={refType}
    >
      <ReferenceIcon refType={refType} />
      <span className={styles.referencePillLabel}>{label}</span>
    </span>
  );
}

export function ReferenceIcon({tone = 'pill', refType}: {tone?: 'pill' | 'suggestion'; refType: ReferenceCategory | ReferenceRefType}) {
  const className = tone === 'suggestion' ? styles.referenceSuggestionIcon : styles.referencePillIcon;
  const size = tone === 'suggestion' ? 16 : 14;
  const elements = referenceSvgElementsFor(refType);
  return (
    <svg
      className={className}
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
      width={size}
    >
      {elements.map(([tag, attrs], index) => {
        if (tag === 'rect') return <rect key={index} {...attrs} />;
        if (tag === 'circle') return <circle key={index} {...attrs} />;
        return <path key={index} {...attrs} />;
      })}
    </svg>
  );
}
