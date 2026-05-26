import {Icons} from '../../primitives/Icon';
import './CodeDirectorySelect.module.css';
import {makeStyles} from '../../primitives/makeStyles';

const styles = makeStyles('CodeDirectorySelect');

type CodeDirectorySelectProps = {
  disabled?: boolean;
  homeDirectory?: string;
  open?: boolean;
  projects?: Array<{color: string; directories: string[]; name: string}>;
  value?: string | null;
};

export function CodeDirectorySelect({disabled = false, homeDirectory, open = false, projects = [], value}: CodeDirectorySelectProps) {
  const selectedLabel = value == null ? 'Use last opened directory' : getFolderName(value);

  return (
    <div className={styles.root}>
      <button className={styles.trigger} disabled={disabled} type="button">
        <span className={styles.selectedLabel}>{selectedLabel}</span>
        <Icons.ChevronDown className={styles.chevron} data-open={open} size={16} />
      </button>
      {open ? (
        <div className={styles.dropdown}>
          <div className={styles.option} data-active={value == null} data-hovered={value == null}>
            Use last opened directory
          </div>
          {projects.length > 0 ? <div className={styles.separator} /> : null}
          {projects.map((project, projectIndex) => (
            <div key={`${project.name}-${projectIndex}`}>
              <div className={styles.projectHeader}>
                <span className={styles.projectDot} style={{backgroundColor: project.color}} />
                {project.name || `Project ${projectIndex + 1}`}
              </div>
              {project.directories.map((directory, directoryIndex) => (
                <div className={styles.directoryOption} data-active={value === directory} key={`${directory}-${directoryIndex}`}>
                  <div className={styles.directoryMain}>
                    <span className={styles.projectDot} style={{backgroundColor: project.color || 'red'}} />
                    <span className={styles.folderName}>{getFolderName(directory)}</span>
                    <span className={styles.fullPath}>{formatFullPath(directory, homeDirectory)}</span>
                  </div>
                  <span className={styles.projectName}>
                    {project.name}{project.directories.length > 1 ? ` (${directoryIndex + 1})` : ''}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function getFolderName(path: string) {
  const segments = path.split('/').filter(Boolean);
  return segments.at(-1) || path;
}

function formatFullPath(path: string, homeDirectory?: string) {
  if (!path) return '';

  const normalizedHome = homeDirectory?.replace(/\/+$/, '');
  const displayPath = normalizedHome && (path === normalizedHome || path.startsWith(`${normalizedHome}/`))
    ? `~${path.slice(normalizedHome.length)}`
    : path;
  if (displayPath.length <= 50) return displayPath;

  const segments = displayPath.split('/').filter(Boolean);
  if (segments.length <= 2) return `...${displayPath.slice(-47)}`;

  const last = segments.at(-1) ?? '';
  const secondLast = segments.at(-2) ?? '';
  const tail = `/${secondLast}/${last}`;
  let result = segments[0] ?? '';
  let remaining = 50 - result.length - tail.length - 2;

  for (let index = 1; index < segments.length - 2; index += 1) {
    const segment = segments[index];
    if (remaining >= segment.length + 1) {
      result += `/${segment}`;
      remaining -= segment.length + 1;
    } else {
      return `${result}/...${tail}`;
    }
  }

  return result + tail;
}
