import type {ReactNode} from 'react';
import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import {MonacoCodeViewer} from '../code/MonacoCodeViewer';
import {categoryStyle} from './PromptsSurface';
import type {PromptCategory, PromptRow} from './promptTypes';
import './PromptDetail.module.css';

const styles = makeStyles('PromptDetail');

export function PromptDetail({prompt, categories}: {prompt: PromptRow; categories: PromptCategory[]}) {
  return (
    <div className={styles.root}>
      <NameSaveHeader prompt={prompt} categories={categories} />
      <div className={styles.scroll}>
        <div className={styles.content}>
          <CollapsibleSection label="Input Parameters" open>
            <PromptInputs inputs={prompt.inputs} />
          </CollapsibleSection>

          <section className={styles.section}>
            <div className={styles.templateLabel}>
              <span>Function Template <b>*</b></span>
              <button><Icons.ExternalLink size={12} /> Open in editor</button>
            </div>
            <p className={styles.helpText}>
              Write a JavaScript function body that returns a template string. The function will receive a `params` object with your defined inputs.
            </p>
            <div className={styles.editor} data-onboarding-id="prompt-template-editor">
              <MonacoCodeViewer value={prompt.templateFn} language="javascript" />
            </div>
          </section>

          <CollapsibleSection label="Output Schema (Optional)" open={Boolean(prompt.outputSchema)}>
            <pre className={styles.schema}>{prompt.outputSchema || '{ }'}</pre>
          </CollapsibleSection>

          <CollapsibleSection label="Description">
            <textarea className={styles.textarea} value={prompt.description || ''} readOnly />
          </CollapsibleSection>

          <CollapsibleSection label="Metadata" open>
            <div className={styles.metadata}>
              <span>ID <code>{prompt.id}</code></span>
              <span>Created <b>{prompt.createdAt}</b></span>
              <span>Updated <b>{prompt.updatedAt}</b></span>
            </div>
          </CollapsibleSection>
        </div>
      </div>
    </div>
  );
}

function NameSaveHeader({prompt, categories}: {prompt: PromptRow; categories: PromptCategory[]}) {
  return (
    <header className={styles.nameHeader}>
      <button className={styles.back}><Icons.ArrowLeft size={16} /> Back</button>
      <input className={styles.nameInput} value={prompt.label} readOnly />
      <div className={styles.select} style={categoryStyle(prompt.category, categories)}>
        {prompt.category || 'No Category'}
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

function PromptInputs({inputs}: {inputs: PromptRow['inputs']}) {
  const rows = Object.entries(inputs);
  return (
    <div className={styles.inputs}>
      {rows.map(([key, input]) => (
        <div key={key} className={styles.inputRow}>
          <input value={input.name} readOnly />
          <span className={styles.inputType}>{input.type}</span>
          <span className={input.required ? styles.required : styles.optional}>{input.required ? 'required' : 'optional'}</span>
          <span className={styles.inputDescription}>{input.description}</span>
        </div>
      ))}
      <button className={styles.addInput}><Icons.Plus size={16} /> Add Parameter</button>
    </div>
  );
}
