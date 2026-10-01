export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'GAAMOUZE E-Commerce API',
    version: '1.0.0',
    description:
      'API REST versionnée pour la boutique GAAMOUZE (catalogue, commandes, authentification, administration).',
  },
  servers: [{ url: '/api/v1', description: 'Version 1' }],
  tags: [
    { name: 'Health' },
    { name: 'Catalog' },
    { name: 'Orders' },
    { name: 'Auth' },
    { name: 'Admin' },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check (DB + uptime)',
        responses: { 200: { description: 'Service healthy' }, 503: { description: 'Degraded' } },
      },
    },
    '/products': {
      get: {
        tags: ['Catalog'],
        summary: 'List published products',
        parameters: [
          { name: 'locale', in: 'query', schema: { type: 'string', enum: ['fr', 'en', 'ar'] } },
          { name: 'category', in: 'query', schema: { type: 'string' } },
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
        ],
        responses: { 200: { description: 'Paginated product list' } },
      },
    },
    '/products/{slug}': {
      get: {
        tags: ['Catalog'],
        summary: 'Product detail by slug',
        parameters: [
          { name: 'slug', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'locale', in: 'query', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Product' }, 404: { description: 'Not found' } },
      },
    },
    '/categories': {
      get: { tags: ['Catalog'], summary: 'Active categories', responses: { 200: { description: 'OK' } } },
    },
    '/collections': {
      get: { tags: ['Catalog'], summary: 'Active collections', responses: { 200: { description: 'OK' } } },
    },
    '/orders': {
      post: {
        tags: ['Orders'],
        summary: 'Create order (server-side pricing)',
        responses: { 201: { description: 'Created' }, 400: { description: 'Validation error' } },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login (customer or staff)',
        responses: { 200: { description: 'Authenticated' }, 401: { description: 'Invalid credentials' } },
      },
    },
    '/admin/dashboard/stats': {
      get: {
        tags: ['Admin'],
        summary: 'Dashboard KPIs',
        security: [{ cookieAuth: [] }],
        responses: { 200: { description: 'Stats' }, 401: { description: 'Unauthorized' } },
      },
    },
  },
  components: {
    securitySchemes: {
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'gamouze_access_token',
      },
    },
  },
};
