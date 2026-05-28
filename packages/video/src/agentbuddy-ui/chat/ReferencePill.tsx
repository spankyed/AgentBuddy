import type {ReferenceCategory, ReferenceRefType} from './chatTypes';
import {referenceIconFor} from './referenceConfig';
import './ChatComposer.module.css';
import {makeStyles} from '../primitives/makeStyles';

const styles = makeStyles('ChatComposer');

export function ReferencePill({href, label, refType}: {href?: string; label: string; refType: ReferenceRefType}) {
  const children = (
    <>
      <ReferenceIcon refType={refType} />
      <span className={styles.referencePillLabel}>{label}</span>
    </>
  );

  if (href) {
    return (
      <a className={styles.referencePill} data-ref-type={refType} href={href}>
        {children}
      </a>
    );
  }

  return (
    <span className={styles.referencePill} contentEditable={false} data-ref-type={refType}>
      {children}
    </span>
  );
}

export function ReferenceIcon({tone = 'pill', refType}: {tone?: 'pill' | 'suggestion'; refType: ReferenceCategory | ReferenceRefType}) {
  const className = tone === 'suggestion' ? styles.referenceSuggestionIcon : styles.referencePillIcon;
  const size = tone === 'suggestion' ? 16 : 14;
  const Icon = referenceIconFor(refType);
  return <Icon className={className} size={size} />;
}
