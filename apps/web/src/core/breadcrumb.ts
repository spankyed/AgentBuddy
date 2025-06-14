export default function breadcrumb(
  target: string,
  label: string,
  isDefault = false,
) {
  return {
    breadcrumb : { label, target, default: isDefault }
  }
}


export function breadcrumbWithParams<C>({
  target,
  getLabel,
  prefix,
  paramName,
}: {
  target: string;
} & (
  | { getLabel: (ctx: C) => string; prefix?: never; paramName?: never }
  | { getLabel?: never; prefix?: string; paramName: keyof C }
)) {
  return {
    breadcrumb: (ctx: C) => {
      let label: string;
      
      if (getLabel) {
        label = getLabel(ctx);
      } else {
        const paramValue = ctx[paramName!];
        if (prefix && paramValue) {
          label = `${prefix} ${paramValue}`;
        } else {
          label = String(paramValue || '');
        }
      }
      
      return { label, target };
    },
  } as const;
}
// equivalent to something like:
// breadcrumb: (ctx: ThreadsContext) => ({
//   label: ctx.selectedThreadCode ? `Thread ${ctx.selectedThreadCode}` : 'Thread',
//   target: 'view'
// })

export function breadcrumbList<C>(
  getCrumbs: (ctx: C) => Array<{ label: string; target: string; info?: any }>
) {
  return {
    breadcrumb: getCrumbs,
  } as const;
}

// Example usage:
// breadcrumbList((ctx: MyContext) => [
//   { label: 'Products', target: 'products' },
//   { label: ctx.category, target: 'category', info: ctx.categoryId },
//   { label: ctx.productName, target: 'detail', info: ctx.productId }
// ])

export function staticBreadcrumbList(
  crumbs: Array<{ label: string; target: string; info?: any }>
) {
  return {
    breadcrumb: crumbs,
  } as const;
}

// Example usage:
// staticBreadcrumbList([
//   { label: 'Flow A', target: 'view', info: 'A' },
//   { label: 'Flow B', target: 'view', info: 'B' },
//   { label: 'Flow C', target: 'view', info: 'C' }
// ])