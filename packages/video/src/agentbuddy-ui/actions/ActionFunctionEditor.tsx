import {MonacoCodeViewer} from '../code/MonacoCodeViewer';
import {makeStyles} from '../primitives/makeStyles';
import './ActionFunctionEditor.module.css';

const styles = makeStyles('ActionsFunctionEditor');

type ActionFunctionEditorProps = {
  value: string;
};

export function ActionFunctionEditor({value}: ActionFunctionEditorProps) {
  return (
    <div className={styles.root} data-onboarding-id="action-function-editor">
      <MonacoCodeViewer filePath="action-template.ts" fontSize={14} height="100%" language="typescript" lineNumbers="off" value={value} wordWrap="on" />
    </div>
  );
}
