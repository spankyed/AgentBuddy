import type {CSSProperties} from 'react';
import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import {PromptDetail} from './PromptDetail';
import type {PromptCategory, PromptRow, PromptsSurfaceState} from './promptTypes';
import './PromptsSurface.module.css';

const styles = makeStyles('PromptsSurface');

export function PromptsSurface({state}: {state: PromptsSurfaceState}) {
  const selectedPrompt = state.prompts.find(prompt => prompt.id === state.selectedPromptId) ?? state.prompts[0];
  if (state.view === 'detail' && selectedPrompt) {
    return <PromptDetail prompt={selectedPrompt} categories={state.categories} />;
  }

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Icons.Sparkle size={16} color="rgb(115 115 115)" />
          <p className={styles.headerText}>Manage prompt templates</p>
        </div>
        <div className={styles.button}>New Prompt</div>
      </header>
      <main className={styles.body}>
        {state.prompts.length > 0 ? <PromptsTable state={state} /> : <EmptyState />}
      </main>
    </div>
  );
}

function PromptsTable({state}: {state: PromptsSurfaceState}) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead className={styles.thead}>
          <tr className={styles.headRow}>
            <th className={styles.th}>Label</th>
            <th className={styles.th}>Description</th>
            <th className={styles.th}><CategoryFilter categories={state.categories} selectedCategories={state.selectedCategories} /></th>
            <th className={`${styles.th} ${styles.inputsColumn}`}>Inputs</th>
            <th className={styles.thRight}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {state.prompts.map(prompt => (
            <PromptTableRow key={prompt.id} prompt={prompt} categories={state.categories} />
          ))}
        </tbody>
      </table>
      {state.loadingMore ? <div className={styles.loading}>Loading more prompts...</div> : null}
    </div>
  );
}

function PromptTableRow({prompt, categories}: {prompt: PromptRow; categories: PromptCategory[]}) {
  const inputs = Object.entries(prompt.inputs);
  return (
    <tr className={styles.row}>
      <td className={styles.td}><span className={styles.label}>{prompt.label}</span></td>
      <td className={styles.td}><span className={styles.description}>{prompt.description || 'No description'}</span></td>
      <td className={styles.td}>
        <span className={styles.category} style={categoryStyle(prompt.category, categories)}>
          {prompt.category || 'none'}
        </span>
      </td>
      <td className={`${styles.td} ${styles.inputsColumn}`}>
        <div className={styles.inputPills}>
          {inputs.length === 0 ? <span className={styles.none}>none</span> : inputs.slice(0, 2).map(([key, input]) => (
            <span key={key} className={styles.input} title={input.description || ''}>{input.name || key}</span>
          ))}
          {inputs.length > 2 ? <span className={styles.input}>+{inputs.length - 2} more</span> : null}
        </div>
      </td>
      <td className={`${styles.td} ${styles.actions}`}>
        <span className={styles.delete}><Icons.Trash2 size={16} /></span>
      </td>
    </tr>
  );
}

function CategoryFilter({categories, selectedCategories}: {categories: PromptCategory[]; selectedCategories: string[]}) {
  const active = selectedCategories.length > 0;
  return (
    <div className={styles.filter}>
      <Icons.Filter size={13} />
      <span>{active ? `${selectedCategories.length} selected` : 'Category'}</span>
      <Icons.ChevronDown size={13} />
    </div>
  );
}

function EmptyState() {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyInner}>
        <div className={styles.emptyBadge}><Icons.Sparkle size={32} /></div>
        <h3>No prompts yet</h3>
        <p>Create your first prompt template to get started with reusable AI workflows</p>
        <div className={styles.button}><Icons.Plus size={16} /> New Prompt</div>
      </div>
    </div>
  );
}

export function categoryStyle(categoryName: string | undefined, categories: PromptCategory[]): CSSProperties {
  if (!categoryName) return {};
  const category = categories.find(item => item.name === categoryName);
  if (!category) {
    return {backgroundColor: 'rgb(38 38 38)', color: 'rgb(245 245 245)', borderColor: 'rgb(64 64 64)'};
  }

  return {
    backgroundColor: `${category.color}1A`,
    color: category.color,
    borderColor: `${category.color}33`,
  };
}
