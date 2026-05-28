import type {ReferenceCategory, ReferenceRefType} from './chatTypes';
import {referenceSvgElementsFor} from './referenceConfig';
import {cx} from '../primitives/classNames';
import './ChatComposer.module.css';
import {makeStyles} from '../primitives/makeStyles';

const styles = makeStyles('ChatComposer');

export function ReferencePill({
  href,
  label,
  mode = 'editable',
  refType,
  selected,
}: {
  href?: string;
  label: string;
  mode?: 'editable' | 'viewer';
  refType: ReferenceRefType;
  selected?: boolean;
}) {
  const content = (
    <>
      <span className={styles.referencePillIcon}>
        <ReferenceIconSvg refType={refType} size={14} />
      </span>
      <span className={styles.referencePillLabel}>{label}</span>
    </>
  );

  const className = cx(styles.referencePill, selected && styles.referencePillSelected);
  if (href) {
    return (
      <a className={className} data-editor-mode={mode} data-ref-type={refType} href={href}>
        {content}
      </a>
    );
  }

  return (
    <span className={className} contentEditable={false} data-editor-mode={mode} data-ref-type={refType}>
      {content}
    </span>
  );
}

export function ReferenceIcon({tone = 'pill', refType}: {tone?: 'pill' | 'suggestion'; refType: ReferenceCategory | ReferenceRefType}) {
  const className = tone === 'suggestion' ? styles.referenceSuggestionIcon : undefined;
  const size = tone === 'suggestion' ? 16 : 14;
  return <ReferenceIconSvg className={className} refType={refType} size={size} />;
}

function ReferenceIconSvg({className, refType, size}: {className?: string; refType: ReferenceCategory | ReferenceRefType; size: number}) {
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
