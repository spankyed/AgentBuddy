export default function breadcrumb(
  target: string,
  label: string,
  isDefault = false,
) {
  return {
    breadcrumb : { label, target, default: isDefault }
  }
}


export function breadcrumbWithParams<C>(
  target: string,
  labelPrefix: string,
  paramName: keyof C,
) {
  return {
    breadcrumb: (ctx: C) => ({
      label: ctx[paramName] ? `${labelPrefix} ${ctx[paramName]}` : labelPrefix,
      target
    }),
  } as const;
}
// equivalent to something like:
// breadcrumb: (ctx: ThreadsContext) => ({
//   label: ctx.selectedThreadCode ? `Thread ${ctx.selectedThreadCode}` : 'Thread',
//   target: 'view'
// })