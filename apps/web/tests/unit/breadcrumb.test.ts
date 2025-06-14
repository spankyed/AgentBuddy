import { describe, it, expect } from 'vitest';
import breadcrumb, { breadcrumbWithParams, breadcrumbList, staticBreadcrumbList } from '@/core/breadcrumb';

describe('breadcrumb', () => {
  it('should create a static breadcrumb', () => {
    const result = breadcrumb('homeView', 'Home');
    
    expect(result).toEqual({
      breadcrumb: { label: 'Home', target: 'homeView', default: false }
    });
  });

  it('should create a default breadcrumb', () => {
    const result = breadcrumb('dashboardView', 'Dashboard', true);
    
    expect(result).toEqual({
      breadcrumb: { label: 'Dashboard', target: 'dashboardView', default: true }
    });
  });
});

describe('breadcrumbWithParams', () => {
  it('should create breadcrumb with prefix and paramName', () => {
    const result = breadcrumbWithParams({
      target: 'threadView',
      prefix: 'Thread',
      paramName: 'threadId'
    });
    
    const context = { threadId: '123', otherProp: 'value' };
    const breadcrumbItem = result.breadcrumb(context);
    
    expect(breadcrumbItem).toEqual({
      label: 'Thread 123',
      target: 'threadView'
    });
  });

  it('should create breadcrumb with paramName only', () => {
    const result = breadcrumbWithParams({
      target: 'userView',
      paramName: 'userName'
    });
    
    const context = { userName: 'Alice' };
    const breadcrumbItem = result.breadcrumb(context);
    
    expect(breadcrumbItem).toEqual({
      label: 'Alice',
      target: 'userView'
    });
  });

  it('should handle missing param value', () => {
    const result = breadcrumbWithParams({
      target: 'view',
      prefix: 'Item',
      paramName: 'itemId'
    });
    
    const context = { otherId: '456' };
    const breadcrumbItem = result.breadcrumb(context);
    
    expect(breadcrumbItem).toEqual({
      label: '',
      target: 'view'
    });
  });

  it('should use getLabel function when provided', () => {
    const result = breadcrumbWithParams({
      target: 'customView',
      getLabel: (ctx) => `Custom: ${ctx.type} - ${ctx.name}`
    });
    
    const context = { type: 'Product', name: 'Widget', id: '789' };
    const breadcrumbItem = result.breadcrumb(context);
    
    expect(breadcrumbItem).toEqual({
      label: 'Custom: Product - Widget',
      target: 'customView'
    });
  });
});

describe('breadcrumbList', () => {
  it('should create dynamic breadcrumb list', () => {
    const result = breadcrumbList((ctx: { category: string; product: string; id: string }) => [
      { label: 'Products', target: 'products' },
      { label: ctx.category, target: 'category', info: 'cat-1' },
      { label: ctx.product, target: 'detail', info: ctx.id }
    ]);
    
    const context = { category: 'Electronics', product: 'Laptop', id: 'prod-123' };
    const breadcrumbs = result.breadcrumb(context);
    
    expect(breadcrumbs).toEqual([
      { label: 'Products', target: 'products' },
      { label: 'Electronics', target: 'category', info: 'cat-1' },
      { label: 'Laptop', target: 'detail', info: 'prod-123' }
    ]);
  });

  it('should handle empty breadcrumb list', () => {
    const result = breadcrumbList(() => []);
    
    const context = { any: 'value' };
    const breadcrumbs = result.breadcrumb(context);
    
    expect(breadcrumbs).toEqual([]);
  });
});

describe('staticBreadcrumbList', () => {
  it('should create static breadcrumb list', () => {
    const result = staticBreadcrumbList([
      { label: 'Flow A', target: 'viewA', info: 'A' },
      { label: 'Flow B', target: 'viewB', info: 'B' },
      { label: 'Flow C', target: 'viewC', info: 'C' }
    ]);
    
    expect(result).toEqual({
      breadcrumb: [
        { label: 'Flow A', target: 'viewA', info: 'A' },
        { label: 'Flow B', target: 'viewB', info: 'B' },
        { label: 'Flow C', target: 'viewC', info: 'C' }
      ]
    });
  });

  it('should handle breadcrumbs without info property', () => {
    const result = staticBreadcrumbList([
      { label: 'Home', target: 'home' },
      { label: 'Settings', target: 'settings' }
    ]);
    
    expect(result).toEqual({
      breadcrumb: [
        { label: 'Home', target: 'home' },
        { label: 'Settings', target: 'settings' }
      ]
    });
  });
}); 