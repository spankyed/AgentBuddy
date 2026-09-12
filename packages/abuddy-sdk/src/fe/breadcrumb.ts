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

export function breadcrumbList<C>(
  getCrumbs: (ctx: C) => Array<{ label: string; target: string; info?: any }>
) {
  return {
    breadcrumb: getCrumbs,
  } as const;
}

export function staticBreadcrumbList(
  crumbs: Array<{ label: string; target: string; info?: any }>
) {
  return {
    breadcrumb: crumbs,
  } as const;
}
