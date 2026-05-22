import { isPlainObject } from "@/core/shared";
import { getStyles, type internals } from "./styles";

function formatTimestamp(date: Date) {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

const allowVerbose = false;

export function logInternal(type: keyof typeof internals, verbose = false, ...messages: unknown[]) {
  if (!messages.length) return;
  const [firstRaw, ...restRaw] = messages;
  const timestamp = formatTimestamp(new Date());
  const { primary, secondary, label, bold, reset, dim } = getStyles(type);
  const time = `[${dim}${timestamp}${reset}] `;
  const header = `${primary}${bold} ${label} ${reset}`;
  const main = `${secondary}${bold} ${String(firstRaw)} `;
  let logOutput = `${time}${header}${main}`;

  const rest = restRaw.map(String);
  const logs = ['ER', 'IN'].includes(type)
    ? rest
    : rest.filter((value) => value.length < 24);

  for (const log of logs) {
    logOutput += `${log} `;
  }

  if (allowVerbose || !verbose) {
    // console.log(logOutput + reset);
  }
}

export function logInfo(...messages: string[]){
  logInternal('IN', false, ...messages);
}
