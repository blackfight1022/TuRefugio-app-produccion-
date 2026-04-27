const PORT = process.env.PORT || 3000;

module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'API Tu Refugio',
    version: '1.0.0',
    description: 'Documentacion OpenAPI para endpoints principales de Tu Refugio.'
  },
  servers: [
    {
      url: `http://localhost:${PORT}`,
      description: 'Servidor local'
    }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      }
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          error: { type: 'string' }
        }
      },
      AlojamientoDetalle: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          titulo: { type: 'string' },
          descripcion: { type: 'string', nullable: true },
          ubicacion: { type: 'string', nullable: true },
          precio: { type: 'number', description: 'Campo histórico mantenido por compatibilidad' },
          precio_por_noche: { type: 'number', description: 'Campo recomendado para clientes nuevos' },
          capacidad_personas: { type: 'integer' },
          anfitrion: { type: 'string' }
        }
      }
    }
  },
  paths: {
    '/api': {
      get: {
        tags: ['General'],
        summary: 'Health check de la API',
        responses: {
          '200': {
            description: 'API operativa',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'OK' },
                    mensaje: { type: 'string', example: 'API Tu Refugio funcionando correctamente' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/alojamientos/{id}': {
      get: {
        tags: ['Alojamientos'],
        summary: 'Obtener detalle de alojamiento por ID',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
            description: 'ID del alojamiento'
          }
        ],
        responses: {
          '200': {
            description: 'Detalle del alojamiento',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AlojamientoDetalle' }
              }
            }
          },
          '404': {
            description: 'Alojamiento no encontrado',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' }
              }
            }
          }
        }
      }
    },
    '/api/anfitrion/panel': {
      get: {
        tags: ['Anfitrion'],
        summary: 'Acceso al panel del anfitrión',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Acceso autorizado',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    mensaje: { type: 'string' }
                  }
                }
              }
            }
          },
          '401': {
            description: 'Token ausente',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' }
              }
            }
          },
          '403': {
            description: 'Token invalido o expirado',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' }
              }
            }
          }
        }
      }
    }
  }
};
