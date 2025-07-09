import type { 
  HttpService, 
  HttpResponse, 
  HttpOptions,
  ServiceMetadata 
} from './types';

/**
 * HTTP Service Implementation
 * Provides HTTP client capabilities for actions
 */
export class HttpServiceImpl implements HttpService {
  private async makeRequest<T>(
    method: string,
    url: string,
    data?: any,
    options?: HttpOptions
  ): Promise<HttpResponse<T>> {
    // Implementation - in production, this would use axios or fetch
    const mockResponse: any = {
      mock: true,
      method,
      url,
      timestamp: Date.now()
    };

    if (data) {
      mockResponse.received = data;
    }

    if (options?.params) {
      mockResponse.params = options.params;
    }

    return {
      status: method === 'POST' ? 201 : (method === 'DELETE' ? 204 : 200),
      statusText: 'OK',
      headers: {
        'content-type': 'application/json',
        'x-mock-response': 'true',
        ...(options?.headers || {})
      },
      data: mockResponse as T,
      config: options
    };
  }

  async get<T = any>(url: string, options?: HttpOptions): Promise<HttpResponse<T>> {
    return this.makeRequest<T>('GET', url, undefined, options);
  }

  async post<T = any>(url: string, data?: any, options?: HttpOptions): Promise<HttpResponse<T>> {
    return this.makeRequest<T>('POST', url, data, options);
  }

  async put<T = any>(url: string, data?: any, options?: HttpOptions): Promise<HttpResponse<T>> {
    return this.makeRequest<T>('PUT', url, data, options);
  }

  async patch<T = any>(url: string, data?: any, options?: HttpOptions): Promise<HttpResponse<T>> {
    return this.makeRequest<T>('PATCH', url, data, options);
  }

  async delete<T = any>(url: string, options?: HttpOptions): Promise<HttpResponse<T>> {
    return this.makeRequest<T>('DELETE', url, undefined, options);
  }

  async head(url: string, options?: HttpOptions): Promise<HttpResponse<void>> {
    return {
      status: 200,
      statusText: 'OK',
      headers: {
        'content-type': 'application/json',
        'content-length': '1234',
        'last-modified': new Date().toUTCString()
      },
      data: undefined as any,
      config: options
    };
  }
}

// Service metadata for potential action generation
export const httpServiceMetadata: ServiceMetadata = {
  name: 'http',
  description: 'HTTP client service for making external API requests',
  category: 'integration',
  methods: [
    {
      name: 'get',
      description: 'Make a GET request',
      input: [
        {
          name: 'url',
          type: 'string',
          required: true,
          description: 'The URL to request'
        },
        {
          name: 'options',
          type: 'HttpOptions',
          required: false,
          description: 'Request options (headers, params, auth, etc.)'
        }
      ],
      returns: 'HttpResponse<T>',
      example: `const response = await services.http.get(
  'https://api.example.com/users',
  { 
    headers: { 'Authorization': 'Bearer token' },
    params: { page: 1, limit: 10 }
  }
);`
    },
    {
      name: 'post',
      description: 'Make a POST request',
      input: [
        {
          name: 'url',
          type: 'string',
          required: true,
          description: 'The URL to request'
        },
        {
          name: 'data',
          type: 'any',
          required: false,
          description: 'The request body data'
        },
        {
          name: 'options',
          type: 'HttpOptions',
          required: false,
          description: 'Request options'
        }
      ],
      returns: 'HttpResponse<T>',
      example: `const response = await services.http.post(
  'https://api.example.com/users',
  { name: 'John Doe', email: 'john@example.com' },
  { headers: { 'Content-Type': 'application/json' } }
);`
    },
    {
      name: 'put',
      description: 'Make a PUT request',
      input: [
        {
          name: 'url',
          type: 'string',
          required: true,
          description: 'The URL to request'
        },
        {
          name: 'data',
          type: 'any',
          required: false,
          description: 'The request body data'
        },
        {
          name: 'options',
          type: 'HttpOptions',
          required: false,
          description: 'Request options'
        }
      ],
      returns: 'HttpResponse<T>',
      example: `const response = await services.http.put(
  'https://api.example.com/users/123',
  { name: 'Jane Doe' }
);`
    },
    {
      name: 'patch',
      description: 'Make a PATCH request',
      input: [
        {
          name: 'url',
          type: 'string',
          required: true,
          description: 'The URL to request'
        },
        {
          name: 'data',
          type: 'any',
          required: false,
          description: 'The partial update data'
        },
        {
          name: 'options',
          type: 'HttpOptions',
          required: false,
          description: 'Request options'
        }
      ],
      returns: 'HttpResponse<T>',
      example: `const response = await services.http.patch(
  'https://api.example.com/users/123',
  { status: 'active' }
);`
    },
    {
      name: 'delete',
      description: 'Make a DELETE request',
      input: [
        {
          name: 'url',
          type: 'string',
          required: true,
          description: 'The URL to request'
        },
        {
          name: 'options',
          type: 'HttpOptions',
          required: false,
          description: 'Request options'
        }
      ],
      returns: 'HttpResponse<T>',
      example: `const response = await services.http.delete(
  'https://api.example.com/users/123',
  { headers: { 'Authorization': 'Bearer token' } }
);`
    },
    {
      name: 'head',
      description: 'Make a HEAD request to get headers only',
      input: [
        {
          name: 'url',
          type: 'string',
          required: true,
          description: 'The URL to request'
        },
        {
          name: 'options',
          type: 'HttpOptions',
          required: false,
          description: 'Request options'
        }
      ],
      returns: 'HttpResponse<void>',
      example: `const response = await services.http.head(
  'https://api.example.com/files/document.pdf'
);
console.log('File size:', response.headers['content-length']);`
    }
  ]
};

// Factory function for creating HTTP service
export function createHttpService(): HttpService {
  return new HttpServiceImpl();
}