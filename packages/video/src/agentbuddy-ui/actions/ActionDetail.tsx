import type {ReactNode} from 'react';
import {MonacoCodeViewer} from '../code/MonacoCodeViewer';
import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import type {ActionCategory, ActionParameter, ActionRow} from './actionTypes';
import {categoryStyle} from './ActionsSurface';
import './ActionDetail.module.css';

const styles = makeStyles('ActionDetail');

export function ActionDetail({action, categories}: {action: ActionRow; categories: ActionCategory[]}) {
  return (
    <div className={styles.root}>
      <NameSaveHeader action={action} categories={categories} />
      <div className={styles.scroll}>
        <div className={styles.content}>
          <CollapsibleSection label="Input Parameters" open>
            <ActionParameters parameters={action.inputParameters || {}} />
          </CollapsibleSection>

          <section className={styles.section}>
            <div className={styles.templateLabel}>
              <span>Function Template<b>*</b></span>
              <button><Icons.ExternalLink size={12} /> Open in editor</button>
            </div>
            <p className={styles.helpText} data-onboarding-id="action-services-info">
              An async JavaScript function body that receives `params` object and `services` (logger, database, LLM, http) object.
            </p>
            <div className={styles.editor} data-onboarding-id="action-function-editor">
              <MonacoCodeViewer value={action.actionFn || ''} language="typescript" />
            </div>
          </section>

          <CollapsibleSection label="Output Schema (Optional)" open={Boolean(action.outputSchema)}>
            <pre className={styles.schema}>{action.outputSchema || '{ }'}</pre>
          </CollapsibleSection>

          <CollapsibleSection label="Description">
            <textarea className={styles.textarea} data-onboarding-id="action-description-input" value={action.description || ''} readOnly />
          </CollapsibleSection>

          <CollapsibleSection label="Metadata" open>
            <div className={styles.metadata}>
              <span>ID <code>{action.id}</code></span>
              <span>Created <b>{action.createdAt}</b></span>
              <span>Updated <b>{action.updatedAt}</b></span>
            </div>
          </CollapsibleSection>
        </div>
      </div>
    </div>
  );
}

function NameSaveHeader({action, categories}: {action: ActionRow; categories: ActionCategory[]}) {
  const category = categories.find(item => item.name === action.category);
  return (
    <header className={styles.nameHeader}>
      <button className={styles.back}><Icons.ArrowLeft size={16} /> Back</button>
      <input className={styles.nameInput} data-onboarding-id="action-label-input" value={action.label} readOnly />
      <div className={styles.select} style={categoryStyle(category)}>
        {action.category || 'No Category'}
        <Icons.ChevronDown size={14} />
      </div>
      <button className={styles.save}>Save</button>
    </header>
  );
}

function CollapsibleSection({label, open = false, children}: {label: string; open?: boolean; children: ReactNode}) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionTitle}>
        {open ? <Icons.ChevronDown size={14} /> : <Icons.ChevronRight size={14} />}
        <span>{label}</span>
      </div>
      {open ? <div className={styles.sectionBody}>{children}</div> : null}
    </section>
  );
}

function ActionParameters({parameters}: {parameters: Record<string, ActionParameter>}) {
  const rows = Object.entries(parameters);
  return (
    <div className={styles.parameters}>
      {rows.length > 0 ? rows.map(([key, param]) => (
        <div key={key} className={styles.parameterRow}>
          <input value={key} readOnly />
          <span className={styles.parameterType}>{param.type}</span>
          <span className={param.required ? styles.required : styles.optional}>{param.required ? 'required' : 'optional'}</span>
          <span className={styles.parameterDescription}>{param.description}</span>
        </div>
      )) : null}
      <button className={styles.addParameter} data-onboarding-id="action-parameters-section"><Icons.Plus size={16} /> Add Parameter</button>
    </div>
  );
}
