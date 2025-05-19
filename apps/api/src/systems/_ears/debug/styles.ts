export const internals = {
  EV: { 
    label: 'EVENT', 
    primary: '\x1b[44m\x1b[37m', // Dark blue background, light gray text for header
    secondary: '\x1b[104m\x1b[34m' // Light blue background, dark blue text for main
  },
  EC: { 
    label: 'ENTITY', 
    primary: '\x1b[42m\x1b[97m', // Dark green background, white text for header
    secondary: '\x1b[102m\x1b[32m' // Light green background, dark green text for main
  },
  AA: { 
    label: 'ATTRIBUTE[+]', 
    primary: '\x1b[40m\x1b[97m', // Dark black background, white text for header
    secondary: '\x1b[100m\x1b[30m' // Grey background, black text for main
  },
  AU: {
    label: 'ATTRIBUTE[^]',
    primary: '\x1b[40m\x1b[97m', // Dark black background, white text for header
    secondary: '\x1b[100m\x1b[30m' // Grey background, black text for main
  },
  AR: {
    label: 'ATTRIBUTE[-]',
    primary: '\x1b[40m\x1b[97m', // Dark black background, white text for header
    secondary: '\x1b[100m\x1b[30m' // Grey background, black text for main
  },
  // RR: { 
  //   label: 'RELATION', 
  //   primary: '\x1b[41m\x1b[97m', // Dark red background, white text for header
  //   secondary: '\x1b[101m\x1b[30m' // Lighter red background, black text for main
  // }
  WR: {
    label: 'WARNING',
    primary: '\x1b[43m\x1b[97m', // Dark yellow background, white text for header
    secondary: '\x1b[103m\x1b[33m' // Light yellow background, dark yellow text for main
  },
  ER: {
    label: 'ERROR',
    primary: '\x1b[41m\x1b[97m', // Dark red background, white text for header
    secondary: '\x1b[101m\x1b[31m' // Lighter red background, red text for main
  },
  IN: {
    label: 'INFO',
    primary: '\x1b[47m\x1b[30m', // White background, black text for header
    secondary: '\x1b[107m\x1b[97m' // Light white background, white text for main
  },
};

const ansiToBlessedMap = {
  '\x1b[44m\x1b[37m': '{#000080-bg}{#ffffff-fg}', // Dark blue background with white text
  '\x1b[104m\x1b[34m': '{#add8e6-bg}{#000080-fg}', // Light blue background with dark blue text
  '\x1b[42m\x1b[97m': '{#228b22-bg}{#ffffff-fg}',
  '\x1b[102m\x1b[32m': '{#90ee90-bg}{#006400-fg}',
  '\x1b[40m\x1b[97m': '{#000000-bg}{#ffffff-fg}',
  '\x1b[100m\x1b[30m': '{#34568b-bg}{#e0e0e0-fg}', // AA secondary
  '\x1b[43m\x1b[97m': '{#ffd700-bg}{#ffffff-fg}',
  '\x1b[103m\x1b[33m': '{#ffffe0-bg}{#d4af37-fg}',
  '\x1b[41m\x1b[97m': '{#b22222-bg}{#ffffff-fg}',
  '\x1b[101m\x1b[31m': '{#f08080-bg}{#8b0000-fg}',
  '\x1b[47m\x1b[30m': '{#ffffff-bg}{#000000-fg}',
  '\x1b[107m\x1b[97m': '{#f8f8f8-bg}{#000000-fg}'
};

const defaultStyles = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  dim: '\x1b[2m',
};

const styles = defaultStyles;

export function getStyles(type: keyof typeof internals) {
  const { primary, secondary, label } = internals[type];
  return {
    primary: primary,
    secondary: secondary,
    label,
    bold: styles.bold,
    reset: styles.reset,
    dim: styles.dim
  };
}
